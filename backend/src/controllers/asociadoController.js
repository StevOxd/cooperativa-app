const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');
const creditScoringService = require('../services/creditScoringService');
const { saveBase64File } = require('../utils/fileStorage');
const socketService = require('../services/socketService');

// Constantes institucionales para eliminación de números mágicos
const CONSTANTS = {
  TIPO_CUENTA_PLANILLA: 'Cuenta de Planilla',
};

/**
 * Obtiene el perfil integral del asociado autenticado con sus datos personales y membresía.
 *
 * @async
 * @function getPerfil
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con datos del asociado.
 * @returns {Promise<import('express').Response>} Retorna 200 con el perfil, 404 si no existe asociado o 500.
 */
const getPerfil = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        p.id_persona,
        p.cui_dpi,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        a.id_asociado,
        a.fecha_ingreso,
        a.estado_asociado,
        u.codigo_corporativo,
        u.email
      FROM personas p
      JOIN asociados a ON p.id_persona = a.id_persona
      JOIN usuarios u ON p.id_persona = u.id_persona
      WHERE p.id_persona = $1
      LIMIT 1
    `;
    const result = await db.query(query, [idPersona]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Datos de asociado no encontrados.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.getPerfil:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el perfil del asociado.',
    });
  }
};

/**
 * Obtener cuentas activas del asociado
 * GET /api/asociado/cuentas
 */
const getCuentas = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        c.saldo_reserva,
        c.estado,
        c.fecha_apertura,
        tc.nombre AS tipo_cuenta,
        tc.tasa_interes_anual,
        'COOPERATIVA' AS origen_cuenta
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1
      ORDER BY c.id_cuenta ASC
    `;
    const result = await db.query(query, [idPersona]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getCuentas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las cuentas del asociado.',
    });
  }
};

/**
 * Obtener transacciones de una cuenta específica del asociado (cooperativa o banco)
 * GET /api/asociado/cuentas/:id_cuenta/transacciones
 */
const getTransacciones = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta } = req.params;

    // 1. Validar si es cuenta de cooperativa
    const ownershipQuery = `
      SELECT c.id_cuenta 
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      WHERE c.id_cuenta = $1 AND a.id_persona = $2
    `;
    const ownershipRes = await db.query(ownershipQuery, [id_cuenta, idPersona]);

    if (ownershipRes.rows.length > 0) {
      const txQuery = `
        SELECT 
          t.id_transaccion,
          t.tipo_transaccion,
          t.monto,
          t.saldo_anterior,
          t.saldo_nuevo,
          t.referencia,
          t.fecha_transaccion
        FROM transacciones t
        WHERE t.id_cuenta = $1
        ORDER BY t.fecha_transaccion DESC, t.id_transaccion DESC
      `;
      const txRes = await db.query(txQuery, [id_cuenta]);
      return res.status(200).json({
        success: true,
        data: txRes.rows,
      });
    }

    // 2. Si no es de cooperativa, verificar si es de cuenta bancaria vía Core Banking API
    const cuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
    if (cuiRes.rows.length > 0 && cuiRes.rows[0].cui_dpi) {
      const cui = cuiRes.rows[0].cui_dpi;
      const bcoHist = await bancoApiService.obtenerHistorialFinanciero(cui);
      if (bcoHist.success && Array.isArray(bcoHist.cuentas)) {
        const matchesAccount = bcoHist.cuentas.some((c) => String(c.id_cuenta_bancaria) === String(id_cuenta));
        if (matchesAccount && Array.isArray(bcoHist.movimientos)) {
          const formatted = bcoHist.movimientos.map((m) => ({
            id_transaccion: m.id_movimiento,
            tipo_transaccion: m.tipo_movimiento,
            monto: parseFloat(m.monto),
            saldo_anterior: parseFloat(m.saldo_anterior),
            saldo_nuevo: parseFloat(m.saldo_posterior),
            referencia: m.concepto + (m.referencia ? ` (${m.referencia})` : ''),
            fecha_transaccion: m.fecha_movimiento,
          }));
          return res.status(200).json({
            success: true,
            data: formatted,
          });
        }
      }
    }

    return res.status(403).json({
      success: false,
      message: 'Acceso denegado: Esta cuenta no le pertenece o no existe.',
    });
  } catch (error) {
    console.error('Error en asociadoController.getTransacciones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las transacciones de la cuenta.',
    });
  }
};

/**
 * Listar solicitudes de crédito del asociado
 * GET /api/asociado/creditos
 */
