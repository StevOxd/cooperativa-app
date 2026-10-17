// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testErroresPendientes.js
 *
 * - Los números de caso no se repiten a partir del 10000 (el correlativo no se corta a 4 dígitos).
 * - El operador solo rechaza créditos: la aprobación y el desembolso son del ejecutivo.
 * - El desembolso del ejecutivo acredita en el banco como último paso: si el banco falla no se aprueba nada,
 *   y si falla el COMMIT la acreditación se revierte.
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
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba } = require('./testHelper');

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 prueba').toString('base64')}`;
const CARPETA_CREDITOS = path.join(__dirname, 'uploads', 'creditos');

/**
 * Número de caso que genera un trigger cuando su secuencia va en `valor`. Usa una tabla temporal con el mismo
 * trigger y devuelve la secuencia a su valor anterior (setval no se deshace con ROLLBACK).
 */
const numeroDeCaso = async (funcion, secuencia, valor) => {
  const client = await db.pool.connect();
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
  let idPersona = null;
  let errorInesperado = false;

  // Banco simulado y registro del orden de las consultas del desembolso
  const original = {
    obtenerCuentasCliente: bancoApiService.obtenerCuentasCliente,
    acreditarCuenta: bancoApiService.acreditarCuenta,
    debitarCuenta: bancoApiService.debitarCuenta,
    connect: db.pool.connect,
  };
  const banco = { acreditar: null, debitar: null, cuentas: [], acreditaciones: [], reversiones: [] };
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
    const nuevaSolicitud = async (estado, destino = {}) => {
      const id = (await db.query(
        `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado,
                                          id_cuenta_bancaria_destino, cuenta_destino_info, id_cuenta_destino)
         VALUES ($1, 1000, 12, 10, 90, $2, $3, $4, $5) RETURNING id_solicitud_credito`,
        [asociado.idAsociado, estado, destino.idBanco || null, destino.info || null, destino.idCoop || null]
      )).rows[0].id_solicitud_credito;
      solicitudes.push(id);
      return id;
    };
    const estadoDe = async (id) => (await db.query('SELECT estado FROM solicitudes_credito WHERE id_solicitud_credito = $1', [id])).rows[0].estado;

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
        && reversion?.referencia === `REV-SOL-CRED-${conCommitFallido}` && reversion?.cui_dpi === dpiAsociado && Number(reversion?.monto) === 1000,
      'Si falla el COMMIT, la acreditación se revierte en el banco con el DPI del titular'
    );

    // Falla el COMMIT y también la reversión: se pide no reintentar (un reintento desembolsaría dos veces)
    const sinReversion = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    banco.debitar = { success: false, status: 409, message: 'Fondos insuficientes' };
    modoCommit = 'falla';
    const noRevertida = await aceptar(sinReversion);
    modoCommit = null;
    banco.debitar = null;
    assert(
      noRevertida.status === 500 && /No la reintente/.test(noRevertida.body.message || '') && (await estadoDe(sinReversion)) === 'EN_AUTORIZACION_EJECUTIVO',
      'Si tampoco se puede revertir, se avisa que no se reintente y se pide conciliar'
    );

    // El COMMIT se aplicó aunque la conexión informó un error: no se retira el dinero de un crédito aprobado
    const aplicado = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    banco.reversiones = [];
    modoCommit = 'aplicadoConError';
    const commitAplicado = await aceptar(aplicado);
    modoCommit = null;
    assert(
      commitAplicado.status === 200 && (await estadoDe(aplicado)) === 'APROBADA' && banco.reversiones.length === 0,
      'Si el COMMIT sí se aplicó, la solicitud queda aprobada y no se revierte'
    );

    // Desembolso normal: se acredita después de registrar la aprobación y antes del COMMIT
    const normal = await nuevaSolicitud('EN_AUTORIZACION_EJECUTIVO', destinoBanco);
    registro = [];
    const aprobado = await aceptar(normal);
    const orden = registro.join(' > ');
    assert(aprobado.status === 200 && (await estadoDe(normal)) === 'APROBADA', 'El ejecutivo aprueba y desembolsa');
    assert(
      registro.indexOf('UPDATE solicitudes_credito') !== -1
        && registro.indexOf('UPDATE solicitudes_credito') < registro.indexOf('ACREDITAR')
        && registro.indexOf('ACREDITAR') < registro.lastIndexOf('COMMIT'),
      `La acreditación en el banco es el último paso antes del COMMIT (${orden})`
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
