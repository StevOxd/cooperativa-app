const express = require('express');
const router = express.Router();
const afiliacionOnlineController = require('../controllers/afiliacionOnlineController');
const { validateCuiMiddleware } = require('../middlewares/validationMiddleware');
const rateLimit = require('express-rate-limit');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Tope de consultas por conexión en las rutas públicas que reciben un DPI: evita recorrer una lista
// de DPI para averiguar quién es cliente del banco o probar credenciales de la Banca en Línea.
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
const consultaDpiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isTestOrDev ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas consultas desde esta conexión. Espere 15 minutos e intente de nuevo.',
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

// 1. Verificación previa obligatoria por DPI
router.post('/validar-dpi', consultaDpiLimiter, validateCuiMiddleware('cui_dpi'), afiliacionOnlineController.validarDpi);

// 1.1 Validación de credenciales de banca en línea contra Core Banking API
router.post('/validar-credenciales-banco', consultaDpiLimiter, afiliacionOnlineController.validarCredencialesBanco);

// Envío de códigos de verificación de correo: además del límite por correo del servicio
// (reenvío a los 60 s y 5 por hora), un tope por conexión.
const codigoCorreoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isTestOrDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Pidió demasiados códigos desde esta conexión. Espere 15 minutos e intente de nuevo.',
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

// 1.2 Código de 6 dígitos para confirmar el correo antes de completar cualquiera de los dos caminos
router.post('/codigo-correo', codigoCorreoLimiter, afiliacionOnlineController.solicitarCodigoCorreo);

// 2. Escenario 1: Procesa afiliación de persona que ya pertenece al banco (débito de cuenta_bancaria)
router.post('/procesar-existente', afiliacionOnlineController.procesarAfiliacionExistente);
router.post('/online', afiliacionOnlineController.procesarAfiliacionExistente);

// 3. Escenario 2: Registra solicitud para persona que no pertenece al banco (emite número de caso para agencia)
router.post('/solicitar-nuevo', afiliacionOnlineController.registrarSolicitudAgencia);

// 4. Disponibilidad de un correo: solo para el personal (formularios de ventanilla). No es pública
//    porque revelaría qué correos están registrados; en la afiliación en línea el correo repetido
//    se informa después de verificar el código.
const soloPersonal = [verifyToken, checkRole('OPERADOR', 'ADMINISTRADOR')];
router.post('/verificar-email', ...soloPersonal, afiliacionOnlineController.verificarEmail);
router.get('/verificar-email', ...soloPersonal, afiliacionOnlineController.verificarEmail);

module.exports = router;
