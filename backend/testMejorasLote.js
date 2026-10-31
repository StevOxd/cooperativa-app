// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testMejorasLote.js
 *
 * - #82: el asociado ve todas sus cuentas del banco como origen de un traslado y elige una; la
 *   solicitud dice si la cuenta es del banco o de la cooperativa y solo se busca ahí.
 * - #89: cada resolución del comité (devolver, denegar) queda en su historial.
 * - #91: el listado de asociados no pasa de 100 por página.
 * - #92: el bloqueo automático guarda el User-Agent recortado.
 * - #78: un PDF de crédito de más de 10 MB se rechaza con un mensaje claro.
 * - #87: el número de caso usa el año de Guatemala.
 *
 * Usa el backend en proceso y la base de datos local; las cuentas del asociado en el banco se simulan. Limpia lo que crea.
 */
const crypto = require('crypto');
const http = require('http');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { saveBase64File } = require('./src/utils/fileStorage');
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba } = require('./testHelper');

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] LOTE DE MEJORAS Y ERRORES (#78, #82, #87, #89, #91, #92)');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const unico = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dpi = (prefijo) => `${prefijo}${sufijo}000`.slice(0, 13);
  const tokens = [];
  const asociados = [];
  const personal = [];
  const originalObtenerCuentas = bancoApiService.obtenerCuentasCliente;
  let errorInesperado = false;

  try {
    const login = async (identifier) => {
      const token = (await request('/api/auth/login', 'POST', { identifier, password: 'admin123' })).body.token;
      if (token) tokens.push(token);
      return token;
    };
    const crear = async (lista, datos) => {
      const creado = await crearUsuarioDePrueba(db, datos);
      lista.push(creado.idPersona);
      return creado;
    };
    const asociado = await crear(asociados, {
      dpi: dpi('980'), codigo: `EX-TM${sufijo}`, email: `test.lote.asoc.${unico}@cooperativa.com`, rol: 'ASOCIADO', asociado: true,
    });
    const operador = await crear(personal, {
      dpi: dpi('981'), codigo: `OP-TM${sufijo}`, email: `test.lote.op.${unico}@cooperativa.com`, rol: 'OPERADOR',
    });
    const ejecutivo = await crear(personal, {
      dpi: dpi('982'), codigo: `EJ-TM${sufijo}`, email: `test.lote.ej.${unico}@cooperativa.com`, rol: 'EJECUTIVO',
    });
    const bloqueado = await crear(personal, {
      dpi: dpi('983'), codigo: `OP-TB${sufijo}`, email: `test.lote.bl.${unico}@cooperativa.com`, rol: 'OPERADOR',
    });

    // Cuentas del asociado en el banco (simuladas): ahorro y monetaria activas y una inactiva
    bancoApiService.obtenerCuentasCliente = async (cui) => (cui === dpi('980')
      ? {
        success: true,
        data: [
          { id_cuenta_bancaria: 9901, numero_cuenta_bancaria: `CTA-TEST-AH-${sufijo}`, saldo_disponible: '1000.00', estado: 'ACTIVA', tipo_cuenta: 'AHORRO' },
          { id_cuenta_bancaria: 9902, numero_cuenta_bancaria: `CTA-TEST-MO-${sufijo}`, saldo_disponible: '2500.00', estado: 'ACTIVA', tipo_cuenta: 'MONETARIA' },
          { id_cuenta_bancaria: 9903, numero_cuenta_bancaria: `CTA-TEST-IN-${sufijo}`, saldo_disponible: '50.00', estado: 'INACTIVA', tipo_cuenta: 'AHORRO' },
        ],
      }
      : originalObtenerCuentas(cui));

    const tokenAsociado = await login(`EX-TM${sufijo}`);
    const tokenOperador = await login(`OP-TM${sufijo}`);
    const tokenEjecutivo = await login(`EJ-TM${sufijo}`);
    assert(tokenAsociado && tokenOperador && tokenEjecutivo, 'Inician sesión los usuarios de prueba');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[1] Cuentas de origen de los traslados (#82)');
    // ---------------------------------------------------------------------------------------------------------
    const origenes = await request('/api/asociado/cuentas-origen', 'GET', null, tokenAsociado);
    const claves = (origenes.body.data || []).map((c) => `${c.origen_cuenta}:${c.id_cuenta}`);
    assert(origenes.status === 200 && claves.join() === 'BANCO:9901,BANCO:9902',
      'Lista todas las cuentas activas del banco (ahorro y monetaria) y no la inactiva');

    const minimo = (await db.query('SELECT monto_minimo_apertura FROM tipos_cuenta WHERE id_tipo_cuenta = 2')).rows[0].monto_minimo_apertura;
    const solicitar = (datos) => request('/api/asociado/solicitudes-traslado', 'POST', {
      monto: Math.max(Number(minimo), 100), tipo_operacion: 'APERTURA_Y_TRASLADO', id_tipo_cuenta_destino: 2, ...datos,
    }, tokenAsociado);
    const desdeMonetaria = await solicitar({ id_cuenta_origen: 9902, origen_cuenta: 'BANCO' });
    const guardada = desdeMonetaria.body.data && (await db.query(
      'SELECT id_cuenta_origen, id_cuenta_bancaria_origen FROM solicitudes_traslado_apertura WHERE numero_caso = $1',
      [desdeMonetaria.body.data.numero_caso]
    )).rows[0];
    assert(desdeMonetaria.status === 201 && guardada?.id_cuenta_bancaria_origen === 9902 && guardada.id_cuenta_origen === null,
      'El traslado sale de la cuenta del banco elegida (la monetaria)');
    assert((await solicitar({ id_cuenta_origen: 9902, origen_cuenta: 'COOPERATIVA' })).status === 403,
      'Con origen «cooperativa», una cuenta del banco no sirve (no se mezclan los dos orígenes)');
    assert((await solicitar({ id_cuenta_origen: 9903, origen_cuenta: 'BANCO' })).status === 403,
      'Una cuenta inactiva del banco no es origen (403)');
    assert((await solicitar({ id_cuenta_origen: 9901, origen_cuenta: 'OTRO' })).status === 400
      && (await solicitar({ id_cuenta_origen: 9901 })).status === 400
      && (await solicitar({ id_cuenta_origen: 'abc', origen_cuenta: 'BANCO' })).status === 400,
      'Sin origen, con un origen que no existe o con un id que no es número: 400');
    const anioGuatemala = (await db.query("SELECT to_char(now() AT TIME ZONE 'America/Guatemala', 'YYYY') AS a")).rows[0].a;
    assert(desdeMonetaria.body.data?.numero_caso?.startsWith(`CASO-${anioGuatemala}-`),
      'El número de caso lleva el año de Guatemala (#87)');
    // Con el banco caído: no se ofrece la cuenta principal como si no tuviera cuentas en el banco, y se avisa
    bancoApiService.obtenerCuentasCliente = async () => ({ success: false, status: 504 });
    const caido = await request('/api/asociado/cuentas-origen', 'GET', null, tokenAsociado);
    const conBancoCaido = await solicitar({ id_cuenta_origen: 9902, origen_cuenta: 'BANCO' });
    assert(caido.status === 200 && caido.body.banco_disponible === false && caido.body.data.length === 0 && conBancoCaido.status === 502,
      'Con el banco caído, el portal recibe el aviso y la solicitud responde 502 (no 403)');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[2] Historial de resoluciones del comité (#89)');
    // ---------------------------------------------------------------------------------------------------------
    const enComite = async () => (await db.query(
      `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado, id_operador_revisa)
       VALUES ($1, 1000, 12, 10, 90, 'EN_AUTORIZACION_EJECUTIVO', $2) RETURNING id_solicitud_credito`,
      [asociado.idAsociado, operador.idUsuario]
    )).rows[0].id_solicitud_credito;
    const resolver = (id, accion, observaciones) => request(`/api/ejecutivo/creditos/${id}/resolver`, 'POST', { accion, observaciones }, tokenEjecutivo);
    const historial = async (id) => (await db.query(
      'SELECT resolucion, observaciones, id_usuario_resuelve FROM resoluciones_credito WHERE id_solicitud_credito = $1 ORDER BY id_resolucion',
      [id]
    )).rows;

    const aDevolver = await enComite();
    const devuelta = await resolver(aDevolver, 'DEVOLVER', 'Falta la constancia de ingresos');
    // El operador la vuelve a elevar y el comité la deniega: dos resoluciones
    await db.query("UPDATE solicitudes_credito SET estado = 'EN_AUTORIZACION_EJECUTIVO' WHERE id_solicitud_credito = $1", [aDevolver]);
    const denegada = await resolver(aDevolver, 'DENEGAR', 'Capacidad de pago insuficiente');
    const filas = await historial(aDevolver);
    assert(devuelta.status === 200 && denegada.status === 200, 'El ejecutivo devuelve y después deniega la solicitud');
    assert(filas.map((f) => f.resolucion).join() === 'DEVUELTA,DENEGADA'
      && filas[0].observaciones === 'Falta la constancia de ingresos' && filas.every((f) => f.id_usuario_resuelve === ejecutivo.idUsuario),
      'El historial guarda las dos resoluciones, en orden, con su observación y quién resolvió');
    const sinCambios = await resolver(await enComite(), 'DEVOLVER', '   ');
    assert(sinCambios.status === 400, 'Una resolución rechazada (sin observación) no deja nada en el historial (400)');
    const cambiar = await db.query("UPDATE resoluciones_credito SET resolucion = 'APROBADA' WHERE id_solicitud_credito = $1", [aDevolver])
      .then(() => 'ok', (e) => e.code);
    assert(cambiar === '42501', 'El historial no se modifica con el rol de la aplicación (42501)');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[3] Tope de página del listado de asociados (#91)');
    // ---------------------------------------------------------------------------------------------------------
    const pagina = (query) => request(`/api/admin/asociados?${query}`, 'GET', null, tokenOperador);
    const enorme = await pagina('limit=1000000');
    const invalido = await pagina('limit=abc&page=-5');
    const repetido = await pagina('search=a&search=b');
    assert(enorme.status === 200 && enorme.body.pagination.limit === 100 && enorme.body.data.length <= 100,
      'Un tamaño de página enorme se limita a 100');
    assert(invalido.status === 200 && invalido.body.pagination.limit === 10 && invalido.body.pagination.page === 1,
      'Valores no válidos toman los predeterminados (10 por página, página 1)');
    assert(repetido.status === 200, 'Un filtro repetido en la URL no rompe la consulta');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[4] User-Agent recortado en el bloqueo automático (#92)');
    // ---------------------------------------------------------------------------------------------------------
    const agenteLargo = `Prueba/${'x'.repeat(2000)}`;
    const loginFallido = () => new Promise((resolve) => {
      const cuerpo = JSON.stringify({ identifier: `OP-TB${sufijo}`, password: 'claveIncorrecta1!' });
      const req = http.request({
        hostname: 'localhost', port, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo), 'User-Agent': agenteLargo },
      }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', () => resolve(0));
      req.end(cuerpo);
    });
    for (let i = 0; i < 3; i += 1) await loginFallido();
    const bloqueo = (await db.query(
      `SELECT length(user_agent) AS largo FROM historial_estados_usuario
       WHERE id_usuario_modificado = $1 AND estado_nuevo = 'BLOQUEADO_TEMPORAL' ORDER BY id_historial_estado DESC LIMIT 1`,
      [bloqueado.idUsuario]
    )).rows[0];
    assert(bloqueo?.largo === 500, 'El bloqueo automático guarda el User-Agent recortado a 500 caracteres');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[5] PDF de crédito de más de 10 MB (#78) y año del número de caso (#87)');
    // ---------------------------------------------------------------------------------------------------------
    const grande = `data:application/pdf;base64,${Buffer.alloc(10 * 1024 * 1024 + 1, 0x25).toString('base64')}`;
    const rechazo = await saveBase64File(grande, 'creditos', 'grande.pdf', 'prueba').then(() => null, (e) => e);
    assert(rechazo?.statusCode === 400 && /10 MB/.test(rechazo.message), 'Un PDF de más de 10 MB se rechaza (400) con un mensaje que dice el máximo');
    const funciones = (await db.query(
      `SELECT bool_and(pg_get_functiondef(p.oid) LIKE '%America/Guatemala%') AS en_guatemala
       FROM pg_proc p WHERE p.proname IN ('trg_generar_numero_caso', 'trg_generar_numero_caso_afiliacion')`
    )).rows[0];
    assert(funciones.en_guatemala === true, 'Los números de caso toman el año de Guatemala');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    bancoApiService.obtenerCuentasCliente = originalObtenerCuentas;
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      // Primero el asociado (sus solicitudes y el historial apuntan al personal) y después el personal
      for (const idPersona of [...asociados, ...personal]) await borrarPersonaDePrueba(db, idPersona);
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
