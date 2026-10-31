const db = require('../config/db');
const mailerService = require('../services/mailerService');
const documentos = require('../services/documentosAfiliacionService');
const { respuestaDeError } = require('../utils/errores');
const { esId } = require('../utils/identificadores');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');
const { verificarAfiliacionToken, verificarCargaDocumentosToken } = require('../utils/afiliacionToken');

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
 * Documentos de una afiliación en curso con su resumen. Los de una carga previa van sin URL: no se abren hasta que
 * la afiliación se completa (`secureUploads`).
 *
 * @param {number|null} idExpediente
 * @param {{ despuesDeGuardar?: boolean, idUsuarioActual?: number }} [opciones]
 * @returns {Promise<{ documentos: Object[], resumen: Object }|null>}
 */
const documentosDeAfiliacion = async (idExpediente, { despuesDeGuardar = false, idUsuarioActual } = {}) => {
  try {
    const cargaPrevia = idExpediente
      ? (await db.query(
          'SELECT (id_persona IS NULL AND id_solicitud IS NULL) AS carga_previa FROM expedientes_documentos WHERE id_expediente = $1',
          [idExpediente]
        )).rows[0]?.carga_previa
      : false;
    return await documentos.documentosConResumen(db, idExpediente, { conUrl: !cargaPrevia, idUsuarioActual });
  } catch (error) {
    if (!despuesDeGuardar) throw error;
    console.error('[ERROR] No se pudieron listar los documentos después de guardar uno:', error.message);
    return null;
  }
};

/** DPI de 13 dígitos (sin espacios), o null. @param {unknown} valor @returns {string|null} */
const leerCui = (valor) => {
  const cui = typeof valor === 'string' ? valor.replace(/\s+/g, '') : '';
  return /^\d{13}$/.test(cui) ? cui : null;
};

/**
 * Solicitud de agencia que todavía se puede formalizar, o null.
 *
 * @param {string} id
 * @returns {Promise<{ id_solicitud: number, cui_dpi: string }|null>}
 */
const solicitudPendiente = async (id) => {
  const { rows } = await db.query(
    "SELECT id_solicitud, cui_dpi FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1 AND estado = 'PENDIENTE_AGENCIA'",
    [Number(id)]
  );
  return rows[0] || null;
};

/**
 * Documentos que ya se escanearon para afiliar en ventanilla a un DPI (Formulario 1).
 *
 * @async
 * @route GET /api/admin/asociados/documentos-afiliacion
 * @param {import('express').Request} req - `?cui_dpi`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documentos, resumen }`; 400 DPI inválido; 500.
 */
const documentosParaAfiliar = async (req, res) => {
  try {
    const cui = leerCui(req.query.cui_dpi);
    if (!cui) return res.status(400).json({ success: false, message: 'Escriba un DPI de 13 dígitos.' });
    const idExpediente = await documentos.expedienteDeAfiliacion(db, cui);
    return res.status(200).json({
      success: true,
      data: await documentosDeAfiliacion(idExpediente, { idUsuarioActual: req.user.id_usuario }),
    });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.documentosParaAfiliar:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar los documentos. Intente de nuevo.' });
  }
};

/**
 * El operador escanea un documento para afiliar en ventanilla a un DPI, antes de enviar el Formulario 1. Si la
 * afiliación no se completa, se borra a los 30 días.
 *
 * @async
 * @route POST /api/admin/asociados/documentos-afiliacion
 * @param {import('express').Request} req - `{ cui_dpi, tipo_documento, archivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }`; 400; 413; 500.
 */
const escanearParaAfiliar = async (req, res) => {
  try {
    const cui = leerCui(req.body?.cui_dpi);
    if (!cui) return res.status(400).json({ success: false, message: 'Escriba un DPI de 13 dígitos.' });
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      afiliacion: { cui, crearPor: req.user.id_usuario, canalOrigen: 'VENTANILLA' },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'VENTANILLA',
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    return res.status(201).json({
      success: true,
      message: reemplazo ? 'Documento reemplazado.' : 'Documento escaneado.',
      data: await documentosDeAfiliacion(idExpediente, { despuesDeGuardar: true, idUsuarioActual: req.user.id_usuario }),
    });
  } catch (error) {
    registrarSiEsInesperado('escanearParaAfiliar', error);
    return responderError(res, error, 'No se pudo subir el documento. Intente de nuevo.');
  }
};

/**
 * Documentos de una solicitud de agencia (los que subió el solicitante y los que se escanearon).
 *
 * @async
 * @route GET /api/operador/afiliaciones/:id/documentos
 * @param {import('express').Request} req - `:id` de la solicitud.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documentos, resumen }`; 400; 404; 500.
 */
