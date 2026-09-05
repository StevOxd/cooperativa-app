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

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión formalmente, limpiar sesion_activa_id y desconectar sockets
 * @access  Privado (requiere verifyToken)
 */
router.post('/logout', verifyToken, authController.logout);

/**
 * @route   PATCH /api/auth/perfil
 * @desc    Actualizar datos de contacto (teléfono) del usuario autenticado
 * @access  Privado (requiere verifyToken)
 */
router.patch('/perfil', verifyToken, authController.updateProfile);

/**
 * @route   POST /api/auth/cambiar-password
 * @desc    Cambio seguro de contraseña para el usuario autenticado
 * @access  Privado (requiere verifyToken)
 */
router.post('/cambiar-password', verifyToken, authController.changePassword);

module.exports = router;

