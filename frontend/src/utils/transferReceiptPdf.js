import {
  createDoc,
  dateTime,
  drawFooters,
  drawHeader,
  fieldsGrid,
  fileSafe,
  highlightBox,
  money,
  nombreCompleto,
  noteBox,
  sectionTitle,
} from './pdf/pdfKit';

const ESTADOS = {
  PENDIENTE: { label: 'En revisión', tone: 'warning', nota: 'La solicitud espera la revisión de un operador. Este comprobante no confirma que el dinero se trasladó.' },
  APROBADO: { label: 'Aprobado', tone: 'success', nota: 'El operador aprobó el traslado y el dinero se acreditó en la cuenta de destino.' },
  RECHAZADO: { label: 'Rechazado', tone: 'neutral', nota: 'El operador rechazó el traslado: no se movió dinero.' },
};

const OPERACION = {
  TRASLADO_DIRECTO: 'Traslado directo',
  APERTURA_Y_TRASLADO: 'Apertura de cuenta y traslado',
};

/**
 * Genera y descarga el comprobante de una solicitud de traslado (`CASO-AAAA-XXXX`) con su estado actual. Es de la
 * solicitud, no del movimiento: si está en revisión o se rechazó, lo dice.
 *
 * @param {Object} params
 * @param {Object} params.asociado - Titular (nombre, código, DPI).
 * @param {Object} params.solicitud - Como la devuelve `GET /api/asociado/mis-solicitudes`.
 * @returns {import('jspdf').jsPDF} El documento, ya descargado.
 */
export const generateTransferReceiptPdf = ({ asociado, solicitud }) => {
  const doc = createDoc();
  const now = new Date();
  const estado = ESTADOS[solicitud.estado] || { label: solicitud.estado, tone: 'neutral', nota: '' };
  const nombre = nombreCompleto(asociado);
  let destino = solicitud.cuenta_destino_numero;
  if (!destino) {
    destino = solicitud.estado === 'RECHAZADO'
      ? 'No se abrió (solicitud rechazada)'
      : `${solicitud.tipo_cuenta_destino}, se abre al aprobarse`;
  }

  let y = drawHeader(doc, { title: 'Comprobante de solicitud de traslado', reference: solicitud.numero_caso, date: now });

  y = highlightBox(doc, y, {
    label: 'Monto del traslado',
    value: money(solicitud.monto),
    detail: OPERACION[solicitud.tipo_operacion] || solicitud.tipo_operacion,
    aside: { label: 'Estado', value: estado.label },
  });

  y = sectionTitle(doc, y, 'Solicitud');
  y = fieldsGrid(doc, y, [
    { label: 'Número de caso', value: solicitud.numero_caso, mono: true, strong: true },
    { label: 'Solicitado el', value: dateTime(solicitud.fecha_solicitud) },
    { label: 'Cuenta de origen', value: solicitud.cuenta_origen_numero, mono: true },
    { label: 'Cuenta de destino', value: destino, mono: Boolean(solicitud.cuenta_destino_numero) },
    { label: 'Resuelto el', value: solicitud.fecha_resolucion ? dateTime(solicitud.fecha_resolucion) : 'Pendiente' },
    { label: 'Observación del operador', value: solicitud.observaciones_operador || '—', span: 2 },
  ]);

  y = sectionTitle(doc, y, 'Titular');
  y = fieldsGrid(
    doc,
    y,
    [
      { label: 'Nombre', value: nombre, strong: true },
      { label: 'Código de asociado', value: asociado?.codigo_corporativo, mono: true },
      { label: 'DPI', value: asociado?.cui_dpi, mono: true },
    ],
    { columns: 3 }
  );

  y = noteBox(doc, y, { title: estado.label, text: estado.nota, tone: estado.tone });
  noteBox(doc, y, {
    text: 'Documento informativo generado desde el portal del asociado. Conserve el número de caso para cualquier consulta.',
  });

  drawFooters(doc, `Solicitud de traslado · ${solicitud.numero_caso}`);
  doc.save(`Comprobante_traslado_${fileSafe(solicitud.numero_caso)}.pdf`);
  return doc;
};
