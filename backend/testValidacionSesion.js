// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testValidacionSesion.js
 *
 * Las rutas HTTP y los WebSockets solo aceptan tokens de una sesión vigente:
 * - El token del segundo paso del 2FA no sirve como sesión (ni en HTTP ni en el socket).
 * - Un token sin sesión o de una sesión cerrada no autentica el socket.
 * - Solo cuentan los sockets de la sesión vigente (sesión única, alertas, presencia), y al desconectarse
 *   un socket solo cierra su propia sesión.
 * - Cerrar la sesión desde el servidor (desactivar al usuario) cierra también sus sockets.
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. Crea dos usuarios de prueba y
 * los borra al terminar.
 */
const http = require('http');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { io: Client } = require('socket.io-client');
const { server } = require('./src/server');
const socketService = require('./src/services/socketService');
const db = require('./src/config/db');

// Hash bcrypt de admin123 (el mismo de los datos semilla)
const HASH_ADMIN123 = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera hasta que la condición se cumpla o pasen `maximoMs`. Devuelve el último resultado. */
const esperarHasta = async (condicion, maximoMs = 3000) => {
  const limite = Date.now() + maximoMs;
  let resultado = await condicion();
  while (!resultado && Date.now() < limite) {
    await esperar(50);
    resultado = await condicion();
  }
  return resultado;
};

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] VALIDACIÓN DE SESIÓN EN HTTP Y WEBSOCKETS');
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

  /** Abre un socket con el token en el handshake y espera a que conecte. */
  const abrirSocket = (token) =>
    new Promise((resolve, reject) => {
      const socket = Client(`http://localhost:${port}`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  /** Envía «authenticate» y devuelve la respuesta del servidor. */
  const autenticarSocket = (socket, token) =>
    new Promise((resolve) => {
      const temporizador = setTimeout(() => resolve({ success: false, timeout: true }), 3000);
      socket.once('authenticated', (respuesta) => {
        clearTimeout(temporizador);
        resolve(respuesta);
      });
      socket.emit('authenticate', { token });
    });

  /** Escucha un evento del socket durante `ms` y dice si llegó. */
  const recibeEvento = (socket, evento, ms = 500) =>
    new Promise((resolve) => {
      const alRecibir = () => {
        clearTimeout(temporizador);
        resolve(true);
      };
      const temporizador = setTimeout(() => {
        socket.off(evento, alRecibir);
        resolve(false);
      }, ms);
      socket.once(evento, alRecibir);
    });
  const sesionEnBd = async (idUsuario) =>
    (await db.query('SELECT sesion_activa_id FROM usuarios WHERE id_usuario = $1', [idUsuario])).rows[0].sesion_activa_id;
  const estadoMe = async (token) => (await request('/api/auth/me', 'GET', null, token)).status;
  /** true si el servidor rechazó la autenticación del socket (y no solo se agotó la espera). */
  const rechazado = (respuesta) => respuesta.success === false && !respuesta.timeout;

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
  const sufijo = String(Date.now()).slice(-7);
  const codigoConDobleFactor = `OPS-${sufijo}`;
  const codigoSinDobleFactor = `OPT-${sufijo}`;
  const secreto = speakeasy.generateSecret({ length: 20 }).base32;
  const personas = [];
  const sockets = [];
  let usuarioA = null;
  let usuarioB = null;

  /** Inicia sesión con el usuario con 2FA completando el segundo paso. */
  const loginConDobleFactor = async () => {
    const paso1 = await login(codigoConDobleFactor);
    const codigo = speakeasy.totp({ secret: secreto, encoding: 'base32' });
    const paso2 = await request('/api/auth/verify-mfa', 'POST', { temp_token: paso1.body.temp_token, totp_code: codigo });
    return paso2;
  };

  try {
    const idRolOperador = (await db.query("SELECT id_rol FROM roles WHERE codigo = 'OPERADOR'")).rows[0].id_rol;
    // Usuarios de prueba: A con 2FA activo y B sin 2FA
    for (const [indice, codigo] of [[1, codigoConDobleFactor], [2, codigoSinDobleFactor]]) {
      const idPersona = (await db.query(
        `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
         VALUES ($1, 'Prueba', 'Sesion', '55559034', '1990-01-01') RETURNING id_persona`,
        [`94${indice}${sufijo}000`.slice(0, 13)]
      )).rows[0].id_persona;
      personas.push(idPersona);
      const idUsuario = (await db.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, mfa_enabled, mfa_secret)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVO', $6, $7) RETURNING id_usuario`,
        [idPersona, idRolOperador, codigo, `sesion${indice}.${sufijo}@cooperativa.com`, HASH_ADMIN123, indice === 1, indice === 1 ? secreto : null]
      )).rows[0].id_usuario;
      if (indice === 1) usuarioA = idUsuario;
      else usuarioB = idUsuario;
    }

    // ------------------------------------------------------------------
    console.log('--- 1. Token del segundo paso del 2FA ---');
    const paso1 = await login(codigoConDobleFactor);
    const tokenTemporal = paso1.body.temp_token;
    assert(paso1.status === 200 && paso1.body.mfa_required && tokenTemporal, 'Con la contraseña se recibe el token del segundo paso');

    const meTemporal = await request('/api/auth/me', 'GET', null, tokenTemporal);
    assert(meTemporal.status === 401 && !meTemporal.body.user, 'El token del segundo paso no consulta el perfil (401)');

    const desactivar = await request('/api/auth/2fa/disable', 'POST', { password: 'admin123' }, tokenTemporal);
    const mfa = (await db.query('SELECT mfa_enabled, mfa_secret FROM usuarios WHERE id_usuario = $1', [usuarioA])).rows[0];
    assert(
      desactivar.status === 401 && mfa.mfa_enabled === true && mfa.mfa_secret === secreto,
      'Con el token del segundo paso no se desactiva el 2FA'
    );

    const rutasSoloSesion = [
      ['/api/auth/2fa/setup', 'POST', null],
      ['/api/auth/2fa/enable', 'POST', { totp_code: '000000' }],
      ['/api/auth/cambiar-password', 'POST', { password_actual: 'admin123', password_nueva: 'Nueva#2026x' }],
      ['/api/auth/perfil', 'PATCH', { telefono: '55550000' }],
      ['/api/auth/2fa/status', 'GET', null],
    ];
    const respuestas = await Promise.all(rutasSoloSesion.map(([ruta, metodo, datos]) => request(ruta, metodo, datos, tokenTemporal)));
    assert(
      respuestas.every((r) => r.status === 401),
      'Tampoco sirve para enrolar el 2FA, cambiar la contraseña ni editar el perfil'
    );

    const sinSesion = jwt.sign(
      { id: usuarioA, id_usuario: usuarioA, rol: 'OPERADOR', codigo_corporativo: codigoConDobleFactor },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    assert((await request('/api/auth/me', 'GET', null, sinSesion)).status === 401, 'Un token sin sesion_activa_id no es una sesión');

    const completo = await loginConDobleFactor();
    const tokenA = completo.body.token;
    assert(
      completo.status === 200 && tokenA && (await request('/api/auth/me', 'GET', null, tokenA)).status === 200,
      'Con el código del 2FA se inicia sesión con normalidad'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 2. WebSocket con tokens que no son sesión vigente ---');
    const tokenCerrado = (await login(codigoSinDobleFactor)).body.token;
    await request('/api/auth/logout', 'POST', null, tokenCerrado);
    assert((await estadoMe(tokenCerrado)) === 401, 'El token de una sesión cerrada ya no sirve en HTTP');

    const socketCerrado = await abrirSocket(tokenCerrado);
    sockets.push(socketCerrado);
    assert(!socketService.isUserConnected(usuarioB), 'El socket con un token de sesión cerrada no queda asociado al usuario');
    const authCerrado = await autenticarSocket(socketCerrado, tokenCerrado);
    assert(rechazado(authCerrado) && !socketService.isUserConnected(usuarioB), '«authenticate» con un token de sesión cerrada se rechaza');

    const temporal2 = (await login(codigoConDobleFactor)).body.temp_token;
    const authTemporal = await autenticarSocket(socketCerrado, temporal2);
    assert(temporal2 && rechazado(authTemporal), '«authenticate» con el token del segundo paso del 2FA se rechaza');

    const loginB = await login(codigoSinDobleFactor);
    let tokenB = loginB.body.token;
    assert(loginB.status === 200, 'Un socket con token viejo no bloquea el inicio de sesión del dueño (sin 409)');
    socketCerrado.disconnect();

    // ------------------------------------------------------------------
    console.log('\n--- 3. Solo cuentan los sockets de la sesión vigente ---');
    const socketB = await abrirSocket(tokenB);
    sockets.push(socketB);
    assert(socketService.isUserConnected(usuarioB), 'El socket con la sesión vigente queda asociado al usuario');
    assert((await login(codigoSinDobleFactor)).status === 409, 'La sesión única se mantiene: un segundo inicio de sesión responde 409');

    // La sesión se cierra en la base de datos sin pasar por el logout (el socket sigue abierto)
    await db.query('UPDATE usuarios SET sesion_activa_id = NULL WHERE id_usuario = $1', [usuarioB]);
    const alertaAlSocketViejo = recibeEvento(socketB, 'security_alert');
    const nuevoLogin = await login(codigoSinDobleFactor);
    const otroLogin = await login(codigoSinDobleFactor);
    assert(
      nuevoLogin.status === 200 && otroLogin.status === 200 && !(await alertaAlSocketViejo),
      'Un socket de una sesión ya cerrada no provoca 409 ni recibe las alertas de la sesión nueva'
    );
    tokenB = otroLogin.body.token;
    const sesionVigente = await sesionEnBd(usuarioB);

    const pong = recibeEvento(socketB, 'pong_presencia');
    socketB.emit('ping_presencia');
    assert(!(await pong), 'El ping de un socket de una sesión cerrada no cuenta como presencia');

    socketB.disconnect();
    await esperarHasta(() => !socketService.isUserConnected(usuarioB));
    await esperar(200); // margen para el UPDATE condicionado de la desconexión
    assert(
      (await sesionEnBd(usuarioB)) === sesionVigente && (await estadoMe(tokenB)) === 200,
      'Al desconectarse, un socket de una sesión cerrada no cierra la sesión nueva'
    );

    // ------------------------------------------------------------------
    console.log('\n--- 4. Cerrar la sesión desde el servidor cierra sus sockets ---');
    const socketVigente = await abrirSocket(tokenB);
    sockets.push(socketVigente);
    const tokenAdmin = (await login('AD-1')).body.token;
    const desactivado = await request(
      `/api/usuarios/${usuarioB}/estado`,
      'PATCH',
      { estado: 'INACTIVO', motivo: 'Prueba de cierre de sesión' },
      tokenAdmin
    );
    const socketCerradoPorServidor = await esperarHasta(() => !socketVigente.connected && !socketService.isUserConnected(usuarioB));
    assert(desactivado.status === 200 && socketCerradoPorServidor, 'Desactivar al usuario cierra sus sockets');
    await request(`/api/usuarios/${usuarioB}/estado`, 'PATCH', { estado: 'ACTIVO' }, tokenAdmin);
    await request('/api/auth/logout', 'POST', null, tokenAdmin);
    const tokenB2 = (await login(codigoSinDobleFactor)).body.token;
    assert(tokenB2 && (await estadoMe(tokenB2)) === 200, 'Al reactivarlo, inicia sesión sin 409');

    // ------------------------------------------------------------------
    console.log('\n--- 5. Reautenticación y cierre de la sesión ---');
    const socketCambio = await abrirSocket(tokenB2);
    sockets.push(socketCambio);
    const authA = await autenticarSocket(socketCambio, tokenA);
    assert(
      authA.success === true && socketService.isUserConnected(usuarioA) && !socketService.isUserConnected(usuarioB),
      'Al autenticarse con otro usuario, el socket deja de contar para el anterior'
    );

    socketCambio.disconnect();
    assert(
      await esperarHasta(async () => (await estadoMe(tokenA)) === 401),
      'Al cerrar el último socket de la sesión vigente, la sesión termina (como antes)'
    );
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    total++;
  } finally {
    sockets.forEach((socket) => socket.connected && socket.disconnect());
    if (personas.length) {
      try {
        await db.query(
          'DELETE FROM historial_estados_usuario WHERE id_usuario_modificado IN (SELECT id_usuario FROM usuarios WHERE id_persona = ANY($1))',
          [personas]
        );
        await db.query('DELETE FROM usuarios WHERE id_persona = ANY($1)', [personas]);
        await db.query('DELETE FROM personas WHERE id_persona = ANY($1)', [personas]);
        console.log('\n  [CLEANUP] Usuarios y personas de prueba eliminados.');
      } catch (limpiezaError) {
        console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      }
    }

    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total ? 0 : 1);
  }
});
