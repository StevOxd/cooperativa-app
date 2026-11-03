const { errorDeNegocio, respuestaDeError, estadoPorFalloDelBanco } = require('../../src/utils/errores');
const { fechaValida, diasEntre, entreDiasGuatemala } = require('../../src/utils/fechas');
const { esId, filtroUsuario } = require('../../src/utils/identificadores');
const { formatoQ, leerMonto } = require('../../src/utils/montos');
const { PARENTESCOS, normalizarParentesco } = require('../../src/utils/parentesco');
const { validatePassword, PASSWORD_MIN_LENGTH } = require('../../src/utils/passwordPolicy');
const { ipDelCliente, userAgentDe } = require('../../src/utils/ipCliente');

describe('errores', () => {
  test('un error de negocio conserva su estado, mensaje y código', () => {
    const error = errorDeNegocio(403, 'No permitido', 'AUTOATENCION_NO_PERMITIDA');
    expect(respuestaDeError(error, 'genérico')).toEqual({
      status: 403,
      message: 'No permitido',
      codigo: 'AUTOATENCION_NO_PERMITIDA',
    });
  });

  test('un error inesperado no revela su detalle', () => {
    expect(respuestaDeError(new Error('detalle de la base'), 'genérico')).toEqual({ status: 500, message: 'genérico' });
  });

  test.each([
    [403, 403],
    [undefined, 502],
    [500, 502],
    [504, 502],
    [404, 400],
  ])('el fallo %p del banco responde %p', (status, esperado) => {
    expect(estadoPorFalloDelBanco(status)).toBe(esperado);
  });
});

describe('fechas', () => {
  test.each([
    ['2026-02-28', true],
    ['2024-02-29', true],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['01/02/2026', false],
    [20260101, false],
  ])('fechaValida(%p) es %p', (texto, esperado) => {
    expect(fechaValida(texto)).toBe(esperado);
  });

  test('diasEntre cuenta los días de diferencia', () => {
    expect(diasEntre('2026-01-01', '2026-01-01')).toBe(0);
    expect(diasEntre('2026-01-01', '2026-03-01')).toBe(59);
  });

  test('entreDiasGuatemala usa los parámetros consecutivos', () => {
    const condicion = entreDiasGuatemala('creado_en', 3);
    expect(condicion).toContain('$3::date');
    expect(condicion).toContain('$4::date + 1');
    expect(condicion).toContain('America/Guatemala');
  });
});

describe('identificadores', () => {
  test.each([
    ['5', true],
    [' 123456789 ', true],
    ['1234567890', false],
    ['+5', false],
    ['0x5', false],
    [null, false],
  ])('esId(%p) es %p', (valor, esperado) => {
    expect(esId(valor)).toBe(esperado);
  });

  test('filtroUsuario busca por id o por código, sin confundirlos', () => {
    expect(filtroUsuario('12')).toEqual({ condicion: 'u.id_usuario = $1', valor: 12 });
    expect(filtroUsuario('AD-1')).toEqual({ condicion: 'u.codigo_corporativo = $1', valor: 'AD-1' });
    expect(filtroUsuario('12', '').condicion).toBe('id_usuario = $1');
  });
});

describe('montos', () => {
  test('leerMonto acepta hasta 2 decimales', () => {
    expect(leerMonto('12.50')).toBe(12.5);
    expect(leerMonto(100)).toBe(100);
  });

  test.each([['12abc'], ['0'], ['-1'], ['1.234'], [''], [null], ['NaN'], ['1234567890123']])(
    'leerMonto rechaza %p',
    (valor) => {
      expect(() => leerMonto(valor)).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  );

  test('formatoQ muestra quetzales con 2 decimales', () => {
    expect(formatoQ(1234.5)).toMatch(/^Q1.234.50$/);
  });
});

describe('parentesco', () => {
  test.each([
    ['cónyuge', 'CONYUGE'],
    ['HIJA', 'HIJO/A'],
    [' madre ', 'PADRE/MADRE'],
    ['sobrino', 'SOBRINO/A'],
    ['vecino', null],
    [undefined, null],
  ])('normalizarParentesco(%p) es %p', (valor, esperado) => {
    expect(normalizarParentesco(valor)).toBe(esperado);
  });

  test('cada valor de la lista se reconoce a sí mismo', () => {
    PARENTESCOS.forEach((valor) => expect(normalizarParentesco(valor)).toBe(valor));
  });
});

describe('política de contraseñas', () => {
  test('acepta una contraseña con letras, números y símbolo', () => {
    expect(validatePassword('Clave123!')).toBeNull();
  });

  test.each([['corta1!'], ['sinnumeros!'], ['sinsimbolo123'], ['12345678!'], [12345678], [undefined]])(
    'rechaza %p',
    (valor) => {
      expect(validatePassword(valor)).toEqual(expect.any(String));
    }
  );

  test('el mínimo es de 8 caracteres', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('datos del cliente para la auditoría', () => {
  const peticion = (xff, remoteAddress = '10.0.0.1') => ({
    headers: { 'x-forwarded-for': xff },
    socket: { remoteAddress },
  });

  test('usa la última IP de X-Forwarded-For, la que agrega nginx', () => {
    expect(ipDelCliente(peticion('1.1.1.1, 192.0.2.7'))).toBe('192.0.2.7');
  });

  test('si el encabezado no trae una IP válida, usa la de la conexión', () => {
    expect(ipDelCliente(peticion('no-es-ip'))).toBe('10.0.0.1');
    expect(ipDelCliente(peticion(undefined, 'x'.repeat(46)))).toBeNull();
  });

  test('recorta el User-Agent a 500 caracteres', () => {
    expect(userAgentDe({ headers: { 'user-agent': 'a'.repeat(600) } })).toHaveLength(500);
    expect(userAgentDe('Mozilla')).toBe('Mozilla');
    expect(userAgentDe(undefined)).toBeNull();
  });
});
