import {
  C,
  INSTITUCION,
  MARGIN,
  createDoc,
  drawFooters,
  drawHeader,
  fieldsGrid,
  highlightBox,
  money,
  noteBox,
  sectionTitle,
  show,
} from './pdf/pdfKit';

const TASA_ANUAL_POR_DEFECTO = 10;

/** Recuadro con título arriba (firma, huella o revisión interna). */
const box = (doc, x, y, w, h, title, lines = []) => {
  doc.setDrawColor(...C.lineStrong);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.inkMuted);
  doc.text(title, x + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.inkSoft);
  lines.forEach((l, i) => doc.text(l, x + 4, y + 11.5 + i * 5.5));
};

/**
 * Genera y descarga el formulario de solicitud de crédito para que el
 * asociado lo firme y lo adjunte en el portal.
 *
 * @param {Object} params
 * @param {Object} params.asociado - Datos del asociado (nombre, DPI, código, contacto).
 * @param {Object} params.credito - Monto, plazo, cuota, observaciones y folio.
 * @param {Object} [params.cuentaDestino] - Cuenta del banco donde se acreditará.
 * @returns {jsPDF} El documento, ya descargado.
 */
export const generateCreditApplicationPdf = ({ asociado, credito, cuentaDestino }) => {
  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const width = pageW - MARGIN * 2;

  const id = credito?.id_solicitud_credito || credito?.id_solicitud;
  const monto = parseFloat(credito?.monto ?? credito?.monto_solicitado ?? 0);
  const plazo = parseInt(credito?.plazo ?? credito?.plazo_meses ?? 0, 10);
  const cuota = parseFloat(credito?.cuotaMensual ?? credito?.cuota_mensual_estimada ?? 0);
  const tasa = parseFloat(credito?.tasa_interes ?? TASA_ANUAL_POR_DEFECTO);
  const destino = cuentaDestino?.etiqueta_tipo && cuentaDestino?.numero_cuenta && cuentaDestino.etiqueta_tipo !== cuentaDestino.numero_cuenta
    ? `${cuentaDestino.etiqueta_tipo} · ${cuentaDestino.numero_cuenta}`
    : credito?.cuenta_destino_info || cuentaDestino?.numero_cuenta || 'Cuenta principal del asociado';
  const nombre =
    asociado?.nombre_completo || `${asociado?.primer_nombre || ''} ${asociado?.primer_apellido || ''}`.trim();

  let y = drawHeader(doc, {
    title: 'Solicitud de crédito',
    reference: id ? `Solicitud #${id}` : 'Borrador',
  });

  y = highlightBox(doc, y, {
    label: 'Monto solicitado',
    value: money(monto),
    detail: `${plazo} meses · tasa fija de ${tasa.toFixed(2)} % anual`,
    aside: { label: 'Cuota mensual', value: money(cuota) },
  });

  y = sectionTitle(doc, y, '1. Solicitante');
  y = fieldsGrid(doc, y, [
    { label: 'Nombre', value: nombre, strong: true },
    { label: 'Usuario', value: asociado?.codigo_corporativo, mono: true },
    { label: 'DPI', value: asociado?.cui_dpi, mono: true },
    { label: 'Teléfono', value: asociado?.telefono },
    { label: 'Correo', value: asociado?.email, span: 2 },
  ]);

  y = sectionTitle(doc, y, '2. Condiciones');
  // Monto, plazo, tasa y cuota ya están en el recuadro de arriba.
  y = fieldsGrid(doc, y, [
    { label: 'Total estimado a pagar', value: money(cuota * plazo), strong: true },
    { label: 'Tipo de cuota', value: 'Cuotas iguales cada mes (sistema francés)' },
    { label: 'Se acredita en', value: destino, span: 2 },
    { label: 'Para qué es el crédito', value: show(credito?.observaciones), span: 2 },
  ]);

  y = sectionTitle(doc, y, '3. Declaración del solicitante');
  y = noteBox(doc, y, {
    text: [
      'Declaro que los datos de esta solicitud son verdaderos y se pueden comprobar.',
      `Autorizo a ${INSTITUCION} a verificar mis referencias personales, laborales y crediticias en burós autorizados.`,
      'Si la solicitud se aprueba, me comprometo a pagar puntualmente cada cuota mensual hasta cancelar la deuda.',
      'Acepto que cualquier dato falso o inexacto anula la solicitud, sin responsabilidad para la cooperativa.',
    ],
  });

  // Firma y huella
  const gap = 8;
  const firmaW = (width - gap) * 0.62;
  const huellaW = width - gap - firmaW;
  const boxH = 30;
  box(doc, MARGIN, y, firmaW, boxH, 'Firma del solicitante');
  doc.setDrawColor(...C.inkSubtle);
  doc.line(MARGIN + 8, y + boxH - 10, MARGIN + firmaW - 8, y + boxH - 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.ink);
  doc.text(show(nombre), MARGIN + firmaW / 2, y + boxH - 5.5, { align: 'center' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.inkSubtle);
  doc.text(asociado?.cui_dpi ? `DPI ${asociado.cui_dpi}` : 'Firme igual que en su DPI', MARGIN + firmaW / 2, y + boxH - 2, { align: 'center' });

  box(doc, MARGIN + firmaW + gap, y, huellaW, boxH, 'Huella del pulgar derecho');
  y += boxH + 7;

  // Espacio interno
  y = sectionTitle(doc, y, 'Para uso de la cooperativa');
  const colW = (width - gap) / 2;
  box(doc, MARGIN, y, colW, 26, 'Revisión del operador', [
    '[  ] Expediente completo    [  ] Documento firmado',
    '[  ] Capacidad de pago verificada',
    'Firma y código: ______________________',
  ]);
  box(doc, MARGIN + colW + gap, y, colW, 26, 'Resolución del ejecutivo', [
    '[  ] Aprobada    [  ] Devuelta    [  ] Denegada',
    'Fecha: ____ / ____ / ________',
    'Firma y sello: ______________________',
  ]);

  drawFooters(doc, 'Solicitud de crédito. Firme y adjunte este documento en el portal.');
  doc.save(id ? `Solicitud_credito_${id}.pdf` : 'Solicitud_credito_borrador.pdf');
  return doc;
};
