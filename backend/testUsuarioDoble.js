// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testUsuarioDoble.js
 *
 * Issue #32, parte 1: cada usuario tiene su propia llave (usuarios.id_usuario) y una persona puede
 * tener un usuario del personal y uno de asociado. Prueba con una persona con los dos usuarios,
 * cuyos id_usuario no coinciden con su id_persona (los usuarios anteriores a la migración sí).
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. Limpia lo que crea.
 */
const http = require('http');
const jwt = require('jsonwebtoken');
const { server } = require('./src/server');
const db = require('./src/config/db');

// Hash bcrypt de admin123 (el mismo de los datos semilla)
const HASH_ADMIN123 = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] USUARIO DEL PERSONAL Y DE ASOCIADO PARA UNA PERSONA (#32)');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const request = (path, method = 'GET', data = null, token = null) =>
    new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (data) headers['Content-Length'] = Buffer.byteLength(payload);
      const req = http.request({ hostname: 'localhost', port, path, method, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      });
      req.on('error', reject);
      if (data) req.write(payload);
      req.end();
    });

  let total = 0;
  let passed = 0;
  const assert = (condition, title) => {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${title}`);
    } else {
      console.error(`  [FAIL] ${title}`);
    }
  };

  const login = (identifier) => request('/api/auth/login', 'POST', { identifier, password: 'admin123' });
  const usuario = async (idUsuario) =>
    (await db.query('SELECT estado FROM usuarios WHERE id_usuario = $1', [idUsuario])).rows[0];

  const sufijo = String(Date.now()).slice(-7);
  const dpi = `932${sufijo}000`.slice(0, 13);
  const codigoPersonal = `OPT32-${sufijo}`;
  const codigoAsociado = `EXT32-${sufijo}`;
  const dpiSoloPersonal = `933${sufijo}000`.slice(0, 13);
  let idPersona = null;
  let idPersonaSoloPersonal = null;
  let personal = null;
  let asociadoUsuario = null;
  let idAsociado = null;
  const tokensAbiertos = [];

  try {
    // ------------------------------------------------------------------
    console.log('--- 1. Esquema ---');
    const pk = await db.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'usuarios_pkey'"
    );
    assert(pk.rows[0]?.def === 'PRIMARY KEY (id_usuario)', 'La llave primaria de usuarios es id_usuario');

    const fks = await db.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'usuarios'::regclass`
    );
    assert(
      fks.rows.length >= 10 && fks.rows.every((r) => r.def.includes('REFERENCES usuarios(id_usuario)')),
      `Las ${fks.rows.length} llaves foráneas hacia usuarios apuntan a id_usuario`
    );

    const indices = await db.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'usuarios' AND indexname = 'uq_usuarios_persona_tipo'"
    );
    assert(
      /UNIQUE INDEX .* \(id_persona, \(\(id_rol = 3\)\)\)/.test(indices.rows[0]?.indexdef || ''),
      'Existe el índice de un usuario del personal y uno de asociado por persona (cubre la FK)'
    );

    const semilla = await db.query(
      `SELECT COUNT(*) FILTER (WHERE id_usuario = id_persona)::int AS iguales, COUNT(*)::int AS total
       FROM usuarios WHERE codigo_corporativo IN ('AD-1', 'AD-2', 'EJ-1', 'OP-1', 'OP-2')`
    );
    assert(
      semilla.rows[0].total === 5 && semilla.rows[0].iguales === 5,
      'Los usuarios anteriores conservan id_usuario = id_persona'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 2. Una persona con dos usuarios ---');
    idPersona = (await db.query(
      `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
       VALUES ($1, 'Prueba', 'Doble', '55559032', '1990-01-01') RETURNING id_persona`,
      [dpi]
    )).rows[0].id_persona;
    // Se adelanta la secuencia para que los id_usuario no coincidan con el id_persona.
    await db.query(
      "SELECT setval('usuarios_id_usuario_seq', GREATEST((SELECT last_value FROM usuarios_id_usuario_seq), $1 + 10))",
      [idPersona]
    );
    personal = (await db.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
       VALUES ($1, 2, $2, $3, $4, 'ACTIVO') RETURNING id_usuario`,
      [idPersona, codigoPersonal, `personal.${sufijo}@cooperativa.com`, HASH_ADMIN123]
    )).rows[0];
    idAsociado = (await db.query(
      "INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO') RETURNING id_asociado",
      [idPersona]
    )).rows[0].id_asociado;
    asociadoUsuario = (await db.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
       VALUES ($1, 3, $2, $3, $4, 'ACTIVO') RETURNING id_usuario`,
      [idPersona, codigoAsociado, `asociado.${sufijo}@gmail.com`, HASH_ADMIN123]
    )).rows[0];
    assert(
      personal.id_usuario !== idPersona && asociadoUsuario.id_usuario !== idPersona,
      `Los dos usuarios (${personal.id_usuario} y ${asociadoUsuario.id_usuario}) tienen id distinto de la persona (${idPersona})`
    );

    let rechazado = null;
    try {
      await db.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash)
         VALUES ($1, 4, $2, $3, $4)`,
        [idPersona, `EJT32-${sufijo}`, `ejecutivo.${sufijo}@cooperativa.com`, HASH_ADMIN123]
      );
    } catch (error) {
      rechazado = error;
    }
    assert(
      rechazado?.code === '23505' && rechazado.constraint === 'uq_usuarios_persona_tipo',
      'Un segundo usuario del personal para la misma persona se rechaza'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 3. Sesiones independientes ---');
    const loginPersonal = await login(codigoPersonal);
    const loginAsociado = await login(codigoAsociado);
    assert(loginPersonal.status === 200 && loginAsociado.status === 200, 'Los dos usuarios inician sesión a la vez (sin 409)');
    const tokenPersonal = loginPersonal.body.token;
    let tokenAsociado = loginAsociado.body.token;
    tokensAbiertos.push(tokenPersonal);

    const cargaPersonal = jwt.decode(tokenPersonal);
    const cargaAsociado = jwt.decode(tokenAsociado);
    assert(
      cargaPersonal.id_usuario === personal.id_usuario && cargaPersonal.id === personal.id_usuario
        && cargaPersonal.id_persona === idPersona,
      'El token del personal lleva su id_usuario y el id_persona de la persona'
    );
    assert(
      cargaAsociado.id_usuario === asociadoUsuario.id_usuario && cargaAsociado.id_persona === idPersona,
      'El token del asociado lleva su propio id_usuario y la misma persona'
    );

    const mePersonal = await request('/api/auth/me', 'GET', null, tokenPersonal);
    const meAsociado = await request('/api/auth/me', 'GET', null, tokenAsociado);
    assert(
      mePersonal.body.user?.codigo_corporativo === codigoPersonal && meAsociado.body.user?.codigo_corporativo === codigoAsociado,
      '/auth/me devuelve el usuario de cada sesión'
    );

    const perfil = await request('/api/asociado/perfil', 'GET', null, tokenAsociado);
    assert(
      perfil.status === 200 && perfil.body.data?.codigo_corporativo === codigoAsociado,
      'El portal del asociado muestra su usuario de asociado, no el del personal'
    );
    const perfilDesdePersonal = await request('/api/asociado/perfil', 'GET', null, tokenPersonal);
    assert(perfilDesdePersonal.status === 403, 'Con el usuario del personal no se entra al portal del asociado');

    const logoutAsociado = await request('/api/auth/logout', 'POST', null, tokenAsociado);
    const tras = await request('/api/auth/me', 'GET', null, tokenAsociado);
    const personalSigue = await request('/api/auth/me', 'GET', null, tokenPersonal);
    assert(
      logoutAsociado.status === 200 && tras.status === 401 && personalSigue.status === 200,
      'Cerrar la sesión del asociado no cierra la del personal'
    );
    tokenAsociado = (await login(codigoAsociado)).body.token;
    tokensAbiertos.push(tokenAsociado);

    // ------------------------------------------------------------------
    console.log('\n--- 4. Estados separados ---');
    const tokenOperador = (await login('OP-1')).body.token;
    tokensAbiertos.push(tokenOperador);
    const suspender = await request(`/api/admin/asociados/${idAsociado}/estado`, 'PATCH', { estado: 'SUSPENDIDO' }, tokenOperador);
    assert(
      suspender.status === 200
        && (await usuario(asociadoUsuario.id_usuario)).estado === 'INACTIVO'
        && (await usuario(personal.id_usuario)).estado === 'ACTIVO',
      'Suspender la afiliación desactiva solo el usuario de asociado'
    );
    assert(
      (await request('/api/auth/me', 'GET', null, tokenPersonal)).status === 200,
      'El usuario del personal sigue trabajando con la afiliación suspendida'
    );
    await request(`/api/admin/asociados/${idAsociado}/estado`, 'PATCH', { estado: 'ACTIVO' }, tokenOperador);
    assert((await usuario(asociadoUsuario.id_usuario)).estado === 'ACTIVO', 'Reactivar la afiliación reactiva su usuario de asociado');

    const tokenAdmin = (await login('AD-1')).body.token;
    tokensAbiertos.push(tokenAdmin);
    const idAdmin = jwt.decode(tokenAdmin).id_usuario;

    const detalle = await request(`/api/usuarios/${asociadoUsuario.id_usuario}`, 'GET', null, tokenAdmin);
    assert(
      detalle.status === 200 && detalle.body.data?.codigo_corporativo === codigoAsociado && detalle.body.data?.id === asociadoUsuario.id_usuario,
      'Gestión de usuarios identifica a cada usuario por id_usuario'
    );

    const desactivar = await request(
      `/api/usuarios/${personal.id_usuario}/estado`,
      'PATCH',
      { estado: 'INACTIVO', motivo: 'Prueba #32: deja de ser empleado' },
      tokenAdmin
    );
    const membresia = (await db.query('SELECT estado_asociado FROM asociados WHERE id_asociado = $1', [idAsociado])).rows[0];
    assert(
      desactivar.status === 200
        && (await usuario(personal.id_usuario)).estado === 'INACTIVO'
        && (await usuario(asociadoUsuario.id_usuario)).estado === 'ACTIVO'
        && membresia.estado_asociado === 'ACTIVO',
      'Desactivar al colaborador no toca su usuario de asociado ni su afiliación'
    );
    assert(
      (await request('/api/asociado/perfil', 'GET', null, tokenAsociado)).status === 200,
      'Como asociado sigue entrando al portal'
    );

    const auditoria = (await db.query(
      `SELECT id_usuario_modificado, id_modificado_por FROM historial_estados_usuario
       WHERE motivo = 'Prueba #32: deja de ser empleado'`
    )).rows[0];
    assert(
      auditoria?.id_usuario_modificado === personal.id_usuario && auditoria?.id_modificado_por === idAdmin,
      'La auditoría guarda el id_usuario del usuario modificado y del administrador'
    );

    const cambioRol = await request(`/api/usuarios/${asociadoUsuario.id_usuario}`, 'PUT', { rol: 'OPERADOR' }, tokenAdmin);
    assert(
      cambioRol.status === 409 && (await db.query('SELECT id_rol FROM usuarios WHERE id_usuario = $1', [asociadoUsuario.id_usuario])).rows[0].id_rol === 3,
      'Convertir al usuario de asociado en personal se rechaza (la persona ya tiene uno)'
    );

    await request(`/api/usuarios/${personal.id_usuario}/estado`, 'PATCH', { estado: 'ACTIVO' }, tokenAdmin);
    assert(
      (await usuario(personal.id_usuario)).estado === 'ACTIVO' && (await usuario(asociadoUsuario.id_usuario)).estado === 'ACTIVO',
      'Reactivar al colaborador solo cambia su usuario del personal'
    );

    await db.query(
      "UPDATE usuarios SET intentos_fallidos = 3, bloqueado_hasta = NOW() + INTERVAL '15 minutes' WHERE id_persona = $1",
      [idPersona]
    );
    const desbloqueo = await request(`/api/usuarios/${personal.id_usuario}/desbloquear`, 'PATCH', null, tokenAdmin);
    const bloqueos = (await db.query(
      'SELECT id_usuario, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id_persona = $1',
      [idPersona]
    )).rows;
    const bloqueoDe = (id) => bloqueos.find((u) => u.id_usuario === id);
    assert(
      desbloqueo.status === 200
        && bloqueoDe(personal.id_usuario).intentos_fallidos === 0 && !bloqueoDe(personal.id_usuario).bloqueado_hasta
        && bloqueoDe(asociadoUsuario.id_usuario).intentos_fallidos === 3,
      'Desbloquear por id_usuario desbloquea solo ese usuario'
    );
    await db.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1', [asociadoUsuario.id_usuario]);

    const baja = await request(`/api/usuarios/${personal.id_usuario}`, 'DELETE', null, tokenAdmin);
    const membresiaTrasBaja = (await db.query('SELECT estado_asociado FROM asociados WHERE id_asociado = $1', [idAsociado])).rows[0];
    assert(
      baja.status === 200
        && (await usuario(personal.id_usuario)).estado === 'INACTIVO'
        && (await usuario(asociadoUsuario.id_usuario)).estado === 'ACTIVO'
        && membresiaTrasBaja.estado_asociado === 'ACTIVO',
      'Dar de baja al colaborador no toca su usuario de asociado ni su afiliación'
    );

    await request(
      `/api/usuarios/${asociadoUsuario.id_usuario}/estado`,
      'PATCH',
      { estado: 'INACTIVO', motivo: 'Prueba #32: baja del asociado' },
      tokenAdmin
    );
    const membresiaInactiva = (await db.query('SELECT estado_asociado FROM asociados WHERE id_asociado = $1', [idAsociado])).rows[0];
    await request(`/api/usuarios/${asociadoUsuario.id_usuario}/estado`, 'PATCH', { estado: 'ACTIVO' }, tokenAdmin);
    const membresiaActiva = (await db.query('SELECT estado_asociado FROM asociados WHERE id_asociado = $1', [idAsociado])).rows[0];
    assert(
      membresiaInactiva.estado_asociado === 'INACTIVO' && membresiaActiva.estado_asociado === 'ACTIVO'
        && (await usuario(personal.id_usuario)).estado === 'INACTIVO',
      'El estado del usuario de asociado arrastra su afiliación, y no toca al del personal'
    );

    const expediente = await request(`/api/admin/asociados/${idAsociado}/expediente`, 'GET', null, tokenOperador);
    assert(
      expediente.status === 200
        && expediente.body.data?.asociado?.codigo_corporativo === codigoAsociado
        && expediente.body.data?.asociado?.acceso_portal === 'ACTIVO',
      'El expediente muestra el usuario de asociado de la persona (no PERSONAL)'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 4.1 Personal sin usuario de asociado (hasta la parte 2) ---');
    idPersonaSoloPersonal = (await db.query(
      `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
       VALUES ($1, 'Prueba', 'Personal', '55559033', '1991-01-01') RETURNING id_persona`,
      [dpiSoloPersonal]
    )).rows[0].id_persona;
    await db.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
       VALUES ($1, 2, $2, $3, $4, 'ACTIVO')`,
      [idPersonaSoloPersonal, `OPU32-${sufijo}`, `solo.personal.${sufijo}@cooperativa.com`, HASH_ADMIN123]
    );
    const idSolicitud = (await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
       VALUES ($1, 'Prueba', 'Personal', '55559033', '1991-01-01', $2, 'PENDIENTE_AGENCIA') RETURNING id_solicitud`,
      [dpiSoloPersonal, `solicitud.${sufijo}@gmail.com`]
    )).rows[0].id_solicitud;
    const formalizar = await request(
      `/api/operador/afiliaciones/${idSolicitud}/formalizar`,
      'POST',
      { monto_aportacion: 100, crear_acceso_portal: false },
      tokenOperador
    );
    const socioCreado = await db.query('SELECT 1 FROM asociados WHERE id_persona = $1', [idPersonaSoloPersonal]);
    assert(
      formalizar.status === 409 && formalizar.body.message?.includes('usuario del personal') && socioCreado.rows.length === 0,
      'Formalizar en agencia el DPI de alguien del personal sigue rechazándose'
    );

    const idAsociadoSoloPersonal = (await db.query(
      "INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO') RETURNING id_asociado",
      [idPersonaSoloPersonal]
    )).rows[0].id_asociado;
    const expedientePersonal = await request(`/api/admin/asociados/${idAsociadoSoloPersonal}/expediente`, 'GET', null, tokenOperador);
    const activarPersonal = await request(
      `/api/admin/asociados/${idAsociadoSoloPersonal}/acceso-portal`,
      'POST',
      { email: `otro.${sufijo}@gmail.com` },
      tokenOperador
    );
    assert(
      expedientePersonal.body.data?.asociado?.acceso_portal === 'PERSONAL'
        && activarPersonal.status === 409 && activarPersonal.body.error === 'USUARIO_PERSONAL',
      'Con solo usuario del personal, el expediente indica PERSONAL y no se activa el acceso'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 5. Sesiones abiertas antes del cambio ---');
    const loginAd2 = await login('AD-2');
    const cargaAd2 = jwt.decode(loginAd2.body.token);
    // Token con el formato anterior: sin id_usuario (entonces id e id_persona valían lo mismo)
    const tokenAnterior = jwt.sign(
      {
        id: cargaAd2.id_persona,
        id_persona: cargaAd2.id_persona,
        codigo_corporativo: 'AD-2',
        rol: 'ADMINISTRADOR',
        sesion_activa_id: cargaAd2.sesion_activa_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    const meAnterior = await request('/api/auth/me', 'GET', null, tokenAnterior);
    assert(
      meAnterior.status === 200 && meAnterior.body.user?.codigo_corporativo === 'AD-2',
      'Un token emitido antes del cambio (sin id_usuario) sigue funcionando'
    );
    await request('/api/auth/logout', 'POST', null, loginAd2.body.token);
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    total++;
  } finally {
    for (const token of tokensAbiertos) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    await db.query('DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = $1', [dpiSoloPersonal]);
    for (const id of [idPersona, idPersonaSoloPersonal].filter(Boolean)) {
      await db.query(
        `DELETE FROM historial_estados_usuario
         WHERE id_usuario_modificado IN (SELECT id_usuario FROM usuarios WHERE id_persona = $1)`,
        [id]
      );
      await db.query('DELETE FROM usuarios WHERE id_persona = $1', [id]);
      await db.query('DELETE FROM asociados WHERE id_persona = $1', [id]);
      await db.query('DELETE FROM personas WHERE id_persona = $1', [id]);
    }
    if (idPersona) console.log('\n  [CLEANUP] Personas, usuarios y solicitud de prueba eliminados.');

    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total ? 0 : 1);
  }
});
