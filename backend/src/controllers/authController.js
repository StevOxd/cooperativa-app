const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_cooperativa_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Controlador para el inicio de sesión de usuarios (Arquitectura 3FN con id_persona)
 * POST /api/auth/login
 * Permite ingresar con: codigo_corporativo (4 dígitos) o email
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

    // 2. Consulta con JOIN entre usuarios, personas y roles (Búsqueda por código corporativo o email)
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

    // 3. Validar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas. Verifique su código corporativo/correo o contraseña.',
      });
    }

    // 4. Verificar que el estado del usuario sea 'ACTIVO'
    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Su cuenta se encuentra inactiva. Por favor contacte al administrador.',
      });
    }

    // 5. Actualizar marca de último acceso
    await db.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_persona = $1', [user.id_persona]);

    // 6. Generar payload consolidado para el token JWT con id_persona
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
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // 7. Retornar respuesta exitosa consolidada
    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      token,
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
        ultimo_acceso: user.ultimo_acceso,
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
 * Controlador para obtener los datos del usuario autenticado actual
 * GET /api/auth/me (Ruta protegida)
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

module.exports = {
  login,
  getProfile,
};
