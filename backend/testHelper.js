/**
 * @file testHelper.js
 * @description Utilidades centralizadas y estandarizadas para suites de prueba automatizadas.
 * Implementa el principio DRY eliminando duplicidad de clientes HTTP y formateo de aserciones.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');

// Carpeta de los documentos de afiliación (la misma que monta el contenedor del backend)
const CARPETA_DOCUMENTOS = path.join(__dirname, 'uploads', 'afiliaciones');

// Pools del rol dueño de las tablas, uno por base de datos (ver poolDueno)
const poolsDueno = new Map();

/**
 * Pool del rol dueño de las tablas (DB_OWNER_USER) en el mismo servidor que `pool`. La limpieza de las pruebas lo
 * necesita: el rol de la aplicación no borra filas (salvo en las pocas tablas que el código limpia), no cambia
 * secuencias y los triggers de auditoría solo dejan purgar al dueño de la tabla. Se crea al primer uso y no
 * retiene el proceso al terminar.
 *
 * Recibe el `Pool` (no el módulo `db` como los demás helpers) porque de él toma el servidor y la base.
 *
 * @param {import('pg').Pool} pool - Pool del rol de la aplicación.
 * @param {string} [database] - Base que se va a limpiar; por defecto, la de `pool`.
 * @returns {import('pg').Pool}
 * @throws {Error} si faltan DB_OWNER_USER o DB_OWNER_PASSWORD.
 */
function poolDueno(pool, database = pool.options.database) {
  const { host, port } = pool.options;
  const clave = `${host}:${port}/${database}`;
  if (!poolsDueno.has(clave)) {
    const user = process.env.DB_OWNER_USER;
    const password = process.env.DB_OWNER_PASSWORD;
    if (!user || !password) {
      throw new Error('Faltan DB_OWNER_USER o DB_OWNER_PASSWORD: las purgas de pruebas usan el rol dueño (vea backend/.env.example).');
    }
    poolsDueno.set(clave, new Pool({ host, port, database, user, password, max: 2, allowExitOnIdle: true }));
  }
  return poolsDueno.get(clave);
}

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
 * Pasos que borran los expedientes de documentos que cumplen `condicion` (sobre `expedientes_documentos`), con sus
 * documentos, revisiones y accesos. Van dentro de una transacción con la marca de purga de pruebas.
 *
 * @param {string} condicion - Condición SQL; puede usar $1.
 * @returns {string[]}
 */
const pasosPurgaDocumentos = (condicion) => {
  const expedientes = `SELECT id_expediente FROM expedientes_documentos WHERE ${condicion}`;
  const documentos = `SELECT id_documento FROM documentos_afiliacion WHERE id_expediente IN (${expedientes})`;
  return [
    `DELETE FROM accesos_documento WHERE id_documento IN (${documentos})`,
    `DELETE FROM revisiones_documento WHERE id_documento IN (${documentos})`,
    // Las versiones se encadenan entre sí: se sueltan antes de borrarlas
    `UPDATE documentos_afiliacion SET id_documento_anterior = NULL WHERE id_expediente IN (${expedientes})`,
    `DELETE FROM documentos_afiliacion WHERE id_expediente IN (${expedientes})`,
    `DELETE FROM expedientes_documentos WHERE ${condicion}`,
  ];
};

/**
 * Borra de disco los archivos de documentos que ya no tienen registro.
 *
 * @param {string[]} archivos
 * @returns {Promise<void>}
 */
async function borrarArchivosDeDocumentos(archivos) {
  for (const archivo of archivos) {
    await fs.promises.unlink(path.join(CARPETA_DOCUMENTOS, path.basename(archivo))).catch(() => {});
  }
}

/**
 * Borra una persona de prueba con todo lo suyo: usuarios, auditoría, cuentas, movimientos, solicitudes, sus
 * documentos de afiliación (y sus archivos), los reportes que sacó y el efectivo de ventanilla registrado a su nombre. Todo en una
 * transacción: si un paso falla, no queda a medias. Usa el rol dueño (poolDueno), el único que puede purgar los
 * registros de auditoría.
 *
 * Pensada para asociados y para personal que no atendió trámites: no limpia lo que un usuario del personal
 * registró sobre otras personas (`transacciones.id_usuario_registra`, los revisores de `solicitudes_credito`,
 * `solicitudes_traslado_apertura.id_operador_resuelve` o los documentos que escaneó o revisó); con esas
 * referencias, el borrado falla. Borre primero a los asociados y después al personal.
 *
 * @param {object} db - Módulo `src/config/db`.
 * @param {number} idPersona
 * @returns {Promise<void>}
 */
