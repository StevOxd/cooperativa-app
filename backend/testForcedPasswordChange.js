/**
 * @file testForcedPasswordChange.js
 * @description Prueba automatizada del flujo de cambio obligatorio de contraseña en primer inicio de sesión
 */

const http = require('http');

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: null, rawBody: body });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function testForcedPasswordChange() {
  console.log('\n===============================================================');
  console.log(' [SUITE] VERIFICACIÓN DE CAMBIO OBLIGATORIO DE CONTRASEÑA');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;
  const assert = (cond, msg) => {
    total++;
    if (cond) {
      passed++;
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
    }
  };

  try {
    // 1. Iniciar sesión como Administrador (AD-1)
    const adminLogin = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: 'AD-1', password: 'admin123' });

    assert(adminLogin.status === 200 && adminLogin.data?.token, 'Login del Administrador (AD-1) exitoso');
    const adminToken = adminLogin.data.token;

    // 2. Crear un nuevo usuario Operador con una contraseña temporal indicada por la prueba.
    //    La API no devuelve la contraseña temporal (solo viaja por correo), así que la prueba la fija.
    const userTimestamp = Date.now().toString().slice(-4);
    const tempPassword = `Temporal${userTimestamp}A1`;
    const createRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/usuarios',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
    }, {
      primer_nombre: 'Prueba',
      primer_apellido: 'Forzado',
      email: `test.forzado.${userTimestamp}@cooperativa.com`,
      rol: 'OPERADOR',
      cui_dpi: `9999${userTimestamp}00101`, // 13 dígitos
      fecha_nacimiento: '1995-01-01',
      password: tempPassword,
    });

    assert(createRes.status === 201 && createRes.data?.success, 'Operador creado exitosamente por Admin');
    const newUser = createRes.data?.data;
    assert(newUser?.debe_cambiar_password === true, 'El nuevo usuario tiene debe_cambiar_password = TRUE en BD');
    const respuestaTexto = JSON.stringify(createRes.data);
    assert(!respuestaTexto.includes(tempPassword) && !('password_generada' in (createRes.data || {})) && !newUser?.mfa?.secret,
      'La respuesta no incluye la contraseña temporal ni el secreto 2FA');

    // 3. Iniciar sesión con el nuevo usuario usando su contraseña temporal
    const newUserLogin = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: newUser.codigo_corporativo, password: tempPassword });

    assert(newUserLogin.status === 200, 'Login inicial con contraseña temporal retorna 200');
    assert(newUserLogin.data?.user?.debe_cambiar_password === true, 'Payload de login indica debe_cambiar_password: true');
    const userToken = newUserLogin.data?.token;

    // 4. Intentar acceder a un endpoint operativo (ej: GET /api/operador/afiliaciones)
    const blockedRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/operador/afiliaciones',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`,
      },
    });

    assert(blockedRes.status === 403, 'Acceso a rutas operativas bloqueado con HTTP 403');
    assert(blockedRes.data?.error === 'CAMBIO_PASSWORD_OBLIGATORIO', 'Error retornado es CAMBIO_PASSWORD_OBLIGATORIO');

    // 5. El usuario cambia su contraseña usando POST /api/auth/cambiar-password
    const newPersonalPass = 'NuevaPassSegura2026!'; // la política exige letras, números y un símbolo
    const changeRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/cambiar-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
    }, {
      password_actual: tempPassword,
      nueva_password: newPersonalPass,
      confirmar_password: newPersonalPass,
    });

    assert(changeRes.status === 200 && changeRes.data?.success, 'Cambio de contraseña exitoso (HTTP 200)');
    assert(changeRes.data?.debe_cambiar_password === false, 'Respuesta confirma debe_cambiar_password: false');

    // 6. Ahora el endpoint operativo /api/operador/afiliaciones ya no es bloqueado con CAMBIO_PASSWORD_OBLIGATORIO
    const allowedRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/operador/afiliaciones',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`,
      },
    });

    assert(allowedRes.status === 200 && allowedRes.data?.success, 'Rutas operativas desbloqueadas tras cambio de contraseña (HTTP 200)');

    // 7. Próximo login con la nueva contraseña personal
    const nextLogin = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: newUser.codigo_corporativo, password: newPersonalPass });

    assert(nextLogin.status === 200, 'Login con nueva contraseña personal exitoso');
    assert(nextLogin.data?.user?.debe_cambiar_password === false, 'debe_cambiar_password permanece en FALSE');

    console.log('\n===============================================================');
    console.log(` [RESULTADOS] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    if (passed === total) {
      console.log(' [SUCCESS] CICLO DE CAMBIO OBLIGATORIO DE CONTRASEÑA VERIFICADO');
    } else {
      console.log(' [FALLO] Hay pruebas que no pasaron.');
      process.exitCode = 1;
    }
    console.log('===============================================================\n');

  } catch (error) {
    console.error('Error durante testForcedPasswordChange:', error);
    process.exitCode = 1;
  }
}

testForcedPasswordChange();
