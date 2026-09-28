const express = require('express');
const router = express.Router();
const asociadosAdminController = require('../controllers/asociadosAdminController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Proteger todas las rutas administrativas de asociados con JWT y rol OPERADOR
router.use(verifyToken);
router.use(checkRole('OPERADOR'));

/**
 * @route   GET /api/admin/asociados
 * @desc    Listar padrón de asociados con filtros y paginación
 */
router.get('/', asociadosAdminController.listarAsociados);

/**
 * @route   GET /api/admin/asociados/:id/expediente
 * @desc    Consultar expediente integral 360° del asociado (cuentas, aportaciones y beneficiarios)
 */
router.get('/:id/expediente', asociadosAdminController.getExpedienteAsociado);

/**
 * @route   POST /api/admin/asociados/presencial
 * @desc    Formulario 1: Registro presencial de afiliación en ventanilla (Exclusivo OPERADOR)
 */
router.post('/presencial', checkRole('OPERADOR'), asociadosAdminController.crearAfiliacionPresencial);

/**
 * @route   POST /api/admin/asociados/aperturar-cuenta
 * @route   POST /api/admin/asociados/:id/cuentas
 * @desc    Formulario 2: Apertura de cuenta financiera adicional o especializada
 */
router.post('/aperturar-cuenta', asociadosAdminController.aperturarCuenta);
router.post('/:id/cuentas', asociadosAdminController.aperturarCuenta);
router.post('/:id/enviar-boleta-apertura', asociadosAdminController.enviarBoletaApertura);

/**
 * @route   GET /api/admin/asociados/cuentas/:id_cuenta/beneficiarios
 * @desc    Formulario 3: Obtener lista de beneficiarios de una cuenta
 */
router.get('/cuentas/:id_cuenta/beneficiarios', asociadosAdminController.getBeneficiarios);

/**
 * @route   POST /api/admin/asociados/cuentas/:id_cuenta/beneficiarios
 * @desc    Formulario 3: Registrar / actualizar beneficiarios con validación estricta al 100.00%
 */
router.post('/cuentas/:id_cuenta/beneficiarios', asociadosAdminController.guardarBeneficiarios);

/**
 * @route   GET /api/admin/asociados/beneficiarios/historial
 * @route   GET /api/admin/asociados/cuentas/:id_cuenta/beneficiarios/historial
 * @desc    Consultar el registro de auditoría de modificaciones de beneficiarios
 */
router.get('/beneficiarios/historial', asociadosAdminController.getHistorialBeneficiarios);
router.get('/cuentas/:id_cuenta/beneficiarios/historial', asociadosAdminController.getHistorialBeneficiarios);

/**
 * @route   PATCH /api/admin/asociados/:id/estado
 * @desc    Cambiar estado institucional del asociado (ACTIVO, INACTIVO, SUSPENDIDO)
 */
router.patch('/:id/estado', asociadosAdminController.cambiarEstadoAsociado);

module.exports = router;
