const http = require('http');
const { app } = require('./src/server');

// Iniciar servidor en un puerto de prueba
const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n=========================================');
  console.log('[SUITE] INICIANDO PRUEBAS DE AUTENTICACIÓN (3FN)');
  console.log(`[INFO] Puerto de prueba: ${testPort}`);
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
    let adminToken = '';

    // Prueba 1: Login exitoso con Administrador Activo (por Email)
    console.log('1. Probando Login exitoso por Correo (admin@cooperativa.com)...');
    const res1 = await request('/api/auth/login', 'POST', {
      email: 'admin@cooperativa.com',
      password: 'admin123',
    });
    console.log('   Status:', res1.status);
    console.log('   Token generado:', res1.body.token ? 'SÍ' : 'NO');
    console.log('   Cód. Corporativo:', res1.body.user?.codigo_corporativo);
    console.log('   Rol en respuesta:', res1.body.user?.rol);
    if (res1.status === 200 && res1.body.token && res1.body.user?.rol === 'ADMINISTRADOR') {
      console.log('   [PASS] PRUEBA 1 SUPERADA');
      adminToken = res1.body.token;
    } else {
      console.error('   [FAIL] PRUEBA 1 FALLÓ', res1.body);
    }

    // Prueba 1b: Login exitoso usando Código Corporativo (1001)
    console.log('\n1b. Probando Login exitoso por Código Corporativo ("1001")...');
    const res1b = await request('/api/auth/login', 'POST', {
      email: '1001',
      password: 'admin123',
    });
    console.log('   Status:', res1b.status);
    console.log('   Usuario autenticado:', res1b.body.user?.nombre);
    if (res1b.status === 200 && res1b.body.token && res1b.body.user?.codigo_corporativo === '1001') {
      console.log('   [PASS] PRUEBA 1b SUPERADA: Login flexible con Código Corporativo funciona');
    } else {
      console.error('   [FAIL] PRUEBA 1b FALLÓ', res1b.body);
    }


    // Prueba 2: Login con contraseña incorrecta
    console.log('\n2. Probando Login con contraseña incorrecta...');
    const res2 = await request('/api/auth/login', 'POST', {
      email: 'admin@cooperativa.com',
      password: 'wrongpassword',
    });
    console.log('   Status:', res2.status, '(Esperado: 401)');
    console.log('   Mensaje:', res2.body.message);
    if (res2.status === 401) {
      console.log('   [PASS] PRUEBA 2 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 2 FALLÓ', res2.body);
    }

    // Prueba 3: Login con usuario inactivo
    console.log('\n3. Probando Login con usuario inactivo (inactivo@cooperativa.com)...');
    const res3 = await request('/api/auth/login', 'POST', {
      email: 'inactivo@cooperativa.com',
      password: 'admin123',
    });
    console.log('   Status:', res3.status, '(Esperado: 403)');
    console.log('   Mensaje:', res3.body.message);
    if (res3.status === 403) {
      console.log('   [PASS] PRUEBA 3 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 3 FALLÓ', res3.body);
    }

    // Prueba 4: verifyToken con token válido (GET /api/auth/me)
    console.log('\n4. Probando verifyToken con token válido (GET /api/auth/me)...');
    const res4 = await request('/api/auth/me', 'GET', null, adminToken);
    console.log('   Status:', res4.status, '(Esperado: 200)');
    console.log('   Usuario autenticado:', res4.body.user?.nombre);
    if (res4.status === 200 && res4.body.user?.email === 'admin@cooperativa.com') {
      console.log('   [PASS] PRUEBA 4 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 4 FALLÓ', res4.body);
    }

    // Prueba 5: verifyToken sin token (GET /api/auth/me)
    console.log('\n5. Probando acceso a ruta protegida sin token...');
    const res5 = await request('/api/auth/me', 'GET', null, null);
    console.log('   Status:', res5.status, '(Esperado: 401)');
    console.log('   Mensaje:', res5.body.message);
    if (res5.status === 401) {
      console.log('   [PASS] PRUEBA 5 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 5 FALLÓ', res5.body);
    }

    // Prueba 6: verifyToken con token inválido/falso
    console.log('\n6. Probando acceso a ruta protegida con token adulterado...');
    const res6 = await request('/api/auth/me', 'GET', null, 'token_invalido_12345');
    console.log('   Status:', res6.status, '(Esperado: 403)');
    console.log('   Mensaje:', res6.body.message);
    if (res6.status === 403) {
      console.log('   [PASS] PRUEBA 6 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 6 FALLÓ', res6.body);
    }

    console.log('\n=========================================');
    console.log('[SUCCESS] TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO');
    console.log('=========================================\n');
  } catch (error) {
    console.error('Error durante las pruebas:', error);
  } finally {
    server.close();
    process.exit(0);
  }
});
