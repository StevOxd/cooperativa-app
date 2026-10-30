const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 1. Verificación Fail-Fast de variables de entorno críticas (CWE-798 Hardening)
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DB_USER', 'DB_NAME', 'BANCO_INTERNAL_API_KEY'];
const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key] || process.env[key].trim() === '');
if (missingEnv.length > 0) {
  console.error(`[CRITICAL SECURITY ERROR] Variables de entorno requeridas ausentes en .env: ${missingEnv.join(', ')}.`);
  console.error('[CRITICAL SECURITY ERROR] El servidor abortará la ejecución por políticas de seguridad bancaria.');
  process.exit(1);
}

const { testConnection } = require('./config/db');
const { runMigrations } = require('./config/migrations');
const socketService = require('./services/socketService');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const asociadoRoutes = require('./routes/asociadoRoutes');
const operadorRoutes = require('./routes/operadorRoutes');
const catalogoRoutes = require('./routes/catalogoRoutes');
const bancoExternoRoutes = require('./routes/bancoExternoRoutes');
const afiliacionOnlineRoutes = require('./routes/afiliacionOnlineRoutes');
const asociadosAdminRoutes = require('./routes/asociadosAdminRoutes');
const conciliacionRoutes = require('./routes/conciliacionRoutes');
const ejecutivoRoutes = require('./routes/ejecutivoRoutes');
const reportesRoutes = require('./routes/reportesRoutes');

const app = express();
const server = http.createServer(app);
const io = socketService.init(server);
const PORT = process.env.PORT || 5000;

// 2. Hardening de Cabeceras HTTP con Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Permite coexistencia con SPA en dev/prod
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 3. Configuración estricta de CORS
const corsOptions = {
  origin: (origin, callback) => {
    // Permitir llamadas sin origin (curl, scripts internos, pruebas unitarias)
    if (!origin) return callback(null, true);

    // Si FRONTEND_URL está configurado, admitirlo explícitamente
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    // Permitir orígenes de red local y localhost en entornos de desarrollo/pruebas
    const isLocalOrLan = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocalOrLan || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error('[CORS ERROR] Origen no autorizado por la política institucional.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Soporte para carga de archivos y firmas PDF escalables en base64 (límite 15MB)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Servir archivos estáticos protegidos con autenticación y RBAC (SEC-02)
const { secureUploadsHandler } = require('./middlewares/secureUploads');
// Siempre con carpeta: los PDF de crédito están en uploads/creditos y los documentos en uploads/afiliaciones
app.get('/api/uploads/:subfolder/:filename', secureUploadsHandler);

/**
 * Endpoint de verificación de salud (Health Check)
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Servidor API de Cooperativa en funcionamiento',
    timestamp: new Date().toISOString(),
  });
});

// Rutas de la aplicación
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/asociado', asociadoRoutes);
app.use('/api/operador', operadorRoutes);
app.use('/api/ejecutivo', ejecutivoRoutes);
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/banco-externo', bancoExternoRoutes);
app.use('/api/afiliacion', afiliacionOnlineRoutes);
app.use('/api/admin/asociados', asociadosAdminRoutes);
app.use('/api/conciliacion', conciliacionRoutes);
app.use('/api/reportes', reportesRoutes);

// Manejo de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Manejador global de errores. Si el cuerpo no se pudo leer (JSON mal formado, demasiado grande, codificación no
// admitida o petición cortada), es un error del cliente: se responde su estado y no se escribe el error, que trae el
// cuerpo crudo (p. ej. la contraseña de un inicio de sesión mal formado). Lo demás es 500.
const MENSAJES_CUERPO = {
  400: 'La solicitud no tiene un formato válido.',
  413: 'La solicitud es demasiado grande.',
};
app.use((err, req, res, next) => {
  if (err.type && err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ success: false, message: MENSAJES_CUERPO[err.status] || 'No se pudo leer la solicitud.' });
  }
  console.error('[ERROR NO CONTROLADO]', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Iniciar servidor solo si es ejecutado directamente. Las migraciones corren antes de atender peticiones:
// si la base de datos no responde o una migración falla, el proceso termina y Docker lo reinicia.
if (require.main === module) {
  (async () => {
    const dbConnected = await testConnection();
    if (!dbConnected || !(await runMigrations())) {
      console.error('[ERROR] No se pudo preparar la base de datos. El servidor no se inicia.');
      process.exit(1);
    }
    // Las credenciales del rol dueño solo hacían falta para las migraciones: el proceso sigue sin ellas
    delete process.env.DB_OWNER_USER;
    delete process.env.DB_OWNER_PASSWORD;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[INFO] Servidor ejecutándose en http://localhost:${PORT}`);
      console.log(`[INFO] Rutas de autenticación disponibles en http://localhost:${PORT}/api/auth`);
    });
  })();
}

module.exports = { app, server, io };