const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  max: 20,                          // Límite máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,         // Cerrar conexiones inactivas tras 30 segundos
  connectionTimeoutMillis: 5000,    // Fail-fast tras 5 segundos si el pool está agotado
};

// Solo incluir password si está definida y no está vacía
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  poolConfig.password = process.env.DB_PASSWORD;
}

// Rol de la aplicación: solo lee y escribe datos (no crea tablas ni desactiva triggers)
const pool = new Pool(poolConfig);

/**
 * Pool del rol dueño de las tablas (DB_OWNER_USER), solo para las migraciones: crean y modifican el esquema,
 * algo que el rol de la aplicación no puede hacer. Quien lo crea lo cierra al terminar.
 *
 * @returns {import('pg').Pool}
 * @throws {Error} si faltan DB_OWNER_USER o DB_OWNER_PASSWORD.
 */
const crearPoolDueno = () => {
  const user = process.env.DB_OWNER_USER;
  const password = process.env.DB_OWNER_PASSWORD;
  if (!user || !password) {
    throw new Error('Faltan DB_OWNER_USER o DB_OWNER_PASSWORD: sin el rol dueño no se pueden aplicar las migraciones.');
  }
  return new Pool({ ...poolConfig, user, password, max: 2, allowExitOnIdle: true });
};

// Eventos de monitoreo del pool
pool.on('connect', () => {
  // Conexión exitosa adquirida por el pool
});

pool.on('error', (err) => {
  console.error('[DB ERROR] Error inesperado en el cliente del pool de PostgreSQL:', err.message);
});

/**
 * Prueba la conectividad inicial con el clúster de base de datos PostgreSQL.
 *
 * @async
 * @function testConnection
 * @returns {Promise<boolean>} true si la conexión es exitosa, false en caso contrario.
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() AS current_time');
    client.release();
    console.log('[DB] Conexión exitosa a PostgreSQL:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('[DB ERROR] Error al conectar a PostgreSQL:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  crearPoolDueno,
  query: (text, params) => pool.query(text, params),
  testConnection,
};
