const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const socketService = require('../services/socketService');
const mfaService = require('../services/mfaService');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// Los fallos de inicio de sesión responden igual exista o no la cuenta, para que no se pueda averiguar
// qué usuarios existen: mismo estado, mismo mensaje y un tiempo parecido (siempre se compara un hash).
const MENSAJE_CREDENCIALES_INVALIDAS =
  'El usuario o la contraseña no son correctos. Después de 3 intentos fallidos seguidos, la cuenta se bloquea 15 minutos.';
const HASH_DE_RELLENO = bcrypt.hashSync('cuenta-inexistente', 10);
const responderCredencialesInvalidas = (res) =>
  res.status(401).json({ success: false, message: MENSAJE_CREDENCIALES_INVALIDAS });
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
        message: 'Escriba su usuario o correo y su contraseña.',
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
        u.mfa_secret,
        u.mfa_enabled,
        u.debe_cambiar_password,
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
      await bcrypt.compare(password, HASH_DE_RELLENO);
      return responderCredencialesInvalidas(res);
    }

    const user = result.rows[0];

    // 3. Validar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    // 4. Cuenta bloqueada temporalmente por fuerza bruta: solo se le dice a quien sabe la contraseña.
    //    Con una contraseña incorrecta responde igual que siempre y no suma intentos.
    const bloqueada = user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date();
    if (bloqueada) {
      if (!isPasswordValid) return responderCredencialesInvalidas(res);
      return res.status(423).json({
        success: false,
        bloqueado: true,
        bloqueado_hasta: user.bloqueado_hasta,
        message: 'Su cuenta está bloqueada por varios intentos fallidos. Intente más tarde o pida al administrador que la desbloquee.',
      });
    }

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

        const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || 'Desconocido';

        await db.query(
          `INSERT INTO historial_estados_usuario 
           (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
           VALUES ($1, $2, 'BLOQUEADO_TEMPORAL', $3, $3, NULL, 'Bloqueo automático de seguridad por 3 intentos fallidos consecutivos (fuerza bruta)', $4, $5)`,
          [user.id_persona, user.estado, user.id_rol, clientIp, userAgent]
        );

      } else {
        await db.query(
          'UPDATE usuarios SET intentos_fallidos = $1 WHERE id_persona = $2',
          [nuevosIntentos, user.id_persona]
        );
      }
      return responderCredencialesInvalidas(res);
    }

    // Si la contraseña es válida, reiniciar contador de intentos fallidos inmediatamente en base de datos
    if ((user.intentos_fallidos || 0) > 0 || user.bloqueado_hasta) {
      await db.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_persona = $1',
        [user.id_persona]
      );
      user.intentos_fallidos = 0;
      user.bloqueado_hasta = null;
    }

    // 5. Verificar que el estado del usuario sea 'ACTIVO'
    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({
        success: false,
        message: 'Su cuenta está inactiva. Comuníquese con el administrador.',
      });
    }

    // 5.1 Verificar si el usuario tiene Doble Factor de Autenticación (MFA / 2FA TOTP) activo
    if (user.mfa_enabled && user.mfa_secret) {
      const tempToken = jwt.sign(
        { id_persona: user.id_persona, purpose: 'MFA_VERIFICATION' },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.status(200).json({
        success: true,
        mfa_required: true,
        temp_token: tempToken,
        message: 'Escriba el código de 6 dígitos de su aplicación de autenticación.',
        user: {
          id: user.id_persona,
          codigo_corporativo: user.codigo_corporativo,
          email: user.email,
          nombre: user.primer_nombre,
          debe_cambiar_password: Boolean(user.debe_cambiar_password),
        },
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
        message: 'Ya hay una sesión abierta con este usuario en otro dispositivo. Ciérrela para entrar aquí.',
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
      debe_cambiar_password: Boolean(user.debe_cambiar_password),
      sesion_activa_id: nuevaSesionId,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // 9. Retornar respuesta exitosa consolidada
    return res.status(200).json({
      success: true,
      message: 'Sesión iniciada.',
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
        debe_cambiar_password: Boolean(user.debe_cambiar_password),
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
      message: 'No se pudo iniciar sesión. Intente de nuevo.',
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
      message: 'Sesión cerrada.',
    });
  } catch (error) {
    console.error('Error en authController.logout:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cerrar la sesión en el servidor.',
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
        u.mfa_enabled,
        u.debe_cambiar_password,
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
        debe_cambiar_password: Boolean(row.debe_cambiar_password),
      },
    });
  } catch (error) {
    console.error('Error en authController.getProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar su perfil. Intente de nuevo.',
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
        message: 'Escriba su número de teléfono.',
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
        message: 'No encontramos sus datos personales.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Teléfono actualizado.',
      data: {
        telefono: result.rows[0].telefono,
      },
    });
  } catch (error) {
    console.error('Error en authController.updateProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo actualizar el teléfono. Intente de nuevo.',
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
        message: 'Escriba su contraseña actual y la nueva.',
      });
    }

    // 2. Validar longitud mínima
    if (nueva_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
    }

    // 3. Validar complejidad: debe combinar letras, números y al menos un carácter especial
    const hasLetters = /[a-zA-Z]/.test(nueva_password);
    const hasNumbers = /[0-9]/.test(nueva_password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(nueva_password);
    if (!hasLetters || !hasNumbers || !hasSpecial) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener letras, números y al menos un símbolo (!@#$…).',
      });
    }

    // 4. Validar confirmación si se envía
    if (confirmar_password && nueva_password !== confirmar_password) {
      return res.status(400).json({
        success: false,
        message: 'Las contraseñas nuevas no coinciden.',
      });
    }

    // 5. Validar que la nueva contraseña sea diferente a la actual
    if (password_actual === nueva_password) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe ser distinta de la actual.',
      });
    }

    // 5. Obtener el password_hash actual de la base de datos
    const userQuery = 'SELECT password_hash FROM usuarios WHERE id_persona = $1';
    const userRes = await db.query(userQuery, [userPersonaId]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const currentHash = userRes.rows[0].password_hash;

    // 6. Verificar contraseña actual con bcrypt
    const isCurrentValid = await bcrypt.compare(password_actual, currentHash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual no es correcta.',
      });
    }

    // 7. Generar hash de la nueva contraseña con bcrypt
    const newHash = await bcrypt.hash(nueva_password, 10);

    // 8. Actualizar en la base de datos
    await db.query(
      'UPDATE usuarios SET password_hash = $1, debe_cambiar_password = FALSE, intentos_fallidos = 0 WHERE id_persona = $2',
      [newHash, userPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada.',
      debe_cambiar_password: false,
    });
  } catch (error) {
    console.error('Error en authController.changePassword:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cambiar la contraseña. Intente de nuevo.',
    });
  }
};

