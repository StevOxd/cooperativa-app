// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testUsers.js
 *
 * CRUD de usuarios del personal desde «Usuarios»: listado y filtros, alta con contraseña temporal que nunca
 * viaja en la respuesta, edición, borrado lógico y acceso del usuario desactivado.
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. Limpia lo que crea.
 */
const { app } = require('./src/server');
const db = require('./src/config/db');
const { makeRequest, createTestReporter, HASH_ADMIN123, borrarPersonaDePrueba } = require('./testHelper');

const server = app.listen(0, async () => {
  const port = server.address().port;
  const request = (ruta, method = 'GET', data = null, token = null) => makeRequest(port, ruta, method, data, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] CRUD DE USUARIOS');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const dpi = `942${sufijo}000`.slice(0, 13);
  const tokens = [];
  let idPersonaCreada = null;
  let errorInesperado = false;

  try {
    console.log('--- Acceso ---');
    const sinToken = await request('/api/usuarios');
    assert(sinToken.status === 401, 'GET /api/usuarios sin token responde 401');

    const login = await request('/api/auth/login', 'POST', { identifier: 'AD-1', password: 'admin123' });
    const token = login.body.token;
    assert(login.status === 200 && Boolean(token), 'El administrador AD-1 inicia sesión');
    if (!token) throw new Error('Sin token de administrador no se puede seguir.');
    tokens.push(token);

    console.log('\n--- Listado ---');
    const todos = await request('/api/usuarios', 'GET', null, token);
    assert(todos.status === 200 && Array.isArray(todos.body.data) && todos.body.data.length > 0, 'Lista los usuarios');
    const activos = await request('/api/usuarios?estado=ACTIVO', 'GET', null, token);
    assert(
      activos.status === 200 && activos.body.data.every((u) => u.estado === 'ACTIVO'),
      'El filtro ?estado=ACTIVO solo devuelve usuarios activos'
    );

    console.log('\n--- Alta ---');
    const alta = await request('/api/usuarios', 'POST', {
      primer_nombre: 'Prueba',
      primer_apellido: 'Usuarios',
      cui_dpi: dpi,
      telefono: '55550001',
      fecha_nacimiento: '1990-01-01',
      email: `test.usuarios.${sufijo}@cooperativa.com`,
      rol: 'OPERADOR',
      estado: 'ACTIVO',
    }, token);
    const creado = alta.body.data || {};
    idPersonaCreada = creado.id_persona || null;
    assert(alta.status === 201 && /^OP-\d+$/.test(creado.codigo_corporativo || ''), 'Crea el operador con el siguiente código OP-N');
    // Ninguna clave de la respuesta (a cualquier nivel) puede llevar el texto de una contraseña o un secreto;
    // las banderas como debe_cambiar_password (booleanas) sí pueden viajar
    const clavesSensibles = [];
    const revisar = (valor) => {
      if (!valor || typeof valor !== 'object') return;
      for (const [clave, interno] of Object.entries(valor)) {
        if (/pass|contrase|clave|secret/i.test(clave) && typeof interno === 'string') clavesSensibles.push(clave);
        revisar(interno);
      }
    };
    revisar(alta.body);
    assert(
      clavesSensibles.length === 0 && alta.body.correo_enviado === false,
      `La contraseña temporal no viaja en la respuesta y se informa que el correo no salió${clavesSensibles.length ? ` (claves: ${clavesSensibles.join(', ')})` : ''}`
    );
    const enBase = (await db.query('SELECT debe_cambiar_password FROM usuarios WHERE id_usuario = $1', [creado.id_usuario])).rows[0];
    assert(enBase?.debe_cambiar_password === true, 'El usuario nuevo debe cambiar su contraseña al entrar');

    // La contraseña temporal solo va por correo: para entrar con él se le pone una conocida
    await db.query('UPDATE usuarios SET password_hash = $1, debe_cambiar_password = false WHERE id_usuario = $2', [HASH_ADMIN123, creado.id_usuario]);
    const loginNuevo = await request('/api/auth/login', 'POST', { identifier: creado.codigo_corporativo, password: 'admin123' });
    assert(loginNuevo.status === 200 && Boolean(loginNuevo.body.token), 'El usuario nuevo entra con su código corporativo');
    if (loginNuevo.body.token) tokens.push(loginNuevo.body.token);

    console.log('\n--- Edición ---');
    const edicion = await request(`/api/usuarios/${creado.id_usuario}`, 'PUT', { cui_dpi: dpi, telefono: '55550002' }, token);
    const telefono = (await db.query('SELECT telefono FROM personas WHERE id_persona = $1', [idPersonaCreada])).rows[0]?.telefono;
    assert(edicion.status === 200 && telefono === '55550002', 'Edita los datos de la persona');

    console.log('\n--- Borrado lógico ---');
    const baja = await request(`/api/usuarios/${creado.id_usuario}`, 'DELETE', null, token);
    assert(baja.status === 200 && baja.body.data?.estado === 'INACTIVO', 'DELETE /api/usuarios/:id lo deja INACTIVO');
    const sigue = (await db.query('SELECT estado FROM usuarios WHERE id_usuario = $1', [creado.id_usuario])).rows[0];
    assert(sigue?.estado === 'INACTIVO', 'El registro sigue en la base de datos (sin DELETE físico)');
    const sesionDelNuevo = await request('/api/auth/me', 'GET', null, loginNuevo.body.token);
    assert(sesionDelNuevo.status === 401 || sesionDelNuevo.status === 403, 'La sesión del usuario desactivado deja de servir');
    const loginInactivo = await request('/api/auth/login', 'POST', { identifier: creado.codigo_corporativo, password: 'admin123' });
    assert(loginInactivo.status === 403 && !loginInactivo.body.token, 'El usuario desactivado no puede entrar (403)');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      if (!idPersonaCreada) {
        idPersonaCreada = (await db.query('SELECT id_persona FROM personas WHERE cui_dpi = $1', [dpi])).rows[0]?.id_persona || null;
      }
      if (idPersonaCreada) await borrarPersonaDePrueba(db, idPersonaCreada);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }

    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    server.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
