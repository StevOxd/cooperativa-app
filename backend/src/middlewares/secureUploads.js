const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { validarSesion } = require('../services/sesionService');

/**
 * Manejador seguro para servir archivos y contratos PDF subidos (SEC-02).
 * Reemplaza express.static público verificando token JWT (cabecera o query param)
 * y aplicando reglas estrictas de autorización por rol y pertenencia (RBAC).
 *
 * El token tiene que ser el de la sesión vigente del usuario (`sesionService.validarSesion`), sin cambio de
 * contraseña pendiente. El rol y la persona salen de la base de datos: el personal ve todos los documentos y
 * un asociado solo los de sus solicitudes de crédito.
 *
 * @async
 * @route GET /api/uploads/:subfolder/:filename
 * @param {import('express').Request} req - Token en `Authorization: Bearer` o en `?token=`.
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

  // 2. Extraer token de cabecera 'Authorization: Bearer <token>' o parámetro '?token=<jwt>'
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
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
  if (['ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO'].includes(rol)) {
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
