const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const socketService = require('../services/socketService');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Procesa el inicio de sesión institucional con control de concurrencia y protección anti-fuerza bruta.
 *
 * @async
 * @function login
 * @param {import('express').Request} req - Solicitud HTTP con { identifier, password }.
 * @param {import('express').Response} res - Respuesta HTTP con token firmado y datos del usuario.
 * @returns {Promise<import('express').Response>} Retorna 200 con JWT, 400 por datos inválidos, 401 por clave incorrecta,
 * 409 por sesión concurrente o 423 si la cuenta está bloqueada temporalmente.
 */
const login = async (req, res) => {
  try {
    const { email, identifier, codigo_corporativo, password } = req.body;
    const loginIdentifier = (identifier || codigo_corporativo || email || '').trim();

    // 1. Validar campos requeridos
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporcione su código corporativo o correo electrónico y contraseña.',
      });
    }

    // 2. Consulta con JOIN entre usuarios, personas y roles (incluyendo campos de seguridad)
    const userQuery = `
      SELECT 
        u.id_persona, 
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        p.primer_nombre,
        p.primer_apellido,
        p.telefono,
        p.direccion,
        u.email, 
        u.password_hash, 
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.intentos_fallidos,
        u.bloqueado_hasta,
        u.sesion_activa_id,
        u.ultimo_ping,
        u.ultimo_acceso,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.codigo_corporativo = $1 
         OR LOWER(u.email) = LOWER($1)
      LIMIT 1
    `;
    const result = await db.query(userQuery, [loginIdentifier]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas. Verifique su código corporativo/correo o contraseña.',
      });
    }

    const user = result.rows[0];

    // 3. Verificar si el usuario se encuentra temporalmente bloqueado por fuerza bruta
    if (user.bloqueado_hasta) {
      const bloqueoHasta = new Date(user.bloqueado_hasta);
      const now = new Date();
      if (bloqueoHasta > now) {
        return res.status(423).json({
          success: false,
          bloqueado: true,
          bloqueado_hasta: user.bloqueado_hasta,
          message: 'Cuenta temporalmente bloqueada por seguridad tras múltiples intentos fallidos. Intente más tarde o contacte al administrador.',
        });
      }
    }

    // 4. Validar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      const nuevosIntentos = (user.intentos_fallidos || 0) + 1;

      if (nuevosIntentos >= 3) {
        // Bloquear por 15 minutos y registrar en auditoría
        await db.query(
          `UPDATE usuarios 
           SET intentos_fallidos = $1, 
               bloqueado_hasta = CURRENT_TIMESTAMP + INTERVAL '15 minutes' 
           WHERE id_persona = $2`,
          [nuevosIntentos, user.id_persona]
        );

        await db.query(
          `INSERT INTO historial_estados_usuario 
           (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo)
           VALUES ($1, $2, 'BLOQUEADO_TEMPORAL', $3, $3, NULL, 'Bloqueo automático de seguridad por 3 intentos fallidos consecutivos (fuerza bruta)')`,
          [user.id_persona, user.estado, user.id_rol]
        );

        return res.status(423).json({
          success: false,
          bloqueado: true,
          message: 'Cuenta temporalmente bloqueada por seguridad tras múltiples intentos fallidos. Intente más tarde o contacte al administrador.',
        });
      } else {
        await db.query(
          'UPDATE usuarios SET intentos_fallidos = $1 WHERE id_persona = $2',
          [nuevosIntentos, user.id_persona]
        );
        const intentosRestantes = 3 - nuevosIntentos;
        return res.status(401).json({
          success: false,
          intentos_fallidos: nuevosIntentos,
          intentos_restantes: intentosRestantes,
          message: `Credenciales inválidas. Te quedan ${intentosRestantes} intento(s) antes del bloqueo.`,
        });
      }
    }

    // 5. Verificar que el estado del usuario sea 'ACTIVO'
    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Su cuenta se encuentra inactiva. Por favor contacte al administrador.',
      });
    }

    // 6. Control de Sesión Única Concurrente y Alerta en Tiempo Real
    // Si sesion_activa_id ya tiene un valor vigente y hay conexión activa en otro navegador
    const tieneConexionActiva = socketService.isUserConnected(user.id_persona);
    if (user.sesion_activa_id && tieneConexionActiva) {
      // Emite un evento en tiempo real al navegador conectado
      socketService.sendSecurityAlert(
        user.id_persona,
        'Advertencia de seguridad: Se ha detectado un intento de inicio de sesión en tu cuenta desde otro dispositivo/navegador.'
      );

      // En el nuevo navegador donde intentan ingresar, rechaza el acceso
      return res.status(409).json({
        success: false,
        sesion_concurrente: true,
        message: 'Acceso denegado: Este usuario ya cuenta con una sesión activa en otro dispositivo. Cierre la sesión previa para continuar.',
      });
    }

    // 7. Si las credenciales son correctas y no hay conflicto concurrente:
    // Reiniciar intentos_fallidos = 0, bloqueado_hasta = NULL y generar nuevo sesion_activa_id
    const nuevaSesionId = crypto.randomUUID();

    await db.query(
      `UPDATE usuarios 
       SET intentos_fallidos = 0, 
           bloqueado_hasta = NULL, 
           sesion_activa_id = $1, 
           ultimo_ping = CURRENT_TIMESTAMP, 
           ultimo_acceso = CURRENT_TIMESTAMP 
       WHERE id_persona = $2`,
      [nuevaSesionId, user.id_persona]
    );

    // 8. Generar payload consolidado para el token JWT con id_persona y sesion_id
    const payload = {
      id: user.id_persona,
      id_persona: user.id_persona,
      codigo_corporativo: user.codigo_corporativo,
      email: user.email,
      nombre_completo: user.nombre_completo,
      nombre: user.nombre_completo,
      cui_dpi: user.cui_dpi,
      rol: user.rol,
      rol_nombre: user.rol_nombre,
      estado: user.estado,
      sesion_activa_id: nuevaSesionId,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // 9. Retornar respuesta exitosa consolidada
    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      token,
      sesion_activa_id: nuevaSesionId,
      user: {
        id: user.id_persona,
        id_persona: user.id_persona,
        codigo_corporativo: user.codigo_corporativo,
        email: user.email,
        nombre_completo: user.nombre_completo,
        nombre: user.nombre_completo,
        cui_dpi: user.cui_dpi,
        id_rol: user.id_rol,
        rol: user.rol,
        rol_nombre: user.rol_nombre,
        estado: user.estado,
        telefono: user.telefono,
        direccion: user.direccion,
        ultimo_acceso: new Date().toISOString(),
        fecha_creacion: user.fecha_creacion,
      },
    });
  } catch (error) {
    console.error('Error en authController.login:', error);
    return res.status(500).json({
      success: false,
      message: 'Ocurrió un error interno en el servidor al procesar el inicio de sesión.',
    });
  }
};

