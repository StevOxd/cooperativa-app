/**
 * Efectivo recibido en ventanilla: la aportación al afiliar, la formalización de una solicitud de agencia, la
 * apertura de cuentas y el depósito a la cuenta del banco de un colaborador.
 *
 * Cada entrada queda registrada (`efectivo_ventanilla`, o `depositos_ventanilla_banco` para el depósito) y entre
 * todas no pueden pasar el tope del día por persona (`FINANCIERO.EFECTIVO_VENTANILLA_DIARIO_POR_PERSONA`).
 */
const { FINANCIERO } = require('../config/constants');
const { errorDeNegocio } = require('../utils/errores');
const { formatoQ, leerMonto } = require('../utils/montos');

const TOPE_DIARIO = FINANCIERO.EFECTIVO_VENTANILLA_DIARIO_POR_PERSONA;

/**
 * Lee un monto en efectivo (`leerMonto`) que no pase el tope del día.
 *
 * @param {unknown} valor
 * @returns {number} El monto.
 * @throws {Error} `errorDeNegocio(400)` si no es válido.
 */
const leerMontoEfectivo = (valor) => {
  const monto = leerMonto(valor, 'un monto en efectivo');
  if (monto > TOPE_DIARIO) {
    throw errorDeNegocio(400, `El efectivo en ventanilla es de hasta ${formatoQ(TOPE_DIARIO)} por persona al día.`);
  }
  return monto;
};

/**
 * Bloquea el efectivo de una persona hasta el fin de la transacción: dos entradas simultáneas para la misma
 * persona se suman en orden y no pasan juntas el tope. Si otra operación de esa persona lo tiene más de 15 s
 * (llama al banco), se responde 409 en lugar de esperar sin límite.
 *
 * @param {import('pg').PoolClient} client - Dentro de una transacción.
 * @param {string} cui
 * @throws {Error} `errorDeNegocio(409)` si no se obtiene a tiempo.
 */
const bloquearEfectivoDePersona = async (client, cui) => {
  await client.query("SET LOCAL lock_timeout = '15s'");
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`efectivo-ventanilla:${cui}`]);
  } catch (error) {
    if (error.code === '55P03') {
      throw errorDeNegocio(409, 'Hay otra operación en efectivo en curso para esta persona. Espere un momento y vuelva a intentarlo.');
    }
    throw error;
  }
  await client.query('SET LOCAL lock_timeout TO DEFAULT');
};

/**
 * Efectivo de una persona en el día (hora de Guatemala), sumando todas las vías. Del depósito al banco cuenta lo
 * que pudo haber entrado: no los rechazados ni los revertidos.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} cui
 * @returns {Promise<number>}
 */
const efectivoDelDia = async (client, cui) => {
  // La fecha va escrita en cada WHERE (no en un CTE) para que los índices (DPI, fecha) la usen
  const res = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(monto), 0) FROM efectivo_ventanilla
         WHERE cui_dpi = $1
           AND fecha_registro >= date_trunc('day', now() AT TIME ZONE 'America/Guatemala') AT TIME ZONE 'America/Guatemala')
       + (SELECT COALESCE(SUM(monto), 0) FROM depositos_ventanilla_banco
         WHERE titular_cui = $1
           AND fecha_deposito >= date_trunc('day', now() AT TIME ZONE 'America/Guatemala') AT TIME ZONE 'America/Guatemala'
           AND estado IN ('PENDIENTE', 'ACREDITADO', 'SIN_CONFIRMAR')) AS total`,
    [cui]
  );
  return Number(res.rows[0].total);
};

/**
 * Mensaje si `monto` más lo que la persona ya recibió hoy pasa el tope, o null si cabe.
 *
 * @param {import('pg').PoolClient} client - Con el efectivo de la persona ya bloqueado.
 * @param {string} cui
 * @param {number} monto
 * @returns {Promise<string|null>}
 */
const excesoDelDia = async (client, cui, monto) => {
  const hoy = await efectivoDelDia(client, cui);
  if (hoy + monto <= TOPE_DIARIO) return null;
  return `Esta persona ya recibió ${formatoQ(hoy)} hoy en efectivo de ventanilla; el máximo por día es ${formatoQ(TOPE_DIARIO)}.`;
};

/**
 * Registra una entrada de efectivo dentro de la transacción de la operación (si esta se deshace, el registro
 * también), después de comprobar el tope del día.
 *
 * @param {import('pg').PoolClient} client - Dentro de una transacción.
 * @param {Object} e
 * @param {number} e.idOperador - `id_usuario` de quien recibe el efectivo.
 * @param {string} e.cui - DPI de la persona (13 dígitos).
 * @param {number} e.monto
 * @param {'AFILIACION_PRESENCIAL'|'FORMALIZACION_AGENCIA'|'APERTURA_CUENTA'} e.origen
 * @param {string} [e.referencia]
 * @throws {Error} `errorDeNegocio(400)` si pasa el tope del día.
 */
const registrarEfectivo = async (client, { idOperador, cui, monto, origen, referencia }) => {
  await bloquearEfectivoDePersona(client, cui);
  const exceso = await excesoDelDia(client, cui, monto);
  if (exceso) throw errorDeNegocio(400, exceso);
  await client.query(
    `INSERT INTO efectivo_ventanilla (id_usuario_operador, cui_dpi, monto, origen, referencia)
     VALUES ($1, $2, $3, $4, $5)`,
    [idOperador, cui, monto, origen, referencia || null]
  );
};

module.exports = {
  TOPE_DIARIO,
  leerMontoEfectivo,
  bloquearEfectivoDePersona,
  excesoDelDia,
  registrarEfectivo,
};
