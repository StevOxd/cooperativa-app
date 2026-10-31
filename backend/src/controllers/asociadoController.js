const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');
const creditScoringService = require('../services/creditScoringService');
const { saveBase64File, eliminarArchivoGuardado, eliminarPdfDeCreditoSinUso } = require('../utils/fileStorage');
const socketService = require('../services/socketService');
const { FINANCIERO } = require('../config/constants');
const { normalizarParentesco } = require('../utils/parentesco');
const { respuestaDeError } = require('../utils/errores');
const { movimientoSinRegistrar, revertirMovimientoSinRegistrar } = require('../services/reversionesService');

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
      JOIN usuarios u ON u.id_persona = p.id_persona AND u.id_usuario = $2
      WHERE p.id_persona = $1
      LIMIT 1
    `;
    const result = await db.query(query, [idPersona, req.user.id_usuario]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No encontramos sus datos de asociado.',
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
      message: 'No se pudo cargar su perfil. Intente de nuevo.',
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
      message: 'No se pudieron cargar sus cuentas. Intente de nuevo.',
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
      message: 'Esa cuenta no existe o no es suya.',
    });
  } catch (error) {
    console.error('Error en asociadoController.getTransacciones:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron cargar los movimientos. Intente de nuevo.',
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
      message: 'No se pudieron cargar sus solicitudes. Intente de nuevo.',
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
      message: 'No se pudieron cargar sus cuentas del banco. Intente de nuevo.',
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
        message: 'Escriba un monto y un plazo mayores que cero.',
      });
    }
    // Los límites del crédito se validan también aquí, no solo en el simulador (issue #12)
    if (monto < FINANCIERO.CREDITO_MONTO_MINIMO || monto > FINANCIERO.CREDITO_MONTO_MAXIMO) {
      return res.status(400).json({
        success: false,
        message: `El monto debe estar entre Q${FINANCIERO.CREDITO_MONTO_MINIMO.toLocaleString('es-GT', { minimumFractionDigits: 2 })} y Q${FINANCIERO.CREDITO_MONTO_MAXIMO.toLocaleString('es-GT', { minimumFractionDigits: 2 })}.`,
      });
    }
    if (!Number.isInteger(Number(plazo_meses)) || plazo < FINANCIERO.CREDITO_PLAZO_MINIMO_MESES || plazo > FINANCIERO.CREDITO_PLAZO_MAXIMO_MESES) {
      return res.status(400).json({
        success: false,
        message: `El plazo debe ser de ${FINANCIERO.CREDITO_PLAZO_MINIMO_MESES} a ${FINANCIERO.CREDITO_PLAZO_MAXIMO_MESES} meses.`,
      });
    }

    if (!id_cuenta_bancaria_destino) {
      return res.status(400).json({
        success: false,
        message: 'Elija la cuenta del banco que recibirá el dinero.',
      });
    }

    // 1. Obtener id_asociado
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No encontramos sus datos de asociado.',
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
        message: 'Ya tiene 2 solicitudes en trámite, que es el máximo. Podrá pedir otra cuando se resuelva alguna.',
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
      return res.status(400).json({ success: false, message: 'No encontramos su DPI.' });
    }

    const bcoRes = await bancoApiService.obtenerCuentasCliente(userCui);
    if (!bcoRes.success || !Array.isArray(bcoRes.data)) {
      return res.status(502).json({ success: false, message: 'No pudimos comunicarnos con el banco. Intente de nuevo en unos minutos.' });
    }

    const bco = bcoRes.data.find(c => 
      String(c.id_cuenta_bancaria) === String(id_cuenta_bancaria_destino) && 
      c.estado === 'ACTIVA' &&
      ['MONETARIA', 'AHORRO'].includes(c.tipo_cuenta?.toUpperCase())
    );

    if (!bco) {
      return res.status(400).json({
        success: false,
        message: 'Esa cuenta del banco no está activa o no es suya. Elija otra.',
      });
    }

    const destinoInfo = `Cuenta Bancaria de ${bco.tipo_cuenta} (${bco.numero_cuenta_bancaria})`;

    // 6. Calcular cuota mensual (Amortización nivelada francesa)
    const tasaAnual = FINANCIERO.TASA_INTERES_DEFAULT_CREDITO;
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
      message: 'Solicitud registrada. Descargue el formulario, fírmelo y adjúntelo.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.iniciarCredito:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo registrar la solicitud. Intente de nuevo.',
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
        message: 'Adjunte el formulario firmado (PDF o imagen).',
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
        message: 'No encontramos esa solicitud.',
      });
    }

    const sol = solRes.rows[0];
    if (!['PENDIENTE_FIRMA', 'DEVUELTA_OPERADOR'].includes(sol.estado)) {
      return res.status(400).json({
        success: false,
        message: `La solicitud #${id} ya no espera el formulario firmado.`,
      });
    }

    // Guardar archivo en disco
    const fileRes = await saveBase64File(
      documento_firmado,
      'creditos',
      nombre_archivo_firmado || `solicitud_${idAsociado}_folio_${id}.pdf`,
      `solicitud_asoc_${idAsociado}_folio_${id}`
    );

    // Actualizar solicitud a EN_REVISION_OPERADOR, solo si sigue esperando el formulario (issue #62)
    let updateRes;
    try {
      updateRes = await db.query(
        `UPDATE solicitudes_credito 
         SET estado = 'EN_REVISION_OPERADOR',
             documento_firmado_url = $1,
             nombre_archivo_firmado = $2,
             peso_archivo_bytes = $3,
             fecha_carga_archivo = CURRENT_TIMESTAMP
         WHERE id_solicitud_credito = $4 AND estado IN ('PENDIENTE_FIRMA', 'DEVUELTA_OPERADOR')
         RETURNING *`,
        [fileRes.relativeUrl, fileRes.filename, fileRes.sizeBytes, id]
      );
    } catch (updateError) {
      // El UPDATE se confirma solo: pudo aplicarse aunque la respuesta se perdiera
      await eliminarPdfDeCreditoSinUso(fileRes);
      throw updateError;
    }
    if (updateRes.rowCount === 0) {
      await eliminarArchivoGuardado(fileRes);
      return res.status(409).json({
        success: false,
        message: `La solicitud #${id} cambió de estado mientras subía el formulario. Vuelva a cargarla.`,
      });
    }

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
      message: 'Solicitud enviada. El comité de créditos la revisará.',
      data: updateRes.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.subirExpedienteFirmado:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo procesar el archivo firmado. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
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
 * Cuentas desde las que el asociado puede trasladar (issue #82): todas sus cuentas activas en el banco (ahorro y
 * monetaria). Si no tiene ninguna, su cuenta principal en la cooperativa (la de Ahorro a la Vista).
 *
 * @async
 * @param {number} idPersona
 * @returns {Promise<{ cuentas: Array<{ id_cuenta: number, numero_cuenta: string, saldo_disponible: number,
 *   saldo_reserva: number, estado: string, tipo_cuenta: string, origen_cuenta: 'COOPERATIVA'|'BANCO' }>,
 *   bancoRespondio: boolean }>} La primera cuenta es la predeterminada.
 */