/**
 * Cierre de sesión formal del usuario.
 * Invalida el identificador de sesión activa en base de datos (`sesion_activa_id = NULL`),
 * anula `ultimo_ping = NULL` y desconecta inmediatamente los sockets asociados.
 *
 * @async
 * @function logout
 * @param {import('express').Request} req - Solicitud HTTP con usuario autenticado en `req.user`.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<import('express').Response>} Retorna 200 si la sesión se cerró exitosamente.
 */
const logout = async (req, res) => {
  try {
    const userPersonaId = Number(req.user.id_persona || req.user.id);
    await db.query(
      'UPDATE usuarios SET sesion_activa_id = NULL, ultimo_ping = NULL WHERE id_persona = $1',
      [userPersonaId]
    );

    // Desconectar sockets activos del usuario y emitir actualización de presencia instantánea
    socketService.disconnectUser(userPersonaId);
    socketService.broadcastPresence(userPersonaId, false);

    return res.status(200).json({
      success: true,
      message: 'Sesión cerrada exitosamente.',
    });
  } catch (error) {
    console.error('Error en authController.logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión en el servidor.',
    });
  }
};

/**
 * Retorna los datos institucionales del usuario autenticado en sesión activa.
 *
 * @async
 * @function getProfile
 * @param {import('express').Request} req - Solicitud HTTP con usuario autenticado en `req.user`.
 * @param {import('express').Response} res - Respuesta HTTP con datos de perfil.
 * @returns {Promise<import('express').Response>} Retorna 200 con el objeto de usuario o 404 si no existe.
 */
