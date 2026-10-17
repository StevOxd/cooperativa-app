/**
 * Servicio de Dominio: Créditos Operativos (ARQ-03)
 * Centraliza la evaluación crediticia, la elevación al ejecutivo y el rechazo desde la bandeja del operador.
 * La aprobación y el desembolso son del ejecutivo (ejecutivoController).
 */

const db = require('../config/db');
const creditScoringService = require('./creditScoringService');
const socketService = require('./socketService');
const { saveBase64File, eliminarArchivoGuardado, eliminarPdfDeCreditoSinUso } = require('../utils/fileStorage');

/**
 * Obtiene la evaluación crediticia y scoring para una solicitud de crédito
 */
const obtenerEvaluacionCredito = async (idSolicitud) => {
  const credRes = await db.query(
    `SELECT sc.id_solicitud_credito, sc.id_asociado, sc.monto_solicitado, sc.plazo_meses, sc.tasa_interes, sc.cuota_mensual_estimada, sc.estado,
            a.id_persona, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.cui_dpi, p.telefono,
            u.email, u.codigo_corporativo
     FROM solicitudes_credito sc
     JOIN asociados a ON sc.id_asociado = a.id_asociado
     JOIN personas p ON a.id_persona = p.id_persona
     LEFT JOIN usuarios u ON u.id_persona = p.id_persona AND u.id_rol = 3 /* ASOCIADO */
     WHERE sc.id_solicitud_credito = $1`,
    [idSolicitud]
  );

  if (credRes.rows.length === 0) {
    return {
      status: 404,
      success: false,
      message: 'No encontramos esa solicitud.',
    };
  }

  const credito = credRes.rows[0];
  const evaluacion = await creditScoringService.evaluarSolicitudCrediticia({
    idAsociado: credito.id_asociado,
    idPersona: credito.id_persona,
    montoSolicitado: parseFloat(credito.monto_solicitado),
  });

  return {
    status: 200,
    success: true,
    data: {
      solicitud: credito,
      evaluacion,
    },
  };
};

/**
 * Eleva una solicitud de crédito al rol de Ejecutivo tras dictamen operativo
 */
const elevarCredito = async ({ idSolicitud, idOperador, dictamen_operador, documento_firmado, nombre_archivo_firmado }) => {
  if (!dictamen_operador || dictamen_operador.trim() === '') {
    return {
      status: 400,
      success: false,
      message: 'Escriba su dictamen antes de enviar la solicitud al ejecutivo.',
    };
  }

  const checkRes = await db.query(
    `SELECT sc.*, p.primer_nombre, p.primer_apellido,
            (SELECT u.id_usuario FROM usuarios u WHERE u.id_persona = a.id_persona AND u.id_rol = 3 /* ASOCIADO */) AS id_usuario_asociado
     FROM solicitudes_credito sc
     JOIN asociados a ON sc.id_asociado = a.id_asociado
     JOIN personas p ON a.id_persona = p.id_persona
     WHERE sc.id_solicitud_credito = $1`,
    [idSolicitud]
  );

  if (checkRes.rows.length === 0) {
    return {
      status: 404,
      success: false,
      message: 'No encontramos esa solicitud.',
    };
  }

  const sol = checkRes.rows[0];
  const estadosPermitidos = ['EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR', 'PENDIENTE'];
  if (!estadosPermitidos.includes(sol.estado)) {
    return {
      status: 400,
      success: false,
      message: `Esa solicitud no se puede enviar al ejecutivo en su estado actual.`,
    };
  }

  if (!documento_firmado) {
    return {
      status: 400,
      success: false,
      message: 'Adjunte el PDF firmado por usted para enviar la solicitud al ejecutivo.',
    };
  }

  let fileData = null;
  if (documento_firmado) {
    fileData = await saveBase64File(
      documento_firmado,
      'creditos',
      nombre_archivo_firmado || `dictamen_operador_sol_${idSolicitud}.pdf`,
      `solicitud_credito_${idSolicitud}_op`
    );
  }

  let updateQuery = `
    UPDATE solicitudes_credito
    SET 
      estado = 'EN_AUTORIZACION_EJECUTIVO',
      id_operador_revisa = $1,
      dictamen_operador = $2,
      fecha_revision_operador = CURRENT_TIMESTAMP
  `;
  const updateParams = [idOperador, dictamen_operador.trim()];

  if (fileData) {
    updateQuery += `,
      documento_firmado_url = $${updateParams.length + 1},
      nombre_archivo_firmado = $${updateParams.length + 2},
      peso_archivo_bytes = $${updateParams.length + 3},
      fecha_carga_archivo = CURRENT_TIMESTAMP
    `;
    updateParams.push(fileData.relativeUrl, fileData.filename, fileData.sizeBytes);
  }

  // Solo si sigue en el estado que se revisó (issue #62): una aprobación hecha mientras tanto no vuelve a la bandeja
  // del ejecutivo, y un firmado que el asociado suba mientras tanto no se eleva sin que nadie lo revise
  updateQuery += ` WHERE id_solicitud_credito = $${updateParams.length + 1} AND estado = $${updateParams.length + 2} RETURNING *`;
  updateParams.push(idSolicitud, sol.estado);

  let updateRes;
  try {
    updateRes = await db.query(updateQuery, updateParams);
  } catch (updateError) {
    // El UPDATE se confirma solo: pudo aplicarse aunque la respuesta se perdiera
    await eliminarPdfDeCreditoSinUso(fileData);
    throw updateError;
  }
  if (updateRes.rowCount === 0) {
    await eliminarArchivoGuardado(fileData);
    return {
      status: 409,
      success: false,
      message: 'La solicitud cambió de estado mientras la revisaba. Vuelva a abrirla.',
    };
  }

  // Notificaciones en tiempo real por WebSockets
  try {
    socketService.emitToRole('EJECUTIVO', 'solicitud_credito:elevada', {
      id_solicitud_credito: idSolicitud,
      monto: sol.monto_solicitado,
      asociado: `${sol.primer_nombre} ${sol.primer_apellido}`,
      dictamen: dictamen_operador.trim(),
    });
    socketService.emitToUser(sol.id_usuario_asociado, 'solicitud_credito:actualizada', {
      id_solicitud_credito: idSolicitud,
      estado: 'EN_AUTORIZACION_EJECUTIVO',
      mensaje: 'Su solicitud ha sido revisada por el operador y elevada al Comité Ejecutivo para su dictamen final.',
    });
  } catch (sockErr) {
    console.warn('Aviso: Error emitiendo socket en elevarCredito:', sockErr.message);
  }

  return {
    status: 200,
    success: true,
    message: `La solicitud #${idSolicitud} se envió al ejecutivo con su dictamen.`,
    data: updateRes.rows[0],
  };
};

