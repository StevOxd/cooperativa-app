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
 * El tipo de asociado (EB o EX) viaja en el comprobante porque lo decide el banco (regla 4.6),
 * nunca el cuerpo de la solicitud.
 *
 * @param {{cui_dpi: string, tipo_asociado: 'EB'|'EX', cuentas: Array<{id_cuenta_bancaria: number, numero_cuenta_bancaria: string}>}} datos
 * @returns {string}
 */
const firmarAfiliacionToken = ({ cui_dpi, tipo_asociado, cuentas }) =>
  jwt.sign(
    {
      purpose: PURPOSE,
      cui_dpi,
      tipo_asociado,
      cuentas: cuentas.map((c) => ({ id: c.id_cuenta_bancaria, numero: c.numero_cuenta_bancaria })),
    },
    getSecret(),
    { expiresIn: EXPIRES_IN }
  );

/**
 * @param {string} token
 * @returns {{cui_dpi: string, tipo_asociado: 'EB'|'EX', cuentas: Array<{id: number, numero: string}>}|null} null si es inválido o venció.
 */
const verificarAfiliacionToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret());
    if (payload.purpose !== PURPOSE || !payload.cui_dpi || !Array.isArray(payload.cuentas)) return null;
    if (!['EB', 'EX'].includes(payload.tipo_asociado)) return null;
    return payload;
  } catch {
    return null;
  }
};

/**
 * Permiso para que quien acaba de registrar una solicitud de agencia suba sus documentos desde el comprobante, sin
 * sesión (Fase 6). Solo sirve para esa solicitud y vence en 30 minutos; después los lleva a la agencia. Va firmado
 * con otro secreto derivado: no sirve como comprobante de la Banca en Línea ni como sesión.
 */
const PURPOSE_CARGA = 'CARGA_DOCUMENTOS_SOLICITUD';
const EXPIRES_IN_CARGA = '30m';
const getSecretCarga = () => `${process.env.JWT_SECRET}:carga-documentos-solicitud`;

/**
 * @param {{ id_solicitud: number, cui_dpi: string }} datos
 * @returns {string}
 */
const firmarCargaDocumentosToken = ({ id_solicitud, cui_dpi }) =>
  jwt.sign({ purpose: PURPOSE_CARGA, id_solicitud, cui_dpi }, getSecretCarga(), { expiresIn: EXPIRES_IN_CARGA });

/**
 * @param {string} token
 * @returns {{ id_solicitud: number, cui_dpi: string }|null} null si es inválido o venció.
 */
const verificarCargaDocumentosToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecretCarga());
    if (payload.purpose !== PURPOSE_CARGA || !Number.isInteger(payload.id_solicitud) || !payload.cui_dpi) return null;
    return payload;
  } catch {
    return null;
  }
};

module.exports = {
  firmarAfiliacionToken,
  verificarAfiliacionToken,
  firmarCargaDocumentosToken,
  verificarCargaDocumentosToken,
};
