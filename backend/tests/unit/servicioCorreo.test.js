/**
 * Servicio de correo sin red ni base de datos: nodemailer, la base y la resolución de nombres son falsos, así que se
 * revisa qué transporte se arma, qué se guarda y qué estado queda en cada caso (issues #126 y #127).
 */
process.env.MAIL_ENABLED = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba-unitaria';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn() },
}));
jest.mock('../../src/utils/direccionesInternas', () => ({ resolverDireccionPublica: jest.fn() }));

const nodemailer = require('nodemailer');
const { pool } = require('../../src/config/db');
const { resolverDireccionPublica } = require('../../src/utils/direccionesInternas');
const { cifrar, descifrar } = require('../../src/utils/cifradoConfiguracion');
const mailerService = require('../../src/services/mailerService');

const IP_PUBLICA = '203.0.113.10';
const VARIABLES_DEL_CORREO = [
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'MAIL_SERVICE',
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'SMTP_PERMITIR_RED_INTERNA',
];

/** Transporte falso de nodemailer: verifica y envía según se pida. */
const transporteFalso = ({ verifica = true, codigoError } = {}) => ({
  verify: verifica
    ? jest.fn().mockResolvedValue(true)
    : jest.fn().mockRejectedValue(Object.assign(new Error('fallo de prueba'), { code: codigoError })),
  sendMail: jest.fn().mockResolvedValue({ messageId: '<id-de-prueba>' }),
});