const documentosDeSolicitud = async (req, res) => {
  try {
    if (!esId(req.params.id)) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    const { rows } = await db.query('SELECT id_solicitud, cui_dpi FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1', [
      Number(req.params.id),
    ]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
    const idExpediente = await documentos.expedienteDeAfiliacion(db, rows[0].cui_dpi, { idSolicitud: rows[0].id_solicitud });
    return res.status(200).json({
      success: true,
      data: await documentosDeAfiliacion(idExpediente, { idUsuarioActual: req.user.id_usuario }),
    });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.documentosDeSolicitud:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar los documentos. Intente de nuevo.' });
  }
};

/**
 * El operador escanea un documento de una solicitud de agencia antes de formalizarla.
 *
 * @async
 * @route POST /api/operador/afiliaciones/:id/documentos
 * @param {import('express').Request} req - `:id` de la solicitud; `{ tipo_documento, archivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }`; 400; 404 si no existe o ya se cerró; 413; 500.
 */
const escanearDeSolicitud = async (req, res) => {
  try {
    if (!esId(req.params.id)) return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
    const solicitud = await solicitudPendiente(req.params.id);
    if (!solicitud) return res.status(404).json({ success: false, message: 'La solicitud no existe o ya se cerró.' });
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      afiliacion: {
        cui: solicitud.cui_dpi,
        idSolicitud: solicitud.id_solicitud,
        crearPor: req.user.id_usuario,
        canalOrigen: 'VENTANILLA',
      },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'VENTANILLA',
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    return res.status(201).json({
      success: true,
      message: `${reemplazo ? 'Documento reemplazado' : 'Documento escaneado'}. Lo revisa un colega.`,
      data: await documentosDeAfiliacion(idExpediente, { despuesDeGuardar: true, idUsuarioActual: req.user.id_usuario }),
    });
  } catch (error) {
    registrarSiEsInesperado('escanearDeSolicitud', error);
    return responderError(res, error, 'No se pudo subir el documento. Intente de nuevo.');
  }
};

/**
 * Afiliación en línea a la que pertenece una carga sin sesión, según el permiso que trae: el comprobante de la Banca
 * en Línea (cliente o empleado del banco, antes de afiliarse) o el permiso de carga de una solicitud de agencia recién
 * registrada. Nunca del cuerpo: el DPI y la solicitud salen del permiso firmado.
 *
 * @param {Object} cuerpo - `{ afiliacion_token }` o `{ carga_token }`.
 * Con el permiso de una solicitud (cuyo DPI nadie comprobó todavía) solo se llega al expediente de esa solicitud.
 *
 * @returns {Promise<{ cui: string, idSolicitud: number|null, soloSolicitud: boolean }|{ yaAsociado: true }|null>}
 *   null si no trae un permiso vigente o la solicitud ya se cerró; `yaAsociado` si con el comprobante del banco
 *   resulta que ya es asociado (sus documentos se suben desde su portal). Con el permiso de una solicitud no se dice:
 *   quien la registró eligió el DPI, y la respuesta revelaría si esa persona es asociada.
 */
const afiliacionEnLinea = async (cuerpo) => {
  const comprobante = verificarAfiliacionToken(cuerpo?.afiliacion_token);
  if (comprobante) {
    const asociado = await db.query(
      'SELECT 1 FROM asociados a JOIN personas p ON p.id_persona = a.id_persona WHERE p.cui_dpi = $1',
      [comprobante.cui_dpi]
    );
    return asociado.rows[0] ? { yaAsociado: true } : { cui: comprobante.cui_dpi, idSolicitud: null, soloSolicitud: false };
  }
  const permiso = verificarCargaDocumentosToken(cuerpo?.carga_token);
  if (!permiso) return null;
  const cui = permiso.cui_dpi;
  const { rows } = await db.query(
    "SELECT id_solicitud FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1 AND cui_dpi = $2 AND estado = 'PENDIENTE_AGENCIA'",
    [permiso.id_solicitud, permiso.cui_dpi]
  );
  return rows[0] ? { cui, idSolicitud: rows[0].id_solicitud, soloSolicitud: true } : null;
};

/** Respuesta cuando no hay permiso vigente o ya es asociado. @param {import('express').Response} res @param {Object|null} afiliacion */
const responderSinPermiso = (res, afiliacion) =>
  afiliacion?.yaAsociado
    ? res.status(409).json({ success: false, message: 'Ya es asociado: suba sus documentos desde su portal.' })
    : res.status(403).json(PERMISO_VENCIDO);

const PERMISO_VENCIDO = {
  success: false,
  message: 'El tiempo para subir documentos en línea terminó. Vuelva a validar sus datos o lleve los documentos a la agencia.',
};

/**
 * Documentos que ya subió el solicitante en línea (sin enlaces: no se abren sin sesión).
 *
 * @async
 * @route POST /api/afiliacion/documentos/consultar
 * @param {import('express').Request} req - `{ afiliacion_token }` o `{ carga_token }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documentos, resumen }`; 403 sin permiso vigente; 500.
 */
const documentosEnLinea = async (req, res) => {
  try {
    const afiliacion = await afiliacionEnLinea(req.body);
    if (!afiliacion?.cui) return responderSinPermiso(res, afiliacion);
    const idExpediente = afiliacion.soloSolicitud
      ? await documentos.expedienteDeSolicitud(db, afiliacion.idSolicitud)
      : await documentos.expedienteDeAfiliacion(db, afiliacion.cui);
    return res.status(200).json({ success: true, data: await documentos.documentosConResumen(db, idExpediente) });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.documentosEnLinea:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar sus documentos. Intente de nuevo.' });
  }
};

/**
 * El solicitante sube uno de sus documentos en línea. Sin una solicitud, quedan como carga previa: si no completa la
 * afiliación, se borran a los 30 días.
 *
 * @async
 * @route POST /api/afiliacion/documentos
 * @param {import('express').Request} req - `{ afiliacion_token | carga_token, tipo_documento, archivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }`; 400; 403 sin permiso vigente; 409; 413; 500.
 */
const subirDocumentoEnLinea = async (req, res) => {
  try {
    const afiliacion = await afiliacionEnLinea(req.body);
    if (!afiliacion?.cui) return responderSinPermiso(res, afiliacion);
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      afiliacion: { cui: afiliacion.cui, idSolicitud: afiliacion.idSolicitud, canalOrigen: 'EN_LINEA', soloSolicitud: afiliacion.soloSolicitud },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'EN_LINEA',
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    let data = null;
    try {
      data = await documentos.documentosConResumen(db, idExpediente);
    } catch (errorLista) {
      console.error('[ERROR] No se pudieron listar los documentos después de guardar uno:', errorLista.message);
    }
    return res.status(201).json({ success: true, message: reemplazo ? 'Documento reemplazado.' : 'Documento recibido.', data });
  } catch (error) {
    registrarSiEsInesperado('subirDocumentoEnLinea', error);
    return responderError(res, error, 'No se pudo subir el documento. Intente de nuevo.');
  }
};

/**
 * Persona del personal de la sesión que todavía no es asociada, o null.
 *
 * @param {{ id_persona: number }} usuario
 * @returns {Promise<number|null>}
 */
const personalSinAfiliar = async (usuario) => {
  const { rows } = await db.query(
    'SELECT p.id_persona FROM personas p WHERE p.id_persona = $1 AND NOT EXISTS (SELECT 1 FROM asociados a WHERE a.id_persona = p.id_persona)',
    [usuario.id_persona]
  );
  return rows[0]?.id_persona ?? null;
};

/**
 * Documentos de afiliación de quien es del personal y se afilia («Afiliarme a la cooperativa»).
 *
 * @async
 * @route GET /api/afiliacion/personal/documentos
 * @param {import('express').Request} req - Sesión del personal.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 `{ documentos, resumen }`; 409 si ya es asociado; 500.
 */
const misDocumentosDePersonal = async (req, res) => {
  try {
    const idPersona = await personalSinAfiliar(req.user);
    if (!idPersona) return res.status(409).json({ success: false, message: 'Ya es asociado: sus documentos están en su portal de asociado.' });
    const idExpediente = await documentos.expedienteDePersona(db, idPersona);
    return res.status(200).json({ success: true, data: await documentosConResumen(idExpediente) });
  } catch (error) {
    console.error('[ERROR] documentosAfiliacionController.misDocumentosDePersonal:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar sus documentos. Intente de nuevo.' });
  }
};

