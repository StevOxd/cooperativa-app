const express = require('express');
const router = express.Router();
const bancoExternoController = require('../controllers/bancoExternoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { prohibirAutoatencion } = require('../middlewares/segregacion');
const rateLimit = require('express-rate-limit');

// Depósitos y aperturas en el banco desde ventanilla: además de los topes de monto, un tope por conexión
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
const operacionBancoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isTestOrDev ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas operaciones con el banco desde esta conexión. Espere 15 minutos e intente de nuevo.',
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

// Operaciones con el banco desde la ventanilla. Muestran saldos y mueven dinero, así que solo
// las usa el operador con sesión iniciada.
router.use(verifyToken, checkRole('OPERADOR'));

router.get('/bancos-disponibles', bancoExternoController.getBancosDisponibles);
router.get('/consultar', bancoExternoController.consultarCuenta);
router.get('/cuentas-demo', bancoExternoController.getCuentasDemo);
router.post('/crear-cuenta-demo', bancoExternoController.crearCuentaDemo);
router.get('/cuentas-cliente/:cui_dpi', bancoExternoController.getCuentasCliente);
router.post('/acreditar', operacionBancoLimiter, bancoExternoController.acreditarCuenta);
router.post('/aperturar', operacionBancoLimiter, prohibirAutoatencion('dpi', (req) => req.body?.cui_dpi), bancoExternoController.aperturarCuentaBancaria);

module.exports = router;
