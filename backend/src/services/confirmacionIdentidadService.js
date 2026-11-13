const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const mfaService = require('./mfaService');

/**
 * Confirmación de identidad para acciones sensibles de un usuario con sesión: cambiar el correo del sistema o
 * desactivar su verificación en dos pasos. Pide la contraseña y, si el usuario tiene 2FA activo, el código de su
 * aplicación. Un usuario inactivo o bloqueado por intentos fallidos no puede confirmar.
 *
 * Las rutas que la usan comparten el límite de `middlewares/limiteConfirmacionIdentidad.js`, para que no sirvan
 * para adivinar la contraseña.
 */

/**
 * @param {number} idUsuario - Usuario de la sesión.
 * @param {string} password - Contraseña con que ingresa.
 * @param {string} [codigo2fa] - Código TOTP; obligatorio si el usuario tiene 2FA activo.
 * @returns {Promise<boolean>}
 */
const confirmarIdentidad = async (idUsuario, password, codigo2fa) => {
  if (typeof password !== 'string' || !password) return false;
  const { rows } = await pool.query(
    `SELECT password_hash, mfa_enabled, mfa_secret, estado,
            (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > CURRENT_TIMESTAMP) AS bloqueado
       FROM usuarios WHERE id_usuario = $1`,
    [idUsuario]
  );
  if (rows.length === 0) return false;
  const [usuario] = rows;
  if (usuario.estado !== 'ACTIVO' || usuario.bloqueado) return false;
  if (!(await bcrypt.compare(password, usuario.password_hash))) return false;
  if (usuario.mfa_enabled && !mfaService.verifyTotp(usuario.mfa_secret, codigo2fa)) return false;
  return true;
};

module.exports = { confirmarIdentidad };
