const crypto = require('crypto');
const { pool } = require('../config/db');

// Tope del monto inicial de una cuenta: el mismo tope diario de efectivo por persona de la cooperativa
const MONTO_INICIAL_MAXIMO = 100000;

/**
 * Movimiento ya registrado con esa referencia y ese tipo. Hace idempotentes el débito y la acreditación: si la
 * cooperativa reintenta tras un tiempo agotado, se devuelve el movimiento original sin mover el dinero otra vez.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} [referencia]
 * @param {'DEBITO'|'CREDITO'} tipo
 * @returns {Promise<Object|null>}
 */
const movimientoConReferencia = async (client, referencia, tipo) => {
  if (!referencia) return null;
  const res = await client.query(
    `SELECT id_movimiento, id_cuenta_bancaria, monto, saldo_anterior, saldo_posterior, referencia, fecha_movimiento,
            EXISTS (
              SELECT 1 FROM movimientos_bancarios r
              WHERE r.referencia = 'REV-' || m.referencia AND r.tipo_movimiento <> m.tipo_movimiento
            ) AS revertido
     FROM movimientos_bancarios m WHERE m.referencia = $1 AND m.tipo_movimiento = $2`,
    [String(referencia), tipo]
  );
  return res.rows[0] || null;
};

const RESPUESTA_REFERENCIA_USADA = { success: false, error: 'REFERENCIA_USADA', message: 'Esa referencia ya se usó en otra operación.' };
// Si el original ya se revirtió, no se devuelve como hecho: el dinero no está movido. Quien llama usa otra
// referencia para el nuevo intento (aunque cambie la cuenta o el monto).
const RESPUESTA_REFERENCIA_REVERTIDA = {
  success: false,
  error: 'REFERENCIA_REVERTIDA',
  message: 'La operación con esa referencia se revirtió: el nuevo intento necesita otra referencia.',
};

/**
 * Límites de espera de una operación con dinero: si una fila sigue bloqueada o una sentencia se alarga, la
 * operación falla en segundos en lugar de aplicarse minutos después, cuando la cooperativa ya pudo conciliarla.
 *
 * @param {import('pg').PoolClient} client - Dentro de una transacción.
 */
const limitarEspera = (client) => client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'");

/**
 * Responde los errores conocidos de una operación con dinero: referencia repetida (dos operaciones simultáneas con
 * la misma) o un límite de espera agotado.
 *
 * @returns {import('express').Response|null} La respuesta, o null si el error no es uno de ellos.
 */
const responderErrorConocido = (res, error) => {
  if (error.code === '23505') return res.status(409).json(RESPUESTA_REFERENCIA_USADA);
  if (error.code === '55P03' || error.code === '57014') {
    return res.status(503).json({ success: false, message: 'El banco está ocupado. Intente de nuevo en unos segundos.' });
  }
  return null;
};

/**
 * Respuesta a una operación cuya referencia ya existe: 409 `REFERENCIA_REVERTIDA` si el original ya se revirtió;
 * 409 `REFERENCIA_USADA` si se usó en otra cuenta o con otro monto; si no, el original (200 con
 * `idempotente: true`).
 */
const responderReferenciaRepetida = (res, previo, cta, montoNum, tipo) => {
  if (previo.revertido) return res.status(409).json(RESPUESTA_REFERENCIA_REVERTIDA);
  if (Number(previo.id_cuenta_bancaria) !== Number(cta.id_cuenta_bancaria) || Number(previo.monto) !== montoNum) {
    return res.status(409).json(RESPUESTA_REFERENCIA_USADA);
  }
  return res.status(200).json({
    success: true,
    idempotente: true,
    message: tipo === 'DEBITO' ? 'El débito ya se había procesado con esa referencia.' : 'La acreditación ya se había procesado con esa referencia.',
    data: {
      id_movimiento: previo.id_movimiento,
      numero_cuenta: cta.numero_cuenta,
      [tipo === 'DEBITO' ? 'monto_debitado' : 'monto_acreditado']: montoNum,
      saldo_anterior: parseFloat(previo.saldo_anterior),
      saldo_nuevo: parseFloat(previo.saldo_posterior),
      referencia: previo.referencia,
      fecha: previo.fecha_movimiento,
    },
  });
};

