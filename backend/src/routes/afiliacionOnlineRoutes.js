const express = require('express');
const router = express.Router();
const afiliacionOnlineController = require('../controllers/afiliacionOnlineController');
const { validateCuiMiddleware } = require('../middlewares/validationMiddleware');

// 1. Verificación previa obligatoria por DPI
router.post('/validar-dpi', validateCuiMiddleware('cui_dpi'), afiliacionOnlineController.validarDpi);

// 1.1 Validación de credenciales de banca en línea contra Core Banking API
router.post('/validar-credenciales-banco', afiliacionOnlineController.validarCredencialesBanco);

// 2. Escenario 1: Procesa afiliación de persona que ya pertenece al banco (débito de cuenta_bancaria)
router.post('/procesar-existente', afiliacionOnlineController.procesarAfiliacionExistente);
router.post('/online', afiliacionOnlineController.procesarAfiliacionExistente);

// 3. Escenario 2: Registra solicitud para persona que no pertenece al banco (emite número de caso para agencia)
router.post('/solicitar-nuevo', afiliacionOnlineController.registrarSolicitudAgencia);

// 4. Verificación previa de disponibilidad de correo electrónico
router.post('/verificar-email', afiliacionOnlineController.verificarEmail);
router.get('/verificar-email', afiliacionOnlineController.verificarEmail);

module.exports = router;