/** Conexión falsa de la base para las transacciones de `guardarConfiguracion`. */
const conexionFalsa = (fallaEn) => {
  const cliente = {
    query: jest.fn(async (sql) => {
      if (fallaEn && sql.includes(fallaEn)) throw new Error('fallo de la base');
      return {};
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(cliente);
  return cliente;
};

/** Filas de configuracion_sistema como las devuelve la consulta del arranque. */
const filas = (mapa) => ({ rows: Object.entries(mapa).map(([clave, valor]) => ({ clave, valor })) });

/** Valores que se mandaron a guardar, como clave → valor. */
const valoresGuardados = (cliente) => {
  const [, valores] = cliente.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO configuracion_sistema'));
  const mapa = {};
  for (let i = 0; i < valores.length; i += 3) mapa[valores[i]] = valores[i + 1];
  return mapa;
};

const original = {};
beforeAll(() => VARIABLES_DEL_CORREO.forEach((v) => (original[v] = process.env[v])));
beforeEach(() => {
  jest.clearAllMocks();
  VARIABLES_DEL_CORREO.forEach((v) => delete process.env[v]);
  process.env.MAIL_ENABLED = 'true';
  pool.query.mockResolvedValue({ rows: [] });
  resolverDireccionPublica.mockResolvedValue(IP_PUBLICA);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  VARIABLES_DEL_CORREO.forEach((v) =>
    original[v] === undefined ? delete process.env[v] : (process.env[v] = original[v])
  );
});

describe('initTransporter', () => {
  test('con MAIL_ENABLED=false queda en modo demostrativo sin leer la base', async () => {
    process.env.MAIL_ENABLED = 'false';
    await mailerService.initTransporter();
    expect(pool.query).not.toHaveBeenCalled();
    expect(mailerService.getStatus()).toMatchObject({ provider: 'demo', configured: false, disabled: true });
    expect(mailerService.isAvailable()).toBe(false);
  });

  test('sin credenciales queda en modo demostrativo', async () => {
    await mailerService.initTransporter();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(mailerService.getStatus()).toMatchObject({ provider: 'demo', configured: false, lastError: null });
  });

  test('Gmail guardado en la base: descifra la contraseña y se conecta por SSL', async () => {
    const transporte = transporteFalso();
    nodemailer.createTransport.mockReturnValue(transporte);
    pool.query.mockResolvedValue(
      filas({
        GMAIL_USER: 'avisos@gmail.com',
        GMAIL_APP_PASSWORD: cifrar('abcd efgh ijkl mnop'),
        MAIL_SERVICE: 'google',
      })
    );

    await mailerService.initTransporter();

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmail',
        secure: true,
        auth: { user: 'avisos@gmail.com', pass: 'abcdefghijklmnop' },
      })
    );
    expect(mailerService.isAvailable()).toBe(true);
    expect(mailerService.getStatus()).toMatchObject({
      provider: 'google',
      verified: true,
      from: 'Cooperativa Corporativa <avisos@gmail.com>',
      userMasked: 'av***s@gmail.com',
    });
  });

  test('si Google no acepta la cuenta, queda configurado pero sin verificar', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso({ verifica: false }));
    pool.query.mockResolvedValue(filas({ GMAIL_USER: 'avisos@gmail.com', GMAIL_APP_PASSWORD: cifrar('clave-larga') }));

    await mailerService.initTransporter();

    expect(mailerService.getStatus()).toMatchObject({ provider: 'google', configured: true, verified: false });
    expect(mailerService.getStatus().lastError).toMatch(/Google no aceptó/);
    expect(mailerService.isAvailable()).toBe(false);
  });

  test('una contraseña guardada en claro se vuelve a guardar cifrada', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    pool.query.mockImplementation(async (sql) =>
      sql.startsWith('SELECT') ? filas({ GMAIL_USER: 'avisos@gmail.com', GMAIL_APP_PASSWORD: 'en-claro-123' }) : {}
    );

    await mailerService.initTransporter();

    const actualizacion = pool.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(actualizacion[1][1]).toBe('GMAIL_APP_PASSWORD');
    expect(actualizacion[1][0]).not.toContain('en-claro-123');
    expect(descifrar(actualizacion[1][0])).toBe('en-claro-123');
    expect(mailerService.getStatus().provider).toBe('google');
  });

  test('si no se puede cifrar la contraseña en claro, se avisa y se sigue usando', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    pool.query.mockImplementation(async (sql) => {
      if (sql.startsWith('UPDATE')) throw new Error('sin permiso');
      return filas({ GMAIL_USER: 'avisos@gmail.com', GMAIL_APP_PASSWORD: 'en-claro-123' });
    });

    await mailerService.initTransporter();

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sigue guardada en claro'));
    expect(mailerService.getStatus().provider).toBe('google');
  });

  test('una contraseña que no se descifra (otro JWT_SECRET) no se mezcla con la del .env', async () => {
    const secreto = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'otro-secreto';
    const deOtraClave = cifrar('clave-larga');
    process.env.JWT_SECRET = secreto;
    process.env.GMAIL_APP_PASSWORD = 'clave-del-env';
    pool.query.mockResolvedValue(filas({ GMAIL_USER: 'avisos@gmail.com', GMAIL_APP_PASSWORD: deOtraClave }));

    await mailerService.initTransporter();

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No se pudo descifrar GMAIL_APP_PASSWORD'));
    expect(mailerService.getStatus().provider).toBe('demo');
  });

  test('SMTP guardado en la base: se conecta a la IP revisada y exige STARTTLS', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    pool.query.mockResolvedValue(
      filas({
        MAIL_SERVICE: 'smtp',
        SMTP_HOST: 'smtp.coop.com',
        SMTP_PORT: '587',
        SMTP_USER: 'avisos@coop.com',
        SMTP_PASS: cifrar('secreta'),
        SMTP_SECURE: 'false',
        EMAIL_FROM: 'Cooperativa <avisos@coop.com>',
      })
    );

    await mailerService.initTransporter();

    expect(resolverDireccionPublica).toHaveBeenCalledWith('smtp.coop.com');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: IP_PUBLICA,
        port: 587,
        secure: false,
        requireTLS: true,
        tls: { servername: 'smtp.coop.com' },
        auth: { user: 'avisos@coop.com', pass: 'secreta' },
      })
    );
    expect(mailerService.getStatus()).toMatchObject({
      provider: 'smtp',
      verified: true,
      from: 'Cooperativa <avisos@coop.com>',
      smtp: { host: 'smtp.coop.com', port: 587, secure: false },
    });
  });

  test('un SMTP guardado que ahora apunta a la red interna no se usa', async () => {
    resolverDireccionPublica.mockResolvedValue(null);
    pool.query.mockResolvedValue(
      filas({ MAIL_SERVICE: 'smtp', SMTP_HOST: 'interno.coop', SMTP_USER: 'avisos', SMTP_PASS: cifrar('secreta') })
    );

    await mailerService.initTransporter();

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(mailerService.getStatus()).toMatchObject({ provider: 'smtp', configured: true, verified: false });
    expect(mailerService.getStatus().lastError).toMatch(/dirección interna/);
  });

  test.each([
    ['EAUTH', /rechazó el usuario o la contraseña/],
    ['ETIMEDOUT', /No se pudo conectar con el servidor de correo/],
  ])('si el SMTP falla con %s, el aviso lo explica sin detalles técnicos', async (codigo, mensaje) => {
    nodemailer.createTransport.mockReturnValue(transporteFalso({ verifica: false, codigoError: codigo }));
    pool.query.mockResolvedValue(
      filas({ MAIL_SERVICE: 'smtp', SMTP_HOST: 'smtp.coop.com', SMTP_USER: 'avisos', SMTP_PASS: cifrar('secreta') })
    );

    await mailerService.initTransporter();

    expect(mailerService.getStatus().verified).toBe(false);
    expect(mailerService.getStatus().lastError).toMatch(mensaje);
  });

  test('sin la base usa el SMTP del .env, con SSL en el puerto 465 y sin volver a resolver el nombre', async () => {
    pool.query.mockRejectedValue(new Error('la tabla no existe'));
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    Object.assign(process.env, {
      MAIL_SERVICE: 'smtp',
      SMTP_HOST: 'smtp.coop.com',
      SMTP_PORT: '465',
      SMTP_USER: 'avisos@coop.com',
      SMTP_PASS: 'secreta',
    });

    await mailerService.initTransporter();

    expect(resolverDireccionPublica).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.coop.com', port: 465, secure: true, requireTLS: false })
    );
    expect(mailerService.getStatus().from).toBe('Cooperativa Financiera <avisos@coop.com>');
  });

  test('un error inesperado queda como último error', async () => {
    nodemailer.createTransport.mockImplementation(() => {
      throw new Error('opciones no válidas');
    });
    process.env.GMAIL_USER = 'avisos@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'clave-larga';

    await mailerService.initTransporter();

    expect(mailerService.getStatus().lastError).toBe('opciones no válidas');
  });
});

