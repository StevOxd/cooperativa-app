const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { DOCUMENTOS } = require('../config/constants');
const { errorDeNegocio } = require('./errores');
const { UPLOADS_ROOT } = require('./fileStorage');

/**
 * Archivos de los documentos de afiliación (DPI, recibo, foto con el DPI y constancia de ingresos).
 *
 * El formato se decide por el contenido (firma de bytes), nunca por el nombre ni por lo que declare el cliente, y el
 * nombre en disco lo genera el servidor (`doc_<uuid>.<ext>`). No se guarda el nombre original del archivo.
 */

const SUBCARPETA = 'afiliaciones';
const CARPETA = path.join(UPLOADS_ROOT, SUBCARPETA);

// Extensión en disco por tipo MIME
const EXTENSIONES = Object.freeze({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' });
const MIME_POR_EXTENSION = Object.freeze({ pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' });

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIN_JPEG = Buffer.from([0xff, 0xd9]);

// Un PDF con scripts, acciones que abren programas o envían datos, archivos incrustados o formularios XFA no se
// acepta: el personal lo abre en su navegador. Es una revisión por nombres (un flujo comprimido podría esconderlos),
// no un antivirus. /OpenAction y /URI no se rechazan: muchos generadores los usan para la vista inicial y los enlaces.
const PDF_CONTENIDO_ACTIVO =
  /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE)(?![A-Za-z0-9])/;

/**
 * Indica si un PDF trae contenido activo. Los nombres de un PDF pueden escribir letras como `#xx` (`/J#53` es `/JS`):
 * se decodifican antes de buscar.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
const pdfConContenidoActivo = (buffer) =>
  PDF_CONTENIDO_ACTIVO.test(
    buffer.toString('latin1').replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  );

const DATA_URI = /^data:(application\/pdf|image\/jpeg|image\/png);base64,/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Formato real del archivo según sus bytes, o null si no es un PDF, JPG o PNG completo.
 *
 * @param {Buffer} buffer
 * @returns {'application/pdf'|'image/jpeg'|'image/png'|null}
 */
const detectarFormato = (buffer) => {
  if (buffer.length >= 8 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    // El fin de archivo va en el último KB (puede haber espacios o un salto de línea después)
    return buffer.subarray(-1024).includes('%%EOF', 0, 'latin1') ? 'application/pdf' : null;
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return buffer.lastIndexOf(FIN_JPEG) > 2 ? 'image/jpeg' : null;
  }
  if (buffer.length >= 20 && buffer.subarray(0, 8).equals(FIRMA_PNG)) {
    return buffer.includes('IEND', 8, 'latin1') ? 'image/png' : null;
  }
  return null;
};

/**
 * Lee y valida un documento que llega como Data URI.
 *
 * @param {unknown} dataUri - `data:<application/pdf|image/jpeg|image/png>;base64,<contenido>`.
 * @returns {{ buffer: Buffer, mime: string, extension: string, sha256: string }}
 * @throws {Error} 400 si no es un PDF, JPG o PNG válido (o no coincide con lo declarado), está vacío o el PDF tiene
 *   contenido activo; 413 si pasa de 5 MB.
 */
const leerDocumento = (dataUri) => {
  if (typeof dataUri !== 'string' || dataUri.length === 0) {
    throw errorDeNegocio(400, 'Adjunte el archivo del documento.');
  }
  const encabezado = DATA_URI.exec(dataUri.slice(0, 40));
  if (!encabezado) {
    throw errorDeNegocio(400, 'El archivo debe ser un PDF, JPG o PNG.');
  }
  const contenido = dataUri.slice(encabezado[0].length);
  // El tamaño se calcula antes de decodificar, para no reservar memoria por un archivo que no se va a aceptar
  const relleno = contenido.endsWith('==') ? 2 : contenido.endsWith('=') ? 1 : 0;
  const bytesEstimados = Math.floor((contenido.length * 3) / 4) - relleno;
  if (bytesEstimados > DOCUMENTOS.TAMANO_MAXIMO_BYTES) {
    throw errorDeNegocio(413, 'El archivo pasa de 5 MB. Redúzcalo o tome la foto con menos resolución.');
  }
  if (contenido.length === 0 || contenido.length % 4 !== 0 || !BASE64.test(contenido)) {
    throw errorDeNegocio(400, 'El archivo llegó dañado. Vuelva a seleccionarlo.');
  }

  const buffer = Buffer.from(contenido, 'base64');
  const declarado = encabezado[1];
  const formato = detectarFormato(buffer);
  if (!formato || formato !== declarado) {
    throw errorDeNegocio(400, 'El archivo no es un PDF, JPG o PNG válido.');
  }
  if (formato === 'application/pdf' && pdfConContenidoActivo(buffer)) {
    throw errorDeNegocio(400, 'El PDF trae formularios o código. Escanéelo de nuevo o súbalo como imagen.');
  }

  return {
    buffer,
    mime: formato,
    extension: EXTENSIONES[formato],
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
};

/**
 * Guarda el documento con un nombre nuevo (`doc_<uuid>.<ext>`). Nunca sobrescribe un archivo.
 *
 * @param {Buffer} buffer
 * @param {string} extension - `pdf`, `jpg` o `png` (la de `leerDocumento`).
 * @returns {Promise<string>} El nombre del archivo guardado.
 */
const guardarDocumento = async (buffer, extension) => {
  await fs.promises.mkdir(CARPETA, { recursive: true });
  const archivo = `doc_${crypto.randomUUID()}.${extension}`;
  await fs.promises.writeFile(path.join(CARPETA, archivo), buffer, { flag: 'wx', mode: 0o640 });
  return archivo;
};

/**
 * Ruta en disco de un documento ya registrado.
 *
 * @param {string} archivo - Nombre guardado en `documentos_afiliacion.archivo`.
 * @returns {string}
 */
const rutaDocumento = (archivo) => path.join(CARPETA, path.basename(archivo));

/**
 * Tipo MIME de un documento por su extensión en disco (la puso el servidor según el contenido).
 *
 * @param {string} archivo
 * @returns {string}
 */
const mimeDeDocumento = (archivo) => MIME_POR_EXTENSION[path.extname(archivo).slice(1)] || 'application/octet-stream';

/**
 * Borra el archivo de una carga que no se completó, salvo que un documento lo tenga: un INSERT o un COMMIT que
 * informó un error pudo aplicarse igual. Sin poder comprobarlo, el archivo se conserva.
 *
 * @param {string|null} archivo
 * @returns {Promise<void>}
 */
const eliminarDocumentoSinUso = async (archivo) => {
  if (!archivo) return;
  const enUso = await db.query('SELECT 1 FROM documentos_afiliacion WHERE archivo = $1', [archivo])
    .then((r) => r.rowCount > 0)
    .catch(() => true);
  if (enUso) return;
  await fs.promises.unlink(rutaDocumento(archivo)).catch((error) => {
    if (error.code !== 'ENOENT') console.warn(`[WARN] No se pudo borrar el documento ${archivo}:`, error.message);
  });
};

module.exports = {
  SUBCARPETA,
  leerDocumento,
  guardarDocumento,
  rutaDocumento,
  mimeDeDocumento,
  eliminarDocumentoSinUso,
  detectarFormato,
};
