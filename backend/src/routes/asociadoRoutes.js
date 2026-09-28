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

router.post('/creditos', asociadoController.createCredito);

/**
 * @route   POST /api/asociado/creditos/iniciar
 * @desc    Paso 1: Configurar y registrar solicitud de crédito en estado PENDIENTE_FIRMA
 * @access  Privado
 */
router.post('/creditos/iniciar', asociadoController.iniciarCredito);

/**
 * @route   POST /api/asociado/creditos/:id/subir-expediente-firmado
 * @desc    Paso 2: Subir PDF firmado para el Folio exacto y elevar a EN_REVISION_OPERADOR
 * @access  Privado
 */
router.post('/creditos/:id/subir-expediente-firmado', asociadoController.subirExpedienteFirmado);

/**
 * @route   POST /api/asociado/creditos/:id/cancelar
 * @desc    Cancelar voluntariamente una solicitud de crédito en trámite
 * @access  Privado
 */
router.post('/creditos/:id/cancelar', asociadoController.cancelarCredito);

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

/**
 * @route   GET /api/asociado/cuentas-acreditacion
 * @desc    Obtener cuentas activas (Ahorro/Monetaria) donde se puede acreditar el desembolso
 * @access  Privado
 */
router.get('/cuentas-acreditacion', asociadoController.getCuentasAcreditacionCredito);

/**
 * @route   GET /api/asociado/capacidad-crediticia
 * @desc    Obtener capacidad crediticia, scoring y deudas activas del asociado
 * @access  Privado
 */
router.get('/capacidad-crediticia', asociadoController.getCapacidadCrediticia);

/**
 * @route   GET /api/asociado/beneficiarios
 * @desc    Consultar cuentas y beneficiarios asignados del asociado autenticado
 * @access  Privado (ASOCIADO)
 */
router.get('/beneficiarios', asociadoController.getMisBeneficiarios);

/**
 * @route   POST /api/asociado/cuentas/:id_cuenta/beneficiarios
 * @desc    Actualizar declaración de beneficiarios con validación estricta al 100.00%
 * @access  Privado (ASOCIADO)
 */
router.post('/cuentas/:id_cuenta/beneficiarios', asociadoController.guardarMisBeneficiarios);

module.exports = router;

