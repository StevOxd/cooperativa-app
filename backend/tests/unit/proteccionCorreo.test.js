/**
 * Protecciones del cambio del correo del sistema: confirmación de identidad, registro de cada intento, cifrado de la
 * contraseña guardada y rechazo de servidores de la red interna (issue #126).
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba-unitaria';

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/services/mfaService', () => ({ verifyTotp: jest.fn() }));

const bcrypt = require('bcryptjs');
const dns = require('dns').promises;
const { pool } = require('../../src/config/db');
const mfaService = require('../../src/services/mfaService');
const { confirmarIdentidad } = require('../../src/services/confirmacionIdentidadService');
const { datosDelIntento, registrarCambioCorreo } = require('../../src/services/cambiosCorreoService');
const { cifrar } = require('../../src/utils/cifradoConfiguracion');
const { esDireccionInterna, resolverDireccionPublica } = require('../../src/utils/direccionesInternas');

const CLAVE = 'Clave123!';
const HASH = bcrypt.hashSync(CLAVE, 4);
const usuario = (cambios = {}) => ({
  rows: [{ password_hash: HASH, mfa_enabled: false, mfa_secret: null, estado: 'ACTIVO', bloqueado: false, ...cambios }],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('confirmarIdentidad', () => {
  test('sin contraseña no consulta la base', async () => {
    await expect(confirmarIdentidad(1, '')).resolves.toBe(false);
    await expect(confirmarIdentidad(1, undefined)).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([
    ['un usuario que no existe', { rows: [] }],
    ['un usuario inactivo', usuario({ estado: 'INACTIVO' })],
    ['un usuario bloqueado por intentos', usuario({ bloqueado: true })],
  ])('rechaza %s', async (_caso, resultado) => {
    pool.query.mockResolvedValue(resultado);
    await expect(confirmarIdentidad(1, CLAVE)).resolves.toBe(false);
  });

  test('rechaza una contraseña equivocada', async () => {
    pool.query.mockResolvedValue(usuario());
    await expect(confirmarIdentidad(1, 'Otra123!')).resolves.toBe(false);
  });

  test('acepta la contraseña correcta sin 2FA', async () => {
    pool.query.mockResolvedValue(usuario());
    await expect(confirmarIdentidad(1, CLAVE)).resolves.toBe(true);
    expect(mfaService.verifyTotp).not.toHaveBeenCalled();
  });

  test('con 2FA activo también exige el código', async () => {
    pool.query.mockResolvedValue(usuario({ mfa_enabled: true, mfa_secret: 'SECRETO' }));
    mfaService.verifyTotp.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await expect(confirmarIdentidad(1, CLAVE, '000000')).resolves.toBe(false);
    await expect(confirmarIdentidad(1, CLAVE, '123456')).resolves.toBe(true);
    expect(mfaService.verifyTotp).toHaveBeenLastCalledWith('SECRETO', '123456');
  });
});

describe('datosDelIntento', () => {
  test('de un SMTP guarda el servidor, el puerto y el usuario, nunca la contraseña', () => {
    const datos = datosDelIntento('smtp', {
      smtp_host: ' smtp.coop.com ',
      smtp_port: '587',
      smtp_user: 'avisos@coop.com',
      smtp_pass: 'secreta',
    });
    expect(datos).toEqual({
      proveedor: 'smtp',
      servidor: 'smtp.coop.com',
      puerto: 587,
      usuario_correo: 'avisos@coop.com',
    });
  });

  test.each([['0'], ['70000'], ['5.5'], ['abc']])('un puerto %s no se guarda', (puerto) => {
    expect(datosDelIntento('smtp', { smtp_port: puerto }).puerto).toBeNull();
  });

  test('recorta los textos largos y descarta los que no son texto', () => {
    const datos = datosDelIntento('smtp', { smtp_host: 'a'.repeat(300), smtp_user: { otro: 'objeto' } });
    expect(datos.servidor).toHaveLength(253);
    expect(datos.usuario_correo).toBeNull();
  });

  test('de Gmail guarda la cuenta y el servidor de Google', () => {
    expect(datosDelIntento('google', { gmail_user: 'avisos@gmail.com' })).toEqual({
      proveedor: 'google',
      servidor: 'smtp.gmail.com',
      puerto: null,
      usuario_correo: 'avisos@gmail.com',
    });
  });
});

describe('registrarCambioCorreo', () => {
  const req = {
    user: { id_usuario: 7 },
    headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'Navegador de prueba' },
    socket: { remoteAddress: '172.18.0.1' },
  };
  const datos = { proveedor: 'smtp', servidor: 'smtp.coop.com', puerto: 587, usuario_correo: 'avisos@coop.com' };

  test('guarda el intento con la IP y el navegador de quien lo hizo', async () => {
    pool.query.mockResolvedValue({});
    await registrarCambioCorreo(req, datos, 'APLICADO');
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cambios_correo_sistema'), [
      7,
      'smtp',
      'smtp.coop.com',
      587,
      'avisos@coop.com',
      'APLICADO',
      '198.51.100.7',
      'Navegador de prueba',
    ]);
  });

  test('si no se puede registrar la solicitud, el cambio no sigue', async () => {
    pool.query.mockRejectedValue(new Error('sin permiso'));
    await expect(registrarCambioCorreo(req, datos, 'SOLICITADO')).rejects.toThrow('sin permiso');
  });

  test('si falla el registro de un resultado, solo se avisa', async () => {
    pool.query.mockRejectedValue(new Error('sin permiso'));
    await expect(registrarCambioCorreo(req, datos, 'APLICADO')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[SECURITY WARN]'), 'sin permiso');
  });
});

describe('cifrado sin JWT_SECRET', () => {
  test('no cifra si falta la clave', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => cifrar('clave')).toThrow('JWT_SECRET no está definido.');
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});

describe('resolverDireccionPublica', () => {
  test('un texto que no es una IP cuenta como interno', () => {
    expect(esDireccionInterna('no-es-una-ip')).toBe(true);
  });

  test('devuelve la primera dirección si todas son públicas', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8' }, { address: '2607:f8b0:4004::1' }]);
    await expect(resolverDireccionPublica('smtp.coop.com')).resolves.toBe('8.8.8.8');
  });

  test('basta una dirección interna para rechazar el nombre', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8' }, { address: '10.0.0.5' }]);
    await expect(resolverDireccionPublica('smtp.coop.com')).resolves.toBeNull();
  });

  test.each([
    ['no se resuelve', () => Promise.reject(new Error('ENOTFOUND'))],
    ['no tiene direcciones', () => Promise.resolve([])],
  ])('un nombre que %s se rechaza', async (_caso, respuesta) => {
    jest.spyOn(dns, 'lookup').mockImplementation(respuesta);
    await expect(resolverDireccionPublica('smtp.coop.com')).resolves.toBeNull();
  });
});
