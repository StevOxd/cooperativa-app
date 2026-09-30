const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

const rateLimit = require('express-rate-limit');

// Rate limiting perimetral para inicio de sesión por IP (SEC-05)
const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isTestOrDev ? 200 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos desde esta conexión. Espere 15 minutos e intente de nuevo.',
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión y obtener token JWT
 * @access  Público (protegido por Rate Limiter perimetral)
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @route   POST /api/auth/verify-mfa
 * @desc    Validar código TOTP de 6 dígitos para completar inicio de sesión 2FA
 * @access  Público (requiere temp_token)
 */
router.post('/verify-mfa', authController.verifyMfa);
router.post('/verify-2fa', authController.verifyMfa);

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

/**
 * @route   GET /api/auth/2fa/status
 * @desc    Consultar estado de activación del doble factor (2FA)
 * @access  Privado (requiere verifyToken)
 */
router.get('/2fa/status', verifyToken, authController.get2faStatus);

/**
 * @route   POST /api/auth/2fa/setup
 * @desc    Generar secreto y código QR para enrolamiento 2FA
 * @access  Privado (requiere verifyToken)
 */
router.post('/2fa/setup', verifyToken, authController.setup2fa);

/**
 * @route   POST /api/auth/2fa/enable
 * @desc    Verificar código de 6 dígitos y activar 2FA
 * @access  Privado (requiere verifyToken)
 */
router.post('/2fa/enable', verifyToken, authController.enable2fa);

/**
 * @route   POST /api/auth/2fa/disable
 * @desc    Desactivar 2FA con confirmación de contraseña
 * @access  Privado (requiere verifyToken)
 */
router.post('/2fa/disable', verifyToken, authController.disable2fa);

module.exports = router;

