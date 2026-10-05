const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 1. Verificación Fail-Fast de variables requeridas para el Core Bancario
const REQUIRED_BANCO_ENV = ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'BANCO_INTERNAL_API_KEY'];
const missingBancoEnv = REQUIRED_BANCO_ENV.filter((key) => !process.env[key] || process.env[key].trim() === '');
if (missingBancoEnv.length > 0) {
  console.error(`[CRITICAL SECURITY ERROR] Variables de entorno críticas ausentes en banco-backend: ${missingBancoEnv.join(', ')}`);
  process.exit(1);
}

const { ensureDatabaseExists } = require('./config/db');
const { initBancoDb } = require('./config/initBancoDb');
const bancoRoutes = require('./routes/bancoRoutes');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 2. Configuración estricta de CORS en Core Bancario (CWE-942 Hardening)
const bancoCorsOptions = {
  origin: (origin, callback) => {
    // Permitir llamadas server-to-server sin cabecera origin (fetch directo backend -> banco-backend)
    if (!origin) return callback(null, true);

    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    const isLocalOrLan = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocalOrLan || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error('[SECURITY ERROR] Origen no autorizado para comunicarse con el Core Bancario.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-banco-api-key'],
};

app.use(cors(bancoCorsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck directo
app.get('/api/banco/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'banco-backend', timestamp: new Date() });
});

// Montar Rutas Oficiales del Core Bancario
app.use('/api/banco/v1', bancoRoutes);

// Manejador 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada en Core Banking API: ${req.method} ${req.originalUrl}`,
  });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('[BANCO SERVER ERROR]', err);
  res.status(500).json({
    success: false,
    message: 'Error interno en Core Banking API.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Inicialización de base de datos y arranque
const startServer = async () => {
  try {
    console.log('[BANCO CORE] Verificando base de datos banco_db...');
    await ensureDatabaseExists();
    await initBancoDb();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[BANCO CORE] Servidor Core Banking ejecutándose en http://localhost:${PORT}`);
      console.log(`[BANCO CORE] Endpoints bancarios disponibles en http://localhost:${PORT}/api/banco/v1`);
    });
  } catch (error) {
    console.error('[BANCO CORE FATAL ERROR] No se pudo iniciar el servicio bancario:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
