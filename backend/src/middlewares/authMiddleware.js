const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar la validez y vigencia del token JWT en solicitudes protegidas.
 * Extrae el token de la cabecera `Authorization: Bearer <token>`, valida su firma criptográfica
 * e inyecta la carga decodificada (`id_persona`, `rol`, `email`, `codigo_corporativo`) en `req.user`.
 *
 * @function verifyToken
 * @param {import('express').Request} req - Objeto de solicitud HTTP de Express.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @param {import('express').NextFunction} next - Función para continuar al siguiente middleware.
 * @returns {void|import('express').Response} Retorna 401 si falta o expiró el token, 403 si es inválido.
 */
const db = require('../config/db');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Acceso denegado. No se proporcionó el token de autenticación.',
    });
  }

  // Se espera el formato: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Formato de token inválido. El formato esperado es: Bearer <token>',
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Validación de Revocación de Sesión y Estado Activo en BD (SEC-08)
    const userId = decoded.id_persona || decoded.id;
    if (userId) {
      const userCheck = await db.query(
        'SELECT estado, sesion_activa_id, bloqueado_hasta, debe_cambiar_password FROM usuarios WHERE id_persona = $1',
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Su sesión no es válida. Inicie sesión de nuevo.',
        });
      }

      const dbUser = userCheck.rows[0];
      if (dbUser.estado !== 'ACTIVO') {
        return res.status(403).json({
          success: false,
          message: 'Su cuenta está inactiva. Comuníquese con el administrador.',
        });
      }

      // Si el token incluye sesion_activa_id, verificar que la sesión siga activa y no haya sido revocada (ej. por logout)
      if (decoded.sesion_activa_id && (!dbUser.sesion_activa_id || dbUser.sesion_activa_id !== decoded.sesion_activa_id)) {
        return res.status(401).json({
          success: false,
          message: 'Su sesión terminó o se abrió en otro dispositivo. Inicie sesión de nuevo.',
          sesion_revocada: true,
        });
      }

      // Restricción por cambio de contraseña obligatorio en primer inicio de sesión
      if (dbUser.debe_cambiar_password) {
        const currentPath = req.originalUrl || req.url || '';
        const isPermittedPath =
          currentPath.includes('/auth/cambiar-password') ||
          currentPath.includes('/auth/me') ||
          currentPath.includes('/auth/logout');

        if (!isPermittedPath) {
          return res.status(403).json({
            success: false,
            debe_cambiar_password: true,
            error: 'CAMBIO_PASSWORD_OBLIGATORIO',
            message: 'Antes de continuar, cambie su contraseña temporal.',
          });
        }
      }

      decoded.debe_cambiar_password = Boolean(dbUser.debe_cambiar_password);
    }

    // Asignar los datos del usuario decodificado a la request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Su sesión venció. Inicie sesión de nuevo.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Su sesión no es válida. Inicie sesión de nuevo.',
    });
  }
};

/**
 * Middleware de Control de Acceso Basado en Roles (RBAC).
 * Verifica que el rol del usuario autenticado coincida con al menos uno de los roles permitidos.
 *
 * @function checkRole
 * @param {...('ADMINISTRADOR'|'OPERADOR'|'ASOCIADO')} allowedRoles - Lista de roles con permiso de acceso.
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): void} Middleware de Express.
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.rol) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Información de rol no disponible.',
      });
    }

    if (allowedRoles.includes(req.user.rol)) {
      return next();
    }

    const message =
      allowedRoles.length === 1 && allowedRoles[0] === 'ADMINISTRADOR'
        ? 'Acceso denegado: Se requieren permisos de Administrador'
        : `Acceso denegado: Se requieren permisos de ${allowedRoles.join(', ')}`;

    return res.status(403).json({
      success: false,
      message,
    });
  };
};

module.exports = {
  verifyToken,
  checkRole,
};
