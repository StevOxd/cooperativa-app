const rateLimit = require('express-rate-limit');

// Ventana de todos los límites por usuario
const VENTANA_LIMITE_MS = 15 * 60 * 1000;

/**
 * Crea un límite de peticiones por usuario en una ventana de 15 minutos (issue #121). La llave es el usuario de la
 * sesión, no la conexión: se monta después de `verifyToken`.
 *
 * En pruebas y desarrollo (`NODE_ENV` test o development) rige `maxPruebas`, para que las suites no choquen con el tope.
 *
 * @param {object} opciones
 * @param {number} opciones.max - Peticiones permitidas por usuario en la ventana.
 * @param {number} opciones.maxPruebas - Peticiones permitidas en pruebas y desarrollo.
 * @param {string} opciones.mensaje - Mensaje que recibe el usuario al pasar el límite (HTTP 429).
 * @returns {import('express').RequestHandler}
 */
const limitePorUsuario = ({ max, maxPruebas, mensaje }) => {
  const esPruebaODesarrollo = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  return rateLimit({
    windowMs: VENTANA_LIMITE_MS,
    max: esPruebaODesarrollo ? maxPruebas : max,
    keyGenerator: (req) => `usuario:${req.user.id_usuario}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: mensaje, error: 'RATE_LIMIT_EXCEEDED' },
  });
};

module.exports = { limitePorUsuario };
