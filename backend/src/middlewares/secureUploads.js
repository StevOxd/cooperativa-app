const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Manejador seguro para servir archivos y contratos PDF subidos (SEC-02).
 * Reemplaza express.static público verificando token JWT (cabecera o query param)
 * y aplicando reglas estrictas de autorización por rol y pertenencia (RBAC).
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
      message: '[SECURITY ERROR] Acceso denegado: Se requiere autenticación para consultar expedientes y documentos.',
    });
  }

  // 3. Validar token criptográficamente
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: '[SECURITY ERROR] Token de autenticación inválido o expirado.',
    });
  }

  // 4. Ubicar archivo en disco
  const filePath = sanitizedSubfolder
    ? path.join(__dirname, '../../uploads', sanitizedSubfolder, sanitizedFilename)
    : path.join(__dirname, '../../uploads', sanitizedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'El documento bancario solicitado no existe.',
    });
  }

  // 5. Autorización basada en Roles (RBAC) y Pertenencia
  const rol = user.rol;
  const idPersona = user.id_persona || user.id;

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
           AND (sc.documento_firmado_url LIKE $2 OR sc.archivo_solicitud_firmada = $3)
         LIMIT 1`,
        [idPersona, `%${sanitizedFilename}%`, sanitizedFilename]
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
    message: '[SECURITY ERROR] Acceso no autorizado: No tiene privilegios para visualizar este expediente bancario.',
  });
};

module.exports = { secureUploadsHandler };