/**
 * Rechaza una solicitud de crédito desde la bandeja del operador.
 *
 * El operador no aprueba ni desembolsa: eso lo decide el ejecutivo (comité de crédito) después de que el
 * operador eleva la solicitud. Por eso esta ruta solo acepta RECHAZAR.
 *
 * @param {Object} params
 * @param {number|string} params.idSolicitud
 * @param {number} params.idOperador - `id_usuario` del operador.
 * @param {string} params.accion - Solo `RECHAZAR`.
 * @param {string} params.observaciones - Motivo del rechazo (obligatorio).
 * @returns {Promise<{status: number, success: boolean, message: string, data?: Object}>} 200 al rechazar; 400 si
 *   la acción no es válida, falta el motivo o la solicitud ya se resolvió; 403 si se intenta aprobar; 404 si no existe.
 */
const resolverCredito = async ({ idSolicitud, idOperador, accion, observaciones }) => {
  if (accion === 'APROBAR') {
    return {
      status: 403,
      success: false,
      message: 'La aprobación y el desembolso los hace el ejecutivo. Use «Elevar al ejecutivo».',
    };
  }
  if (accion !== 'RECHAZAR') {
    return {
      status: 400,
      success: false,
      message: "La acción debe ser 'RECHAZAR'.",
    };
  }
  // Como al denegar en el ejecutivo, el rechazo queda con su motivo
  if (typeof observaciones !== 'string' || !observaciones.trim()) {
    return {
      status: 400,
      success: false,
      message: 'Escriba el motivo del rechazo.',
    };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener la solicitud con bloqueo
    const solRes = await client.query(`
      SELECT sc.estado
      FROM solicitudes_credito sc
      WHERE sc.id_solicitud_credito = $1
      FOR UPDATE
    `, [idSolicitud]);

    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 404,
        success: false,
        message: 'No encontramos esa solicitud.',
      };
    }

    const estadosPermitidos = ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'];
    if (!estadosPermitidos.includes(solRes.rows[0].estado)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: `Esa solicitud ya fue resuelta.`,
      };
    }

    const updateRes = await client.query(`
      UPDATE solicitudes_credito
      SET 
        estado = 'RECHAZADA',
        id_analista = $1,
        id_operador_revisa = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        fecha_revision_operador = CURRENT_TIMESTAMP,
        dictamen_operador = COALESCE($2, dictamen_operador),
        observaciones = COALESCE($2, observaciones)
      WHERE id_solicitud_credito = $3
      RETURNING id_solicitud_credito, monto_solicitado, estado, fecha_resolucion
    `, [idOperador, observaciones.trim(), idSolicitud]);

    await client.query('COMMIT');
    return {
      status: 200,
      success: true,
      message: `Se rechazó la solicitud #${idSolicitud}.`,
      data: updateRes.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  obtenerEvaluacionCredito,
  elevarCredito,
  resolverCredito,
};
