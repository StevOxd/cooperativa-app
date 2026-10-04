/**
 * Reglas de contraseña elegida por el usuario. Coinciden con las de
 * POST /auth/cambiar-password (authController.changePassword) y con
 * frontend/src/utils/passwordPolicy.js: mínimo 8 caracteres, con letras,
 * números y al menos un carácter especial.
 */
const PASSWORD_MIN_LENGTH = 8;

const SPECIAL_CHARS = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;

/**
 * @param {string} password
 * @returns {string|null} Mensaje para el usuario si no cumple, o null si es válida.
 */
const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !SPECIAL_CHARS.test(password)) {
    return 'La contraseña debe tener letras, números y al menos un símbolo (!@#$…).';
  }
  return null;
};

module.exports = { PASSWORD_MIN_LENGTH, validatePassword };
