const {
  validateCui,
  validateAge18,
  validatePositiveAmount,
  validateMinimumAmount,
  validateBeneficiarios,
  validateCuiMiddleware,
  validateMontoMiddleware,
} = require('../../src/middlewares/validationMiddleware');

const respuestaFalsa = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('validateCui', () => {
  test('acepta 13 dígitos y limpia los espacios', () => {
    expect(validateCui(' 1234 567890123 ')).toEqual({ valid: true, clean: '1234567890123' });
  });

  test.each([[undefined], [''], [1234567890123], ['123'], ['12345678901234'], ['123456789012a']])(
    'rechaza %p',
    (valor) => {
      expect(validateCui(valor).valid).toBe(false);
    }
  );
});

describe('validateAge18', () => {
  const haceAnios = (anios, dias = 0) => {
    const fecha = new Date();
    fecha.setFullYear(fecha.getFullYear() - anios);
    fecha.setDate(fecha.getDate() + dias);
    return fecha;
  };

  test('acepta a quien cumplió 18 años hace una semana', () => {
    expect(validateAge18(haceAnios(18, -7)).valid).toBe(true);
  });

  test('rechaza a quien cumple 18 años la próxima semana', () => {
    expect(validateAge18(haceAnios(18, 7)).valid).toBe(false);
  });

  test.each([[null], ['no-es-fecha']])('rechaza la fecha %p', (valor) => {
    expect(validateAge18(valor).valid).toBe(false);
  });
});

describe('montos', () => {
  test('validatePositiveAmount exige un valor mayor al mínimo', () => {
    expect(validatePositiveAmount('10.50')).toEqual({ valid: true, value: 10.5 });
    expect(validatePositiveAmount(0).valid).toBe(false);
    expect(validatePositiveAmount('abc').valid).toBe(false);
    expect(validatePositiveAmount(100, 100, 'aporte').message).toContain('aporte');
  });

  test('validateMinimumAmount acepta exactamente el mínimo de apertura', () => {
    expect(validateMinimumAmount('100.00', 100)).toEqual({ valid: true, value: 100 });
    expect(validateMinimumAmount(99.99, 100).valid).toBe(false);
    expect(validateMinimumAmount('x', 100).valid).toBe(false);
  });
});

describe('validateBeneficiarios', () => {
  test('exige que los porcentajes sumen 100', () => {
    expect(validateBeneficiarios([{ porcentaje: '60' }, { porcentaje: 40 }])).toEqual({ valid: true, total: 100 });
    expect(validateBeneficiarios([{ porcentaje: 33.33 }, { porcentaje: 33.33 }, { porcentaje: 33.34 }]).valid).toBe(
      true
    );
    expect(validateBeneficiarios([{ porcentaje: 99 }]).valid).toBe(false);
  });

  test.each([[[]], [null]])('rechaza una lista vacía o inválida: %p', (valor) => {
    expect(validateBeneficiarios(valor).valid).toBe(false);
  });
});

describe('middlewares de validación', () => {
  test('validateCuiMiddleware deja pasar un DPI válido y lo limpia', () => {
    const req = { body: { cui_dpi: '1234567890123' }, params: {}, query: {} };
    const next = jest.fn();
    validateCuiMiddleware()(req, respuestaFalsa(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.cleanedCui).toBe('1234567890123');
  });

  test('validateCuiMiddleware responde 400 con un DPI inválido', () => {
    const res = respuestaFalsa();
    const next = jest.fn();
    validateCuiMiddleware()({ body: { cui_dpi: '1' }, params: {}, query: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('validateMontoMiddleware responde 400 con un monto inválido y deja pasar uno válido', () => {
    const res = respuestaFalsa();
    const next = jest.fn();
    validateMontoMiddleware()({ body: { monto: -1 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    validateMontoMiddleware()({ body: { monto: 5 } }, respuestaFalsa(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
