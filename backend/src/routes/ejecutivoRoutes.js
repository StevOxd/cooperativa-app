const express = require('express');
const router = express.Router();
const ejecutivoController = require('../controllers/ejecutivoController');
const operadorController = require('../controllers/operadorController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Proteger todas las rutas del ejecutivo con autenticación JWT y rol EJECUTIVO o ADMINISTRADOR
router.use(verifyToken);
router.use(checkRole('EJECUTIVO', 'ADMINISTRADOR'));

/**
 * @route   GET /api/ejecutivo/creditos
 * @desc    Obtener lista de solicitudes de crédito para autorización ejecutiva
 * @access  Privado (Ejecutivo / Administrador)
 */
router.get('/creditos', ejecutivoController.getBandejaCreditos);

/**
 * @route   POST /api/ejecutivo/creditos/:id/resolver
 * @desc    Resolver una solicitud de crédito: ACEPTAR, DEVOLVER o DENEGAR
 * @access  Privado (Ejecutivo / Administrador)
 */
router.post('/creditos/:id/resolver', ejecutivoController.resolverSolicitudCredito);

/**
 * @route   GET /api/ejecutivo/creditos/:id/evaluacion
 * @desc    Obtener evaluación crediticia y scoring de la solicitud
 * @access  Privado (Ejecutivo / Administrador)
 */
router.get('/creditos/:id/evaluacion', operadorController.getEvaluacionCredito);

module.exports = router;
