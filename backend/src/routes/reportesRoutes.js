const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Reportes por usuario (no por conexión: va después de verifyToken). Cada uno recorre un período completo.
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
const reportesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isTestOrDev ? 300 : 30,
  keyGenerator: (req) => `usuario:${req.user.id_usuario}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Generó demasiados reportes seguidos. Espere 15 minutos e intente de nuevo.',
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

// Reportes de gestión (issue #85): solo el personal. Qué rol saca cada uno lo decide su definición en
// services/reportesService.js.
router.use(verifyToken, checkRole('ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO'));

// Las respuestas traen datos personales: el navegador no las guarda en su caché (un equipo de agencia es compartido)
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

/**
 * @route GET /api/reportes/:tipo
 * @desc Datos de un reporte con sus totales; queda registrado en reportes_generados.
 * @access Privado (el rol que indique el reporte)
 */
router.get('/:tipo', reportesLimiter, reportesController.generar);

module.exports = router;
