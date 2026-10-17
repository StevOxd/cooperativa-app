/**
 * Reversiones con el banco (issue #64).
 *
 * Cuando la cooperativa ya movió dinero en el banco y después no pudo confirmar su parte (falló el COMMIT), o cerró
 * la operación sin hacerla y un intento anterior había dejado el movimiento en el banco, el movimiento se revierte
 * con la referencia `REV-<referencia original>`. Cada reversión queda en `reversiones_pendientes`: RESUELTA si el
 * banco la hizo, DESCARTADA si no había nada que revertir y PENDIENTE si falta hacerla desde «Conciliación». Como el
 * banco es idempotente por referencia (issue #61), reintentar una reversión no mueve el dinero dos veces.
 */
const db = require('../config/db');
const bancoApiService = require('./bancoApiService');
const { FINANCIERO } = require('../config/constants');
const { errorDeNegocio } = require('../utils/errores');

// Operaciones cuya referencia se repite en cada intento (`referenciaDeOperacion`): su reintento reutiliza el
// movimiento del banco en lugar de hacer otro
const ORIGENES_CON_REFERENCIA_FIJA = ['TRASLADO', 'DESEMBOLSO_CREDITO', 'FORMALIZACION_AGENCIA'];

// Si la operación de la cooperativa quedó registrada, según su origen. `$1` es su clave (`clave_operacion`): la
// solicitud, o el asociado o la cuenta que creó ese intento (sus ids salen de una secuencia y no se repiten, así
// que otro intento de la misma persona no se confunde con este). La solicitud se bloquea: un reintento en curso
// termina antes de leerla, y uno que llegue después espera a que la reversión se cierre.
const ASOCIADO_CREADO = 'SELECT EXISTS (SELECT 1 FROM asociados WHERE id_asociado = $1::int) AS aplicada';
const CONSULTA_APLICADA = {
  TRASLADO: "SELECT estado = 'APROBADO' AS aplicada FROM solicitudes_traslado_apertura WHERE id_solicitud = $1::int FOR UPDATE",
  DESEMBOLSO_CREDITO: "SELECT estado = 'APROBADA' AS aplicada FROM solicitudes_credito WHERE id_solicitud_credito = $1::int FOR UPDATE",
  FORMALIZACION_AGENCIA: "SELECT estado = 'ATENDIDA' AS aplicada FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1::int FOR UPDATE",
  APERTURA_CUENTA: 'SELECT EXISTS (SELECT 1 FROM cuentas WHERE id_cuenta = $1::int) AS aplicada',
  AFILIACION_EN_LINEA: ASOCIADO_CREADO,
  AFILIACION_PRESENCIAL: ASOCIADO_CREADO,
};

/**
 * Si la operación de la cooperativa quedó registrada (ver `CONSULTA_APLICADA`).
 *
 * @param {import('pg').PoolClient} client - Dentro de una transacción con `lock_timeout`.
 * @param {string} origen
 * @param {string|number} clave - Id de la solicitud, o del asociado o la cuenta que creó el intento.
 * @returns {Promise<boolean>}
 * @throws {Error} si no se puede leer (por ejemplo, se agota la espera del bloqueo).
 */
const operacionAplicada = async (client, origen, clave) => {
  const res = await client.query(CONSULTA_APLICADA[origen], [String(clave)]);
  return res.rows[0]?.aplicada === true;
};

/**
 * Espera (hasta 5 s) a que la conexión original termine lo que tenga en curso: si su COMMIT informó un error pero
 * el servidor lo sigue aplicando, su resultado se ve después.
 *
 * @param {number} [pid] - `client.processID` de la conexión de la operación.
 */
const esperarConexionOriginal = async (pid) => {
  if (!pid) return;
  for (let intento = 0; intento < 20; intento += 1) {
    const activa = await db.query("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND state = 'active'", [pid])
      .then((res) => res.rowCount > 0)
      .catch(() => false);
    if (!activa) return;
    await new Promise((resolver) => { setTimeout(resolver, 250); });
  }
};

/**
 * Pide al banco el movimiento de reversión.
 *
 * @param {Object} r - Fila de `reversiones_pendientes` o datos equivalentes, con la cuenta.
 * @returns {Promise<Object>} La respuesta de `bancoApiService` (`success`, `status`, `message`).
 */
const pedirReversion = (r) => {
  const datos = {
    numero_cuenta: r.numero_cuenta_bancaria,
    monto: Number(r.monto),
    concepto: r.concepto,
    referencia: r.referencia_reversion,
  };
  return r.tipo_movimiento === 'DEBITO'
    ? bancoApiService.debitarCuenta({ ...datos, cui_dpi: r.cui_dpi || undefined })
    : bancoApiService.acreditarCuenta(datos);
};

