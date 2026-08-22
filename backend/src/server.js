const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de verificación de estado de la API
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


// Manejo de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Manejador global de errores (500)
app.use((err, req, res, next) => {
  console.error('Error no controlado en el servidor:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Iniciar servidor solo si es ejecutado directamente
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📡 Rutas de autenticación disponibles en http://localhost:${PORT}/api/auth`);
    await testConnection();
  });
}

module.exports = { app };

