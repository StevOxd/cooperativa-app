const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const asociadosAdminController = require('../controllers/asociadosAdminController');
const documentosController = require('../controllers/documentosAfiliacionController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { prohibirAutoatencion } = require('../middlewares/segregacion');

// Proteger todas las rutas administrativas de asociados con JWT y rol OPERADOR
router.use(verifyToken);
router.use(checkRole('OPERADOR'));

// Límites por usuario (issues #104 y #110). El padrón trae hasta 100 asociados por página: el tope deja buscar y
// paginar con normalidad (cada búsqueda es una consulta), pero no descargar el padrón completo. El expediente 360° lo
// piden la ficha y la apertura de cuentas, y se vuelve a pedir tras cada revisión de documentos: su tope es mayor.
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
const VENTANA_LIMITE_MS = 15 * 60 * 1000;
const LIMITE_PRUEBAS = 1000;
const MAX_CONSULTAS_PADRON = 60;
const MAX_CONSULTAS_EXPEDIENTE = 120;

const limitePorUsuario = (max, message) => rateLimit({
  windowMs: VENTANA_LIMITE_MS,
  max: isTestOrDev ? LIMITE_PRUEBAS : max,
  keyGenerator: (req) => `usuario:${req.user.id_usuario}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message, error: 'RATE_LIMIT_EXCEEDED' },
});
const padronLimiter = limitePorUsuario(MAX_CONSULTAS_PADRON,
  'Consultó el padrón demasiadas veces seguidas. Espere 15 minutos e intente de nuevo.');
const expedienteLimiter = limitePorUsuario(MAX_CONSULTAS_EXPEDIENTE,
  'Consultó expedientes demasiadas veces seguidas. Espere 15 minutos e intente de nuevo.');

/**
 * @route   GET /api/admin/asociados
 * @desc    Listar padrón de asociados con filtros y paginación (con límite por usuario)
 */
router.get('/', padronLimiter, asociadosAdminController.listarAsociados);

/**
 * @route   GET /api/admin/asociados/:id/expediente
 * @desc    Consultar expediente integral 360° del asociado (cuentas, aportaciones y beneficiarios; con límite por usuario)
 */
router.get('/:id/expediente', expedienteLimiter, asociadosAdminController.getExpedienteAsociado);

/**
 * @route   POST /api/admin/asociados/:id/acceso-portal
 * @desc    Activar el acceso al portal (o reenviarlo si nunca entró) desde el expediente (issue #27)
 */
router.post('/:id/acceso-portal', prohibirAutoatencion('asociado', (req) => req.params.id), asociadosAdminController.activarAccesoPortalAsociado);

/**
 * @route   POST /api/admin/asociados/:id/documentos
 * @desc    Escanear un documento de afiliación en el expediente del asociado (reemplaza el vigente)
 */
router.post('/:id/documentos', prohibirAutoatencion('asociado', (req) => req.params.id), documentosController.subirDocumentoDeAsociado);

/**
 * @route   GET  /api/admin/asociados/documentos-afiliacion?cui_dpi
 * @route   POST /api/admin/asociados/documentos-afiliacion
 * @desc    Documentos escaneados para afiliar a un DPI en ventanilla (obligatorios para enviar el Formulario 1)
 */
router.get('/documentos-afiliacion', prohibirAutoatencion('dpi', (req) => req.query.cui_dpi), documentosController.documentosParaAfiliar);
router.post('/documentos-afiliacion', prohibirAutoatencion('dpi', (req) => req.body?.cui_dpi), documentosController.escanearParaAfiliar);

/**
 * @route   POST /api/admin/asociados/presencial
 * @desc    Formulario 1: Registro presencial de afiliación en ventanilla (Exclusivo OPERADOR)
 */
router.post('/presencial', prohibirAutoatencion('dpi', (req) => req.body?.cui_dpi), asociadosAdminController.crearAfiliacionPresencial);

/**
 * @route   POST /api/admin/asociados/aperturar-cuenta
 * @route   POST /api/admin/asociados/:id/cuentas
 * @desc    Formulario 2: Apertura de cuenta financiera adicional o especializada
 */
router.post('/aperturar-cuenta', prohibirAutoatencion('asociado', (req) => req.body?.id_asociado), asociadosAdminController.aperturarCuenta);
router.post('/:id/cuentas', prohibirAutoatencion('asociado', (req) => req.params.id), asociadosAdminController.aperturarCuenta);
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
router.post('/cuentas/:id_cuenta/beneficiarios', prohibirAutoatencion('cuenta', (req) => req.params.id_cuenta), asociadosAdminController.guardarBeneficiarios);

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
router.patch('/:id/estado', prohibirAutoatencion('asociado', (req) => req.params.id), asociadosAdminController.cambiarEstadoAsociado);

module.exports = router;
