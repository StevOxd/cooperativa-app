const express = require('express');
const router = express.Router();
const asociadoController = require('../controllers/asociadoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Proteger todas las rutas del portal de asociado con autenticación JWT y rol exclusivo de ASOCIADO
router.use(verifyToken);
router.use(checkRole('ASOCIADO'));

/**
 * @route   GET /api/asociado/perfil
 * @desc    Obtener perfil del asociado autenticado
 * @access  Privado
 */
router.get('/perfil', asociadoController.getPerfil);

/**
 * @route   GET /api/asociado/cuentas
 * @desc    Obtener lista de cuentas activas del asociado
 * @access  Privado
 */
router.get('/cuentas', asociadoController.getCuentas);

/**
 * @route   GET /api/asociado/cuentas/:id_cuenta/transacciones
 * @desc    Obtener historial de movimientos de una cuenta verificando pertenencia
 * @access  Privado
 */
router.get('/cuentas/:id_cuenta/transacciones', asociadoController.getTransacciones);

/**
 * @route   GET /api/asociado/creditos
 * @desc    Listar solicitudes de crédito del asociado
 * @access  Privado
 */
router.get('/creditos', asociadoController.getCreditos);

/**
 * @route   POST /api/asociado/creditos
 * @desc    Crear una nueva solicitud de crédito
 * @access  Privado
 */
router.post('/creditos', asociadoController.createCredito);

/**
 * @route   GET /api/asociado/cuenta-planilla
 * @desc    Obtener cuenta de planilla y saldo del asociado
 * @access  Privado
 */
router.get('/cuenta-planilla', asociadoController.getCuentaPlanilla);

/**
 * @route   GET /api/asociado/mis-cuentas-destino
 * @desc    Obtener cuentas destino del asociado y opciones para apertura
 * @access  Privado
 */
router.get('/mis-cuentas-destino', asociadoController.getMisCuentasDestino);

/**
 * @route   POST /api/asociado/solicitudes-traslado
 * @desc    Crear solicitud de traslado o apertura y traslado
 * @access  Privado
 */
router.post('/solicitudes-traslado', asociadoController.createSolicitudTraslado);

/**
 * @route   GET /api/asociado/mis-solicitudes
 * @desc    Listar solicitudes de traslado y apertura enviadas por el asociado
 * @access  Privado
 */
router.get('/mis-solicitudes', asociadoController.getMisSolicitudesTraslado);

module.exports = router;