const getProfile = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;

    const userQuery = `
      SELECT 
        u.id_persona, 
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.email, 
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.ultimo_acceso,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_persona = $1
      LIMIT 1
    `;
    const result = await db.query(userQuery, [userPersonaId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      user: {
        ...row,
        id: row.id_persona,
        nombre: row.nombre_completo,
      },
    });
  } catch (error) {
    console.error('Error en authController.getProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el perfil del usuario.',
    });
  }
};

/**
 * Actualiza los datos de contacto institucionales del usuario autenticado.
 * Modifica el campo `telefono` en la tabla `personas`.
 *
 * @async
 * @function updateProfile
 * @param {import('express').Request} req - Solicitud HTTP con `req.body.telefono`.
 * @param {import('express').Response} res - Respuesta HTTP con el teléfono actualizado.
 * @returns {Promise<import('express').Response>} Retorna 200 con el teléfono actualizado, 400 por datos inválidos o 404.
 */
const updateProfile = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const { telefono } = req.body;

    if (telefono === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar el campo teléfono a actualizar.',
      });
    }

    const cleanPhone = telefono ? telefono.trim() : null;

    // Actualizar teléfono en la tabla personas
    const updateQuery = `
      UPDATE personas 
      SET telefono = $1 
      WHERE id_persona = $2 
      RETURNING id_persona, telefono
    `;
    const result = await db.query(updateQuery, [cleanPhone, userPersonaId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la persona asociada a este usuario.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Datos de contacto actualizados exitosamente.',
      data: {
        telefono: result.rows[0].telefono,
      },
    });
  } catch (error) {
    console.error('Error en authController.updateProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar los datos de contacto en el servidor.',
    });
  }
};

/**
 * Modifica la contraseña del usuario autenticado aplicando directivas de seguridad bancaria.
 * Valida la contraseña actual contra bcrypt, exige longitud mínima (6+) y combinación de letras y números,
 * y persiste el nuevo hash en `usuarios`.
 *
 * @async
 * @function changePassword
 * @param {import('express').Request} req - Solicitud HTTP con { password_actual, nueva_password, confirmar_password }.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<import('express').Response>} Retorna 200 tras cambio exitoso o 400 ante validaciones fallidas.
 */
const changePassword = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const { password_actual, nueva_password, confirmar_password } = req.body;

    // 1. Validar campos requeridos
    if (!password_actual || !nueva_password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporcione la contraseña actual y la nueva contraseña.',
      });
    }

    // 2. Validar longitud mínima
    if (nueva_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 6 caracteres.',
      });
    }

    // 3. Validar complejidad: debe combinar letras y números
    const hasLetters = /[a-zA-Z]/.test(nueva_password);
    const hasNumbers = /[0-9]/.test(nueva_password);
    if (!hasLetters || !hasNumbers) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe combinar al menos letras y números por seguridad institucional.',
      });
    }

    // 4. Validar confirmación si se envía
    if (confirmar_password && nueva_password !== confirmar_password) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña y su confirmación no coinciden.',
      });
    }

    // 5. Validar que la nueva contraseña sea diferente a la actual
    if (password_actual === nueva_password) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe ser diferente a la contraseña actual.',
      });
    }

    // 5. Obtener el password_hash actual de la base de datos
    const userQuery = 'SELECT password_hash FROM usuarios WHERE id_persona = $1';
    const userRes = await db.query(userQuery, [userPersonaId]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado en el sistema.',
      });
    }

    const currentHash = userRes.rows[0].password_hash;

    // 6. Verificar contraseña actual con bcrypt
    const isCurrentValid = await bcrypt.compare(password_actual, currentHash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual ingresada es incorrecta.',
      });
    }

    // 7. Generar hash de la nueva contraseña con bcrypt
    const newHash = await bcrypt.hash(nueva_password, 10);

    // 8. Actualizar en la base de datos
    await db.query(
      'UPDATE usuarios SET password_hash = $1, intentos_fallidos = 0 WHERE id_persona = $2',
      [newHash, userPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada exitosamente.',
    });
  } catch (error) {
    console.error('Error en authController.changePassword:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al cambiar la contraseña.',
    });
  }
};

module.exports = {
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};