/**
 * 1. Consulta el saldo y titular de una cuenta bancaria
 */
const consultarCuenta = async (req, res) => {
  const client = await pool.connect();
  try {
    const num = req.params.numero_cuenta || req.query.numero_cuenta;
    if (!num) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar el número de cuenta bancaria.',
      });
    }

    const query = `
      SELECT 
        cb.id_cuenta_bancaria, cb.numero_cuenta, cb.tipo_cuenta, cb.saldo_disponible, cb.estado,
        c.cui_dpi AS titular_cui, c.nombre_completo AS titular_nombre, 'Banco de la Corporación' AS banco_nombre
      FROM cuentas_bancarias cb
      JOIN clientes_banco c ON cb.id_cliente = c.id_cliente
      WHERE LOWER(TRIM(cb.numero_cuenta)) = LOWER(TRIM($1))
    `;
    const result = await client.query(query, [num]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la cuenta ${num} en la Entidad Bancaria.`,
      });
    }

    const cta = result.rows[0];
    if (cta.estado !== 'ACTIVA') {
      return res.status(403).json({
        success: false,
        message: `La cuenta bancaria se encuentra en estado ${cta.estado}.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id_cuenta_bancaria: cta.id_cuenta_bancaria,
        banco_nombre: cta.banco_nombre,
        numero_cuenta_bancaria: cta.numero_cuenta,
        tipo_cuenta: cta.tipo_cuenta,
        titular_cui: cta.titular_cui,
        titular_nombre: cta.titular_nombre,
        saldo_disponible: parseFloat(cta.saldo_disponible),
        estado: cta.estado,
      },
    });
  } catch (error) {
    console.error('[BANCO CUENTAS CONSULTAR ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar cuenta bancaria.',
    });
  } finally {
    client.release();
  }
};

/**
 * 2. Débito atómico en cuenta bancaria (ej. aportación inicial para afiliarse a cooperativa o traslados)
 */
