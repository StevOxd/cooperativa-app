const express = require('express');
const router = express.Router();
const operadorController = require('../controllers/operadorController');
const documentosController = require('../controllers/documentosAfiliacionController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { prohibirAutoatencion } = require('../middlewares/segregacion');

// Proteger todas las rutas del operador con autenticación JWT y rol de OPERADOR o ADMINISTRADOR
router.use(verifyToken);
router.use(checkRole('OPERADOR', 'ADMINISTRADOR'));

/**
 * @route   GET /api/operador/correo-estado
 * @desc    Si el correo de la cooperativa funciona (para ofrecer o no el acceso al portal al afiliar)
 */
router.get('/correo-estado', operadorController.getEstadoCorreo);

/**
 * @route   GET /api/operador/bandeja-solicitudes
 * @desc    Obtener lista de solicitudes pendientes de traslado/apertura
 * @access  Privado (Operador)
 */
router.get('/bandeja-solicitudes', operadorController.getBandejaSolicitudes);

/**
 * @route   GET /api/operador/traslados/historial
 * @desc    Consultar historial de solicitudes de traslado y aperturas con filtros y buscador por asociado
 * @access  Privado (Operador)
 */
router.get('/traslados/historial', operadorController.getHistorialTraslados);

/**
 * @route   POST /api/operador/solicitudes/:id/resolver
 * @desc    Resolver una solicitud (APROBAR o RECHAZAR) con ejecución transaccional
 * @access  Privado (Operador)
 */
router.post('/solicitudes/:id/resolver', prohibirAutoatencion('solicitudTraslado', (req) => req.params.id), operadorController.resolverSolicitud);

/**
 * @route   GET /api/operador/afiliaciones
 * @desc    Obtener lista de solicitudes de afiliación en agencia (Nuevos Asociados)
 * @access  Privado (Operador)
 */
router.get('/afiliaciones', operadorController.getBandejaAfiliaciones);

/**
 * @route   POST /api/operador/afiliaciones/:id/bloquear
 * @desc    Bloquear un caso para atención exclusiva por el operador
 * @access  Privado (Operador)
 */
router.post('/afiliaciones/:id/bloquear', prohibirAutoatencion('solicitudAfiliacion', (req) => req.params.id), operadorController.bloquearCasoAfiliacion);

/**
 * @route   POST /api/operador/afiliaciones/:id/liberar
 * @desc    Liberar bloqueo de un caso de afiliación
 * @access  Privado (Operador)
 */
router.post('/afiliaciones/:id/liberar', operadorController.liberarCasoAfiliacion);

/**
 * @route   POST /api/operador/afiliaciones/:id/formalizar
 * @desc    Formalizar la afiliación en ventanilla creando el asociado, cuenta y credenciales
 * @access  Privado (Operador)
 */
// Se revisa el DPI de la solicitud y también el que llega corregido en el formulario
router.post(
  '/afiliaciones/:id/formalizar',
  prohibirAutoatencion('solicitudAfiliacion', (req) => req.params.id),
  prohibirAutoatencion('dpi', (req) => req.body?.cui_dpi),
  operadorController.formalizarAfiliacion
);

/**
 * @route   GET  /api/operador/afiliaciones/:id/documentos
 * @route   POST /api/operador/afiliaciones/:id/documentos
 * @desc    Documentos de una solicitud de agencia: los obligatorios se exigen para formalizarla
 * @access  Privado (solo OPERADOR)
 */
router.get(
  '/afiliaciones/:id/documentos',
  checkRole('OPERADOR'),
  prohibirAutoatencion('solicitudAfiliacion', (req) => req.params.id),
  documentosController.documentosDeSolicitud
);
router.post(
  '/afiliaciones/:id/documentos',
  checkRole('OPERADOR'),
  prohibirAutoatencion('solicitudAfiliacion', (req) => req.params.id),
  documentosController.escanearDeSolicitud
);

/**
 * @route   POST /api/operador/afiliaciones/:id/rechazar
 * @desc    Rechazar / Cancelar solicitud de afiliación en agencia
 * @access  Privado (Operador)
 */
router.post('/afiliaciones/:id/rechazar', prohibirAutoatencion('solicitudAfiliacion', (req) => req.params.id), operadorController.rechazarCasoAfiliacion);

/**
 * @route   GET /api/operador/creditos
 * @desc    Obtener lista de solicitudes de crédito para evaluación operativa
 * @access  Privado (Operador)
 */
router.get('/creditos', operadorController.getBandejaCreditos);

/**
 * @route   POST /api/operador/creditos/:id/resolver
 * @desc    Resolver una solicitud de crédito (Rechazar directamente)
 * @access  Privado (Operador)
 */
router.post('/creditos/:id/resolver', prohibirAutoatencion('solicitudCredito', (req) => req.params.id), operadorController.resolverSolicitudCredito);

/**
 * @route   POST /api/operador/creditos/:id/elevar
 * @desc    Elevar solicitud de crédito al Ejecutivo con dictamen operativo
 * @access  Privado (Operador)
 */
router.post('/creditos/:id/elevar', prohibirAutoatencion('solicitudCredito', (req) => req.params.id), operadorController.elevarSolicitudCredito);

/**
 * @route   GET /api/operador/creditos/:id/evaluacion
 * @desc    Obtener evaluación crediticia con scoring y transacciones del solicitante
 * @access  Privado (Operador)
 */
router.get('/creditos/:id/evaluacion', operadorController.getEvaluacionCredito);

/**
 * @route   GET /api/operador/documentos
 * @desc    Bandeja de documentos de afiliación para revisar (?estado, ?search, ?limit, ?offset)
 * @access  Privado (solo OPERADOR: el operador acepta o rechaza los documentos)
 */
router.get('/documentos', checkRole('OPERADOR'), documentosController.bandeja);

/**
 * @route   GET /api/operador/documentos/:id/historial
 * @desc    Versiones de un documento con sus revisiones
 * @access  Privado (OPERADOR)
 */
router.get('/documentos/:id/historial', checkRole('OPERADOR'), documentosController.historial);

/**
 * @route   PATCH /api/operador/documentos/:id/revision
 * @desc    Aceptar o rechazar (con motivo) un documento pendiente; nadie revisa los suyos
 * @access  Privado (OPERADOR)
 */
router.patch(
  '/documentos/:id/revision',
  checkRole('OPERADOR'),
  prohibirAutoatencion('documento', (req) => req.params.id),
  documentosController.revisar
);

module.exports = router;
