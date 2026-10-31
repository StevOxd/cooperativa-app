/**
 * Tamaño máximo del cuerpo de una petición (issue #99). La API acepta 1 MB; solo las rutas que envían archivos en
 * Base64 dentro del JSON aceptan más. `frontend/nginx.conf` repite estas mismas rutas con los mismos topes (lo
 * comprueba `testLoteIssues.js`): si se agrega una ruta de archivos, va en los dos lados.
 */

/** Documentos de afiliación: hasta 5 MB, unos 6.7 MB en Base64. */
const RUTAS_DOCUMENTOS = /^\/api\/(asociado\/documentos|admin\/asociados\/([0-9]+\/documentos|documentos-afiliacion)|operador\/afiliaciones\/[0-9]+\/documentos|afiliacion\/(personal\/)?documentos)$/;

/** PDF firmado de una solicitud de crédito: hasta 10 MB, unos 13.4 MB en Base64. */
const RUTAS_PDF_CREDITO = /^\/api\/(asociado\/creditos\/[0-9]+\/subir-expediente-firmado|operador\/creditos\/[0-9]+\/elevar|ejecutivo\/creditos\/[0-9]+\/resolver)$/;

const LIMITES = Object.freeze({ GENERAL: '1mb', DOCUMENTOS: '8mb', PDF_CREDITO: '14mb' });

/**
 * Tope del cuerpo para una ruta.
 *
 * @param {string} ruta - `req.path`.
 * @returns {string} Por ejemplo `'1mb'`.
 */
const limiteDeRuta = (ruta) => {
  if (RUTAS_DOCUMENTOS.test(ruta)) return LIMITES.DOCUMENTOS;
  if (RUTAS_PDF_CREDITO.test(ruta)) return LIMITES.PDF_CREDITO;
  return LIMITES.GENERAL;
};

module.exports = { RUTAS_DOCUMENTOS, RUTAS_PDF_CREDITO, LIMITES, limiteDeRuta };
