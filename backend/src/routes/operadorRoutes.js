const express = require('express');
const router = express.Router();
const operadorController = require('../controllers/operadorController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Proteger todas las rutas del operador con autenticación JWT y rol exclusivo de OPERADOR
router.use(verifyToken);
router.use(checkRole('OPERADOR'));

/**
 * @route   GET /api/operador/bandeja-solicitudes
 * @desc    Obtener lista de solicitudes pendientes de traslado/apertura
 * @access  Privado (Operador)
 */
router.get('/bandeja-solicitudes', operadorController.getBandejaSolicitudes);

/**
 * @route   POST /api/operador/solicitudes/:id/resolver
 * @desc    Resolver una solicitud (APROBAR o RECHAZAR) con ejecución transaccional
 * @access  Privado (Operador)
 */
router.post('/solicitudes/:id/resolver', operadorController.resolverSolicitud);

module.exports = router;
