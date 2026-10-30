import { creditDestination } from '../components/credit/creditDestination';
import {
  createDoc,
  drawFooters,
  drawHeader,
  ensureSpace,
  fechaArchivo,
  fieldsGrid,
  highlightBox,
  money,
  nombreCompleto,
  noteBox,
  sectionTitle,
  shortDate,
  table,
} from './pdf/pdfKit';

/**
 * Genera y descarga el plan de pagos de un crédito aprobado: cuota, totales y el calendario completo (amortización
 * francesa, cuota fija), el mismo que muestra la pestaña «Plan de pagos».
 *
 * @param {Object} params
 * @param {Object} params.asociado - Titular (nombre, código, DPI).
 * @param {Object} params.credito - Solicitud aprobada (monto, plazo, tasa, cuota, fechas y cuenta de acreditación).
 * @param {Array<{numero: number, fechaPago: Date, capital: number, interes: number, cuotaMes: number,
 *   saldoPendiente: number}>} params.plan - Calendario de cuotas.
 * @returns {import('jspdf').jsPDF} El documento, ya descargado.
 */
export const generatePaymentPlanPdf = ({ asociado, credito, plan }) => {
  const doc = createDoc();
  const now = new Date();
  const tasa = parseFloat(credito.tasa_interes);
  const nombre = nombreCompleto(asociado);
  const totalCapital = plan.reduce((suma, c) => suma + c.capital, 0);
  const totalInteres = plan.reduce((suma, c) => suma + c.interes, 0);

  let y = drawHeader(doc, { title: 'Plan de pagos', reference: `Crédito #${credito.id_solicitud_credito}`, date: now });

  y = highlightBox(doc, y, {
    label: 'Cuota mensual',
    value: money(credito.cuota_mensual_estimada),
    detail: `${plan.length} cuotas · tasa de ${tasa.toFixed(2)} % anual fija`,
    aside: { label: 'Monto aprobado', value: money(credito.monto_solicitado) },
  });

  y = sectionTitle(doc, y, 'Titular');
  y = fieldsGrid(doc, y, [
    { label: 'Nombre', value: nombre, strong: true },
    { label: 'Código de asociado', value: asociado?.codigo_corporativo, mono: true },
    { label: 'DPI', value: asociado?.cui_dpi, mono: true },
    { label: 'Se acreditó en', value: creditDestination(credito) },
  ]);

  y = sectionTitle(doc, y, 'Resumen del crédito');
  y = fieldsGrid(
    doc,
    y,
    [
      { label: 'Aprobado el', value: shortDate(credito.fecha_resolucion || credito.fecha_solicitud) },
      { label: 'Primera cuota', value: shortDate(plan[0]?.fechaPago) },
      { label: 'Última cuota', value: shortDate(plan[plan.length - 1]?.fechaPago) },
      { label: 'Capital', value: money(totalCapital) },
      { label: 'Intereses', value: money(totalInteres) },
      { label: 'Total a pagar', value: money(totalCapital + totalInteres), strong: true },
    ],
    { columns: 3 }
  );

  y = ensureSpace(doc, y, 28);
  y = sectionTitle(doc, y, `Calendario de pagos (${plan.length} cuotas)`);
  y = table(
    doc,
    y,
    [
      { header: 'Cuota', width: 0.1, align: 'right' },
      { header: 'Fecha de pago', width: 0.18 },
      { header: 'Capital', width: 0.18, align: 'right' },
      { header: 'Interés', width: 0.18, align: 'right' },
      { header: 'Cuota del mes', width: 0.18, align: 'right' },
      { header: 'Saldo pendiente', width: 0.18, align: 'right' },
    ],
    plan.map((c) => [
      String(c.numero),
      shortDate(c.fechaPago),
      money(c.capital),
      money(c.interes),
      { text: money(c.cuotaMes), bold: true },
      money(c.saldoPendiente),
    ])
  );

  y = ensureSpace(doc, y, 30);
  noteBox(doc, y, {
    title: 'Cómo se calcula',
    text:
      `La cuota es la misma todos los meses. Una parte abona al capital y otra paga el interés del mes, calculado sobre ` +
      `lo que aún debe (tasa mensual de ${(tasa / 12).toFixed(4)} %). Las fechas se cuentan desde la aprobación. ` +
      'Documento informativo generado desde el portal del asociado; si necesita una constancia con firma y sello, ' +
      'solicítela en una agencia.',
  });

  drawFooters(doc, `Plan de pagos · Crédito #${credito.id_solicitud_credito}`);
  doc.save(`Plan_de_pagos_credito_${credito.id_solicitud_credito}_${fechaArchivo()}.pdf`);
  return doc;
};
