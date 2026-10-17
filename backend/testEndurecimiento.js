// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';
// Código de verificación de correo fijo para las pruebas (codigoVerificacionService)
process.env.CODIGO_VERIFICACION_DEV = '246810';

/**
 * testEndurecimiento.js
 *
 * - La solicitud en agencia no revela el número de caso de otra solicitud.
 * - Los errores inesperados responden con un mensaje genérico; los de negocio, con el suyo.
 * - La descarga de documentos exige una sesión vigente y un asociado solo descarga los suyos.
 * - La presencia en tiempo real solo llega a los administradores con sesión.
 * - El DPI de una persona no se cambia desde «Usuarios» y los cambios de sus datos quedan auditados.
 * - Cambiar el estado de un usuario cierra su sesión.
 * - El banco identifica las cuentas solo por su número.
 *
 * Usa el backend en proceso (puerto efímero), el banco y la base de datos locales. Limpia lo que crea.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { io: Client } = require('socket.io-client');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { errorDeNegocio, respuestaDeError } = require('./src/utils/errores');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hash bcrypt de admin123 (el mismo de los datos semilla)
const HASH_ADMIN123 = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] ENDURECIMIENTO GENERAL');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const request = (ruta, method = 'GET', data = null, token = null) =>
    new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (data) headers['Content-Length'] = Buffer.byteLength(payload);
      const req = http.request({ hostname: 'localhost', port, path: ruta, method, headers }, (res) => {
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
  const sufijo = String(Date.now()).slice(-7);
  const dpiSolicitud = `938${sufijo}000`.slice(0, 13);
  const archivo = `doc_endurecimiento_${sufijo}.pdf`;
  const rutaArchivo = path.join(__dirname, 'uploads', 'creditos', archivo);
  const sockets = [];
  const tokens = [];
  let personaOriginalOp2 = null;
  let idUsuarioOp2 = null;
  let ultimoHistorialPrevio = 0;
  let idPersonaAsociado = null;
  const codigoAsociado = `EX-8${sufijo}`;

  try {
    // ------------------------------------------------------------------
    console.log('--- Solicitud en agencia ---');
    await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
       VALUES ($1, 'Titular', 'Original', '55559038', '1990-01-01', $2, 'PENDIENTE_AGENCIA')`,
      [dpiSolicitud, `titular.${sufijo}@gmail.com`]
    );
    const numeroCaso = (await db.query('SELECT numero_caso FROM solicitudes_afiliacion_agencia WHERE cui_dpi = $1', [dpiSolicitud])).rows[0].numero_caso;
    // Quien escribe confirma un correo suyo cualquiera: eso no lo identifica como el titular del DPI
    const correoAjeno = `otra.${sufijo}@gmail.com`;
    await request('/api/afiliacion/codigo-correo', 'POST', { email: correoAjeno });
    const ajena = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiSolicitud,
      primer_nombre: 'Otra',
      primer_apellido: 'Persona',
      fecha_nacimiento: '1990-01-01',
      telefono: '55551234',
      email: correoAjeno,
      codigo_verificacion: '246810',
    });
    assert(
      ajena.status === 409 && ajena.body.error === 'SOLICITUD_EN_TRAMITE' && !JSON.stringify(ajena.body).includes(numeroCaso),
      'Con el DPI de una solicitud en trámite no se revela su número de caso'
    );
    const otraVez = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiSolicitud,
      primer_nombre: 'Otra',
      primer_apellido: 'Persona',
      fecha_nacimiento: '1990-01-01',
      telefono: '55551234',
      email: correoAjeno,
      codigo_verificacion: '246810',
    });
    assert(otraVez.status === 400 && otraVez.body.error === 'CODIGO_VENCIDO', 'El código ya no sirve para probar otro DPI');

    // ------------------------------------------------------------------
    console.log('\n--- Mensajes de error ---');
    const inesperado = respuestaDeError(new Error('column p.email does not exist'), 'No se pudo completar.');
    const negocio = respuestaDeError(errorDeNegocio(400, 'Saldo insuficiente.'), 'No se pudo completar.');
    assert(
      inesperado.status === 500 && inesperado.message === 'No se pudo completar.' && negocio.status === 400 && negocio.message === 'Saldo insuficiente.',
      'Un error inesperado no muestra su detalle; uno de negocio sí muestra su mensaje'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Descarga de documentos ---');
    fs.mkdirSync(path.dirname(rutaArchivo), { recursive: true });
    fs.writeFileSync(rutaArchivo, '%PDF-1.4 prueba');
    const descargar = (token) =>
      new Promise((resolve) => {
        http
          .get({ hostname: 'localhost', port, path: `/api/uploads/creditos/${archivo}`, headers: { Authorization: `Bearer ${token}` } }, (res) => {
            res.resume();
            resolve(res.statusCode);
          })
          .on('error', () => resolve(0));
      });
    const tokenDescarga = (await login('OP-2')).body.token;
    const conSesion = await descargar(tokenDescarga);
    await request('/api/auth/logout', 'POST', null, tokenDescarga);
    const sesionCerrada = await descargar(tokenDescarga);
    assert(conSesion === 200 && sesionCerrada === 401, 'Con la sesión cerrada, el token ya no descarga documentos');

    // Asociado de prueba, sin solicitudes de crédito: el documento no es suyo
    idPersonaAsociado = (await db.query(
      `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
       VALUES ($1, 'Prueba', 'Endurecimiento', '55559039', '1990-01-01') RETURNING id_persona`,
      [`939${sufijo}000`.slice(0, 13)]
    )).rows[0].id_persona;
    await db.query("INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO')", [idPersonaAsociado]);
    const idUsuarioAsociado = (await db.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
       VALUES ($1, (SELECT id_rol FROM roles WHERE codigo = 'ASOCIADO'), $2, $3, $4, 'ACTIVO', false) RETURNING id_usuario`,
      [idPersonaAsociado, codigoAsociado, `endurecimiento.${sufijo}@gmail.com`, HASH_ADMIN123]
    )).rows[0].id_usuario;
    const tokenAsociado = (await login(codigoAsociado)).body.token;
    tokens.push(tokenAsociado);
    assert(await descargar(tokenAsociado) === 403, 'Un asociado con sesión no descarga el documento de otra persona');

    // ------------------------------------------------------------------
    console.log('\n--- Presencia en tiempo real ---');
    const tokenAdmin = (await login('AD-1')).body.token;
    tokens.push(tokenAdmin);
    const abrir = (token) =>
      new Promise((resolve, reject) => {
        const socket = Client(`http://localhost:${port}`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
        sockets.push(socket);
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
      });
    const anonimo = await abrir(null);
    const admin = await abrir(tokenAdmin);
    const recibidos = { anonimo: 0, admin: 0 };
    anonimo.on('presence_update', () => recibidos.anonimo++);
    admin.on('presence_update', () => recibidos.admin++);
    await esperar(100);
    const tokenOperador = (await login('OP-1')).body.token;
    tokens.push(tokenOperador);
    const operador = await abrir(tokenOperador);
    await esperar(400);
    assert(recibidos.admin > 0 && recibidos.anonimo === 0, 'La presencia llega al administrador y no a un socket anónimo');
    operador.disconnect();

    // ------------------------------------------------------------------
    console.log('\n--- Datos de la persona en «Usuarios» ---');
    // Se guarda la persona completa para reponerla al terminar, y desde qué fila de auditoría limpiar
    const op2 = (await db.query(
      `SELECT u.id_usuario, p.id_persona, p.cui_dpi, p.primer_nombre, p.segundo_nombre, p.primer_apellido,
              p.segundo_apellido, p.telefono, p.direccion, TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento
       FROM usuarios u JOIN personas p ON p.id_persona = u.id_persona
       WHERE u.codigo_corporativo = 'OP-2'`
    )).rows[0];
    personaOriginalOp2 = op2;
    idUsuarioOp2 = op2.id_usuario;
    ultimoHistorialPrevio = (await db.query('SELECT COALESCE(MAX(id_historial_estado), 0) AS id FROM historial_estados_usuario')).rows[0].id;
    const telefonoOriginalOp2 = op2.telefono;
    const cambiarDpi = await request(`/api/usuarios/${op2.id_usuario}`, 'PUT', { cui_dpi: dpiSolicitud }, tokenAdmin);
    const dpiDespues = (await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [op2.id_persona])).rows[0].cui_dpi;
    assert(cambiarDpi.status === 400 && dpiDespues === op2.cui_dpi, 'El DPI de una persona no se cambia desde «Usuarios»');

    const nuevoTelefono = telefonoOriginalOp2 === '55550099' ? '55550098' : '55550099';
    const cambiarTelefono = await request(`/api/usuarios/${op2.id_usuario}`, 'PUT', { cui_dpi: op2.cui_dpi, telefono: nuevoTelefono }, tokenAdmin);
    const auditoria = (await db.query(
      `SELECT motivo FROM historial_estados_usuario WHERE id_usuario_modificado = $1 AND motivo LIKE 'Datos personales actualizados%'
       ORDER BY id_historial_estado DESC LIMIT 1`,
      [op2.id_usuario]
    )).rows[0];
    assert(
      cambiarTelefono.status === 200 && auditoria?.motivo.includes(`«${telefonoOriginalOp2 || ''}» → «${nuevoTelefono}»`),
      'Cambiar los datos de la persona queda auditado con el valor anterior'
    );
    const despuesDelTelefono = (await db.query('SELECT segundo_nombre, segundo_apellido FROM personas WHERE id_persona = $1', [op2.id_persona])).rows[0];
    assert(
      despuesDelTelefono.segundo_nombre === op2.segundo_nombre && despuesDelTelefono.segundo_apellido === op2.segundo_apellido,
      'Un cambio de teléfono no borra el segundo nombre ni el segundo apellido'
    );

    const antesDeBloquear = await request('/api/auth/me', 'GET', null, tokenAsociado);
    const bloquear = await request(`/api/usuarios/${idUsuarioAsociado}`, 'PUT', { estado: 'INACTIVO' }, tokenAdmin);
    // Al reactivarlo, el token de antes ya no vale: la sesión se cerró al cambiar el estado
    const reactivar = await request(`/api/usuarios/${idUsuarioAsociado}`, 'PUT', { estado: 'ACTIVO' }, tokenAdmin);
    const tokenViejo = await request('/api/auth/me', 'GET', null, tokenAsociado);
    assert(
      antesDeBloquear.status === 200 && bloquear.status === 200 && reactivar.status === 200 && tokenViejo.status === 401,
      'Cambiar el estado de un usuario cierra su sesión'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Banco ---');
    const porId = await bancoApiService.acreditarCuenta({ numero_cuenta: '8', monto: 0.01, concepto: 'Prueba', referencia: `TEST-ID-${sufijo}` });
    assert(!porId.success && porId.status === 404, 'El banco no acepta el id interno de una cuenta en lugar de su número');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    total++;
  } finally {
    sockets.forEach((socket) => socket.connected && socket.disconnect());
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
      await db.query('DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = $1', [dpiSolicitud]);
      await db.query('DELETE FROM codigos_verificacion_correo WHERE email = $1', [`otra.${sufijo}@gmail.com`]);
      if (personaOriginalOp2) {
        const o = personaOriginalOp2;
        await db.query(
          `UPDATE personas SET primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
                               telefono = $5, direccion = $6, fecha_nacimiento = $7
           WHERE id_persona = $8`,
          [o.primer_nombre, o.segundo_nombre, o.primer_apellido, o.segundo_apellido, o.telefono, o.direccion, o.fecha_nacimiento, o.id_persona]
        );
        await db.query(
          "DELETE FROM historial_estados_usuario WHERE id_usuario_modificado = $1 AND id_historial_estado > $2 AND motivo LIKE 'Datos personales actualizados%'",
          [idUsuarioOp2, ultimoHistorialPrevio]
        );
      }
      if (idPersonaAsociado) {
        await db.query(
          'DELETE FROM historial_estados_usuario WHERE id_usuario_modificado IN (SELECT id_usuario FROM usuarios WHERE id_persona = $1)',
          [idPersonaAsociado]
        );
        await db.query('DELETE FROM usuarios WHERE id_persona = $1', [idPersonaAsociado]);
        await db.query('DELETE FROM asociados WHERE id_persona = $1', [idPersonaAsociado]);
        await db.query('DELETE FROM personas WHERE id_persona = $1', [idPersonaAsociado]);
      }
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      total++;
    }

    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total ? 0 : 1);
  }
});
