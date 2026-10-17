const { errorDeNegocio } = require('./errores');

/**
 * Monto en quetzales para los mensajes (`Q1,234.50`).
 *
 * @param {number|string} monto
 * @returns {string}
 */
const formatoQ = (monto) => `Q${Number(monto).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Lee un monto: número mayor que cero, con hasta 2 decimales y que cabe en NUMERIC(14,2). `parseFloat` dejaba pasar
 * textos como «12abc» y `NaN`; esto no.
 *
 * @param {unknown} valor
 * @param {string} [que='un monto'] - Qué se pide, para el mensaje («un monto en efectivo»).
 * @returns {number} El monto.
 * @throws {Error} `errorDeNegocio(400)` si no es válido.
 */
const leerMonto = (valor, que = 'un monto') => {
  const texto = String(valor ?? '').trim();
  const monto = Number(texto);
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(texto) || !(monto > 0)) {
    throw errorDeNegocio(400, `Escriba ${que} mayor que Q0.00, con hasta 2 decimales.`);
  }
  return monto;
};

module.exports = { formatoQ, leerMonto };