const cuentasDeOrigen = async (idPersona) => {
  const columnas = `c.id_cuenta, c.numero_cuenta, c.saldo_disponible, c.saldo_reserva, c.estado,
                    tc.nombre AS tipo_cuenta, 'COOPERATIVA' AS origen_cuenta`;
  const deLaCooperativa = (fila) => ({
    ...fila,
    saldo_disponible: parseFloat(fila.saldo_disponible),
    saldo_reserva: parseFloat(fila.saldo_reserva),
  });
  const cuentas = [];

  // 1. Todas sus cuentas activas en el banco
  const cuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
  const cui = cuiRes.rows[0]?.cui_dpi;
  let bancoRespondio = false;
  if (cui) {
    const bcoRes = await bancoApiService.obtenerCuentasCliente(cui);
    bancoRespondio = Boolean(bcoRes.success);
    if (bcoRes.success && Array.isArray(bcoRes.data)) {
      bcoRes.data
        .filter((c) => c.estado === 'ACTIVA')
        .forEach((c) => cuentas.push({
          id_cuenta: c.id_cuenta_bancaria,
          id_cuenta_bancaria: c.id_cuenta_bancaria,
          numero_cuenta: c.numero_cuenta_bancaria,
          saldo_disponible: parseFloat(c.saldo_disponible),
          saldo_reserva: 0,
          estado: c.estado,
          tipo_cuenta: `Cuenta bancaria (${c.tipo_cuenta})`,
          origen_cuenta: 'BANCO',
        }));
    }
  }

  // 2. Sin cuentas en el banco: su cuenta principal en la cooperativa. Si el banco no respondió, no: se
  //    confundiría «no tiene cuentas en el banco» con «el banco está caído»
  if (cuentas.length === 0 && (!cui || bancoRespondio)) {
    const principal = await db.query(
      `SELECT ${columnas}
       FROM cuentas c
       JOIN asociados a ON c.id_asociado = a.id_asociado
       JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
       WHERE a.id_persona = $1 AND c.estado = 'ACTIVA'
       ORDER BY c.id_cuenta ASC
       LIMIT 1`,
      [idPersona]
    );
    cuentas.push(...principal.rows.map(deLaCooperativa));
  }
  return { cuentas, bancoRespondio: !cui || bancoRespondio };
};