const getCreditos = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        sc.id_solicitud_credito,
        sc.monto_solicitado,
        sc.plazo_meses,
        sc.tasa_interes,
        sc.cuota_mensual_estimada,
        sc.estado,
        sc.observaciones,
        sc.fecha_solicitud,
        sc.fecha_resolucion,
        sc.id_cuenta_bancaria_destino,
        sc.id_cuenta_destino,
        sc.cuenta_destino_info,
        sc.documento_firmado_url,
        sc.nombre_archivo_firmado,
        sc.peso_archivo_bytes,
        sc.fecha_carga_archivo,
        sc.dictamen_operador,
        sc.observaciones_ejecutivo,
        sc.fecha_revision_operador,
        sc.fecha_resolucion_ejecutivo,
        sc.cuenta_destino_info AS cuenta_bancaria_destino_numero,
        'BANCO' AS cuenta_bancaria_destino_tipo,
        c.numero_cuenta AS cuenta_cooperativa_destino_numero
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      LEFT JOIN cuentas c ON sc.id_cuenta_destino = c.id_cuenta
      WHERE a.id_persona = $1
      ORDER BY sc.fecha_solicitud DESC
    `;
    const result = await db.query(query, [idPersona]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getCreditos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las solicitudes de crédito.',
    });
  }
};

/**
 * Obtener cuentas activas del asociado elegibles para acreditación/desembolso de crédito
 * GET /api/asociado/cuentas-acreditacion
 */
const getCuentasAcreditacionCredito = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    // 1. Cuentas bancarias de ahorro y monetaria vía Core Banking API (Exclusivas para acreditación)
    let resBancarias = [];
    try {
      const cuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
      if (cuiRes.rows.length > 0 && cuiRes.rows[0].cui_dpi) {
        const bcoRes = await bancoApiService.obtenerCuentasCliente(cuiRes.rows[0].cui_dpi);
        if (bcoRes.success && Array.isArray(bcoRes.data)) {
          resBancarias = bcoRes.data
            .filter(cb => cb.estado === 'ACTIVA' && ['MONETARIA', 'AHORRO'].includes(cb.tipo_cuenta?.toUpperCase()))
            .map(cb => ({
              id_cuenta_bancaria: cb.id_cuenta_bancaria,
              numero_cuenta_bancaria: cb.numero_cuenta_bancaria,
              tipo_cuenta: cb.tipo_cuenta,
              saldo_disponible: parseFloat(cb.saldo_disponible),
              etiqueta_tipo: `Cuenta Bancaria de ${cb.tipo_cuenta}`,
              origen: 'BANCO'
            }));
        }
      }
    } catch (bcoErr) {
      console.warn('[ASOCIADO] Error al obtener cuentas bancarias en Core Banking API:', bcoErr.message);
    }

    const todas = resBancarias.map(cb => ({
      key: `BANCO:${cb.id_cuenta_bancaria}`,
      id_cuenta_bancaria: cb.id_cuenta_bancaria,
      id_cuenta: null,
      numero_cuenta: cb.numero_cuenta_bancaria,
      tipo_cuenta: cb.tipo_cuenta,
      etiqueta_tipo: cb.etiqueta_tipo,
      saldo_disponible: parseFloat(cb.saldo_disponible),
      origen: 'BANCO'
    }));

    return res.status(200).json({
      success: true,
      data: {
        cuentasBancarias: resBancarias,
        todas,
        totalDisponibles: todas.length,
      },
    });
  } catch (error) {
    console.error('Error en asociadoController.getCuentasAcreditacionCredito:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las cuentas de acreditación.',
    });
  }
};

/**
 * Paso 1 del flujo de crédito: Configura y registra formalmente el caso en estado 'PENDIENTE_FIRMA'.
 * Bloquea condiciones financieras (monto, plazo, cuota, cuenta) para evitar discordancias con el formulario PDF.
 * POST /api/asociado/creditos/iniciar
 */
const iniciarCredito = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { 
      monto_solicitado, 
      plazo_meses, 
      observaciones,
      id_cuenta_bancaria_destino
    } = req.body;

    const monto = parseFloat(monto_solicitado);
    const plazo = parseInt(plazo_meses, 10);

    if (isNaN(monto) || monto <= 0 || isNaN(plazo) || plazo <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese un monto y plazo en meses válidos mayores a cero.',
      });
    }

    if (!id_cuenta_bancaria_destino) {
      return res.status(400).json({
        success: false,
        message: 'Debe seleccionar una cuenta bancaria de destino (Ahorro o Monetaria) para el desembolso.',
      });
    }

    // 1. Obtener id_asociado
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró un registro de asociado para este usuario.',
      });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    // 2. Evitar solicitudes duplicadas pendientes de firma
    const pendienteFirmaRes = await db.query(
      `SELECT id_solicitud_credito, monto_solicitado, plazo_meses, cuota_mensual_estimada, cuenta_destino_info
       FROM solicitudes_credito
       WHERE id_asociado = $1 AND estado = 'PENDIENTE_FIRMA'
       LIMIT 1`,
      [idAsociado]
    );
    if (pendienteFirmaRes.rows.length > 0) {
      const p = pendienteFirmaRes.rows[0];
      return res.status(400).json({
        success: false,
        solicitud_existente: p,
        message: `Ya tiene una solicitud de crédito iniciada pendiente de firma (Folio #${p.id_solicitud_credito} por Q${parseFloat(p.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}). Por favor complete la carga del formulario firmado o desista de la solicitud previa.`,
      });
    }

    // 3. Validar límite de solicitudes activas en evaluación (máximo 2 simultáneas)
    const pendientesRes = await db.query(
      `SELECT COUNT(*) AS total_pendientes
       FROM solicitudes_credito
       WHERE id_asociado = $1 
         AND estado IN ('PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR')`,
      [idAsociado]
    );
    const totalPendientes = parseInt(pendientesRes.rows[0]?.total_pendientes || 0, 10);
    if (totalPendientes >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Ha alcanzado el límite máximo de 2 solicitudes de crédito activas en evaluación. Debe esperar la resolución definitiva del comité para solicitar un nuevo crédito.',
      });
    }

    // 4. Validar capacidad de endeudamiento (scoring)
    const evaluacionCrediticia = await creditScoringService.evaluarSolicitudCrediticia({
      idAsociado,
      idPersona,
      montoSolicitado: monto,
    });

    if (evaluacionCrediticia.evaluacion.dictamen === 'NO_APTO') {
      return res.status(400).json({
        success: false,
        message: evaluacionCrediticia.evaluacion.diagnostico,
        data: {
          cupoDisponible: evaluacionCrediticia.capacidad.cupoDisponible,
          limiteMaximo: evaluacionCrediticia.capacidad.limiteMaximo,
          saldoTotal: evaluacionCrediticia.saldoTotal,
          deudaActiva: evaluacionCrediticia.deudaActiva,
        },
      });
    }

    // 5. Validar cuenta bancaria en Core Banking API (Exclusivamente Monetaria o Ahorro del banco)
    const personaCuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
    const userCui = personaCuiRes.rows[0]?.cui_dpi;
    if (!userCui) {
      return res.status(400).json({ success: false, message: 'DPI de la persona no encontrado.' });
    }

    const bcoRes = await bancoApiService.obtenerCuentasCliente(userCui);
    if (!bcoRes.success || !Array.isArray(bcoRes.data)) {
      return res.status(502).json({ success: false, message: 'Error de comunicación con el Core Bancario al validar la cuenta.' });
    }

    const bco = bcoRes.data.find(c => 
      String(c.id_cuenta_bancaria) === String(id_cuenta_bancaria_destino) && 
      c.estado === 'ACTIVA' &&
      ['MONETARIA', 'AHORRO'].includes(c.tipo_cuenta?.toUpperCase())
    );

    if (!bco) {
      return res.status(400).json({
        success: false,
        message: 'La cuenta bancaria seleccionada no es válida, no está activa o no pertenece al titular.',
      });
    }

    const destinoInfo = `Cuenta Bancaria de ${bco.tipo_cuenta} (${bco.numero_cuenta_bancaria})`;

    // 6. Calcular cuota mensual (Amortización nivelada francesa)
    const tasaAnual = 10.00;
    const tasaMensual = (tasaAnual / 100) / 12;
    let cuotaMensual = 0;
    if (tasaMensual > 0) {
      cuotaMensual = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
    } else {
      cuotaMensual = monto / plazo;
    }
    cuotaMensual = Math.round(cuotaMensual * 100) / 100;

    // 7. Insertar solicitud formal con estado inicial 'PENDIENTE_FIRMA'
    const insertQuery = `
      INSERT INTO solicitudes_credito (
        id_asociado,
        monto_solicitado,
        plazo_meses,
        tasa_interes,
        cuota_mensual_estimada,
        estado,
        observaciones,
        id_cuenta_bancaria_destino,
        cuenta_destino_info,
        fecha_solicitud
      ) VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_FIRMA', $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING 
        id_solicitud_credito,
        monto_solicitado,
        plazo_meses,
        tasa_interes,
        cuota_mensual_estimada,
        estado,
        fecha_solicitud,
        cuenta_destino_info,
        id_cuenta_bancaria_destino,
        observaciones
    `;
    const result = await db.query(insertQuery, [
      idAsociado,
      monto,
      plazo,
      tasaAnual,
      cuotaMensual,
      observaciones || 'Solicitud de crédito en proceso de firma por el asociado.',
      bco.id_cuenta_bancaria,
      destinoInfo,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Solicitud de crédito registrada con éxito. Proceda a descargar el formulario oficial para firmarlo y cargarlo.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.iniciarCredito:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al iniciar la solicitud de crédito.',
    });
  }
};