/**
 * Valida el código TOTP de 6 dígitos del autenticador (Google / Microsoft Authenticator)
 * y emite el token JWT definitivo para el usuario.
 *
 * @async
 * @function verifyMfa
 * @param {import('express').Request} req - Solicitud HTTP con { temp_token, totp_code }.
 * @param {import('express').Response} res - Retorna JWT definitivo si el código es válido.
 */
const verifyMfa = async (req, res) => {
  try {
    const { temp_token, totp_code } = req.body;

    if (!temp_token || !totp_code) {
      return res.status(400).json({
        success: false,
        message: 'Escriba el código de 6 dígitos.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(temp_token, JWT_SECRET);
      if (decoded.purpose !== 'MFA_VERIFICATION') {
        throw new Error('Propósito de token inválido');
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Pasó demasiado tiempo. Inicie sesión de nuevo.',
      });
    }

    // Consultar al usuario y su secreto MFA
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
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.sesion_activa_id,
        u.mfa_secret,
        u.mfa_enabled,
        u.debe_cambiar_password,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_persona = $1
      LIMIT 1
    `;
    const result = await db.query(userQuery, [decoded.id_persona]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const user = result.rows[0];

    // Validar el código de 6 dígitos con mfaService
    const isValid = mfaService.verifyTotp(user.mfa_secret, totp_code);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'El código no es correcto o ya venció. Revise que la hora de su teléfono sea la correcta e intente de nuevo.',
      });
    }

    // Control de sesión única concurrente
    const tieneConexionActiva = socketService.isUserConnected(user.id_persona);
    if (user.sesion_activa_id && tieneConexionActiva) {
      socketService.sendSecurityAlert(
        user.id_persona,
        'Advertencia de seguridad: Se ha detectado un intento de inicio de sesión con 2FA en tu cuenta desde otro dispositivo/navegador.'
      );

      return res.status(409).json({
        success: false,
        sesion_concurrente: true,
        message: 'Ya hay una sesión abierta con este usuario en otro dispositivo. Ciérrela para entrar aquí.',
      });
    }

    // Generar nuevo ID de sesión
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
      debe_cambiar_password: Boolean(user.debe_cambiar_password),
      sesion_activa_id: nuevaSesionId,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(200).json({
      success: true,
      message: 'Sesión iniciada.',
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
        debe_cambiar_password: Boolean(user.debe_cambiar_password),
        telefono: user.telefono,
        direccion: user.direccion,
        ultimo_acceso: new Date().toISOString(),
        fecha_creacion: user.fecha_creacion,
      },
    });
  } catch (error) {
    console.error('Error en authController.verifyMfa:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo verificar el código. Intente de nuevo.',
    });
  }
};

/**
 * Consulta el estado actual de 2FA para el usuario autenticado.
 */
const get2faStatus = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const result = await db.query(
      'SELECT mfa_enabled FROM usuarios WHERE id_persona = $1',
      [userPersonaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    return res.status(200).json({
      success: true,
      mfa_enabled: Boolean(result.rows[0].mfa_enabled),
    });
  } catch (error) {
    console.error('Error en authController.get2faStatus:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo consultar la verificación en dos pasos.',
    });
  }
};

/**
 * Inicia la configuración de 2FA generando un nuevo secreto y código QR.
 */
const setup2fa = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const result = await db.query(
      'SELECT codigo_corporativo, email FROM usuarios WHERE id_persona = $1',
      [userPersonaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const identifier = result.rows[0].codigo_corporativo || result.rows[0].email;
    const mfaData = await mfaService.generateMfaSecret(identifier);

    return res.status(200).json({
      success: true,
      secret: mfaData.base32,
      qr_code_url: mfaData.qr_code_url,
      otpauth_url: mfaData.otpauth_url,
    });
  } catch (error) {
    console.error('Error en authController.setup2fa:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo iniciar la verificación en dos pasos. Intente de nuevo.',
    });
  }
};

/**
 * Valida el código de 6 dígitos con el secreto proporcionado y activa 2FA en la cuenta.
 */
const enable2fa = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const { secret, totp_code } = req.body;

    if (!secret || !totp_code) {
      return res.status(400).json({
        success: false,
        message: 'Escriba el código de 6 dígitos que muestra su aplicación.',
      });
    }

    const isValid = mfaService.verifyTotp(secret, totp_code);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'El código no es correcto o ya venció. Revise que la hora de su teléfono sea la correcta e intente de nuevo.',
      });
    }

    await db.query(
      'UPDATE usuarios SET mfa_enabled = true, mfa_secret = $1 WHERE id_persona = $2',
      [secret, userPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Verificación en dos pasos activada.',
    });
  } catch (error) {
    console.error('Error en authController.enable2fa:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo activar la verificación en dos pasos. Intente de nuevo.',
    });
  }
};

/**
 * Desactiva el 2FA solicitando confirmación de la contraseña actual del usuario.
 */
const disable2fa = async (req, res) => {
  try {
    const userPersonaId = req.user.id_persona || req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Escriba su contraseña actual para confirmar.',
      });
    }

    const result = await db.query(
      'SELECT password_hash FROM usuarios WHERE id_persona = $1',
      [userPersonaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const passwordValida = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!passwordValida) {
      return res.status(401).json({
        success: false,
        message: 'La contraseña no es correcta.',
      });
    }

    await db.query(
      'UPDATE usuarios SET mfa_enabled = false, mfa_secret = NULL, mfa_qr_url = NULL WHERE id_persona = $1',
      [userPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Verificación en dos pasos desactivada.',
    });
  } catch (error) {
    console.error('Error en authController.disable2fa:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo desactivar la verificación en dos pasos. Intente de nuevo.',
    });
  }
};

module.exports = {
  login,
  verifyMfa,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  get2faStatus,
  setup2fa,
  enable2fa,
  disable2fa,
};
