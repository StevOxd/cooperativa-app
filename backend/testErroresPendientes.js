// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testErroresPendientes.js
 *
 * - Los números de caso no se repiten a partir del 10000 (el correlativo no se corta a 4 dígitos).
 * - El operador solo rechaza créditos: la aprobación y el desembolso son del ejecutivo.
 * - El desembolso del ejecutivo acredita en el banco como último paso: si el banco falla no se aprueba nada,
 *   y si falla el COMMIT la acreditación se revierte (salvo que el COMMIT sí se haya aplicado).
 * - Un traslado con un intento por revertir no se aprueba, tampoco si la reversión empieza mientras se aprueba.
 * - La reversión automática espera a que termine quien tenga la operación y no revierte si quedó hecha.
 * - Al denegar o rechazar, el movimiento que un intento anterior dejó en el banco se revierte; sin poder consultar
 *   el banco, la solicitud no se cierra.
 * - El desembolso a una cuenta de la cooperativa registra su movimiento.
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. El banco se simula: la prueba no mueve
 * dinero en banco_db. Limpia lo que crea.
 *
 * La prueba de los números de caso lleva un instante las secuencias reales a 12344 y las devuelve a su valor:
 * no la corra mientras se registran traslados o afiliaciones en el backend del puerto 5001.
 */
const fs = require('fs');
const path = require('path');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { runMigrations } = require('./src/config/migrations');
const { estadoPorFalloDelBanco } = require('./src/utils/errores');
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba, purgarReversionesDePrueba, poolDueno } = require('./testHelper');

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 prueba').toString('base64')}`;
const CARPETA_CREDITOS = path.join(__dirname, 'uploads', 'creditos');

/**
 * Número de caso que genera un trigger cuando su secuencia va en `valor`. Usa una tabla temporal con el mismo
 * trigger y devuelve la secuencia a su valor anterior (setval no se deshace con ROLLBACK). Lo hace el rol dueño:
 * el de la aplicación no crea tablas temporales ni cambia secuencias.
 */
