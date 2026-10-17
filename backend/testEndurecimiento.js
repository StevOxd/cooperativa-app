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
 * - El alta de usuarios no acepta una contraseña elegida por quien lo crea.
 * - Solo el ejecutivo aprueba créditos, si los elevó un operador y no fue él mismo (comité de crédito).
 * - El depósito en ventanilla al banco es solo para un colaborador del banco que se afilia, exige el DPI del
 *   titular, entra en el tope de efectivo por persona al día, y queda registrado; abrir una cuenta en el banco
 *   desde la cooperativa no le pone saldo ni crea clientes.
 *
 * Usa el backend en proceso (puerto efímero), el banco y la base de datos locales; el depósito y la apertura
 * se prueban con el banco simulado. Limpia lo que crea.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { io: Client } = require('socket.io-client');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { errorDeNegocio, respuestaDeError } = require('./src/utils/errores');
const { borrarPersonaDePrueba, purgarDepositosDePrueba, poolDueno } = require('./testHelper');
// Limpieza con el rol dueño: el de la aplicación no borra filas (salvo en las pocas tablas que el código limpia)
const comoDueno = (sql, params) => poolDueno(db.pool).query(sql, params);

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 prueba').toString('base64')}`;

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
  const codigoAsociado = `EX-T8${sufijo}`;
  const dpiConClave = `948${sufijo}000`.slice(0, 13);
  // DPI del colaborador que se atiende y de otra persona (cuenta ajena) en el depósito con el banco simulado
  const dpiColaborador = `949${sufijo}000`.slice(0, 13);
  const dpiAjenoBanco = `950${sufijo}000`.slice(0, 13);
  // Un cliente externo del banco (no colaborador) y otros colaboradores para el tope diario del operador
  const dpiExterno = `951${sufijo}000`.slice(0, 13);
  const dpiOtrosColaboradores = ['952', '953', '954', '955'].map((p) => `${p}${sufijo}000`.slice(0, 13));

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
    console.log('\n--- Alta de usuarios ---');
    const conClave = await request('/api/usuarios', 'POST', {
      primer_nombre: 'Prueba',
      primer_apellido: 'Clave',
      cui_dpi: dpiConClave,
      telefono: '55550003',
      fecha_nacimiento: '1990-01-01',
      email: `test.clave.${sufijo}@cooperativa.com`,
      rol: 'OPERADOR',
      password: 'abc123',
    }, tokenAdmin);
    const creadoConClave = (await db.query('SELECT 1 FROM personas WHERE cui_dpi = $1', [dpiConClave])).rows.length;
    assert(conClave.status === 400 && creadoConClave === 0, 'El alta de un usuario no acepta una contraseña elegida por quien lo crea');

    // ------------------------------------------------------------------
    console.log('\n--- Comité de crédito ---');
    const idAdmin = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'AD-1'")).rows[0].id_usuario;
    const idEjecutivo = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'EJ-1'")).rows[0].id_usuario;
    const idAsociadoPrueba = (await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1', [idPersonaAsociado])).rows[0].id_asociado;
    const solicitudEnComite = async (idRevisor) => (await db.query(
      `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado, id_operador_revisa)
       VALUES ($1, 1000, 12, 10, 90, 'EN_AUTORIZACION_EJECUTIVO', $2) RETURNING id_solicitud_credito`,
      [idAsociadoPrueba, idRevisor]
    )).rows[0].id_solicitud_credito;
    const estadoCredito = async (id) => (await db.query('SELECT estado FROM solicitudes_credito WHERE id_solicitud_credito = $1', [id])).rows[0].estado;
    const tokenEjecutivo = (await login('EJ-1')).body.token;
    tokens.push(tokenEjecutivo);
    const aceptar = (id, token) => request(`/api/ejecutivo/creditos/${id}/resolver`, 'POST', {
      accion: 'ACEPTAR',
      observaciones: 'Prueba',
      documento_firmado: PDF,
      nombre_archivo_firmado: 'resolucion.pdf',
    }, token);

    const elevadaPorAdmin = await solicitudEnComite(idAdmin);
    const comoAdmin = await aceptar(elevadaPorAdmin, tokenAdmin);
    const elevadaPorEjecutivo = await solicitudEnComite(idEjecutivo);
    const autoaprobacion = await aceptar(elevadaPorEjecutivo, tokenEjecutivo);
    const sinRevision = await solicitudEnComite(null);
    const sinOperador = await aceptar(sinRevision, tokenEjecutivo);
    assert(
      comoAdmin.status === 403 && (await estadoCredito(elevadaPorAdmin)) === 'EN_AUTORIZACION_EJECUTIVO',
      'Solo el ejecutivo aprueba créditos: el administrador no (403)'
    );
    assert(
      autoaprobacion.status === 403 && autoaprobacion.body.error === 'APROBACION_POR_QUIEN_ELEVO'
        && (await estadoCredito(elevadaPorEjecutivo)) === 'EN_AUTORIZACION_EJECUTIVO',
      'Quien elevó un crédito no lo aprueba'
    );
    assert(
      sinOperador.status === 409 && (await estadoCredito(sinRevision)) === 'EN_AUTORIZACION_EJECUTIVO',
      'Un crédito que no elevó un operador no se aprueba (409)'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Depósito en ventanilla al banco ---');
    const idOperador = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'OP-1'")).rows[0].id_usuario;
    // La sesión de OP-1 de la prueba de presencia se cerró al desconectar su socket: se abre otra
    const tokenVentanilla = (await login('OP-1')).body.token;
    tokens.push(tokenVentanilla);
    const originales = {
      verificarDpi: bancoApiService.verificarDpi,
      consultarCuenta: bancoApiService.consultarCuenta,
      acreditarCuenta: bancoApiService.acreditarCuenta,
      aperturarCuentaBancaria: bancoApiService.aperturarCuentaBancaria,
    };
    const enviadosAlBanco = [];
    try {
      // Banco simulado: CTA-BCO-DPI-<dpi> es de ese DPI; todos son colaboradores salvo el cliente externo
      const titularDe = (numero) => {
        if (numero.startsWith('CTA-BCO-DPI-')) return numero.slice('CTA-BCO-DPI-'.length);
        return numero === 'CTA-BCO-AJENA' ? dpiAjenoBanco : dpiColaborador;
      };
      bancoApiService.verificarDpi = async (cui) => ({
        success: true,
        status: 200,
        existe_en_banco: true,
        cliente: { tipo_cliente: cui === dpiExterno ? 'CLIENTE_EXTERNO' : 'EMPLEADO_PLANILLA' },
      });
      bancoApiService.consultarCuenta = async (numero) => ({
        success: true,
        status: 200,
        data: { numero_cuenta_bancaria: numero, titular_cui: titularDe(numero), estado: 'ACTIVA' },
      });
      let respuestaBanco = { success: true, status: 200 };
      bancoApiService.acreditarCuenta = async (datos) => {
        enviadosAlBanco.push(datos);
        return respuestaBanco;
      };
      bancoApiService.aperturarCuentaBancaria = async (datos) => {
        enviadosAlBanco.push(datos);
        return { success: true, status: 201, data: {} };
      };
      const depositar = (datos) => request('/api/banco-externo/acreditar', 'POST', datos, tokenVentanilla);

      const sinDpi = await depositar({ numero_cuenta: 'CTA-BCO-PROPIA', monto: 100 });
      const sobreTope = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto: 100000.01 });
      const ajena = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-AJENA', monto: 100 });
      const montosInvalidos = await Promise.all(['1.234', 'abc', -5, 0].map((monto) =>
        depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto })));
      assert(
        sinDpi.status === 400 && sobreTope.status === 400 && ajena.status === 403 && enviadosAlBanco.length === 0
          && montosInvalidos.every((r) => r.status === 400),
        'Sin el DPI del titular, sobre el tope, con un monto inválido o a la cuenta de otra persona no se deposita'
      );

      const deposito = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto: '150.00', referencia: 'ELEGIDA-1' });
      const registroDe = async (referencia) => (await db.query(
        'SELECT id_usuario_operador, monto, referencia, titular_cui, estado FROM depositos_ventanilla_banco WHERE referencia = $1',
        [referencia || '']
      )).rows[0];
      const registro = await registroDe(deposito.body.data?.referencia);
      assert(
        deposito.status === 200 && registro?.id_usuario_operador === idOperador && Number(registro?.monto) === 150
          && registro?.titular_cui === dpiColaborador && registro?.estado === 'ACREDITADO'
          && /^DEP-VENT-/.test(registro?.referencia || '') && enviadosAlBanco[0]?.referencia === registro?.referencia,
        'El depósito queda registrado (ACREDITADO) a nombre del operador, con una referencia que pone el servidor'
      );

      // El registro de auditoría no se cambia ni se borra: el trigger lo impide (también al dueño, sin la marca de
      // purga) y el rol de la aplicación ni siquiera tiene permiso de borrar
      const cambio = await db.query("UPDATE depositos_ventanilla_banco SET monto = 1 WHERE referencia = $1", [registro?.referencia]).catch((e) => e);
      const borrado = await db.query('DELETE FROM depositos_ventanilla_banco WHERE referencia = $1', [registro?.referencia]).catch((e) => e);
      const borradoDueno = await comoDueno('DELETE FROM depositos_ventanilla_banco WHERE referencia = $1', [registro?.referencia]).catch((e) => e);
      assert(cambio?.code === '23001' && borrado?.code === '42501' && borradoDueno?.code === '23001',
        'Un depósito registrado no se puede modificar ni borrar');

      // El banco rechaza o no responde: queda el intento con su estado, y ante la falta de respuesta, la referencia
      enviadosAlBanco.length = 0;
      respuestaBanco = { success: false, status: 409, message: 'Cuenta bloqueada' };
      const rechazado = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto: 10 });
      respuestaBanco = { success: false, status: 504, message: 'Tiempo agotado' };
      const sinConfirmar = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto: 20 });
      respuestaBanco = { success: true, status: 200 };
      const [refRechazado, refSinConfirmar] = enviadosAlBanco.map((d) => d.referencia);
      assert(
        rechazado.status === 409 && (await registroDe(refRechazado))?.estado === 'RECHAZADO'
          && sinConfirmar.status === 504 && sinConfirmar.body.message.includes(refSinConfirmar)
          && (await registroDe(refSinConfirmar))?.estado === 'SIN_CONFIRMAR',
        'Si el banco rechaza queda RECHAZADO; si no confirma a tiempo queda SIN_CONFIRMAR con su referencia para conciliar'
      );

      // Solo para un colaborador del banco que se afilia, y con acumulados del día
      enviadosAlBanco.length = 0;
      const aExterno = await depositar({ cui_dpi: dpiExterno, numero_cuenta: `CTA-BCO-DPI-${dpiExterno}`, monto: 10 });
      assert(aExterno.status === 403 && enviadosAlBanco.length === 0, 'No se deposita a un cliente del banco que no es colaborador (403)');
      // El colaborador ya lleva Q170 hoy (150 acreditados y 20 sin confirmar): Q99,900 más pasan el tope de Q100,000
      const sobreTopeDia = await depositar({ cui_dpi: dpiColaborador, numero_cuenta: 'CTA-BCO-PROPIA', monto: 99900 });
      assert(sobreTopeDia.status === 400 && enviadosAlBanco.length === 0, 'Una persona no recibe más del tope de efectivo del día (400)');
      // Sin tope por operador: depósitos grandes a varios colaboradores pasan
      const porOperador = [];
      for (const dpi of dpiOtrosColaboradores) {
        porOperador.push((await depositar({ cui_dpi: dpi, numero_cuenta: `CTA-BCO-DPI-${dpi}`, monto: 50000 })).status);
      }
      assert(porOperador.every((st) => st === 200), `El operador no tiene tope propio en el día (${porOperador.join(', ')})`);

      enviadosAlBanco.length = 0;
      await request('/api/banco-externo/aperturar', 'POST', {
        cui_dpi: dpiColaborador,
        primer_nombre: 'Prueba',
        primer_apellido: 'Banco',
        tipo_cuenta: 'AHORRO',
        monto_inicial: 999999,
      }, tokenVentanilla);
      assert(enviadosAlBanco[0]?.monto_inicial === 0, 'Abrir una cuenta en el banco desde la cooperativa no le pone saldo');
      enviadosAlBanco.length = 0;
      const aperturaExterno = await request('/api/banco-externo/aperturar', 'POST', {
        cui_dpi: dpiExterno,
        primer_nombre: 'Prueba',
        primer_apellido: 'Externo',
        tipo_cuenta: 'AHORRO',
      }, tokenVentanilla);
      assert(aperturaExterno.status === 403 && enviadosAlBanco.length === 0, 'Desde la cooperativa solo se abren cuentas en el banco a un colaborador que se afilia');
    } finally {
      Object.assign(bancoApiService, originales);
    }

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
      await comoDueno('DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = $1', [dpiSolicitud]);
      await db.query('DELETE FROM codigos_verificacion_correo WHERE email = $1', [`otra.${sufijo}@gmail.com`]);
      if (personaOriginalOp2) {
        const o = personaOriginalOp2;
        await db.query(
          `UPDATE personas SET primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
                               telefono = $5, direccion = $6, fecha_nacimiento = $7
           WHERE id_persona = $8`,
          [o.primer_nombre, o.segundo_nombre, o.primer_apellido, o.segundo_apellido, o.telefono, o.direccion, o.fecha_nacimiento, o.id_persona]
        );
        await comoDueno(
          "DELETE FROM historial_estados_usuario WHERE id_usuario_modificado = $1 AND id_historial_estado > $2 AND motivo LIKE 'Datos personales actualizados%'",
          [idUsuarioOp2, ultimoHistorialPrevio]
        );
      }
      if (idPersonaAsociado) await borrarPersonaDePrueba(db, idPersonaAsociado);
      await purgarDepositosDePrueba(db, { dpis: [dpiColaborador, dpiAjenoBanco, dpiExterno, ...dpiOtrosColaboradores] });
      const conClaveCreada = (await db.query('SELECT id_persona FROM personas WHERE cui_dpi = $1', [dpiConClave])).rows[0];
      if (conClaveCreada) await borrarPersonaDePrueba(db, conClaveCreada.id_persona);
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