/**
 * Paso 2 del flujo de crédito: Carga del formulario firmado por el socio para el Folio exacto.
 * Transiciona el estado de 'PENDIENTE_FIRMA' a 'EN_REVISION_OPERADOR'.
 * POST /api/asociado/creditos/:id/subir-expediente-firmado
 */
const subirExpedienteFirmado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id } = req.params;
    const { documento_firmado, nombre_archivo_firmado } = req.body;

    if (!documento_firmado) {
      return res.status(400).json({
        success: false,
        message: 'Debe adjuntar el archivo firmado en formato PDF o imagen.',
      });
    }

    // Obtener id_asociado
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    // Verificar solicitud
    const solRes = await db.query(
      `SELECT * FROM solicitudes_credito WHERE id_solicitud_credito = $1 AND id_asociado = $2`,
      [id, idAsociado]
    );

    if (solRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Solicitud de crédito no encontrada para este asociado.',
      });
    }

    const sol = solRes.rows[0];
    if (!['PENDIENTE_FIRMA', 'DEVUELTA_OPERADOR'].includes(sol.estado)) {
      return res.status(400).json({
        success: false,
        message: `La solicitud #${id} se encuentra en estado "${sol.estado}" y no admite carga de expediente en esta etapa.`,
      });
    }

    // Guardar archivo en disco
    const fileRes = await saveBase64File(
      documento_firmado,
      'creditos',
      nombre_archivo_firmado || `solicitud_${idAsociado}_folio_${id}.pdf`,
      `solicitud_asoc_${idAsociado}_folio_${id}`
    );

    // Actualizar solicitud a EN_REVISION_OPERADOR
    const updateRes = await db.query(
      `UPDATE solicitudes_credito 
       SET estado = 'EN_REVISION_OPERADOR',
           documento_firmado_url = $1,
           nombre_archivo_firmado = $2,
           peso_archivo_bytes = $3,
           fecha_carga_archivo = CURRENT_TIMESTAMP
       WHERE id_solicitud_credito = $4
       RETURNING *`,
      [fileRes.relativeUrl, fileRes.filename, fileRes.sizeBytes, id]
    );

    // Notificar a operadores vía WebSockets
    try {
      socketService.emitToRole('OPERADOR', 'solicitud_credito:nueva', {
        id_solicitud_credito: sol.id_solicitud_credito,
        monto_solicitado: sol.monto_solicitado,
        id_asociado: idAsociado,
        estado: 'EN_REVISION_OPERADOR',
        fecha: new Date(),
      });
    } catch (wsErr) {
      console.warn('No se pudo emitir evento socket de crédito:', wsErr.message);
    }

    return res.status(200).json({
      success: true,
      message: '¡Expediente firmado cargado exitosamente! Su solicitud ha sido enviada al comité de créditos para revisión.',
      data: updateRes.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.subirExpedienteFirmado:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar el archivo firmado.',
    });
  }
};

