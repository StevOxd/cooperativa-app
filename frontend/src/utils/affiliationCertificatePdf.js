import {
  INSTITUCION, createDoc, drawFooters, drawHeader, fechaArchivo, fieldsGrid, highlightBox, nombreCompleto, noteBox,
} from './pdf/pdfKit';

const ESTADO_AFILIACION = { ACTIVO: 'activa', INACTIVO: 'inactiva', SUSPENDIDO: 'suspendida', BLOQUEADO: 'bloqueada' };

/**
 * Fecha de ingreso (columna DATE) en palabras: "30 de octubre de 2026". Se toma el día tal como viene (AAAA-MM-DD),
 * sin convertirlo a la hora local, que lo movería al día anterior.
 *
 * @param {string} valor - "2026-10-30" o "2026-10-30T00:00:00.000Z".
 * @returns {string}
 */
const fechaLarga = (valor) => {
  const [anio, mes, dia] = String(valor || '').slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return '—';
  return new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString('es-GT', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  });
};

/**
 * Genera y descarga la constancia informativa de afiliación del asociado: quién es, desde cuándo y en qué estado está
 * su afiliación. No lleva cuentas ni saldos, porque suele entregarse a terceros (un patrono, otro banco). Se arma en el
 * navegador y no tiene cómo verificarse, así que se presenta como informativa y no «hace constar».
 *
 * @param {Object} params
 * @param {Object} params.asociado - Perfil del portal (nombres, DPI, código, fecha de ingreso y estado).
 * @returns {import('jspdf').jsPDF} El documento, ya descargado.
 */
export const generateAffiliationCertificatePdf = ({ asociado }) => {
  const doc = createDoc();
  const now = new Date();
  const nombre = nombreCompleto(asociado);
  const desde = fechaLarga(asociado.fecha_ingreso);
  const estado = ESTADO_AFILIACION[asociado.estado_asociado] || String(asociado.estado_asociado || '').toLowerCase();

  let y = drawHeader(doc, { title: 'Constancia informativa de afiliación', reference: asociado.codigo_corporativo, date: now });

  y = highlightBox(doc, y, {
    label: 'Asociado',
    value: nombre,
    detail: `Asociado desde el ${desde}`,
  });

  y = noteBox(doc, y, {
    title: 'Datos de la afiliación',
    tone: 'brand',
    text:
      `Según los registros de ${INSTITUCION}, ${nombre}, con DPI ${asociado.cui_dpi}, forma parte de la cooperativa ` +
      `desde el ${desde}, con el código de asociado ${asociado.codigo_corporativo}. A la fecha de emisión, su afiliación ` +
      `está ${estado}.`,
  });

  // El nombre y la fecha ya están en el recuadro y en el párrafo
  y = fieldsGrid(
    doc,
    y,
    [
      { label: 'DPI', value: asociado.cui_dpi, mono: true },
      { label: 'Código de asociado', value: asociado.codigo_corporativo, mono: true },
      { label: 'Estado de la afiliación', value: estado.charAt(0).toUpperCase() + estado.slice(1), strong: true },
    ],
    { columns: 3 }
  );

  noteBox(doc, y, {
    text:
      'Documento informativo generado desde el portal del asociado: no lleva firma ni sello y no sustituye una ' +
      'constancia oficial. Si la entidad que la pide necesita una constancia firmada, solicítela en una agencia.',
  });

  drawFooters(doc, 'Constancia de afiliación');
  doc.save(`Constancia_de_afiliacion_${asociado.codigo_corporativo || 'asociado'}_${fechaArchivo()}.pdf`);
  return doc;
};
