process.env.MAIL_ENABLED = 'true';

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));

const mailerService = require('../../src/services/mailerService');

describe('remitenteSmtp (issue #126)', () => {
  test('acepta «Nombre <correo>» o un correo solo', () => {
    expect(mailerService.remitenteSmtp('Cooperativa <avisos@coop.com>', 'usuario')).toBe(
      'Cooperativa <avisos@coop.com>'
    );
    expect(mailerService.remitenteSmtp('avisos@coop.com', 'usuario')).toBe('avisos@coop.com');
  });

  test('sin remitente usa el usuario cuando es un correo', () => {
    expect(mailerService.remitenteSmtp('', 'avisos@coop.com')).toBe('Cooperativa Corporativa <avisos@coop.com>');
  });

  test.each([
    ['sin remitente y usuario que no es correo', '', 'pruebas'],
    ['correo inválido', 'Cooperativa <avisos>', 'pruebas'],
    ['salto de línea', 'avisos@coop.com\r\nBcc: otro@x.com', 'pruebas'],
    ['otra dirección en el nombre', '"x, jefe@otro.com" <avisos@coop.com>', 'pruebas'],
  ])('rechaza %s', (_caso, from, usuario) => {
    expect(() => mailerService.remitenteSmtp(from, usuario)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('configureSmtpService valida antes de conectarse', () => {
  const base = { host: 'smtp.coop.com', port: 587, user: 'avisos@coop.com', password: 'secreta', from: '' };

  test.each([
    ['un puerto que no es de correo (la base de datos)', { port: 5432 }],
    ['un servidor con caracteres no válidos', { host: 'smtp.coop.com;rm' }],
    ['sin usuario', { user: ' ' }],
    ['sin contraseña', { password: '' }],
  ])('rechaza %s', async (_caso, cambio) => {
    await expect(mailerService.configureSmtpService({ ...base, ...cambio })).rejects.toMatchObject({ statusCode: 400 });
  });
});
