const mailerService = require('../services/mailerService');
const { verificarDominioCorreo } = require('./correoDominio');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALORES_NO = ['false', '0', 'no', 'off'];

/**
 * Decide si una afiliación en ventanilla crea el acceso al portal (issue #26).
 *
 * El acceso solo se crea si el correo de la cooperativa funciona, porque la contraseña temporal
 * viaja únicamente por correo. Sin acceso, el asociado queda afiliado y el acceso se activa
 * después desde su expediente (issue #27).
 *
 * @param {boolean|string|undefined} crearAccesoPortal - Casilla «Crear acceso al portal». Si no
 *   viene, se crea solo cuando el correo funciona.
 * @param {string} [emailRaw]
 * @returns {Promise<{crear: boolean, email: string|null}>}
 * @throws {Error} con `statusCode` y `code` si se pidió el acceso y no se puede crear.
 */
const decidirAccesoPortal = async (crearAccesoPortal, emailRaw) => {
  const correoDisponible = mailerService.isAvailable();
  const pedido = crearAccesoPortal === undefined || crearAccesoPortal === null || crearAccesoPortal === ''
    ? correoDisponible
    : !VALORES_NO.includes(String(crearAccesoPortal).trim().toLowerCase());

  const email = typeof emailRaw === 'string' && emailRaw.trim() ? emailRaw.trim().toLowerCase() : null;
  const fallar = (statusCode, code, message) => {
    throw Object.assign(new Error(message), { statusCode, code });
  };

  if (!pedido) {
    // Sin acceso el correo es opcional, pero si lo escribieron debe tener buen formato.
    if (email && !EMAIL_REGEX.test(email)) fallar(400, 'CORREO_INVALIDO', 'Revise el correo. Debe verse así: nombre@correo.com.');
    return { crear: false, email };
  }

  if (!correoDisponible) {
    fallar(
      409,
      'CORREO_NO_DISPONIBLE',
      'El correo de la cooperativa no está funcionando, así que no se puede crear el acceso al portal. Desmarque «Crear acceso al portal» para afiliar sin acceso; se puede activar después desde el expediente.'
    );
  }
  if (!email) fallar(400, 'CORREO_REQUERIDO', 'Escriba el correo del asociado para crear su acceso al portal.');
  if (!EMAIL_REGEX.test(email)) fallar(400, 'CORREO_INVALIDO', 'Revise el correo. Debe verse así: nombre@correo.com.');

  const dominio = await verificarDominioCorreo(email);
  if (!dominio.valido) fallar(400, 'CORREO_DOMINIO_INVALIDO', dominio.message);

  return { crear: true, email };
};

module.exports = { decidirAccesoPortal };
