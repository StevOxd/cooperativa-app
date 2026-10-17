require('dotenv').config();
const { Pool } = require('pg');

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME || 'banco_db';

if (!user || !password) {
  console.error('[CRITICAL SECURITY ERROR] DB_USER o DB_PASSWORD ausentes en la configuración de base de datos bancaria.');
  process.exit(1);
}

/**
 * Verifica que la base de datos del banco exista. La crea el servicio db-roles de Docker Compose con el
 * superusuario y la deja a nombre del rol DB_OWNER_USER: el rol de la aplicación no puede crear bases de datos.
 *
 * @throws {Error} si el nombre no es válido o la base no existe.
 */
const ensureDatabaseExists = async () => {
  // Validar nombre de base de datos para prevenir DDL Injection (SEC-11)
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error(`[SECURITY ERROR] Nombre de base de datos bancaria inválido o malicioso: '${database}'`);
  }
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    if (error.code === '3D000') {
      throw new Error(`La base de datos '${database}' no existe. Créela con el servicio db-roles (docker compose up -d).`);
    }
    throw error;
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

/**
 * Pool del rol dueño de las tablas (DB_OWNER_USER), solo para crear el esquema al arrancar (initBancoDb).
 * Quien lo crea lo cierra al terminar.
 *
 * @returns {import('pg').Pool}
 * @throws {Error} si faltan DB_OWNER_USER o DB_OWNER_PASSWORD.
 */
const crearPoolDueno = () => {
  const ownerUser = process.env.DB_OWNER_USER;
  const ownerPassword = process.env.DB_OWNER_PASSWORD;
  if (!ownerUser || !ownerPassword) {
    throw new Error('Faltan DB_OWNER_USER o DB_OWNER_PASSWORD: sin el rol dueño no se puede preparar banco_db.');
  }
  return new Pool({ host, port, user: ownerUser, password: ownerPassword, database, max: 2, allowExitOnIdle: true });
};

module.exports = {
  pool,
  crearPoolDueno,
  query: (text, params) => pool.query(text, params),
  ensureDatabaseExists,
};
