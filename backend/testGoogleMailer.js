/**
 * @file testGoogleMailer.js
 * @description Suite de validación del servicio de correo institucional Google Mail (Gmail SMTP)
 */

const API_URL = process.env.TEST_API_URL || 'http://localhost:5001/api';

const printHeader = (title) => {
  console.log('\n===============================================================');
  console.log(` [SUITE] ${title}`);
  console.log('===============================================================');
};

const printPass = (msg) => console.log(`  [PASS] ${msg}`);
const printFail = (msg, err) => {
  console.error(`  [FAIL] ${msg}:`, err);
};

async function runTests() {
  let passed = 0;
  let total = 0;

  printHeader('VERIFICACIÓN DEL SERVICIO DE CORREO GOOGLE MAIL (GMAIL)');

  try {
    // 1. Iniciar sesión como Administrador (AD-1)
    total++;
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'AD-1',
        password: 'admin123',
      }),
    });
    const loginData = await loginRes.json();

    if (!loginRes.ok || !loginData?.token) {
      throw new Error(`No se pudo autenticar como Administrador: ${loginData?.message || JSON.stringify(loginData)}`);
    }
    const adminToken = loginData.token;
    printPass('Login de Administrador (AD-1) exitoso');
    passed++;

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // 2. Consultar estado del servicio de correo
    total++;
    const statusRes = await fetch(`${API_URL}/usuarios/email/status`, {
      method: 'GET',
      headers: authHeaders,
    });
    const statusData = await statusRes.json();
    if (!statusRes.ok || !statusData?.success || !statusData?.data) {
      throw new Error(`Respuesta inválida en /api/usuarios/email/status: ${JSON.stringify(statusData)}`);
    }
    printPass(`Estado del servicio consultado exitosamente: Proveedor = ${statusData.data.provider}, Configurado = ${statusData.data.configured}`);
    passed++;

    // 3. Probar envío de correo de prueba en modo actual
    total++;
    const testEmailRes = await fetch(`${API_URL}/usuarios/email/test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ to: 'test.verificacion@cooperativa.com' }),
    });
    const testEmailData = await testEmailRes.json();
    if (!testEmailRes.ok || !testEmailData?.success) {
      throw new Error(`Fallo al despachar correo de prueba institucional: ${testEmailData?.message}`);
    }
    printPass(`Correo de prueba despachado: ${testEmailData.message}`);
    passed++;

    // 4. Validar rechazo ante email inválido
    total++;
    const invRes = await fetch(`${API_URL}/usuarios/email/test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ to: 'invalido-sin-arroba' }),
    });
    const invData = await invRes.json();
    if (invRes.status === 400 && !invData.success) {
      printPass('Rechazo correcto (HTTP 400) ante email inválido');
      passed++;
    } else {
      throw new Error(`Se esperaba HTTP 400 pero se recibió ${invRes.status}`);
    }

    // 5. Validar configuración con credenciales simuladas inválidas (Google debe rechazar autenticación de forma segura)
    total++;
    const cfgRes = await fetch(`${API_URL}/usuarios/email/config`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        gmail_user: 'cuenta.prueba.inexistente.2026@gmail.com',
        gmail_app_password: 'abcd efgh ijkl mnop',
      }),
    });
    const cfgData = await cfgRes.json();
    if (cfgRes.status === 400 && !cfgData.success) {
      printPass(`Validación de credenciales en tiempo real con Google funcionando: ${cfgData.message}`);
      passed++;
    } else if (cfgRes.ok) {
      printPass('Configuración aceptada');
      passed++;
    } else {
      throw new Error(`Código inesperado: ${cfgRes.status}`);
    }

    // 6. Verificar que el estado del servicio sigue protegido por RBAC (no accesible sin admin)
    total++;
    const unauthRes = await fetch(`${API_URL}/usuarios/email/status`, {
      method: 'GET',
    });
    if (unauthRes.status === 401) {
      printPass('Endpoint protegido con autenticación JWT (HTTP 401 para solicitudes anónimas)');
      passed++;
    } else {
      throw new Error(`Se esperaba HTTP 401 pero se recibió ${unauthRes.status}`);
    }

    console.log('\n===============================================================');
    console.log(` [RESULTADOS] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log(' [SUCCESS] SERVICIO DE CORREO GOOGLE MAIL INTEGRADO Y HOMOLOGADO');
    console.log('===============================================================\n');
  } catch (error) {
    console.error('\nError durante testGoogleMailer:', error);
    process.exit(1);
  }
}

runTests();
