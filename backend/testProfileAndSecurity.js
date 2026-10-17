// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

const http = require('http');
const { app, server } = require('./src/server');
const db = require('./src/config/db');
const { crearUsuarioDePrueba, borrarPersonaDePrueba } = require('./testHelper');

const testServer = server.listen(0, async () => {
  const testPort = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] PRUEBAS AUTOMATIZADAS: PERFIL Y CAMBIO DE CONTRASEÑA');
  console.log(`[INFO] Servidor de pruebas ejecutándose en puerto: ${testPort}`);
  console.log('=============================================================\n');

  const request = (path, method, data, token) => {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (data) headers['Content-Length'] = Buffer.byteLength(payload);

      const req = http.request(
        { hostname: 'localhost', port: testPort, path, method, headers },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, body });
            }
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(payload);
      req.end();
    });
  };

  let totalTests = 0;
  let passedTests = 0;

  const assert = (condition, title) => {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${title}`);
    } else {
      console.error(`  [FAIL] ${title}`);
    }
  };

  // Usuario de prueba propio: cambiarle la contraseña no afecta a los usuarios semilla
  const sufijo = String(Date.now()).slice(-7);
  const codigo = `OP-T8${sufijo}`;
  const NUEVA = 'Nueva.Clave2026';
  const tokens = [];
  let idPersona = null;
  let errorInesperado = false;

  try {
    const usuario = await crearUsuarioDePrueba(db, {
      dpi: `944${sufijo}000`.slice(0, 13),
      codigo,
      email: `test.perfil.${sufijo}@cooperativa.com`,
      rol: 'OPERADOR',
    });
    idPersona = usuario.idPersona;

    const loginRes = await request('/api/auth/login', 'POST', { identifier: codigo, password: 'admin123' });
    assert(loginRes.status === 200, `Inicio de sesión exitoso con el usuario de prueba ${codigo}`);
    const token = loginRes.body.token;
    if (!token) throw new Error('Sin token no se puede seguir.');
    tokens.push(token);

    // =========================================================================
    // PRUEBAS DE ACTUALIZACIÓN DE PERFIL (TELÉFONO)
    // =========================================================================
    console.log('\n--- 1. ACTUALIZAR DATOS DE PERFIL (TELÉFONO) ---');

    const nuevoTelefono = '55559988';
    const updatePerfilRes = await request('/api/auth/perfil', 'PATCH', { telefono: nuevoTelefono }, token);
    assert(updatePerfilRes.status === 200, 'PATCH /api/auth/perfil responde 200 OK');
    assert(updatePerfilRes.body.data?.telefono === nuevoTelefono, 'Respuesta contiene el nuevo teléfono actualizado');

    const dbCheck = await db.query('SELECT telefono FROM personas WHERE id_persona = $1', [idPersona]);
    assert(dbCheck.rows[0].telefono === nuevoTelefono, 'El nuevo teléfono está correctamente persistido en la tabla personas');

    // =========================================================================
    // PRUEBAS DE CAMBIO DE CONTRASEÑA (política: 8 caracteres, letras, números y un símbolo)
    // =========================================================================
    console.log('\n--- 2. CAMBIO SEGURO DE CONTRASEÑA ---');
    const cambiar = (password_actual, nueva_password, confirmar_password = nueva_password) =>
      request('/api/auth/cambiar-password', 'POST', { password_actual, nueva_password, confirmar_password }, token);

    const badCurrent = await cambiar('clave_incorrecta_xyz', NUEVA);
    assert(badCurrent.status === 400 && /no es correcta/.test(badCurrent.body.message || ''), 'Contraseña actual incorrecta es rechazada con status 400');

    const shortPass = await cambiar('admin123', 'Ab1!');
    assert(shortPass.status === 400, 'Contraseña de menos de 8 caracteres es rechazada con status 400');

    const sinSimbolo = await cambiar('admin123', 'Clave2026sin');
    assert(sinSimbolo.status === 400, 'Contraseña sin símbolo es rechazada con status 400');

    const mismatchPass = await cambiar('admin123', NUEVA, 'Otra.Clave2026');
    assert(mismatchPass.status === 400, 'Contraseñas que no coinciden son rechazadas con status 400');

    // Una contraseña que cumple la política, igual a la actual: la rechaza la regla «distinta de la actual»
    const samePass = await cambiar(NUEVA, NUEVA);
    assert(samePass.status === 400 && /distinta de la actual/.test(samePass.body.message || ''), 'Contraseña idéntica a la actual es rechazada con status 400');

    const successPass = await cambiar('admin123', NUEVA);
    assert(successPass.status === 200, 'Cambio de contraseña exitoso retorna status 200');

    const viejaRes = await request('/api/auth/login', 'POST', { identifier: codigo, password: 'admin123' });
    assert(viejaRes.status === 401, 'La contraseña anterior ya no sirve');
    // El intento fallido no debe dejar la cuenta contando hacia el bloqueo
    await db.query('UPDATE usuarios SET intentos_fallidos = 0 WHERE id_usuario = $1', [usuario.idUsuario]);

    const newLoginRes = await request('/api/auth/login', 'POST', { identifier: codigo, password: NUEVA });
    assert(newLoginRes.status === 200, 'El usuario inicia sesión con la nueva contraseña');
    if (newLoginRes.body.token) tokens.push(newLoginRes.body.token);
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      if (idPersona) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }

    console.log('\n=============================================================');
    console.log(`[SUMMARY] RESULTADO: ${passedTests}/${totalTests} pruebas aprobadas exitosamente.`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passedTests === totalTests && !errorInesperado ? 0 : 1);
  }
});
