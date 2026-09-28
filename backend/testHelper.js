/**
 * @file testHelper.js
 * @description Utilidades centralizadas y estandarizadas para suites de prueba automatizadas.
 * Implementa el principio DRY eliminando duplicidad de clientes HTTP y formateo de aserciones.
 */

const http = require('http');

/**
 * Realiza una solicitud HTTP contra un servidor local especificado por puerto o URL base.
 *
 * @param {string|number} hostOrPort - Puerto numérico o URL base (ej: 5001 o 'http://localhost:5001').
 * @param {string} path - Ruta de la petición (ej: '/api/auth/login').
 * @param {string} [method='GET'] - Método HTTP (GET, POST, PUT, DELETE, PATCH).
 * @param {object|null} [data=null] - Payload de la solicitud en formato objeto JS.
 * @param {string|null} [token=null] - Token de autorización Bearer JWT opcional.
 * @returns {Promise<{ status: number, body: any, headers: object }>}
 */
function makeRequest(hostOrPort, path, method = 'GET', data = null, token = null) {
  let hostname = 'localhost';
  let port = 5001;

  if (typeof hostOrPort === 'number') {
    port = hostOrPort;
  } else if (typeof hostOrPort === 'string') {
    try {
      const parsedUrl = new URL(hostOrPort);
      hostname = parsedUrl.hostname;
      port = parseInt(parsedUrl.port, 10) || (parsedUrl.protocol === 'https:' ? 443 : 80);
    } catch {
      port = parseInt(hostOrPort, 10) || 5001;
    }
  }

  const payload = data ? JSON.stringify(data) : '';
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path,
        method: method.toUpperCase(),
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Crea un contador de pruebas con reportes tipificados [PASS] y [FAIL].
 *
 * @returns {{ assert: (cond: boolean, title: string) => void, getStats: () => { total: number, passed: number, failed: number } }}
 */
function createTestReporter() {
  let total = 0;
  let passed = 0;

  return {
    assert(condition, title) {
      total++;
      if (condition) {
        passed++;
        console.log(`  [PASS] ${title}`);
      } else {
        console.error(`  [FAIL] ${title}`);
      }
    },
    getStats() {
      return { total, passed, failed: total - passed };
    },
  };
}

module.exports = {
  makeRequest,
  createTestReporter,
};
