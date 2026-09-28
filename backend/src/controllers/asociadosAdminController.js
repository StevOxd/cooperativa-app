const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const mfaService = require('../services/mfaService');
const mailerService = require('../services/mailerService');
const bancoApiService = require('../services/bancoApiService');
const asociadoAfiliacionService = require('../services/asociadoAfiliacionService');
const { getNextCorporateCode, resolvePrefix } = require('../utils/codeGenerator');

/**
 * Consulta el padrón institucional de asociados con soporte para paginación, filtros de estado y métricas consolidadas.
 *
 * @async
 * @function listarAsociados
 * @param {import('express').Request} req - Objeto de solicitud HTTP de Express.
 * @param {string} [req.query.search] - Criterio opcional de búsqueda por CUI, nombre, email o código corporativo.
 * @param {('ACTIVO'|'INACTIVO'|'SUSPENDIDO')} [req.query.estado] - Filtro opcional por estado del asociado.
 * @param {number} [req.query.page=1] - Número de página para paginación.
 * @param {number} [req.query.limit=10] - Cantidad máxima de registros por página.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 con listado consolidado y metadatos de paginación.
 * @throws {Error} Retorna 500 ante anomalías en el pool de conexiones o consultas SQL.
 */
const listarAsociados = async (req, res) => {
  try {
    const { search = '', estado = '', page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClauses = [];
    let queryParams = [];

    if (search.trim() !== '') {
      queryParams.push(`%${search.trim()}%`);
      whereClauses.push(
        `(p.nombre_completo ILIKE $${queryParams.length} 
          OR p.cui_dpi ILIKE $${queryParams.length} 
          OR u.codigo_corporativo ILIKE $${queryParams.length} 
          OR u.email ILIKE $${queryParams.length})`
      );
    }

    if (estado.trim() !== '') {
      queryParams.push(estado.trim().toUpperCase());
      whereClauses.push(`a.estado_asociado = $${queryParams.length}`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Contar total de registros
    const countQuery = `
      SELECT COUNT(a.id_asociado) AS total
      FROM asociados a
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN usuarios u ON a.id_persona = u.id_persona
      ${whereSQL}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total, 10);

    // Consulta de registros con saldo total consolidado
    queryParams.push(parseInt(limit, 10));
    const limitIdx = queryParams.length;
    queryParams.push(offset);
    const offsetIdx = queryParams.length;

    const query = `
      SELECT 
        a.id_asociado,
        a.id_persona,
        a.fecha_ingreso,
        a.estado_asociado,
        p.cui_dpi,
        p.nombre_completo,
        p.primer_nombre,
        p.primer_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.codigo_corporativo,
        u.email,
        u.estado AS estado_usuario,
        COUNT(c.id_cuenta) AS total_cuentas,
        COALESCE(SUM(c.saldo_disponible), 0.00) AS saldo_total_disponible,
        COALESCE(SUM(CASE WHEN tc.id_tipo_cuenta = 1 THEN c.saldo_disponible ELSE 0 END), 0.00) AS saldo_aportaciones
      FROM asociados a
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN usuarios u ON a.id_persona = u.id_persona
      LEFT JOIN cuentas c ON a.id_asociado = c.id_asociado AND c.estado = 'ACTIVA'
      LEFT JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      ${whereSQL}
      GROUP BY a.id_asociado, a.id_persona, a.fecha_ingreso, a.estado_asociado,
               p.cui_dpi, p.nombre_completo, p.primer_nombre, p.primer_apellido,
               p.telefono, p.direccion, p.fecha_nacimiento,
               u.codigo_corporativo, u.email, u.estado
      ORDER BY a.id_asociado DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await pool.query(query, queryParams);

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        total_cuentas: parseInt(row.total_cuentas, 10),
        saldo_total_disponible: parseFloat(row.saldo_total_disponible),
        saldo_aportaciones: parseFloat(row.saldo_aportaciones),
      })),
      pagination: {
        total: totalRecords,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalRecords / parseInt(limit, 10)) || 1,
      },
    });
  } catch (error) {
    console.error('Error en asociadosAdminController.listarAsociados:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al listar los asociados de la cooperativa.',
    });
  }
};

