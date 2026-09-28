require('dotenv').config();
const { Pool } = require('pg');

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME || 'banco_db';
const adminDb = process.env.ADMIN_DB || 'postgres';

if (!user || !password) {
  console.error('[CRITICAL SECURITY ERROR] DB_USER o DB_PASSWORD ausentes en la configuración de base de datos bancaria.');
  process.exit(1);
}

/**
 * Garantiza que la base de datos banco_db exista en PostgreSQL antes de conectar el pool principal
 */
const ensureDatabaseExists = async () => {
  // Validar nombre de base de datos para prevenir DDL Injection (SEC-11)
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error(`[SECURITY ERROR] Nombre de base de datos bancaria inválido o malicioso: '${database}'`);
  }

  const adminPool = new Pool({
    host,
    port,
    user,
    password,
    database: adminDb,
  });

  try {
    const checkRes = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database]
    );

    if (checkRes.rows.length === 0) {
      console.log(`[BANCO DB] La base de datos '${database}' no existe. Creándola...`);
      await adminPool.query(`CREATE DATABASE ${database};`);
      console.log(`[BANCO DB] Base de datos '${database}' creada exitosamente.`);
    }
  } catch (error) {
    console.error(`[BANCO DB ERROR] Error al verificar/crear base de datos '${database}':`, error.message);
  } finally {
    await adminPool.end();
  }
};

const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[BANCO DB POOL ERROR] Error inesperado en el pool bancario:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  ensureDatabaseExists,
};
