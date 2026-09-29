/**
 * Reglas de contraseña del sistema. Deben coincidir con las que valida el
 * backend en POST /auth/cambiar-password (authController.changePassword):
 * mínimo 8 caracteres, con letras, números y al menos un carácter especial.
 */
export const PASSWORD_MIN_LENGTH = 8;

const SPECIAL_CHARS = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;

/**
 * Evalúa cada requisito por separado (para la lista de comprobación en pantalla).
 *
 * @param {string} password
 * @returns {{hasMinLength: boolean, hasLetters: boolean, hasNumbers: boolean, hasSpecial: boolean, isValid: boolean}}
 */
export const checkPassword = (password = '') => {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = SPECIAL_CHARS.test(password);
  return { hasMinLength, hasLetters, hasNumbers, hasSpecial, isValid: hasMinLength && hasLetters && hasNumbers && hasSpecial };
};
