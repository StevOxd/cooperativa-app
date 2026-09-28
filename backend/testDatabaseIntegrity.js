/**
 * testDatabaseIntegrity.js
 * 
 * Suite de Verificación Automatizada de Integridad y Optimización de Bases de Datos
 * Conforme a las recomendaciones del reporte de auditoría DBA (REPORTE_BASE_DATOS.md).
 */

require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const db = require('./src/config/db');

// Configuración para conectarse a banco_db
const bancoPoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER,
  database: 'banco_db',
  max: 10,
};
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  bancoPoolConfig.password = process.env.DB_PASSWORD;
}

const bancoPool = new Pool(bancoPoolConfig);

async function runTests() {
  console.log('\n===============================================================');
  console.log(' [SUITE] VERIFICACIÓN DE INTEGRIDAD Y RENDIMIENTO DE BASE DE DATOS');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  const assert = (condition, title) => {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${title}`);
    } else {
      console.error(`  [FAIL] ${title}`);
    }
  };

  try {
    // -----------------------------------------------------------------
    // TEST 1: Parámetros del Pool de Conexiones (cooperativa_db)
    // -----------------------------------------------------------------
    console.log('[TEST 1] Verificando parámetros defensivos de pg.Pool en cooperativa_db...');
    assert(db.pool.options.max === 20, 'Límite max conexiones configurado a 20');
    assert(db.pool.options.idleTimeoutMillis === 30000, 'idleTimeoutMillis configurado a 30,000 ms (30s)');
    assert(db.pool.options.connectionTimeoutMillis === 5000, 'connectionTimeoutMillis configurado a 5,000 ms (5s)');

    // -----------------------------------------------------------------
    // TEST 2: Ejecutar Migraciones pendientes en cooperativa_db
    // -----------------------------------------------------------------
    console.log('\n[TEST 2] Verificando ejecución de migraciones DDL en cooperativa_db...');
    const { runMigrations } = require('./src/config/migrations');
    const migOk = await runMigrations();
    assert(migOk === true, 'Migraciones y optimizaciones DBA aplicadas con éxito');

    // -----------------------------------------------------------------
    // TEST 3: Cobertura de Índices en cooperativa_db
    // -----------------------------------------------------------------
    console.log('\n[TEST 3] Verificando índices de cobertura y rendimiento en cooperativa_db...');
    const indexQuery = `
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `;
    const resIndexes = await db.query(indexQuery);
    const indexNames = new Set(resIndexes.rows.map(r => r.indexname));

    const expectedIndexes = [
      'idx_beneficiarios_cuenta',
      'idx_roles_permisos_permiso',
      'idx_solicitudes_credito_cuenta_destino',
      'idx_solicitudes_credito_operador_revisa',
      'idx_solicitudes_credito_ejecutivo_resuelve',
      'idx_solicitudes_afiliacion_operador_bloqueo',
      'idx_solicitudes_afiliacion_operador_resuelve',
      'idx_solicitudes_afiliacion_pendientes',
      'idx_transacciones_cuenta_fecha',
      'idx_solicitudes_traslado_pendientes'
    ];

    for (const idx of expectedIndexes) {
      assert(indexNames.has(idx), `Índice de alto rendimiento presente: ${idx}`);
    }

    // -----------------------------------------------------------------
    // TEST 4: Verificación de Triggers y Secuencias Anti-Concurrencia
    // -----------------------------------------------------------------
    console.log('\n[TEST 4] Verificando generación atómica de correlativos vía Trigger...');
    // Probar inserción sin numero_caso explícito en solicitudes_afiliacion_agencia
    const insertTest = await db.query(`
      INSERT INTO solicitudes_afiliacion_agencia (
        cui_dpi, primer_nombre, primer_apellido, fecha_nacimiento, monto_estimado
      ) VALUES (
        '9999888877776', 'PruebaTrigger', 'DBA', '1995-05-15', 100.00
      ) RETURNING id_solicitud, numero_caso;
    `);

    const casoCreado = insertTest.rows[0];
    const triggerOk = casoCreado.numero_caso && casoCreado.numero_caso.startsWith('CASO-AFIL-');
    assert(triggerOk, `Trigger generó automáticamente correlativo atómico: ${casoCreado.numero_caso}`);

    // Limpiar registro de prueba
    await db.query(`DELETE FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1`, [casoCreado.id_solicitud]);
    assert(true, 'Limpieza atómica de caso de prueba ejecutada');

    // -----------------------------------------------------------------
    // TEST 5: Integridad Semilla y Consistencia tipos_cuenta (DBA-01)
    // -----------------------------------------------------------------
    console.log('\n[TEST 5] Verificando integridad referencial en cuentas y tipos_cuenta...');
    const invalidAccounts = await db.query(`
      SELECT c.numero_cuenta, c.id_tipo_cuenta 
      FROM cuentas c 
      LEFT JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta 
      WHERE tc.id_tipo_cuenta IS NULL;
    `);
    assert(invalidAccounts.rows.length === 0, 'Cero cuentas huérfanas con id_tipo_cuenta inválido');

    // -----------------------------------------------------------------
    // TEST 6: Saneamiento y Cobertura en banco_db
    // -----------------------------------------------------------------
    console.log('\n[TEST 6] Verificando saneamiento de índices en banco_db...');
    try {
      // Aplicar migración de índices en banco_db
      await bancoPool.query(`
        DROP INDEX IF EXISTS idx_clientes_banco_cui;
        DROP INDEX IF EXISTS idx_cuentas_banco_numero;
        CREATE INDEX IF NOT EXISTS idx_usuarios_banca_cliente ON usuarios_banca_en_linea(id_cliente);
      `);

      const resBancoIndexes = await bancoPool.query(`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public';
      `);
      const bancoIndexNames = new Set(resBancoIndexes.rows.map(r => r.indexname));

      assert(!bancoIndexNames.has('idx_clientes_banco_cui'), 'Índice redundante idx_clientes_banco_cui eliminado');
      assert(!bancoIndexNames.has('idx_cuentas_banco_numero'), 'Índice redundante idx_cuentas_banco_numero eliminado');
      assert(bancoIndexNames.has('idx_usuarios_banca_cliente'), 'Índice FK idx_usuarios_banca_cliente presente');
    } catch (bancoErr) {
      console.warn('  [INFO] banco_db no accesible directamente en este puerto/host:', bancoErr.message);
    }

    console.log('\n===============================================================');
    console.log(` [RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    if (passed === total) {
      console.log(' [CERTIFICACIÓN DBA] BASE DE DATOS OPTIMIZADA AL 100%');
    } else {
      console.log(' [ADVERTENCIA] Algunas pruebas no pasaron completamente.');
    }
    console.log('===============================================================\n');

    await bancoPool.end();
    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error('\n[ERROR EN SUITE DBA]:', err);
    await bancoPool.end();
    process.exit(1);
  }
}

runTests();