/**
 * Endpoint de compatibilidad (flujo legado directo si se envía con PDF)
 * POST /api/asociado/creditos
 */
const createCredito = async (req, res) => {
  return iniciarCredito(req, res);
};

/**
 * Obtiene la cuenta de nómina/planilla activa asociada a la persona autenticada.
 *
 * @async
 * @function getCuentaPlanilla
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con la cuenta encontrada.
 * @returns {Promise<import('express').Response>} Retorna 200 con la cuenta, 404 si no posee planilla activa o 500.
 */
const getCuentaPlanilla = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    // 1. Buscar si posee Cuenta de Planilla en la cooperativa
    const queryPlanilla = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        c.saldo_reserva,
        c.estado,
        tc.nombre AS tipo_cuenta,
        'COOPERATIVA' AS origen_cuenta
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1 AND tc.nombre = $2 AND c.estado = 'ACTIVA'
      LIMIT 1
    `;
    let result = await db.query(queryPlanilla, [idPersona, CONSTANTS.TIPO_CUENTA_PLANILLA]);

    let cuentaData = null;
    if (result.rows.length > 0) {
      cuentaData = result.rows[0];
    } else {
      // 2. Si no tiene Cuenta de Planilla, buscar su Cuenta Bancaria activa en el Core Bancario
      const cuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
      if (cuiRes.rows.length > 0 && cuiRes.rows[0].cui_dpi) {
        const bcoRes = await bancoApiService.obtenerCuentasCliente(cuiRes.rows[0].cui_dpi);
        if (bcoRes.success && Array.isArray(bcoRes.data) && bcoRes.data.length > 0) {
          const act = bcoRes.data.find(c => c.estado === 'ACTIVA') || bcoRes.data[0];
          cuentaData = {
            id_cuenta: act.id_cuenta_bancaria,
            id_cuenta_bancaria: act.id_cuenta_bancaria,
            numero_cuenta: act.numero_cuenta_bancaria,
            saldo_disponible: parseFloat(act.saldo_disponible),
            saldo_reserva: 0,
            estado: act.estado,
            tipo_cuenta: `Cuenta Bancaria (${act.tipo_cuenta})`,
            origen_cuenta: 'BANCO',
          };
        }
      }
    }

    if (!cuentaData) {
      // 3. Fallback institucional: Si no posee cuenta de nómina bancaria externa, utilizar su cuenta cooperativa principal activa
      const queryPrincipal = `
        SELECT 
          c.id_cuenta,
          c.numero_cuenta,
          c.saldo_disponible,
          c.saldo_reserva,
          c.estado,
          tc.nombre AS tipo_cuenta,
          'COOPERATIVA' AS origen_cuenta
        FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
        WHERE a.id_persona = $1 AND c.estado = 'ACTIVA'
        ORDER BY c.id_cuenta ASC
        LIMIT 1
      `;
      const resPrincipal = await db.query(queryPrincipal, [idPersona]);
      if (resPrincipal.rows.length > 0) {
        cuentaData = resPrincipal.rows[0];
      }
    }

    if (!cuentaData) {
      return res.status(404).json({
        success: false,
        message: 'No posee una Cuenta de Ahorro, Planilla o Cuenta Bancaria activa vinculada.',
      });
    }

    return res.status(200).json({
      success: true,
      data: cuentaData,
    });
  } catch (error) {
    console.error('Error en asociadoController.getCuentaPlanilla:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener la cuenta de planilla.',
    });
  }
};

/**
 * Obtiene las cuentas activas del asociado elegibles como destino de traslados y los tipos de cuenta
 * disponibles para nueva apertura inmediata. Excluye la cuenta de planilla.
 *
 * @async
 * @function getMisCuentasDestino
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con cuentasExistentes y tiposDisponibles.
 * @returns {Promise<import('express').Response>} Retorna 200 con el objeto agrupado o 500.
 */
const getMisCuentasDestino = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const idCuentaOrigen = req.query.id_cuenta_origen ? parseInt(req.query.id_cuenta_origen, 10) : null;

    // 1. Cuentas destino existentes (excluye la cuenta que se está usando como origen)
    let existingCuentasQuery = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        tc.id_tipo_cuenta,
        tc.nombre AS tipo_cuenta
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1 AND c.estado = 'ACTIVA'
    `;
    const params = [idPersona];
    if (idCuentaOrigen) {
      params.push(idCuentaOrigen);
      existingCuentasQuery += ` AND c.id_cuenta != $${params.length}`;
    }
    existingCuentasQuery += ' ORDER BY c.id_cuenta ASC';
    const existingRes = await db.query(existingCuentasQuery, params);

    // 2. Tipos de cuenta disponibles para nueva apertura (excluye cuentas que ya posee y tipo planilla id 4)
    const availableTypesQuery = `
      SELECT 
        tc.id_tipo_cuenta,
        tc.nombre,
        tc.tasa_interes_anual,
        tc.monto_minimo_apertura,
        tc.descripcion
      FROM tipos_cuenta tc
      WHERE tc.id_tipo_cuenta NOT IN (
        SELECT c.id_tipo_cuenta 
        FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        WHERE a.id_persona = $1 AND c.estado = 'ACTIVA'
      ) AND tc.id_tipo_cuenta != 4
      ORDER BY tc.id_tipo_cuenta ASC
    `;
    const availableRes = await db.query(availableTypesQuery, [idPersona]);

    return res.status(200).json({
      success: true,
      data: {
        cuentasExistentes: existingRes.rows,
        tiposDisponibles: availableRes.rows,
      },
    });
  } catch (error) {
    console.error('Error en asociadoController.getMisCuentasDestino:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener opciones de cuentas destino.',
    });
  }
};

