const nodemailer = require('nodemailer');
const { pool } = require('../config/db');
const { errorDeNegocio } = require('../utils/errores');
const { cifrar, descifrar, estaCifrado } = require('../utils/cifradoConfiguracion');
const { resolverDireccionPublica } = require('../utils/direccionesInternas');

/**
 * Servicio Institucional de Despacho de Correo Electrónico
 * Soporta Google Mail (Gmail SMTP / Google Workspace), SMTP estándar y modo demostrativo bancario.
 */
/**
 * Interruptor general: con `MAIL_ENABLED=false` no se envía ningún correo, aunque haya
 * credenciales en las variables de entorno o en `configuracion_sistema`. Pensado para
 * pruebas automáticas y entornos donde no debe salir correo real.
 */
// Tiempos máximos del servidor de correo: algunos envíos ocurren dentro de una transacción
// (activar el acceso al portal, issue #27) y no deben retenerla indefinidamente.
const TIEMPOS_SMTP = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 };

// Puertos que acepta un servidor SMTP configurado desde la pantalla: los de correo (25, 465 con SSL, 587 con
// STARTTLS, 2525 alterno) y 1025 de los buzones de prueba. Evita que el formulario sirva para tocar otros servicios
// de la red interna (la base, el banco).
const PUERTOS_SMTP_PERMITIDOS = [25, 465, 587, 1025, 2525];
const PUERTO_SMTP_SSL = 465;
// Buzón de prueba (Mailpit): no ofrece STARTTLS. Solo se usa sin cifrado donde se permite la red interna.
const PUERTO_SMTP_PRUEBAS = 1025;
// Contraseñas del correo que se guardan cifradas en configuracion_sistema
const CLAVES_SECRETAS = ['GMAIL_APP_PASSWORD', 'SMTP_PASS'];
const MENSAJE_SERVIDOR_INTERNO =
  'Ese servidor de correo no se encontró o es una dirección interna. Use el servidor que le indicó su proveedor de correo.';

/**
 * Con `SMTP_PERMITIR_RED_INTERNA=true` (solo en desarrollo, para el buzón de prueba) se aceptan servidores de la red
 * interna y el puerto de prueba sin cifrado. Sin la variable, un servidor guardado desde la pantalla debe ser público.
 */