/**
 * Anota una reversión como PENDIENTE.
 *
 * @returns {Promise<number|null>} Su id, o null si ya estaba anotada.
 * @throws {Error} si la base de datos no la acepta.
 */
const anotar = async ({ origen, tipo, numeroCuenta, cui, monto, referencia, concepto, detalle, clave }) => {
  const res = await db.query(
    `INSERT INTO reversiones_pendientes
       (origen, tipo_movimiento, numero_cuenta_bancaria, cui_dpi, monto, concepto, referencia_original,
        referencia_reversion, detalle, clave_operacion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (referencia_reversion) DO NOTHING
     RETURNING id_reversion`,
    [origen, tipo, numeroCuenta || null, cui || null, monto, concepto, referencia, `REV-${referencia}`, detalle || null, String(clave)]
  );
  return res.rows[0]?.id_reversion ?? null;
};

/**
 * Cierra una reversión pendiente. Si se anotó sin la cuenta del banco (una apertura que no se confirmó), se guarda
 * la cuenta en que se hizo.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} conexion
 * @param {number} idReversion
 * @param {'RESUELTA'|'DESCARTADA'} estado
 * @param {number|null} [idUsuario] - Quien la cerró; null si la cerró el sistema.
 * @param {string|null} [numeroCuenta]
 */
const cerrar = (conexion, idReversion, estado, idUsuario = null, numeroCuenta = null) => conexion.query(
  `UPDATE reversiones_pendientes
   SET estado = $2, id_usuario_resuelve = $3, fecha_resolucion = CURRENT_TIMESTAMP,
       numero_cuenta_bancaria = COALESCE(numero_cuenta_bancaria, $4)
   WHERE id_reversion = $1 AND estado = 'PENDIENTE'
   RETURNING *`,
  [idReversion, estado, idUsuario, numeroCuenta]
);

/**
 * Revierte en el banco un movimiento cuya operación no quedó registrada en la cooperativa.
 *
 * 1. Anota la reversión como PENDIENTE antes de pedirla: mientras lo esté, la operación no se repite
 *    (`hayReversionPendiente`), así un reintento no reutiliza el movimiento que se está revirtiendo.
 * 2. Espera a que termine la conexión original y, en una transacción, bloquea la operación y confirma si quedó
 *    registrada: si quedó, no se revierte (DESCARTADA); si no se sabe, queda PENDIENTE para el administrador.
 * 3. Con la operación todavía bloqueada, pide la reversión al banco: RESUELTA si la hace; si no, queda PENDIENTE
 *    en «Conciliación».
 *
 * Si no se puede anotar, solo se revierte una operación con referencia por intento: la de referencia fija queda
 * en el banco, porque su reintento la reutiliza.
 *
 * @param {Object} r
 * @param {'TRASLADO'|'APERTURA_CUENTA'|'AFILIACION_EN_LINEA'|'AFILIACION_PRESENCIAL'|'FORMALIZACION_AGENCIA'|'DESEMBOLSO_CREDITO'} r.origen
 * @param {'DEBITO'|'CREDITO'} r.tipo - El movimiento que revierte: DEBITO retira lo acreditado, CREDITO devuelve lo debitado.
 * @param {string} r.numeroCuenta - Cuenta del banco.
 * @param {string} [r.cui] - DPI del titular (el banco lo exige para debitar).
 * @param {number} r.monto
 * @param {string} r.referencia - Referencia del movimiento original.
 * @param {string} r.concepto
 * @param {string} [r.detalle] - Contexto para quien concilie (caso, solicitud).
 * @param {string|number} r.clave - Con qué se confirma si la operación quedó registrada (ver `CONSULTA_APLICADA`): el
 *   id de la solicitud (traslado, crédito, formalización), del asociado (afiliaciones) o de la cuenta (apertura).
 * @param {number} [r.pid] - `client.processID` de la conexión cuyo COMMIT falló.
 * @returns {Promise<{ aplicada: boolean, revertida: boolean, anotada: boolean }>} `aplicada`: la operación sí quedó
 *   registrada y no se revirtió nada.
 */
