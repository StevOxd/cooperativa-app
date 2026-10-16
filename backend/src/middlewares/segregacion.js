const { esAutoatencion, TIPOS, TIPOS_POR_ID } = require('../services/segregacionService');

/** Respuesta cuando alguien del personal intenta atender un trámite propio (issue #32). */
const RESPUESTA_AUTOATENCION = {
  success: false,
  error: 'AUTOATENCION_NO_PERMITIDA',
  message: 'Este trámite es suyo. Pídale a un colega que lo atienda.',
};

/**
 * Middleware que responde 403 `AUTOATENCION_NO_PERMITIDA` si el recurso de la petición es de la misma
 * persona que atiende. Va después de `verifyToken`.
 *
 * Falla cerrado: si llega un identificador que no es un id válido, responde 400 en lugar de dejar pasar
 * (la base de datos podría interpretarlo como el mismo número).
 *
 * @param {string} tipo - Tipo de recurso (ver `segregacionService.TIPOS`).
 * @param {(req: import('express').Request) => (string|number|undefined)} obtenerValor - Saca el
 *   identificador de la petición (por ejemplo `(req) => req.params.id`).
 * @returns {import('express').RequestHandler}
 * @throws {Error} al definir la ruta, si el tipo es desconocido.
 */
const prohibirAutoatencion = (tipo, obtenerValor) => {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de recurso desconocido para segregación: ${tipo}`);
  const porId = TIPOS_POR_ID.includes(tipo);

  return async (req, res, next) => {
    try {
      const valor = obtenerValor(req);
      const presente = valor !== undefined && valor !== null && String(valor).trim() !== '';
      if (porId && presente && !/^\d{1,9}$/.test(String(valor).trim())) {
        return res.status(400).json({ success: false, message: 'El identificador no es válido.' });
      }
      if (await esAutoatencion(req.user, tipo, valor)) {
        return res.status(403).json(RESPUESTA_AUTOATENCION);
      }
      return next();
    } catch (error) {
      console.error('[ERROR] No se pudo verificar la segregación de funciones:', error.message);
      return res.status(500).json({ success: false, message: 'No se pudo completar la operación. Intente de nuevo.' });
    }
  };
};

module.exports = { prohibirAutoatencion, RESPUESTA_AUTOATENCION };
