const db = require('../config/db');
const mailerService = require('../services/mailerService');
const documentos = require('../services/documentosAfiliacionService');
const { respuestaDeError } = require('../utils/errores');
const { esId } = require('../utils/identificadores');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');

/**
 * Documentos de afiliación: portal del asociado, expediente del operador y bandeja de revisión.
 */

/**
 * Registra en consola un error inesperado; los de negocio (con `statusCode`) son respuestas normales.
 *
 * @param {string} donde
 * @param {Error & {statusCode?: number}} error
 */
const registrarSiEsInesperado = (donde, error) => {
  if (!Number.isInteger(error?.statusCode)) console.error(`[ERROR] documentosAfiliacionController.${donde}:`, error.message);
};

/**
 * Responde un error con su estado, su mensaje y, si lo tiene, su código (`error`).
 *
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {string} mensajeGenerico
 * @returns {import('express').Response}
 */
const responderError = (res, error, mensajeGenerico) => {
  const { status, message, codigo } = respuestaDeError(error, mensajeGenerico);
  return res.status(status).json({ success: false, message, ...(codigo && { error: codigo }) });
};

/**
 * Documentos vigentes con su URL protegida (para el personal y el dueño) y su resumen. Después de una carga ya
 * guardada, si la consulta falla se devuelve null: la carga no se informa como fallida y el frontend vuelve a pedir.
 *
 * @param {number|null} idExpediente
 * @param {{ despuesDeGuardar?: boolean, idUsuarioActual?: number }} [opciones] - `idUsuarioActual` (personal) marca
 *   los documentos que subió (`cargado_por_mi`), que no puede revisar.
 * @returns {Promise<{ documentos: Object[], resumen: Object }|null>}
 */
const documentosConResumen = async (idExpediente, { despuesDeGuardar = false, idUsuarioActual } = {}) => {
  try {
    return await documentos.documentosConResumen(db, idExpediente, { conUrl: true, idUsuarioActual });
  } catch (error) {
    if (!despuesDeGuardar) throw error;
    console.error('[ERROR] No se pudieron listar los documentos después de guardar uno:', error.message);
    return null;
  }
};

/**
 * Persona del asociado de la sesión, o null si su usuario no tiene afiliación.
 *
 * @param {{ id_persona: number }} usuario
 * @returns {Promise<number|null>}
 */
const personaDelAsociado = async (usuario) => {
  const { rows } = await db.query('SELECT id_persona FROM asociados WHERE id_persona = $1', [usuario.id_persona]);
  return rows[0]?.id_persona ?? null;
};

/**
 * Documentos del asociado de la sesión.
 *
 * @async
 * @route GET /api/asociado/documentos
 * @param {import('express').Request} req - Sesión de ASOCIADO.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documentos, resumen }`; 404 sin afiliación; 500.
 */
const misDocumentos = async (req, res) => {
  try {
    const idPersona = await personaDelAsociado(req.user);
    if (!idPersona) return res.status(404).json({ success: false, message: 'No encontramos su afiliación.' });
    const idExpediente = await documentos.expedienteDePersona(db, idPersona);
    return res.status(200).json({ success: true, data: await documentosConResumen(idExpediente) });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.misDocumentos:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar sus documentos. Intente de nuevo.' });
  }
};

/**
 * El asociado sube o vuelve a subir uno de sus documentos (queda pendiente de revisión).
 *
 * @async
 * @route POST /api/asociado/documentos
 * @param {import('express').Request} req - `{ tipo_documento, archivo }` (Data URI de hasta 5 MB).
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }` (`data` null si no se pudo volver a listar); 400; 404 sin
 *   afiliación; 409 ya aceptado o tope de versiones; 413; 500.
 */
const subirMiDocumento = async (req, res) => {
  try {
    const idPersona = await personaDelAsociado(req.user);
    if (!idPersona) return res.status(404).json({ success: false, message: 'No encontramos su afiliación.' });
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      persona: { idPersona, crearPor: req.user.id_usuario },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'PORTAL',
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    return res.status(201).json({
      success: true,
      message: reemplazo ? 'Documento reemplazado. Lo revisaremos pronto.' : 'Documento recibido. Lo revisaremos pronto.',
      data: await documentosConResumen(idExpediente, { despuesDeGuardar: true }),
    });
  } catch (error) {
    registrarSiEsInesperado('subirMiDocumento', error);
    return responderError(res, error, 'No se pudo subir el documento. Intente de nuevo.');
  }
};

/**
 * El operador escanea un documento en el expediente de un asociado (reemplaza el vigente en cualquier estado). Lo
 * que escanea lo revisa un colega.
 *
 * @async
 * @route POST /api/admin/asociados/:id/documentos
 * @param {import('express').Request} req - `:id` del asociado; `{ tipo_documento, archivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }` (`data` null si no se pudo volver a listar); 400; 404; 413;
 *   500.
 */
