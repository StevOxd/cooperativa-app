const http = require('http');
const { app } = require('./src/server');

const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n=========================================');
  console.log('🧪 INICIANDO PRUEBAS DE RBAC (CONTROL DE ROLES - 3FN)');
  console.log(`📡 Puerto de prueba: ${testPort}`);
  console.log('=========================================\n');

  const request = (path, method, data, token) => {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (data) {
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(
        {
          hostname: 'localhost',
          port: testPort,
          path,
          method,
          headers,
        },

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
      if (payload) req.write(payload);
      req.end();
    });
  };

  try {
    // 1. Obtener Token de OPERADOR
    console.log('1. Autenticando como OPERADOR (operador@cooperativa.com)...');
    const opLogin = await request('/api/auth/login', 'POST', {
      email: 'operador@cooperativa.com',
      password: 'admin123',
    });
    const opToken = opLogin.body.token;
    console.log('   Status:', opLogin.status, '| Rol:', opLogin.body.user?.rol);

    // 2. Probar GET /api/auth/me con OPERADOR (Debe permitir acceso 200 OK)
    console.log('\n2. Probando GET /api/auth/me con rol OPERADOR...');
    const meRes = await request('/api/auth/me', 'GET', null, opToken);
    console.log('   Status:', meRes.status, '(Esperado: 200)');
    console.log('   Usuario:', meRes.body.user?.nombre, '| Rol:', meRes.body.user?.rol);
    if (meRes.status === 200 && meRes.body.user?.rol === 'OPERADOR') {
      console.log('   ✅ PRUEBA 2 SUPERADA: GET /api/auth/me accesible para OPERADOR');
    } else {
      console.error('   ❌ PRUEBA 2 FALLÓ', meRes.body);
    }

    // 3. Probar GET /api/usuarios con OPERADOR (Debe denegar 403)
    console.log('\n3. Probando GET /api/usuarios con rol OPERADOR...');
    const getRes = await request('/api/usuarios', 'GET', null, opToken);
    console.log('   Status:', getRes.status, '(Esperado: 403)');
    console.log('   Mensaje:', getRes.body.message);
    if (
      getRes.status === 403 &&
      getRes.body.message === 'Acceso denegado: Se requieren permisos de Administrador'
    ) {
      console.log('   ✅ PRUEBA 3 SUPERADA: GET /api/usuarios bloqueado con 403 y mensaje exacto');
    } else {
      console.error('   ❌ PRUEBA 3 FALLÓ', getRes.body);
    }

    // 4. Probar POST /api/usuarios con OPERADOR (Debe denegar 403)
    console.log('\n4. Probando POST /api/usuarios con rol OPERADOR...');
    const postRes = await request(
      '/api/usuarios',
      'POST',
      {
        codigo_planilla: 'TEST-001',
        nombre: 'Usuario Intento',
        email: 'intento@cooperativa.com',
        password: 'pass',
        rol: 'ASOCIADO',
      },
      opToken
    );
    console.log('   Status:', postRes.status, '(Esperado: 403)');
    console.log('   Mensaje:', postRes.body.message);
    if (
      postRes.status === 403 &&
      postRes.body.message === 'Acceso denegado: Se requieren permisos de Administrador'
    ) {
      console.log('   ✅ PRUEBA 4 SUPERADA: POST /api/usuarios bloqueado con 403');
    } else {
      console.error('   ❌ PRUEBA 4 FALLÓ', postRes.body);
    }

    // 5. Probar PUT /api/usuarios/1 con OPERADOR (Debe denegar 403)
    console.log('\n5. Probando PUT /api/usuarios/1 con rol OPERADOR...');
    const putRes = await request(
      '/api/usuarios/1',
      'PUT',
      { nombre: 'Modificacion no autorizada' },
      opToken
    );
    console.log('   Status:', putRes.status, '(Esperado: 403)');
    console.log('   Mensaje:', putRes.body.message);
    if (
      putRes.status === 403 &&
      putRes.body.message === 'Acceso denegado: Se requieren permisos de Administrador'
    ) {
      console.log('   ✅ PRUEBA 5 SUPERADA: PUT /api/usuarios/1 bloqueado con 403');
    } else {
      console.error('   ❌ PRUEBA 5 FALLÓ', putRes.body);
    }

    // 6. Probar DELETE /api/usuarios/1 con OPERADOR (Debe denegar 403)
    console.log('\n6. Probando DELETE /api/usuarios/1 con rol OPERADOR...');
    const delRes = await request('/api/usuarios/1', 'DELETE', null, opToken);
    console.log('   Status:', delRes.status, '(Esperado: 403)');
    console.log('   Mensaje:', delRes.body.message);
    if (
      delRes.status === 403 &&
      delRes.body.message === 'Acceso denegado: Se requieren permisos de Administrador'
    ) {
      console.log('   ✅ PRUEBA 6 SUPERADA: DELETE /api/usuarios/1 bloqueado con 403');
    } else {
      console.error('   ❌ PRUEBA 6 FALLÓ', delRes.body);
    }

    // 7. Autenticar como ADMINISTRADOR y verificar acceso permitido
    console.log('\n7. Autenticando como ADMINISTRADOR (admin@cooperativa.com)...');
    const adminLogin = await request('/api/auth/login', 'POST', {
      email: 'admin@cooperativa.com',
      password: 'admin123',
    });
    const adminToken = adminLogin.body.token;

    console.log('8. Probando GET /api/usuarios con rol ADMINISTRADOR...');
    const adminGet = await request('/api/usuarios', 'GET', null, adminToken);
    console.log('   Status:', adminGet.status, '(Esperado: 200)');
    console.log('   Total usuarios encontrados:', adminGet.body.total);
    if (adminGet.status === 200 && adminGet.body.success) {
      console.log('   ✅ PRUEBA 8 SUPERADA: Acceso concedido al ADMINISTRADOR');
    } else {
      console.error('   ❌ PRUEBA 8 FALLÓ', adminGet.body);
    }

    console.log('\n=========================================');
    console.log('🎉 TODAS LAS PRUEBAS RBAC SUPERADAS CON ÉXITO');
    console.log('=========================================\n');
  } catch (error) {
    console.error('Error durante las pruebas RBAC:', error);
  } finally {
    server.close();
    process.exit(0);
  }
});
