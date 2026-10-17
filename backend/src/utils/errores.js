/**
 * Errores que llegan a la respuesta HTTP.
 *
 * Un error de negocio se lanza con su estado HTTP y un mensaje pensado para el usuario. Cualquier otro error
 * (de la base de datos, de un servicio, un fallo de programación) es inesperado: al usuario solo le llega un
 * mensaje genérico y el detalle queda en el registro del servidor.
 */

/**
 * Error de negocio: su mensaje se muestra al usuario tal cual.
 *
 * @param {number} statusCode - Estado HTTP de la respuesta.
 * @param {string} message - Mensaje para el usuario.
 * @returns {Error} con `statusCode`.
 */
const errorDeNegocio = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/**
 * Estado y mensaje con que se responde un error.
 *
 * @param {Error & {statusCode?: number}} error - El error capturado.
 * @param {string} mensajeGenerico - Lo que ve el usuario si el error es inesperado.
 * @returns {{status: number, message: string}}
 */
const respuestaDeError = (error, mensajeGenerico) =>
  Number.isInteger(error?.statusCode)
    ? { status: error.statusCode, message: error.message }
    : { status: 500, message: mensajeGenerico };

module.exports = { errorDeNegocio, respuestaDeError };
