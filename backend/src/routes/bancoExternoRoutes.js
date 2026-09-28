const express = require('express');
const router = express.Router();
const bancoExternoController = require('../controllers/bancoExternoController');

// Rutas públicas del simulador de banco comercial externo (ACH)
router.get('/bancos-disponibles', bancoExternoController.getBancosDisponibles);
router.get('/consultar', bancoExternoController.consultarCuenta);
router.get('/cuentas-demo', bancoExternoController.getCuentasDemo);
router.post('/crear-cuenta-demo', bancoExternoController.crearCuentaDemo);
router.get('/cuentas-cliente/:cui_dpi', bancoExternoController.getCuentasCliente);
router.post('/acreditar', bancoExternoController.acreditarCuenta);
router.post('/aperturar', bancoExternoController.aperturarCuentaBancaria);

module.exports = router;
