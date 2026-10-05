/**
 * Middleware de Autenticación Inter-servicio para el Core Bancario
 * Valida la cabecera 'x-banco-api-key' contra process.env.BANCO_INTERNAL_API_KEY
 * Protege los endpoints bancarios corporativos contra invocaciones no autorizadas (SEC-01).
 */

const requireServiceAuth = (req, res, next) => {
  const apiKey = req.headers['x-banco-api-key'];
  // Sin valor por defecto: server.js no arranca si falta BANCO_INTERNAL_API_KEY.
  const expectedKey = process.env.BANCO_INTERNAL_API_KEY;

  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: '[SECURITY ERROR] Acceso denegado al Core Bancario: API Key inter-servicio inválida o ausente.',
      error: 'UNAUTHORIZED_SERVICE_CALL',
    });
  }

  next();
};

module.exports = {
  requireServiceAuth,
};
