// Las pruebas nunca envían correo real y usan el código de verificación de desarrollo: debe ir antes de cargar el servidor.
const CODIGO_DEV = '246810';
process.env.CODIGO_VERIFICACION_DEV = CODIGO_DEV;
process.env.MAIL_ENABLED = 'false';
process.env.NODE_ENV = 'test';

/**
 * testCobroAfiliacion.js
 *
 * Fase 6, parte 3: cobro del aporte al formalizar en ventanilla (débito de una cuenta propia del banco, efectivo a una
 * cuenta que ya tiene o a una nueva), «terminar en ventanilla» de un cliente del banco, la reversión al cancelar un
 * caso que dejó un débito en el banco y el depósito del externo en una cuenta suya en la afiliación presencial (#81).
 * Usa el banco real (puerto 5002) con clientes de prueba que crea y borra.
 */
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { firmarAfiliacionToken } = require('./src/utils/afiliacionToken');
const {
  makeRequest,
  createTestReporter,
  borrarPersonaDePrueba,
  borrarClienteBancoDePrueba,
  purgarDocumentosDePrueba,
  purgarEfectivoDePrueba,
  purgarReversionesDePrueba,
  escanearDocumentosObligatorios,
  pdfDePrueba,
  poolDueno,
} = require('./testHelper');

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] COBRO DEL APORTE AL AFILIAR (FASE 6, PARTE 3)');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-8);
  // DPI de prueba (13 dígitos) que no existen en la semilla
  const dpi = (prefijo) => `${prefijo}${sufijo}`.padEnd(13, '0').slice(0, 13);
  const dpis = { debito: dpi('91'), existente: dpi('92'), reversion: dpi('93'), presencial: dpi('94') };
  const tokens = [];
  const referencias = [];
  let errorInesperado = false;

  const saldo = async (numero) => Number((await bancoApiService.consultarCuenta(numero)).data?.saldo_disponible);
  const cuentasDelBanco = async (cui) => (await bancoApiService.obtenerCuentasCliente(cui)).data || [];
  /** Cliente del banco con una cuenta de ahorro de Q1,000.00 (la apertura crea al cliente). */
  const clienteDelBanco = async (cui, nombre) => {
    const res = await bancoApiService.aperturarCuentaBancaria({
      cui_dpi: cui, primer_nombre: nombre, primer_apellido: 'Cobro', telefono: '55559100', direccion: 'Guatemala',
      email: `${nombre.toLowerCase()}.${sufijo}@example.com`, fecha_nacimiento: '1990-05-05', tipo_cuenta: 'AHORRO',
      monto_inicial: 1000, referencia: `TEST-COBRO-${cui}`,
    });
    if (!res.success) throw new Error(`No se pudo crear el cliente del banco ${cui}: ${res.message}`);
    return res.data.numero_cuenta;
  };
  const nuevaSolicitud = async (cui, nombre) => (await db.query(
    `INSERT INTO solicitudes_afiliacion_agencia (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
     VALUES ('', $1, $2, 'Cobro', '55559101', '1990-05-05', $3, 'PENDIENTE_AGENCIA')
     RETURNING id_solicitud, numero_caso, fecha_solicitud`,
    [cui, nombre, `${nombre.toLowerCase()}.sol.${sufijo}@example.com`]
  )).rows[0];
  const formalizar = (idSolicitud, datos, token) =>
    request(`/api/operador/afiliaciones/${idSolicitud}/formalizar`, 'POST', { monto_aportacion: 200, crear_acceso_portal: false, ...datos }, token);

  const limpiar = async () => {
    const lista = Object.values(dpis);
    for (const cui of lista) {
      const persona = await db.query('SELECT id_persona FROM personas WHERE cui_dpi = $1', [cui]);
      if (persona.rows[0]) await borrarPersonaDePrueba(db, persona.rows[0].id_persona);
    }
    await purgarDocumentosDePrueba(db, lista);
    await purgarEfectivoDePrueba(db, lista);
    await purgarReversionesDePrueba(db, referencias);
    await poolDueno(db.pool).query('DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = ANY($1)', [lista]);
    for (const cui of lista) await borrarClienteBancoDePrueba(db.pool, cui);
  };

  try {
    await limpiar();
    const entrar = async (codigo) => {
      const login = await request('/api/auth/login', 'POST', { email: codigo, password: 'admin123' });
      tokens.push(login.body.token);
      return login.body.token;
    };
    const op1 = await entrar('OP-1');
    const op2 = await entrar('OP-2');

    // -------------------------------------------------------------------------
    console.log('\n--- 1. Cliente del banco que termina en ventanilla y paga con débito ---');
    const cuentaDebito = await clienteDelBanco(dpis.debito, 'Debora');
    const comprobante = firmarAfiliacionToken({
      cui_dpi: dpis.debito, tipo_asociado: 'EX', cuentas: [{ id_cuenta_bancaria: 1, numero_cuenta_bancaria: cuentaDebito }],
    });
    const previo = await request('/api/afiliacion/documentos', 'POST', {
      afiliacion_token: comprobante, tipo_documento: 'DPI_FRENTE', archivo: pdfDePrueba(`debito-${sufijo}`),
    });
    const email = `debora.${sufijo}@example.com`;
    await request('/api/afiliacion/codigo-correo', 'POST', { email });
    const datosSolicitud = {
      cui_dpi: dpis.debito, primer_nombre: 'Debora', primer_apellido: 'Cobro', telefono: '55559102',
      fecha_nacimiento: '1990-05-05', email, codigo_verificacion: CODIGO_DEV,
    };
    const sinComprobante = await request('/api/afiliacion/terminar-en-ventanilla', 'POST', datosSolicitud);
    const enVentanilla = await request('/api/afiliacion/terminar-en-ventanilla', 'POST', { ...datosSolicitud, afiliacion_token: comprobante });
    const idSolicitudDebito = enVentanilla.body.data?.id_solicitud;
    const expedienteDebito = (await db.query('SELECT id_solicitud, expira_en FROM expedientes_documentos WHERE cui_dpi = $1', [dpis.debito])).rows[0];
    assert(previo.status === 201 && sinComprobante.status === 403 && enVentanilla.status === 201 && enVentanilla.body.data.carga_token
      && expedienteDebito?.id_solicitud === idSolicitudDebito && expedienteDebito.expira_en === null,
      'Con el comprobante del banco registra la solicitud sin débito; sus documentos en línea pasan a la solicitud');

    assert(await escanearDocumentosObligatorios(port, op2, { idSolicitud: idSolicitudDebito }), 'Ventanilla escanea los documentos');
    const sinCuenta = await formalizar(idSolicitudDebito, { metodo_pago: 'DEBITO_CUENTA' }, op1);
    const cuentaAjena = await formalizar(idSolicitudDebito, { metodo_pago: 'DEBITO_CUENTA', numero_cuenta_bancaria: 'CTA-BCO-MONET-1004' }, op1);
    assert(sinCuenta.status === 400 && cuentaAjena.status === 403, 'El débito exige una cuenta del banco que sea de la persona');

    const saldoAntes = await saldo(cuentaDebito);
    const conDebito = await formalizar(idSolicitudDebito, { metodo_pago: 'DEBITO_CUENTA', numero_cuenta_bancaria: cuentaDebito }, op1);
    const saldoDespues = await saldo(cuentaDebito);
    const socioDebito = (await db.query(
      `SELECT a.tipo_asociado, a.canal_afiliacion, c.saldo_disponible,
              (SELECT count(*)::int FROM efectivo_ventanilla e WHERE e.cui_dpi = $1) AS efectivo
       FROM asociados a JOIN personas p ON p.id_persona = a.id_persona
       LEFT JOIN cuentas c ON c.id_asociado = a.id_asociado WHERE p.cui_dpi = $1`, [dpis.debito]
    )).rows[0];
    assert(conDebito.status === 200 && conDebito.body.data.metodo_pago === 'DEBITO_CUENTA' && saldoAntes - saldoDespues === 200
      && Number(socioDebito?.saldo_disponible) === 200 && socioDebito.efectivo === 0 && socioDebito.canal_afiliacion === 'AGENCIA',
      'Formaliza con débito: sale de su cuenta del banco, entra a una cuenta de la cooperativa y no se registra como efectivo');

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Efectivo a una cuenta que ya tiene en el banco (#81) ---');
    const cuentaExistente = await clienteDelBanco(dpis.existente, 'Ernesto');
    const solExistente = await nuevaSolicitud(dpis.existente, 'Ernesto');
    await escanearDocumentosObligatorios(port, op2, { idSolicitud: solExistente.id_solicitud });
    const cuentasAntes = (await cuentasDelBanco(dpis.existente)).length;
    const saldoExistenteAntes = await saldo(cuentaExistente);
    const aExistente = await formalizar(solExistente.id_solicitud, { metodo_pago: 'EFECTIVO_VENTANILLA', numero_cuenta_bancaria: cuentaExistente }, op1);
    const efectivoExistente = await db.query('SELECT monto FROM efectivo_ventanilla WHERE cui_dpi = $1', [dpis.existente]);
    assert(aExistente.status === 200 && aExistente.body.data.cuenta_bancaria === cuentaExistente && !aExistente.body.data.cuenta_bancaria_nueva
      && (await saldo(cuentaExistente)) - saldoExistenteAntes === 200 && (await cuentasDelBanco(dpis.existente)).length === cuentasAntes
      && efectivoExistente.rows.length === 1,
      'El efectivo se acredita en su cuenta, no se abre otra y queda registrado como efectivo de ventanilla');

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Un débito que quedó en el banco: no se cobra con otra forma y se devuelve al cancelar ---');
    const cuentaReversion = await clienteDelBanco(dpis.reversion, 'Rosa');
    const solReversion = await nuevaSolicitud(dpis.reversion, 'Rosa');
    await escanearDocumentosObligatorios(port, op2, { idSolicitud: solReversion.id_solicitud });
    const referenciaCaso = bancoApiService.referenciaDeOperacion(solReversion.numero_caso, solReversion.fecha_solicitud);
    referencias.push(referenciaCaso);
    // Un intento anterior debitó y la cooperativa no lo registró (por ejemplo, el banco tardó en responder)
    const saldoReversionAntes = await saldo(cuentaReversion);
    await bancoApiService.debitarCuenta({
      numero_cuenta: cuentaReversion, cui_dpi: dpis.reversion, monto: 200, concepto: 'Intento anterior', referencia: referenciaCaso,
    });
    const conEfectivo = await formalizar(solReversion.id_solicitud, { metodo_pago: 'EFECTIVO_VENTANILLA' }, op1);
    assert(conEfectivo.status === 409, 'Con un débito anterior en el banco no se cobra en efectivo (sería un cobro doble)');
    const cancelado = await request(`/api/operador/afiliaciones/${solReversion.id_solicitud}/rechazar`, 'POST', { motivo: 'Prueba de cancelación' }, op1);
    assert(cancelado.status === 200 && (await saldo(cuentaReversion)) === saldoReversionAntes,
      'Al cancelar el caso se devuelve el débito que quedó en el banco');

    // -------------------------------------------------------------------------
    console.log('\n--- 4. Presencial: el externo deposita en una cuenta suya (#81) ---');
    const cuentaPresencial = await clienteDelBanco(dpis.presencial, 'Pedro');
    await escanearDocumentosObligatorios(port, op2, { cui: dpis.presencial });
    const cuentasPresencialAntes = (await cuentasDelBanco(dpis.presencial)).length;
    const saldoPresencialAntes = await saldo(cuentaPresencial);
    const datosPresencial = {
      cui_dpi: dpis.presencial, primer_nombre: 'Pedro', primer_apellido: 'Cobro', fecha_nacimiento: '1990-05-05',
      telefono: '55559104', monto_aportacion: 150, crear_acceso_portal: false,
    };
    const presencialAjena = await request('/api/admin/asociados/presencial', 'POST', { ...datosPresencial, numero_cuenta_bancaria: 'CTA-BCO-MONET-1004' }, op1);
    const presencial = await request('/api/admin/asociados/presencial', 'POST', { ...datosPresencial, numero_cuenta_bancaria: cuentaPresencial }, op1);
    assert(presencialAjena.status === 403 && presencial.status === 201 && !presencial.body.data.cuenta_bancaria_creada
      && (await saldo(cuentaPresencial)) - saldoPresencialAntes === 150
      && (await cuentasDelBanco(dpis.presencial)).length === cuentasPresencialAntes,
      'En ventanilla, el efectivo del externo va a su cuenta (no a una ajena) sin abrirle otra');
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    try {
      await limpiar();
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }
    await poolDueno(db.pool).end();
    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