async function borrarPersonaDePrueba(db, idPersona) {
  const usuarios = 'SELECT id_usuario FROM usuarios WHERE id_persona = $1';
  const asociados = 'SELECT id_asociado FROM asociados WHERE id_persona = $1';
  const cuentas = `SELECT id_cuenta FROM cuentas WHERE id_asociado IN (${asociados})`;
  const deLaPersona = 'id_persona = $1 OR cui_dpi = (SELECT cui_dpi FROM personas WHERE id_persona = $1)';
  const pasos = [
    // depositos_ventanilla_banco es un registro de auditoría: solo se borra con la marca de purga de pruebas
    "SET LOCAL cooperativa.purga_pruebas = 'on'",
    ...pasosPurgaDocumentos(deLaPersona),
    `DELETE FROM accesos_documento WHERE id_usuario IN (${usuarios})`,
    `DELETE FROM reportes_generados WHERE id_usuario IN (${usuarios})`,
    `DELETE FROM depositos_ventanilla_banco WHERE id_usuario_operador IN (${usuarios})
       OR titular_cui = (SELECT cui_dpi FROM personas WHERE id_persona = $1)`,
    `DELETE FROM efectivo_ventanilla WHERE id_usuario_operador IN (${usuarios})
       OR cui_dpi = (SELECT cui_dpi FROM personas WHERE id_persona = $1)`,
    `DELETE FROM historial_estados_usuario WHERE id_usuario_modificado IN (${usuarios}) OR id_modificado_por IN (${usuarios})`,
    `DELETE FROM historial_cambios_beneficiarios WHERE id_cuenta IN (${cuentas})`,
    `DELETE FROM beneficiarios WHERE id_cuenta IN (${cuentas})`,
    `DELETE FROM transacciones WHERE id_cuenta IN (${cuentas})`,
    // El historial de las solicitudes del asociado va antes que ellas. El de solicitudes ajenas que resolvió esta
    // persona no se toca: su llave foránea detiene el borrado (como lo demás que el personal registró)
    `DELETE FROM resoluciones_credito
       WHERE id_solicitud_credito IN (SELECT id_solicitud_credito FROM solicitudes_credito WHERE id_asociado IN (${asociados}))`,
    `DELETE FROM solicitudes_credito WHERE id_asociado IN (${asociados})`,
    `DELETE FROM solicitudes_traslado_apertura WHERE id_asociado IN (${asociados})`,
    `DELETE FROM cuentas WHERE id_asociado IN (${asociados})`,
    'DELETE FROM usuarios WHERE id_persona = $1',
    'DELETE FROM asociados WHERE id_persona = $1',
    'DELETE FROM personas WHERE id_persona = $1',
  ];
  const client = await poolDueno(db.pool).connect();
  let archivos = [];
  try {
    await client.query('BEGIN');
    archivos = (await client.query(
      `SELECT archivo FROM documentos_afiliacion
       WHERE id_expediente IN (SELECT id_expediente FROM expedientes_documentos WHERE ${deLaPersona})`,
      [idPersona]
    )).rows.map((fila) => fila.archivo);
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
  await borrarArchivosDeDocumentos(archivos);
}

/**
 * Borra los expedientes de documentos de unos DPI de prueba (por ejemplo, de una afiliación que no se completó), con
 * sus documentos, revisiones, accesos y archivos. Usa el rol dueño y la marca de purga de pruebas.
 *
 * @param {{ pool: import('pg').Pool }} db
 * @param {string[]} dpis
 * @returns {Promise<void>}
 */
async function purgarDocumentosDePrueba(db, dpis) {
  const lista = dpis.filter(Boolean);
  if (lista.length === 0) return;
  const client = await poolDueno(db.pool).connect();
  let archivos = [];
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
    archivos = (await client.query(
      `SELECT d.archivo FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE e.cui_dpi = ANY($1)`,
      [lista]
    )).rows.map((fila) => fila.archivo);
    for (const sql of pasosPurgaDocumentos('cui_dpi = ANY($1)')) await client.query(sql, [lista]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  await borrarArchivosDeDocumentos(archivos);
}

/**
 * Borra el efectivo de ventanilla (y los depósitos al banco) registrados a nombre de unos DPI de prueba. Son
 * registros de auditoría: solo se borran con la marca de purga de pruebas y el rol dueño (poolDueno).
 *
 * @param {{ pool: import('pg').Pool }} db - Módulo `src/config/db` (o un objeto con su `pool`).
 * @param {string[]} dpis
 * @returns {Promise<void>}
 */
async function purgarEfectivoDePrueba(db, dpis) {
  const lista = dpis.filter(Boolean);
  if (lista.length === 0) return;
  const client = await poolDueno(db.pool).connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
    await client.query('DELETE FROM efectivo_ventanilla WHERE cui_dpi = ANY($1)', [lista]);
    await client.query('DELETE FROM depositos_ventanilla_banco WHERE titular_cui = ANY($1)', [lista]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Borra las reversiones pendientes de prueba por su referencia original. Son registro de auditoría: solo se
 * borran con la marca de purga de pruebas y el rol dueño (poolDueno).
 *
 * @param {{ pool: import('pg').Pool }} db
 * @param {string[]} referencias - Referencias originales (`SOL-CRED-…`, `CASO-…`).
 * @returns {Promise<void>}
 */
async function purgarReversionesDePrueba(db, referencias) {
  const lista = referencias.filter(Boolean);
  if (lista.length === 0) return;
  const client = await poolDueno(db.pool).connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
    await client.query('DELETE FROM reversiones_pendientes WHERE referencia_original = ANY($1)', [lista]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Borra de banco_db el cliente con ese DPI, sus usuarios de Banca en Línea, sus cuentas y sus movimientos. Solo
 * para clientes que abrió la propia prueba (por ejemplo, la afiliación en ventanilla de un externo), nunca para
 * los clientes semilla del banco.
 *
 * @param {import('pg').Pool} pool - Pool de cooperativa_db: se usan su servidor y sus credenciales.
 * @param {string} dpi
 * @returns {Promise<void>}
 */
async function borrarClienteBancoDePrueba(pool, dpi) {
  const deCliente = 'SELECT id_cliente FROM clientes_banco WHERE cui_dpi = $1';
  const client = await poolDueno(pool, 'banco_db').connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM movimientos_bancarios WHERE id_cuenta_bancaria IN (
         SELECT id_cuenta_bancaria FROM cuentas_bancarias WHERE id_cliente IN (${deCliente}))`,
      [dpi]
    );
    await client.query(`DELETE FROM cuentas_bancarias WHERE id_cliente IN (${deCliente})`, [dpi]);
    await client.query(`DELETE FROM usuarios_banca_en_linea WHERE id_cliente IN (${deCliente})`, [dpi]);
    await client.query('DELETE FROM clientes_banco WHERE cui_dpi = $1', [dpi]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Borra los depósitos en ventanilla al banco de prueba, por DPI del titular o por referencia. Son registro de
 * auditoría: solo se borran con la marca de purga de pruebas y el rol dueño (poolDueno).
 *
 * @param {{ pool: import('pg').Pool }} db
 * @param {{ dpis?: string[], referencias?: string[] }} filtro
 * @returns {Promise<void>}
 */
async function purgarDepositosDePrueba(db, { dpis = [], referencias = [] }) {
  const porDpi = dpis.filter(Boolean);
  const porReferencia = referencias.filter(Boolean);
  if (porDpi.length === 0 && porReferencia.length === 0) return;
  const client = await poolDueno(db.pool).connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
    await client.query(
      'DELETE FROM depositos_ventanilla_banco WHERE titular_cui = ANY($1) OR referencia = ANY($2)',
      [porDpi, porReferencia]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Documentos que se exigen para completar una afiliación (`DOCUMENTOS.OBLIGATORIOS`). */
const DOCUMENTOS_OBLIGATORIOS = ['DPI_FRENTE', 'DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI'];

/**
 * PDF mínimo como Data URI. Cada `marca` da un archivo distinto (el servidor rechaza el mismo archivo en dos tipos).
 *
 * @param {string} marca
 * @returns {string}
 */
const pdfDePrueba = (marca) =>
  `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n%${marca}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`).toString('base64')}`;

/**
 * Un operador escanea los documentos obligatorios de una afiliación: de una solicitud de agencia (`idSolicitud`) o,
 * para el Formulario 1, de un DPI (`cui`). Bórrelos al terminar con `purgarDocumentosDePrueba` (antes que al operador).
 *
 * @param {string|number} hostOrPort
 * @param {string} tokenOperador
 * @param {{ cui?: string, idSolicitud?: number }} afiliacion
 * @returns {Promise<boolean>} true si se subieron todos.
 */
async function escanearDocumentosObligatorios(hostOrPort, tokenOperador, { cui, idSolicitud }) {
  const ruta = idSolicitud ? `/api/operador/afiliaciones/${idSolicitud}/documentos` : '/api/admin/asociados/documentos-afiliacion';
  for (const tipo of DOCUMENTOS_OBLIGATORIOS) {
    const marca = `${cui || idSolicitud}-${tipo}-${Date.now()}-${Math.random()}`;
    const res = await makeRequest(hostOrPort, ruta, 'POST', { cui_dpi: cui, tipo_documento: tipo, archivo: pdfDePrueba(marca) }, tokenOperador);
    if (res.status !== 201) {
      console.error(`  No se pudo escanear ${tipo}:`, res.status, res.body?.message);
      return false;
    }
  }
  return true;
}

module.exports = {
  makeRequest,
  pdfDePrueba,
  escanearDocumentosObligatorios,
  poolDueno,
  borrarClienteBancoDePrueba,
  purgarDepositosDePrueba,
  purgarEfectivoDePrueba,
  purgarReversionesDePrueba,
  purgarDocumentosDePrueba,
  createTestReporter,
  HASH_ADMIN123,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
};
