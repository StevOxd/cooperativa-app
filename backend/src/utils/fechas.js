/**
 * Fechas de los filtros (AAAA-MM-DD). Las consultas cuentan los días completos en hora de Guatemala.
 */

/**
 * Fecha AAAA-MM-DD que existe en el calendario (no 2026-02-30).
 *
 * @param {string} texto
 * @returns {boolean}
 */
const fechaValida = (texto) => {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
};

/**
 * Días de diferencia entre dos fechas válidas (0 si son la misma).
 *
 * @param {string} desde - AAAA-MM-DD.
 * @param {string} hasta - AAAA-MM-DD.
 * @returns {number}
 */
const diasEntre = (desde, hasta) => (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;

/**
 * Condición SQL para una columna TIMESTAMPTZ dentro de un rango de días completos en hora de Guatemala; «hasta»
 * incluye ese día.
 *
 * @param {string} columna - Columna (código, nunca un valor del usuario).
 * @param {number} indiceDesde - Posición del parámetro con «desde»; «hasta» va en la siguiente.
 * @returns {string}
 */
const entreDiasGuatemala = (columna, indiceDesde) =>
  `${columna} >= ($${indiceDesde}::date)::timestamp AT TIME ZONE 'America/Guatemala'
   AND ${columna} < ($${indiceDesde + 1}::date + 1)::timestamp AT TIME ZONE 'America/Guatemala'`;

module.exports = { fechaValida, diasEntre, entreDiasGuatemala };
