const http = require('http');
const { app, server, io } = require('./src/server');
const socketService = require('./src/services/socketService');
const { io: Client } = require('socket.io-client');
const db = require('./src/config/db');

// Iniciar servidor en puerto efímero para pruebas
const testServer = server.listen(0, async () => {
  const testPort = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] PRUEBAS AUTOMATIZADAS: PROTOCOLOS DE SEGURIDAD Y SESIÓN');
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
    // 0. Preparar usuario de prueba: Operador 2001 (operador@cooperativa.com)
    // Desbloquearlo y limpiar sesiones previas antes del test
    await db.query(`
      UPDATE usuarios 
      SET intentos_fallidos = 0, bloqueado_hasta = NULL, sesion_activa_id = NULL 
      WHERE codigo_corporativo = '2001'
    `);

    // =========================================================================
    // CASO 1: BLOQUEO POR FUERZA BRUTA (3 INTENTOS FALLIDOS)
    // =========================================================================
    console.log('\n--- CASO 1: BLOQUEO POR FUERZA BRUTA (3 INTENTOS) ---');

    // Intento 1: Contraseña incorrecta
    const r1 = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'wrong_password_1',
    });
    assert(r1.status === 401, 'Intento 1 incorrecto retorna status 401');
    assert(r1.body.intentos_restantes === 2, 'Informa que quedan 2 intentos restantes');

    // Intento 2: Contraseña incorrecta
    const r2 = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'wrong_password_2',
    });
    assert(r2.status === 401, 'Intento 2 incorrecto retorna status 401');
    assert(r2.body.intentos_restantes === 1, 'Informa que queda 1 intento restante');

    // Intento 3: Contraseña incorrecta -> Debe disparar bloqueo por 15 minutos
    const r3 = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'wrong_password_3',
    });
    assert(r3.status === 423, 'Intento 3 bloquea la cuenta y retorna status 423');
    assert(r3.body.bloqueado === true, 'Respuesta incluye flag bloqueado: true');

    // Intento 4: Con contraseña correcta pero la cuenta está bloqueada
    const r4 = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'admin123', // Contraseña real
    });
    assert(r4.status === 423, 'Intento subsiguiente con contraseña correcta sigue bloqueado');
    assert(
      r4.body.message.includes('bloqueada'),
      'Mensaje claro de cuenta temporalmente bloqueada por seguridad'
    );

    // Verificar registro en tabla de auditoría historial_estados_usuario
    const auditCheck = await db.query(`
      SELECT estado_nuevo, motivo FROM historial_estados_usuario 
      WHERE motivo LIKE '%fuerza bruta%' 
      ORDER BY id_historial_estado DESC LIMIT 1
    `);
    assert(auditCheck.rows.length > 0, 'Se registró el evento en historial_estados_usuario');

    // =========================================================================
    // CASO 2: DESBLOQUEO ADMINISTRATIVO EN 1 CLIC
    // =========================================================================
    console.log('\n--- CASO 2: DESBLOQUEO ADMINISTRATIVO EN 1 CLIC ---');

    // Iniciar sesión como Administrador (1001 / Admin123!)
    const adminLogin = await request('/api/auth/login', 'POST', {
      identifier: '1001',
      password: 'admin123',
    });
    assert(adminLogin.status === 200, 'Inicio de sesión de Administrador exitoso');
    const adminToken = adminLogin.body.token;

    // Obtener id_persona del usuario 2001
    const userRes = await db.query("SELECT id_persona FROM usuarios WHERE codigo_corporativo = '2001'");
    const userPersonaId = userRes.rows[0].id_persona;

    // Ejecutar endpoint de desbloqueo
    const desbloqueoRes = await request(
      `/api/usuarios/${userPersonaId}/desbloquear`,
      'PATCH',
      null,
      adminToken
    );
    assert(desbloqueoRes.status === 200, 'Admin desbloquea usuario con PATCH /:id/desbloquear');

    // Intentar login con usuario 2001 tras desbloqueo -> Debe ser exitoso
    const r5 = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'admin123',
    });
    assert(r5.status === 200, 'Usuario 2001 inicia sesión exitosamente tras ser desbloqueado');
    const userToken = r5.body.token;

    // =========================================================================
    // CASO 3: SESIÓN ÚNICA CONCURRENTE Y ALERTA EN TIEMPO REAL
    // =========================================================================
    console.log('\n--- CASO 3: SESIÓN ÚNICA CONCURRENTE Y ALERTA EN TIEMPO REAL ---');

    // Simular que el navegador del Usuario 2001 se conecta por WebSocket
    const clientSocket = Client(`http://localhost:${testPort}`, {
      auth: { token: userToken },
      transports: ['websocket'],
    });

    let alertaRecibida = null;
    clientSocket.on('security_alert', (alerta) => {
      alertaRecibida = alerta;
    });

    // Esperar conexión del socket
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
    assert(clientSocket.connected, 'Cliente 1 conectado activamente por WebSocket');

    // Intentar iniciar sesión desde otro navegador con las mismas credenciales
    const concurrentLogin = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'admin123',
    });

    assert(concurrentLogin.status === 409, 'Segundo navegador recibe status 409 (Conflicto)');
    assert(
      concurrentLogin.body.message.includes('ya cuenta con una sesión activa'),
      'Mensaje de rechazo por sesión concurrente en otro dispositivo'
    );

    // Dar tiempo para la propagación del evento WebSocket
    await new Promise((r) => setTimeout(r, 200));

    assert(alertaRecibida !== null, 'Navegador 1 recibió la alerta de seguridad en tiempo real');
    assert(
      alertaRecibida?.message?.includes('intento de inicio de sesión'),
      'Contenido de la alerta notifica intento de acceso no autorizado'
    );

    // =========================================================================
    // CASO 4: CIERRE DE SESIÓN FORMAL (LOGOUT)
    // =========================================================================
    console.log('\n--- CASO 4: CIERRE DE SESIÓN FORMAL (LOGOUT) ---');

    const logoutRes = await request('/api/auth/logout', 'POST', null, userToken);
    assert(logoutRes.status === 200, 'Endpoint POST /api/auth/logout responde 200 OK');

    // Desconectar socket del cliente
    clientSocket.disconnect();

    const dbSessionCheck = await db.query(
      "SELECT sesion_activa_id, ultimo_ping FROM usuarios WHERE codigo_corporativo = '2001'"
    );
    assert(
      dbSessionCheck.rows[0].sesion_activa_id === null,
      'sesion_activa_id quedó limpio (NULL) en la base de datos'
    );
    assert(
      dbSessionCheck.rows[0].ultimo_ping === null,
      'ultimo_ping quedó limpio (NULL) en la base de datos para evitar lag de presencia'
    );

    // Verificar inmediatamente que en GET /api/usuarios reporte en_linea = false sin esperar 2 minutos
    const usersListImmediate = await request('/api/usuarios', 'GET', null, adminToken);
    const u2001LoggedOut = usersListImmediate.body.data.find((u) => u.codigo_corporativo === '2001');
    assert(
      u2001LoggedOut.en_linea === false,
      'Usuario aparece en_linea: false inmediatamente tras logout (sin retraso de 2 minutos)'
    );

    // Ahora un nuevo navegador sí puede iniciar sesión
    const nuevoLogin = await request('/api/auth/login', 'POST', {
      identifier: '2001',
      password: 'admin123',
    });
    assert(nuevoLogin.status === 200, 'Tras logout formal, el nuevo dispositivo puede ingresar');

    // =========================================================================
    // CASO 5: GESTIÓN DE USUARIOS CON PRESENCIA EN TIEMPO REAL
    // =========================================================================
    console.log('\n--- CASO 5: GESTIÓN DE USUARIOS Y PRESENCIA EN TIEMPO REAL ---');

    const usersListRes = await request('/api/usuarios', 'GET', null, adminToken);
    assert(usersListRes.status === 200, 'GET /api/usuarios responde 200 OK');

    const usuario2001 = usersListRes.body.data.find((u) => u.codigo_corporativo === '2001');
    assert(usuario2001 !== undefined, 'Usuario 2001 se encuentra en el listado');
    assert(typeof usuario2001.en_linea === 'boolean', 'Campo en_linea está presente y es booleano');
    assert(
      typeof usuario2001.bloqueado_por_intentos === 'boolean',
      'Campo bloqueado_por_intentos está presente y es booleano'
    );
    assert(usuario2001.estado === 'ACTIVO', 'Columna Estado permanece intacta como ACTIVO');

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
