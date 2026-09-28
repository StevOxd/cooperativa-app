const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const clientesController = require('../controllers/clientesController');
const cuentasController = require('../controllers/cuentasController');
const { requireServiceAuth } = require('../middlewares/serviceAuth');

// 1. Healthcheck público para Docker y balanceadores
router.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ONLINE',
    service: 'Core Banking API - Entidad Bancaria Corporativa',
    timestamp: new Date().toISOString(),
  });
});

// A partir de aquí, todas las rutas operativas requieren autenticación inter-servicio
router.use(requireServiceAuth);

// 2. Autenticación Banca en Línea (3 Factores: Usuario, Código, Password)
router.post('/auth/validar-credenciales', authController.validarCredenciales);

// 3. Verificación y consulta de clientes
router.post('/clientes/verificar-dpi', clientesController.verificarDpi);
router.get('/clientes/:cui_dpi/cuentas', clientesController.obtenerCuentasCliente);
router.get('/clientes/:cui_dpi/historial', clientesController.obtenerHistorialFinanciero);

// 4. Operaciones sobre Cuentas Bancarias
router.get('/cuentas/:numero_cuenta', cuentasController.consultarCuenta);
router.post('/cuentas/aperturar', cuentasController.aperturarCuenta);
router.post('/cuentas/debitar', cuentasController.debitar);
router.post('/cuentas/acreditar', cuentasController.acreditar);
router.get('/demo/cuentas', cuentasController.getCuentasDemo);

module.exports = router;