/**
 * Crea una nueva solicitud de traslado de fondos o apertura de producto para revisión operativa.
 *
 * @async
 * @function createSolicitudTraslado
 * @param {import('express').Request} req - Solicitud HTTP con los datos del traslado.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<import('express').Response>} Retorna 201 al crear la solicitud o 400/403 ante validaciones.
 */
const createSolicitudTraslado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta_origen, id_cuenta_destino, id_tipo_cuenta_destino, monto, tipo_operacion } = req.body;

    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese un monto de traslado válido mayor a cero.',
      });
    }

    if (!['TRASLADO_DIRECTO', 'APERTURA_Y_TRASLADO'].includes(tipo_operacion)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de operación de traslado no válido.',
      });
    }

    // 1. Validar que la cuenta de origen pertenece al asociado y está activa (cooperativa o banco)
    let saldo_disponible = 0;
    let id_asociado = null;
    let isBanco = false;

    // Verificar si es cuenta bancaria activa del usuario vía Core Banking API
    const assocCuiRes = await db.query(
      `SELECT p.cui_dpi, a.id_asociado
       FROM personas p
       JOIN asociados a ON a.id_persona = p.id_persona
       WHERE p.id_persona = $1`,
      [idPersona]
    );

    if (assocCuiRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'No se encontró registro de asociado.' });
    }
    const userCui = assocCuiRes.rows[0].cui_dpi;
    id_asociado = assocCuiRes.rows[0].id_asociado;

    if (userCui) {
      const bcoRes = await bancoApiService.obtenerCuentasCliente(userCui);
      if (bcoRes.success && Array.isArray(bcoRes.data)) {
        const foundBco = bcoRes.data.find(c => String(c.id_cuenta_bancaria) === String(id_cuenta_origen) && c.estado === 'ACTIVA');
        if (foundBco) {
          isBanco = true;
          saldo_disponible = foundBco.saldo_disponible;
        }
      }
    }

    if (!isBanco) {
      // Verificar que la cuenta de origen pertenezca al asociado y esté activa
      const originQuery = `
        SELECT c.id_cuenta, c.saldo_disponible, a.id_asociado
        FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        WHERE c.id_cuenta = $1 AND a.id_persona = $2 AND c.estado = 'ACTIVA'
      `;
      const originRes = await db.query(originQuery, [id_cuenta_origen, idPersona]);
      if (originRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: Cuenta de origen no válida o inactiva.',
        });
      }
      saldo_disponible = originRes.rows[0].saldo_disponible;
      id_asociado = originRes.rows[0].id_asociado;
    }

    // 2. Validar que posee saldo disponible suficiente
    if (parsedMonto > parseFloat(saldo_disponible)) {
      return res.status(400).json({
        success: false,
        message: `Saldo insuficiente. Su cuenta de origen dispone de Q${parseFloat(saldo_disponible).toFixed(2)}.`,
      });
    }

    // 3. Validaciones adicionales del destino
    let finalTipoCuentaDestino = id_tipo_cuenta_destino;

    if (tipo_operacion === 'TRASLADO_DIRECTO') {
      if (!id_cuenta_destino) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar la cuenta de destino para traslados directos.',
        });
      }
      if (!isBanco && String(id_cuenta_origen) === String(id_cuenta_destino)) {
        return res.status(400).json({
          success: false,
          message: 'La cuenta de destino no puede ser la misma cuenta de origen. Seleccione otra cuenta o elija la apertura de un nuevo producto (ej. Plazo Fijo o Metas).',
        });
      }
      // Verificar propiedad de la cuenta destino y obtener su id_tipo_cuenta
      const destQuery = `
        SELECT id_cuenta, id_tipo_cuenta FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        WHERE c.id_cuenta = $1 AND a.id_persona = $2 AND c.estado = 'ACTIVA'
      `;
      const destRes = await db.query(destQuery, [id_cuenta_destino, idPersona]);
      if (destRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: La cuenta de destino no le pertenece o está inactiva.',
        });
      }
      finalTipoCuentaDestino = destRes.rows[0].id_tipo_cuenta;
    } else {
      // APERTURA_Y_TRASLADO
      if (!id_tipo_cuenta_destino) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar el tipo de cuenta a abrir.',
        });
      }
      // Validar monto mínimo de apertura
      const typeQuery = 'SELECT nombre, monto_minimo_apertura FROM tipos_cuenta WHERE id_tipo_cuenta = $1';
      const typeRes = await db.query(typeQuery, [id_tipo_cuenta_destino]);
      if (typeRes.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'El tipo de cuenta destino especificado no existe.',
        });
      }
      const { monto_minimo_apertura, nombre: tipoNombre } = typeRes.rows[0];
      if (parsedMonto < parseFloat(monto_minimo_apertura)) {
        return res.status(400).json({
          success: false,
          message: `El monto solicitado de Q${parsedMonto.toFixed(2)} es inferior al mínimo de apertura para la cuenta ${tipoNombre} (Mínimo: Q${parseFloat(monto_minimo_apertura).toFixed(2)}).`,
        });
      }
    }

    // 4. Insertar la solicitud (el numero_caso correlativo se genera atómicamente por trigger/secuencia)
    const insertQuery = `
      INSERT INTO solicitudes_traslado_apertura (
        id_asociado,
        id_cuenta_origen,
        id_cuenta_bancaria_origen,
        id_cuenta_destino,
        id_tipo_cuenta_destino,
        monto,
        tipo_operacion,
        estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE')
      RETURNING id_solicitud, numero_caso, monto, tipo_operacion, estado, fecha_solicitud
    `;
    const result = await db.query(insertQuery, [
      id_asociado,
      isBanco ? null : id_cuenta_origen,
      isBanco ? id_cuenta_origen : null,
      id_cuenta_destino || null,
      finalTipoCuentaDestino,
      parsedMonto,
      tipo_operacion
    ]);

    return res.status(201).json({
      success: true,
      message: 'Solicitud de traslado de fondos registrada para revisión.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.createSolicitudTraslado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud de traslado.',
    });
  }
};

