import {
  createDoc,
  drawFooters,
  drawHeader,
  fieldsGrid,
  fileSafe,
  highlightBox,
  money,
  noteBox,
  sectionTitle,
  shortDate,
  signatures,
} from './pdf/pdfKit';

/**
 * Genera y descarga la constancia con el número de caso para terminar la
 * afiliación en una agencia.
 *
 * @param {Object} params
 * @param {Object} params.caso - Respuesta de `/afiliacion/solicitar-nuevo`.
 * @returns {jsPDF} El documento, ya descargado.
 */
export const generateAffiliationCasePdf = ({ caso }) => {
  const doc = createDoc();
  const tieneMonto = caso?.monto_estimado !== undefined && caso?.monto_estimado !== null;

  let y = drawHeader(doc, { title: 'Constancia de solicitud de afiliación', reference: caso?.numero_caso });

  y = highlightBox(doc, y, {
    label: 'Número de caso',
    value: caso?.numero_caso,
    mono: true,
    detail: `Emitido el ${shortDate(caso?.fecha_solicitud)} · Guárdelo: lo necesitará en la agencia`,
  });

  y = sectionTitle(doc, y, 'Para terminar su afiliación');
  y = noteBox(doc, y, {
    tone: 'brand',
    text: [
      'Vaya a cualquier agencia del banco.',
      'Lleve su DPI original y este número de caso.',
      'Haga el depósito inicial para abrir su cuenta de ahorro.',
    ],
  });

  y = sectionTitle(doc, y, 'Solicitante');
  y = fieldsGrid(doc, y, [
    { label: 'Nombre', value: caso?.nombre_completo, strong: true },
    { label: 'DPI', value: caso?.cui_dpi, mono: true },
    ...(tieneMonto ? [{ label: 'Depósito estimado', value: money(caso.monto_estimado) }] : []),
    { label: 'Estado', value: 'Pendiente en agencia' },
  ]);

  signatures(doc, y + 8, [
    { name: caso?.nombre_completo, role: 'Firma del solicitante', detail: caso?.cui_dpi ? `DPI ${caso.cui_dpi}` : undefined, mono: true },
    { name: 'Agencia receptora', role: 'Firma y sello' },
  ]);

  drawFooters(doc, 'Constancia de solicitud de afiliación');
  doc.save(`Constancia_${fileSafe(caso?.numero_caso) || 'afiliacion'}.pdf`);
  return doc;
};