const debitar = async (req, res) => {
  const client = await pool.connect();
  try {
    // La cuenta se identifica solo por su número (nunca por su id interno)
    const { numero_cuenta, cui_dpi, monto, concepto, referencia } = req.body;

    if (!numero_cuenta || !monto) {
      return res.status(400).json({
        success: false,
        message: 'Número de cuenta y monto a debitar son obligatorios.',
      });
    }

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto a debitar debe ser mayor a cero.',
      });
    }

    await client.query('BEGIN');
    await limitarEspera(client);

    // Bloquear fila para actualización concurrente
    const numStr = String(numero_cuenta).trim();

    const ctaRes = await client.query(
      `SELECT cb.id_cuenta_bancaria, cb.numero_cuenta, cb.saldo_disponible, cb.estado, c.cui_dpi
       FROM cuentas_bancarias cb
       JOIN clientes_banco c ON c.id_cliente = cb.id_cliente
       WHERE LOWER(TRIM(cb.numero_cuenta)) = LOWER(TRIM($1))
       FOR UPDATE OF cb`,
      [numStr]
    );

    if (ctaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `No se encontró la cuenta bancaria ${numero_cuenta}.`,
      });
    }

    const cta = ctaRes.rows[0];

    // Si quien llama indica el DPI del titular, la cuenta tiene que ser suya.
    if (cui_dpi && String(cui_dpi).trim() !== cta.cui_dpi) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'La cuenta bancaria no pertenece al DPI indicado.',
      });
    }
    const debitoPrevio = await movimientoConReferencia(client, referencia, 'DEBITO');
    if (debitoPrevio) {
      await client.query('ROLLBACK');
      return responderReferenciaRepetida(res, debitoPrevio, cta, montoNum, 'DEBITO');
    }
    if (cta.estado !== 'ACTIVA') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `La cuenta bancaria se encuentra en estado ${cta.estado}.`,
      });
    }

    const saldoAnterior = parseFloat(cta.saldo_disponible);
    if (saldoAnterior < montoNum) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Fondos insuficientes en la cuenta bancaria. Saldo disponible: Q${saldoAnterior.toFixed(2)}, Monto solicitado: Q${montoNum.toFixed(2)}.`,
      });
    }

    const saldoPosterior = saldoAnterior - montoNum;

    // Actualizar saldo
    await client.query(
      'UPDATE cuentas_bancarias SET saldo_disponible = $1 WHERE id_cuenta_bancaria = $2',
      [saldoPosterior, cta.id_cuenta_bancaria]
    );

    // Registrar movimiento contable
    const refFinal = referencia || `DEB-ACH-${Date.now()}-${crypto.randomInt(1000, 10000)}`;
    const concFinal = concepto || 'Débito por transferencia interinstitucional a Cooperativa';

    const movRes = await client.query(
      `INSERT INTO movimientos_bancarios (id_cuenta_bancaria, tipo_movimiento, monto, saldo_anterior, saldo_posterior, concepto, referencia)
       VALUES ($1, 'DEBITO', $2, $3, $4, $5, $6)
       RETURNING id_movimiento, fecha_movimiento`,
      [cta.id_cuenta_bancaria, montoNum, saldoAnterior, saldoPosterior, concFinal, refFinal]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Débito bancario procesado exitosamente.',
      data: {
        id_movimiento: movRes.rows[0].id_movimiento,
        numero_cuenta: cta.numero_cuenta,
        monto_debitado: montoNum,
        saldo_anterior: saldoAnterior,
        saldo_nuevo: saldoPosterior,
        referencia: refFinal,
        fecha: movRes.rows[0].fecha_movimiento,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const conocido = responderErrorConocido(res, error);
    if (conocido) return conocido;
    console.error('[BANCO DEBITO ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar débito en la Entidad Bancaria.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 3. Acreditación atómica en cuenta bancaria (ej. desembolso de préstamo concedido por la Cooperativa)
 */
const acreditar = async (req, res) => {
  const client = await pool.connect();
  try {
    // La cuenta se identifica solo por su número (nunca por su id interno)
    const { numero_cuenta, monto, concepto, referencia } = req.body;

    if (!numero_cuenta || !monto) {
      return res.status(400).json({
        success: false,
        message: 'Número de cuenta y monto a acreditar son obligatorios.',
      });
    }

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto a acreditar debe ser mayor a cero.',
      });
    }

    await client.query('BEGIN');
    await limitarEspera(client);

    const numStr = String(numero_cuenta).trim();

    const ctaRes = await client.query(
      `SELECT id_cuenta_bancaria, numero_cuenta, saldo_disponible, estado
       FROM cuentas_bancarias
       WHERE LOWER(TRIM(numero_cuenta)) = LOWER(TRIM($1))
       FOR UPDATE`,
      [numStr]
    );

    if (ctaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `No se encontró la cuenta bancaria ${numero_cuenta}.`,
      });
    }

    const cta = ctaRes.rows[0];
    const creditoPrevio = await movimientoConReferencia(client, referencia, 'CREDITO');
    if (creditoPrevio) {
      await client.query('ROLLBACK');
      return responderReferenciaRepetida(res, creditoPrevio, cta, montoNum, 'CREDITO');
    }
    if (cta.estado !== 'ACTIVA') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `La cuenta bancaria se encuentra en estado ${cta.estado}.`,
      });
    }

    const saldoAnterior = parseFloat(cta.saldo_disponible);
    const saldoPosterior = saldoAnterior + montoNum;

    await client.query(
      'UPDATE cuentas_bancarias SET saldo_disponible = $1 WHERE id_cuenta_bancaria = $2',
      [saldoPosterior, cta.id_cuenta_bancaria]
    );

    const refFinal = referencia || `CRED-ACH-${Date.now()}-${crypto.randomInt(1000, 10000)}`;
    const concFinal = concepto || 'Acreditación por desembolso de crédito de Cooperativa';

    const movRes = await client.query(
      `INSERT INTO movimientos_bancarios (id_cuenta_bancaria, tipo_movimiento, monto, saldo_anterior, saldo_posterior, concepto, referencia)
       VALUES ($1, 'CREDITO', $2, $3, $4, $5, $6)
       RETURNING id_movimiento, fecha_movimiento`,
      [cta.id_cuenta_bancaria, montoNum, saldoAnterior, saldoPosterior, concFinal, refFinal]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Acreditación bancaria procesada exitosamente.',
      data: {
        id_movimiento: movRes.rows[0].id_movimiento,
        numero_cuenta: cta.numero_cuenta,
        monto_acreditado: montoNum,
        saldo_anterior: saldoAnterior,
        saldo_nuevo: saldoPosterior,
        referencia: refFinal,
        fecha: movRes.rows[0].fecha_movimiento,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const conocido = responderErrorConocido(res, error);
    if (conocido) return conocido;
    console.error('[BANCO ACREDITACION ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar acreditación en la Entidad Bancaria.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 4. Obtiene cuentas demo disponibles para pruebas de interfaz
 */
const getCuentasDemo = async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        cb.id_cuenta_bancaria as id_banco_cuenta, 'Banco de la Corporación' as banco_nombre,
        cb.numero_cuenta as numero_cuenta_bancaria, cb.tipo_cuenta,
        c.nombre_completo as titular_nombre, c.cui_dpi as titular_cui,
        cb.saldo_disponible
      FROM cuentas_bancarias cb
      JOIN clientes_banco c ON cb.id_cliente = c.id_cliente
      WHERE cb.estado = 'ACTIVA' AND cb.saldo_disponible > 0
      ORDER BY cb.id_cuenta_bancaria ASC
      LIMIT 10
    `;
    const result = await client.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows.map((r) => ({
        ...r,
        saldo_disponible: parseFloat(r.saldo_disponible),
      })),
    });
  } catch (error) {
    console.error('[BANCO DEMO ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar cuentas demo en la Entidad Bancaria.',
    });
  } finally {
    client.release();
  }
};