/**
 * Consulta el expediente integral 360° del asociado con sus cuentas y beneficiarios
 */
const getExpedienteAsociado = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Obtener datos del asociado y persona
    const asociadoQuery = `
      SELECT 
        a.id_asociado,
        a.id_persona,
        a.fecha_ingreso,
        a.estado_asociado,
        p.cui_dpi,
        p.nombre_completo,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.codigo_corporativo,
        u.email,
        u.estado AS estado_usuario
      FROM asociados a
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN usuarios u ON a.id_persona = u.id_persona
      WHERE a.id_asociado = $1
      LIMIT 1
    `;
    const asociadoResult = await pool.query(asociadoQuery, [id]);

    if (asociadoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Asociado no encontrado.',
      });
    }

    const asociado = asociadoResult.rows[0];

    // 2. Obtener las cuentas del asociado con sus beneficiarios agrupados
    const cuentasQuery = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        c.saldo_reserva,
        c.estado,
        c.fecha_apertura,
        tc.id_tipo_cuenta,
        tc.nombre AS tipo_cuenta_nombre,
        tc.tasa_interes_anual,
        tc.descripcion AS tipo_descripcion
      FROM cuentas c
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE c.id_asociado = $1
      ORDER BY tc.id_tipo_cuenta ASC, c.id_cuenta ASC
    `;
    const cuentasResult = await pool.query(cuentasQuery, [id]);

    // 3. Obtener beneficiarios de las cuentas
    const cuentaIds = cuentasResult.rows.map((c) => c.id_cuenta);
    let beneficiariosMap = {};

    if (cuentaIds.length > 0) {
      const benQuery = `
        SELECT id_beneficiario, id_cuenta, nombre_completo, parentesco, cui_dpi, telefono, porcentaje
        FROM beneficiarios
        WHERE id_cuenta = ANY($1::int[])
        ORDER BY porcentaje DESC
      `;
      const benResult = await pool.query(benQuery, [cuentaIds]);
      benResult.rows.forEach((b) => {
        if (!beneficiariosMap[b.id_cuenta]) {
          beneficiariosMap[b.id_cuenta] = [];
        }
        beneficiariosMap[b.id_cuenta].push({
          ...b,
          porcentaje: parseFloat(b.porcentaje),
        });
      });
    }

    const cuentasFormateadas = cuentasResult.rows.map((c) => ({
      ...c,
      saldo_disponible: parseFloat(c.saldo_disponible),
      saldo_reserva: parseFloat(c.saldo_reserva),
      tasa_interes_anual: parseFloat(c.tasa_interes_anual),
      beneficiarios: beneficiariosMap[c.id_cuenta] || [],
    }));

    // Métricas del expediente
    const saldoTotal = cuentasFormateadas.reduce((acc, c) => acc + c.saldo_disponible, 0);
    const saldoAportaciones = 0;

    return res.status(200).json({
      success: true,
      data: {
        asociado,
        cuentas: cuentasFormateadas,
        metricas: {
          total_cuentas: cuentasFormateadas.length,
          saldo_total_disponible: saldoTotal,
          saldo_aportaciones: saldoAportaciones,
        },
      },
    });
  } catch (error) {
    console.error('Error en asociadosAdminController.getExpedienteAsociado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el expediente del asociado.',
    });
  }
};

/**
 * Procesa la afiliación presencial en ventanilla de agencia.
 * Delegado al servicio de dominio especializado asociadoAfiliacionService.
 *
 * @async
 * @function crearAfiliacionPresencial
 * @param {import('express').Request} req - Solicitud HTTP con payload del asociado y método de fondeo.
 * @param {import('express').Response} res - Respuesta HTTP con confirmación y credenciales.
 * @returns {Promise<import('express').Response>} Retorna 201 Created al registrar, 400 por datos inválidos o 409 por duplicado.
 */
const crearAfiliacionPresencial = async (req, res) => {
  try {
    const data = await asociadoAfiliacionService.registrarAfiliacionPresencial({
      payload: req.body,
      operadorId: req.user?.id_persona,
    });

    return res.status(201).json({
      success: true,
      message: 'Afiliación registrada exitosamente con apertura de Cuenta de Ahorro.',
      data: {
        id_asociado: data.id_asociado,
        id_persona: data.id_persona,
        nombre_completo: data.nombre_completo,
        codigo_corporativo: data.usuario,
        cuenta_ahorro: data.numero_cuenta,
        saldo_inicial: data.saldo_inicial,
        metodo_pago: 'EFECTIVO_VENTANILLA',
        cuenta_bancaria_creada: data.cuenta_bancaria_creada,
        numero_cuenta_bancaria_asociada: data.numero_cuenta_bancaria_asociada,
        tipo_asociado: data.tipo_asociado,
        mfa: {
          enabled: false,
        },
      },
    });
  } catch (error) {
    console.error('[ERROR] Fallo en asociadosAdminController.crearAfiliacionPresencial:', error.message);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Error al procesar la afiliación presencial.',
    });
  }
};

/**
 * FORMULARIO 2: Apertura de Cuentas Financieras Adicionales
 */
const aperturarCuenta = async (req, res) => {
  const client = await pool.connect();

  try {
    const idAsociado = req.params.id || req.body.id_asociado;
    const {
      id_tipo_cuenta,
      monto_apertura,
      origen_fondos, // 'EFECTIVO_VENTANILLA', 'CUENTA_INTERNA', 'BANCO_EXTERNO'
      id_cuenta_origen,
      banco_nombre,
      numero_cuenta_bancaria,
    } = req.body;

    if (!idAsociado) {
      return res.status(400).json({
        success: false,
        message: 'Debe especificar el ID del asociado para aperturar la cuenta.',
      });
    }

    if (!id_tipo_cuenta) {
      return res.status(400).json({
        success: false,
        message: 'Debe seleccionar el tipo de producto o cuenta financiera.',
      });
    }

    // 1. Validar asociado
    const asociadoRes = await client.query('SELECT id_asociado, estado_asociado FROM asociados WHERE id_asociado = $1', [idAsociado]);
    if (asociadoRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }
    if (asociadoRes.rows[0].estado_asociado !== 'ACTIVO') {
      return res.status(403).json({ success: false, message: 'El asociado se encuentra inactivo o suspendido.' });
    }

    // 2. Validar tipo de cuenta y monto mínimo
    const tipoRes = await client.query('SELECT * FROM tipos_cuenta WHERE id_tipo_cuenta = $1', [id_tipo_cuenta]);
    if (tipoRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tipo de cuenta no válido.' });
    }
    const tipoCuenta = tipoRes.rows[0];
    const montoMinimo = parseFloat(tipoCuenta.monto_minimo_apertura);
    const montoInicial = parseFloat(monto_apertura || 0);

    if (montoInicial < montoMinimo) {
      return res.status(400).json({
        success: false,
        message: `El monto ingresado (Q${montoInicial.toFixed(2)}) es menor al monto mínimo de apertura para ${tipoCuenta.nombre} (Q${montoMinimo.toFixed(2)}).`,
      });
    }

    await client.query('BEGIN');

    // 3. Procesar débito según origen de fondos
    let refOrigen = 'Efectivo en Ventanilla';

    if (origen_fondos === 'CUENTA_INTERNA' && montoInicial > 0) {
      if (!id_cuenta_origen) {
        return res.status(400).json({ success: false, message: 'Debe seleccionar la cuenta interna de origen.' });
      }

      const ctaOrigenRes = await client.query(
        'SELECT id_cuenta, numero_cuenta, saldo_disponible FROM cuentas WHERE id_cuenta = $1 AND id_asociado = $2 FOR UPDATE',
        [id_cuenta_origen, idAsociado]
      );
      if (ctaOrigenRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Cuenta interna de origen no encontrada.' });
      }

      const ctaOrigen = ctaOrigenRes.rows[0];
      if (parseFloat(ctaOrigen.saldo_disponible) < montoInicial) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Saldo disponible insuficiente en cuenta ${ctaOrigen.numero_cuenta}.`,
        });
      }

      // Debitar cuenta origen
      await client.query(
        'UPDATE cuentas SET saldo_disponible = saldo_disponible - $1 WHERE id_cuenta = $2',
        [montoInicial, ctaOrigen.id_cuenta]
      );

      // Transacción de retiro en cuenta origen
      await client.query(
        `INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
         VALUES ($1, 'RETIRO', $2, $3, $3 - $2, $4, $5)`,
        [
          ctaOrigen.id_cuenta,
          montoInicial,
          parseFloat(ctaOrigen.saldo_disponible),
          `Débito por Apertura de Cuenta ${tipoCuenta.nombre}`,
          req.user?.id_persona || null,
        ]
      );

      refOrigen = `Traslado Interno Cta: ${ctaOrigen.numero_cuenta}`;
    } else if (origen_fondos === 'BANCO_EXTERNO' && montoInicial > 0) {
      // Consultar cuenta en Core Banking API (banco_db)
      let bcoRes;
      try {
        bcoRes = await bancoApiService.consultarCuenta(numero_cuenta_bancaria);
      } catch (err) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Cuenta bancaria no encontrada en la entidad bancaria.' });
      }

      if (!bcoRes || !bcoRes.success || !bcoRes.data) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Cuenta bancaria corporativa no encontrada.' });
      }

      const ctaBco = bcoRes.data;
      if (parseFloat(ctaBco.saldo_disponible) < montoInicial) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Saldo insuficiente en cuenta bancaria corporativa.' });
      }

      // Débito en Core Banking API (banco_db)
      try {
        await bancoApiService.debitarCuenta({
          numero_cuenta: ctaBco.numero_cuenta_bancaria,
          monto: montoInicial,
          concepto: 'Débito por Apertura de Cuenta Cooperativa',
          referencia: 'APERTURA-VENTANILLA',
        });
      } catch (bcoErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: bcoErr.response?.data?.message || 'Error al debitar la cuenta en la entidad bancaria: ' + bcoErr.message,
        });
      }

      refOrigen = `Banco Corporativo (Cta: ${ctaBco.numero_cuenta_bancaria})`;
    }

    // 4. Generar número de cuenta correlativo
    const prefijos = {
      1: 'CTA-APORT',
      2: 'CTA-AHORR',
      3: 'CTA-PLAZO',
      4: 'CTA-PLAN',
      5: 'CTA-METAS',
    };
    const prefijo = prefijos[id_tipo_cuenta] || 'CTA-FIN';
    const rand = Math.floor(1000 + Math.random() * 9000);
    const numeroCuenta = `${prefijo}-${idAsociado}${rand}`;

    // 5. Insertar nueva cuenta
    const nuevaCuentaRes = await client.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
       VALUES ($1, $2, $3, $4, 0.00, 'ACTIVA')
       RETURNING id_cuenta, numero_cuenta, saldo_disponible, fecha_apertura`,
      [numeroCuenta, idAsociado, id_tipo_cuenta, montoInicial]
    );
    const nuevaCuenta = nuevaCuentaRes.rows[0];

    // 6. Transacción de depósito inicial si aplica
    if (montoInicial > 0) {
      await client.query(
        `INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
         VALUES ($1, 'DEPOSITO', $2, 0.00, $2, $3, $4)`,
        [
          nuevaCuenta.id_cuenta,
          montoInicial,
          `Apertura de Cuenta - Fondeo Inicial (${refOrigen})`,
          req.user?.id_persona || null,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `¡Cuenta ${nuevaCuenta.numero_cuenta} aperturada exitosamente!`,
      data: {
        id_cuenta: nuevaCuenta.id_cuenta,
        numero_cuenta: nuevaCuenta.numero_cuenta,
        tipo_cuenta: tipoCuenta.nombre,
        saldo_disponible: parseFloat(nuevaCuenta.saldo_disponible),
        fecha_apertura: nuevaCuenta.fecha_apertura,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Fallo en asociadosAdminController.aperturarCuenta:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al aperturar la cuenta financiera.',
    });
  } finally {
    client.release();
  }
};

/**
 * Consulta los beneficiarios declarados para una cuenta específica del asociado.
 *
 * @async
 * @function getBeneficiarios
 * @param {import('express').Request} req - Solicitud HTTP con `req.params.id_cuenta`.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 con la lista de beneficiarios o 500.
 */
const getBeneficiarios = async (req, res) => {
  try {
    const { id_cuenta } = req.params;

    const query = `
      SELECT id_beneficiario, id_cuenta, nombre_completo, parentesco, cui_dpi, telefono, porcentaje
      FROM beneficiarios
      WHERE id_cuenta = $1
      ORDER BY porcentaje DESC
    `;
    const result = await pool.query(query, [id_cuenta]);

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        porcentaje: parseFloat(row.porcentaje),
      })),
    });
  } catch (error) {
    console.error('[ERROR] Fallo en asociadosAdminController.getBeneficiarios:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener beneficiarios de la cuenta.',
    });
  }
};

/**
 * FORMULARIO 3: Declaración y Distribución de Beneficiarios con Regla del 100.00% estricto.
 *
 * @async
 * @function guardarBeneficiarios
 * @param {import('express').Request} req - Solicitud HTTP con `id_cuenta` en params y lista de beneficiarios en body.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 al guardar, 400 por suma inválida o 500.
 */
const guardarBeneficiarios = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id_cuenta } = req.params;
    const { beneficiarios } = req.body;

    if (!Array.isArray(beneficiarios) || beneficiarios.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe ingresar al menos un beneficiario para la cuenta.',
      });
    }

    // 1. Validar que la cuenta exista
    const ctaCheck = await client.query('SELECT id_cuenta, numero_cuenta FROM cuentas WHERE id_cuenta = $1', [id_cuenta]);
    if (ctaCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cuenta bancaria no encontrada.' });
    }

    // 2. Validación matemática estricta del 100.00%
    let sumaPorcentajes = 0;
    for (const ben of beneficiarios) {
      if (!ben.nombre_completo || !ben.parentesco || ben.porcentaje === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Cada beneficiario debe contener Nombre Completo, Parentesco y Porcentaje asignado.',
        });
      }
      const pct = parseFloat(ben.porcentaje);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({
          success: false,
          message: `El porcentaje de ${ben.nombre_completo} (${ben.porcentaje}%) debe ser mayor a 0 y menor o igual a 100%.`,
        });
      }
      if (ben.telefono && ben.telefono.trim().length > 0) {
        const cleanTel = ben.telefono.trim().replace(/\D/g, '');
        if (cleanTel.length !== 8) {
          return res.status(400).json({
            success: false,
            message: `El número de teléfono de "${ben.nombre_completo}" debe tener exactamente 8 dígitos numéricos.`,
          });
        }
      }
      sumaPorcentajes += pct;
    }

    // Comprobación con tolerancia de coma flotante
    if (Math.abs(sumaPorcentajes - 100.00) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `La suma de los porcentajes asignados debe ser exactamente el 100.00%. Suma actual: ${sumaPorcentajes.toFixed(
          2
        )}%.`,
      });
    }

    // 3. Obtener beneficiarios actuales para el registro de auditoría
    const prevRes = await client.query(
      `SELECT nombre_completo, parentesco, cui_dpi, telefono, porcentaje 
       FROM beneficiarios 
       WHERE id_cuenta = $1 
       ORDER BY id_beneficiario ASC`,
      [id_cuenta]
    );

    // Comparar si hubo modificaciones reales para no registrar en historial sin cambios
    const normalize = (list) => (list || []).map(b => ({
      nombre_completo: (b.nombre_completo || '').trim().toLowerCase(),
      parentesco: (b.parentesco || '').trim().toUpperCase(),
      cui_dpi: (b.cui_dpi || '').trim(),
      telefono: (b.telefono || '').trim(),
      porcentaje: parseFloat(b.porcentaje || 0).toFixed(2),
    })).sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));

    const prevNorm = normalize(prevRes.rows);
    const newNorm = normalize(beneficiarios);

    if (prevNorm.length > 0 && JSON.stringify(prevNorm) === JSON.stringify(newNorm)) {
      return res.status(400).json({
        success: false,
        message: 'No se detectaron modificaciones en los datos o porcentajes de los beneficiarios.',
      });
    }

    await client.query('BEGIN');

    // 4. Eliminar beneficiarios previos de la cuenta para reemplazo atómico
    await client.query('DELETE FROM beneficiarios WHERE id_cuenta = $1', [id_cuenta]);

    // 5. Insertar los nuevos beneficiarios
    for (const ben of beneficiarios) {
      await client.query(
        `INSERT INTO beneficiarios (id_cuenta, nombre_completo, parentesco, cui_dpi, telefono, porcentaje)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id_cuenta,
          ben.nombre_completo.trim().substring(0, 150),
          ben.parentesco.trim().substring(0, 100),
          ben.cui_dpi?.trim().substring(0, 50) || null,
          ben.telefono?.trim().substring(0, 50) || null,
          parseFloat(ben.porcentaje),
        ]
      );
    }

    // 6. Registrar en el historial de auditoría de beneficiarios
    await client.query(
      `INSERT INTO historial_cambios_beneficiarios 
        (id_cuenta, id_usuario, nombre_usuario, rol_usuario, beneficiarios_anteriores, beneficiarios_nuevos, motivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id_cuenta,
        req.user?.id_persona || null,
        req.user?.nombre_completo || req.user?.codigo_corporativo || 'Operador',
        req.user?.rol || 'OPERADOR',
        JSON.stringify(prevRes.rows),
        JSON.stringify(beneficiarios),
        req.body.motivo || 'Actualización en ventanilla por Operador',
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Beneficiarios declarados y guardados exitosamente (100.00% distribuido).',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Fallo en asociadosAdminController.guardarBeneficiarios:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar beneficiarios de la cuenta: ' + error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Consulta el historial de cambios y auditoría de beneficiarios para una cuenta o general.
 *
 * @async
 * @function getHistorialBeneficiarios
 * @param {import('express').Request} req - Solicitud HTTP con `req.params.id_cuenta` opcional.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 con el historial de cambios o 500.
 */
const getHistorialBeneficiarios = async (req, res) => {
  try {
    const { id_cuenta } = req.params;
    let query = `
      SELECT h.id_historial, h.id_cuenta, h.id_usuario, h.nombre_usuario, h.rol_usuario,
             h.beneficiarios_anteriores, h.beneficiarios_nuevos, h.motivo, h.fecha_cambio,
             c.numero_cuenta, tc.nombre AS tipo_cuenta,
             p.cui_dpi AS cui_asociado,
             TRIM(p.primer_nombre || ' ' || COALESCE(p.primer_apellido, '')) AS nombre_asociado
      FROM historial_cambios_beneficiarios h
      JOIN cuentas c ON c.id_cuenta = h.id_cuenta
      JOIN tipos_cuenta tc ON tc.id_tipo_cuenta = c.id_tipo_cuenta
      JOIN asociados a ON a.id_asociado = c.id_asociado
      JOIN personas p ON p.id_persona = a.id_persona
    `;
    const params = [];
    if (id_cuenta) {
      query += ` WHERE h.id_cuenta = $1 `;
      params.push(id_cuenta);
    }
    query += ` ORDER BY h.fecha_cambio DESC LIMIT 100 `;

    const result = await pool.query(query, params);
    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[ERROR] Fallo en asociadosAdminController.getHistorialBeneficiarios:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar el historial de cambios de beneficiarios.',
    });
  }
};

/**
 * Actualiza el estado de un asociado (ACTIVO, INACTIVO, SUSPENDIDO) sincronizando con la cuenta de usuario.
 *
 * @async
 * @function cambiarEstadoAsociado
 * @param {import('express').Request} req - Solicitud HTTP con `id` en params y `estado` en body.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 al actualizar, 400 por estado inválido o 404/500.
 */
const cambiarEstadoAsociado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['ACTIVO', 'INACTIVO', 'SUSPENDIDO'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado no válido. Debe ser ACTIVO, INACTIVO o SUSPENDIDO.',
      });
    }

    const result = await pool.query(
      'UPDATE asociados SET estado_asociado = $1 WHERE id_asociado = $2 RETURNING id_asociado, id_persona, estado_asociado',
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }

    // Sincronizar estado en usuarios si existe
    const idPersona = result.rows[0].id_persona;
    const estadoUsuario = estado === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO';
    await pool.query('UPDATE usuarios SET estado = $1 WHERE id_persona = $2', [estadoUsuario, idPersona]);

    return res.status(200).json({
      success: true,
      message: `Estado del asociado actualizado a ${estado}.`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[ERROR] Fallo en asociadosAdminController.cambiarEstadoAsociado:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del asociado.',
    });
  }
};

/**
 * Envía la boleta oficial de apertura de cuenta por correo electrónico al asociado.
 * POST /api/admin/asociados/:id/enviar-boleta-apertura
 */
const enviarBoletaApertura = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cuenta, tipo_cuenta, saldo_disponible, fecha_apertura, origen_fondos } = req.body;

    const query = `
      SELECT p.primer_nombre, p.primer_apellido, COALESCE(u.email, p.email, '') AS email, p.nombre_completo
      FROM asociados a
      JOIN personas p ON p.id_persona = a.id_persona
      LEFT JOIN usuarios u ON u.id_persona = p.id_persona
      WHERE a.id_asociado = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }

    const asociado = result.rows[0];
    const emailDestino = asociado.email || `socio.${id}@cooperativa.com`;

    const mailRes = await mailerService.sendAccountOpeningReceiptEmail({
      to: emailDestino,
      nombre: asociado.nombre_completo || `${asociado.primer_nombre} ${asociado.primer_apellido}`,
      numeroCuenta: numero_cuenta,
      tipoCuenta: tipo_cuenta,
      montoApertura: saldo_disponible,
      origenFondos: origen_fondos || 'EFECTIVO_VENTANILLA',
      fechaApertura: fecha_apertura,
    });

    return res.status(200).json({
      success: true,
      message: `Comprobante de apertura enviado correctamente a ${emailDestino}.`,
      data: mailRes,
    });
  } catch (error) {
    console.error('[ERROR] Fallo en asociadosAdminController.enviarBoletaApertura:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error al enviar la boleta de apertura por correo: ' + error.message,
    });
  }
};

module.exports = {
  listarAsociados,
  getExpedienteAsociado,
  crearAfiliacionPresencial,
  aperturarCuenta,
  getBeneficiarios,
  guardarBeneficiarios,
  getHistorialBeneficiarios,
  cambiarEstadoAsociado,
  enviarBoletaApertura,
};
