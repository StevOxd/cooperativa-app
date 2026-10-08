const express = require('express');
const router = express.Router();
const bancoExternoController = require('../controllers/bancoExternoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Operaciones con el banco desde la ventanilla. Muestran saldos y mueven dinero, así que solo
// las usa el operador con sesión iniciada.
router.use(verifyToken, checkRole('OPERADOR'));

router.get('/bancos-disponibles', bancoExternoController.getBancosDisponibles);
router.get('/consultar', bancoExternoController.consultarCuenta);
router.get('/cuentas-demo', bancoExternoController.getCuentasDemo);
router.post('/crear-cuenta-demo', bancoExternoController.crearCuentaDemo);
router.get('/cuentas-cliente/:cui_dpi', bancoExternoController.getCuentasCliente);
router.post('/acreditar', bancoExternoController.acreditarCuenta);
router.post('/aperturar', bancoExternoController.aperturarCuentaBancaria);

module.exports = router;
