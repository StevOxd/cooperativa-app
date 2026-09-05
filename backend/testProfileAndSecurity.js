const http = require('http');
const { app, server } = require('./src/server');
const db = require('./src/config/db');

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

  try {
    // 1. Iniciar sesión con usuario 2002 (Operador)
    const loginRes = await request('/api/auth/login', 'POST', {
      identifier: '2002',
      password: 'admin123',
    });
    assert(loginRes.status === 200, 'Inicio de sesión exitoso con usuario 2002');
    const token = loginRes.body.token;
    const userId = loginRes.body.user.id_persona;

    // =========================================================================
    // PRUEBAS DE ACTUALIZACIÓN DE PERFIL (TELÉFONO)
    // =========================================================================
    console.log('\n--- 1. ACTUALIZAR DATOS DE PERFIL (TELÉFONO) ---');

    const nuevoTelefono = '5555-9988';
    const updatePerfilRes = await request(
      '/api/auth/perfil',
      'PATCH',
      { telefono: nuevoTelefono },
      token
    );
    assert(updatePerfilRes.status === 200, 'PATCH /api/auth/perfil responde 200 OK');
    assert(
      updatePerfilRes.body.data.telefono === nuevoTelefono,
      'Respuesta contiene el nuevo teléfono actualizado'
    );

    // Verificar en la base de datos (tabla personas)
    const dbCheck = await db.query(
      'SELECT telefono FROM personas WHERE id_persona = $1',
      [userId]
    );
    assert(
      dbCheck.rows[0].telefono === nuevoTelefono,
      'El nuevo teléfono está correctamente persistido en la tabla personas'
    );

    // =========================================================================
    // PRUEBAS DE CAMBIO DE CONTRASEÑA
    // =========================================================================
    console.log('\n--- 2. CAMBIO SEGURO DE CONTRASEÑA ---');

    // Caso A: Contraseña actual errónea
    const badCurrent = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'clave_incorrecta_xyz',
        nueva_password: 'newPassword2026',
        confirmar_password: 'newPassword2026',
      },
      token
    );
    assert(badCurrent.status === 400, 'Contraseña actual incorrecta es rechazada con status 400');
    assert(
      badCurrent.body.message.includes('incorrecta'),
      'Mensaje claro de contraseña actual incorrecta'
    );

    // Caso B: Nueva contraseña menor a 6 caracteres
    const shortPass = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'admin123',
        nueva_password: '123',
        confirmar_password: '123',
      },
      token
    );
    assert(shortPass.status === 400, 'Contraseña menor a 6 caracteres es rechazada con status 400');

    // Caso C: Confirmación no coincide
    const mismatchPass = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'admin123',
        nueva_password: 'newPassword2026',
        confirmar_password: 'differentPassword2026',
      },
      token
    );
    assert(mismatchPass.status === 400, 'Contraseñas que no coinciden son rechazadas con status 400');

    // Caso D: Nueva contraseña idéntica a la actual
    const samePass = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'admin123',
        nueva_password: 'admin123',
        confirmar_password: 'admin123',
      },
      token
    );
    assert(samePass.status === 400, 'Contraseña idéntica a la actual es rechazada con status 400');

    // Caso E: Cambio exitoso a 'newPassword2026'
    const successPass = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'admin123',
        nueva_password: 'newPassword2026',
        confirmar_password: 'newPassword2026',
      },
      token
    );
    assert(successPass.status === 200, 'Cambio de contraseña exitoso retorna status 200');

    // Caso F: Iniciar sesión con la nueva contraseña
    const newLoginRes = await request('/api/auth/login', 'POST', {
      identifier: '2002',
      password: 'newPassword2026',
    });
    assert(newLoginRes.status === 200, 'Usuario 2002 inicia sesión correctamente con la nueva contraseña');

    // Restaurar contraseña original 'admin123' para consistencia del sistema
    const restorePass = await request(
      '/api/auth/cambiar-password',
      'POST',
      {
        password_actual: 'newPassword2026',
        nueva_password: 'admin123',
        confirmar_password: 'admin123',
      },
      newLoginRes.body.token
    );
    assert(restorePass.status === 200, 'Contraseña restaurada exitosamente a admin123');

    console.log('\n=============================================================');
    console.log(`[SUMMARY] RESULTADO: ${passedTests}/${totalTests} pruebas aprobadas exitosamente.`);
    console.log('=============================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    process.exit(1);
  } finally {
    testServer.close();
  }
});