const revertirOAnotar = async (r) => {
  let idReversion = null;
  let anotada = false;
  try {
    idReversion = await anotar(r);
    anotada = true;
  } catch (anotarError) {
    console.error(`[ERROR] No se pudo anotar la reversión REV-${r.referencia}:`, anotarError.message);
  }
  // Ya estaba anotada (otro proceso la atiende): no se pide otra vez
  if (anotada && idReversion === null) return { aplicada: false, revertida: false, anotada: true };

  await esperarConexionOriginal(r.pid);

  const resultado = { aplicada: false, revertida: false, anotada };
  const client = await db.pool.connect();
  let conexionRota = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    let aplicada;
    try {
      aplicada = await operacionAplicada(client, r.origen, r.clave);
    } catch (lecturaError) {
      console.error(`[ERROR] No se pudo confirmar si quedó registrada la operación ${r.referencia}:`, lecturaError.message);
      aplicada = null;
    }

    if (aplicada) {
      resultado.aplicada = true;
      resultado.anotada = false;
      console.warn(`[WARN] La operación ${r.referencia} quedó registrada: no se revierte.`);
      if (idReversion) await cerrar(client, idReversion, 'DESCARTADA');
      await client.query('COMMIT');
      return resultado;
    }
    if (aplicada === null || (!anotada && ORIGENES_CON_REFERENCIA_FIJA.includes(r.origen))) {
      console.error(`[ERROR] ${r.referencia} quedó en el banco sin revertir (${anotada ? 'pendiente en «Conciliación»' : 'sin anotar'}).`);
      await client.query('ROLLBACK');
      return resultado;
    }

    const respuesta = await pedirReversion({
      tipo_movimiento: r.tipo,
      numero_cuenta_bancaria: r.numeroCuenta,
      cui_dpi: r.cui || null,
      monto: r.monto,
      concepto: r.concepto,
      referencia_reversion: `REV-${r.referencia}`,
    });
    if (!respuesta.success) {
      console.error(`[ERROR] No se pudo revertir ${r.referencia} (${respuesta.status}):`, respuesta.message);
      await client.query('ROLLBACK');
      return resultado;
    }
    resultado.revertida = true;
    resultado.anotada = false;
    if (idReversion) await cerrar(client, idReversion, 'RESUELTA');
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    // Si la reversión se hizo pero no se pudo cerrar, queda PENDIENTE: hacerla otra vez desde «Conciliación» no la
    // repite en el banco
    console.error(`[ERROR] No se pudo cerrar la reversión REV-${r.referencia}:`, error.message);
    await client.query('ROLLBACK').catch(() => { conexionRota = true; });
    if (!resultado.aplicada && !resultado.revertida) resultado.anotada = anotada;
    return resultado;
  } finally {
    client.release(conexionRota);
  }
};

/**
 * Anota la reversión de un movimiento que el banco no confirmó a tiempo (504): pudo hacerse o no. No se pide nada
 * al banco todavía; el administrador la resuelve en «Conciliación», que primero comprueba si el banco tiene el
 * movimiento original. Se usa en las operaciones con referencia por intento, cuyo reintento no reutiliza el
 * movimiento. Para una apertura, la cuenta del banco no se conoce (`numeroCuenta` null): se toma del movimiento al
 * conciliar.
 *
 * @param {Object} r - Los mismos datos de `revertirOAnotar`.
 * @returns {Promise<boolean>} Si quedó anotada.
 */
const anotarSinConfirmar = async (r) => {
  try {
    await anotar(r);
    return true;
  } catch (error) {
    console.error(`[ERROR] No se pudo anotar el movimiento sin confirmar ${r.referencia}:`, error.message);
    return false;
  }
};

/**
 * Error con que se responde cuando falló el COMMIT de una operación que ya movió dinero en el banco, según lo que
 * hizo `revertirOAnotar`. Si la operación quedó registrada no hay error: quien llama sigue como si nada.
 *
 * @param {{ revertida: boolean, anotada: boolean }} resultado
 * @param {Error} commitError
 * @param {string} referencia
 * @returns {Error}
 */
const errorTrasCommitFallido = (resultado, commitError, referencia) => {
  if (resultado.revertida) return commitError;
  return errorDeNegocio(500, resultado.anotada
    ? `La operación no se completó y el movimiento quedó en el banco. No la repita: el administrador lo resolverá en «Conciliación» (referencia ${referencia}).`
    : `La operación no se completó y el movimiento quedó en el banco sin registrar. Avise al administrador antes de repetirla (referencia ${referencia}).`);
};

/**
 * Movimiento que un intento anterior de una operación dejó en el banco sin registrarlo en la cooperativa (por
 * ejemplo, tras un tiempo agotado). Busca la referencia fija y sus sufijos (`-2`…`-5`, ver
 * `conReferenciaDeOperacion`) y devuelve el primero que no esté revertido. Se consulta antes de cerrar la operación
 * sin hacerla (rechazo, devolución, denegación o cancelación), para revertirlo después.
 *
 * @param {string} referencia - `referenciaDeOperacion` de la solicitud.
 * @param {'DEBITO'|'CREDITO'} tipo - El tipo del movimiento de la operación.
 * @returns {Promise<Object|null>} `{ referencia, numero_cuenta, titular_cui, monto }`, o null si no hay.
 * @throws {Error} `errorDeNegocio(502)` si el banco no responde: sin saberlo, la operación no se cierra.
 */
