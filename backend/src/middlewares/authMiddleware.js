const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_cooperativa_2026';

/**
 * Middleware para verificar la validez del token JWT en las solicitudes protegidas
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
 * Middleware para verificar roles de usuario autorizados
 * @param  {...string} allowedRoles - Roles permitidos para acceder a la ruta
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
