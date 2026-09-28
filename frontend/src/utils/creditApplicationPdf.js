import { jsPDF } from 'jspdf';

/**
 * Genera y descarga el formulario oficial en PDF de la solicitud de crédito
 * para que el asociado lo firme de puño y letra o electrónicamente y lo suba al sistema.
 * 
 * @param {Object} params
 * @param {Object} params.asociado - Datos personales y corporativos del asociado
 * @param {Object} params.credito - Datos del crédito (monto, plazo, cuota, tasa, observaciones)
 * @param {Object} [params.cuentaDestino] - Información de la cuenta seleccionada para acreditación
 * @returns {jsPDF} Instancia del documento PDF generado
 */
export const generateCreditApplicationPdf = ({ asociado, credito, cuentaDestino }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter', // 215.9 x 279.4 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Paleta de Colores Institucional (Azul Suave Corporativo)
  const primaryColor = [12, 74, 110];    // #0c4a6e (Azul bancario ejecutivo)
  const secondaryColor = [2, 132, 199];  // #0284c7 (Azul medio)
  const lightBg = [240, 247, 255];       // #f0f7ff (Fondo suave)
  const darkText = [30, 41, 59];         // #1e293b (Texto oscuro)
  const mutedText = [100, 116, 139];     // #64748b (Texto gris)
  const borderColor = [186, 224, 253];   // #bae0fd (Borde azul suave)

  // 1. Encabezado Superior con Barra Azul
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Decoración de acento
  doc.setFillColor(...secondaryColor);
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Título Principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO, R.L.', pageWidth / 2, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('SISTEMA DE GESTIÓN CREDITICIA Y SERVICIOS FINANCIEROS', pageWidth / 2, 17, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('FORMULARIO OFICIAL DE SOLICITUD DE CRÉDITO', pageWidth / 2, 23, { align: 'center' });

  // Referencia y Fecha
  let currentY = 36;
  const fechaHoy = new Date().toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const folioFinal = credito?.id_solicitud_credito || credito?.id_solicitud 
    ? `SOL-#${credito.id_solicitud_credito || credito.id_solicitud}` 
    : `SOL-TEMP-${Date.now().toString().slice(-6)}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryColor);
  doc.text(`NO. SOLICITUD / FOLIO: ${folioFinal}`, margin, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text(`Fecha de Emisión: ${fechaHoy}`, pageWidth - margin, currentY, { align: 'right' });

  currentY += 6;

  // Función auxiliar para dibujar títulos de sección
  const drawSectionHeader = (title, y) => {
    doc.setFillColor(...lightBg);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    doc.text(title, margin + 4, y + 4.8);
    return y + 9;
  };

  // 2. SECCIÓN I: INFORMACIÓN DEL ASOCIADO
  currentY = drawSectionHeader('I. INFORMACIÓN GENERAL DEL ASOCIADO SOLICITANTE', currentY);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 32, 1.5, 1.5, 'D');

  const nombreAsociado = asociado?.nombre_completo || `${asociado?.primer_nombre || ''} ${asociado?.primer_apellido || ''}`.trim() || 'Asociado';
  const dpi = asociado?.cui_dpi || 'N/A';
  const codigoAsoc = asociado?.codigo_corporativo || 'ASOC-DEMO';
  const telefono = asociado?.telefono || 'N/A';
  const email = asociado?.email || 'N/A';
  const direccion = asociado?.direccion || 'Ciudad de Guatemala';

  doc.setFontSize(8.5);
  const rowH = 6;
  let textY = currentY + 5.5;

  // Fila 1
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Nombre Completo:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(nombreAsociado, margin + 35, textY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Cód. Asociado:', margin + 115, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(codigoAsoc, margin + 142, textY);

  // Fila 2
  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('DPI / CUI:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(dpi, margin + 35, textY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Teléfono:', margin + 115, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(telefono, margin + 142, textY);

  // Fila 3
  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Correo Electrónico:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(email, margin + 35, textY);

  // Fila 4
  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Dirección Domicilio:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(direccion, margin + 35, textY);

  currentY += 36;

  // 3. SECCIÓN II: CONDICIONES DEL CRÉDITO SOLICITADO
  currentY = drawSectionHeader('II. CONDICIONES FINANCIERAS DEL CRÉDITO SOLICITADO', currentY);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 44, 1.5, 1.5, 'D');

  const montoSolicitadoNum = parseFloat(credito?.monto || credito?.monto_solicitado || 0);
  const plazoMesesNum = parseInt(credito?.plazo || credito?.plazo_meses || 12, 10);
  const tasaAnual = 10.00;
  const cuotaEstimadaNum = parseFloat(credito?.cuotaMensual || credito?.cuota_mensual_estimada || 0);
  const totalFinanciamiento = cuotaEstimadaNum * plazoMesesNum;
  const destinoTexto = cuentaDestino?.etiqueta_tipo 
    ? `${cuentaDestino.etiqueta_tipo} (${cuentaDestino.numero_cuenta})`
    : credito?.cuenta_destino_info || 'Cuenta predeterminada del asociado';

  textY = currentY + 5.5;

  // Columna Izquierda
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Monto Solicitado:', margin + 4, textY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(`Q ${montoSolicitadoNum.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 42, textY);

  // Columna Derecha
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Plazo Amortización:', margin + 98, textY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkText);
  doc.text(`${plazoMesesNum} meses`, margin + 142, textY);

  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Tasa Interés Anual:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(`${tasaAnual.toFixed(2)}% fija anual`, margin + 42, textY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Cuota Mensual Estimada:', margin + 98, textY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...secondaryColor);
  doc.text(`Q ${cuotaEstimadaNum.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 142, textY);

  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Total Estimado a Pagar:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(`Q ${totalFinanciamiento.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 42, textY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Sistema de Cálculo:', margin + 98, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text('Amortización Francesa', margin + 142, textY);

  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Cuenta de Desembolso:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  doc.text(destinoTexto, margin + 42, textY);

  textY += rowH;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mutedText);
  doc.text('Destino del Crédito:', margin + 4, textY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkText);
  const obsTexto = credito?.observaciones || 'Capital de inversión / Libre disponibilidad del asociado';
  doc.text(obsTexto.slice(0, 75), margin + 42, textY);

  currentY += 48;

  // 4. SECCIÓN III: DECLARACIÓN Y COMPROMISO LEGAL
  currentY = drawSectionHeader('III. DECLARACIÓN JURADA Y COMPROMISO DE PAGO', currentY);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 26, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...darkText);

  const clausulaLegal = 
    '1. El solicitante declara bajo juramento de ley que los datos consignados en esta solicitud son verídicos y comprobables.\n' +
    '2. Autorizo expresamente a la Cooperativa Integral de Ahorro y Crédito, R.L. a verificar mis referencias personales, laborales y crediticias en burós autorizados.\n' +
    '3. En caso de ser autorizada la presente solicitud, me comprometo formalmente a pagar puntualmente las cuotas mensuales consecutivas hasta la total cancelación de la deuda.\n' +
    '4. Acepto que cualquier falsedad o inexactitud en la presente información será causal de anulación inmediata de la solicitud sin responsabilidad para la institución.';

  doc.text(clausulaLegal, margin + 4, currentY + 4.5, {
    maxWidth: contentWidth - 8,
    lineHeightFactor: 1.35,
  });

  currentY += 30;

  // 5. SECCIÓN IV: ÁREA PARA FIRMA AUTÓGRAFA Y HUELLA DACTILAR
  currentY = drawSectionHeader('IV. FIRMA DEL ASOCIADO SOLICITANTE Y HUELLA DACTILAR', currentY);

  const firmaBoxWidth = (contentWidth - 6) / 2;
  const firmaBoxHeight = 44;

  // Cuadro 1: Firma del Asociado
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, currentY, firmaBoxWidth, firmaBoxHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('(Firme aquí de forma idéntica a su DPI físico)', margin + firmaBoxWidth / 2, currentY + 8, { align: 'center' });

  // Línea de firma
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(margin + 12, currentY + 30, margin + firmaBoxWidth - 12, currentY + 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...primaryColor);
  doc.text('FIRMA DEL ASOCIADO SOLICITANTE', margin + firmaBoxWidth / 2, currentY + 34, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...darkText);
  doc.text(`DPI: ${dpi}`, margin + firmaBoxWidth / 2, currentY + 38.5, { align: 'center' });

  // Cuadro 2: Huella Dactilar
  const huellaX = margin + firmaBoxWidth + 6;
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(huellaX, currentY, firmaBoxWidth, firmaBoxHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('(Impresión de huella dactilar pulgar derecho)', huellaX + firmaBoxWidth / 2, currentY + 8, { align: 'center' });

  // Recuadro interior para la huella
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(huellaX + firmaBoxWidth / 2 - 12, currentY + 12, 24, 26, 'D');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text('HUELLA DIGITAL', huellaX + firmaBoxWidth / 2, currentY + 26, { align: 'center' });

  currentY += firmaBoxHeight + 4;

  // 6. SECCIÓN V: CONTROL INTERNO (OPERADOR Y EJECUTIVO)
  doc.setFillColor(...lightBg);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...primaryColor);
  doc.text('V. ESPACIO EXCLUSIVO PARA DICTAMEN OPERATIVO Y RESOLUCIÓN EJECUTIVA', margin + 4, currentY + 4.5);

  const colW = (contentWidth - 8) / 2;
  // Sub-bloque Operador
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text('Revisión Operativa (Operador):', margin + 4, currentY + 9);
  doc.setFont('helvetica', 'normal');
  doc.text('[ ] Expediente Completo    [ ] Scoring Conforme    [ ] PDF Firmado Verificado', margin + 4, currentY + 13.5);
  doc.text('Firma y Cód. Operador: _________________________________', margin + 4, currentY + 18);

  // Sub-bloque Ejecutivo
  const ejX = margin + colW + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text('Resolución Comité (Ejecutivo):', ejX, currentY + 9);
  doc.setFont('helvetica', 'normal');
  doc.text('[ ] ACEPTADA    [ ] DEVUELTA    [ ] DENEGADA', ejX, currentY + 13.5);
  doc.text('Firma y Sello Ejecutivo: ________________________________', ejX, currentY + 18);

  // 7. Pie de Página de Seguridad
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text(
    `Documento Oficial de la Cooperativa • Generado electrónicamente el ${new Date().toISOString()} • Folio: ${folioFinal}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

  // Guardar archivo directamente en el navegador del usuario
  const safeCodigo = (asociado?.codigo_corporativo || 'ASOC').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFolio = (folioFinal || 'SOL').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Solicitud_Credito_${safeCodigo}_${safeFolio}.pdf`;
  doc.save(filename);

  return doc;
};