/**
 * Respuesta a una apertura cuya referencia ya existe: la cuenta que se abrió (200 con `idempotente: true`) si es
 * del mismo DPI y con el mismo depósito y no se revirtió; si no, 409 como en `responderReferenciaRepetida`.
 *
 * @param {import('pg').PoolClient} client
 * @param {import('express').Response} res
 * @param {Object} previo - Resultado de `movimientoConReferencia`.
 * @param {string} cui - DPI de la apertura nueva.
 * @param {number} montoNum - Depósito inicial de la apertura nueva.
 */
const responderAperturaRepetida = async (client, res, previo, cui, montoNum) => {
  if (previo.revertido) return res.status(409).json(RESPUESTA_REFERENCIA_REVERTIDA);
  const cta = (await client.query(
    `SELECT cb.id_cuenta_bancaria, cb.numero_cuenta, cb.tipo_cuenta, cb.saldo_disponible, cb.estado,
            c.cui_dpi, c.nombre_completo
     FROM cuentas_bancarias cb JOIN clientes_banco c ON c.id_cliente = cb.id_cliente
     WHERE cb.id_cuenta_bancaria = $1`,
    [previo.id_cuenta_bancaria]
  )).rows[0];
  if (!cta || cta.cui_dpi !== cui || Number(previo.monto) !== montoNum) {
    return res.status(409).json(RESPUESTA_REFERENCIA_USADA);
  }
  return res.status(200).json({
    success: true,
    idempotente: true,
    message: 'La cuenta ya se había abierto con esa referencia.',
    data: {
      id_cuenta_bancaria: cta.id_cuenta_bancaria,
      numero_cuenta: cta.numero_cuenta,
      tipo_cuenta: cta.tipo_cuenta,
      saldo_disponible: parseFloat(cta.saldo_disponible),
      estado: cta.estado,
      titular_nombre: cta.nombre_completo,
      titular_cui: cta.cui_dpi,
      banco_nombre: 'Banco de la Corporación',
    },
  });
};

/**
 * 5. Apertura de cuenta bancaria (para nuevos asociados formalizados o clientes bancarios)
 * POST /api/banco/v1/cuentas/aperturar
 *
 * Con depósito inicial y `referencia`, es idempotente: repetirla devuelve la cuenta que ya se abrió (200 con
 * `idempotente: true`) en lugar de abrir otra. 201 con la cuenta nueva; 400; 403 si el cliente no está ACTIVO;
 * 409 `REFERENCIA_USADA` o `REFERENCIA_REVERTIDA`; 503 si el banco está ocupado.
 */