const subirDocumentoDeAsociado = async (req, res) => {
  try {
    if (!esId(req.params.id)) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    const asociado = (await db.query('SELECT id_persona FROM asociados WHERE id_asociado = $1', [Number(req.params.id)])).rows[0];
    if (!asociado) return res.status(404).json({ success: false, message: 'Asociado no encontrado.' });
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      persona: { idPersona: asociado.id_persona, crearPor: req.user.id_usuario },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'VENTANILLA',
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    return res.status(201).json({
      success: true,
      message: `${reemplazo ? 'Documento reemplazado' : 'Documento agregado al expediente'}. Lo revisa un colega.`,
      data: await documentosConResumen(idExpediente, { despuesDeGuardar: true, idUsuarioActual: req.user.id_usuario }),
    });
  } catch (error) {
    registrarSiEsInesperado('subirDocumentoDeAsociado', error);
    return responderError(res, error, 'No se pudo subir el documento. Intente de nuevo.');
  }
};

/**
 * Bandeja de documentos para revisar.
 *
 * @async
 * @route GET /api/operador/documentos
 * @param {import('express').Request} req - `?estado=PENDIENTE|RECHAZADO|ACEPTADO&search&limit&offset`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ total, conteos, por_revisar, data }`; 500.
 */
const bandeja = async (req, res) => {
  try {
    const resultado = await documentos.bandejaDocumentos({
      estado: req.query.estado,
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset,
      idPersonaRevisor: req.user.id_persona,
      idUsuarioRevisor: req.user.id_usuario,
    });
    return res.status(200).json({ success: true, ...resultado });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.bandeja:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo cargar la bandeja de documentos. Intente de nuevo.' });
  }
};

/**
 * Versiones de un documento con sus revisiones.
 *
 * @async
 * @route GET /api/operador/documentos/:id/historial
 * @param {import('express').Request} req - `:id` de cualquier versión.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ data }`; 400; 404; 500.
 */
const historial = async (req, res) => {
  try {
    if (!esId(req.params.id)) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    const versiones = await documentos.historialDocumento(Number(req.params.id));
    if (!versiones) return res.status(404).json({ success: false, message: 'El documento no existe.' });
    return res.status(200).json({ success: true, data: versiones });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.historial:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo cargar el historial. Intente de nuevo.' });
  }
};

/**
 * El operador acepta o rechaza un documento pendiente. Si lo rechaza, se avisa al interesado por correo después de
 * guardar la revisión (`correo_enviado` dice si salió).
 *
 * @async
 * @route PATCH /api/operador/documentos/:id/revision
 * @param {import('express').Request} req - `{ resultado: 'ACEPTADO'|'RECHAZADO', motivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documento, correo_enviado }`; 400; 403 `REVISION_POR_QUIEN_CARGO`; 404; 409 ya
 *   revisado, reemplazado o de una afiliación sin enviar; 500.
 */
const revisar = async (req, res) => {
  try {
    if (!esId(req.params.id)) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    const { documento, contacto } = await documentos.revisarDocumento({
      idDocumento: Number(req.params.id),
      resultado: req.body?.resultado,
      motivo: req.body?.motivo,
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });

    let correoEnviado = null;
    if (documento.estado === 'RECHAZADO') {
      correoEnviado = false;
      if (contacto.email) {
        try {
          const envio = await mailerService.sendDocumentoRechazadoEmail({
            to: contacto.email,
            nombre: contacto.nombre,
            documento: documentos.ETIQUETAS[documento.tipo_documento],
            motivo: documento.motivo_rechazo,
          });
          correoEnviado = mailerService.wasSent(envio);
        } catch (errorCorreo) {
          console.warn('[WARN] No se pudo enviar el aviso de documento rechazado:', errorCorreo.message);
        }
      }
    }

    let message = documento.estado === 'ACEPTADO' ? 'Documento aceptado.' : 'Documento rechazado.';
    if (correoEnviado === true) message += ' Se le avisó por correo.';
    if (correoEnviado === false) {
      message += ' No se le pudo avisar por correo: verá el motivo al entrar a su portal; si es urgente, comuníquese con el asociado.';
    }
    return res.status(200).json({ success: true, message, documento, correo_enviado: correoEnviado });
  } catch (error) {
    registrarSiEsInesperado('revisar', error);
    return responderError(res, error, 'No se pudo guardar la revisión. Intente de nuevo.');
  }
};

module.exports = {
  misDocumentos,
  subirMiDocumento,
  subirDocumentoDeAsociado,
  bandeja,
  historial,
  revisar,
};
