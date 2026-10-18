const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { validarSesion } = require('../services/sesionService');
const { SUBCARPETA: SUBCARPETA_DOCUMENTOS, rutaDocumento, mimeDeDocumento } = require('../utils/documentoArchivo');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');

const ROLES_PERSONAL = ['ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO'];
// Carpetas de la ruta anterior (PDF de crédito); cualquier otra da 404. Así la carpeta de documentos escrita con
// otras mayúsculas (el disco del host puede no distinguirlas) no entra por aquí sin sus controles.
const CARPETAS_ANTERIORES = ['', 'creditos'];

/**
 * Entrega un documento de afiliación (DPI, recibo, foto con el DPI, constancia). Primero se busca en la base: sin
 * registro no se mira el disco. El personal los abre todos y un asociado solo los suyos. Cada apertura queda en
 * `accesos_documento`; si no se puede registrar, no se entrega.
 *
 * @async
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ id_usuario: number, id_persona: number, rol: string }} usuario - El de la sesión vigente.
 * @param {string} archivo - Nombre ya saneado (`path.basename`).
 * @returns {Promise<void>} El archivo, sin caché; 403 si no es suyo; 404 si no existe; 500.
 */
const servirDocumentoAfiliacion = async (req, res, usuario, archivo) => {
  try {
    const documento = (await db.query(
      `SELECT d.id_documento, d.tipo_documento, e.id_persona
       FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE d.archivo = $1`,
      [archivo]
    )).rows[0];
    if (!documento) {
      return res.status(404).json({ success: false, message: 'El documento no existe.' });
    }
    const esDueno = usuario.rol === 'ASOCIADO' && Number(documento.id_persona) === Number(usuario.id_persona);
    if (!ROLES_PERSONAL.includes(usuario.rol) && !esDueno) {
      return res.status(403).json({ success: false, message: 'No tiene permiso para ver este documento.' });
    }
    // Solo se registra una apertura que se puede entregar
    const existe = await fs.promises.access(rutaDocumento(archivo)).then(() => true, () => false);
    if (!existe) {
      return res.status(404).json({ success: false, message: 'El documento no existe.' });
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
 * Manejador seguro para servir archivos y contratos PDF subidos (SEC-02).
 * Reemplaza express.static público verificando token JWT (cabecera o query param)
 * y aplicando reglas estrictas de autorización por rol y pertenencia (RBAC).
 *
 * El token tiene que ser el de la sesión vigente del usuario (`sesionService.validarSesion`), sin cambio de
 * contraseña pendiente. El rol y la persona salen de la base de datos: el personal ve todos los documentos y
 * un asociado solo los de sus solicitudes de crédito y sus documentos de afiliación.
 *
 * @async
 * @route GET /api/uploads/:subfolder/:filename
 * @param {import('express').Request} req - Token en `Authorization: Bearer` o en `?token=`. Los documentos de
 *   afiliación solo aceptan la cabecera (el frontend los pide como blob), para que el token no quede en una URL.
 * @param {import('express').Response} res
 * @returns {Promise<void>} El archivo; 401 sin sesión vigente; 403 si el usuario está inactivo, tiene un cambio
 *   de contraseña pendiente o el documento no es suyo; 404 si no existe; 500.
 */
const secureUploadsHandler = async (req, res) => {
  const subfolder = req.params.subfolder || '';
  const filename = req.params.filename || '';

  // 1. Sanitizar contra Path Traversal (CWE-22)
  const sanitizedSubfolder = path.basename(subfolder);
  const sanitizedFilename = path.basename(filename);

  const esDocumentoAfiliacion = sanitizedSubfolder.toLowerCase() === SUBCARPETA_DOCUMENTOS;
  if (!esDocumentoAfiliacion && !CARPETAS_ANTERIORES.includes(sanitizedSubfolder)) {
    return res.status(404).json({ success: false, message: 'El documento no existe.' });
  }

  // 2. Extraer token de cabecera 'Authorization: Bearer <token>' o parámetro '?token=<jwt>'
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token && !esDocumentoAfiliacion) {
    token = req.query.token;
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

  // 4. Ubicar archivo en disco
  const filePath = sanitizedSubfolder
    ? path.join(__dirname, '../../uploads', sanitizedSubfolder, sanitizedFilename)
    : path.join(__dirname, '../../uploads', sanitizedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'El documento no existe.',
    });
  }

  // 5. Autorización basada en Roles (RBAC) y Pertenencia
  // El rol y la persona se toman de la base de datos, no del token
  const rol = sesion.usuario.rol;
  const idPersona = sesion.usuario.id_persona;

  // Personal operativo, administrativo y de crédito tiene acceso general de revisión
  if (ROLES_PERSONAL.includes(rol)) {
    return res.sendFile(filePath);
  }

  // Si es ASOCIADO, verificar que el documento pertenezca estrictamente a sus solicitudes
  if (rol === 'ASOCIADO') {
    try {
      const ownershipCheck = await db.query(
        `SELECT sc.id_solicitud_credito 
         FROM solicitudes_credito sc
         JOIN asociados a ON sc.id_asociado = a.id_asociado
         WHERE a.id_persona = $1 
           -- El archivo pedido es exactamente el guardado en su solicitud (último tramo de la ruta)
           AND regexp_replace(sc.documento_firmado_url, '^.*/', '') = $2
         LIMIT 1`,
        [idPersona, sanitizedFilename]
      );

      if (ownershipCheck.rows.length > 0) {
        return res.sendFile(filePath);
      }
    } catch (dbErr) {
      console.error('[SECURITY ERROR] Error al validar propiedad de documento:', dbErr.message);
    }
  }

  return res.status(403).json({
    success: false,
    message: 'No tiene permiso para ver este documento.',
  });
};

module.exports = { secureUploadsHandler };
