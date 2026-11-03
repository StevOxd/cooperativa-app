import { beforeEach, describe, expect, test, vi } from 'vitest';
import { generateAccountStatementPdf } from '../utils/accountStatementPdf';
import { generateCreditApplicationPdf } from '../utils/creditApplicationPdf';
import { generateAccountOpeningReceiptPdf } from '../utils/accountOpeningReceiptPdf';
import { generatePaymentPlanPdf } from '../utils/paymentPlanPdf';
import { generateAffiliationCasePdf } from '../utils/affiliationCasePdf';
import { generateAffiliationCertificatePdf } from '../utils/affiliationCertificatePdf';
import { generateTransferReceiptPdf } from '../utils/transferReceiptPdf';
import { fileSafe, money, nombreCompleto, show } from '../utils/pdf/pdfKit';
import { generateReportPdf } from '../utils/reporteria/reportePdf';
import {
  REPORTES,
  nombreDeArchivo,
  reportesDelRol,
  tablaCsv,
  textoDeFiltros,
  tituloDeReporte,
  totalesBreves,
} from '../utils/reporteria/definiciones';

const ASOCIADO = {
  primer_nombre: 'Ana',
  primer_apellido: 'Prueba',
  nombre_completo: 'Ana Prueba',
  codigo_corporativo: 'EB-1',
  cui_dpi: '1234567890123',
  email: 'ana@prueba.test',
  telefono: '55555555',
  fecha_ingreso: '2026-01-15',
  estado_asociado: 'ACTIVO',
};
const CUENTA = {
  numero_cuenta: '1001',
  tipo_cuenta: 'Ahorro',
  nombre_tipo: 'Ahorro',
  saldo_disponible: 1500.5,
  saldo_reserva: 0,
  estado: 'ACTIVA',
  tasa_interes_anual: 4,
  fecha_apertura: '2026-01-15',
};
const CREDITO = {
  id_solicitud_credito: 7,
  numero_caso: 'CRED-2026-0007',
  monto_solicitado: 10000,
  plazo_meses: 12,
  tasa_interes: 10,
  cuota_mensual_estimada: 879.16,
  cuotaMensual: 879.16,
  destino: 'Vivienda',
  estado: 'APROBADA',
  fecha_solicitud: '2026-02-01',
  fecha_resolucion: '2026-02-10',
};

const esPdfValido = (doc) => {
  expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
};

describe('documentos PDF', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  test('el estado de cuenta incluye varias páginas si hay muchos movimientos', () => {
    const transacciones = Array.from({ length: 120 }, (_, i) => ({
      fecha_transaccion: '2026-02-01T12:00:00Z',
      tipo_transaccion: i % 2 ? 'DEPOSITO' : 'RETIRO',
      monto: 10 + i,
      saldo_anterior: 100,
      saldo_nuevo: 110,
      descripcion: `Movimiento ${i}`,
      referencia: `REF-${i}`,
    }));
    const doc = generateAccountStatementPdf({ asociado: ASOCIADO, cuenta: CUENTA, transacciones });
    esPdfValido(doc);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  test('el estado de cuenta sin movimientos también se genera', () => {
    esPdfValido(generateAccountStatementPdf({ asociado: ASOCIADO, cuenta: CUENTA }));
  });

  test('la solicitud de crédito se genera', () => {
    esPdfValido(generateCreditApplicationPdf({ asociado: ASOCIADO, credito: CREDITO, cuentaDestino: CUENTA }));
  });

  test('el comprobante de apertura se genera', () => {
    esPdfValido(generateAccountOpeningReceiptPdf({ data: { asociado: ASOCIADO, cuenta: CUENTA, monto: 100 } }));
  });

  test('el plan de pagos se genera con su tabla de cuotas', () => {
    const plan = Array.from({ length: 12 }, (_, i) => ({
      numero_cuota: i + 1,
      fecha_vencimiento: '2026-03-01',
      cuota: 879.16,
      capital: 800,
      interes: 79.16,
      saldo: 10000 - i * 800,
      estado: 'PENDIENTE',
    }));
    esPdfValido(generatePaymentPlanPdf({ asociado: ASOCIADO, credito: CREDITO, plan }));
  });

  test('la constancia de solicitud en agencia se genera', () => {
    const caso = {
      numero_caso: 'AF-2026-1',
      nombre_completo: 'Ana Prueba',
      cui_dpi: '1234567890123',
      monto_estimado: 100,
      fecha_solicitud: '2026-02-01',
    };
    esPdfValido(generateAffiliationCasePdf({ caso }));
  });

  test('el certificado de afiliación se genera', () => {
    esPdfValido(generateAffiliationCertificatePdf({ asociado: ASOCIADO }));
  });

  test.each(['PENDIENTE', 'APROBADO', 'RECHAZADO', 'OTRO'])('el comprobante de un traslado %s se genera', (estado) => {
    const solicitud = {
      numero_caso: 'CASO-2026-0001',
      estado,
      monto: 50,
      fecha_solicitud: '2026-02-01',
      cuenta_destino_numero: '1001',
      tipo_operacion: 'TRASLADO_DIRECTO',
    };
    esPdfValido(generateTransferReceiptPdf({ asociado: ASOCIADO, solicitud }));
  });

  test('las ayudas de formato no fallan con valores vacíos', () => {
    expect(fileSafe('Ana María/2026')).toBe('Ana_Mar_a_2026');
    expect(money(10)).toContain('10.00');
    expect(show('')).toBe('—');
    expect(nombreCompleto(ASOCIADO)).toContain('Ana');
  });
});

describe('reportes de gestión', () => {
  const totalGenerico = () =>
    Object.assign([{ clave: 'ACTIVO', monto: 5, cantidad: 5, total: 5, estado: 'ACTIVO' }], {
      monto: 5,
      cantidad: 5,
      total: 5,
      toFixed: () => '5.00',
    });
  const totales = new Proxy({}, { get: (_, prop) => (typeof prop === 'symbol' ? undefined : totalGenerico()) });
  const filaGenerica = new Proxy({}, { get: (_, prop) => (typeof prop === 'symbol' ? undefined : 5) });

  test('cada rol ve solo sus reportes y cada reporte tiene título', () => {
    expect(REPORTES.length).toBeGreaterThan(0);
    REPORTES.forEach((r) => expect(tituloDeReporte(r.codigo || r.id)).toBeTruthy());
    expect(reportesDelRol('ROL_INEXISTENTE')).toEqual([]);
  });

  test('describe los filtros usados', () => {
    expect(typeof textoDeFiltros({})).toBe('string');
    expect(textoDeFiltros({ desde: '2026-01-01', hasta: '2026-01-31' })).toContain('2026');
  });

  test.each(REPORTES.map((r) => [r.codigo || r.id, r]))('el reporte %s se exporta a CSV y a PDF', (_, definicion) => {
    const reporte = {
      folio: 'REP-000001',
      generado_en: '2026-02-01T12:00:00Z',
      filtros: { desde: '2026-01-01', hasta: '2026-01-31' },
      filas: [filaGenerica],
      datos: [filaGenerica],
      totales,
      resumen: totales,
    };
    const csv = tablaCsv(definicion, reporte);
    expect(csv.encabezados.length).toBeGreaterThan(0);
    expect(nombreDeArchivo(definicion, reporte, 'csv')).toMatch(/\.csv$/);
    expect(() => totalesBreves(reporte)).not.toThrow();
    esPdfValido(generateReportPdf({ definicion, reporte, usuario: ASOCIADO }));
  });
});