const numeroDeCaso = async (funcion, secuencia, valor) => {
  const client = await poolDueno(db.pool).connect();
  try {
    const previo = (await client.query(`SELECT last_value, is_called FROM ${secuencia}`)).rows[0];
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE prueba_numero_caso (numero_caso TEXT) ON COMMIT DROP');
    await client.query(`CREATE TRIGGER prueba_numero_caso BEFORE INSERT ON prueba_numero_caso FOR EACH ROW EXECUTE FUNCTION ${funcion}()`);
    await client.query('SELECT setval($1, $2, true)', [secuencia, valor]);
    try {
      return (await client.query("INSERT INTO prueba_numero_caso VALUES ('') RETURNING numero_caso")).rows[0].numero_caso;
    } finally {
      // Primero se cierra la transacción (si el INSERT falló, está abortada); setval funciona fuera de ella
      await client.query('ROLLBACK').catch(() => {});
      await client.query('SELECT setval($1, $2, $3)', [secuencia, previo.last_value, previo.is_called]);
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
};

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] ERRORES PENDIENTES (H-29 a H-31)');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const dpiAsociado = `946${sufijo}000`.slice(0, 13);
  const anio = new Date().getFullYear();
  const tokens = [];
  const solicitudes = [];
  // Referencias de las operaciones de la prueba, para borrar sus reversiones
  const referencias = [];
  let idPersona = null;
  let errorInesperado = false;

  // Banco simulado y registro del orden de las consultas del desembolso
  const original = {
    obtenerCuentasCliente: bancoApiService.obtenerCuentasCliente,
    acreditarCuenta: bancoApiService.acreditarCuenta,
    debitarCuenta: bancoApiService.debitarCuenta,
    consultarMovimiento: bancoApiService.consultarMovimiento,
    connect: db.pool.connect,
  };
  // movimientos: los que el banco simulado tiene de intentos anteriores, por «referencia|tipo»
  const banco = { acreditar: null, debitar: null, cuentas: [], acreditaciones: [], reversiones: [], movimientos: {}, caido: false };
  let registro = [];
  // null, 'falla' (el COMMIT no se aplica) o 'aplicadoConError' (se aplica, pero la conexión informa un error)
  let modoCommit = null;
  bancoApiService.obtenerCuentasCliente = async () => ({ success: true, status: 200, data: banco.cuentas });
  bancoApiService.acreditarCuenta = async (datos) => {
    registro.push('ACREDITAR');
    banco.acreditaciones.push(datos);
    return banco.acreditar || { success: true, status: 200 };
  };
  bancoApiService.debitarCuenta = async (datos) => {
    banco.reversiones.push(datos);
    return banco.debitar || { success: true, status: 200 };
  };
  bancoApiService.consultarMovimiento = async (referencia, tipo) => {
    if (banco.caido) return { success: false, status: 503, message: 'Banco no disponible' };
    const movimiento = banco.movimientos[`${referencia}|${tipo}`];
    return movimiento
      ? { success: true, status: 200, data: { referencia, tipo_movimiento: tipo, revertido: false, ...movimiento } }
      : { success: false, status: 404, message: 'No hay un movimiento con esa referencia.' };
  };
  // Solo se interceptan las transacciones (connect() sin argumentos); pool.query usa connect con callback
  db.pool.connect = async (...args) => {
    if (args.length) return original.connect.apply(db.pool, args);
    const client = await original.connect.call(db.pool);
    const queryOriginal = client.query;
    const releaseOriginal = client.release;
    client.query = async function (texto, ...resto) {
      const sql = typeof texto === 'string' ? texto.trim() : '';
      if (/^(UPDATE solicitudes_credito|COMMIT)/.test(sql)) registro.push(sql.split(/\s+/).slice(0, 2).join(' '));
      if (sql === 'COMMIT' && modoCommit) {
        const modo = modoCommit;
        modoCommit = null;
        await queryOriginal.call(this, modo === 'falla' ? 'ROLLBACK' : 'COMMIT');
        throw new Error('COMMIT simulado que informa un error');
      }
      return queryOriginal.call(this, texto, ...resto);
    };
    client.release = function (...a) {
      client.query = queryOriginal;
      client.release = releaseOriginal;
      return releaseOriginal.apply(this, a);
    };
    return client;
  };

  try {
    await runMigrations();

    // ------------------------------------------------------------------
    console.log('--- Números de caso ---');
    const traslado = await numeroDeCaso('trg_generar_numero_caso', 'seq_numero_caso_traslado', 12344);
    const trasladoCorto = await numeroDeCaso('trg_generar_numero_caso', 'seq_numero_caso_traslado', 6);
    const afiliacion = await numeroDeCaso('trg_generar_numero_caso_afiliacion', 'seq_numero_caso_afiliacion', 12344);
    assert(traslado === `CASO-${anio}-12345`, `El traslado 12345 conserva sus 5 dígitos (${traslado})`);
    assert(trasladoCorto === `CASO-${anio}-0007`, `Por debajo de 10000 sigue con 4 dígitos (${trasladoCorto})`);
    assert(afiliacion === `CASO-AFIL-${anio}-12345`, `La afiliación 12345 conserva sus 5 dígitos (${afiliacion})`);

    // Asociado de prueba con una cuenta en la cooperativa
    const asociado = await crearUsuarioDePrueba(db, {
      dpi: dpiAsociado,
      codigo: `EX-T5${sufijo}`,
      email: `test.pendientes.${sufijo}@gmail.com`,
      rol: 'ASOCIADO',
      asociado: true,
    });
    idPersona = asociado.idPersona;
    const idCuentaCoop = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible)
       VALUES ($1, $2, (SELECT id_tipo_cuenta FROM tipos_cuenta WHERE nombre ILIKE '%ahorro%' ORDER BY id_tipo_cuenta LIMIT 1), 100)
       RETURNING id_cuenta`,
      [`CTA-TP-${sufijo}`, asociado.idAsociado]
    )).rows[0].id_cuenta;
    // La cuenta del banco que el banco devuelve para el DPI del asociado
    banco.cuentas = [{ id_cuenta_bancaria: 999999, numero_cuenta_bancaria: `CTA-BCO-TP-${sufijo}`, estado: 'ACTIVA', tipo_cuenta: 'AHORRO' }];
    // Las que esperan al ejecutivo las elevó OP-1: el comité solo aprueba lo que revisó un operador
    const idRevisor = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'OP-1'")).rows[0].id_usuario;
    const nuevaSolicitud = async (estado, destino = {}) => {
      const id = (await db.query(
        `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado,
                                          id_cuenta_bancaria_destino, cuenta_destino_info, id_cuenta_destino, id_operador_revisa)
         VALUES ($1, 1000, 12, 10, 90, $2, $3, $4, $5, $6) RETURNING id_solicitud_credito`,
        [asociado.idAsociado, estado, destino.idBanco || null, destino.info || null, destino.idCoop || null,
          estado === 'EN_AUTORIZACION_EJECUTIVO' ? idRevisor : null]
      )).rows[0].id_solicitud_credito;
      solicitudes.push(id);
      return id;
    };
    const estadoDe = async (id) => (await db.query('SELECT estado FROM solicitudes_credito WHERE id_solicitud_credito = $1', [id])).rows[0].estado;
    // La referencia del desembolso en el banco: la de la solicitud y el segundo en que se creó
    const referenciaDe = async (id) => {
      const { fecha_solicitud: creada } = (await db.query('SELECT fecha_solicitud FROM solicitudes_credito WHERE id_solicitud_credito = $1', [id])).rows[0];
      const referencia = bancoApiService.referenciaDeOperacion(`SOL-CRED-${id}`, creada);
      referencias.push(referencia);
      return referencia;
    };

    // ------------------------------------------------------------------
    console.log('\n--- Créditos desde la bandeja del operador ---');
    const tokenOperador = (await request('/api/auth/login', 'POST', { identifier: 'OP-1', password: 'admin123' })).body.token;
    tokens.push(tokenOperador);
    const enRevision = await nuevaSolicitud('EN_REVISION_OPERADOR');
    const sinMotivo = await request(`/api/operador/creditos/${enRevision}/resolver`, 'POST', { accion: 'RECHAZAR' }, tokenOperador);
    assert(sinMotivo.status === 400 && (await estadoDe(enRevision)) === 'EN_REVISION_OPERADOR', 'El rechazo del operador exige el motivo (400)');
    const aprobar = await request(`/api/operador/creditos/${enRevision}/resolver`, 'POST', { accion: 'APROBAR' }, tokenOperador);
    assert(aprobar.status === 403 && (await estadoDe(enRevision)) === 'EN_REVISION_OPERADOR', 'El operador no aprueba ni desembolsa créditos (403)');
    const rechazar = await request(`/api/operador/creditos/${enRevision}/resolver`, 'POST', { accion: 'RECHAZAR', observaciones: 'Prueba de rechazo' }, tokenOperador);
    assert(rechazar.status === 200 && (await estadoDe(enRevision)) === 'RECHAZADA', 'El operador rechaza el crédito');

    // ------------------------------------------------------------------
    console.log('\n--- Desembolso del ejecutivo ---');
    const tokenEjecutivo = (await request('/api/auth/login', 'POST', { identifier: 'EJ-1', password: 'admin123' })).body.token;
    tokens.push(tokenEjecutivo);
    const aceptar = (id) => request(`/api/ejecutivo/creditos/${id}/resolver`, 'POST', {
      accion: 'ACEPTAR',
      observaciones: 'Prueba de desembolso',
      documento_firmado: PDF,
      nombre_archivo_firmado: 'resolucion.pdf',
    }, tokenEjecutivo);
    const destinoBanco = { idBanco: 999999, info: `Cuenta Bancaria de Ahorro (CTA-BCO-TP-${sufijo})` };

    // La cuenta de destino no está entre las que el banco tiene para el DPI del asociado
    const ajena = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', { idBanco: 888888, info: 'Cuenta Bancaria de Ahorro (CTA-BCO-OTRA-1)' });
    const cuentaAjena = await aceptar(ajena);
    assert(
      cuentaAjena.status === 404 && banco.acreditaciones.length === 0 && (await estadoDe(ajena)) === 'EN_AUTORIZACION_EJECUTIVO',
      'No se acredita en una cuenta que el banco no tiene a nombre del asociado (404)'
    );

    // El banco no responde: no se aprueba nada
    const conBancoCaido = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    banco.acreditar = { success: false, status: 503, message: 'Banco no disponible' };
    const caido = await aceptar(conBancoCaido);
    banco.acreditar = null;
    assert(caido.status === 502 && (await estadoDe(conBancoCaido)) === 'EN_AUTORIZACION_EJECUTIVO', 'Si el banco no acredita, la solicitud sigue por autorizar (502)');
    const archivosHuerfanos = fs.existsSync(CARPETA_CREDITOS)
      ? fs.readdirSync(CARPETA_CREDITOS).filter((a) => a.startsWith(`solicitud_credito_${conBancoCaido}_`))
      : [];
    assert(archivosHuerfanos.length === 0, 'Si la resolución no se completa, no queda el PDF guardado (issue #63)');

    // Falla el COMMIT después de acreditar: el dinero se retira del banco
    const conCommitFallido = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    registro = [];
    banco.reversiones = [];
    modoCommit = 'falla';
    const commitFallido = await aceptar(conCommitFallido);
    modoCommit = null;
    const reversion = banco.reversiones[0];
    assert(
      commitFallido.status === 500 && (await estadoDe(conCommitFallido)) === 'EN_AUTORIZACION_EJECUTIVO'
        && reversion?.referencia === `REV-${await referenciaDe(conCommitFallido)}` && reversion?.cui_dpi === dpiAsociado && Number(reversion?.monto) === 1000,
      'Si falla el COMMIT, la acreditación se revierte en el banco con el DPI del titular'
    );

    // Falla el COMMIT y también la reversión: se pide no reintentar (un reintento desembolsaría dos veces)
    const sinReversion = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    banco.debitar = { success: false, status: 409, message: 'Fondos insuficientes' };
    modoCommit = 'falla';
    const noRevertida = await aceptar(sinReversion);
    modoCommit = null;
    banco.debitar = null;
    const anotada = (await db.query(
      'SELECT estado, tipo_movimiento FROM reversiones_pendientes WHERE referencia_original = $1', [await referenciaDe(sinReversion)]
    )).rows[0];
    assert(
      noRevertida.status === 500 && /No la repita/.test(noRevertida.body.message || '') && (await estadoDe(sinReversion)) === 'EN_AUTORIZACION_EJECUTIVO'
        && anotada?.estado === 'PENDIENTE' && anotada?.tipo_movimiento === 'DEBITO',
      'Si tampoco se puede revertir, se avisa que no se reintente y la reversión queda en «Conciliación»'
    );
    // Mientras esa reversión esté pendiente, la solicitud no se vuelve a aprobar
    const reintentoBloqueado = await aceptar(sinReversion);
    assert(reintentoBloqueado.status === 409 && (await estadoDe(sinReversion)) === 'EN_AUTORIZACION_EJECUTIVO', 'Con una reversión pendiente, la solicitud no se vuelve a aprobar (409)');

    // El COMMIT se aplicó aunque la conexión informó un error: no se retira el dinero de un crédito aprobado
    const aplicado = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    banco.reversiones = [];
    modoCommit = 'aplicadoConError';
    const commitAplicado = await aceptar(aplicado);
    modoCommit = null;
    const descartada = (await db.query(
      'SELECT estado FROM reversiones_pendientes WHERE referencia_original = $1', [await referenciaDe(aplicado)]
    )).rows[0];
    assert(
      commitAplicado.status === 200 && (await estadoDe(aplicado)) === 'APROBADA' && banco.reversiones.length === 0
        && descartada?.estado === 'DESCARTADA',
      'Si el COMMIT sí se aplicó, la solicitud queda aprobada y no se revierte (la reversión queda descartada)'
    );

    // Desembolso normal: se acredita después de registrar la aprobación y antes del COMMIT
    const normal = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    registro = [];
    const aprobado = await aceptar(normal);
    const orden = registro.join(' > ');
    assert(aprobado.status === 200 && (await estadoDe(normal)) === 'APROBADA', 'El ejecutivo aprueba y desembolsa');
    // #89: la aprobación queda en el historial; las que no se completaron, no (el ROLLBACK las deshace)
    const historialDe = async (id) => (await db.query(
      'SELECT resolucion FROM resoluciones_credito WHERE id_solicitud_credito = $1 ORDER BY id_resolucion', [id]
    )).rows.map((f) => f.resolucion).join();
    assert((await historialDe(normal)) === 'APROBADA' && (await historialDe(aplicado)) === 'APROBADA'
      && (await historialDe(conBancoCaido)) === '' && (await historialDe(conCommitFallido)) === '' && (await historialDe(sinReversion)) === '',
      'El historial guarda la aprobación y nada de las que no se completaron (banco caído o COMMIT fallido)');
    assert(
      registro.indexOf('UPDATE solicitudes_credito') !== -1
        && registro.indexOf('UPDATE solicitudes_credito') < registro.indexOf('ACREDITAR')
        && registro.indexOf('ACREDITAR') < registro.lastIndexOf('COMMIT'),
      `La acreditación en el banco es el último paso antes del COMMIT (${orden})`
    );

    // ------------------------------------------------------------------
    console.log('\n--- Traslado con un intento por revertir ---');
    const nuevoTraslado = async () => {
      const t = (await db.query(
        `INSERT INTO solicitudes_traslado_apertura (id_asociado, id_cuenta_bancaria_origen, id_cuenta_destino, id_tipo_cuenta_destino, monto, tipo_operacion)
         VALUES ($1, 999999, $2, (SELECT id_tipo_cuenta FROM cuentas WHERE id_cuenta = $2), 50, 'TRASLADO_DIRECTO')
         RETURNING id_solicitud, numero_caso, fecha_solicitud`,
        [asociado.idAsociado, idCuentaCoop]
      )).rows[0];
      t.referencia = bancoApiService.referenciaDeOperacion(t.numero_caso, t.fecha_solicitud);
      referencias.push(t.referencia);
      return t;
    };
    const anotarPendiente = (t) => db.query(
      `INSERT INTO reversiones_pendientes (origen, tipo_movimiento, numero_cuenta_bancaria, cui_dpi, monto, concepto,
         referencia_original, referencia_reversion, clave_operacion)
       VALUES ('TRASLADO', 'CREDITO', $1, $2, 50, 'Reversión de prueba', $3, $4, $5)`,
      [`CTA-BCO-TP-${sufijo}`, dpiAsociado, t.referencia, `REV-${t.referencia}`, String(t.id_solicitud)]
    );
    const estadoTraslado = async (t) => (await db.query('SELECT estado FROM solicitudes_traslado_apertura WHERE id_solicitud = $1', [t.id_solicitud])).rows[0].estado;
    const aprobarTraslado = (t) => request(`/api/operador/solicitudes/${t.id_solicitud}/resolver`, 'POST', { accion: 'APROBAR' }, tokenOperador);

    // Un intento anterior quedó por revertir: no se debita otra vez
    const conPendiente = await nuevoTraslado();
    await anotarPendiente(conPendiente);
    banco.reversiones = [];
    const bloqueado = await aprobarTraslado(conPendiente);
    assert(
      bloqueado.status === 409 && (await estadoTraslado(conPendiente)) === 'PENDIENTE' && banco.reversiones.length === 0,
      'Con un intento por revertir, el traslado no se aprueba ni se debita (409)'
    );
    // La reversión del intento anterior empieza mientras se aprueba: el banco devuelve ese débito (idempotente),
    // pero no se registra, porque se está revirtiendo
    const enCarrera = await nuevoTraslado();
    const debitarSimulado = bancoApiService.debitarCuenta;
    bancoApiService.debitarCuenta = async (datos) => {
      if (datos.referencia !== enCarrera.referencia) return debitarSimulado(datos);
      await anotarPendiente(enCarrera);
      return { success: true, status: 200, idempotente: true, data: { referencia: datos.referencia } };
    };
    const enCarreraRes = await aprobarTraslado(enCarrera);
    bancoApiService.debitarCuenta = debitarSimulado;
    assert(
      enCarreraRes.status === 409 && (await estadoTraslado(enCarrera)) === 'PENDIENTE',
      'Si el banco devuelve un débito que se está revirtiendo, el traslado no se registra (409)'
    );

    // La reversión automática bloquea la operación: si otro la tiene y la deja hecha, no se revierte
    const ocupado = await nuevoTraslado();
    const otro = await original.connect.call(db.pool);
    await otro.query('BEGIN');
    await otro.query('SELECT 1 FROM solicitudes_traslado_apertura WHERE id_solicitud = $1 FOR UPDATE', [ocupado.id_solicitud]);
    banco.acreditaciones = [];
    const { revertirOAnotar } = require('./src/services/reversionesService');
    const enEspera = revertirOAnotar({
      origen: 'TRASLADO', tipo: 'CREDITO', numeroCuenta: `CTA-BCO-TP-${sufijo}`, cui: dpiAsociado, monto: 50,
      referencia: ocupado.referencia, concepto: 'Reversión de prueba', clave: ocupado.id_solicitud,
    });
    await new Promise((resolver) => { setTimeout(resolver, 300); });
    await otro.query("UPDATE solicitudes_traslado_apertura SET estado = 'APROBADO' WHERE id_solicitud = $1", [ocupado.id_solicitud]);
    await otro.query('COMMIT');
    otro.release();
    const trasEsperar = await enEspera;
    assert(
      trasEsperar.aplicada && banco.acreditaciones.length === 0,
      'La reversión espera a quien tiene la operación y, si la deja hecha, no revierte nada'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Cerrar sin hacer la operación ---');
    // Un intento anterior de desembolsar agotó el tiempo, pero el banco sí acreditó: al denegar se retira
    const conDesembolsoSuelto = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    const refSuelta = await referenciaDe(conDesembolsoSuelto);
    banco.movimientos[`${refSuelta}|CREDITO`] = { numero_cuenta: `CTA-BCO-TP-${sufijo}`, titular_cui: dpiAsociado, monto: 1000 };
    const denegar = (id) => request(`/api/ejecutivo/creditos/${id}/resolver`, 'POST', {
      accion: 'DENEGAR', observaciones: 'Prueba de denegación',
    }, tokenEjecutivo);
    banco.caido = true;
    const sinBanco = await denegar(conDesembolsoSuelto);
    banco.caido = false;
    assert(sinBanco.status === 502 && (await estadoDe(conDesembolsoSuelto)) === 'EN_AUTORIZACION_EJECUTIVO', 'Sin poder consultar el banco, la solicitud no se deniega (502)');
    banco.reversiones = [];
    const denegada = await denegar(conDesembolsoSuelto);
    const retiro = banco.reversiones[0];
    assert(
      denegada.status === 200 && (await estadoDe(conDesembolsoSuelto)) === 'DENEGADA' && retiro?.referencia === `REV-${refSuelta}`
        && retiro?.cui_dpi === dpiAsociado && Number(retiro?.monto) === 1000 && /se revirtió/.test(denegada.body.message || ''),
      'Al denegar, el desembolso que un intento anterior dejó en el banco se retira'
    );
    // Un traslado cuyo débito quedó en el banco: al rechazarlo se devuelve
    const trasladoSuelto = await nuevoTraslado();
    banco.movimientos[`${trasladoSuelto.referencia}|DEBITO`] = { numero_cuenta: `CTA-BCO-TP-${sufijo}`, titular_cui: dpiAsociado, monto: 50 };
    banco.acreditaciones = [];
    const rechazado = await request(`/api/operador/solicitudes/${trasladoSuelto.id_solicitud}/resolver`, 'POST', { accion: 'RECHAZAR', observaciones: 'Prueba' }, tokenOperador);
    assert(
      rechazado.status === 200 && (await estadoTraslado(trasladoSuelto)) === 'RECHAZADO'
        && banco.acreditaciones[0]?.referencia === `REV-${trasladoSuelto.referencia}` && Number(banco.acreditaciones[0]?.monto) === 50,
      'Al rechazar un traslado, el débito que un intento anterior dejó en el banco se devuelve'
    );

    // Respuesta a un débito que el banco no hizo (afiliación, apertura y traslado)
    assert(
      estadoPorFalloDelBanco(403) === 403 && estadoPorFalloDelBanco(503) === 502 && estadoPorFalloDelBanco(504) === 502
        && estadoPorFalloDelBanco(undefined) === 502 && estadoPorFalloDelBanco(400) === 400,
      'Un débito rechazado responde 403 si la cuenta no es del titular, 502 si el banco no respondió y 400 en lo demás'
    );

    // Desembolso a la cuenta de la cooperativa: suma al saldo y deja el movimiento
    const aCooperativa = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', { idCoop: idCuentaCoop, info: `Cuenta de Ahorro (CTA-TP-${sufijo})` });
    const coop = await aceptar(aCooperativa);
    const cuenta = (await db.query('SELECT saldo_disponible FROM cuentas WHERE id_cuenta = $1', [idCuentaCoop])).rows[0];
    const idEjecutivo = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'EJ-1'")).rows[0].id_usuario;
    const movimiento = (await db.query('SELECT id_usuario_registra, monto FROM transacciones WHERE id_cuenta = $1', [idCuentaCoop])).rows[0];
    assert(
      coop.status === 200 && Number(cuenta.saldo_disponible) === 1100 && movimiento?.id_usuario_registra === idEjecutivo && Number(movimiento?.monto) === 1000,
      'El desembolso a la cuenta de la cooperativa suma al saldo y registra el movimiento'
    );
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    Object.assign(bancoApiService, {
      obtenerCuentasCliente: original.obtenerCuentasCliente,
      acreditarCuenta: original.acreditarCuenta,
      debitarCuenta: original.debitarCuenta,
      consultarMovimiento: original.consultarMovimiento,
    });
    db.pool.connect = original.connect;
    for (const token of tokens.filter(Boolean)) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      // Los PDF que guardó el ejecutivo en cada intento
      if (fs.existsSync(CARPETA_CREDITOS)) {
        for (const archivo of fs.readdirSync(CARPETA_CREDITOS)) {
          if (solicitudes.some((id) => archivo.startsWith(`solicitud_credito_${id}_`))) fs.unlinkSync(path.join(CARPETA_CREDITOS, archivo));
        }
      }
      // Las reversiones que la prueba dejó anotadas (también las de un desembolso que falló a medias)
      if (solicitudes.length) {
        const creadas = (await db.query(
          'SELECT id_solicitud_credito, fecha_solicitud FROM solicitudes_credito WHERE id_solicitud_credito = ANY($1)', [solicitudes]
        )).rows;
        referencias.push(...creadas.map((c) => bancoApiService.referenciaDeOperacion(`SOL-CRED-${c.id_solicitud_credito}`, c.fecha_solicitud)));
      }
      await purgarReversionesDePrueba(db, referencias);
      if (idPersona) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }

    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
