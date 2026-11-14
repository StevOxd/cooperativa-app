/**
 * Pruebas con Jest. Las unitarias no necesitan base de datos; las de integración usan PostgreSQL y el banco de prueba.
 * Los scripts backend/test*.js son la suite de regresión y corren aparte (npm run test:regresion).
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage/jest',
  coverageReporters: ['lcov', 'text-summary'],
  collectCoverageFrom: [
    'src/utils/errores.js',
    'src/utils/fechas.js',
    'src/utils/identificadores.js',
    'src/utils/ipCliente.js',
    'src/utils/montos.js',
    'src/utils/parentesco.js',
    'src/utils/passwordPolicy.js',
    'src/utils/cifradoConfiguracion.js',
    'src/utils/direccionesInternas.js',
    'src/middlewares/validationMiddleware.js',
    'src/middlewares/limitePorUsuario.js',
    // Correo del sistema (issue #126): se prueba sin red ni base, con nodemailer y la base falsos
    'src/services/mailerService.js',
    'src/services/cambiosCorreoService.js',
    'src/services/confirmacionIdentidadService.js',
  ],
  coverageThreshold: { global: { lines: 60 } },
};
