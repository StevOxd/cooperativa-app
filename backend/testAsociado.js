// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testAsociado.js
 *
 * Portal del asociado: acceso solo con su rol, perfil, cuentas y movimientos propios (no los de otra
 * persona), créditos, validación de la solicitud de crédito y cuota con amortización francesa (10 % anual).
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local, con asociados de prueba propios. El
 * banco se simula para el DPI de prueba. Limpia lo que crea.
 */
const { app } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba } = require('./testHelper');

const server = app.listen(0, async () => {
  const port = server.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] PORTAL DEL ASOCIADO');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const dpi = `943${sufijo}000`.slice(0, 13);
  const codigo = `EX-T7${sufijo}`;
  const tokens = [];
  const personas = [];
  let errorInesperado = false;

  // Banco simulado para el DPI de prueba: una cuenta de ahorro suya con saldo para el scoring
  const cuentaBanco = { id_cuenta_bancaria: 777777, numero_cuenta_bancaria: `CTA-BCO-TA-${sufijo}`, tipo_cuenta: 'AHORRO', estado: 'ACTIVA', saldo_disponible: 50000 };
  const obtenerCuentasOriginal = bancoApiService.obtenerCuentasCliente;
  bancoApiService.obtenerCuentasCliente = async (cui) =>
    cui === dpi ? { success: true, status: 200, data: [cuentaBanco] } : obtenerCuentasOriginal(cui);
  const tipoAhorro = `(SELECT id_tipo_cuenta FROM tipos_cuenta WHERE nombre ILIKE '%ahorro%' ORDER BY id_tipo_cuenta LIMIT 1)`;

  try {
    // Asociado de prueba con una cuenta de ahorro y un movimiento
    const asociado = await crearUsuarioDePrueba(db, {
      dpi,
      codigo,
      email: `test.asociado.${sufijo}@gmail.com`,
      rol: 'ASOCIADO',
      asociado: true,
    });
    personas.push(asociado.idPersona);
    const idCuenta = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible)
       VALUES ($1, $2, ${tipoAhorro}, 250) RETURNING id_cuenta`,
      [`CTA-TA-${sufijo}`, asociado.idAsociado]
    )).rows[0].id_cuenta;
    await db.query(
      `INSERT INTO transacciones (id_cuenta, id_usuario_registra, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia)
       VALUES ($1, $2, 'DEPOSITO', 250, 0, 250, 'Depósito de prueba')`,
      [idCuenta, asociado.idUsuario]
    );
    // Otra persona con su cuenta, para comprobar que no se pueden ver sus movimientos
    const otra = await crearUsuarioDePrueba(db, {
      dpi: `947${sufijo}000`.slice(0, 13),
      codigo: `EX-T4${sufijo}`,
      email: `test.asociado.otra.${sufijo}@gmail.com`,
      rol: 'ASOCIADO',
      asociado: true,
    });
    personas.push(otra.idPersona);
    const idCuentaAjena = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible)
       VALUES ($1, $2, ${tipoAhorro}, 100) RETURNING id_cuenta`,
      [`CTA-TA-OTRA-${sufijo}`, otra.idAsociado]
    )).rows[0].id_cuenta;

    console.log('--- Acceso por rol ---');
    const sinToken = await request('/api/asociado/perfil');
    assert(sinToken.status === 401, 'GET /api/asociado/perfil sin token responde 401');

    const loginAdmin = await request('/api/auth/login', 'POST', { identifier: 'AD-1', password: 'admin123' });
    if (loginAdmin.body.token) tokens.push(loginAdmin.body.token);
    const comoAdmin = await request('/api/asociado/perfil', 'GET', null, loginAdmin.body.token);
    assert(comoAdmin.status === 403, 'Un administrador no entra al portal del asociado (403)');

    const login = await request('/api/auth/login', 'POST', { identifier: codigo, password: 'admin123' });
    const token = login.body.token;
    assert(login.status === 200 && Boolean(token), 'El asociado de prueba inicia sesión');
    if (!token) throw new Error('Sin token del asociado no se puede seguir.');
    tokens.push(token);

    console.log('\n--- Perfil, cuentas y movimientos ---');
    const perfil = await request('/api/asociado/perfil', 'GET', null, token);
    assert(perfil.status === 200 && perfil.body.data?.cui_dpi === dpi, 'El perfil es el del asociado');
    const cuentas = await request('/api/asociado/cuentas', 'GET', null, token);
    const lista = cuentas.body.data || [];
    assert(
      cuentas.status === 200 && lista.length === 1 && Number(lista[0].id_cuenta) === Number(idCuenta),
      'Ve solo su cuenta'
    );
    const movimientos = await request(`/api/asociado/cuentas/${idCuenta}/transacciones`, 'GET', null, token);
    assert(movimientos.status === 200 && Array.isArray(movimientos.body.data) && movimientos.body.data.length === 1, 'Ve los movimientos de su cuenta');
    const ajenos = await request(`/api/asociado/cuentas/${idCuentaAjena}/transacciones`, 'GET', null, token);
    assert(ajenos.status === 403 || ajenos.status === 404, 'No ve los movimientos de la cuenta de otra persona');

    console.log('\n--- Créditos ---');
    const creditos = await request('/api/asociado/creditos', 'GET', null, token);
    assert(creditos.status === 200 && Array.isArray(creditos.body.data), 'Lista sus créditos');
    const sinCuenta = await request('/api/asociado/creditos/iniciar', 'POST', { monto_solicitado: 5000, plazo_meses: 12 }, token);
    assert(sinCuenta.status === 400, 'La solicitud de crédito sin cuenta de destino se rechaza (400)');
    const fueraDeRango = await request('/api/asociado/creditos/iniciar', 'POST', { monto_solicitado: 1, plazo_meses: 12, id_cuenta_bancaria_destino: 1 }, token);
    assert(fueraDeRango.status === 400, 'Un monto fuera de los límites se rechaza (400)');

    // Q12,000 a 12 meses al 10 % anual: cuota nivelada de Q1,054.99
    const credito = await request('/api/asociado/creditos/iniciar', 'POST', {
      monto_solicitado: 12000,
      plazo_meses: 12,
      id_cuenta_bancaria_destino: cuentaBanco.id_cuenta_bancaria,
    }, token);
    assert(
      credito.status === 201 && Math.abs(Number(credito.body.data?.cuota_mensual_estimada) - 1054.99) <= 0.01,
      `La cuota sigue la amortización francesa (${credito.body.data?.cuota_mensual_estimada ?? credito.body.message})`
    );
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    bancoApiService.obtenerCuentasCliente = obtenerCuentasOriginal;
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
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
    server.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
