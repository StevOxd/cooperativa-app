const jwt = require('jsonwebtoken');

/**
 * Comprobante de que el solicitante validó su Banca en Línea en la afiliación en línea.
 * Lo emite POST /afiliacion/validar-credenciales-banco y lo exige /afiliacion/procesar-existente:
 * solo sirve para ese DPI y para las cuentas del banco que le pertenecen.
 *
 * Se firma con un secreto derivado de JWT_SECRET para que no sirva como token de sesión
 * (authMiddleware) ni un token de sesión sirva como comprobante.
 */
const PURPOSE = 'AFILIACION_ONLINE';
const EXPIRES_IN = '15m';

const getSecret = () => `${process.env.JWT_SECRET}:afiliacion-online`;

/**
 * @param {{cui_dpi: string, cuentas: Array<{id_cuenta_bancaria: number, numero_cuenta_bancaria: string}>}} datos
 * @returns {string}
 */
const firmarAfiliacionToken = ({ cui_dpi, cuentas }) =>
  jwt.sign(
    {
      purpose: PURPOSE,
      cui_dpi,
      cuentas: cuentas.map((c) => ({ id: c.id_cuenta_bancaria, numero: c.numero_cuenta_bancaria })),
    },
    getSecret(),
    { expiresIn: EXPIRES_IN }
  );

/**
 * @param {string} token
 * @returns {{cui_dpi: string, cuentas: Array<{id: number, numero: string}>}|null} null si es inválido o venció.
 */
const verificarAfiliacionToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret());
    if (payload.purpose !== PURPOSE || !payload.cui_dpi || !Array.isArray(payload.cuentas)) return null;
    return payload;
  } catch {
    return null;
  }
};

module.exports = { firmarAfiliacionToken, verificarAfiliacionToken };
