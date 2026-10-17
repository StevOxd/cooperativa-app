const express = require('express');
const router = express.Router();
const conciliacionController = require('../controllers/conciliacionController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Conciliación con el banco: solo el administrador
router.use(verifyToken, checkRole('ADMINISTRADOR'));

router.get('/depositos', conciliacionController.listarDepositos);
router.post('/depositos/:referencia/verificar', conciliacionController.verificarDeposito);
router.get('/reversiones', conciliacionController.listarReversiones);
router.post('/reversiones/:id/reintentar', conciliacionController.reintentar);

module.exports = router;
