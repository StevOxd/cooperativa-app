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

module.exports = router;
