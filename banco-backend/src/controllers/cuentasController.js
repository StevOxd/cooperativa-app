const { pool } = require('../config/db');

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
    const { numero_cuenta, id_cuenta_bancaria, monto, concepto, referencia } = req.body;

    if ((!numero_cuenta && !id_cuenta_bancaria) || !monto) {
      return res.status(400).json({
        success: false,
        message: 'Número de cuenta (o ID de cuenta) y monto a debitar son obligatorios.',
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

    // Bloquear fila para actualización concurrente
    const numStr = numero_cuenta ? String(numero_cuenta).trim() : '';
    const idCta = id_cuenta_bancaria
      ? parseInt(id_cuenta_bancaria, 10)
      : (!isNaN(parseInt(numStr, 10)) && !numStr.startsWith('CTA-') ? parseInt(numStr, 10) : -1);

    const ctaRes = await client.query(
      `SELECT id_cuenta_bancaria, numero_cuenta, saldo_disponible, estado
       FROM cuentas_bancarias
       WHERE (LOWER(TRIM(numero_cuenta)) = LOWER(TRIM($1)) OR id_cuenta_bancaria = $2)
       FOR UPDATE`,
      [numStr, idCta]
    );

    if (ctaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `No se encontró la cuenta bancaria ${numero_cuenta}.`,
      });
    }

    const cta = ctaRes.rows[0];
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
    const refFinal = referencia || `DEB-ACH-${Date.now()}`;
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
    await client.query('ROLLBACK');
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
    const { numero_cuenta, id_cuenta_bancaria, monto, concepto, referencia } = req.body;

    if ((!numero_cuenta && !id_cuenta_bancaria) || !monto) {
      return res.status(400).json({
        success: false,
        message: 'Número de cuenta (o ID de cuenta) y monto a acreditar son obligatorios.',
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

    const numStr = numero_cuenta ? String(numero_cuenta).trim() : '';
    const idCta = id_cuenta_bancaria
      ? parseInt(id_cuenta_bancaria, 10)
      : (!isNaN(parseInt(numStr, 10)) && !numStr.startsWith('CTA-') ? parseInt(numStr, 10) : -1);

    const ctaRes = await client.query(
      `SELECT id_cuenta_bancaria, numero_cuenta, saldo_disponible, estado
       FROM cuentas_bancarias
       WHERE (LOWER(TRIM(numero_cuenta)) = LOWER(TRIM($1)) OR id_cuenta_bancaria = $2)
       FOR UPDATE`,
      [numStr, idCta]
    );

    if (ctaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `No se encontró la cuenta bancaria ${numero_cuenta}.`,
      });
    }

    const cta = ctaRes.rows[0];
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

    const refFinal = referencia || `CRED-ACH-${Date.now()}`;
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
    await client.query('ROLLBACK');
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
 * 5. Apertura de cuenta bancaria (para nuevos asociados formalizados o clientes bancarios)
 * POST /api/banco/v1/cuentas/aperturar
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
    const montoNum = parseFloat(monto_inicial);
    if (isNaN(montoNum) || montoNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto inicial debe ser un número válido mayor o igual a cero.',
      });
    }

    await client.query('BEGIN');

    // 1. Upsert en clientes_banco
    let idCliente;
    const clientCheck = await client.query(
      'SELECT id_cliente FROM clientes_banco WHERE cui_dpi = $1',
      [cleanCui]
    );

    if (clientCheck.rows.length > 0) {
      idCliente = clientCheck.rows[0].id_cliente;
      await client.query(
        `UPDATE clientes_banco 
         SET primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
             telefono = COALESCE($5, telefono), direccion = COALESCE($6, direccion),
             email = COALESCE($7, email), fecha_nacimiento = COALESCE($8, fecha_nacimiento)
         WHERE id_cliente = $9`,
        [
          primer_nombre.trim(),
          segundo_nombre ? segundo_nombre.trim() : null,
          primer_apellido.trim(),
          segundo_apellido ? segundo_apellido.trim() : null,
          telefono ? telefono.trim() : null,
          direccion ? direccion.trim() : null,
          email ? email.trim() : null,
          fecha_nacimiento || null,
          idCliente,
        ]
      );
    } else {
      const insClient = await client.query(
        `INSERT INTO clientes_banco (
           cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
           telefono, direccion, email, fecha_nacimiento, tipo_cliente, estado
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CLIENTE_EXTERNO', 'ACTIVO')
         RETURNING id_cliente`,
        [
          cleanCui,
          primer_nombre.trim(),
          segundo_nombre ? segundo_nombre.trim() : null,
          primer_apellido.trim(),
          segundo_apellido ? segundo_apellido.trim() : null,
          telefono ? telefono.trim() : null,
          direccion ? direccion.trim() : null,
          email ? email.trim() : null,
          fecha_nacimiento || null,
        ]
      );
      idCliente = insClient.rows[0].id_cliente;
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
          referencia || `APERTURA-${cleanCui}`,
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
    await client.query('ROLLBACK');
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

module.exports = {
  consultarCuenta,
  debitar,
  acreditar,
  getCuentasDemo,
  aperturarCuenta,
};
