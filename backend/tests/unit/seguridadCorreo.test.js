process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba-unitaria';

const { cifrar, descifrar, estaCifrado } = require('../../src/utils/cifradoConfiguracion');
const { esDireccionInterna, resolverDireccionPublica } = require('../../src/utils/direccionesInternas');

describe('cifrado de la configuración del correo', () => {
  test('cifra y descifra; dos cifrados del mismo texto son distintos', () => {
    const a = cifrar('clave-del-correo');
    const b = cifrar('clave-del-correo');
    expect(estaCifrado(a)).toBe(true);
    expect(a).not.toContain('clave-del-correo');
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe('clave-del-correo');
  });

  test('un valor de antes del cifrado se devuelve tal cual', () => {
    expect(descifrar('guardada-en-claro')).toBe('guardada-en-claro');
  });

  test('un valor alterado o de otra clave no se descifra', () => {
    const valor = cifrar('clave-del-correo');
    const alterado = valor.slice(0, -4) + (valor.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(descifrar(alterado)).toBeNull();
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'otro-secreto';
    expect(descifrar(valor)).toBeNull();
    process.env.JWT_SECRET = original;
  });
});

describe('direcciones internas', () => {
  test.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.18.0.5',
    '192.168.0.2',
    '169.254.169.254',
    '100.78.111.113',
    '0.0.0.0',
    '::1',
    'fd12::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '64:ff9b::a00:1',
    '2002:a00:1::1',
    '::7f00:1',
    'fec0::1',
  ])('%s es interna', (ip) => {
    expect(esDireccionInterna(ip)).toBe(true);
  });

  test.each(['8.8.8.8', '142.250.1.108', '2607:f8b0:4004::1'])('%s es pública', (ip) => {
    expect(esDireccionInterna(ip)).toBe(false);
  });

  test('un nombre que lleva a la propia máquina no se acepta', async () => {
    await expect(resolverDireccionPublica('localhost')).resolves.toBeNull();
    await expect(resolverDireccionPublica('127.0.0.1')).resolves.toBeNull();
  });
});
