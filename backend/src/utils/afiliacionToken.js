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

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Identidad del titular tal como la tiene el banco, con los campos que usa `personas`. Los opcionales vacíos quedan
 * en null.
 *
 * @param {object} cliente - `cliente` de la respuesta de la Banca en Línea.
 * @returns {{primer_nombre: string, segundo_nombre: string|null, primer_apellido: string, segundo_apellido: string|null,
 *   telefono: string|null, direccion: string|null, fecha_nacimiento: string}|null} null si al banco le falta el nombre, el
 *   apellido o la fecha de nacimiento.
 */
const identidadDelBanco = (cliente) => {
  const texto = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
  const fecha = texto(cliente?.fecha_nacimiento)?.slice(0, 10) || null;
  const identidad = {
    primer_nombre: texto(cliente?.primer_nombre),
    segundo_nombre: texto(cliente?.segundo_nombre),
    primer_apellido: texto(cliente?.primer_apellido),
    segundo_apellido: texto(cliente?.segundo_apellido),
    telefono: texto(cliente?.telefono),
    direccion: texto(cliente?.direccion),
    fecha_nacimiento: fecha && FECHA_ISO.test(fecha) ? fecha : null,
  };
  if (!identidad.primer_nombre || !identidad.primer_apellido || !identidad.fecha_nacimiento) return null;
  return identidad;
};

/**
 * El tipo de asociado (EB o EX) y la identidad del titular viajan en el comprobante porque los decide el banco
 * (regla 4.6), nunca el cuerpo de la solicitud. La identidad es la que el banco devolvió al validar la Banca en Línea:
 * con ella se registra a la persona (issue #124). El comprobante va firmado, no cifrado: solo lo recibe el titular,
 * que ya ve esos mismos datos en la respuesta.
 *
 * @param {{cui_dpi: string, tipo_asociado: 'EB'|'EX', identidad: ReturnType<typeof identidadDelBanco>,
 *   cuentas: Array<{id_cuenta_bancaria: number, numero_cuenta_bancaria: string}>}} datos
 * @returns {string}
 */
const firmarAfiliacionToken = ({ cui_dpi, tipo_asociado, identidad, cuentas }) =>
  jwt.sign(
    {
      purpose: PURPOSE,
      cui_dpi,
      tipo_asociado,
      identidad,
      cuentas: cuentas.map((c) => ({ id: c.id_cuenta_bancaria, numero: c.numero_cuenta_bancaria })),
    },
    getSecret(),
    { expiresIn: EXPIRES_IN }
  );

/**
 * @param {string} token
 * @returns {{cui_dpi: string, tipo_asociado: 'EB'|'EX', identidad: NonNullable<ReturnType<typeof identidadDelBanco>>,
 *   cuentas: Array<{id: number, numero: string}>}|null} null si es inválido, venció o no trae la identidad (los
 *   emitidos antes del issue #124).
 */
const verificarAfiliacionToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret());
    if (payload.purpose !== PURPOSE || !payload.cui_dpi || !Array.isArray(payload.cuentas)) return null;
    if (!['EB', 'EX'].includes(payload.tipo_asociado)) return null;
    if (!identidadDelBanco(payload.identidad)) return null;
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
  identidadDelBanco,
  firmarAfiliacionToken,
  verificarAfiliacionToken,
  firmarCargaDocumentosToken,
  verificarCargaDocumentosToken,
};
