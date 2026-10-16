/**
 * Identificadores que llegan en la URL o en el cuerpo de una petición.
 *
 * Un id de fila (SERIAL) se acepta solo como dígitos que caben en INT. Postgres convertiría también
 * textos como "+5" o "0x5" al mismo número, así que quien revise un permiso y quien haga la consulta
 * deben decidir con esta misma regla.
 */
const ES_ID = /^\d{1,9}$/;

/**
 * @param {unknown} valor
 * @returns {boolean} true si es un id numérico válido.
 */
const esId = (valor) => ES_ID.test(String(valor ?? '').trim());

/**
 * Condición SQL para ubicar al usuario de `:id`. Un id válido es su id_usuario; cualquier otro valor, su
 * código. Así un código numérico (por ejemplo «1001») nunca se confunde con el id de otro usuario (issue #32).
 *
 * @param {string} id - Parámetro `:id` de la ruta.
 * @param {string} [alias] - Alias de la tabla usuarios en la consulta (vacío si no tiene).
 * @returns {{condicion: string, valor: number|string}} Condición con el parámetro $1 y su valor.
 */
const filtroUsuario = (id, alias = 'u') => {
  const prefijo = alias ? `${alias}.` : '';
  const texto = String(id ?? '').trim();
  return esId(texto)
    ? { condicion: `${prefijo}id_usuario = $1`, valor: Number(texto) }
    : { condicion: `${prefijo}codigo_corporativo = $1`, valor: texto };
};

module.exports = { esId, filtroUsuario };
