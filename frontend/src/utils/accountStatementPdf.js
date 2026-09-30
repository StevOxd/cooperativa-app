import {
  C,
  createDoc,
  dateTime,
  drawFooters,
  drawHeader,
  fieldsGrid,
  fileSafe,
  highlightBox,
  money,
  noteBox,
  sectionTitle,
  shortDate,
  table,
} from './pdf/pdfKit';

/** Tipos de movimiento en palabras. */
const TIPOS = {
  DEPOSITO: 'Depósito',
  RETIRO: 'Retiro',
  TRANSFERENCIA: 'Transferencia',
  PAGO_CREDITO: 'Pago de crédito',
  AJUSTE: 'Ajuste',
  CREDITO: 'Crédito',
  CREDITO_ACH: 'Crédito ACH',
};

/** Mismo criterio que el modal de movimientos. Pendiente: los traslados que entran se ven como egreso (issue #8). */
const TIPOS_INGRESO = ['DEPOSITO', 'PAGO_CREDITO', 'CREDITO', 'CREDITO_ACH'];

const tipoLabel = (tipo) =>
  TIPOS[tipo] || (tipo ? tipo.charAt(0) + tipo.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

const estadoLabel = (estado) => (estado ? estado.charAt(0) + estado.slice(1).toLowerCase() : 'Activa');

/**
 * Genera y descarga el estado de cuenta de una cuenta del asociado.
 *
 * @param {Object} params
 * @param {Object} params.asociado - Titular (nombre, DPI, código, correo, fecha de ingreso).
 * @param {Object} params.cuenta - Número, tipo, saldos, tasa y estado.
 * @param {Array<Object>} params.transacciones - Movimientos de la cuenta.
 * @returns {jsPDF} El documento, ya descargado.
 */
export const generateAccountStatementPdf = ({ asociado, cuenta, transacciones = [] }) => {
  const doc = createDoc();
  const now = new Date();

  const disponible = parseFloat(cuenta?.saldo_disponible || 0);
  const reserva = parseFloat(cuenta?.saldo_reserva || 0);
  const nombre =
    asociado?.nombre_completo || `${asociado?.primer_nombre || ''} ${asociado?.primer_apellido || ''}`.trim();

  let y = drawHeader(doc, { title: 'Estado de cuenta', reference: cuenta?.numero_cuenta, date: now });

  y = highlightBox(doc, y, {
    label: cuenta?.tipo_cuenta || 'Cuenta de ahorro',
    value: cuenta?.numero_cuenta,
    mono: true,
    detail: `Saldos al ${dateTime(now)}`,
    aside: { label: 'Saldo disponible', value: money(disponible) },
  });

  y = fieldsGrid(
    doc,
    y,
    [
      { label: 'En reserva', value: money(reserva) },
      { label: 'Saldo total', value: money(disponible + reserva), strong: true },
      { label: 'Tasa de interés', value: cuenta?.tasa_interes_anual ? `${cuenta.tasa_interes_anual} % anual` : '—' },
      { label: 'Estado', value: estadoLabel(cuenta?.estado) },
    ],
    { columns: 4 }
  );

  y = sectionTitle(doc, y, 'Titular');
  y = fieldsGrid(doc, y, [
    { label: 'Nombre', value: nombre, strong: true },
    { label: 'Usuario', value: asociado?.codigo_corporativo, mono: true },
    { label: 'DPI', value: asociado?.cui_dpi, mono: true },
    { label: 'Asociado desde', value: asociado?.fecha_ingreso ? shortDate(asociado.fecha_ingreso) : '—' },
  ]);

  let ingresos = 0;
  let egresos = 0;
  const rows = transacciones.map((t) => {
    const monto = parseFloat(t.monto || 0);
    const esIngreso = TIPOS_INGRESO.includes(t.tipo_transaccion);
    if (esIngreso) ingresos += monto;
    else egresos += monto;
    return [
      dateTime(t.fecha_transaccion),
      tipoLabel(t.tipo_transaccion),
      t.referencia || '—',
      { text: `${esIngreso ? '+' : '-'} ${money(monto)}`, color: esIngreso ? C.success : C.ink, bold: true },
      money(t.saldo_nuevo),
    ];
  });

  y = sectionTitle(doc, y, `Movimientos (${transacciones.length})`);
  y = table(
    doc,
    y,
    [
      { header: 'Fecha', width: 0.2 },
      { header: 'Tipo', width: 0.16 },
      { header: 'Referencia', width: 0.32 },
      { header: 'Monto', width: 0.16, align: 'right' },
      { header: 'Saldo', width: 0.16, align: 'right' },
    ],
    rows,
    { emptyText: 'Esta cuenta todavía no tiene movimientos.' }
  );

  // Totales y aviso al final (en otra página si no caben)
  if (y + 40 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    y = 20;
  }
  y = fieldsGrid(
    doc,
    y,
    [
      { label: 'Total de ingresos', value: `+ ${money(ingresos)}`, strong: true },
      { label: 'Total de egresos', value: `- ${money(egresos)}`, strong: true },
    ],
    { columns: 2 }
  );
  noteBox(doc, y, {
    text: 'Documento informativo generado desde el portal del asociado. Si necesita una constancia con firma y sello, solicítela en una agencia.',
  });

  drawFooters(doc, 'Estado de cuenta');
  doc.save(`Estado_de_cuenta_${fileSafe(cuenta?.numero_cuenta) || 'cuenta'}_${now.toISOString().slice(0, 10)}.pdf`);
  return doc;
};
