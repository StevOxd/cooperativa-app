/**
 * Generadores de PDF que se cargan al usarlos (issue #21).
 *
 * jsPDF es de lo más pesado de la aplicación: con estos envoltorios solo se descarga la primera vez
 * que alguien genera un documento, no al abrir la aplicación. Cada función devuelve una promesa que se
 * resuelve cuando el PDF ya se descargó; quien la llama la espera dentro de su try/catch.
 */

// Mientras un documento se genera (la primera vez incluye descargar jsPDF), otro clic en el mismo
// botón no lo vuelve a generar: al llegar el archivo saldrían varias descargas iguales.
const enCurso = new Map();

const generarUnaVez = (nombre, cargar, opciones) => {
  if (!enCurso.has(nombre)) {
    const generacion = cargar()
      .then((modulo) => modulo[nombre](opciones))
      .finally(() => enCurso.delete(nombre));
    enCurso.set(nombre, generacion);
  }
  return enCurso.get(nombre);
};

/**
 * Constancia de la solicitud de afiliación en agencia. Ver `affiliationCasePdf.js`.
 *
 * @param {Object} opciones - Las mismas de `affiliationCasePdf.generateAffiliationCasePdf`.
 * @returns {Promise<import('jspdf').jsPDF>} El documento, ya descargado.
 */
export const generateAffiliationCasePdf = (opciones) =>
  generarUnaVez('generateAffiliationCasePdf', () => import('./affiliationCasePdf'), opciones);

/**
 * Comprobante de afiliación o de apertura de cuenta. Ver `accountOpeningReceiptPdf.js`.
 *
 * @param {Object} opciones - Las mismas de `accountOpeningReceiptPdf.generateAccountOpeningReceiptPdf`.
 * @returns {Promise<import('jspdf').jsPDF>} El documento, ya descargado.
 */
export const generateAccountOpeningReceiptPdf = (opciones) =>
  generarUnaVez('generateAccountOpeningReceiptPdf', () => import('./accountOpeningReceiptPdf'), opciones);

/**
 * Estado de cuenta. Ver `accountStatementPdf.js`.
 *
 * @param {Object} opciones - Las mismas de `accountStatementPdf.generateAccountStatementPdf`.
 * @returns {Promise<import('jspdf').jsPDF>} El documento, ya descargado.
 */
export const generateAccountStatementPdf = (opciones) =>
  generarUnaVez('generateAccountStatementPdf', () => import('./accountStatementPdf'), opciones);

/**
 * Formulario de solicitud de crédito para firmar. Ver `creditApplicationPdf.js`.
 *
 * @param {Object} opciones - Las mismas de `creditApplicationPdf.generateCreditApplicationPdf`.
 * @returns {Promise<import('jspdf').jsPDF>} El documento, ya descargado.
 */
export const generateCreditApplicationPdf = (opciones) =>
  generarUnaVez('generateCreditApplicationPdf', () => import('./creditApplicationPdf'), opciones);
