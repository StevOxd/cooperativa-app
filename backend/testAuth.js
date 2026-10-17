// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testAuth.js
 *
 * Inicio de sesión por correo y por código, respuestas que no revelan si la cuenta existe, usuario inactivo y
 * validación del token en rutas protegidas.
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. Limpia lo que crea.
 */
const { app } = require('./src/server');
const db = require('./src/config/db');
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba } = require('./testHelper');

const server = app.listen(0, async () => {
  const port = server.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] AUTENTICACIÓN');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const tokens = [];
  let idPersonaInactiva = null;
  let errorInesperado = false;

  try {
    console.log('--- Inicio de sesión ---');
    const porCorreo = await request('/api/auth/login', 'POST', { identifier: 'admin@cooperativa.com', password: 'admin123' });
    assert(porCorreo.status === 200 && Boolean(porCorreo.body.token), 'Entra con el correo (AD-1)');
    if (porCorreo.body.token) tokens.push(porCorreo.body.token);

    const porCodigo = await request('/api/auth/login', 'POST', { identifier: 'AD-1', password: 'admin123' });
    assert(porCodigo.status === 200 && Boolean(porCodigo.body.token), 'Entra con el código corporativo (AD-1)');
    if (porCodigo.body.token) tokens.push(porCodigo.body.token);
    const adminToken = porCodigo.body.token;

    console.log('\n--- Fallos que no revelan si la cuenta existe ---');
    const claveIncorrecta = await request('/api/auth/login', 'POST', { identifier: 'AD-1', password: 'claveIncorrecta1!' });
    const noExiste = await request('/api/auth/login', 'POST', { identifier: `NO-EXISTE-${sufijo}`, password: 'claveIncorrecta1!' });
    assert(claveIncorrecta.status === 401 && !claveIncorrecta.body.token, 'Con la contraseña incorrecta responde 401 sin token');
    assert(
      noExiste.status === claveIncorrecta.status && noExiste.body.message === claveIncorrecta.body.message,
      'Un usuario que no existe recibe la misma respuesta que una contraseña incorrecta'
    );
    // El intento fallido de AD-1 no debe quedar contando para otras suites
    await db.query("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE codigo_corporativo = 'AD-1'");

    console.log('\n--- Usuario inactivo ---');
    const inactivo = await crearUsuarioDePrueba(db, {
      dpi: `941${sufijo}000`.slice(0, 13),
      codigo: `OP-T9${sufijo}`,
      email: `auth.inactivo.${sufijo}@cooperativa.com`,
      rol: 'OPERADOR',
      estado: 'INACTIVO',
    });
    idPersonaInactiva = inactivo.idPersona;
    const inactivoClaveCorrecta = await request('/api/auth/login', 'POST', { identifier: `OP-T9${sufijo}`, password: 'admin123' });
    const inactivoClaveIncorrecta = await request('/api/auth/login', 'POST', { identifier: `OP-T9${sufijo}`, password: 'claveIncorrecta1!' });
    assert(inactivoClaveCorrecta.status === 403 && !inactivoClaveCorrecta.body.token, 'Un usuario inactivo con su contraseña correcta recibe 403 sin token');
    assert(
      inactivoClaveIncorrecta.status === 401 && inactivoClaveIncorrecta.body.message === claveIncorrecta.body.message,
      'Con la contraseña incorrecta, un usuario inactivo recibe la respuesta genérica (no se revela que existe)'
    );

    console.log('\n--- Rutas protegidas ---');
    const conToken = await request('/api/auth/me', 'GET', null, adminToken);
    assert(conToken.status === 200 && conToken.body.user?.codigo_corporativo === 'AD-1', 'GET /api/auth/me con un token vigente responde 200 con el usuario');
    const sinToken = await request('/api/auth/me');
    assert(sinToken.status === 401, 'Sin token responde 401');
    const adulterado = await request('/api/auth/me', 'GET', null, 'token_invalido_12345');
    // Un token que no se puede verificar se rechaza con 403 (authMiddleware); uno vencido o sin sesión, con 401
    assert(adulterado.status === 403 && !adulterado.body.user, 'Con un token adulterado se rechaza (403)');
    const tokenAnterior = await request('/api/auth/me', 'GET', null, porCorreo.body.token);
    assert(tokenAnterior.status === 401, 'El token de la sesión anterior deja de servir al iniciar una nueva');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      if (idPersonaInactiva) await borrarPersonaDePrueba(db, idPersonaInactiva);
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
