// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testErroresVarios.js
 *
 * - Un cuerpo JSON mal formado responde 400 en la cooperativa y en el banco (antes, 500).
 * - El listado de usuarios no devuelve la sesión activa, el último ping ni los datos del bloqueo; sí la presencia y si
 *   la cuenta está congelada. El inicio de sesión tampoco repite el identificador de la sesión.
 * - El correo de usuarios es único sin distinguir mayúsculas solo por `uq_usuarios_email_lower` (#72).
 * - La bandeja de afiliaciones muestra una sola vez la solicitud de alguien con varias cuentas activas.
 */
const http = require('http');
const { server } = require('./src/server');
const db = require('./src/config/db');
const {
  makeRequest,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  poolDueno,
} = require('./testHelper');

/** POST con un cuerpo crudo (sin pasar por JSON.stringify), para mandar JSON mal formado. */
const postCrudo = (port, ruta, cuerpo, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: ruta,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo), ...headers },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch { /* el cuerpo puede no ser JSON */ }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] ERRORES VARIOS');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-7);
  const personas = [];
  const tokens = [];
  let idSolicitud = null;
  let errorInesperado = false;

  try {
    // -------------------------------------------------------------------------
    console.log('--- 1. JSON mal formado ---');
    const coop = await postCrudo(port, '/api/auth/login', '{"identifier":"OP-1",');
    assert(coop.status === 400 && coop.body?.message === 'La solicitud no tiene un formato válido.',
      'La cooperativa responde 400 a un cuerpo JSON mal formado');
    const banco = await postCrudo(5002, '/api/banco/v1/cuentas/debitar', '{"monto":', {
      'x-banco-api-key': process.env.BANCO_INTERNAL_API_KEY || '',
    });
    assert(banco.status === 400, 'El banco responde 400 a un cuerpo JSON mal formado');

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Listado de usuarios ---');
    const admin = await crearUsuarioDePrueba(db, {
      dpi: `971${sufijo}000`.slice(0, 13), codigo: `AD-TEV${sufijo}`, email: `ad.varios.${sufijo}@example.com`, rol: 'ADMINISTRADOR',
    });
    personas.push(admin.idPersona);
    const loginAdmin = await request('/api/auth/login', 'POST', { identifier: `AD-TEV${sufijo}`, password: 'admin123' });
    const tokenAdmin = loginAdmin.body.token;
    if (tokenAdmin) tokens.push(tokenAdmin);
    assert(loginAdmin.status === 200 && tokenAdmin && !('sesion_activa_id' in loginAdmin.body),
      'El inicio de sesión no repite el identificador de la sesión (va dentro del token)');
    const usuarios = await request('/api/usuarios', 'GET', null, tokenAdmin);
    const lista = usuarios.body.data || [];
    const internos = ['sesion_activa_id', 'ultimo_ping', 'bloqueado_hasta', 'intentos_fallidos'];
    assert(usuarios.status === 200 && lista.length > 0 && lista.every((u) => internos.every((campo) => !(campo in u))),
      'El listado no devuelve la sesión activa, el último ping ni los datos del bloqueo');
    const yo = lista.find((u) => u.codigo_corporativo === `AD-TEV${sufijo}`);
    assert(yo && yo.en_linea !== undefined && yo.bloqueado_por_intentos === false,
      'Sigue devolviendo la presencia y si la cuenta está congelada');

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Correo único sin distinguir mayúsculas ---');
    const restricciones = (await db.query(
      `SELECT (SELECT count(*)::int FROM pg_constraint WHERE conname = 'usuarios_email_key') AS vieja,
              (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'uq_usuarios_email_lower') AS nueva`
    )).rows[0];
    assert(restricciones.vieja === 0 && restricciones.nueva === 1,
      'Queda solo el índice por LOWER(email); la restricción que distingue mayúsculas ya no existe');
    // Usuario de asociado para la misma persona (no tiene uno): lo único que puede chocar es el correo
    const repetido = await db.pool.connect();
    let errorRepetido = null;
    try {
      await repetido.query('BEGIN');
      await repetido.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
         VALUES ($1, (SELECT id_rol FROM roles WHERE codigo = 'ASOCIADO'), $2, $3, 'x', 'ACTIVO')`,
        [admin.idPersona, `EX-TEVM${sufijo}`, `AD.VARIOS.${sufijo}@EXAMPLE.COM`]
      );
    } catch (error) {
      errorRepetido = error;
    } finally {
      await repetido.query('ROLLBACK').catch(() => {});
      repetido.release();
    }
    assert(errorRepetido?.code === '23505' && errorRepetido.constraint === 'uq_usuarios_email_lower',
      'Un correo que solo cambia en mayúsculas lo rechaza uq_usuarios_email_lower (23505)');

    // -------------------------------------------------------------------------
    console.log('\n--- 4. Bandeja de afiliaciones ---');
    // Una asociada con dos cuentas activas pide afiliarse en agencia con su DPI
    const dpiAsociada = `972${sufijo}000`.slice(0, 13);
    const asociada = await crearUsuarioDePrueba(db, {
      dpi: dpiAsociada, codigo: `EX-TEV${sufijo}`, email: `ex.varios.${sufijo}@example.com`, rol: 'ASOCIADO', asociado: true,
    });
    personas.push(asociada.idPersona);
    for (const n of [1, 2]) {
      await db.query(
        "INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, estado) VALUES ($1, $2, 2, 100, 'ACTIVA')",
        [`CTA-TEV-${sufijo}-${n}`, asociada.idAsociado]
      );
    }
    idSolicitud = (await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (cui_dpi, primer_nombre, primer_apellido, fecha_nacimiento, telefono, email)
       VALUES ($1, 'Prueba', 'Automatizada', '1990-01-01', '55550000', $2) RETURNING id_solicitud`,
      [dpiAsociada, `solicitud.varios.${sufijo}@example.com`]
    )).rows[0].id_solicitud;
    const operador = await crearUsuarioDePrueba(db, {
      dpi: `973${sufijo}000`.slice(0, 13), codigo: `OP-TEV${sufijo}`, email: `op.varios.${sufijo}@example.com`, rol: 'OPERADOR',
    });
    personas.unshift(operador.idPersona);
    const loginOperador = await request('/api/auth/login', 'POST', { identifier: `OP-TEV${sufijo}`, password: 'admin123' });
    if (loginOperador.body.token) tokens.push(loginOperador.body.token);
    const bandeja = await request('/api/operador/afiliaciones', 'GET', null, loginOperador.body.token);
    const filas = (bandeja.body.data || []).filter((a) => a.id_solicitud === idSolicitud);
    assert(bandeja.status === 200 && filas.length === 1 && filas[0].ya_es_asociado === true,
      `La solicitud de alguien con dos cuentas activas aparece una sola vez (${filas.length})`);
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    try {
      if (idSolicitud) {
        await poolDueno(db.pool).query('DELETE FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1', [idSolicitud]);
      }
      for (const idPersona of personas) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }
    await poolDueno(db.pool).end();

    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