const aperturarCuenta = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      cui_dpi,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      telefono,
      direccion,
      email,
      fecha_nacimiento,
      monto_inicial = 0,
      tipo_cuenta = 'AHORRO',
      referencia = '',
    } = req.body;

    if (!cui_dpi || !primer_nombre || !primer_apellido) {
      return res.status(400).json({
        success: false,
        message: 'CUI/DPI, primer nombre y primer apellido son obligatorios para aperturar cuenta bancaria.',
      });
    }

    const cleanCui = String(cui_dpi).trim().replace(/\s+/g, '');
    // Monto inicial: número con hasta 2 decimales, sin pasar el tope (parseFloat dejaba pasar textos y NaN)
    const montoTexto = String(monto_inicial ?? 0).trim();
    const montoNum = Number(montoTexto);
    if (!/^\d+(\.\d{1,2})?$/.test(montoTexto) || montoNum > MONTO_INICIAL_MAXIMO) {
      return res.status(400).json({
        success: false,
        message: `El monto inicial debe ser un número de 0 a Q${MONTO_INICIAL_MAXIMO.toLocaleString('es-GT', { minimumFractionDigits: 2 })}, con hasta 2 decimales.`,
      });
    }

    await client.query('BEGIN');
    await limitarEspera(client);

    // 0. Una apertura con una referencia que ya existe es un reintento (por ejemplo, tras un tiempo agotado): se
    //    devuelve la cuenta que se abrió, sin abrir otra con el mismo depósito
    const aperturaPrevia = referencia && montoNum > 0 ? await movimientoConReferencia(client, referencia, 'CREDITO') : null;
    if (aperturaPrevia) {
      await client.query('ROLLBACK');
      return responderAperturaRepetida(client, res, aperturaPrevia, cleanCui, montoNum);
    }

    // 1. Cliente: se crea si no existe; si ya existe conserva sus datos (el banco es la fuente de su identidad) y
    //    solo se completan los de contacto que le falten. En una sola sentencia: dos aperturas simultáneas para un
    //    DPI nuevo no chocan.
    const texto = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
    const clienteRes = await client.query(
      `INSERT INTO clientes_banco (
         cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
         telefono, direccion, email, fecha_nacimiento, tipo_cliente, estado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CLIENTE_EXTERNO', 'ACTIVO')
       ON CONFLICT (cui_dpi) DO UPDATE SET
         telefono = COALESCE(NULLIF(clientes_banco.telefono, ''), EXCLUDED.telefono),
         direccion = COALESCE(NULLIF(clientes_banco.direccion, ''), EXCLUDED.direccion),
         email = COALESCE(NULLIF(clientes_banco.email, ''), EXCLUDED.email),
         fecha_nacimiento = COALESCE(clientes_banco.fecha_nacimiento, EXCLUDED.fecha_nacimiento)
       RETURNING id_cliente, estado`,
      [
        cleanCui,
        primer_nombre.trim(),
        texto(segundo_nombre),
        primer_apellido.trim(),
        texto(segundo_apellido),
        texto(telefono),
        texto(direccion),
        texto(email),
        fecha_nacimiento || null,
      ]
    );
    const idCliente = clienteRes.rows[0].id_cliente;
    // A un cliente bloqueado o inactivo no se le abren cuentas
    if (clienteRes.rows[0].estado !== 'ACTIVO') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: `El cliente está ${clienteRes.rows[0].estado} en el banco: no se le pueden abrir cuentas.`,
      });
    }

    // 2. Generar número de cuenta bancaria único
    let numeroCuenta = '';
    let existeCuenta = true;
    const prefix = tipo_cuenta.toUpperCase() === 'MONETARIA' ? 'CTA-BCO-MONET-' : 'CTA-BCO-AHORRO-';
    while (existeCuenta) {
      numeroCuenta = `${prefix}${String(Math.floor(100000 + Math.random() * 900000))}`;
      const checkNum = await client.query(
        'SELECT id_cuenta_bancaria FROM cuentas_bancarias WHERE numero_cuenta = $1',
        [numeroCuenta]
      );
      if (checkNum.rows.length === 0) {
        existeCuenta = false;
      }
    }

    // 3. Insertar cuenta bancaria
    const insCta = await client.query(
      `INSERT INTO cuentas_bancarias (
         id_cliente, numero_cuenta, tipo_cuenta, saldo_disponible, saldo_reserva, estado
       ) VALUES ($1, $2, $3, $4, 0.00, 'ACTIVA')
       RETURNING id_cuenta_bancaria, numero_cuenta, tipo_cuenta, saldo_disponible, estado, fecha_apertura`,
      [idCliente, numeroCuenta, tipo_cuenta.toUpperCase(), montoNum]
    );
    const cta = insCta.rows[0];

    // 4. Si hay monto inicial > 0, registrar movimiento bancario inicial
    if (montoNum > 0) {
      await client.query(
        `INSERT INTO movimientos_bancarios (
           id_cuenta_bancaria, tipo_movimiento, monto, saldo_anterior, saldo_posterior, concepto, referencia
         ) VALUES ($1, 'CREDITO', $2, 0.00, $2, $3, $4)`,
        [
          cta.id_cuenta_bancaria,
          montoNum,
          'Apertura de Cuenta Bancaria - Depósito Inicial',
          // La referencia es única por cuenta: la misma persona puede abrir varias
          referencia || `APERTURA-${numeroCuenta}`,
        ]
      );
    }

    await client.query('COMMIT');

    // Consultar nombre completo del cliente
    const cliRow = await client.query('SELECT nombre_completo, cui_dpi FROM clientes_banco WHERE id_cliente = $1', [idCliente]);

    return res.status(201).json({
      success: true,
      message: 'Cuenta bancaria aperturada exitosamente.',
      data: {
        id_cuenta_bancaria: cta.id_cuenta_bancaria,
        numero_cuenta: cta.numero_cuenta,
        tipo_cuenta: cta.tipo_cuenta,
        saldo_disponible: parseFloat(cta.saldo_disponible),
        estado: cta.estado,
        titular_nombre: cliRow.rows[0]?.nombre_completo,
        titular_cui: cliRow.rows[0]?.cui_dpi,
        banco_nombre: 'Banco de la Corporación',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const conocido = responderErrorConocido(res, error);
    if (conocido) return conocido;
    console.error('[BANCO APERTURA ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al aperturar la cuenta en la Entidad Bancaria.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * Consulta un movimiento por su referencia y tipo, para conciliar operaciones que la cooperativa no pudo confirmar
 * (un tiempo agotado) o reversiones pendientes.
 * GET /api/banco/v1/movimientos/:referencia?tipo=DEBITO|CREDITO
 *
 * @returns 200 con el movimiento, su cuenta, el DPI del titular y si ya se revirtió (`REV-<referencia>`); 400 si el
 *   tipo no es válido; 404 si no existe.
 */
const consultarMovimiento = async (req, res) => {
  try {
    const referencia = String(req.params.referencia || '').trim();
    const tipo = String(req.query.tipo || '').toUpperCase();
    if (!referencia || !['DEBITO', 'CREDITO'].includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Indique la referencia y el tipo (DEBITO o CREDITO).' });
    }
    const result = await pool.query(
      `SELECT m.id_movimiento, m.tipo_movimiento, m.monto, m.referencia, m.fecha_movimiento, cb.numero_cuenta,
              c.cui_dpi AS titular_cui,
              EXISTS (
                SELECT 1 FROM movimientos_bancarios r
                WHERE r.referencia = 'REV-' || m.referencia AND r.tipo_movimiento <> m.tipo_movimiento
              ) AS revertido
       FROM movimientos_bancarios m
       JOIN cuentas_bancarias cb ON cb.id_cuenta_bancaria = m.id_cuenta_bancaria
       JOIN clientes_banco c ON c.id_cliente = cb.id_cliente
       WHERE m.referencia = $1 AND m.tipo_movimiento = $2`,
      [referencia, tipo]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay un movimiento con esa referencia.' });
    }
    const m = result.rows[0];
    return res.status(200).json({ success: true, data: { ...m, monto: parseFloat(m.monto) } });
  } catch (error) {
    console.error('[BANCO MOVIMIENTO ERROR]', error);
    return res.status(500).json({ success: false, message: 'Error al consultar el movimiento en la Entidad Bancaria.' });
  }
};

module.exports = {
  consultarCuenta,
  debitar,
  acreditar,
  getCuentasDemo,
  aperturarCuenta,
  consultarMovimiento,
};
