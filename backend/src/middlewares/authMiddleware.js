const jwt = require('jsonwebtoken');
const { validarSesion } = require('../services/sesionService');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar la validez y vigencia del token JWT en solicitudes protegidas.
 * Extrae el token de la cabecera `Authorization: Bearer <token>`, valida su firma criptográfica
 * e inyecta la carga decodificada (`id_usuario`, `id_persona`, `rol`, `email`, `codigo_corporativo`) en `req.user`.
 *
 * `req.user.id_usuario` identifica al usuario (sesión, auditoría) y `req.user.id_persona` a la persona
 * (sus datos, su afiliación). Desde el issue #32 una persona puede tener dos usuarios, así que no son
 * intercambiables. `id_persona` se toma de la base de datos, no del token.
 *
 * @function verifyToken
 * @param {import('express').Request} req - Objeto de solicitud HTTP de Express.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @param {import('express').NextFunction} next - Función para continuar al siguiente middleware.
 * @returns {void|import('express').Response} Retorna 401 si falta el token, venció, no es de sesión o la sesión ya
 *   no es la vigente; 403 si el usuario está inactivo o la firma es inválida.
 */
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

    // Sesión vigente: token de sesión (no de un paso concreto), usuario ACTIVO y sesion_activa_id
    // igual a la de la base de datos (SEC-08). Las mismas reglas se aplican a los WebSockets.
    const sesion = await validarSesion(decoded);
    if (!sesion.valida) {
      return res.status(sesion.status).json({
        success: false,
        message: sesion.message,
        ...(sesion.sesionRevocada && { sesion_revocada: true }),
      });
    }
    const { idUsuario, usuario: dbUser } = sesion;

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

    decoded.id = idUsuario;
    decoded.id_usuario = idUsuario;
    decoded.id_persona = dbUser.id_persona;
    decoded.debe_cambiar_password = Boolean(dbUser.debe_cambiar_password);

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
