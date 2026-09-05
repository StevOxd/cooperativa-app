const express = require('express');
const router = express.Router();
const catalogoController = require('../controllers/catalogoController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Permitir acceso a cualquier usuario autenticado en la plataforma
router.use(verifyToken);

/**
 * @route   GET /api/catalogo/tipos-cuenta
 * @desc    Obtener lista de tipos de cuenta con beneficios y tasas
 * @access  Privado (Cualquier rol autenticado)
 */
router.get('/tipos-cuenta', catalogoController.getTiposCuenta);

module.exports = router;
