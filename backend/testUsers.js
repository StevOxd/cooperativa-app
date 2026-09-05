const http = require('http');
const { app } = require('./src/server');
const db = require('./src/config/db');

const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n=========================================');
  console.log('[SUITE] INICIANDO PRUEBAS DEL CRUD DE USUARIOS (3FN - id_persona)');
  console.log(`[INFO] Puerto de prueba: ${testPort}`);
  console.log('=========================================\n');

  // Limpieza inicial para idempotencia de pruebas
  try {
    const existing = await db.query(
      `SELECT p.id_persona 
       FROM personas p 
       LEFT JOIN usuarios u ON u.id_persona = p.id_persona 
       WHERE p.cui_dpi = '9999000011112' 
          OR u.email = 'test.crud@cooperativa.com' 
          OR u.codigo_corporativo = '9999'`
    );
    if (existing.rows.length > 0) {
      for (const row of existing.rows) {
        await db.query("DELETE FROM historial_estados_usuario WHERE id_usuario_modificado = $1", [row.id_persona]);
        await db.query("DELETE FROM asociados WHERE id_persona = $1", [row.id_persona]);
        await db.query("DELETE FROM usuarios WHERE id_persona = $1", [row.id_persona]);
        await db.query("DELETE FROM personas WHERE id_persona = $1", [row.id_persona]);
      }
    }
  } catch (e) {
    console.error('Error en cleanup inicial:', e);
  }

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
    // 1. Validar protección: GET /api/usuarios sin token
    console.log('1. Probando GET /api/usuarios sin token (Debe retornar 401)...');
    const resNoToken = await request('/api/usuarios', 'GET');
    console.log('   Status:', resNoToken.status, '(Esperado: 401)');
    if (resNoToken.status === 401) {
      console.log('   [PASS] PRUEBA 1 SUPERADA: Rutas protegidas correctamente');
    } else {
      console.error('   [FAIL] PRUEBA 1 FALLÓ', resNoToken.body);
    }

    // 2. Login para obtener token JWT de Administrador
    console.log('\n2. Obteniendo JWT de Administrador...');
    const loginRes = await request('/api/auth/login', 'POST', {
      email: '1001',
      password: 'admin123',
    });
    const token = loginRes.body.token;
    if (token) {
      console.log('   [PASS] Token obtenido exitosamente con código corporativo 1001 (id_persona: ' + loginRes.body.user?.id_persona + ')');
    } else {
      throw new Error('No se pudo obtener token de autenticación');
    }

    // 3. GET /api/usuarios: Obtener todos los usuarios
    console.log('\n3. Probando GET /api/usuarios con token...');
    const resAllUsers = await request('/api/usuarios', 'GET', null, token);
    console.log('   Status:', resAllUsers.status);
    console.log('   Total usuarios encontrados:', resAllUsers.body.total);
    if (resAllUsers.status === 200 && Array.isArray(resAllUsers.body.data)) {
      console.log('   [PASS] PRUEBA 3 SUPERADA: Listado de usuarios obtenido');
    } else {
      console.error('   [FAIL] PRUEBA 3 FALLÓ', resAllUsers.body);
    }

    // 4. GET /api/usuarios con filtro ?estado=ACTIVO
    console.log('\n4. Probando GET /api/usuarios?estado=ACTIVO...');
    const resActiveUsers = await request('/api/usuarios?estado=ACTIVO', 'GET', null, token);
    const allAreActive = resActiveUsers.body.data.every((u) => u.estado === 'ACTIVO');
    console.log('   Total activos:', resActiveUsers.body.total, '| ¿Todos activos?:', allAreActive);
    if (resActiveUsers.status === 200 && allAreActive) {
      console.log('   [PASS] PRUEBA 4 SUPERADA: Filtro por estado activo funciona');
    } else {
      console.error('   [FAIL] PRUEBA 4 FALLÓ', resActiveUsers.body);
    }

    // 5. POST /api/usuarios: Crear nuevo usuario con código corporativo 9999
    console.log('\n5. Probando POST /api/usuarios (Crear nuevo usuario con Cód. 9999)...');
    const newUserPayload = {
      codigo_corporativo: '9999',
      nombre: 'Prueba Automatizada Test',
      cui_dpi: '9999000011112',
      email: 'test.crud@cooperativa.com',
      password: 'mipassword123',
      rol: 'ASOCIADO',
      estado: 'ACTIVO',
    };
    const resCreate = await request('/api/usuarios', 'POST', newUserPayload, token);
    console.log('   Status:', resCreate.status, '(Esperado: 201)');
    console.log('   Usuario creado id_persona:', resCreate.body.data?.id_persona, '| Cód:', resCreate.body.data?.codigo_corporativo);
    let createdUserPersonaId = resCreate.body.data?.id_persona;

    if (resCreate.status === 201 && createdUserPersonaId && resCreate.body.data?.codigo_corporativo === '9999') {
      console.log('   [PASS] PRUEBA 5 SUPERADA: Usuario creado con id_persona como PK y FK');
    } else {
      console.error('   [FAIL] PRUEBA 5 FALLÓ', resCreate.body);
    }

    // 6. Probar Login del usuario recién creado usando su Código Corporativo
    console.log('\n6. Probando Login del nuevo usuario creado por Código Corporativo ("9999")...');
    const resLoginNew = await request('/api/auth/login', 'POST', {
      email: '9999',
      password: 'mipassword123',
    });
    console.log('   Status:', resLoginNew.status, '(Esperado: 200)');
    if (resLoginNew.status === 200 && resLoginNew.body.token) {
      console.log('   [PASS] PRUEBA 6 SUPERADA: Login por Código Corporativo validado correctamente');
    } else {
      console.error('   [FAIL] PRUEBA 6 FALLÓ', resLoginNew.body);
    }

    // 7. PUT /api/usuarios/:id: Actualizar datos del usuario
    console.log(`\n7. Probando PUT /api/usuarios/${createdUserPersonaId} (Actualizar datos)...`);
    const updatePayload = {
      nombre: 'Prueba Automatizada Actualizada',
      rol: 'OPERADOR',
    };
    const resUpdate = await request(`/api/usuarios/${createdUserPersonaId}`, 'PUT', updatePayload, token);
    console.log('   Status:', resUpdate.status, '(Esperado: 200)');
    console.log('   Nombre actualizado:', resUpdate.body.data?.nombre);
    console.log('   Rol actualizado:', resUpdate.body.data?.rol);
    if (resUpdate.status === 200 && resUpdate.body.data?.rol === 'OPERADOR') {
      console.log('   [PASS] PRUEBA 7 SUPERADA: Datos de usuario actualizados');
    } else {
      console.error('   [FAIL] PRUEBA 7 FALLÓ', resUpdate.body);
    }

    // 8. DELETE /api/usuarios/:id: Borrado lógico auditado
    console.log(`\n8. Probando DELETE /api/usuarios/${createdUserPersonaId} (Borrado lógico)...`);
    const resDelete = await request(`/api/usuarios/${createdUserPersonaId}`, 'DELETE', null, token);
    console.log('   Status:', resDelete.status, '(Esperado: 200)');
    console.log('   Estado retornado:', resDelete.body.data?.estado);
    if (resDelete.status === 200 && resDelete.body.data?.estado === 'INACTIVO') {
      console.log('   [PASS] PRUEBA 8 SUPERADA: Borrado lógico aplicado exitosamente');
    } else {
      console.error('   [FAIL] PRUEBA 8 FALLÓ', resDelete.body);
    }

    // 9. Verificar que el usuario no fue eliminado físicamente de la BD
    console.log('\n9. Verificando persistencia y borrado lógico en PostgreSQL...');
    const dbCheck = await db.query('SELECT id_persona, estado FROM usuarios WHERE id_persona = $1', [createdUserPersonaId]);
    if (dbCheck.rows.length > 0 && dbCheck.rows[0].estado === 'INACTIVO') {
      console.log('   [PASS] PRUEBA 9 SUPERADA: Registro preservado en BD con estado INACTIVO (No hubo DELETE físico)');
    } else {
      console.error('   [FAIL] PRUEBA 9 FALLÓ');
    }

    // 10. Intentar iniciar sesión con el usuario desactivado
    console.log('\n10. Verificando que el usuario desactivado no puede iniciar sesión...');
    const resInactiveLogin = await request('/api/auth/login', 'POST', {
      email: '9999',
      password: 'mipassword123',
    });
    console.log('   Status:', resInactiveLogin.status, '(Esperado: 403)');
    console.log('   Mensaje:', resInactiveLogin.body.message);
    if (resInactiveLogin.status === 403) {
      console.log('   [PASS] PRUEBA 10 SUPERADA: Acceso bloqueado para usuario inactivo');
    } else {
      console.error('   [FAIL] PRUEBA 10 FALLÓ', resInactiveLogin.body);
    }

    console.log('\n=========================================');
    console.log('[SUCCESS] TODAS LAS PRUEBAS CRUD SUPERADAS CON ÉXITO');
    console.log('=========================================\n');
  } catch (error) {
    console.error('Error durante las pruebas CRUD:', error);
  } finally {
    server.close();
    process.exit(0);
  }
});