/**
 * Listar solicitudes del asociado
 * GET /api/asociado/mis-solicitudes
 */
const getMisSolicitudesTraslado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        s.id_solicitud,
        s.numero_caso,
        s.monto,
        s.tipo_operacion,
        s.estado,
        s.observaciones_operador,
        s.fecha_solicitud,
        s.fecha_resolucion,
        tc.nombre AS tipo_cuenta_destino,
        s.id_cuenta_bancaria_origen,
        COALESCE(co.numero_cuenta, ('CTA-BCO-' || s.id_cuenta_bancaria_origen)) AS cuenta_origen_numero,
        cd.numero_cuenta AS cuenta_destino_numero
      FROM solicitudes_traslado_apertura s
      JOIN asociados a ON s.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON s.id_tipo_cuenta_destino = tc.id_tipo_cuenta
      LEFT JOIN cuentas co ON s.id_cuenta_origen = co.id_cuenta
      LEFT JOIN cuentas cd ON s.id_cuenta_destino = cd.id_cuenta
      WHERE a.id_persona = $1
      ORDER BY s.fecha_solicitud DESC
    `;
    const result = await db.query(query, [idPersona]);

    // Enriquecer números de cuenta bancaria si proceden del Core Bancario (banco_db)
    if (req.user?.cui_dpi && result.rows.some(r => r.id_cuenta_bancaria_origen)) {
      try {
        const bcoRes = await bancoApiService.obtenerCuentasCliente(req.user.cui_dpi);
        if (bcoRes.success && Array.isArray(bcoRes.data)) {
          const ctaMap = new Map(bcoRes.data.map(c => [String(c.id_cuenta_bancaria), c.numero_cuenta_bancaria]));
          result.rows.forEach(r => {
            if (r.id_cuenta_bancaria_origen && ctaMap.has(String(r.id_cuenta_bancaria_origen))) {
              r.cuenta_origen_numero = ctaMap.get(String(r.id_cuenta_bancaria_origen));
            }
          });
        }
      } catch (e) {
        // En caso de fallo transitorio con la API bancaria, se mantiene el fallback
      }
    }

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getMisSolicitudesTraslado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener sus solicitudes de traslado.',
    });
  }
};

/**
 * Consulta la capacidad crediticia y el estado de endeudamiento del asociado autenticado
 * GET /api/asociado/capacidad-crediticia
 */
const getCapacidadCrediticia = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró registro de asociado para este usuario.',
      });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    const evaluacion = await creditScoringService.evaluarSolicitudCrediticia({
      idAsociado,
      idPersona,
      montoSolicitado: 0,
    });

    const puedeSolicitar = evaluacion.solicitudesPendientesCount < 2 && evaluacion.capacidad.cupoDisponible > 0;
    let motivoBloqueo = null;
    if (evaluacion.solicitudesPendientesCount >= 2) {
      motivoBloqueo = 'Ha alcanzado el límite máximo de 2 solicitudes de crédito pendientes de evaluación. Espere a que alguna de ellas sea resuelta.';
    } else if (evaluacion.capacidad.cupoDisponible <= 0) {
      motivoBloqueo = 'Actualmente no dispone de cupo crediticio debido a sus créditos vigentes activos.';
    }

    return res.status(200).json({
      success: true,
      data: {
        saldoTotal: evaluacion.saldoTotal,
        totalBanco: evaluacion.totalBanco,
        totalCoop: evaluacion.totalCoop,
        deudaActiva: evaluacion.deudaActiva,
        solicitudesPendientesCount: evaluacion.solicitudesPendientesCount,
        maxSolicitudesPendientes: 2,
        limiteMaximo: evaluacion.capacidad.limiteMaximo,
        cupoDisponible: evaluacion.capacidad.cupoDisponible,
        nivelAhorro: evaluacion.capacidad.nivel,
        rangoTexto: evaluacion.capacidad.rangoTexto,
        descripcionNivel: evaluacion.capacidad.descripcion,
        capacidad: evaluacion.capacidad,
        puedeSolicitar,
        motivoBloqueo,
      },
    });
  } catch (error) {
    console.error('Error en asociadoController.getCapacidadCrediticia:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar la capacidad crediticia del asociado.',
    });
  }
};

/**
 * Permite al asociado cancelar/desistir voluntariamente de una solicitud de crédito en trámite.
 * POST /api/asociado/creditos/:id/cancelar
 */
const cancelarCredito = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id } = req.params;

    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    // Verificar que la solicitud existe, pertenece al asociado y está en estado cancelable
    const solRes = await db.query(
      `SELECT id_solicitud_credito, estado 
       FROM solicitudes_credito 
       WHERE id_solicitud_credito = $1 AND id_asociado = $2`,
      [id, idAsociado]
    );

    if (solRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Solicitud de crédito no encontrada.' });
    }

    const sol = solRes.rows[0];
    const estadosCancelables = ['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'];
    if (!estadosCancelables.includes(sol.estado)) {
      return res.status(400).json({
        success: false,
        message: `No es posible cancelar una solicitud con estado actual "${sol.estado}".`,
      });
    }

    await db.query(
      `UPDATE solicitudes_credito 
       SET estado = 'RECHAZADA',
           observaciones = COALESCE(observaciones, '') || ' [Cancelada voluntariamente por el asociado]',
           fecha_resolucion = CURRENT_TIMESTAMP
       WHERE id_solicitud_credito = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Solicitud de crédito cancelada exitosamente.',
    });
  } catch (error) {
    console.error('Error en asociadoController.cancelarCredito:', error);
    return res.status(500).json({ success: false, message: 'Error al cancelar la solicitud de crédito.' });
  }
};