const redInternaPermitida = () => String(process.env.SMTP_PERMITIR_RED_INTERNA || '').trim().toLowerCase() === 'true';
// Nombre de servidor o IPv4: letras, números, puntos y guiones (RFC 1123), hasta 253 caracteres
const SERVIDOR_SMTP_VALIDO = /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const LARGO_MAXIMO_CREDENCIAL = 256;
const CORREO_VALIDO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const REMITENTE_SMTP_POR_DEFECTO = 'Cooperativa Corporativa';
// Caracteres que en el nombre visible harían leer otra dirección en el remitente
const NOMBRE_REMITENTE_INVALIDO = /[,;"<>@]/;

/**
 * Opciones de nodemailer para un SMTP genérico. Sin SSL desde el inicio exige STARTTLS (`requireTLS`): si el servidor
 * no lo ofrece, no se envían el usuario ni la contraseña sin cifrar. Solo el buzón de prueba, donde se permite la red
 * interna, queda sin esa exigencia. Si se conecta a una IP ya resuelta, `servername` es el nombre con que se valida el
 * certificado.
 */
const opcionesTransporteSmtp = ({ host, port, secure, user, pass, servername }) => ({
  ...TIEMPOS_SMTP,
  host,
  port,
  secure,
  requireTLS: !secure && !(port === PUERTO_SMTP_PRUEBAS && redInternaPermitida()),
  auth: { user, pass },
  ...(servername ? { tls: { servername } } : {}),
});

/** Opciones de nodemailer para Gmail; el certificado de Google se valida (sin `rejectUnauthorized: false`). */
const opcionesTransporteGmail = ({ user, pass }) => ({ ...TIEMPOS_SMTP, service: 'gmail', auth: { user, pass } });

/**
 * Guarda la configuración de un proveedor en configuracion_sistema, con las contraseñas (CLAVES_SECRETAS) cifradas, y
 * vacía en la misma transacción la contraseña del proveedor que se deja de usar. Si algo falla, no queda nada a medias
 * y el error sube: el proveedor en memoria no se cambia.
 *
 * @param {Array<[string, string, string]>} filas - [clave, valor, descripción].
 * @param {string} secretoAnterior - Clave de la contraseña del otro proveedor.
 */
const guardarConfiguracion = async (filas, secretoAnterior) => {
  const valores = [];
  const marcadores = filas.map(([clave, valor, descripcion], i) => {
    valores.push(clave, CLAVES_SECRETAS.includes(clave) ? cifrar(valor) : valor, descripcion);
    return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, NOW())`;
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO configuracion_sistema (clave, valor, descripcion, actualizado_en)
       VALUES ${marcadores.join(', ')}
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = NOW()`,
      valores
    );
    await client.query("UPDATE configuracion_sistema SET valor = '', actualizado_en = NOW() WHERE clave = $1", [
      secretoAnterior,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[MAILER ERROR] No se pudo guardar la configuración del correo:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Lee las contraseñas guardadas: descifra las cifradas y vuelve a guardar cifradas las que quedaron en claro de
 * versiones anteriores.
 *
 * @param {Object<string, string>} mapa - clave → valor leído de configuracion_sistema; se modifica en el lugar.
 */
const leerSecretosGuardados = async (mapa) => {
  for (const clave of CLAVES_SECRETAS) {
    const valor = mapa[clave];
    if (!valor) continue;
    if (estaCifrado(valor)) {
      mapa[clave] = descifrar(valor);
      if (mapa[clave] === null) {
        console.warn(`[MAILER WARNING] No se pudo descifrar ${clave} (¿cambió JWT_SECRET?). Configure el correo de nuevo.`);
      }
    } else {
      try {
        await pool.query('UPDATE configuracion_sistema SET valor = $1, actualizado_en = NOW() WHERE clave = $2', [
          cifrar(valor),
          clave,
        ]);
        console.log(`[MAILER] ${clave} guardada en claro se volvió a guardar cifrada.`);
      } catch (error) {
        console.warn(`[MAILER WARNING] ${clave} sigue guardada en claro: no se pudo cifrar (${error.message}).`);
      }
    }
  }
};

/** Mensaje para el administrador cuando Gmail no se verifica al arrancar; el detalle queda solo en la consola. */
const MENSAJE_ERROR_GMAIL =
  'Google no aceptó la cuenta o la contraseña de aplicación guardadas. Vuelva a configurar Gmail.';

/** Mensaje para el administrador cuando un SMTP no se verifica; el detalle técnico queda solo en la consola. */
const mensajeErrorSmtp = (error) =>
  error.code === 'EAUTH'
    ? 'El servidor de correo rechazó el usuario o la contraseña.'
    : 'No se pudo conectar con el servidor de correo de forma segura. Revise el servidor, el puerto y la conexión segura.';

/** Un correo con forma válida y sin espacios ni saltos de línea (también para el destinatario de la prueba). */
const esCorreoValido = (correo) => typeof correo === 'string' && correo.length <= 254 && CORREO_VALIDO.test(correo);

const isMailDisabled = () => String(process.env.MAIL_ENABLED || '').trim().toLowerCase() === 'false';

/** Texto para insertar en el HTML de un correo: sin etiquetas ni atributos que cambien lo que se ve. */
const escaparHtml = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

class MailerService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.isVerified = false;
    this.activeProvider = 'demo';
    this.currentUser = null;
    this.from = null;
    this.lastError = null;
    // Servidor del SMTP genérico activo (sin usuario ni contraseña), para mostrarlo en el estado
    this.smtp = null;
  }

  /**
   * Carga la configuración desde PostgreSQL (tabla configuracion_sistema) o variables de entorno
   */
  async initTransporter() {
    if (isMailDisabled()) {
      this.transporter = null;
      this.isConfigured = false;
      this.isVerified = false;
      this.activeProvider = 'demo';
      this.currentUser = null;
      this.smtp = null;
      this.lastError = null;
      console.log('[MAILER] Envío de correos desactivado (MAIL_ENABLED=false). Ningún correo saldrá de este proceso.');
      return;
    }
    try {
      let gmailUser = process.env.GMAIL_USER || null;
      let gmailPass = process.env.GMAIL_APP_PASSWORD || null;
      let mailService = process.env.MAIL_SERVICE || 'google';
      let emailFrom = process.env.EMAIL_FROM || null;
      let smtpHost = process.env.SMTP_HOST || null;
      let smtpPort = process.env.SMTP_PORT || '587';
      let smtpUser = process.env.SMTP_USER || null;
      let smtpPass = process.env.SMTP_PASS || null;
      let smtpSecure = process.env.SMTP_SECURE === 'true';

      // Si el servidor SMTP viene de la base (guardado desde la pantalla), se revisa que no sea interno al conectar
      let smtpDesdeBase = false;

      // Intentar leer de la base de datos si la tabla existe
      try {
        const dbConfig = await pool.query(
          "SELECT clave, valor FROM configuracion_sistema WHERE clave IN ('GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_SERVICE', 'EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE')"
        );
        if (dbConfig.rows.length > 0) {
          const map = {};
          dbConfig.rows.forEach((r) => {
            map[r.clave] = r.valor;
          });
          await leerSecretosGuardados(map);
          // Una contraseña guardada que no se pudo descifrar deja ese proveedor sin configurar: no se mezcla con .env
          if (map.GMAIL_APP_PASSWORD === null) gmailPass = null;
          if (map.SMTP_PASS === null) smtpPass = null;
          if (map.GMAIL_USER) gmailUser = map.GMAIL_USER;
          if (map.GMAIL_APP_PASSWORD) gmailPass = map.GMAIL_APP_PASSWORD;
          if (map.MAIL_SERVICE) mailService = map.MAIL_SERVICE;
          if (map.EMAIL_FROM) emailFrom = map.EMAIL_FROM;
          if (map.SMTP_HOST) {
            smtpHost = map.SMTP_HOST;
            smtpDesdeBase = true;
          }
          if (map.SMTP_PORT) smtpPort = map.SMTP_PORT;
          if (map.SMTP_USER) smtpUser = map.SMTP_USER;
          if (map.SMTP_PASS) smtpPass = map.SMTP_PASS;
          if (map.SMTP_SECURE !== undefined) smtpSecure = map.SMTP_SECURE === 'true';
        }
      } catch (dbErr) {
        // La tabla aún no existe o la BD se está levantando; recurrir a process.env
        console.warn('[MAILER WARNING] No se leyó la configuración del correo de la base; se usa .env:', dbErr.message);
      }

      // 1. Prioridad: Servicio de Google (Gmail / Google Workspace)
      const isGoogleActive =
        (mailService.toLowerCase() === 'google' || mailService.toLowerCase() === 'gmail') &&
        gmailUser &&
        gmailPass;

      if (isGoogleActive) {
        const cleanPass = gmailPass.replace(/\s+/g, '');
        const transport = nodemailer.createTransport(opcionesTransporteGmail({ user: gmailUser, pass: cleanPass }));

        this.transporter = transport;
        this.isConfigured = true;
        this.activeProvider = 'google';
        this.currentUser = gmailUser;
        this.smtp = null;
        this.from = emailFrom || `Cooperativa Corporativa <${gmailUser}>`;

        // Verificación en segundo plano sin bloquear el arranque del servidor
        try {
          await this.transporter.verify();
          this.isVerified = true;
          this.lastError = null;
          console.log(`[MAILER] Conectado y verificado exitosamente con Google Mail (${gmailUser}).`);
        } catch (verifyErr) {
          this.isVerified = false;
          this.lastError = MENSAJE_ERROR_GMAIL;
          console.warn(`[MAILER WARNING] Credenciales de Google cargadas pero no verificadas (${verifyErr.message}).`);
        }
        return;
      }

      // 2. Servidor SMTP genérico
      if (smtpHost && smtpUser && smtpPass) {
        const puerto = parseInt(smtpPort, 10);
        const conexionSegura = smtpSecure || puerto === PUERTO_SMTP_SSL;
        // Un servidor guardado desde la pantalla se resuelve otra vez: si ahora apunta a la red interna, no se usa
        const ip = smtpDesdeBase && !redInternaPermitida() ? await resolverDireccionPublica(smtpHost) : null;
        if (smtpDesdeBase && !redInternaPermitida() && !ip) {
          this.transporter = null;
          this.isConfigured = true;
          this.isVerified = false;
          this.activeProvider = 'smtp';
          this.currentUser = smtpUser;
          this.smtp = { host: smtpHost, port: puerto, secure: conexionSegura };
          this.lastError = MENSAJE_SERVIDOR_INTERNO;
          console.warn(`[MAILER WARNING] El servidor SMTP guardado (${smtpHost}) no se resuelve o es una dirección interna.`);
          return;
        }
        const transport = nodemailer.createTransport(
          opcionesTransporteSmtp({
            host: ip || smtpHost,
            port: puerto,
            secure: conexionSegura,
            user: smtpUser,
            pass: smtpPass,
            servername: ip ? smtpHost : undefined,
          })
        );

        this.transporter = transport;
        this.isConfigured = true;
        this.activeProvider = 'smtp';
        this.currentUser = smtpUser;
        this.smtp = { host: smtpHost, port: puerto, secure: conexionSegura };
        this.from = emailFrom || `Cooperativa Financiera <${smtpUser}>`;

        try {
          await this.transporter.verify();
          this.isVerified = true;
          this.lastError = null;
          console.log(`[MAILER] Conectado exitosamente a servidor SMTP (${smtpHost}).`);
        } catch (verifyErr) {
          this.isVerified = false;
          this.lastError = mensajeErrorSmtp(verifyErr);
          console.warn(`[MAILER WARNING] Servidor SMTP configurado pero verificación falló (${verifyErr.message}).`);
        }
        return;
      }

      // 3. Modo demostrativo / desarrollo
      this.transporter = null;
      this.isConfigured = false;
      this.isVerified = false;
      this.activeProvider = 'demo';
      this.currentUser = null;
      this.smtp = null;
      this.lastError = null;
      console.log('[MAILER] Modo demostrativo activo (sin credenciales de Google/SMTP configuradas). Los correos no se envían; solo se registra en consola que no salieron.');
    } catch (err) {
      console.warn('[MAILER] Advertencia al configurar transporte de correo:', err.message);
      this.lastError = err.message;
    }
  }

  /**
   * Configura dinámicamente el servicio de Google Mail y valida las credenciales en vivo
   */
  async configureGoogleService({ user, appPassword, from }) {
    if (isMailDisabled()) {
      return {
        success: false,
        message: 'El envío de correos está desactivado en este entorno (MAIL_ENABLED=false).',
      };
    }
    if (!user || !user.includes('@')) {
      throw errorDeNegocio(400, 'Debe proporcionar una cuenta de correo de Google válida.');
    }
    if (!appPassword || appPassword.trim().length < 8) {
      throw errorDeNegocio(400, 'Debe proporcionar la Contraseña de Aplicación de 16 caracteres de Google.');
    }

    if (!esCorreoValido(user.trim())) {
      throw errorDeNegocio(400, 'Debe proporcionar una cuenta de correo de Google válida.');
    }
    const cleanPass = appPassword.replace(/\s+/g, '');
    const sender = this.remitenteSmtp(from, user.trim());

    // 1. Probar la conexión con Google antes de guardar
    const testTransporter = nodemailer.createTransport(opcionesTransporteGmail({ user: user.trim(), pass: cleanPass }));

    try {
      await testTransporter.verify();
    } catch (verifyErr) {
      console.error('[MAILER ERROR] Error de autenticación con Google:', verifyErr.message);
      return {
        success: false,
        message: 'Google rechazó la cuenta o la contraseña de aplicación. Revise que la haya creado en myaccount.google.com/apppasswords y que la cuenta tenga activa la verificación en dos pasos.',
        error: verifyErr.message,
      };
    }

    // 2. Persistir en la base de datos PostgreSQL (contraseña cifrada) y olvidar la del SMTP
    await guardarConfiguracion(
      [
        ['GMAIL_USER', user.trim(), 'Cuenta de correo de Google para envíos corporativos'],
        ['GMAIL_APP_PASSWORD', cleanPass, 'Contraseña de aplicación de Google de 16 caracteres (cifrada)'],
        ['MAIL_SERVICE', 'google', 'Proveedor de servicio de correo activo'],
        ['EMAIL_FROM', sender, 'Nombre y remitente visible del correo'],
      ],
      'SMTP_PASS'
    );

    // 3. Actualizar estado en memoria
    this.transporter = testTransporter;
    this.isConfigured = true;
    this.isVerified = true;
    this.activeProvider = 'google';
    this.currentUser = user.trim();
    this.smtp = null;
    this.from = sender;
    this.lastError = null;

    // Sincronizar variables de proceso
    process.env.GMAIL_USER = user.trim();
    process.env.GMAIL_APP_PASSWORD = cleanPass;
    process.env.MAIL_SERVICE = 'google';
    process.env.EMAIL_FROM = sender;
    delete process.env.SMTP_PASS;

    console.log(`[MAILER] Servicio de Google Mail configurado y activado exitosamente para ${user.trim()}.`);

    return {
      success: true,
      message: 'Gmail quedó conectado y verificado.',
      status: this.getStatus(),
    };
  }

  /**
   * Configura un servidor SMTP cualquiera (Outlook, el del hosting, un buzón de prueba), verifica la conexión y, si
   * responde, lo guarda en `configuracion_sistema` como proveedor activo (issue #126). Si la verificación falla no
   * cambia nada: sigue el proveedor anterior.
   *
   * @param {Object} datos
   * @param {string} datos.host - Servidor, por ejemplo smtp.office365.com.
   * @param {number|string} datos.port - Uno de PUERTOS_SMTP_PERMITIDOS.
   * @param {boolean} [datos.secure] - SSL desde el inicio; con el puerto 465 siempre lo es.
   * @param {string} datos.user
   * @param {string} datos.password
   * @param {string} [datos.from] - «Nombre <correo>»; si falta, se usa el usuario cuando es un correo.
   * @returns {Promise<{success: boolean, message: string, status?: Object}>}
   * @throws {Error} 400 si los datos no son válidos.
   */
  async configureSmtpService({ host, port, secure, user, password, from }) {
    if (isMailDisabled()) {
      return {
        success: false,
        message: 'El envío de correos está desactivado en este entorno (MAIL_ENABLED=false).',
      };
    }
    const servidor = typeof host === 'string' ? host.trim() : '';
    if (!SERVIDOR_SMTP_VALIDO.test(servidor)) {
      throw errorDeNegocio(400, 'Escriba el servidor de correo, por ejemplo smtp.office365.com.');
    }
    const puerto = Number(port);
    if (!PUERTOS_SMTP_PERMITIDOS.includes(puerto)) {
      throw errorDeNegocio(400, `El puerto debe ser uno de estos: ${PUERTOS_SMTP_PERMITIDOS.join(', ')}.`);
    }
    const usuario = typeof user === 'string' ? user.trim() : '';
    if (!usuario || usuario.length > LARGO_MAXIMO_CREDENCIAL) {
      throw errorDeNegocio(400, 'Escriba el usuario del servidor de correo.');
    }
    if (typeof password !== 'string' || !password || password.length > LARGO_MAXIMO_CREDENCIAL) {
      throw errorDeNegocio(400, 'Escriba la contraseña del servidor de correo.');
    }
    const remitente = this.remitenteSmtp(from, usuario);
    const conexionSegura = secure === true || puerto === PUERTO_SMTP_SSL;

    // Fuera del buzón de prueba, el servidor debe ser público; se conecta a la IP revisada, no otra vez al nombre
    const ip = redInternaPermitida() ? null : await resolverDireccionPublica(servidor);
    if (!redInternaPermitida() && !ip) {
      return { success: false, message: MENSAJE_SERVIDOR_INTERNO };
    }

    const transporte = nodemailer.createTransport(
      opcionesTransporteSmtp({
        host: ip || servidor,
        port: puerto,
        secure: conexionSegura,
        user: usuario,
        pass: password,
        servername: ip ? servidor : undefined,
      })
    );

    try {
      await transporte.verify();
    } catch (verifyErr) {
      // El detalle (que puede incluir direcciones internas) queda solo en la consola
      console.error('[MAILER ERROR] No se pudo verificar el servidor SMTP:', verifyErr.message);
      return { success: false, message: mensajeErrorSmtp(verifyErr) };
    }

    await guardarConfiguracion(
      [
        ['SMTP_HOST', servidor, 'Servidor SMTP para envíos corporativos'],
        ['SMTP_PORT', String(puerto), 'Puerto del servidor SMTP'],
        ['SMTP_SECURE', String(conexionSegura), 'SSL desde el inicio (true) o STARTTLS (false)'],
        ['SMTP_USER', usuario, 'Usuario del servidor SMTP'],
        ['SMTP_PASS', password, 'Contraseña del servidor SMTP (cifrada)'],
        ['MAIL_SERVICE', 'smtp', 'Proveedor de servicio de correo activo'],
        ['EMAIL_FROM', remitente, 'Nombre y remitente visible del correo'],
      ],
      'GMAIL_APP_PASSWORD'
    );

    this.transporter = transporte;
    this.isConfigured = true;
    this.isVerified = true;
    this.activeProvider = 'smtp';
    this.currentUser = usuario;
    this.smtp = { host: servidor, port: puerto, secure: conexionSegura };
    this.from = remitente;
    this.lastError = null;

    process.env.SMTP_HOST = servidor;
    process.env.SMTP_PORT = String(puerto);
    process.env.SMTP_SECURE = String(conexionSegura);
    process.env.SMTP_USER = usuario;
    process.env.SMTP_PASS = password;
    process.env.MAIL_SERVICE = 'smtp';
    process.env.EMAIL_FROM = remitente;
    delete process.env.GMAIL_APP_PASSWORD;

    console.log(`[MAILER] Servidor SMTP configurado y activado (${servidor}:${puerto}).`);

    return {
      success: true,
      message: 'El servidor de correo quedó conectado y verificado.',
      status: this.getStatus(),
    };
  }

  /**
   * Remitente visible de un SMTP: el que se escribió («Nombre <correo>» o un correo) o, si no hay, el usuario cuando
   * es un correo. Sin saltos de línea, que permitirían agregar cabeceras al mensaje, ni comas o comillas en el nombre,
   * que harían leer otra dirección.
   *
   * @param {string} [from]
   * @param {string} usuario
   * @returns {string}
   * @throws {Error} 400 si no hay un correo de remitente válido.
   */
  remitenteSmtp(from, usuario) {
    const texto = typeof from === 'string' ? from.trim() : '';
    if (/[\r\n]/.test(texto)) {
      throw errorDeNegocio(400, 'El remitente no es válido.');
    }
    const partes = /^([^<>]*)<([^<>]+)>$/.exec(texto);
    const [nombre, correo] = partes ? [partes[1].trim(), partes[2].trim()] : ['', texto];
    if (NOMBRE_REMITENTE_INVALIDO.test(nombre)) {
      throw errorDeNegocio(400, 'El nombre del remitente no puede llevar comas, comillas, arroba ni los signos < >.');
    }
    if (texto && CORREO_VALIDO.test(correo)) return texto;
    if (!texto && CORREO_VALIDO.test(usuario)) return `${REMITENTE_SMTP_POR_DEFECTO} <${usuario}>`;
    throw errorDeNegocio(400, 'Escriba el correo del remitente, por ejemplo notificaciones@cooperativa.com.');
  }

  /**
   * @param {string} correo
   * @returns {boolean} true si tiene forma de correo (sin espacios, saltos de línea ni < >).
   */
  esCorreoValido(correo) {
    return esCorreoValido(correo);
  }

  /**
   * Indica si hay un correo configurado y verificado, listo para enviar.
   * Justo al arrancar puede ser false mientras termina la verificación (initTransporter es asíncrono).
   */
  isAvailable() {
    return Boolean(this.transporter && this.isVerified) && !isMailDisabled();
  }

  /**
   * Indica si un envío salió de verdad. Los métodos send* responden success: true también en
   * modo demostrativo o cuando el envío falla; solo un envío real trae simulado: false.
   *
   * @param {Object} result - Respuesta de un método send*.
   * @returns {boolean}
   */
  wasSent(result) {
    return Boolean(result && result.success && result.simulado === false);
  }

  /**
   * Obtiene el estado actual del servicio de correo con sanitización de datos
   */
  getStatus() {
    let maskedUser = null;
    if (this.currentUser) {
      const parts = this.currentUser.split('@');
      if (parts.length === 2) {
        const name = parts[0];
        maskedUser = (name.length > 2 ? name.substring(0, 2) + '***' + name.slice(-1) : name + '***') + '@' + parts[1];
      } else {
        maskedUser = this.currentUser;
      }
    }

    return {
      configured: this.isConfigured,
      verified: this.isVerified,
      provider: this.activeProvider, // 'google', 'smtp', 'demo'
      userMasked: maskedUser,
      rawUser: this.currentUser,
      from: this.from,
      lastError: this.lastError,
      disabled: isMailDisabled(),
      smtp: this.activeProvider === 'smtp' ? this.smtp : null,
    };
  }

  /**
   * Envía un correo de prueba para validar el despacho en tiempo real
   */
  async sendTestEmail({ to }) {
    const subject = '[PRUEBA DE SERVICIO] Verificación del correo de notificaciones - Cooperativa Corporativa';
    const timestamp = new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #059669, #10b981); padding: 28px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 28px; }
          .status-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 18px; margin: 20px 0; text-align: center; }
          .status-title { color: #065f46; font-size: 16px; font-weight: bold; margin-bottom: 6px; }
          .status-desc { color: #047857; font-size: 13px; margin: 0; }
          .meta-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
          .meta-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
          .meta-table td:first-child { font-weight: 600; color: #64748b; width: 40%; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>COOPERATIVA CORPORATIVA</h1>
            <p>Infraestructura de Comunicaciones Seguras</p>
          </div>
          <div class="content">
            <div class="status-box">
              <div class="status-title">✓ Servicio de Correo Verificado</div>
              <p class="status-desc">${this.activeProvider === 'smtp' ? 'El despacho de notificaciones por el servidor SMTP' : 'El despacho de notificaciones a través de Google Mail'} está funcionando correctamente.</p>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Este es un correo de prueba generado automáticamente desde el panel de administración institucional de la Cooperativa. Todos los correos de creación de asociados, contraseñas temporales y tokens de seguridad 2FA se enviarán mediante este canal.
            </p>

            <table class="meta-table">
              <tr>
                <td>Proveedor Activo:</td>
                <td><strong>${this.activeProvider === 'google' ? 'Google Mail (Gmail SMTP)' : this.activeProvider === 'smtp' ? `Servidor SMTP (${escaparHtml(this.smtp?.host)})` : 'Modo demostrativo'}</strong></td>
              </tr>
              <tr>
                <td>Cuenta Remitente:</td>
                <td><code>${escaparHtml(this.currentUser || 'Modo Demostrativo')}</code></td>
              </tr>
              <tr>
                <td>Destinatario:</td>
                <td><code>${escaparHtml(to)}</code></td>
              </tr>
              <tr>
                <td>Fecha y Hora (GT):</td>
                <td>${timestamp}</td>
              </tr>
            </table>
          </div>
          <div class="footer">
            <p>© 2026 Cooperativa Corporación Bancaria - Todos los derechos reservados.</p>
            <p>Mensaje emitido automáticamente para certificación de servicios SMTP.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'seguridad@cooperativa.com'}>`,
      to: to.trim(),
      subject,
      html: htmlContent,
    };

    if (this.transporter && this.isVerified) {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`[MAILER] Correo de prueba enviado exitosamente a ${to}: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
        simulado: false,
        provider: this.activeProvider,
        to: to.trim(),
      };
    } else {
      console.log(`[MAILER DEMO] Correo de prueba despachado en modo demostrativo para ${to}.`);
      return {
        success: true,
        simulado: true,
        provider: 'demo',
        to: to.trim(),
      };
    }
  }

  /**
   * Envía un correo con el mismo manejo que los demás: real si hay transporte verificado,
   * simulado si no. Nunca escribe el contenido en los registros.
   */
  async enviarCorreo({ to, subject, html, etiqueta }) {
    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'notificaciones@cooperativa.com'}>`,
      to,
      subject,
      html,
    };

    if (this.transporter && this.isVerified && !isMailDisabled()) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo de ${etiqueta} enviado vía ${this.activeProvider} a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId, simulado: false, provider: this.activeProvider };
      } catch (error) {
        console.warn(`[MAILER WARNING] No se pudo enviar el correo de ${etiqueta} por ${this.activeProvider} (${error.message}).`);
        return { success: true, simulado: true, error: error.message, provider: this.activeProvider };
      }
    }
    console.log(`[MAILER DEMO] Correo de ${etiqueta} NO enviado (modo demostrativo) para ${to}.`);
    return { success: true, simulado: true, provider: 'demo' };
  }

  /**
   * Aviso al correo anterior cuando el administrador cambia el correo de un usuario desde «Usuarios».
   * Si la persona no lo pidió, sabe que debe reclamar antes de que se pueda reiniciar su contraseña.
   *
   * @param {Object} datos
   * @param {string} datos.to - Correo anterior.
   * @param {string} [datos.nombre] - Primer nombre de la persona.
   * @param {string} datos.codigoCorporativo - Código del usuario.
   * @param {string} datos.correoNuevo - Se muestra oculto en parte.
   * @param {number} datos.horasEspera - Horas en que su contraseña no se puede reiniciar.
   * @returns {Promise<Object>} El resultado de `enviarCorreo` (ver `wasSent`).
   */
  async sendUserEmailChangedNotice({ to, nombre, codigoCorporativo, correoNuevo, horasEspera }) {
    const oculto = escaparHtml(String(correoNuevo).replace(/^(.{2}).*(@.*)$/, '$1***$2'));
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px;">
          <h1 style="margin: 0 0 12px 0; font-size: 18px;">Cambió el correo de su usuario</h1>
          <p style="font-size: 14px;">Estimado(a) <strong>${escaparHtml(nombre || 'usuario')}</strong>, en la cooperativa se cambió el correo de su usuario <strong>${escaparHtml(codigoCorporativo)}</strong> a <strong>${oculto}</strong>.</p>
          <p style="font-size: 14px;">Si usted no lo pidió, comuníquese con la cooperativa de inmediato: durante las próximas ${horasEspera} horas su contraseña no se puede reiniciar.</p>
        </div>
      </body>
      </html>
    `;
    return this.enviarCorreo({ to, subject: 'Cambió el correo de su usuario', html, etiqueta: 'aviso de cambio de correo de usuario' });
  }

  /**
   * Aviso al correo anterior cuando el operador cambia el correo de acceso al portal (issue #27).
   */
  async sendAccessEmailChangedNotice({ to, nombre, codigoCorporativo, correoNuevo }) {
    const oculto = String(correoNuevo).replace(/^(.{2}).*(@.*)$/, '$1***$2');
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px;">
          <h1 style="margin: 0 0 12px 0; font-size: 18px;">Cambió el correo de su acceso al portal</h1>
          <p style="font-size: 14px;">Estimado(a) <strong>${nombre || 'asociado'}</strong>, en la cooperativa se cambió el correo de su usuario <strong>${codigoCorporativo}</strong> a <strong>${oculto}</strong> y se envió allí un acceso nuevo.</p>
          <p style="font-size: 14px;">Si usted no lo pidió, comuníquese con la cooperativa de inmediato.</p>
        </div>
      </body>
      </html>
    `;
    return this.enviarCorreo({ to, subject: 'Cambió el correo de su acceso al portal', html, etiqueta: 'aviso de cambio de correo' });
  }

  /**
   * Código de 6 dígitos para verificar el correo en la afiliación en línea.
   */
  async sendVerificationCodeEmail({ to, codigo, minutos }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px;">
          <h1 style="margin: 0 0 12px 0; font-size: 18px;">Su código de verificación</h1>
          <p style="font-size: 14px;">Escriba este código en la página de afiliación para confirmar su correo:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0; font-family: 'Courier New', monospace;">${codigo}</p>
          <p style="font-size: 13px; color: #475569;">Vence en ${minutos} minutos. Si usted no está haciendo una afiliación en la cooperativa, ignore este correo; nadie podrá usar su correo sin este código.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 24px;">La cooperativa nunca le pedirá este código por teléfono.</p>
        </div>
      </body>
      </html>
    `;
    return this.enviarCorreo({ to, subject: `Su código de verificación: ${codigo}`, html, etiqueta: 'código de verificación' });
  }

  /**
   * Número de caso de una solicitud de afiliación para terminar en agencia.
   */
  async sendCaseNumberEmail({ to, nombre, numeroCaso }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px;">
          <h1 style="margin: 0 0 12px 0; font-size: 18px;">Su solicitud de afiliación</h1>
          <p style="font-size: 14px;">Estimado(a) <strong>${nombre || 'solicitante'}</strong>, registramos su solicitud. Su número de caso es:</p>
          <p style="font-size: 22px; font-weight: bold; text-align: center; margin: 24px 0; font-family: 'Courier New', monospace;">${numeroCaso}</p>
          <p style="font-size: 14px;">Preséntese en cualquier agencia del banco con su DPI original y este número para hacer su depósito inicial y terminar la afiliación.</p>
        </div>
      </body>
      </html>
    `;
    return this.enviarCorreo({ to, subject: `Su número de caso de afiliación: ${numeroCaso}`, html, etiqueta: 'número de caso' });
  }

  /**
   * Aviso de que la cooperativa rechazó uno de sus documentos de afiliación, con el motivo que escribió el operador.
   * No lleva el documento ni datos personales; se vuelve a subir desde el portal o se lleva a la agencia.
   *
   * @param {Object} datos
   * @param {string} datos.to
   * @param {string} [datos.nombre] - Primer nombre.
   * @param {string} datos.documento - Nombre del documento (por ejemplo «DPI (frente)»).
   * @param {string} datos.motivo
   * @param {boolean} [datos.sinPortal] - No tiene usuario del portal (un solicitante): se le pide llevarlo a la agencia.
   * @returns {Promise<Object>} El resultado de `enviarCorreo` (ver `wasSent`).
   */
  async sendDocumentoRechazadoEmail({ to, nombre, documento, motivo, sinPortal = false }) {
    const indicacion = sinPortal
      ? 'Llévelo a cualquier agencia de la cooperativa para que lo escaneen; ahí terminamos su afiliación.'
      : 'Súbalo de nuevo desde la sección «Documentos» de su portal o llévelo a cualquier agencia.';
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px;">
          <h1 style="margin: 0 0 12px 0; font-size: 18px;">Necesitamos otra copia de un documento</h1>
          <p style="font-size: 14px;">Estimado(a) <strong>${escaparHtml(nombre || (sinPortal ? 'solicitante' : 'asociado'))}</strong>, revisamos su <strong>${escaparHtml(documento)}</strong> y no lo pudimos aceptar:</p>
          <p style="font-size: 14px; background: #f8fafc; border-left: 3px solid #b45309; padding: 10px 12px;">${escaparHtml(motivo)}</p>
          <p style="font-size: 14px;">${indicacion}</p>
        </div>
      </body>
      </html>
    `;
    return this.enviarCorreo({ to, subject: 'Necesitamos otra copia de un documento', html, etiqueta: 'documento rechazado' });
  }

  /**
   * Envía el correo con el Código QR y las instrucciones para vincular Google Authenticator
   */
  async sendMfaEnrollmentEmail({ to, nombre, codigoCorporativo, qrDataUrl, secretBase32 }) {
    const subject = '[SEGURIDAD INSTITUCIONAL] Configuración de Doble Factor de Autenticación (2FA) - Cooperativa Corporativa';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #064e3b, #047857); padding: 28px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 28px; }
          .qr-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; text-align: center; padding: 20px; margin: 20px 0; }
          .qr-img { width: 200px; height: 200px; display: inline-block; }
          .secret-code { font-family: monospace; font-size: 14px; letter-spacing: 2px; color: #047857; font-weight: bold; background: #e2e8f0; padding: 6px 12px; border-radius: 8px; display: inline-block; margin-top: 8px; }
          .step-list { margin: 15px 0; padding-left: 20px; font-size: 14px; line-height: 1.6; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px; text-align: center; font-size: 12px; color: #64748b; }
          .badge { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>COOPERATIVA CORPORACIÓN BANCARIA</h1>
            <p>Seguridad Bancaria y Protección de Cuentas</p>
          </div>
          <div class="content">
            <p>Estimado(a) <strong>${nombre || 'Usuario'}</strong>,</p>
            <p>Se ha generado exitosamente tu membresía y acceso al portal institucional con el código corporativo: <span class="badge">${codigoCorporativo}</span>.</p>
            <p>Para proteger tus transacciones financieras, hemos activado el <strong>Doble Factor de Autenticación (2FA)</strong>. Sigue estos pasos para vincular tu teléfono:</p>
            
            <ol class="step-list">
              <li>Descarga en tu teléfono <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> desde Google Play o App Store.</li>
              <li>Abre la aplicación y selecciona <strong>"Escanear código QR"</strong>.</li>
              <li>Apunta tu cámara al siguiente código QR:</li>
            </ol>

            <div class="qr-box">
              <img src="${qrDataUrl}" alt="Código QR 2FA" class="qr-img" />
              <p style="font-size: 12px; color: #64748b; margin-top: 10px;">¿No puedes escanearlo? Ingresa esta clave manual:</p>
              <div class="secret-code">${secretBase32}</div>
            </div>

            <p style="font-size: 13px; color: #475569;">A partir de ahora, cada vez que inicies sesión se te solicitará el código de 6 dígitos que genera la aplicación en tu celular.</p>
          </div>
          <div class="footer">
            <p>© 2026 Cooperativa Corporación Bancaria - Todos los derechos reservados.</p>
            <p>Este correo contiene información confidencial y de seguridad personal.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'seguridad@cooperativa.com'}>`,
      to: to || 'usuario@cooperativa.com',
      subject,
      html: htmlContent,
    };


    if (this.transporter && this.isVerified) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo 2FA enviado exitosamente vía ${this.activeProvider} a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId, simulado: false, provider: this.activeProvider };
      } catch (error) {
        console.warn(`[MAILER WARNING] No se pudo enviar por ${this.activeProvider} (${error.message}).`);
        return { success: true, simulado: true, error: error.message, provider: this.activeProvider };
      }
    } else {
      console.log(`[MAILER DEMO] Correo de verificación en dos pasos NO enviado (modo demostrativo) para ${to} (usuario ${codigoCorporativo}).`);
      return { success: true, simulado: true, provider: 'demo' };
    }
  }

  /**
   * Envía el correo formal de bienvenida con las credenciales de acceso institucional:
   * Código de Usuario y Contraseña Generada Criptográficamente. No incluye datos de 2FA: el usuario
   * la activa desde «Seguridad» (menú del usuario).
   * Si `password` viene vacío (el usuario la eligió él mismo), el correo no la incluye.
   */
  async sendAccountCredentialsEmail({
    to,
    nombre,
    codigoCorporativo,
    password,
    rolNombre,
  }) {
    const subject = `[CREDENCIALES DE ACCESO] Cuenta Institucional - Cooperativa Corporativa (${codigoCorporativo})`;
    const passwordTemporal = Boolean(password);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #0369a1, #0284c7); padding: 28px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 28px; }
          .creds-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 18px; margin: 20px 0; }
          .cred-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
          .cred-row:last-child { border-bottom: none; }
          .cred-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
          .cred-val { font-family: 'Courier New', monospace; font-size: 15px; font-weight: bold; color: #0f172a; background: #e2e8f0; padding: 4px 10px; border-radius: 6px; }
          .badge { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; }
          .alert-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin: 20px 0; font-size: 12px; color: #92400e; line-height: 1.5; }
          .qr-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; text-align: center; padding: 16px; margin: 20px 0; }
          .qr-img { width: 180px; height: 180px; display: inline-block; }
          .btn-portal { display: block; text-align: center; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px; margin: 24px 0 12px 0; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>COOPERATIVA CORPORACIÓN BANCARIA</h1>
            <p>Aprovisionamiento de Acceso y Credenciales Institucionales</p>
          </div>
          <div class="content">
            <p>Estimado(a) <strong>${nombre || 'Colaborador'}</strong>,</p>
            <p>Se ha creado exitosamente su cuenta de acceso en el sistema institucional con el perfil: <span class="badge">${rolNombre || 'USUARIO'}</span>.</p>
            
            <p>${passwordTemporal
              ? 'Por políticas de seguridad informática bancaria, su contraseña temporal ha sido generada aleatoriamente por el sistema:'
              : 'Para entrar al portal use su código de usuario y la contraseña que eligió al afiliarse:'}</p>

            <div class="creds-card">
              <div class="cred-row">
                <span class="cred-label">Usuario / Código:</span>
                <span class="cred-val">${codigoCorporativo}</span>
              </div>
              ${passwordTemporal ? `
              <div class="cred-row">
                <span class="cred-label">Contraseña Temporal:</span>
                <span class="cred-val" style="color: #0369a1; letter-spacing: 1px;">${password}</span>
              </div>` : ''}
              <div class="cred-row">
                <span class="cred-label">Correo Registrado:</span>
                <span style="font-size: 13px; color: #334155;">${to}</span>
              </div>
            </div>

            <div class="alert-box">
              ${passwordTemporal
                ? '<strong>Importante por Seguridad:</strong> Esta contraseña es de uso personal y confidencial. Por protocolo de ciberseguridad, el sistema le solicitará cambiarla obligatoriamente en su primer inicio de sesión.'
                : '<strong>Importante por Seguridad:</strong> La cooperativa nunca le pedirá su contraseña por correo ni por teléfono. Si no reconoce esta afiliación, comuníquese con nosotros.'}
            </div>

            <a href="http://localhost:3000/login" class="btn-portal">
              Acceder al Portal Institucional
            </a>
          </div>
          <div class="footer">
            <p>© 2026 Cooperativa Corporación Bancaria - Todos los derechos reservados.</p>
            <p>Mensaje confidencial emitido por el sistema automatizado de seguridad bancaria.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'seguridad@cooperativa.com'}>`,
      to: to || 'usuario@cooperativa.com',
      subject,
      html: htmlContent,
    };


    if (this.transporter && this.isVerified) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo de credenciales enviado vía ${this.activeProvider} a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId, simulado: false, provider: this.activeProvider };
      } catch (error) {
        console.warn(`[MAILER WARNING] No se pudo enviar por ${this.activeProvider} (${error.message}).`);
        return { success: true, simulado: true, error: error.message, provider: this.activeProvider };
      }
    } else {
      console.log(`[MAILER DEMO] Correo de credenciales NO enviado (modo demostrativo) para ${to} (usuario ${codigoCorporativo}).`);
      return { success: true, simulado: true, provider: 'demo' };
    }
  }

  /**
   * Envía correo de notificación y entrega confidencial de contraseña temporal tras reinicio administrativo
   */
  async sendPasswordResetEmail({
    to,
    nombre,
    codigoCorporativo,
    password,
    rolNombre,
  }) {
    const subject = `[SEGURIDAD] Reinicio de Contraseña Institucional - Cooperativa (${codigoCorporativo})`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #0c4a6e, #0284c7); padding: 28px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 28px; }
          .creds-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 14px; padding: 18px; margin: 20px 0; }
          .cred-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
          .cred-row:last-child { border-bottom: none; }
          .cred-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
          .cred-val { font-family: 'Courier New', monospace; font-size: 15px; font-weight: bold; color: #0f172a; background: #e2e8f0; padding: 4px 10px; border-radius: 6px; }
          .alert-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin: 20px 0; font-size: 12px; color: #92400e; line-height: 1.5; }
          .btn-portal { display: block; text-align: center; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px; margin: 24px 0 12px 0; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>COOPERATIVA CORPORATIVA</h1>
            <p>Reinicio de Contraseña Institucional</p>
          </div>
          <div class="content">
            <p>Estimado(a) <strong>${nombre || 'Usuario'}</strong>,</p>
            <p>El Administrador del sistema ha reiniciado su contraseña de acceso institucional para el usuario <strong style="color: #0c4a6e;">${codigoCorporativo}</strong>${rolNombre ? ` (${rolNombre})` : ''}.</p>
            
            <p>Por políticas de ciberseguridad, se ha generado una contraseña temporal criptográficamente segura para su cuenta:</p>

            <div class="creds-card">
              <div class="cred-row">
                <span class="cred-label">Usuario / Código:</span>
                <span class="cred-val">${codigoCorporativo}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Contraseña Temporal:</span>
                <span class="cred-val" style="color: #0369a1; letter-spacing: 1px;">${password}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Correo Destino:</span>
                <span style="font-size: 13px; color: #334155;">${to}</span>
              </div>
            </div>

            <div class="alert-box">
              <strong>Cambio Obligatorio al Iniciar Sesión:</strong> Esta contraseña temporal es de un solo uso. Al ingresar al sistema con esta clave, la plataforma le solicitará inmediatamente establecer su nueva contraseña personal y definitiva.
            </div>

            <a href="http://localhost:3000/login" class="btn-portal">
              Ir al Inicio de Sesión
            </a>
          </div>
          <div class="footer">
            <p>© 2026 Cooperativa Corporativa - Todos los derechos reservados.</p>
            <p>Este es un correo automático de seguridad bancaria, por favor no responda a este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'seguridad@cooperativa.com'}>`,
      to: to || 'usuario@cooperativa.com',
      subject,
      html: htmlContent,
    };


    if (this.transporter && this.isVerified) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[MAILER] Correo de reinicio de contraseña enviado vía ${this.activeProvider} a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId, simulado: false, provider: this.activeProvider };
      } catch (error) {
        console.warn(`[MAILER WARNING] No se pudo enviar por ${this.activeProvider} (${error.message}).`);
        return { success: true, simulado: true, error: error.message, provider: this.activeProvider };
      }
    } else {
      console.log(`[MAILER DEMO] Correo de reinicio de contraseña NO enviado (modo demostrativo) para ${to} (usuario ${codigoCorporativo}).`);
      return { success: true, simulado: true, provider: 'demo' };
    }
  }

  /**
   * Envía por correo la boleta oficial de apertura de cuenta y depósito inicial.
   */
  async sendAccountOpeningReceiptEmail({ to, nombre, numeroCuenta, tipoCuenta, montoApertura, origenFondos, fechaApertura }) {
    const subject = `Comprobante Oficial de Apertura de Cuenta: ${numeroCuenta}`;
    const montoFormateado = `Q${parseFloat(montoApertura || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`;
    const fechaTexto = fechaApertura ? new Date(fechaApertura).toLocaleString('es-GT') : new Date().toLocaleString('es-GT');
    const ORIGENES = {
      EFECTIVO_VENTANILLA: 'Efectivo en Ventanilla',
      CUENTA_INTERNA: 'Cuenta Interna Cooperativa',
      BANCO_EXTERNO: 'Cuenta del Asociado en el Banco',
    };
    const origenTexto = ORIGENES[origenFondos] || ORIGENES.EFECTIVO_VENTANILLA;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #0c4a6e; padding: 28px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { margin: 6px 0 0 0; font-size: 13px; color: #38bdf8; }
          .content { padding: 32px 28px; }
          .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
          .receipt-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
          .receipt-row:last-child { border-bottom: none; }
          .receipt-label { color: #64748b; font-weight: 500; }
          .receipt-value { color: #0f172a; font-weight: 700; }
          .amount-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; text-align: center; margin: 16px 0; }
          .amount-val { font-size: 24px; font-weight: 800; color: #065f46; margin: 0; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>COOPERATIVA INTEGRAL R.L.</h1>
            <p>Comprobante Oficial de Apertura y Depósito Inicial</p>
          </div>
          <div class="content">
            <div class="greeting">Estimado(a) ${nombre || 'Asociado(a)'},</div>
            <p style="color: #475569; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
              Le confirmamos la apertura exitosa de su nueva cuenta financiera en nuestra institución. Adjuntamos el detalle del movimiento:
            </p>
            
            <div class="receipt-card">
              <div class="receipt-row">
                <span class="receipt-label">Producto:</span>
                <span class="receipt-value">${tipoCuenta || 'Cuenta de Ahorro'}</span>
              </div>
              <div class="receipt-row">
                <span class="receipt-label">No. de Cuenta:</span>
                <span class="receipt-value" style="font-family: monospace; color: #0369a1;">${numeroCuenta}</span>
              </div>
              <div class="receipt-row">
                <span class="receipt-label">Origen de Fondos:</span>
                <span class="receipt-value">${origenTexto}</span>
              </div>
              <div class="receipt-row">
                <span class="receipt-label">Fecha y Hora:</span>
                <span class="receipt-value">${fechaTexto}</span>
              </div>
            </div>

            <div class="amount-box">
              <span style="font-size: 11px; color: #047857; text-transform: uppercase; font-weight: 700;">Saldo Inicial Acreditado</span>
              <p class="amount-val">${montoFormateado}</p>
            </div>

            <p style="color: #64748b; font-size: 12px; line-height: 1.4; margin: 16px 0 0 0;">
              Puede consultar los movimientos, estado de cuenta y comprobantes ingresando a nuestra banca en línea.
            </p>
          </div>
          <div class="footer">
            <p>© 2026 Cooperativa Integral de Ahorro y Crédito, R.L. - Todos los derechos reservados.</p>
            <p>Este es un comprobante electrónico oficial generado automáticamente.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: this.from || `Cooperativa Corporativa <${this.currentUser || 'operaciones@cooperativa.com'}>`,
      to: to || 'asociado@cooperativa.com',
      subject,
      html: htmlContent,
    };


    if (this.transporter && this.isVerified) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[MAILER] Boleta de apertura enviada a ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId, simulado: false, provider: this.activeProvider };
      } catch (error) {
        console.warn(`[MAILER WARNING] No se pudo enviar boleta (${error.message}).`);
        return { success: true, simulado: true, error: error.message, provider: this.activeProvider };
      }
    } else {
      console.log(`[MAILER DEMO] Boleta de apertura NO enviada (modo demostrativo) para ${to} (cuenta ${numeroCuenta}).`);
      return { success: true, simulado: true, provider: 'demo' };
    }
  }
}

const mailerService = new MailerService();

// El transporte se prepara de forma asíncrona fuera del constructor: un constructor no debe lanzar trabajo asíncrono.
mailerService.initTransporter().catch((err) => {
  console.warn('[MAILER] Error durante la inicialización:', err.message);
});

module.exports = mailerService;
