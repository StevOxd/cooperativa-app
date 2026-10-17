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

// Hash bcrypt de admin123 (el mismo de los datos semilla)
const HASH_ADMIN123 = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';

/**
 * Crea una persona con un usuario de prueba propio (contraseña admin123, sin cambio pendiente), para no
 * depender de los usuarios semilla ni chocar con los de otras suites.
 *
 * @param {object} db - Módulo `src/config/db`.
 * @param {object} opciones
 * @param {string} opciones.dpi - 13 dígitos, único.
 * @param {string} opciones.codigo - Código único. Use una letra tras el guion (`OP-T…`): así no cuenta para
 *   el siguiente código real (`getNextCorporateCode` solo mira `PREFIJO-número`) aunque la prueba no limpie.
 * @param {string} opciones.email - Único.
 * @param {'ADMINISTRADOR'|'OPERADOR'|'EJECUTIVO'|'ASOCIADO'} opciones.rol
 * @param {'ACTIVO'|'INACTIVO'} [opciones.estado='ACTIVO']
 * @param {boolean} [opciones.asociado=false] - Además la registra como asociada.
 * @returns {Promise<{ idPersona: number, idUsuario: number, idAsociado: number|null }>}
 */
async function crearUsuarioDePrueba(db, { dpi, codigo, email, rol, estado = 'ACTIVO', asociado = false }) {
  const idPersona = (await db.query(
    `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
     VALUES ($1, 'Prueba', 'Automatizada', '55550000', '1990-01-01') RETURNING id_persona`,
    [dpi]
  )).rows[0].id_persona;
  const idAsociado = asociado
    ? (await db.query(
      "INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO') RETURNING id_asociado",
      [idPersona]
    )).rows[0].id_asociado
    : null;
  const idUsuario = (await db.query(
    `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
     VALUES ($1, (SELECT id_rol FROM roles WHERE codigo = $2), $3, $4, $5, $6, false) RETURNING id_usuario`,
    [idPersona, rol, codigo, email, HASH_ADMIN123, estado]
  )).rows[0].id_usuario;
  return { idPersona, idUsuario, idAsociado };
}

/**
 * Borra una persona de prueba con todo lo suyo: usuarios, auditoría, cuentas, movimientos y solicitudes. Todo
 * en una transacción: si un paso falla, no queda a medias.
 *
 * Pensada para asociados y para personal que no atendió trámites: no limpia lo que un usuario del personal
 * registró sobre otras personas (`transacciones.id_usuario_registra`, los revisores de `solicitudes_credito`
 * o `solicitudes_traslado_apertura.id_operador_resuelve`); con esas referencias, el borrado falla.
 *
 * @param {object} db - Módulo `src/config/db`.
 * @param {number} idPersona
 * @returns {Promise<void>}
 */
async function borrarPersonaDePrueba(db, idPersona) {
  const usuarios = 'SELECT id_usuario FROM usuarios WHERE id_persona = $1';
  const asociados = 'SELECT id_asociado FROM asociados WHERE id_persona = $1';
  const cuentas = `SELECT id_cuenta FROM cuentas WHERE id_asociado IN (${asociados})`;
  const pasos = [
    // depositos_ventanilla_banco es un registro de auditoría: solo se borra con la marca de purga de pruebas
    "SET LOCAL cooperativa.purga_pruebas = 'on'",
    `DELETE FROM depositos_ventanilla_banco WHERE id_usuario_operador IN (${usuarios})`,
    `DELETE FROM historial_estados_usuario WHERE id_usuario_modificado IN (${usuarios}) OR id_modificado_por IN (${usuarios})`,
    `DELETE FROM historial_cambios_beneficiarios WHERE id_cuenta IN (${cuentas})`,
    `DELETE FROM beneficiarios WHERE id_cuenta IN (${cuentas})`,
    `DELETE FROM transacciones WHERE id_cuenta IN (${cuentas})`,
    `DELETE FROM solicitudes_credito WHERE id_asociado IN (${asociados})`,
    `DELETE FROM solicitudes_traslado_apertura WHERE id_asociado IN (${asociados})`,
    `DELETE FROM cuentas WHERE id_asociado IN (${asociados})`,
    'DELETE FROM usuarios WHERE id_persona = $1',
    'DELETE FROM asociados WHERE id_persona = $1',
    'DELETE FROM personas WHERE id_persona = $1',
  ];
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of pasos) {
      await client.query(sql, sql.includes('$1') ? [idPersona] : []);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  makeRequest,
  createTestReporter,
  HASH_ADMIN123,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
};
