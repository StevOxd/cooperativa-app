const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { validarSesion } = require('../services/sesionService');
const { SUBCARPETA: SUBCARPETA_DOCUMENTOS, rutaDocumento, mimeDeDocumento } = require('../utils/documentoArchivo');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');
const { UPLOADS_ROOT } = require('../utils/fileStorage');

const ROLES_PERSONAL = ['ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO'];
// Carpeta de los PDF de crédito; cualquier otra da 404. Así la carpeta de documentos escrita con otras mayúsculas
// (el disco del host puede no distinguirlas) no entra por aquí sin sus controles.
const CARPETA_CREDITOS = 'creditos';
// A quien no puede ver un documento se le responde igual que si no existiera: así no se sabe qué archivos hay
const NO_EXISTE = { success: false, message: 'El documento no existe.' };

/**
 * Entrega un documento de afiliación (DPI, recibo, foto con el DPI, constancia). Primero se busca en la base: sin
 * registro no se mira el disco. El personal los abre todos y un asociado solo los suyos; a cualquier otro se le
 * responde como si no existiera. Cada apertura queda en `accesos_documento`; si no se puede registrar, no se entrega.
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ id_usuario: number, id_persona: number, rol: string }} usuario - El de la sesión vigente.
 * @param {string} archivo - Nombre ya saneado (`path.basename`).
 * @returns {Promise<void>} El archivo, sin caché; 404 si no existe o no es suyo; 500.
 */
const servirDocumentoAfiliacion = async (req, res, usuario, archivo) => {
  try {
    const documento = (await db.query(
      `SELECT d.id_documento, d.tipo_documento, e.id_persona,
              (e.id_persona IS NULL AND e.id_solicitud IS NULL) AS carga_previa
       FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE d.archivo = $1`,
      [archivo]
    )).rows[0];
    const esDueno = usuario.rol === 'ASOCIADO' && Number(documento?.id_persona) === Number(usuario.id_persona);
    // Una carga previa (afiliación que todavía no se completa) no se abre: se revisa al afiliar, y si no se completa se
    // borra a los 30 días, lo que un registro de apertura impediría
    if (!documento || documento.carga_previa || (!ROLES_PERSONAL.includes(usuario.rol) && !esDueno)) {
      return res.status(404).json(NO_EXISTE);
    }
    // Solo se registra una apertura que se puede entregar
    const existe = await fs.promises.access(rutaDocumento(archivo)).then(() => true, () => false);
    if (!existe) {
      return res.status(404).json(NO_EXISTE);
    }
    await db.query(
      'INSERT INTO accesos_documento (id_documento, id_usuario, ip_origen, user_agent) VALUES ($1, $2, $3, $4)',
      [documento.id_documento, usuario.id_usuario, ipDelCliente(req), userAgentDe(req)]
    );

    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${documento.tipo_documento}${path.extname(archivo)}"`,
    });
    res.type(mimeDeDocumento(archivo));
    return res.sendFile(rutaDocumento(archivo), { cacheControl: false }, (error) => {
      if (!error) return;
      if (error.code !== 'ENOENT') console.error('[ERROR] No se pudo enviar el documento:', error.message);
      if (!res.headersSent) {
        res.status(error.code === 'ENOENT' ? 404 : 500).json({ success: false, message: 'No se pudo abrir el documento.' });
      }
    });
  } catch (error) {
    console.error('[ERROR] No se pudo entregar el documento de afiliación:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo abrir el documento. Intente de nuevo.' });
  }
};

/**
 * Entrega el PDF firmado de una solicitud de crédito. Primero se busca la solicitud que lo tiene: sin ella no se mira
 * el disco. El personal los abre todos y un asociado solo los de sus solicitudes; para cualquier otro, la respuesta es
 * la misma que si no existiera, así no se sabe qué archivos hay.
 *
 * @async
 * @param {import('express').Response} res
 * @param {{ id_persona: number, rol: string }} usuario - El de la sesión vigente.
 * @param {string} archivo - Nombre ya saneado (`path.basename`).
 * @returns {Promise<void>} El archivo, sin caché; 404 si no existe o no es suyo; 500.
 */