/**
 * Consulta todas las cuentas activas del asociado autenticado junto con sus beneficiarios declarados.
 * GET /api/asociado/beneficiarios
 */
const getMisBeneficiarios = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    // Obtener cuentas del asociado
    const ctasRes = await db.query(
      `SELECT c.id_cuenta, c.numero_cuenta, tc.nombre AS tipo_cuenta, c.saldo_disponible, c.estado, c.fecha_apertura
       FROM cuentas c
       JOIN tipos_cuenta tc ON tc.id_tipo_cuenta = c.id_tipo_cuenta
       WHERE c.id_asociado = $1 AND c.estado = 'ACTIVA'
       ORDER BY c.id_cuenta ASC`,
      [idAsociado]
    );

    const cuentas = ctasRes.rows;
    if (cuentas.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const cuentaIds = cuentas.map((c) => c.id_cuenta);
    const benRes = await db.query(
      `SELECT id_beneficiario, id_cuenta, nombre_completo, parentesco, cui_dpi, telefono, porcentaje
       FROM beneficiarios
       WHERE id_cuenta = ANY($1::int[])
       ORDER BY porcentaje DESC`,
      [cuentaIds]
    );

    const beneficiariosMap = {};
    benRes.rows.forEach((b) => {
      if (!beneficiariosMap[b.id_cuenta]) {
        beneficiariosMap[b.id_cuenta] = [];
      }
      beneficiariosMap[b.id_cuenta].push({
        ...b,
        porcentaje: parseFloat(b.porcentaje),
      });
    });

    const resultado = cuentas.map((c) => ({
      ...c,
      saldo_disponible: parseFloat(c.saldo_disponible),
      beneficiarios: beneficiariosMap[c.id_cuenta] || [],
    }));

    return res.status(200).json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    console.error('Error en asociadoController.getMisBeneficiarios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar sus beneficiarios.',
    });
  }
};

