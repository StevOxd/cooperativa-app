// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testConciliacion.js
 *
 * - El banco es idempotente por referencia: un reintento devuelve el movimiento original (también al abrir una
 *   cuenta), una referencia usada en otra operación se rechaza y una ya revertida obliga a usar otra (la
 *   cooperativa le agrega un sufijo).
 * - El efectivo de ventanilla tiene un tope por persona al día, sumando todas las vías, y queda registrado.
 * - Reversiones: quedan registradas; no se revierte una operación que sí quedó hecha ni un movimiento que el banco
 *   no tiene.
 * - «Conciliación»: el administrador cierra depósitos sin confirmar según el banco y hace las reversiones
 *   pendientes, nunca las propias.
 * - El teléfono del perfil se valida.
 * - Cambiar el correo de un usuario queda auditado, se avisa al anterior y su contraseña no se reinicia enseguida.
 *
 * Usa el backend en proceso, la base de datos local y el banco local (movimientos de Q0.01 que se compensan y una
 * cuenta de un cliente de prueba que se borra); la conciliación se prueba con el banco simulado. Limpia lo que crea.
 */
const crypto = require('crypto');
const { Pool } = require('pg');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const mailerService = require('./src/services/mailerService');
const { revertirOAnotar, anotarSinConfirmar, hayAperturaPorRevertirDelDpi } = require('./src/services/reversionesService');
const {
  makeRequest,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  purgarEfectivoDePrueba,
  purgarReversionesDePrueba,
} = require('./testHelper');

