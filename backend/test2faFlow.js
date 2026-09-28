/**
 * @file test2faFlow.js
 * @description Verificación automatizada del ciclo de vida de Doble Factor de Autenticación (2FA / TOTP)
 */

const speakeasy = require('speakeasy');
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

async function test2FA() {
  console.log('\n===============================================================');
  console.log(' [SUITE] VERIFICACIÓN DE DOBLE FACTOR DE AUTENTICACIÓN (2FA / TOTP)');
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
    // 1. Iniciar sesión con OP-2 (Operador)
    const loginRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: 'OP-2', password: 'admin123' });

    assert(loginRes.status === 200 && loginRes.data?.token, 'Login inicial exitoso de OP-2');
    const token = loginRes.data.token;

    // 2. Consultar estado actual de 2FA
    const statusRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/2fa/status',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    assert(statusRes.status === 200, 'GET /api/auth/2fa/status responde 200');
    assert(statusRes.data?.mfa_enabled === false, 'MFA inicialmente inactivo');

    // 3. Iniciar Setup de 2FA
    const setupRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/2fa/setup',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    assert(setupRes.status === 200, 'POST /api/auth/2fa/setup responde 200');
    assert(setupRes.data?.qr_code_url && setupRes.data?.secret, 'Retorna QR DataURL y Secreto Base32');

    const secret = setupRes.data.secret;

    // 4. Intentar habilitar con código incorrecto -> 400
    const badCodeRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/2fa/enable',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }, { secret: secret, totp_code: '000000' });
    assert(badCodeRes.status === 400, 'Código TOTP incorrecto rechazado con status 400');

    // 5. Generar código TOTP válido y habilitar 2FA
    const validTotp = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
    });
    const enableRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/2fa/enable',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }, { secret: secret, totp_code: validTotp });
    assert(enableRes.status === 200 && enableRes.data?.success === true, '2FA habilitado exitosamente con código válido');

    // 6. Probar Login con 2FA activo -> debe solicitar segundo factor
    const mfaPromptLogin = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { identifier: 'OP-2', password: 'admin123' });
    assert(mfaPromptLogin.status === 200 && mfaPromptLogin.data?.mfa_required === true, 'Login detecta 2FA activo y solicita segundo factor (mfa_required: true)');
    assert(!!mfaPromptLogin.data?.temp_token, 'Retorna temp_token para validación de segundo paso');

    // 7. Completar login con código 2FA
    const validTotpLogin = speakeasy.totp({
      secret: secret,
      encoding: 'base32',
    });
    const verify2FARes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/verify-2fa',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { temp_token: mfaPromptLogin.data.temp_token, totp_code: validTotpLogin });
    if (!verify2FARes.data?.token) {
      console.log('verify2FARes debug:', verify2FARes.status, verify2FARes.data);
    }
    assert(verify2FARes.status === 200 && verify2FARes.data?.token, 'Login con 2FA completado exitosamente y JWT corporativo emitido');

    // 8. Desactivar 2FA para restaurar el estado limpio del usuario con contraseña
    const freshToken = verify2FARes.data?.token;
    const disableRes = await httpRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/2fa/disable',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${freshToken}`,
        'Content-Type': 'application/json',
      },
    }, { password: 'admin123' });
    if (!disableRes.data?.success) {
      console.log('disableRes debug:', disableRes.status, disableRes.data);
    }
    assert(disableRes.status === 200 && disableRes.data?.success === true, '2FA desactivado exitosamente con contraseña y estado limpio restaurado');

    console.log('\n===============================================================');
    console.log(` [RESULTADOS] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    if (passed === total) {
      console.log(' [SUCCESS] FLUJO COMPLETO DE DOBLE FACTOR (2FA/TOTP) VERIFICADO');
    }
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Error durante test 2FA:', err);
    process.exit(1);
  }
}

test2FA();
