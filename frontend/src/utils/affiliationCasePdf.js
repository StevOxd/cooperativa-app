import { jsPDF } from 'jspdf';

/**
 * Genera y descarga la constancia oficial de emisión de caso de afiliación en formato PDF.
 * Diseñada exactamente con el formato corporativo oficial, tonalidades azul suave estándar
 * de la aplicación, y ajustada con máxima precisión a 1 sola página tamaño carta.
 *
 * @param {Object} params
 * @param {Object} params.caso - Datos del caso de afiliación emitido
 * @returns {jsPDF} Instancia del documento PDF
 */
export const generateAffiliationCasePdf = ({ caso }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter', // 215.9 x 279.4 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Paleta de Colores Institucional (Azul Suave Corporativo - Estándar del Sistema)
  const primaryNavy = [12, 74, 110];    // #0c4a6e (Azul ejecutivo corporativo)
  const softBlue = [2, 132, 199];      // #0284c7 (Azul medio estándar)
  const skyAccent = [56, 189, 248];    // #38bdf8 (Azul celeste/sky para texto en fondo oscuro)
  const darkNavyBg = [15, 23, 42];     // #0f172a (Tarjeta principal número de caso)
  const darkText = [30, 41, 59];       // #1e293b (Texto oscuro principal)
  const mutedText = [100, 116, 139];   // #64748b (Texto gris etiquetas)
  const lightCardBg = [248, 250, 252]; // #f8fafc (Fondo gris/azul tenue para fichas)
  const borderLight = [226, 232, 240]; // #e2e8f0 (Borde suave)
  const borderDivider = [203, 213, 225]; // #cbd5e1 (Líneas divisorias)

  // Colores para bloque de advertencia / instrucciones en agencia
  const amberBg = [255, 251, 235];    // #fffbeb (Ámbar suave 50)
  const amberBorder = [252, 211, 77];  // #fcd34d (Borde ámbar 300)
  const amberTitle = [146, 64, 14];    // #92400e (Título ámbar 800)
  const amberBody = [120, 53, 15];     // #78350f (Texto ámbar 900)
  const amberTag = [180, 83, 9];       // #b45309 (Estado pendiente)

  const fechaHoy = new Date().toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });

  const fechaCasoStr = caso?.fecha_solicitud
    ? new Date(caso.fecha_solicitud).toLocaleDateString('es-GT')
    : fechaHoy;

  // 1. ENCABEZADO INSTITUCIONAL SUPERIOR
  const topY = 18;

  // Icono corporativo en caja redondeada azul ejecutiva
  const iconX = margin;
  const iconY = topY;
  const iconSize = 11;
  doc.setFillColor(...primaryNavy);
  doc.roundedRect(iconX, iconY, iconSize, iconSize, 2.5, 2.5, 'F');

  // Silueta vectorial de edificio bancario en blanco
  doc.setFillColor(255, 255, 255);
  doc.rect(iconX + 2.5, iconY + 2.8, 6, 6, 'F');
  // Ventanas y puerta
  doc.setFillColor(...primaryNavy);
  doc.rect(iconX + 3.3, iconY + 3.6, 1.3, 1.1, 'F');
  doc.rect(iconX + 6.4, iconY + 3.6, 1.3, 1.1, 'F');
  doc.rect(iconX + 3.3, iconY + 5.4, 1.3, 1.1, 'F');
  doc.rect(iconX + 6.4, iconY + 5.4, 1.3, 1.1, 'F');
  doc.rect(iconX + 4.9, iconY + 7.1, 1.2, 1.7, 'F');

  // Títulos a la par del icono
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO, R.L.', iconX + iconSize + 3.5, topY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...softBlue);
  doc.text('CORPORACIÓN BANCARIA • CONSTANCIA OFICIAL DE TRÁMITE', iconX + iconSize + 3.5, topY + 9);

  // Metadatos a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPROBANTE PARA AGENCIA', pageWidth - margin, topY + 4.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text(`Fecha de Impresión: ${fechaHoy}`, pageWidth - margin, topY + 9, { align: 'right' });

  // Línea divisoria de encabezado
  let currentY = topY + 14;
  doc.setDrawColor(...borderDivider);
  doc.setLineWidth(0.35);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // 2. PILL / BADGE Y TÍTULO CENTRAL
  currentY += 8;
  const pillW = 48;
  const pillH = 6;
  const pillX = (pageWidth - pillW) / 2;

  doc.setFillColor(...lightCardBg);
  doc.setDrawColor(...borderDivider);
  doc.setLineWidth(0.3);
  doc.roundedRect(pillX, currentY, pillW, pillH, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('SOLICITUD REGISTRADA', pageWidth / 2, currentY + 4.2, { align: 'center' });

  currentY += pillH + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Caso Emitido para Atención en Agencia', pageWidth / 2, currentY + 4, { align: 'center' });

  // 3. TARJETA DESTACADA DE NÚMERO DE CASO (Fondo Azul Noche Oscuro)
  currentY += 10;
  const caseBoxH = 26;
  doc.setFillColor(...darkNavyBg);
  doc.roundedRect(margin, currentY, contentWidth, caseBoxH, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...skyAccent); // Azul celeste / sky
  doc.text('TU NÚMERO DE CASO OFICIAL', pageWidth / 2, currentY + 6.5, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(caso?.numero_caso || 'CASO-AFIL-PENDIENTE', pageWidth / 2, currentY + 15.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Fecha de Emisión: ${fechaCasoStr}`, pageWidth / 2, currentY + 21.5, { align: 'center' });

  // 4. BLOQUE DE INSTRUCCIONES PARA AGENCIA (Fondo Ámbar Suave con Borde)
  currentY += caseBoxH + 6;
  const rawInstr = caso?.instrucciones ||
    'Debe avocarse a cualquier agencia de la Corporación Bancaria con su DPI original y su Número de Caso para depositar sus fondos iniciales y formalizar su cuenta de ahorro y membresía.';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const wrappedInstr = doc.splitTextToSize(rawInstr, contentWidth - 14);
  const instrBoxH = 14 + (wrappedInstr.length * 4.2);

  doc.setFillColor(...amberBg);
  doc.setDrawColor(...amberBorder);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, currentY, contentWidth, instrBoxH, 3, 3, 'FD');

  // Pequeño icono de banco/monumento a la izquierda
  const bX = margin + 4;
  const bY = currentY + 4.5;
  doc.setFillColor(...amberTitle);
  doc.triangle(bX, bY + 2.2, bX + 2.2, bY, bX + 4.4, bY + 2.2, 'F');
  doc.rect(bX + 0.4, bY + 2.5, 0.7, 2.2, 'F');
  doc.rect(bX + 1.8, bY + 2.5, 0.7, 2.2, 'F');
  doc.rect(bX + 3.3, bY + 2.5, 0.7, 2.2, 'F');
  doc.rect(bX, bY + 4.8, 4.4, 0.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...amberTitle);
  doc.text('INSTRUCCIONES PARA COMPLETAR TU AFILIACIÓN:', margin + 10, currentY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...amberBody);
  doc.text(wrappedInstr, margin + 4, currentY + 12);

  // 5. FICHA RESUMEN DE DATOS
  currentY += instrBoxH + 6;
  const dataBoxH = 36;

  doc.setFillColor(...lightCardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, dataBoxH, 3, 3, 'FD');

  const rowH = 9;
  const rows = [
    {
      label: 'Solicitante:',
      value: caso?.nombre_completo || 'Solicitante',
      isBold: true,
      color: darkText,
    },
    {
      label: 'CUI / DPI:',
      value: caso?.cui_dpi || 'N/A',
      isBold: true,
      color: darkText,
    },
    {
      label: 'Monto Inicial Estimado:',
      value: `Q${parseFloat(caso?.monto_estimado || 0).toFixed(2)}`,
      isBold: true,
      color: softBlue, // Azul suave estándar en el monto
    },
    {
      label: 'Estado del Caso:',
      value: 'PENDIENTE EN AGENCIA',
      isBold: true,
      color: amberTag,
    },
  ];

  rows.forEach((row, idx) => {
    const rowY = currentY + (idx * rowH);

    // Líneas divisorias internas
    if (idx > 0) {
      doc.setDrawColor(...borderLight);
      doc.setLineWidth(0.25);
      doc.line(margin + 4, rowY, pageWidth - margin - 4, rowY);
    }

    // Etiqueta a la izquierda
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedText);
    doc.text(row.label, margin + 5, rowY + 6);

    // Valor a la derecha
    doc.setFont('helvetica', row.isBold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...row.color);
    doc.text(row.value, pageWidth - margin - 5, rowY + 6, { align: 'right' });
  });

  // 6. FIRMAS Y SELLOS DE AGENCIA
  currentY += dataBoxH + 18;
  const sigLineW = 60;
  const col1CenterX = margin + sigLineW / 2 + 5;
  const col2CenterX = pageWidth - margin - sigLineW / 2 - 5;

  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.4);

  // Firma Solicitante
  doc.line(col1CenterX - sigLineW / 2, currentY, col1CenterX + sigLineW / 2, currentY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text('Firma del Solicitante', col1CenterX, currentY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text(`DPI: ${caso?.cui_dpi || 'N/A'}`, col1CenterX, currentY + 9.5, { align: 'center' });

  // Firma y Sello Agencia
  doc.line(col2CenterX - sigLineW / 2, currentY, col2CenterX + sigLineW / 2, currentY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text('Firma y Sello de Agencia Receptora', col2CenterX, currentY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('Corporación Bancaria • Verificado', col2CenterX, currentY + 9.5, { align: 'center' });

  // 7. PIE DE PÁGINA Y SEGURIDAD
  currentY += 18;
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    'Documento de control interno emitido por el Sistema de Afiliación Digital • Válido para ventanilla en agencias.',
    pageWidth / 2,
    currentY + 5,
    { align: 'center' }
  );

  // Descarga del archivo PDF
  const safeCaso = (caso?.numero_caso || 'CASO').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Constancia_${safeCaso}.pdf`;
  doc.save(filename);

  return doc;
};
