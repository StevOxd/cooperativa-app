const nodemailer = require('nodemailer');
const { pool } = require('../config/db');

/**
 * Servicio Institucional de Despacho de Correo Electrónico
 * Soporta Google Mail (Gmail SMTP / Google Workspace), SMTP estándar y modo demostrativo bancario.
 */
/**
 * Interruptor general: con `MAIL_ENABLED=false` no se envía ningún correo, aunque haya
 * credenciales en las variables de entorno o en `configuracion_sistema`. Pensado para
 * pruebas automáticas y entornos donde no debe salir correo real.
 */
const isMailDisabled = () => String(process.env.MAIL_ENABLED || '').trim().toLowerCase() === 'false';

class MailerService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.isVerified = false;
    this.activeProvider = 'demo';
    this.currentUser = null;
    this.from = null;
    this.lastError = null;

    // Inicializar transporte de forma asíncrona
    this.initTransporter().catch((err) => {
      console.warn('[MAILER] Error durante la inicialización:', err.message);
    });
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
          if (map.GMAIL_USER) gmailUser = map.GMAIL_USER;
          if (map.GMAIL_APP_PASSWORD) gmailPass = map.GMAIL_APP_PASSWORD;
          if (map.MAIL_SERVICE) mailService = map.MAIL_SERVICE;
          if (map.EMAIL_FROM) emailFrom = map.EMAIL_FROM;
          if (map.SMTP_HOST) smtpHost = map.SMTP_HOST;
          if (map.SMTP_PORT) smtpPort = map.SMTP_PORT;
          if (map.SMTP_USER) smtpUser = map.SMTP_USER;
          if (map.SMTP_PASS) smtpPass = map.SMTP_PASS;
          if (map.SMTP_SECURE !== undefined) smtpSecure = map.SMTP_SECURE === 'true';
        }
      } catch (dbErr) {
        // La tabla aún no existe o la BD se está levantando; recurrir a process.env
      }

      // 1. Prioridad: Servicio de Google (Gmail / Google Workspace)
      const isGoogleActive =
        (mailService.toLowerCase() === 'google' || mailService.toLowerCase() === 'gmail') &&
        gmailUser &&
        gmailPass;

      if (isGoogleActive) {
        const cleanPass = gmailPass.replace(/\s+/g, '');
        const transport = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: cleanPass,
          },
          tls: {
            rejectUnauthorized: false, // Compatibilidad con entornos contenedores
          },
        });

        this.transporter = transport;
        this.isConfigured = true;
        this.activeProvider = 'google';
        this.currentUser = gmailUser;
        this.from = emailFrom || `Cooperativa Corporativa <${gmailUser}>`;

        // Verificación en segundo plano sin bloquear el arranque del servidor
        try {
          await this.transporter.verify();
          this.isVerified = true;
          this.lastError = null;
          console.log(`[MAILER] Conectado y verificado exitosamente con Google Mail (${gmailUser}).`);
        } catch (verifyErr) {
          this.isVerified = false;
          this.lastError = verifyErr.message;
          console.warn(`[MAILER WARNING] Credenciales de Google cargadas pero no verificadas (${verifyErr.message}).`);
        }
        return;
      }

      // 2. Servidor SMTP genérico
      if (smtpHost && smtpUser && smtpPass) {
        const transport = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort, 10),
          secure: smtpSecure || parseInt(smtpPort, 10) === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        this.transporter = transport;
        this.isConfigured = true;
        this.activeProvider = 'smtp';
        this.currentUser = smtpUser;
        this.from = emailFrom || `Cooperativa Financiera <${smtpUser}>`;

        try {
          await this.transporter.verify();
          this.isVerified = true;
          this.lastError = null;
          console.log(`[MAILER] Conectado exitosamente a servidor SMTP (${smtpHost}).`);
        } catch (verifyErr) {
          this.isVerified = false;
          this.lastError = verifyErr.message;
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
      throw new Error('Debe proporcionar una cuenta de correo de Google válida.');
    }
    if (!appPassword || appPassword.trim().length < 8) {
      throw new Error('Debe proporcionar la Contraseña de Aplicación de 16 caracteres de Google.');
    }

    const cleanPass = appPassword.replace(/\s+/g, '');
    const sender = from && from.trim() ? from.trim() : `Cooperativa Corporativa <${user.trim()}>`;

    // 1. Probar la conexión con Google antes de guardar
    const testTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

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

    // 2. Persistir en la base de datos PostgreSQL
    try {
      await pool.query(
        `INSERT INTO configuracion_sistema (clave, valor, descripcion, actualizado_en)
         VALUES 
          ('GMAIL_USER', $1, 'Cuenta de correo de Google para envíos corporativos', NOW()),
          ('GMAIL_APP_PASSWORD', $2, 'Contraseña de aplicación de Google de 16 caracteres', NOW()),
          ('MAIL_SERVICE', 'google', 'Proveedor de servicio de correo activo', NOW()),
          ('EMAIL_FROM', $3, 'Nombre y remitente visible del correo', NOW())
         ON CONFLICT (clave) DO UPDATE 
         SET valor = EXCLUDED.valor, actualizado_en = NOW()`,
        [user.trim(), cleanPass, sender]
      );
    } catch (dbErr) {
      console.warn('[MAILER WARNING] No se pudo persistir en configuracion_sistema:', dbErr.message);
    }

    // 3. Actualizar estado en memoria
    this.transporter = testTransporter;
    this.isConfigured = true;
    this.isVerified = true;
    this.activeProvider = 'google';
    this.currentUser = user.trim();
    this.from = sender;
    this.lastError = null;

    // Sincronizar variables de proceso
    process.env.GMAIL_USER = user.trim();
    process.env.GMAIL_APP_PASSWORD = cleanPass;
    process.env.MAIL_SERVICE = 'google';
    process.env.EMAIL_FROM = sender;

    console.log(`[MAILER] Servicio de Google Mail configurado y activado exitosamente para ${user.trim()}.`);

    return {
      success: true,
      message: 'Gmail quedó conectado y verificado.',
      status: this.getStatus(),
    };
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
    };
  }

  /**
   * Envía un correo de prueba para validar el despacho en tiempo real
   */
  async sendTestEmail({ to }) {
    const subject = '[PRUEBA DE SERVICIO] Verificación Exitosa de Correo Google - Cooperativa Corporativa';
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
              <p class="status-desc">El despacho de notificaciones a través de Google Mail está funcionando correctamente.</p>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Este es un correo de prueba generado automáticamente desde el panel de administración institucional de la Cooperativa. Todos los correos de creación de asociados, contraseñas temporales y tokens de seguridad 2FA se enviarán mediante este canal.
            </p>

            <table class="meta-table">
              <tr>
                <td>Proveedor Activo:</td>
                <td><strong>${this.activeProvider === 'google' ? 'Google Mail (Gmail SMTP)' : this.activeProvider.toUpperCase()}</strong></td>
              </tr>
              <tr>
                <td>Cuenta Remitente:</td>
                <td><code>${this.currentUser || 'Modo Demostrativo'}</code></td>
              </tr>
              <tr>
                <td>Destinatario:</td>
                <td><code>${to}</code></td>
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
   * Código de Usuario, Contraseña Generada Criptográficamente y (si aplica) Código QR de 2FA.
   * Si `password` viene vacío (el usuario la eligió él mismo), el correo no la incluye.
   */
  async sendAccountCredentialsEmail({
    to,
    nombre,
    codigoCorporativo,
    password,
    rolNombre,
    qrDataUrl,
    secretBase32,
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
    const origenTexto = origenFondos === 'EFECTIVO_VENTANILLA' ? 'Efectivo en Ventanilla' : 'Cuenta Interna Cooperativa';

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

module.exports = new MailerService();