// Cuenta semilla del banco (EJ-1) para la idempotencia, con movimientos de Q0.01 que se compensan
const CUENTA_BANCO = 'CTA-BCO-MONET-6001';
const DPI_CUENTA_BANCO = '6000000000001';

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] CONCILIACIÓN CON EL BANCO Y AJUSTES');
  console.log('=============================================================\n');

  // Las referencias quedan en banco_db: el sufijo no se repite entre corridas
  const sufijo = String(Date.now()).slice(-7);
  const unico = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const tokens = [];
  const personas = [];
  const dpiAsociado = `960${sufijo}000`.slice(0, 13);
  const dpiDeposito = `961${sufijo}000`.slice(0, 13);
  const dpiClienteBanco = `963${sufijo}000`.slice(0, 13);
  const referenciasDeposito = [
    `TEST-CONC-A-${sufijo}`, `TEST-CONC-B-${sufijo}`, `TEST-CONC-C-${sufijo}`, `TEST-CONC-D-${sufijo}`, `TEST-CONC-E-${sufijo}`,
  ];
  const referenciasReversion = [];
  const originales = {
    consultarMovimiento: bancoApiService.consultarMovimiento,
    acreditarCuenta: bancoApiService.acreditarCuenta,
    debitarCuenta: bancoApiService.debitarCuenta,
    isAvailable: mailerService.isAvailable,
    sendUserEmailChangedNotice: mailerService.sendUserEmailChangedNotice,
  };
  let errorInesperado = false;

  try {
    const login = async (identifier) => {
      const token = (await request('/api/auth/login', 'POST', { identifier, password: 'admin123' })).body.token;
      if (token) tokens.push(token);
      return token;
    };
    const tokenAdmin = await login('AD-1');
    const tokenOperador = await login('OP-1');
    const idAdmin = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'AD-1'")).rows[0].id_usuario;
    const idOperador = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'OP-1'")).rows[0].id_usuario;

    // ------------------------------------------------------------------
    console.log('--- Idempotencia del banco ---');
    const ref = `TEST-IDEM-${unico}`;
    const primera = await bancoApiService.acreditarCuenta({ numero_cuenta: CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: ref });
    const repetida = await bancoApiService.acreditarCuenta({ numero_cuenta: CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: ref });
    assert(
      primera.success && repetida.success && repetida.idempotente === true && repetida.data?.saldo_nuevo === primera.data?.saldo_nuevo,
      'Un reintento con la misma referencia devuelve el movimiento original sin acreditar otra vez'
    );
    const otroMonto = await bancoApiService.acreditarCuenta({ numero_cuenta: CUENTA_BANCO, monto: 0.02, concepto: 'Prueba', referencia: ref });
    assert(otroMonto.status === 409 && otroMonto.error === 'REFERENCIA_USADA', 'La misma referencia con otro monto se rechaza (409)');
    const consulta = await bancoApiService.consultarMovimiento(ref, 'CREDITO');
    assert(consulta.success && Number(consulta.data?.monto) === 0.01 && consulta.data?.numero_cuenta === CUENTA_BANCO, 'El movimiento se consulta por su referencia');

    const reversion = await bancoApiService.debitarCuenta({ numero_cuenta: CUENTA_BANCO, cui_dpi: DPI_CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: `REV-${ref}` });
    const trasReversion = await bancoApiService.acreditarCuenta({ numero_cuenta: CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: ref });
    assert(reversion.success && trasReversion.status === 409 && trasReversion.error === 'REFERENCIA_REVERTIDA', 'Una referencia ya revertida no se da por hecha (409)');
    const nuevoIntento = await bancoApiService.acreditarConReferenciaDeOperacion({ numero_cuenta: CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: ref });
    assert(nuevoIntento.success && nuevoIntento.referencia_usada === `${ref}-2`, 'Tras una reversión, la cooperativa reintenta con un sufijo');
    // Se compensa el nuevo intento: la cuenta queda como estaba
    await bancoApiService.debitarCuenta({ numero_cuenta: CUENTA_BANCO, cui_dpi: DPI_CUENTA_BANCO, monto: 0.01, concepto: 'Prueba', referencia: `REV-${ref}-2` });
    const revertidaConOtroMonto = await bancoApiService.acreditarCuenta({ numero_cuenta: CUENTA_BANCO, monto: 0.05, concepto: 'Prueba', referencia: ref });
    assert(revertidaConOtroMonto.error === 'REFERENCIA_REVERTIDA', 'Una referencia revertida se informa así aunque cambie el monto: el nuevo intento usa otra');

    // Apertura de cuenta con la misma referencia: devuelve la cuenta abierta, sin abrir otra
    const refApertura = `TEST-APER-${unico}`;
    const datosApertura = {
      cui_dpi: dpiClienteBanco, primer_nombre: 'Prueba', primer_apellido: 'Conciliacion', fecha_nacimiento: '1990-01-01',
      tipo_cuenta: 'AHORRO', monto_inicial: 0.01, referencia: refApertura,
    };
    const apertura = await bancoApiService.aperturarCuentaBancaria(datosApertura);
    const aperturaRepetida = await bancoApiService.aperturarConReferenciaDeOperacion(datosApertura);
    const aperturaOtroMonto = await bancoApiService.aperturarCuentaBancaria({ ...datosApertura, monto_inicial: 0.02 });
    const montoInvalido = await bancoApiService.aperturarCuentaBancaria({ ...datosApertura, monto_inicial: 'abc', referencia: `${refApertura}-X` });
    assert(
      apertura.status === 201 && aperturaRepetida.status === 200 && aperturaRepetida.idempotente === true
        && aperturaRepetida.data?.numero_cuenta === apertura.data?.numero_cuenta && aperturaRepetida.referencia_usada === refApertura,
      'Una apertura repetida con la misma referencia devuelve la cuenta que ya se abrió'
    );
    assert(aperturaOtroMonto.status === 409 && montoInvalido.status === 400, 'La misma referencia con otro depósito se rechaza (409); un monto inválido, 400');

    // ------------------------------------------------------------------
    console.log('\n--- Efectivo en ventanilla ---');
    const asociado = await crearUsuarioDePrueba(db, {
      dpi: dpiAsociado,
      codigo: `EX-T3${sufijo}`,
      email: `test.conciliacion.${sufijo}@gmail.com`,
      rol: 'ASOCIADO',
      asociado: true,
    });
    personas.push(asociado.idPersona);
    const abrir = (monto) => request('/api/admin/asociados/aperturar-cuenta', 'POST', {
      id_asociado: asociado.idAsociado,
      id_tipo_cuenta: 2,
      monto_apertura: monto,
      origen_fondos: 'EFECTIVO_VENTANILLA',
    }, tokenOperador);
    const noNumero = await abrir('abc');
    const sobreTope = await abrir(100000.01);
    assert(noNumero.status === 400 && sobreTope.status === 400, 'Un monto no numérico o sobre el tope del día no abre la cuenta (400)');
    const primeraApertura = await abrir(60000);
    const registro = (await db.query(
      "SELECT id_usuario_operador, monto, origen FROM efectivo_ventanilla WHERE cui_dpi = $1", [dpiAsociado]
    )).rows;
    assert(
      primeraApertura.status === 201 && registro.length === 1 && registro[0].id_usuario_operador === idOperador
        && Number(registro[0].monto) === 60000 && registro[0].origen === 'APERTURA_CUENTA',
      'El efectivo de la apertura queda registrado a nombre del operador'
    );
    // Un depósito al banco del mismo día también cuenta: 60,000 + 30,000 + 15,000 pasa el tope; + 10,000 no
    await db.query(
      `INSERT INTO depositos_ventanilla_banco (id_usuario_operador, numero_cuenta_bancaria, titular_cui, monto, referencia, estado)
       VALUES ($1, 'CTA-BCO-TEST', $2, 30000, $3, 'ACREDITADO')`,
      [idOperador, dpiAsociado, `TEST-CONC-EF-${sufijo}`]
    );
    const pasaElTope = await abrir(15000);
    const justoElTope = await abrir(10000);
    assert(pasaElTope.status === 400 && justoElTope.status === 201, 'El tope del día suma todas las vías de efectivo de la persona');

    // ------------------------------------------------------------------
    console.log('\n--- Conciliación de depósitos ---');
    // De hace 5 minutos (ya se pueden conciliar) y uno recién hecho (su llamada al banco puede seguir en curso); el
    // último es de la persona del administrador
    const dpiAdmin = (await db.query(
      "SELECT p.cui_dpi FROM usuarios u JOIN personas p ON p.id_persona = u.id_persona WHERE u.codigo_corporativo = 'AD-1'"
    )).rows[0].cui_dpi;
    for (const [referencia, estado, minutos, titular] of [
      [referenciasDeposito[0], 'SIN_CONFIRMAR', 5, dpiDeposito], [referenciasDeposito[1], 'PENDIENTE', 5, dpiDeposito],
      [referenciasDeposito[2], 'PENDIENTE', 0, dpiDeposito], [referenciasDeposito[3], 'PENDIENTE', 5, dpiDeposito],
      [referenciasDeposito[4], 'PENDIENTE', 5, dpiAdmin],
    ]) {
      await db.query(
        `INSERT INTO depositos_ventanilla_banco (id_usuario_operador, numero_cuenta_bancaria, titular_cui, monto, referencia, estado, fecha_deposito)
         VALUES ($1, 'CTA-BCO-TEST', $2, 25, $3, $4, now() - make_interval(mins => $5))`,
        [idOperador, titular, referencia, estado, minutos]
      );
    }
    // El banco tiene el primero; el cuarto, en otra cuenta
    bancoApiService.consultarMovimiento = async (referencia) => {
      if (referencia === referenciasDeposito[0]) return { success: true, status: 200, data: { referencia, monto: 25, numero_cuenta: 'CTA-BCO-TEST' } };
      if (referencia === referenciasDeposito[3]) return { success: true, status: 200, data: { referencia, monto: 25, numero_cuenta: 'CTA-BCO-OTRA' } };
      return { success: false, status: 404, message: 'No hay un movimiento con esa referencia.' };
    };
    const comoOperador = await request('/api/conciliacion/depositos', 'GET', null, tokenOperador);
    const lista = await request(`/api/conciliacion/depositos?texto=${dpiDeposito}`, 'GET', null, tokenAdmin);
    assert(comoOperador.status === 403 && lista.status === 200 && lista.body.data.length === 4, 'Solo el administrador ve la conciliación; los depósitos se buscan por DPI');
    const reciente = await request(`/api/conciliacion/depositos/${referenciasDeposito[2]}/verificar`, 'POST', null, tokenAdmin);
    assert(reciente.status === 409, 'Un depósito recién hecho no se concilia todavía (409)');
    const confirmado = await request(`/api/conciliacion/depositos/${referenciasDeposito[0]}/verificar`, 'POST', null, tokenAdmin);
    const noEsta = await request(`/api/conciliacion/depositos/${referenciasDeposito[1]}/verificar`, 'POST', null, tokenAdmin);
    const cerrados = (await db.query(
      'SELECT referencia, estado, id_usuario_concilia FROM depositos_ventanilla_banco WHERE referencia = ANY($1) ORDER BY referencia',
      [referenciasDeposito.slice(0, 2)]
    )).rows;
    assert(
      confirmado.status === 200 && noEsta.status === 200 && cerrados[0].estado === 'ACREDITADO' && cerrados[1].estado === 'RECHAZADO'
        && cerrados.every((d) => d.id_usuario_concilia === idAdmin),
      'Un depósito que el banco tiene queda ACREDITADO; uno que no, RECHAZADO; a nombre de quien concilia'
    );
    const otraVez = await request(`/api/conciliacion/depositos/${referenciasDeposito[0]}/verificar`, 'POST', null, tokenAdmin);
    assert(otraVez.status === 409, 'Un depósito ya cerrado no se vuelve a conciliar (409)');
    const otraCuenta = await request(`/api/conciliacion/depositos/${referenciasDeposito[3]}/verificar`, 'POST', null, tokenAdmin);
    const propio = await request(`/api/conciliacion/depositos/${referenciasDeposito[4]}/verificar`, 'POST', null, tokenAdmin);
    assert(
      otraCuenta.status === 409 && propio.status === 403 && propio.body.error === 'AUTOATENCION_NO_PERMITIDA',
      'No se cierra un depósito que el banco tiene en otra cuenta (409), ni uno de la persona que concilia (403)'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Reversiones ---');
    const [refOriginal, refAutomatica, refAplicada, refSinOriginal, refAntigua] = ['REV', 'AUTO', 'APL', 'SIN', 'ANT']
      .map((tipo) => `TEST-CONC-${tipo}-${sufijo}`);
    referenciasReversion.push(refOriginal, refAutomatica, refAplicada, refSinOriginal, refAntigua);
    // Una reversión de traslado (CREDITO) revierte un débito: el banco simulado tiene los débitos originales de
    // refOriginal y refAutomatica, no los demás
    bancoApiService.consultarMovimiento = async (referencia, tipo) => ([refOriginal, refAutomatica].includes(referencia) && tipo === 'DEBITO'
      ? { success: true, status: 200, data: { referencia, monto: 40, numero_cuenta: 'CTA-BCO-TEST' } }
      : { success: false, status: 404, message: 'No hay un movimiento con esa referencia.' });
    const reversionDePrueba = (referencia, extra = {}) => ({
      origen: 'TRASLADO', tipo: 'CREDITO', numeroCuenta: 'CTA-BCO-TEST', cui: dpiDeposito, monto: 40,
      referencia, concepto: 'Reversión de prueba', detalle: 'Caso de prueba', clave: 0, ...extra,
    });
    const filaDe = async (referencia) => (await db.query(
      'SELECT id_reversion, estado, id_usuario_resuelve FROM reversiones_pendientes WHERE referencia_original = $1', [referencia]
    )).rows[0];

    let llamadasAlBanco = 0;
    bancoApiService.acreditarCuenta = async (datos) => {
      llamadasAlBanco += 1;
      return { success: true, status: 200, data: { referencia: datos.referencia } };
    };
    const automatica = await revertirOAnotar(reversionDePrueba(refAutomatica));
    const filaAutomatica = await filaDe(refAutomatica);
    assert(
      automatica.revertida && filaAutomatica?.estado === 'RESUELTA' && filaAutomatica.id_usuario_resuelve === null,
      'Una reversión automática queda registrada como RESUELTA por el sistema'
    );
    // La cuenta abierta antes existe: la operación sí quedó registrada y no se revierte
    llamadasAlBanco = 0;
    const aplicada = await revertirOAnotar(reversionDePrueba(refAplicada, { origen: 'APERTURA_CUENTA', clave: primeraApertura.body.data.id_cuenta }));
    assert(
      aplicada.aplicada && (await filaDe(refAplicada))?.estado === 'DESCARTADA' && llamadasAlBanco === 0,
      'Si el COMMIT sí se aplicó, no se revierte: la reversión queda DESCARTADA sin llamar al banco'
    );

    bancoApiService.acreditarCuenta = async () => ({ success: false, status: 503, message: 'Banco no disponible' });
    const anotada = await revertirOAnotar(reversionDePrueba(refOriginal));
    const pendientes = await request('/api/conciliacion/reversiones', 'GET', null, tokenAdmin);
    const fila = pendientes.body.data?.find((r) => r.referencia_reversion === `REV-${refOriginal}`);
    assert(anotada.anotada && fila?.estado === 'PENDIENTE' && pendientes.body.total_pendientes >= 1, 'Una reversión que el banco no acepta queda pendiente');
    const fallaOtraVez = await request(`/api/conciliacion/reversiones/${fila?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    bancoApiService.acreditarCuenta = async (datos) => ({ success: true, status: 200, data: { referencia: datos.referencia } });
    const resuelta = await request(`/api/conciliacion/reversiones/${fila?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    const yaResuelta = await request(`/api/conciliacion/reversiones/${fila?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    assert(
      fallaOtraVez.status === 502 && resuelta.status === 200 && resuelta.body.data?.estado === 'RESUELTA' && yaResuelta.status === 409,
      'Al reintentarla: si el banco la acepta queda RESUELTA; si no, sigue pendiente'
    );
    const cerradas = await request('/api/conciliacion/reversiones?estado=CERRADA', 'GET', null, tokenAdmin);
    const enCerradas = (cerradas.body.data || []).filter((r) => [refOriginal, refAutomatica, refAplicada].includes(r.referencia_reversion.slice(4)));
    assert(cerradas.status === 200 && enCerradas.length === 3, 'Las cerradas (resueltas y descartadas) se listan juntas');

    // Un movimiento sin confirmar (504) cuyo original el banco no tiene: no se revierte (crearía dinero)
    await anotarSinConfirmar(reversionDePrueba(refSinOriginal));
    const filaSinOriginal = await filaDe(refSinOriginal);
    const muyPronto = await request(`/api/conciliacion/reversiones/${filaSinOriginal?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    await db.query(
      `INSERT INTO reversiones_pendientes (origen, tipo_movimiento, numero_cuenta_bancaria, cui_dpi, monto, concepto,
         referencia_original, referencia_reversion, clave_operacion, fecha_registro)
       VALUES ('TRASLADO', 'CREDITO', 'CTA-BCO-TEST', $1, 40, 'Reversión de prueba', $2, $3, '0', now() - INTERVAL '5 minutes')`,
      [dpiDeposito, refAntigua, `REV-${refAntigua}`]
    );
    const descartada = await request(`/api/conciliacion/reversiones/${(await filaDe(refAntigua))?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    assert(
      muyPronto.status === 409 && descartada.status === 200 && descartada.body.data?.estado === 'DESCARTADA'
        && descartada.body.data?.id_usuario_resuelve === idAdmin,
      'Si el banco no tiene el movimiento original: muy pronto se espera (409); después queda DESCARTADA'
    );

    // Una apertura que el banco no confirmó (504) se anota sin cuenta: bloquea otra apertura de la persona y, al
    // hacerla, se toma la cuenta del movimiento original
    const refApertura504 = `TEST-CONC-AP-${sufijo}`;
    referenciasReversion.push(refApertura504);
    await anotarSinConfirmar({
      origen: 'AFILIACION_PRESENCIAL', tipo: 'DEBITO', numeroCuenta: null, cui: dpiDeposito, monto: 40,
      referencia: refApertura504, concepto: 'Reversión de prueba', clave: 0,
    });
    const bloqueaApertura = await hayAperturaPorRevertirDelDpi(db, dpiDeposito);
    bancoApiService.consultarMovimiento = async (referencia, tipo) => (referencia === refApertura504 && tipo === 'CREDITO'
      ? { success: true, status: 200, data: { referencia, monto: 40, numero_cuenta: 'CTA-BCO-NUEVA' } }
      : { success: false, status: 404, message: 'No hay un movimiento con esa referencia.' });
    const retiros = [];
    bancoApiService.debitarCuenta = async (datos) => {
      retiros.push(datos);
      return { success: true, status: 200, data: { referencia: datos.referencia } };
    };
    const apertura504 = await request(`/api/conciliacion/reversiones/${(await filaDe(refApertura504))?.id_reversion}/reintentar`, 'POST', null, tokenAdmin);
    const cuentaGuardada = (await db.query('SELECT numero_cuenta_bancaria FROM reversiones_pendientes WHERE referencia_original = $1', [refApertura504])).rows[0];
    assert(
      bloqueaApertura && apertura504.status === 200 && apertura504.body.data?.estado === 'RESUELTA'
        && retiros[0]?.numero_cuenta === 'CTA-BCO-NUEVA' && retiros[0]?.cui_dpi === dpiDeposito
        && cuentaGuardada?.numero_cuenta_bancaria === 'CTA-BCO-NUEVA',
      'Una apertura sin confirmar se revierte en la cuenta del movimiento original, que queda guardada'
    );
    Object.assign(bancoApiService, {
      consultarMovimiento: originales.consultarMovimiento,
      acreditarCuenta: originales.acreditarCuenta,
      debitarCuenta: originales.debitarCuenta,
    });

    // ------------------------------------------------------------------
    console.log('\n--- Teléfono del perfil ---');
    const tokenAsociado = await login(`EX-T3${sufijo}`);
    const telefonoMalo = await request('/api/auth/perfil', 'PATCH', { telefono: 'abc' }, tokenAsociado);
    const telefonoConGuion = await request('/api/auth/perfil', 'PATCH', { telefono: '5555-1234' }, tokenAsociado);
    const guardado = (await db.query('SELECT telefono FROM personas WHERE id_persona = $1', [asociado.idPersona])).rows[0].telefono;
    assert(telefonoMalo.status === 400 && telefonoConGuion.status === 200 && guardado === '55551234', 'El teléfono del perfil se valida (8 dígitos)');

    // ------------------------------------------------------------------
    console.log('\n--- Cambio de correo de un usuario ---');
    const operadorPrueba = await crearUsuarioDePrueba(db, {
      dpi: `962${sufijo}000`.slice(0, 13),
      codigo: `OP-T2${sufijo}`,
      email: `test.correo.anterior.${sufijo}@cooperativa.com`,
      rol: 'OPERADOR',
    });
    personas.push(operadorPrueba.idPersona);
    const avisos = [];
    mailerService.isAvailable = () => true;
    mailerService.sendUserEmailChangedNotice = async (datos) => {
      avisos.push(datos);
      return { success: true, simulado: false };
    };
    const correoConEtiqueta = await request(`/api/usuarios/${operadorPrueba.idUsuario}`, 'PUT', { email: 'x@y.com<div style="display:none">' }, tokenAdmin);
    assert(correoConEtiqueta.status === 400 && avisos.length === 0, 'Un correo con formato inválido no se guarda (400)');
    const correoNuevo = `test.correo.nuevo.${sufijo}@cooperativa.com`;
    const cambio = await request(`/api/usuarios/${operadorPrueba.idUsuario}`, 'PUT', { email: correoNuevo }, tokenAdmin);
    const auditoria = (await db.query(
      "SELECT motivo FROM historial_estados_usuario WHERE id_usuario_modificado = $1 AND motivo LIKE 'Correo cambiado:%'",
      [operadorPrueba.idUsuario]
    )).rows[0];
    assert(
      cambio.status === 200 && auditoria?.motivo.includes(`«test.correo.anterior.${sufijo}@cooperativa.com» → «${correoNuevo}»`)
        && avisos[0]?.to === `test.correo.anterior.${sufijo}@cooperativa.com` && cambio.body.aviso_enviado === true,
      'El cambio de correo queda auditado y se avisa al correo anterior'
    );
    const reinicio = await request(`/api/usuarios/${operadorPrueba.idUsuario}/reset-password`, 'POST', { motivo: 'Prueba' }, tokenAdmin);
    assert(reinicio.status === 409 && reinicio.body.error === 'CORREO_CAMBIADO_RECIENTEMENTE', 'Tras cambiar el correo, la contraseña no se reinicia enseguida (409)');
    // Si el aviso no sale, el administrador se entera
    mailerService.sendUserEmailChangedNotice = async () => ({ success: true, simulado: true });
    const sinAviso = await request(`/api/usuarios/${operadorPrueba.idUsuario}`, 'PUT', { email: `test.correo.otro.${sufijo}@cooperativa.com` }, tokenAdmin);
    assert(sinAviso.status === 200 && sinAviso.body.aviso_enviado === false, 'Si el aviso al correo anterior no sale, la respuesta lo dice');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    Object.assign(bancoApiService, {
      consultarMovimiento: originales.consultarMovimiento,
      acreditarCuenta: originales.acreditarCuenta,
      debitarCuenta: originales.debitarCuenta,
    });
    mailerService.isAvailable = originales.isAvailable;
    mailerService.sendUserEmailChangedNotice = originales.sendUserEmailChangedNotice;
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      await purgarEfectivoDePrueba(db, [dpiAsociado, dpiDeposito]);
      await purgarReversionesDePrueba(db, referenciasReversion);
      // El depósito «del administrador» se borra por su referencia (no todo lo de su DPI)
      const purga = await db.pool.connect();
      try {
        await purga.query('BEGIN');
        await purga.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
        await purga.query('DELETE FROM depositos_ventanilla_banco WHERE referencia = ANY($1)', [referenciasDeposito]);
        await purga.query('COMMIT');
      } finally {
        purga.release();
      }
      // El cliente que se abrió en el banco para la prueba de apertura
      // pg guarda la contraseña fuera de las propiedades enumerables: se pasa aparte
      const banco = new Pool({ ...db.pool.options, password: db.pool.options.password, database: 'banco_db', max: 1 });
      try {
        await banco.query(
          `DELETE FROM movimientos_bancarios WHERE id_cuenta_bancaria IN (
             SELECT cb.id_cuenta_bancaria FROM cuentas_bancarias cb JOIN clientes_banco c ON c.id_cliente = cb.id_cliente WHERE c.cui_dpi = $1)`,
          [dpiClienteBanco]
        );
        await banco.query('DELETE FROM cuentas_bancarias WHERE id_cliente IN (SELECT id_cliente FROM clientes_banco WHERE cui_dpi = $1)', [dpiClienteBanco]);
        await banco.query('DELETE FROM clientes_banco WHERE cui_dpi = $1', [dpiClienteBanco]);
      } finally {
        await banco.end();
      }
      for (const idPersona of personas) await borrarPersonaDePrueba(db, idPersona);
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
