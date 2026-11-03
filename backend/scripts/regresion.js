/**
 * Suite de regresión: ejecuta los scripts backend/test*.js uno por uno, porque comparten la base de datos.
 * Termina con error si alguno falla. Con REGRESION_COBERTURA=1 mide la cobertura de backend/src con c8.
 *
 * Quedan fuera los que necesitan otro proceso o un servicio externo:
 * - testGoogleMailer.js envía un correo real.
 * - test2faFlow.js, testBandejaAfiliaciones.js, testCybersecurity.js y testForcedPasswordChange.js usan el backend
 *   levantado en el puerto 5001.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const EXCLUIDOS = new Set([
  'testHelper.js',
  'testGoogleMailer.js',
  'test2faFlow.js',
  'testBandejaAfiliaciones.js',
  'testCybersecurity.js',
  'testForcedPasswordChange.js',
]);
const LIMITE_POR_SCRIPT_MS = 5 * 60 * 1000;
const CON_COBERTURA = process.env.REGRESION_COBERTURA === '1';
const C8 = path.join(RAIZ, 'node_modules', '.bin', 'c8');
const COBERTURA_TEMP = path.join(RAIZ, 'coverage', 'regresion-tmp');
const COBERTURA_SALIDA = path.join(RAIZ, 'coverage', 'regresion');

const scripts = fs
  .readdirSync(RAIZ)
  .filter((f) => /^test.*\.js$/.test(f) && !EXCLUIDOS.has(f))
  .sort();
const entorno = { ...process.env, MAIL_ENABLED: 'false' };

if (CON_COBERTURA) fs.rmSync(COBERTURA_TEMP, { recursive: true, force: true });

const fallidos = [];
for (const script of scripts) {
  const inicio = Date.now();
  const [comando, args] = CON_COBERTURA
    ? [C8, ['--clean=false', '--temp-directory', COBERTURA_TEMP, '--reporter', 'none', 'node', script]]
    : [process.execPath, [script]];
  const { status, stdout, stderr } = spawnSync(comando, args, {
    cwd: RAIZ,
    env: entorno,
    encoding: 'utf8',
    timeout: LIMITE_POR_SCRIPT_MS,
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  if (status === 0) {
    console.log(`[PASS] ${script} (${segundos} s)`);
  } else {
    fallidos.push(script);
    console.log(`[FAIL] ${script} (${segundos} s, código ${status})`);
    // Solo las líneas que explican el fallo: la salida completa puede traer datos de prueba de más
    const lineas = `${stdout}\n${stderr}`.split('\n').filter((l) => /\[FAIL\]|\[ERROR\]|Error:/.test(l));
    console.log(lineas.slice(0, 30).join('\n'));
  }
}

console.log(`\n[RESULTADO] ${scripts.length - fallidos.length} de ${scripts.length} scripts aprobados.`);

if (CON_COBERTURA) {
  const { status } = spawnSync(
    C8,
    [
      'report',
      '--temp-directory',
      COBERTURA_TEMP,
      '--reports-dir',
      COBERTURA_SALIDA,
      '--reporter',
      'lcov',
      '--reporter',
      'text-summary',
      '--reporter',
      'json-summary',
      '--all',
      '--include',
      'src/**/*.js',
      '--check-coverage',
      '--lines',
      process.env.COBERTURA_MINIMA || '70',
    ],
    { cwd: RAIZ, stdio: 'inherit' }
  );
  if (status !== 0) {
    console.error('[ERROR] La cobertura de backend/src está por debajo del umbral.');
    process.exit(1);
  }
}

process.exit(fallidos.length === 0 ? 0 : 1);