/**
 * Cuentas de origen de los traslados del asociado autenticado (issue #82).
 *
 * @async
 * @route GET /api/asociado/cuentas-origen
 * @param {import('express').Request} req - `req.user.id_persona`.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con las cuentas (la primera es la predeterminada; puede venir
 *   vacía) y `banco_disponible` (false si no se pudo consultar el banco); 500.
 */
const getCuentasOrigen = async (req, res) => {
  try {
    const { cuentas, bancoRespondio } = await cuentasDeOrigen(req.user.id_persona);
    return res.status(200).json({ success: true, data: cuentas, banco_disponible: bancoRespondio });
  } catch (error) {
    console.error('Error en asociadoController.getCuentasOrigen:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar sus cuentas. Intente de nuevo.' });
  }
};

/**
 * Obtiene las cuentas activas del asociado elegibles como destino de traslados y los tipos de cuenta
 * disponibles para nueva apertura inmediata.
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

    // 2. Tipos de cuenta que puede abrir (issue #101): uno de cada tipo, así que se excluyen los que ya tiene activos
    //    y los que ya pidió en una solicitud pendiente
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
      ) AND tc.id_tipo_cuenta NOT IN (
        SELECT s.id_tipo_cuenta_destino
        FROM solicitudes_traslado_apertura s
        JOIN asociados a ON s.id_asociado = a.id_asociado
        WHERE a.id_persona = $1 AND s.estado = 'PENDIENTE' AND s.tipo_operacion = 'APERTURA_Y_TRASLADO'
      )
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
      message: 'No se pudieron cargar las cuentas de destino. Intente de nuevo.',
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
 * El cuerpo lleva `origen_cuenta` (BANCO o COOPERATIVA) e `id_cuenta_origen`: la cuenta tiene que ser una de las
 * que el portal le ofrece (`cuentasDeOrigen`, issue #82); si no, 403, y 502 si el banco no respondió.
 */
