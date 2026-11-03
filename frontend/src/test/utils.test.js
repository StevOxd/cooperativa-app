import { describe, expect, test, vi } from 'vitest';
import {
  formatQ,
  formatDateOnly,
  humanize,
  megas,
  formatRelative,
  horasDesde,
  formatDate,
  formatDateTime,
  hoyEnGuatemala,
} from '../utils/format';
import { celdaCsv, descargarCsv } from '../utils/csv';
import { esIngreso } from '../utils/movimientos';
import { PARENTESCOS, parentescoLabel } from '../utils/parentesco';
import { checkPassword, PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy';
import { COBRO, cobroParaApi } from '../utils/cobroAfiliacion';
import { OBLIGATORIOS, etiquetaDocumento, TAMANO_MAXIMO_BYTES } from '../utils/documentos';

describe('format', () => {
  test('formatQ muestra quetzales con 2 decimales y trata lo vacío como cero', () => {
    expect(formatQ(1250)).toMatch(/^Q1.250\.00$/);
    expect(formatQ(null)).toBe('Q0.00');
  });

  test('formatDateOnly toma el día tal como viene, sin cambiar de zona horaria', () => {
    expect(formatDateOnly('2026-10-30T00:00:00.000Z')).toBe('30/10/2026');
    expect(formatDateOnly('')).toBe('—');
    expect(formatDateOnly('sin fecha')).toBe('—');
  });

  test('las fechas sin valor se muestran con una raya', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDate('2026-10-30T12:00:00Z')).toContain('2026');
    expect(formatDateTime('2026-10-30T12:00:00Z')).toContain('2026');
  });

  test('hoyEnGuatemala devuelve AAAA-MM-DD', () => {
    expect(hoyEnGuatemala()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('humanize convierte un estado en texto', () => {
    expect(humanize('EN_REVISION_OPERADOR')).toBe('En revision operador');
    expect(humanize(null)).toBe('');
  });

  test('megas muestra un decimal', () => {
    expect(megas(5 * 1024 * 1024)).toBe('5.0');
  });

  test('formatRelative cuenta unidades completas', () => {
    const ahora = Date.parse('2026-11-02T12:00:00Z');
    expect(formatRelative(null, ahora)).toBe('—');
    expect(formatRelative('2026-11-02T11:59:50Z', ahora)).toBe('hace un momento');
    expect(formatRelative('2026-11-02T11:01:00Z', ahora)).toContain('59');
    expect(formatRelative('2026-11-02T09:00:00Z', ahora)).toContain('3');
    expect(formatRelative('2026-11-03T12:00:00Z', ahora)).toBe('hace un momento');
  });

  test('horasDesde nunca es negativo', () => {
    const ahora = Date.parse('2026-11-02T12:00:00Z');
    expect(horasDesde('2026-11-02T10:00:00Z', ahora)).toBe(2);
    expect(horasDesde('2026-11-03T10:00:00Z', ahora)).toBe(0);
    expect(horasDesde(null, ahora)).toBe(0);
  });
});

describe('csv', () => {
  test('neutraliza lo que Excel ejecutaría como fórmula', () => {
    expect(celdaCsv('=1+1')).toBe(`"'=1+1"`);
    expect(celdaCsv('@SUMA')).toBe(`"'@SUMA"`);
    expect(celdaCsv('X;=1+1')).toBe(`"X;'=1+1"`);
  });

  test('escapa comillas, respeta números y deja vacío lo nulo', () => {
    expect(celdaCsv('di "hola"')).toBe('"di ""hola"""');
    expect(celdaCsv(12.5)).toBe('12.5');
    expect(celdaCsv(Number.NaN)).toBe('');
    expect(celdaCsv(null)).toBe('');
  });

  test('un DPI queda como texto en Excel', () => {
    expect(celdaCsv({ textoFijo: '1234567890123' })).toBe('="1234567890123"');
    expect(celdaCsv({ textoFijo: '=malo' })).toBe(`"'=malo"`);
  });

  test('descargarCsv arma el archivo y lo descarga', () => {
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    descargarCsv({ nombre: 'r.csv', encabezados: ['A'], filas: [[1]] });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clic).toHaveBeenCalledTimes(1);
    clic.mockRestore();
  });
});

describe('movimientos', () => {
  test.each([
    [{ saldo_anterior: 10, saldo_nuevo: 20, tipo_transaccion: 'TRANSFERENCIA' }, true],
    [{ saldo_anterior: 20, saldo_nuevo: 10, tipo_transaccion: 'DEPOSITO' }, false],
    [{ tipo_transaccion: 'DEPOSITO' }, true],
    [{ tipo_transaccion: 'PAGO_CREDITO' }, false],
    [undefined, false],
  ])('esIngreso(%o) es %s', (movimiento, esperado) => {
    expect(esIngreso(movimiento)).toBe(esperado);
  });
});

describe('parentesco', () => {
  test('cada valor de la lista tiene su etiqueta', () => {
    PARENTESCOS.forEach((valor) => expect(parentescoLabel(valor)).toBeTruthy());
    expect(parentescoLabel('HIJO/A')).toBe('Hijo o hija');
    expect(parentescoLabel('OTRO_VALOR')).toBe('Otro valor');
  });
});

describe('política de contraseñas', () => {
  test('evalúa cada requisito por separado', () => {
    expect(checkPassword('Clave123!').isValid).toBe(true);
    expect(checkPassword('corta1!')).toMatchObject({ hasMinLength: false, isValid: false });
    expect(checkPassword('sinnumeros!')).toMatchObject({ hasNumbers: false, isValid: false });
    expect(checkPassword('sinsimbolo123')).toMatchObject({ hasSpecial: false, isValid: false });
    expect(checkPassword()).toMatchObject({ isValid: false });
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('cobro de la afiliación', () => {
  test('arma lo que espera la API según la forma de pago', () => {
    expect(cobroParaApi({ metodo: COBRO.DEBITO, cuenta: '1' })).toEqual({
      metodo_pago: 'DEBITO_CUENTA',
      numero_cuenta_bancaria: '1',
    });
    expect(cobroParaApi({ metodo: COBRO.EFECTIVO_EXISTENTE, cuenta: '2' })).toEqual({
      metodo_pago: 'EFECTIVO_VENTANILLA',
      numero_cuenta_bancaria: '2',
    });
    expect(cobroParaApi({ metodo: COBRO.EFECTIVO_NUEVA, cuenta: '3' })).toEqual({ metodo_pago: 'EFECTIVO_VENTANILLA' });
  });
});

describe('documentos', () => {
  test('el catálogo tiene los obligatorios y el tope de 5 MB', () => {
    expect(OBLIGATORIOS).toEqual(['DPI_FRENTE', 'DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI']);
    expect(etiquetaDocumento('DPI_FRENTE')).toBe('DPI (frente)');
    expect(etiquetaDocumento('OTRO')).toBe('OTRO');
    expect(TAMANO_MAXIMO_BYTES).toBe(5242880);
  });
});