/**
 * Actualiza la declaración de beneficiarios de una cuenta del asociado autenticado con validación estricta al 100.00%.
 * POST /api/asociado/cuentas/:id_cuenta/beneficiarios
 */
const guardarMisBeneficiarios = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta } = req.params;
    const { beneficiarios } = req.body;

    if (!Array.isArray(beneficiarios) || beneficiarios.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe ingresar al menos un beneficiario para la cuenta.',
      });
    }

    // 1. Verificar titularidad de la cuenta
    const ctaCheck = await client.query(
      `SELECT c.id_cuenta, c.numero_cuenta, p.nombre_completo
       FROM cuentas c
       JOIN asociados a ON a.id_asociado = c.id_asociado
       JOIN personas p ON p.id_persona = a.id_persona
       WHERE c.id_cuenta = $1 AND a.id_persona = $2`,
      [id_cuenta, idPersona]
    );

    if (ctaCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para modificar los beneficiarios de esta cuenta bancaria.',
      });
    }

    const cuentaInfo = ctaCheck.rows[0];

    // 2. Validación matemática del 100.00%
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

    if (Math.abs(sumaPorcentajes - 100.00) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `La suma de los porcentajes asignados debe ser exactamente el 100.00%. Suma actual: ${sumaPorcentajes.toFixed(2)}%.`,
      });
    }

    // 3. Obtener beneficiarios anteriores para auditoría
    const prevRes = await client.query(
      `SELECT nombre_completo, parentesco, cui_dpi, telefono, porcentaje 
       FROM beneficiarios 
       WHERE id_cuenta = $1 
       ORDER BY id_beneficiario ASC`,
      [id_cuenta]
    );

    // Comparar si hubo modificaciones reales
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

    // 4. Reemplazar beneficiarios atómicamente
    await client.query('DELETE FROM beneficiarios WHERE id_cuenta = $1', [id_cuenta]);

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

    // 5. Registrar en historial de cambios
    await client.query(
      `INSERT INTO historial_cambios_beneficiarios
        (id_cuenta, id_usuario, nombre_usuario, rol_usuario, beneficiarios_anteriores, beneficiarios_nuevos, motivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id_cuenta,
        idPersona,
        cuentaInfo.nombre_completo || req.user.codigo_corporativo,
        'ASOCIADO',
        JSON.stringify(prevRes.rows),
        JSON.stringify(beneficiarios),
        req.body.motivo || 'Actualización realizada por el Asociado desde el portal web',
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Beneficiarios actualizados exitosamente (100.00% distribuido).',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en asociadoController.guardarMisBeneficiarios:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar sus beneficiarios: ' + error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getPerfil,
  getCuentas,
  getTransacciones,
  getCreditos,
  createCredito,
  iniciarCredito,
  subirExpedienteFirmado,
  cancelarCredito,
  getCuentaPlanilla,
  getMisCuentasDestino,
  createSolicitudTraslado,
  getMisSolicitudesTraslado,
  getCuentasAcreditacionCredito,
  getCapacidadCrediticia,
  getMisBeneficiarios,
  guardarMisBeneficiarios,
};



