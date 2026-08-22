const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'stevenortiz',
  database: process.env.DB_NAME || 'cooperativa_db',
};

// Solo incluir password si está definida y no está vacía
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  poolConfig.password = process.env.DB_PASSWORD;
}

const pool = new Pool(poolConfig);

// Eventos de monitoreo del pool
pool.on('connect', () => {
  // Conexión exitosa adquirida por el pool
});

pool.on('error', (err) => {
  console.error('Error inesperado en el cliente del pool de PostgreSQL:', err.message);
});

/**
 * Función para probar la conexión inicial con la base de datos
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() AS current_time');
    client.release();
    console.log('✅ Conexión exitosa a PostgreSQL:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
};
