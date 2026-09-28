const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// Proteger todas las rutas de usuarios con autenticación JWT y rol exclusivo de ADMINISTRADOR
router.use(verifyToken);
router.use(checkRole('ADMINISTRADOR'));


/**
 * @route   GET /api/usuarios
 * @desc    Obtener lista de usuarios (soporta query params ?estado=ACTIVO/INACTIVO & ?search=)
 * @access  Privado
 */
router.get('/', userController.getUsers);

/**
 * @route   GET /api/usuarios/auditoria/eventos-recientes
 * @desc    Obtener los últimos eventos de auditoría y seguridad
 * @access  Privado (ADMINISTRADOR)
 */
router.get('/auditoria/eventos-recientes', userController.getRecentSecurityEvents);

/**
 * @route   GET /api/usuarios/roles/permisos
 * @desc    Obtener lista de roles y permisos configurados en la plataforma
 * @access  Privado (ADMINISTRADOR)
 */
router.get('/roles/permisos', userController.getRolesAndPermissions);

/**
 * @route   POST /api/usuarios/roles/:idRol/permisos
 * @desc    Asignar permisos a un rol
 * @access  Privado (ADMINISTRADOR)
 */
router.post('/roles/:idRol/permisos', userController.assignPermissionsToRole);

/**
 * @route   GET /api/usuarios/next-code
 * @desc    Obtener el siguiente código correlativo de usuario según el rol solicitado (EJ-X, OP-X)
 * @access  Privado (ADMINISTRADOR)
 */
router.get('/next-code', userController.getNextCode);

/**
 * @route   GET /api/usuarios/email/status
 * @desc    Obtener estado del servicio de correo institucional (Google / SMTP / Demo)
 * @access  Privado (ADMINISTRADOR)
 */
router.get('/email/status', userController.getEmailServiceStatus);

/**
 * @route   POST /api/usuarios/email/config
 * @desc    Configurar y verificar credenciales de Google Mail (Gmail SMTP)
 * @access  Privado (ADMINISTRADOR)
 */
router.post('/email/config', userController.updateEmailServiceConfig);

/**
 * @route   POST /api/usuarios/email/test
 * @desc    Enviar correo de prueba institucional a través del servicio de Google
 * @access  Privado (ADMINISTRADOR)
 */
router.post('/email/test', userController.sendTestEmail);

/**
 * @route   GET /api/usuarios/:id
 * @desc    Obtener detalle de un usuario por ID
 * @access  Privado
 */
router.get('/:id', userController.getUserById);

/**
 * @route   POST /api/usuarios
 * @desc    Crear un nuevo usuario con contraseña encriptada (bcrypt)
 * @access  Privado
 */
router.post('/', userController.createUser);

/**
 * @route   PUT /api/usuarios/:id
 * @desc    Actualizar datos de un usuario
 * @access  Privado
 */
router.put('/:id', userController.updateUser);

/**
 * @route   DELETE /api/usuarios/:id
 * @desc    Borrado lógico de usuario (cambia estado a 'INACTIVO')
 * @access  Privado
 */
router.delete('/:id', userController.deleteUser);

/**
 * @route   PATCH /api/usuarios/:id/desbloquear
 * @desc    Desbloquear usuario bloqueado por intentos fallidos (1 clic)
 * @access  Privado (ADMINISTRADOR)
 */
router.patch('/:id/desbloquear', userController.desbloquearUsuario);

/**
 * @route   PATCH /api/usuarios/:id/estado
 * @desc    Cambiar estado de usuario (ACTIVO/INACTIVO) con motivo obligatorio
 * @access  Privado (ADMINISTRADOR)
 */
router.patch('/:id/estado', userController.cambiarEstadoUsuario);

/**
 * @route   POST /api/usuarios/:id/reset-password
 * @desc    Reiniciar contraseña de usuario y generar clave temporal
 * @access  Privado (ADMINISTRADOR)
 */
router.post('/:id/reset-password', userController.resetPasswordUsuario);

module.exports = router;