const movimientoSinRegistrar = async (referencia, tipo) => {
  for (let intento = 1; intento <= 5; intento += 1) {
    const ref = intento === 1 ? referencia : `${referencia}-${intento}`;
    const movimiento = await bancoApiService.consultarMovimiento(ref, tipo);
    if (movimiento.status === 404) return null;
    if (!movimiento.success || !movimiento.data) {
      throw errorDeNegocio(502, 'No pudimos consultar el banco para cerrar la solicitud. Intente de nuevo en unos minutos.');
    }
    if (!movimiento.data.revertido) return { ...movimiento.data, referencia: ref };
  }
  return null;
};

/**
 * Revierte el movimiento que encontró `movimientoSinRegistrar`, después de cerrar la operación sin hacerla.
 *
 * @param {Object|null} movimiento - El de `movimientoSinRegistrar`; si es null no hace nada.
 * @param {Object} datos - `origen`, `concepto`, `detalle` y `clave` (ver `revertirOAnotar`).
 * @returns {Promise<{ aplicada: boolean, revertida: boolean, anotada: boolean }|null>} null si no había movimiento.
 */
const revertirMovimientoSinRegistrar = async (movimiento, { origen, concepto, detalle, clave }) => {
  if (!movimiento) return null;
  return revertirOAnotar({
    origen,
    tipo: movimiento.tipo_movimiento === 'DEBITO' ? 'CREDITO' : 'DEBITO',
    numeroCuenta: movimiento.numero_cuenta,
    cui: movimiento.titular_cui,
    monto: Number(movimiento.monto),
    referencia: movimiento.referencia,
    concepto,
    detalle,
    clave,
  });
};

/**
 * Frase para el mensaje de una operación que se cerró sin hacerla, según lo que hizo
 * `revertirMovimientoSinRegistrar`.
 *
 * @param {{ revertida: boolean, anotada: boolean, aplicada: boolean }|null} reversion
 * @returns {string} Vacía si no había movimiento en el banco.
 */
const avisoDeReversion = (reversion) => {
  if (!reversion || reversion.aplicada) return '';
  if (reversion.revertida) return ' Un intento anterior había dejado el movimiento en el banco: se revirtió.';
  return reversion.anotada
    ? ' Un intento anterior dejó un movimiento en el banco que no se pudo revertir: quedó en «Conciliación».'
    : ' Un intento anterior dejó un movimiento en el banco que no se pudo revertir: avise al administrador.';
};

/**
 * Hace una reversión pendiente desde «Conciliación», a nombre del administrador:
 * - DESCARTADA si la operación sí quedó registrada en la cooperativa, o si el banco no tiene el movimiento
 *   original (pasados unos minutos: antes, su llamada puede seguir en curso);
 * - RESUELTA si el banco hace la reversión.
 *
 * Bloquea la operación y después la reversión, en el mismo orden que `revertirOAnotar`.
 *
 * @param {number|string} idReversion
 * @param {number} idUsuario - `id_usuario` del administrador.
 * @returns {Promise<Object>} La reversión cerrada.
 * @throws {Error} `errorDeNegocio` 404 si no existe; 409 si ya está cerrada, si es muy reciente para descartarla, si
 *   el banco tiene el original con otra cuenta u otro monto o si la operación está ocupada; 502 si el banco no
 *   responde o no la hace.
 */