const createSolicitudTraslado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta_origen, id_cuenta_destino, id_tipo_cuenta_destino, monto, tipo_operacion, origen_cuenta } = req.body;

    // Quetzales con hasta dos decimales (la columna es NUMERIC(14,2): con más, se redondearía al guardar)
    const parsedMonto = Number(monto);
    if (!Number.isFinite(parsedMonto) || parsedMonto < 0.01 || Math.round(parsedMonto * 100) !== parsedMonto * 100) {
      return res.status(400).json({
        success: false,
        message: 'Escriba un monto mayor que cero, con hasta dos decimales.',
      });
    }

    if (!['TRASLADO_DIRECTO', 'APERTURA_Y_TRASLADO'].includes(tipo_operacion)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de traslado no válido.',
      });
    }
    // 1. La cuenta de origen (issue #82): una de las que el portal le ofrece (`cuentasDeOrigen`), con su origen. El id
    //    de una cuenta del banco y el de una de la cooperativa pueden coincidir, así que el origen es obligatorio.
    const idOrigen = Number(id_cuenta_origen);
    if (!['BANCO', 'COOPERATIVA'].includes(origen_cuenta) || !Number.isInteger(idOrigen) || idOrigen <= 0) {
      return res.status(400).json({ success: false, message: 'Elija la cuenta de origen.' });
    }
    const asociadoRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1', [idPersona]);
    if (asociadoRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'No encontramos sus datos de asociado.' });
    }
    const id_asociado = asociadoRes.rows[0].id_asociado;

    const { cuentas: origenes, bancoRespondio } = await cuentasDeOrigen(idPersona);
    const cuentaOrigen = origenes.find((c) => c.origen_cuenta === origen_cuenta && Number(c.id_cuenta) === idOrigen);
    if (!cuentaOrigen) {
      if (origen_cuenta === 'BANCO' && !bancoRespondio) {
        return res.status(502).json({ success: false, message: 'No pudimos consultar sus cuentas del banco. Intente de nuevo en unos minutos.' });
      }
      return res.status(403).json({ success: false, message: 'La cuenta de origen no está activa o no es suya.' });
    }
    const isBanco = origen_cuenta === 'BANCO';
    const saldo_disponible = cuentaOrigen.saldo_disponible;

    // 2. Validar que posee saldo disponible suficiente
    if (parsedMonto > parseFloat(saldo_disponible)) {
      return res.status(400).json({
        success: false,
        message: `No tiene saldo suficiente. Disponible: Q${parseFloat(saldo_disponible).toFixed(2)}.`,
      });
    }

    // 3. Validaciones adicionales del destino
    let finalTipoCuentaDestino = id_tipo_cuenta_destino;

    if (tipo_operacion === 'TRASLADO_DIRECTO') {
      if (!id_cuenta_destino) {
        return res.status(400).json({
          success: false,
          message: 'Elija la cuenta de destino.',
        });
      }
      if (!isBanco && String(idOrigen) === String(id_cuenta_destino)) {
        return res.status(400).json({
          success: false,
          message: 'La cuenta de destino no puede ser la misma de origen. Elija otra o abra una cuenta nueva.',
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
          message: 'La cuenta de destino no está activa o no es suya.',
        });
      }
      finalTipoCuentaDestino = destRes.rows[0].id_tipo_cuenta;
    } else {
      // APERTURA_Y_TRASLADO
      if (!Number.isInteger(Number(id_tipo_cuenta_destino)) || Number(id_tipo_cuenta_destino) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Elija el tipo de cuenta que quiere abrir.',
        });
      }
      // Validar monto mínimo de apertura
      const typeQuery = 'SELECT nombre, monto_minimo_apertura FROM tipos_cuenta WHERE id_tipo_cuenta = $1';
      const typeRes = await db.query(typeQuery, [id_tipo_cuenta_destino]);
      if (typeRes.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ese tipo de cuenta no existe.',
        });
      }
      const { monto_minimo_apertura, nombre: tipoNombre } = typeRes.rows[0];
      if (parsedMonto < parseFloat(monto_minimo_apertura)) {
        return res.status(400).json({
          success: false,
          message: `Para abrir una cuenta ${tipoNombre} el mínimo es Q${parseFloat(monto_minimo_apertura).toFixed(2)}.`,
        });
      }
    }

    // Solicitud nueva (el numero_caso correlativo se genera atómicamente por trigger/secuencia)
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

    // 4. Con las solicitudes del asociado bloqueadas (un envío a la vez, issue #100): no se registra otra igual a una
    //    pendiente reciente (doble envío), ni una que con los traslados pendientes de la misma cuenta pase el saldo, ni
    //    la apertura de un tipo que ya tiene o ya pidió (uno de cada tipo, issue #101)
    const client = await db.pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      // Candado 4 (el 1 son los códigos corporativos, el 2 el efectivo de ventanilla y el 3 la purga diaria)
      await client.query('SELECT pg_advisory_xact_lock(4, $1)', [id_asociado]);

      if (tipo_operacion === 'APERTURA_Y_TRASLADO') {
        const yaTiene = await client.query(
          `SELECT 1 FROM cuentas WHERE id_asociado = $1 AND id_tipo_cuenta = $2 AND estado = 'ACTIVA'
           UNION ALL
           SELECT 1 FROM solicitudes_traslado_apertura
           WHERE id_asociado = $1 AND id_tipo_cuenta_destino = $2 AND estado = 'PENDIENTE' AND tipo_operacion = 'APERTURA_Y_TRASLADO'`,
          [id_asociado, finalTipoCuentaDestino]
        );
        if (yaTiene.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: 'Ya tiene una cuenta de ese tipo o una solicitud para abrirla. Traslade a esa cuenta o espere la respuesta.',
          });
        }
      }

      const pendientes = (await client.query(
        `SELECT monto, id_cuenta_destino, id_tipo_cuenta_destino, tipo_operacion,
                fecha_solicitud > CURRENT_TIMESTAMP - INTERVAL '10 minutes' AS reciente
         FROM solicitudes_traslado_apertura
         WHERE id_asociado = $1 AND estado = 'PENDIENTE' AND ${isBanco ? 'id_cuenta_bancaria_origen' : 'id_cuenta_origen'} = $2`,
        [id_asociado, idOrigen]
      )).rows;
      // En centavos: los montos son NUMERIC(14,2) y la suma en coma flotante podría errar por un centavo
      const centavos = (valor) => Math.round(Number(valor) * 100);
      const repetida = pendientes.some((p) => p.reciente && p.tipo_operacion === tipo_operacion
        && centavos(p.monto) === centavos(parsedMonto)
        && (tipo_operacion === 'TRASLADO_DIRECTO'
          ? String(p.id_cuenta_destino) === String(id_cuenta_destino)
          : String(p.id_tipo_cuenta_destino) === String(finalTipoCuentaDestino)));
      if (repetida) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ya envió esta misma solicitud hace unos minutos. Revísela en «Mis solicitudes».',
        });
      }
      const comprometido = pendientes.reduce((total, p) => total + centavos(p.monto), 0) / 100;
      if (centavos(comprometido) + centavos(parsedMonto) > centavos(saldo_disponible)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Con sus traslados pendientes de esa cuenta (Q${comprometido.toFixed(2)}) no le alcanza el saldo. `
            + `Disponible para otro traslado: Q${Math.max(parseFloat(saldo_disponible) - comprometido, 0).toFixed(2)}.`,
        });
      }

      // 5. Insertar la solicitud (el numero_caso correlativo se genera atómicamente por trigger/secuencia)
      result = await client.query(insertQuery, [
        id_asociado,
        isBanco ? null : idOrigen,
        isBanco ? idOrigen : null,
        id_cuenta_destino || null,
        finalTipoCuentaDestino,
        parsedMonto,
        tipo_operacion
      ]);
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    return res.status(201).json({
      success: true,
      message: 'Solicitud de traslado enviada. Un operador la revisará.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.createSolicitudTraslado:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo enviar la solicitud de traslado. Intente de nuevo.',
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
      message: 'No se pudieron cargar sus traslados. Intente de nuevo.',
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
        message: 'No encontramos sus datos de asociado.',
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
        // El simulador usa la misma tasa y los mismos límites que valida el servidor (issue #12)
        tasaInteresAnual: FINANCIERO.TASA_INTERES_DEFAULT_CREDITO,
        limitesCredito: {
          montoMinimo: FINANCIERO.CREDITO_MONTO_MINIMO,
          montoMaximo: FINANCIERO.CREDITO_MONTO_MAXIMO,
          plazoMinimoMeses: FINANCIERO.CREDITO_PLAZO_MINIMO_MESES,
          plazoMaximoMeses: FINANCIERO.CREDITO_PLAZO_MAXIMO_MESES,
        },
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
      message: 'No se pudo calcular su capacidad de crédito. Intente de nuevo.',
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
      `SELECT id_solicitud_credito, estado, fecha_solicitud
       FROM solicitudes_credito 
       WHERE id_solicitud_credito = $1 AND id_asociado = $2`,
      [id, idAsociado]
    );

    if (solRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No encontramos esa solicitud.' });
    }

    const sol = solRes.rows[0];
    const estadosCancelables = ['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'];
    if (!estadosCancelables.includes(sol.estado)) {
      return res.status(400).json({
        success: false,
        message: `Esa solicitud ya no se puede cancelar.`,
      });
    }

    // Si esperaba al ejecutivo, un intento de aprobarla pudo dejar el desembolso en el banco sin registrar (un tiempo
    // agotado): se busca antes de cancelar y se retira después
    const sinRegistrar = sol.estado === 'EN_AUTORIZACION_EJECUTIVO'
      ? await movimientoSinRegistrar(bancoApiService.referenciaDeOperacion(`SOL-CRED-${sol.id_solicitud_credito}`, sol.fecha_solicitud), 'CREDITO')
      : null;

    // Se vuelve a exigir un estado cancelable en el UPDATE: si el ejecutivo la resolvió entre la consulta y
    // este paso, no se cancela una solicitud ya aprobada o desembolsada.
    const cancelada = await db.query(
      `UPDATE solicitudes_credito 
       SET estado = 'CANCELADA',
           fecha_resolucion = CURRENT_TIMESTAMP
       WHERE id_solicitud_credito = $1 AND id_asociado = $2 AND estado = ANY($3::text[])`,
      [id, idAsociado, estadosCancelables]
    );
    if (cancelada.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'Esa solicitud ya no se puede cancelar.' });
    }
    // Si no se puede retirar, queda en «Conciliación» para el administrador
    await revertirMovimientoSinRegistrar(sinRegistrar, {
      origen: 'DESEMBOLSO_CREDITO',
      concepto: `Reversión de desembolso: la solicitud #${sol.id_solicitud_credito} se canceló`,
      detalle: `Solicitud de crédito #${sol.id_solicitud_credito} (cancelada por el asociado)`,
      clave: sol.id_solicitud_credito,
    });

    return res.status(200).json({
      success: true,
      message: 'Solicitud cancelada.',
    });
  } catch (error) {
    console.error('Error en asociadoController.cancelarCredito:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo cancelar la solicitud. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
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
      message: 'No se pudieron cargar sus beneficiarios. Intente de nuevo.',
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
        message: 'Agregue al menos un beneficiario.',
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
        message: 'No puede cambiar los beneficiarios de esa cuenta.',
      });
    }

    const cuentaInfo = ctaCheck.rows[0];

    // 2. Validación matemática del 100.00%
    let sumaPorcentajes = 0;
    for (const ben of beneficiarios) {
      if (!ben.nombre_completo || !ben.parentesco || ben.porcentaje === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Cada beneficiario necesita nombre, parentesco y porcentaje.',
        });
      }
      // Un solo juego de valores de parentesco para el operador y el asociado (issue #10)
      const parentesco = normalizarParentesco(ben.parentesco);
      if (!parentesco) {
        return res.status(400).json({
          success: false,
          message: `El parentesco de ${ben.nombre_completo} no es válido.`,
        });
      }
      ben.parentesco = parentesco;
      const pct = parseFloat(ben.porcentaje);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({
          success: false,
          message: `El porcentaje de ${ben.nombre_completo} debe ser mayor que 0 % y no pasar de 100 %.`,
        });
      }
      if (ben.telefono && ben.telefono.trim().length > 0) {
        const cleanTel = ben.telefono.trim().replace(/\D/g, '');
        if (cleanTel.length !== 8) {
          return res.status(400).json({
            success: false,
            message: `El teléfono de ${ben.nombre_completo} debe tener 8 dígitos.`,
          });
        }
      }
      sumaPorcentajes += pct;
    }

    if (Math.abs(sumaPorcentajes - 100.00) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Los porcentajes deben sumar 100.00%. Ahora suman ${sumaPorcentajes.toFixed(2)}%.`,
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
        message: 'No hay cambios por guardar.',
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
        req.user.id_usuario,
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
      message: 'Beneficiarios guardados.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en asociadoController.guardarMisBeneficiarios:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron guardar sus beneficiarios. Intente de nuevo.',
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
  getCuentasOrigen,
  getMisCuentasDestino,
  createSolicitudTraslado,
  getMisSolicitudesTraslado,
  getCuentasAcreditacionCredito,
  getCapacidadCrediticia,
  getMisBeneficiarios,
  guardarMisBeneficiarios,
};



