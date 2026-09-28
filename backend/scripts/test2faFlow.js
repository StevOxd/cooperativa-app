require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const db = require('../src/config/db');
const mfaService = require('../src/services/mfaService');

async function test2fa() {
  console.log('--- TEST: CICLO COMPLETO DE DOBLE FACTOR 2FA ---');
  
  // Buscar un usuario de prueba (Steven AD-1)
  const userRes = await db.query('SELECT id_persona, codigo_corporativo, email FROM usuarios WHERE codigo_corporativo = $1', ['AD-1']);
  if (userRes.rows.length === 0) {
    console.error('AD-1 no encontrado');
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log('Usuario:', user.codigo_corporativo, user.email);

  // 1. Generar configuración
  const mfaData = await mfaService.generateMfaSecret(user.codigo_corporativo);
  console.log('Secreto generado:', mfaData.base32);
  console.log('QR code URL presente:', Boolean(mfaData.qr_code_url));

  // 2. Generar código TOTP válido
  const tokenValido = speakeasy.totp({
    secret: mfaData.base32,
    encoding: 'base32'
  });
  console.log('Token TOTP generado:', tokenValido);

  // 3. Validar con mfaService
  const isValid = mfaService.verifyTotp(mfaData.base32, tokenValido);
  console.log('Verificación mfaService:', isValid ? 'PASS' : 'FAIL');

  // 4. Activar temporalmente en BD
  await db.query('UPDATE usuarios SET mfa_enabled = true, mfa_secret = $1 WHERE id_persona = $2', [mfaData.base32, user.id_persona]);
  const checkRes = await db.query('SELECT mfa_enabled FROM usuarios WHERE id_persona = $1', [user.id_persona]);
  console.log('Estado en BD tras activación:', checkRes.rows[0].mfa_enabled);

  // 5. Revertir para dejar limpio
  await db.query('UPDATE usuarios SET mfa_enabled = false, mfa_secret = NULL WHERE id_persona = $1', [user.id_persona]);
  const finalRes = await db.query('SELECT mfa_enabled FROM usuarios WHERE id_persona = $1', [user.id_persona]);
  console.log('Estado en BD tras reversión:', finalRes.rows[0].mfa_enabled);

  console.log('--- TEST COMPLETADO CON ÉXITO ---');
  process.exit(0);
}

test2fa().catch(err => {
  console.error('Error en test2fa:', err);
  process.exit(1);
});
