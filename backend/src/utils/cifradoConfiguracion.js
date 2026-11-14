const crypto = require('crypto');

/**
 * Cifrado de los secretos que se guardan en `configuracion_sistema` (contraseñas del correo del sistema).
 *
 * AES-256-GCM con una clave derivada de JWT_SECRET (HKDF), así que una copia de la base sola no revela las
 * contraseñas. Si JWT_SECRET cambia, los valores guardados ya no se descifran: el correo queda sin configurar y el
 * administrador lo vuelve a configurar desde la pantalla.
 */

const PREFIJO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';
const BYTES_CLAVE = 32;
const BYTES_IV = 12;
const BYTES_ETIQUETA = 16;
const CONTEXTO_CLAVE = 'cooperativa:configuracion-sistema';

const clave = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no está definido.');
  return Buffer.from(crypto.hkdfSync('sha256', process.env.JWT_SECRET, Buffer.alloc(0), CONTEXTO_CLAVE, BYTES_CLAVE));
};

/**
 * @param {string} valor
 * @returns {boolean} true si el valor ya está cifrado con este formato.
 */
const estaCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

/**
 * Cifra un secreto para guardarlo.
 *
 * @param {string} texto
 * @returns {string} `enc:v1:` + base64(iv | etiqueta | texto cifrado).
 */
const cifrar = (texto) => {
  const iv = crypto.randomBytes(BYTES_IV);
  const cifrador = crypto.createCipheriv(ALGORITMO, clave(), iv);
  const cifrado = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  return PREFIJO + Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64');
};

/**
 * Descifra un secreto guardado. Un valor sin el prefijo es de antes del cifrado y se devuelve tal cual (el arranque
 * lo vuelve a guardar cifrado).
 *
 * @param {string} valor
 * @returns {string|null} null si no se puede descifrar (otra clave o valor alterado).
 */
const descifrar = (valor) => {
  if (!estaCifrado(valor)) return valor;
  try {
    const datos = Buffer.from(valor.slice(PREFIJO.length), 'base64');
    const iv = datos.subarray(0, BYTES_IV);
    const etiqueta = datos.subarray(BYTES_IV, BYTES_IV + BYTES_ETIQUETA);
    const descifrador = crypto.createDecipheriv(ALGORITMO, clave(), iv);
    descifrador.setAuthTag(etiqueta);
    return Buffer.concat([descifrador.update(datos.subarray(BYTES_IV + BYTES_ETIQUETA)), descifrador.final()]).toString(
      'utf8'
    );
  } catch {
    return null;
  }
};

module.exports = { cifrar, descifrar, estaCifrado };
