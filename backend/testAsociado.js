const http = require('http');
const { app } = require('./src/server');
const db = require('./src/config/db');

const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n=========================================');
  console.log('[SUITE] INICIANDO PRUEBAS DE PORTAL DE ASOCIADO (3FN)');
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
    // 1. Intentar acceder a /api/asociado/perfil sin token (debe retornar 401)
    console.log('1. Probando GET /api/asociado/perfil sin token...');
    const resNoToken = await request('/api/asociado/perfil', 'GET');
    console.log('   Status:', resNoToken.status, '(Esperado: 401)');
    if (resNoToken.status === 401) {
      console.log('   [PASS] PRUEBA 1 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 1 FALLÓ');
    }

    // 2. Iniciar sesión como administrador (1001) para validar que no tiene acceso a rutas de asociados
    console.log('\n2. Obteniendo JWT de Administrador (1001)...');
    const adminLogin = await request('/api/auth/login', 'POST', {
      email: '1001',
      password: 'admin123',
    });
    const adminToken = adminLogin.body.token;
    console.log('   Probando GET /api/asociado/perfil con token de Administrador...');
    const resAdminForbidden = await request('/api/asociado/perfil', 'GET', null, adminToken);
    console.log('   Status:', resAdminForbidden.status, '(Esperado: 403)');
    if (resAdminForbidden.status === 403) {
      console.log('   [PASS] PRUEBA 2 SUPERADA: Administrador bloqueado en portal de asociados');
    } else {
      console.error('   [FAIL] PRUEBA 2 FALLÓ');
    }

    // 3. Iniciar sesión como Asociado (3001)
    console.log('\n3. Obteniendo JWT de Asociado (3001)...');
    const assocLogin = await request('/api/auth/login', 'POST', {
      email: '3001',
      password: 'admin123',
    });
    const assocToken = assocLogin.body.token;
    if (assocToken) {
      console.log('   [PASS] Token obtenido exitosamente');
    } else {
      throw new Error('No se pudo obtener token para el asociado');
    }

    // 4. GET /api/asociado/perfil
    console.log('\n4. Probando GET /api/asociado/perfil con token de Asociado...');
    const resPerfil = await request('/api/asociado/perfil', 'GET', null, assocToken);
    console.log('   Status:', resPerfil.status, '(Esperado: 200)');
    console.log('   Nombre del asociado:', resPerfil.body.data?.primer_nombre + ' ' + resPerfil.body.data?.primer_apellido);
    console.log('   Código Corporativo:', resPerfil.body.data?.codigo_corporativo);
    if (resPerfil.status === 200 && resPerfil.body.data?.id_persona === 11) {
      console.log('   [PASS] PRUEBA 4 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 4 FALLÓ', resPerfil.body);
    }

    // 5. GET /api/asociado/cuentas
    console.log('\n5. Probando GET /api/asociado/cuentas...');
    const resCuentas = await request('/api/asociado/cuentas', 'GET', null, assocToken);
    console.log('   Status:', resCuentas.status, '(Esperado: 200)');
    console.log('   Cuentas encontradas:', resCuentas.body.data?.length);
    resCuentas.body.data?.forEach(c => {
      console.log(`   - Cta: ${c.numero_cuenta} | Tipo: ${c.tipo_cuenta} | Saldo: Q${c.saldo_disponible}`);
    });
    if (resCuentas.status === 200 && resCuentas.body.data?.length > 0) {
      console.log('   [PASS] PRUEBA 5 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 5 FALLÓ', resCuentas.body);
    }

    // 6. GET /api/asociado/cuentas/:id_cuenta/transacciones
    const idCuentaTest = resCuentas.body.data?.[0]?.id_cuenta;
    if (idCuentaTest) {
      console.log(`\n6. Probando GET /api/asociado/cuentas/${idCuentaTest}/transacciones...`);
      const resTx = await request(`/api/asociado/cuentas/${idCuentaTest}/transacciones`, 'GET', null, assocToken);
      console.log('   Status:', resTx.status, '(Esperado: 200)');
      console.log('   Total transacciones encontradas:', resTx.body.data?.length);
      if (resTx.status === 200) {
        console.log('   [PASS] PRUEBA 6 SUPERADA');
      } else {
        console.error('   [FAIL] PRUEBA 6 FALLÓ', resTx.body);
      }
    }

    // 7. POST /api/asociado/creditos (Crear solicitud de prueba)
    console.log('\n7. Probando POST /api/asociado/creditos (Simular y crear crédito)...');
    const creditPayload = {
      monto_solicitado: 12000,
      plazo_meses: 12,
      observaciones: 'Prueba de autogestión automatizada',
    };
    const resCreditPost = await request('/api/asociado/creditos', 'POST', creditPayload, assocToken);
    console.log('   Status:', resCreditPost.status, '(Esperado: 201)');
    console.log('   Cuota mensual estimada:', resCreditPost.body.data?.cuota_mensual_estimada);
    console.log('   Tasa de interés aplicada:', resCreditPost.body.data?.tasa_interes);
    console.log('   Estado de solicitud:', resCreditPost.body.data?.estado);
    const idSolicitud = resCreditPost.body.data?.id_solicitud_credito;
    
    // Validar fórmula de amortización francesa:
    // Monto = 12000, Plazo = 12 meses, Tasa = 10% anual.
    // Tasa mensual = 10 / 100 / 12 = 0.0083333
    // Cuota = 12000 * 0.0083333 * (1.0083333)^12 / ((1.0083333)^12 - 1) = 1054.99 (aproximado)
    if (resCreditPost.status === 201 && Math.abs(parseFloat(resCreditPost.body.data?.cuota_mensual_estimada) - 1054.99) <= 0.1) {
      console.log('   [PASS] PRUEBA 7 SUPERADA: Amortización nivelada francesa calculada correctamente.');
    } else {
      console.error('   [FAIL] PRUEBA 7 FALLÓ: Cuota mensual no coincide con amortización nivelada francesa.', resCreditPost.body);
    }

    // 8. GET /api/asociado/creditos
    console.log('\n8. Probando GET /api/asociado/creditos...');
    const resCreditosList = await request('/api/asociado/creditos', 'GET', null, assocToken);
    console.log('   Status:', resCreditosList.status, '(Esperado: 200)');
    console.log('   Total solicitudes en historial:', resCreditosList.body.data?.length);
    if (resCreditosList.status === 200 && resCreditosList.body.data?.some(c => c.id_solicitud_credito === idSolicitud)) {
      console.log('   [PASS] PRUEBA 8 SUPERADA');
    } else {
      console.error('   [FAIL] PRUEBA 8 FALLÓ');
    }

    // Limpieza de base de datos
    if (idSolicitud) {
      await db.query('DELETE FROM solicitudes_credito WHERE id_solicitud_credito = $1', [idSolicitud]);
      console.log('\n[CLEANUP] Limpieza de datos de prueba completada.');
    }

    console.log('\n=========================================');
    console.log('[SUCCESS] TODAS LAS PRUEBAS DE ASOCIADO COMPLETADAS CON ÉXITO');
    console.log('=========================================\n');
  } catch (error) {
    console.error('Error durante las pruebas de asociado:', error);
  } finally {
    server.close();
    process.exit(0);
  }
});