/**
 * Quien es del personal sube uno de sus documentos de afiliación. Lo revisa un colega.
 *
 * @async
 * @route POST /api/afiliacion/personal/documentos
 * @param {import('express').Request} req - `{ tipo_documento, archivo }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 `{ documentos, resumen }`; 400; 409; 413; 500.
 */
const subirMiDocumentoDePersonal = async (req, res) => {
  try {
    const idPersona = await personalSinAfiliar(req.user);
    if (!idPersona) return res.status(409).json({ success: false, message: 'Ya es asociado: suba sus documentos desde su portal de asociado.' });
    const { idExpediente, reemplazo } = await documentos.subirDocumento({
      persona: { idPersona, crearPor: req.user.id_usuario, canalOrigen: 'PERSONAL' },
      tipo: req.body?.tipo_documento,
      archivo: req.body?.archivo,
      canal: 'PERSONAL',
      idUsuario: req.user.id_usuario,
      ip: ipDelCliente(req),
      userAgent: userAgentDe(req),
    });
    return res.status(201).json({
      success: true,
      message: `${reemplazo ? 'Documento reemplazado' : 'Documento recibido'}. Lo revisa un colega.`,
      data: await documentosConResumen(idExpediente, { despuesDeGuardar: true }),
    });
  } catch (error) {
    registrarSiEsInesperado('subirMiDocumentoDePersonal', error);
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
            sinPortal: contacto.sinPortal,
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
      message += contacto.sinPortal
        ? ' No se le pudo avisar por correo: comuníquese con el solicitante para que lleve el documento a la agencia.'
        : ' No se le pudo avisar por correo: verá el motivo al entrar a su portal; si es urgente, comuníquese con el asociado.';
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
  documentosParaAfiliar,
  escanearParaAfiliar,
  documentosDeSolicitud,
  escanearDeSolicitud,
  documentosEnLinea,
  subirDocumentoEnLinea,
  misDocumentosDePersonal,
  subirMiDocumentoDePersonal,
  bandeja,
  historial,
  revisar,
};
