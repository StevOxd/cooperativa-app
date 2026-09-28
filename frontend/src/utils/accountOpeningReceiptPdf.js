import { jsPDF } from 'jspdf';

/**
 * Genera y descarga el comprobante oficial de apertura de cuenta y depósito inicial en ventanilla.
 * Diseñado con el formato corporativo bancario oficial de la Cooperativa.
 *
 * @param {Object} params
 * @param {Object} params.data - Datos de la cuenta formalizada y titular
 * @returns {jsPDF} Instancia del documento PDF
 */
export const generateAccountOpeningReceiptPdf = ({ data }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter', // 215.9 x 279.4 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Paleta de Colores Institucional
  const primaryNavy = [12, 74, 110];    // #0c4a6e
  const softBlue = [2, 132, 199];      // #0284c7
  const skyAccent = [56, 189, 248];    // #38bdf8
  const darkNavyBg = [15, 23, 42];     // #0f172a
  const darkText = [30, 41, 59];       // #1e293b
  const mutedText = [100, 116, 139];   // #64748b
  const lightCardBg = [248, 250, 252]; // #f8fafc
  const borderLight = [226, 232, 240]; // #e2e8f0
  const emeraldTitle = [6, 95, 70];    // #065f46
  const emeraldBg = [236, 253, 245];   // #ecfdf5
  const emeraldBorder = [167, 243, 208]; // #a7f3d0

  const now = new Date();
  const fechaHoy = now.toLocaleDateString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horaHoy = now.toLocaleTimeString('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // 1. ENCABEZADO INSTITUCIONAL
  const topY = 16;
  const iconX = margin;
  const iconY = topY;
  const iconSize = 11;
  doc.setFillColor(...primaryNavy);
  doc.roundedRect(iconX, iconY, iconSize, iconSize, 2.5, 2.5, 'F');

  // Silueta vectorial de edificio
  doc.setFillColor(255, 255, 255);
  doc.rect(iconX + 2.5, iconY + 2.8, 6, 6, 'F');
  doc.setFillColor(...primaryNavy);
  doc.rect(iconX + 3.3, iconY + 3.6, 1.3, 1.1, 'F');
  doc.rect(iconX + 6.4, iconY + 3.6, 1.3, 1.1, 'F');
  doc.rect(iconX + 3.3, iconY + 5.4, 1.3, 1.1, 'F');
  doc.rect(iconX + 6.4, iconY + 5.4, 1.3, 1.1, 'F');
  doc.rect(iconX + 4.9, iconY + 7.1, 1.2, 1.7, 'F');

  // Título Institucional
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO, R.L.', iconX + iconSize + 3.5, topY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...softBlue);
  doc.text('COMPROBANTE OFICIAL DE APERTURA DE CUENTA Y OPERACIÓN EN VENTANILLA', iconX + iconSize + 3.5, topY + 9);

  // Metadatos derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('ORIGINAL: CLIENTE / ASOCIADO', pageWidth - margin, topY + 4.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text(`Fecha y Hora: ${fechaHoy} ${horaHoy}`, pageWidth - margin, topY + 9, { align: 'right' });

  // Línea divisoria
  let currentY = topY + 14;
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // 2. TARJETA PRINCIPAL: DATOS DE LA CUENTA APERTURADA
  currentY += 5;
  const accountCardH = 26;
  doc.setFillColor(...darkNavyBg);
  doc.roundedRect(margin, currentY, contentWidth, accountCardH, 3.5, 3.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...skyAccent);
  doc.text('CUENTA BANCARIA DE AHORRO APERTURADA', margin + 7, currentY + 7);

  doc.setFont('courier', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(data?.numero_cuenta || 'CTA-AHORR-XXXXXX', margin + 7, currentY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Producto: ${data?.tipo_cuenta || 'Cuenta de Ahorro'}  •  Estado: ACTIVA  •  Usuario: ${data?.usuario || 'S/C'}`,
    margin + 7,
    currentY + 21
  );

  // Insignia lateral derecha de saldo acreditado
  const badgeW = 60;
  const badgeH = 16;
  const badgeX = pageWidth - margin - badgeW - 6;
  const badgeY = currentY + 5;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5, 2.5, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...skyAccent);
  doc.text('DEPÓSITO INICIAL ACREDITADO', badgeX + badgeW / 2, badgeY + 5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  const formattedSaldo = parseFloat(data?.saldo_inicial || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  doc.text(`Q${formattedSaldo}`, badgeX + badgeW / 2, badgeY + 12, { align: 'center' });

  // 3. SECCIÓN: DATOS DEL ASOCIADO TITULAR
  currentY += accountCardH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryNavy);
  doc.text('1. INFORMACIÓN DEL ASOCIADO TITULAR', margin, currentY);

  currentY += 2.5;
  const titularCardH = 28;
  doc.setFillColor(...lightCardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, titularCardH, 2.5, 2.5, 'FD');

  const col1X = margin + 6;
  const col2X = margin + contentWidth / 2 + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('Nombre Completo:', col1X, currentY + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text(data?.nombre_completo || 'No especificado', col1X, currentY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('Documento CUI / DPI:', col1X, currentY + 17.5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text(data?.cui_dpi || 'No registrado', col1X, currentY + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('Correo Electrónico Notificaciones:', col2X, currentY + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text(data?.email || 'Sin correo', col2X, currentY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('Teléfono de Contacto:', col2X, currentY + 17.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkText);
  doc.text(data?.telefono || 'No registrado', col2X, currentY + 22.5);

  // 4. SECCIÓN: DESGLOSE DE OPERACIÓN EN VENTANILLA
  currentY += titularCardH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryNavy);
  doc.text('2. DESGLOSE DE OPERACIÓN EN VENTANILLA', margin, currentY);

  currentY += 2.5;
  const desgloseCardH = 46;
  doc.setFillColor(...lightCardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, desgloseCardH, 2.5, 2.5, 'FD');

  const tableRows = [
    { label: 'Número de Caso Operativo:', val: data?.numero_caso || 'CASO-AFIL-XXXX' },
    { label: 'Concepto de la Transacción:', val: 'Apertura de Cuenta y Acreditación de Saldo Inicial' },
    { label: 'Tipo de Cuenta Aperturada:', val: data?.tipo_cuenta || 'Cuenta de Ahorro Corriente' },
    { label: 'Medio de Recepción de Fondos:', val: 'Efectivo en Ventanilla Bancaria' },
    { label: 'Monto Recibido y Acreditado:', val: `Q${formattedSaldo}` },
    { label: 'Saldo Disponible Inmediato:', val: `Q${formattedSaldo}` },
    { label: 'Atendido por Operador:', val: data?.operador_nombre || 'Operador de Ventanilla' },
  ];

  let rowY = currentY + 6;
  tableRows.forEach((r, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...mutedText);
    doc.text(r.label, col1X, rowY);

    doc.setFont('helvetica', idx === 4 || idx === 5 ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(idx === 4 || idx === 5 ? 6 : 30, idx === 4 || idx === 5 ? 95 : 41, idx === 4 || idx === 5 ? 70 : 59);
    doc.text(r.val, col2X - 10, rowY);

    if (idx < tableRows.length - 1) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(col1X, rowY + 1.8, pageWidth - margin - 6, rowY + 1.8);
    }
    rowY += 5.6;
  });

  // 5. CAJA DE SEGURIDAD Y CREDENCIALES INSTITUCIONALES
  currentY += desgloseCardH + 6;
  const securityCardH = 26;
  doc.setFillColor(...emeraldBg);
  doc.setDrawColor(...emeraldBorder);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, currentY, contentWidth, securityCardH, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...emeraldTitle);
  doc.text('POLÍTICAS DE CIBERSEGURIDAD BANCARIA Y ENTREGA DE ACCESOS', margin + 6, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(20, 83, 45);
  const secText =
    'Por protocolo de seguridad y confidencialidad financiera, la contraseña temporal de acceso web ha sido generada criptográficamente por el sistema y despachada de manera exclusiva al correo electrónico registrado del asociado titular. El operador de ventanilla no tiene visibilidad de su contraseña. Al ingresar al portal por primera vez, el sistema le exigirá el cambio obligatorio por su contraseña personal.';
  const splitSecText = doc.splitTextToSize(secText, contentWidth - 12);
  doc.text(splitSecText, margin + 6, currentY + 10.5);

  // 6. BLOQUE DE FIRMAS Y CONFORMIDAD
  currentY += securityCardH + 14;
  const signColWidth = (contentWidth - 20) / 2;

  // Firma Asociado
  const sign1X = margin;
  doc.setDrawColor(...mutedText);
  doc.setLineWidth(0.35);
  doc.line(sign1X, currentY, sign1X + signColWidth, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...darkText);
  doc.text(data?.nombre_completo || 'Asociado Titular', sign1X + signColWidth / 2, currentY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text('Firma del Asociado Titular', sign1X + signColWidth / 2, currentY + 7.5, { align: 'center' });
  doc.text(`CUI: ${data?.cui_dpi || 'N/A'}`, sign1X + signColWidth / 2, currentY + 10.5, { align: 'center' });

  // Firma Operador
  const sign2X = pageWidth - margin - signColWidth;
  doc.setDrawColor(...mutedText);
  doc.setLineWidth(0.35);
  doc.line(sign2X, currentY, sign2X + signColWidth, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...darkText);
  doc.text(data?.operador_nombre || 'Operador de Ventanilla', sign2X + signColWidth / 2, currentY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text('Firma y Sello de Ventanilla Bancaria', sign2X + signColWidth / 2, currentY + 7.5, { align: 'center' });
  doc.text('Operación Verificada y Liquidada', sign2X + signColWidth / 2, currentY + 10.5, { align: 'center' });

  // 7. PIE DE PÁGINA
  const footerY = pageHeight - 12;
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text(
    'Cooperativa Integral de Ahorro y Crédito, R.L. • Documento probatorio de apertura de producto financiero y recepción de fondos.',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  // Descarga del documento
  const fileName = `Comprobante_Apertura_${data?.numero_cuenta || 'Cuenta'}.pdf`;
  doc.save(fileName);
  return doc;
};
