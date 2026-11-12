const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { limitePorUsuario } = require('../middlewares/limitePorUsuario');

// Reportes por usuario (no por conexión: va después de verifyToken). Cada uno recorre un período completo.
const MAX_REPORTES = 30;
const MAX_REPORTES_PRUEBAS = 300;
const reportesLimiter = limitePorUsuario({
  max: MAX_REPORTES,
  maxPruebas: MAX_REPORTES_PRUEBAS,
  mensaje: 'Generó demasiados reportes seguidos. Espere 15 minutos e intente de nuevo.',
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
