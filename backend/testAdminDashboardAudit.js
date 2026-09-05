const http = require('http');
const { app, server } = require('./src/server');

const testServer = server.listen(0, async () => {
  const testPort = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] PRUEBAS AUTOMATIZADAS: AUDITORÍA Y DASHBOARD ADMIN');
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
    // 1. Iniciar sesión como Administrador (1001)
    const adminLogin = await request('/api/auth/login', 'POST', {
      identifier: '1001',
      password: 'admin123',
    });
    assert(adminLogin.status === 200, 'Inicio de sesión exitoso como Administrador');
    const adminToken = adminLogin.body.token;

    // 2. Iniciar sesión como Operador (2001)
    const opLogin = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'admin123',
    });
    assert(opLogin.status === 200, 'Inicio de sesión exitoso como Operador');
    const opToken = opLogin.body.token;

    // =========================================================================
    // CASO 1: CONSULTA DE EVENTOS RECIENTES COMO ADMINISTRADOR
    // =========================================================================
    console.log('\n--- CASO 1: CONSULTA DE EVENTOS DE AUDITORÍA (ADMIN) ---');

    const auditRes = await request(
      '/api/usuarios/auditoria/eventos-recientes',
      'GET',
      null,
      adminToken
    );
    assert(auditRes.status === 200, 'GET /api/usuarios/auditoria/eventos-recientes responde 200 OK');
    assert(Array.isArray(auditRes.body.data), 'La respuesta contiene un arreglo de eventos');
    assert(auditRes.body.data.length <= 5, 'Retorna como máximo los últimos 5 eventos');

    if (auditRes.body.data.length > 0) {
      const firstEvent = auditRes.body.data[0];
      assert(firstEvent.id_historial_estado !== undefined, 'El evento contiene id_historial_estado');
      assert(firstEvent.usuario_codigo !== undefined, 'El evento contiene código del usuario afectado');
      assert(firstEvent.usuario_nombre !== undefined, 'El evento contiene nombre del usuario afectado');
      assert(firstEvent.actor_nombre !== undefined, 'El evento contiene nombre del responsable/actor');
      assert(firstEvent.motivo !== undefined, 'El evento contiene motivo');
      assert(firstEvent.fecha_cambio !== undefined, 'El evento contiene fecha_cambio');
    }

    // =========================================================================
    // CASO 2: CONTROL DE ACCESO (RBAC) EN EVENTOS DE AUDITORÍA
    // =========================================================================
    console.log('\n--- CASO 2: CONTROL DE ACCESO RBAC EN EVENTOS ---');

    // Intento con rol Operador -> Debe rechazar con 403
    const opAuditRes = await request(
      '/api/usuarios/auditoria/eventos-recientes',
      'GET',
      null,
      opToken
    );
    assert(opAuditRes.status === 403, 'Rol OPERADOR es rechazado con 403 Forbidden');

    // Intento sin token -> Debe rechazar con 401
    const anonAuditRes = await request(
      '/api/usuarios/auditoria/eventos-recientes',
      'GET',
      null,
      null
    );
    assert(anonAuditRes.status === 401, 'Petición sin token es rechazada con 401 Unauthorized');

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
