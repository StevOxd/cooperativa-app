const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión y obtener token JWT
 * @access  Público
 */
router.post('/login', authController.login);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener perfil del usuario autenticado
 * @access  Privado (requiere verifyToken)
 */
router.get('/me', verifyToken, authController.getProfile);

module.exports = router;
