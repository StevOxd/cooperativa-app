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
    'src/middlewares/validationMiddleware.js',
  ],
  coverageThreshold: { global: { lines: 60 } },
};
