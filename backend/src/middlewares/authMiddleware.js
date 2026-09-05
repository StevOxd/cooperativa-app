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
const verifyToken = (req, res, next) => {
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
    // Asignar los datos del usuario decodificado (id, rol, nombre) a la request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'El token de autenticación ha expirado. Por favor inicie sesión nuevamente.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Token de autenticación inválido.',
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

    if (!allowedRoles.includes(req.user.rol)) {
      const message =
        allowedRoles.length === 1 && allowedRoles[0] === 'ADMINISTRADOR'
          ? 'Acceso denegado: Se requieren permisos de Administrador'
          : `Acceso denegado: Se requieren permisos de ${allowedRoles.join(', ')}`;

      return res.status(403).json({
        success: false,
        message,
      });
    }

    next();
  };
};

module.exports = {
  verifyToken,
  checkRole,
};