const servirPdfDeCredito = async (res, usuario, archivo) => {
  try {
    const url = `/api/uploads/${CARPETA_CREDITOS}/${archivo}`;
    const solicitud = (await db.query(
      `SELECT a.id_persona
       FROM solicitudes_credito sc JOIN asociados a ON a.id_asociado = sc.id_asociado
       WHERE sc.documento_firmado_url = $1
       LIMIT 1`,
      [url]
    )).rows[0];
    const esDueno = usuario.rol === 'ASOCIADO' && Number(solicitud?.id_persona) === Number(usuario.id_persona);
    if (!solicitud || (!ROLES_PERSONAL.includes(usuario.rol) && !esDueno)) {
      return res.status(404).json(NO_EXISTE);
    }
    const ruta = path.join(UPLOADS_ROOT, CARPETA_CREDITOS, archivo);
    const existe = await fs.promises.access(ruta).then(() => true, () => false);
    if (!existe) {
      return res.status(404).json(NO_EXISTE);
    }

    res.set('Cache-Control', 'private, no-store');
    return res.sendFile(ruta, { cacheControl: false }, (error) => {
      if (!error) return;
      if (error.code !== 'ENOENT') console.error('[ERROR] No se pudo enviar el documento de crédito:', error.message);
      if (!res.headersSent) {
        res.status(error.code === 'ENOENT' ? 404 : 500).json({ success: false, message: 'No se pudo abrir el documento.' });
      }
    });
  } catch (error) {
    console.error('[ERROR] No se pudo entregar el documento de crédito:', error.message);
    return res.status(500).json({ success: false, message: 'No se pudo abrir el documento. Intente de nuevo.' });
  }
};

/**
 * Manejador seguro para servir archivos y contratos PDF subidos (SEC-02).
 * Reemplaza express.static público verificando el token JWT de la cabecera y aplicando reglas estrictas de
 * autorización por rol y pertenencia (RBAC).
 *
 * El token tiene que ser el de la sesión vigente del usuario (`sesionService.validarSesion`), sin cambio de
 * contraseña pendiente. El rol y la persona salen de la base de datos: el personal ve todos los documentos y
 * un asociado solo los de sus solicitudes de crédito y sus documentos de afiliación.
 *
 * @async
 * @route GET /api/uploads/:subfolder/:filename
 * @param {import('express').Request} req - Token solo en `Authorization: Bearer`: en la URL quedaría en los
 *   registros del servidor, el historial y el `Referer`. El frontend pide los documentos como blob.
 * @param {import('express').Response} res
 * @returns {Promise<void>} El archivo; 401 sin sesión vigente; 403 si el usuario está inactivo o tiene un cambio
 *   de contraseña pendiente; 404 si no existe o no es suyo; 500.
 */
const secureUploadsHandler = async (req, res) => {
  const subfolder = req.params.subfolder || '';
  const filename = req.params.filename || '';

  // 1. Sanitizar contra Path Traversal (CWE-22)
  const sanitizedSubfolder = path.basename(subfolder);
  const sanitizedFilename = path.basename(filename);

  const esDocumentoAfiliacion = sanitizedSubfolder.toLowerCase() === SUBCARPETA_DOCUMENTOS;
  const nombreInvalido = !sanitizedFilename || sanitizedFilename === '.' || sanitizedFilename === '..';
  if (nombreInvalido || (!esDocumentoAfiliacion && sanitizedSubfolder !== CARPETA_CREDITOS)) {
    return res.status(404).json(NO_EXISTE);
  }

  // 2. Token de la cabecera 'Authorization: Bearer <token>' (nunca de la URL)
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Inicie sesión para ver este documento.',
    });
  }

  // 3. Validar el token y que sea la sesión vigente de un usuario activo (las mismas reglas que verifyToken)
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Su sesión venció. Inicie sesión de nuevo.',
    });
  }
  let sesion;
  try {
    sesion = await validarSesion(user);
  } catch (err) {
    console.error('[ERROR] No se pudo validar la sesión para la descarga:', err.message);
    return res.status(500).json({ success: false, message: 'No se pudo abrir el documento. Intente de nuevo.' });
  }
  if (!sesion.valida) {
    return res.status(sesion.status).json({ success: false, message: sesion.message });
  }
  // Con la contraseña temporal pendiente de cambio no se descarga nada (igual que en verifyToken)
  if (sesion.usuario.debe_cambiar_password) {
    return res.status(403).json({
      success: false,
      debe_cambiar_password: true,
      message: 'Antes de continuar, cambie su contraseña temporal.',
    });
  }

  if (esDocumentoAfiliacion) {
    return servirDocumentoAfiliacion(req, res, { ...sesion.usuario, id_usuario: sesion.idUsuario }, sanitizedFilename);
  }
  // El rol y la persona se toman de la base de datos, no del token
  return servirPdfDeCredito(res, sesion.usuario, sanitizedFilename);
};

module.exports = { secureUploadsHandler };