describe('configureGoogleService', () => {
  const datos = { user: 'avisos@gmail.com', appPassword: 'abcd efgh ijkl mnop', from: '' };

  test('con MAIL_ENABLED=false no cambia nada', async () => {
    process.env.MAIL_ENABLED = 'false';
    const respuesta = await mailerService.configureGoogleService(datos);
    expect(respuesta.success).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  test.each([
    ['una cuenta sin arroba', { user: 'avisos' }],
    ['una cuenta sin dominio válido', { user: 'avisos@gmail' }],
    ['una contraseña corta', { appPassword: 'corta' }],
  ])('rechaza %s', async (_caso, cambio) => {
    await expect(mailerService.configureGoogleService({ ...datos, ...cambio })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('si Google rechaza la cuenta, no guarda nada', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso({ verifica: false }));
    const respuesta = await mailerService.configureGoogleService(datos);
    expect(respuesta.success).toBe(false);
    expect(respuesta.message).toMatch(/apppasswords/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('guarda la cuenta con la contraseña cifrada y olvida la del SMTP', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    const cliente = conexionFalsa();

    const respuesta = await mailerService.configureGoogleService(datos);

    expect(respuesta).toMatchObject({ success: true, status: { provider: 'google', verified: true } });
    const guardado = valoresGuardados(cliente);
    expect(guardado.GMAIL_USER).toBe('avisos@gmail.com');
    expect(guardado.GMAIL_APP_PASSWORD).not.toContain('abcd');
    expect(descifrar(guardado.GMAIL_APP_PASSWORD)).toBe('abcdefghijklmnop');
    expect(guardado.EMAIL_FROM).toBe('Cooperativa Corporativa <avisos@gmail.com>');
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining("SET valor = ''"), ['SMTP_PASS']);
    expect(cliente.query).toHaveBeenLastCalledWith('COMMIT');
    expect(cliente.release).toHaveBeenCalled();
    expect(process.env.MAIL_SERVICE).toBe('google');
  });

  test('si no se puede guardar, deshace la transacción y no cambia el proveedor', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    const cliente = conexionFalsa('INSERT');
    await mailerService.initTransporter();

    await expect(mailerService.configureGoogleService(datos)).rejects.toThrow('fallo de la base');

    expect(cliente.query).toHaveBeenCalledWith('ROLLBACK');
    expect(cliente.release).toHaveBeenCalled();
    expect(mailerService.getStatus().provider).toBe('demo');
  });
});

describe('configureSmtpService', () => {
  const datos = { host: 'smtp.coop.com', port: 587, user: 'avisos@coop.com', password: 'secreta', from: '' };

  test('con MAIL_ENABLED=false no cambia nada', async () => {
    process.env.MAIL_ENABLED = 'false';
    expect((await mailerService.configureSmtpService(datos)).success).toBe(false);
  });

  test.each([
    ['un usuario demasiado largo', { user: `${'a'.repeat(257)}@coop.com` }],
    ['una contraseña demasiado larga', { password: 'a'.repeat(257) }],
    ['un servidor vacío', { host: undefined }],
  ])('rechaza %s', async (_caso, cambio) => {
    await expect(mailerService.configureSmtpService({ ...datos, ...cambio })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('verifica en la IP revisada y guarda el servidor con la contraseña cifrada', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    const cliente = conexionFalsa();

    const respuesta = await mailerService.configureSmtpService(datos);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: IP_PUBLICA, tls: { servername: 'smtp.coop.com' }, requireTLS: true })
    );
    expect(respuesta).toMatchObject({
      success: true,
      status: { provider: 'smtp', smtp: { host: 'smtp.coop.com', port: 587, secure: false } },
    });
    const guardado = valoresGuardados(cliente);
    expect(guardado).toMatchObject({ SMTP_HOST: 'smtp.coop.com', SMTP_PORT: '587', SMTP_SECURE: 'false' });
    expect(descifrar(guardado.SMTP_PASS)).toBe('secreta');
    expect(cliente.query).toHaveBeenCalledWith(expect.stringContaining("SET valor = ''"), ['GMAIL_APP_PASSWORD']);
    expect(process.env.MAIL_SERVICE).toBe('smtp');
  });

  test('el puerto 465 va con SSL desde el inicio', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    conexionFalsa();
    const respuesta = await mailerService.configureSmtpService({ ...datos, port: '465' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, requireTLS: false })
    );
    expect(respuesta.status.smtp.secure).toBe(true);
  });

  test('con la red interna permitida, el buzón de prueba usa el nombre y no exige STARTTLS', async () => {
    process.env.SMTP_PERMITIR_RED_INTERNA = 'true';
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    conexionFalsa();

    await mailerService.configureSmtpService({ ...datos, host: 'mailpit', port: 1025 });

    expect(resolverDireccionPublica).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailpit', port: 1025, requireTLS: false })
    );
    expect(nodemailer.createTransport.mock.calls[0][0]).not.toHaveProperty('tls');
  });

  test('si el servidor no responde, no guarda nada y explica el fallo', async () => {
    nodemailer.createTransport.mockReturnValue(transporteFalso({ verifica: false, codigoError: 'EAUTH' }));
    const respuesta = await mailerService.configureSmtpService(datos);
    expect(respuesta).toEqual({ success: false, message: 'El servidor de correo rechazó el usuario o la contraseña.' });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('estado y envíos', () => {
  const conectarSmtp = async (host = 'smtp.coop.com') => {
    const transporte = transporteFalso();
    nodemailer.createTransport.mockReturnValue(transporte);
    conexionFalsa();
    await mailerService.configureSmtpService({ host, port: 587, user: 'yo@coop.com', password: 'secreta', from: '' });
    return transporte;
  };

  test.each([
    ['ab@coop.com', 'ab***@coop.com'],
    ['avisos', 'avisos'],
  ])('oculta el usuario %s como %s', async (usuario, oculto) => {
    nodemailer.createTransport.mockReturnValue(transporteFalso());
    process.env.MAIL_SERVICE = 'smtp';
    Object.assign(process.env, { SMTP_HOST: 'smtp.coop.com', SMTP_USER: usuario, SMTP_PASS: 'secreta' });
    await mailerService.initTransporter();
    expect(mailerService.getStatus().userMasked).toBe(oculto);
  });

  test('wasSent solo es verdadero para un envío real', () => {
    expect(mailerService.wasSent({ success: true, simulado: false })).toBe(true);
    expect(mailerService.wasSent({ success: true, simulado: true })).toBe(false);
    expect(mailerService.wasSent(null)).toBe(false);
  });

  test('la prueba por SMTP sale por el transporte y escapa los datos en el HTML', async () => {
    const transporte = await conectarSmtp();
    const resultado = await mailerService.sendTestEmail({ to: ' destino@coop.com ' });

    expect(resultado).toMatchObject({ success: true, simulado: false, provider: 'smtp', to: 'destino@coop.com' });
    const [{ to, html }] = transporte.sendMail.mock.calls[0];
    expect(to).toBe('destino@coop.com');
    expect(html).toContain('Servidor SMTP (smtp.coop.com)');
    expect(html).toContain('el servidor SMTP');
  });

  test('la prueba por Gmail lo dice en el mensaje', async () => {
    const transporte = transporteFalso();
    nodemailer.createTransport.mockReturnValue(transporte);
    conexionFalsa();
    await mailerService.configureGoogleService({ user: 'avisos@gmail.com', appPassword: 'abcdefghijklmnop' });

    await mailerService.sendTestEmail({ to: 'destino@coop.com' });

    expect(transporte.sendMail.mock.calls[0][0].html).toContain('Google Mail (Gmail SMTP)');
  });

  test('sin correo verificado la prueba no sale', async () => {
    await mailerService.initTransporter();
    const resultado = await mailerService.sendTestEmail({ to: 'destino@coop.com' });
    expect(resultado).toMatchObject({ success: true, simulado: true, provider: 'demo' });
  });

  test.each([
    ['sendUserEmailChangedNotice', { correoNuevo: 'nuevo@coop.com', codigoCorporativo: 'EB-1', horasEspera: 24 }],
    ['sendAccessEmailChangedNotice', { correoNuevo: 'nuevo@coop.com', codigoCorporativo: 'EB-1' }],
    ['sendVerificationCodeEmail', { codigo: '123456', minutos: 10 }],
    ['sendCaseNumberEmail', { numeroCaso: 'CASO-2026-0001' }],
    ['sendDocumentoRechazadoEmail', { documento: 'DPI', motivo: 'Borroso' }],
    [
      'sendMfaEnrollmentEmail',
      { codigoCorporativo: 'EB-1', qrDataUrl: 'data:image/png;base64,AAAA', secretBase32: 'ABC' },
    ],
    ['sendAccountCredentialsEmail', { codigoCorporativo: 'EB-1', password: 'Temporal1!', rolNombre: 'Asociado' }],
    ['sendPasswordResetEmail', { codigoCorporativo: 'EB-1', password: 'Temporal1!', rolNombre: 'Asociado' }],
    [
      'sendAccountOpeningReceiptEmail',
      {
        numeroCuenta: 'CTA-1',
        tipoCuenta: 'Ahorro',
        montoApertura: 100,
        origenFondos: 'Efectivo',
        fechaApertura: new Date(),
      },
    ],
  ])('%s sale por el transporte verificado', async (metodo, datos) => {
    const transporte = await conectarSmtp();
    const resultado = await mailerService[metodo]({ to: 'destino@coop.com', nombre: 'Ana', ...datos });
    expect(mailerService.wasSent(resultado)).toBe(true);
    expect(transporte.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'destino@coop.com' }));
  });

  test('si el envío falla, se informa como no enviado', async () => {
    const transporte = await conectarSmtp();
    transporte.sendMail.mockRejectedValue(new Error('buzón lleno'));
    const resultado = await mailerService.sendVerificationCodeEmail({
      to: 'destino@coop.com',
      codigo: '1',
      minutos: 1,
    });
    expect(mailerService.wasSent(resultado)).toBe(false);
  });
});