const reintentarReversion = async (idReversion, idUsuario) => {
  const operacion = (await db.query(
    'SELECT origen, clave_operacion FROM reversiones_pendientes WHERE id_reversion = $1', [idReversion]
  )).rows[0];
  if (!operacion) throw errorDeNegocio(404, 'No encontramos esa reversión.');

  const client = await db.pool.connect();
  let conexionRota = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    // 1. Si la operación quedó registrada, el dinero movido es suyo: no se revierte
    const aplicada = await operacionAplicada(client, operacion.origen, operacion.clave_operacion);
    const res = await client.query(
      `SELECT *, fecha_registro < now() - make_interval(mins => $2) AS se_puede_descartar
       FROM reversiones_pendientes WHERE id_reversion = $1 FOR UPDATE`,
      [idReversion, FINANCIERO.MINUTOS_PARA_CONCILIAR]
    );
    const reversion = res.rows[0];
    if (reversion.estado !== 'PENDIENTE') throw errorDeNegocio(409, 'Esa reversión ya está cerrada.');

    const terminar = async (estado, numeroCuenta = null) => {
      const cerrada = await cerrar(client, idReversion, estado, idUsuario, numeroCuenta);
      await client.query('COMMIT');
      return cerrada.rows[0];
    };
    if (aplicada) return terminar('DESCARTADA');

    // 2. Si el banco no tiene el movimiento original, no hay nada que revertir (revertirlo crearía dinero)
    const tipoOriginal = reversion.tipo_movimiento === 'DEBITO' ? 'CREDITO' : 'DEBITO';
    const original = await bancoApiService.consultarMovimiento(reversion.referencia_original, tipoOriginal);
    if (original.status === 404) {
      if (!reversion.se_puede_descartar) {
        throw errorDeNegocio(409, `El banco todavía no muestra el movimiento original. Vuelva a intentarlo pasados ${FINANCIERO.MINUTOS_PARA_CONCILIAR} minutos.`);
      }
      return terminar('DESCARTADA');
    }
    if (!original.success || !original.data) {
      throw errorDeNegocio(502, 'No se pudo consultar el banco. Intente de nuevo en unos minutos.');
    }
    // Sin cuenta anotada (una apertura que no se confirmó), se revierte en la cuenta del movimiento original
    const numeroCuenta = reversion.numero_cuenta_bancaria || original.data.numero_cuenta;
    const mismaCuenta = String(original.data.numero_cuenta).trim().toLowerCase() === String(numeroCuenta).trim().toLowerCase();
    if (!mismaCuenta || Number(original.data.monto) !== Number(reversion.monto)) {
      throw errorDeNegocio(409, 'El banco tiene el movimiento original con otra cuenta u otro monto. Revíselo con el banco antes de cerrarlo.');
    }

    // 3. La reversión
    const resultado = await pedirReversion({ ...reversion, numero_cuenta_bancaria: numeroCuenta });
    if (!resultado.success) {
      console.error(`[ERROR] El banco no aceptó la reversión ${reversion.referencia_reversion} (${resultado.status}):`, resultado.message);
      throw errorDeNegocio(502, 'El banco no aceptó la reversión. Revise la cuenta en el banco y vuelva a intentarlo.');
    }
    return terminar('RESUELTA', numeroCuenta);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { conexionRota = true; });
    if (error.code === '55P03') throw errorDeNegocio(409, 'Esa operación se está atendiendo en este momento. Vuelva a intentarlo en unos segundos.');
    throw error;
  } finally {
    client.release(conexionRota);
  }
};

/**
 * Si hay una reversión pendiente de una operación (su referencia o los intentos con sufijo, `REF-2`…). Mientras
 * la haya, la operación no se repite: un reintento reutilizaría el movimiento que se está revirtiendo.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} referencia - Referencia de la operación (`SOL-CRED-…`, `CASO-…`).
 * @returns {Promise<boolean>}
 */
const hayReversionPendiente = async (client, referencia) => {
  const res = await client.query(
    `SELECT 1 FROM reversiones_pendientes
     WHERE estado = 'PENDIENTE' AND (referencia_original = $1 OR referencia_original LIKE $1 || '-%')
     LIMIT 1`,
    [referencia]
  );
  return res.rowCount > 0;
};

/**
 * Si una persona tiene pendiente retirar de una cuenta del banco el depósito de una apertura que no se completó
 * (afiliación en ventanilla o formalización), o confirmar si esa apertura se hizo. Mientras la haya, no se le abre
 * otra cuenta con efectivo: tendría el depósito dos veces y podría retirarlo antes de la reversión.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} cui
 * @returns {Promise<boolean>}
 */
const hayAperturaPorRevertirDelDpi = async (client, cui) => {
  const res = await client.query(
    `SELECT 1 FROM reversiones_pendientes
     WHERE estado = 'PENDIENTE' AND cui_dpi = $1 AND tipo_movimiento = 'DEBITO'
       AND origen IN ('AFILIACION_PRESENCIAL', 'FORMALIZACION_AGENCIA')
     LIMIT 1`,
    [cui]
  );
  return res.rowCount > 0;
};

module.exports = {
  revertirOAnotar,
  anotarSinConfirmar,
  errorTrasCommitFallido,
  movimientoSinRegistrar,
  revertirMovimientoSinRegistrar,
  avisoDeReversion,
  reintentarReversion,
  hayReversionPendiente,
  hayAperturaPorRevertirDelDpi,
};
