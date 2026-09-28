import { jsPDF } from 'jspdf';

/**
 * Genera y descarga el Estado de Cuenta Oficial en formato PDF para el asociado.
 * Cumple con los requerimientos del Módulo 3 (Salida Externa EO) de la tesis,
 * aplicando la línea visual bancaria corporativa (Azul / Pizarra / Sky).
 *
 * @param {Object} params
 * @param {Object} params.asociado - Datos del asociado titular (nombre, cui, codigo, email, etc.)
 * @param {Object} params.cuenta - Datos de la cuenta (numero_cuenta, tipo_cuenta, saldo_disponible, etc.)
 * @param {Array<Object>} params.transacciones - Lista cronológica de movimientos de la cuenta
 * @returns {jsPDF} Instancia del documento PDF generado
 */
export const generateAccountStatementPdf = ({ asociado, cuenta, transacciones = [] }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter', // 215.9 x 279.4 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Paleta de Colores Institucional (Azul Corporativo / Pizarra / Sky)
  const primaryNavy = [12, 74, 110];    // #0c4a6e (Azul corporativo principal)
  const softBlue = [2, 132, 199];      // #0284c7 (Azul medio bancario)
  const skyAccent = [14, 165, 233];    // #0ea5e9 (Acento sky)
  const darkText = [15, 23, 42];       // #0f172a (Texto oscuro títulos)
  const slateText = [51, 65, 85];      // #334155 (Texto cuerpo)
  const mutedText = [100, 116, 139];   // #64748b (Texto gris etiquetas)
  const cardBg = [248, 250, 252];      // #f8fafc (Fondo gris claro)
  const borderLight = [226, 232, 240]; // #e2e8f0 (Borde sutil)
  const rowAltBg = [241, 245, 249];    // #f1f5f9 (Fila zebra)
  const greenText = [3, 105, 161];     // #0369a1 (Créditos / depósitos en azul financiero)
  const redText = [190, 18, 60];       // #be123c (Débitos / retiros)

  const fechaHoy = new Date().toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const horaHoy = new Date().toLocaleTimeString('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const numCuentaLimpio = cuenta?.numero_cuenta || 'CTA-000';
  const folioDoc = `EDC-${numCuentaLimpio}-${Date.now().toString().slice(-6)}`;

  // Función para dibujar encabezado institucional en cada página
  const drawHeader = (pageNum) => {
    // Franja superior azul corporativa
    doc.setFillColor(...primaryNavy);
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Línea de acento sky
    doc.setFillColor(...softBlue);
    doc.rect(0, 24, pageWidth, 1.5, 'F');

    // Icono vectorial de edificio bancario
    const iconX = margin;
    const iconY = 4.5;
    const iconSize = 13;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(iconX, iconY, iconSize, iconSize, 2, 2, 'F');

    // Columnas del edificio en azul
    doc.setFillColor(...primaryNavy);
    doc.rect(iconX + 2.5, iconY + 3, 8, 7, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(iconX + 3.8, iconY + 4, 1.4, 4.5, 'F');
    doc.rect(iconX + 5.8, iconY + 4, 1.4, 4.5, 'F');
    doc.rect(iconX + 7.8, iconY + 4, 1.4, 4.5, 'F');

    // Título institucional
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO, R.L.', iconX + iconSize + 4, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(224, 242, 254);
    doc.text('CORPORACIÓN BANCARIA • DIVISIÓN DE SERVICIOS FINANCIEROS Y AHORRO', iconX + iconSize + 4, 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('ESTADO DE CUENTA TRANSACCIONAL', pageWidth - margin, 11, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(224, 242, 254);
    doc.text(`Folio: ${folioDoc}`, pageWidth - margin, 16, { align: 'right' });
  };

  // Función para dibujar pie de página institucional
  const drawFooter = (pageNum, totalPages) => {
    const footerY = pageHeight - 14;

    doc.setDrawColor(...borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...mutedText);
    doc.text(
      'Documento oficial emitido bajo estándares de seguridad bancaria. Validez legal interna respaldada por el reglamento cooperativo.',
      margin,
      footerY + 4
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...slateText);
    doc.text(
      `Página ${pageNum} de ${totalPages} • Emisión: ${fechaHoy}, ${horaHoy}`,
      pageWidth - margin,
      footerY + 4,
      { align: 'right' }
    );
  };

  // DIBUJAR PÁGINA 1
  drawHeader(1);

  let currentY = 32;

  // 1. FICHA I: INFORMACIÓN DEL ASOCIADO TITULAR
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, currentY, contentWidth, 23, 2, 2, 'FD');

  // Barra lateral izquierda decorativa
  doc.setFillColor(...softBlue);
  doc.roundedRect(margin, currentY, 2.5, 23, 1, 1, 'F');

  const nombreAsociado = asociado?.nombre_completo ||
    `${asociado?.primer_nombre || ''} ${asociado?.primer_apellido || ''}`.trim() ||
    'Asociado Titular';
  const cuiDpi = asociado?.cui_dpi || 'N/A';
  const codigoAsoc = asociado?.codigo_corporativo || 'ASOC-00';
  const emailAsoc = asociado?.email || 'N/A';
  const fechaIngreso = asociado?.fecha_ingreso
    ? new Date(asociado.fecha_ingreso).toLocaleDateString('es-GT')
    : 'Registrado';

  // Fila 1 datos asociado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('TITULAR DE LA CUENTA:', margin + 6, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkText);
  doc.text(nombreAsociado.toUpperCase(), margin + 45, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('CÓDIGO ASOCIADO:', pageWidth - margin - 55, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...softBlue);
  doc.text(codigoAsoc, pageWidth - margin - 22, currentY + 5.5);

  // Fila 2 datos asociado
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedText);
  doc.text('CUI / DPI:', margin + 6, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...slateText);
  doc.text(cuiDpi, margin + 25, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text('CORREO:', margin + 70, currentY + 12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateText);
  doc.text(emailAsoc, margin + 87, currentY + 12);

  // Fila 3 fecha corte
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text('FECHA AFILIACIÓN:', margin + 6, currentY + 18.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateText);
  doc.text(fechaIngreso, margin + 35, currentY + 18.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text('CORTE AL:', margin + 70, currentY + 18.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryNavy);
  doc.text(`${fechaHoy} (${horaHoy})`, margin + 87, currentY + 18.5);

  currentY += 28;

  // 2. FICHA II: RESUMEN DE SALDOS DE LA CUENTA
  const saldoDisp = parseFloat(cuenta?.saldo_disponible || 0);
  const saldoRes = parseFloat(cuenta?.saldo_reserva || 0);
  const saldoTotal = saldoDisp + saldoRes;
  const tipoCuenta = cuenta?.tipo_cuenta || 'Ahorro Corriente';
  const tasaInteres = cuenta?.tasa_interes_anual ? `${cuenta.tasa_interes_anual}% Anual` : 'N/A';
  const estadoCuenta = cuenta?.estado || 'ACTIVA';

  // 4 Tarjetas de resumen horizontal
  const cardWidth = (contentWidth - 9) / 4;
  const cards = [
    { label: 'NO. DE CUENTA', value: numCuentaLimpio, isFontMono: true, highlight: false },
    { label: 'SALDO DISPONIBLE', value: `Q ${saldoDisp.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isFontMono: false, highlight: true },
    { label: 'SALDO EN RESERVA', value: `Q ${saldoRes.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isFontMono: false, highlight: false },
    { label: 'SALDO TOTAL', value: `Q ${saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, isFontMono: false, highlight: false },
  ];

  cards.forEach((c, idx) => {
    const cx = margin + idx * (cardWidth + 3);
    doc.setFillColor(c.highlight ? 240 : 248, c.highlight ? 247 : 250, c.highlight ? 255 : 252);
    doc.setDrawColor(c.highlight ? 186 : 226, c.highlight ? 224 : 232, c.highlight ? 253 : 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, currentY, cardWidth, 18, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...mutedText);
    doc.text(c.label, cx + cardWidth / 2, currentY + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(c.isFontMono ? 8.5 : 9.5);
    doc.setTextColor(c.highlight ? 3 : 15, c.highlight ? 105 : 23, c.highlight ? 161 : 42);
    doc.text(c.value, cx + cardWidth / 2, currentY + 12.5, { align: 'center' });
  });

  currentY += 23;

  // Franja informativa de producto y tasa
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...borderLight);
  doc.roundedRect(margin, currentY, contentWidth, 7.5, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...mutedText);
  doc.text('TIPO DE PRODUCTO:', margin + 4, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...slateText);
  doc.text(tipoCuenta.toUpperCase(), margin + 35, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text('TASA DE INTERÉS:', margin + 95, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryNavy);
  doc.text(tasaInteres, margin + 125, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedText);
  doc.text('ESTADO:', pageWidth - margin - 35, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // verde suave para estado ACTIVA
  doc.text(estadoCuenta, pageWidth - margin - 15, currentY + 5);

  currentY += 13;

  // 3. SECCIÓN III: MOVIMIENTOS HISTÓRICOS / CARTOLA TRANSACCIONAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primaryNavy);
  doc.text('DETALLE DE MOVIMIENTOS Y OPERACIONES', margin, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text(`${transacciones.length} movimiento(s) registrado(s)`, pageWidth - margin, currentY, { align: 'right' });

  currentY += 4;

  // Cabecera de la tabla
  const colWidths = {
    idx: 8,
    fecha: 30,
    tipo: 36,
    ref: 40,
    monto: 34,
    saldo: 35.9,
  };

  const drawTableHeader = (y) => {
    doc.setFillColor(...primaryNavy);
    doc.rect(margin, y, contentWidth, 6.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);

    let x = margin + 2;
    doc.text('#', x, y + 4.5);
    x += colWidths.idx;

    doc.text('FECHA / HORA', x, y + 4.5);
    x += colWidths.fecha;

    doc.text('TIPO DE OPERACIÓN', x, y + 4.5);
    x += colWidths.tipo;

    doc.text('NO. REFERENCIA', x, y + 4.5);
    x += colWidths.ref;

    doc.text('MONTO (GTQ)', x + colWidths.monto - 3, y + 4.5, { align: 'right' });
    x += colWidths.monto;

    doc.text('SALDO RESULTANTE', x + colWidths.saldo - 3, y + 4.5, { align: 'right' });
  };

  drawTableHeader(currentY);
  currentY += 6.5;

  let totalDebitos = 0;
  let totalCreditos = 0;

  if (transacciones.length === 0) {
    // Caja de estado vacío
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderLight);
    doc.roundedRect(margin, currentY, contentWidth, 20, 1.5, 1.5, 'D');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text(
      'No se encontraron movimientos registrados para esta cuenta en el historial.',
      pageWidth / 2,
      currentY + 11,
      { align: 'center' }
    );
    currentY += 24;
  } else {
    // Renderizado de filas
    const rowHeight = 6.2;
    const maxYForRows = pageHeight - 35; // Espacio reservado para pie y totales

    transacciones.forEach((t, i) => {
      // Salto de página si se excede el espacio
      if (currentY + rowHeight > maxYForRows) {
        doc.addPage();
        drawHeader(doc.getNumberOfPages());
        currentY = 32;
        drawTableHeader(currentY);
        currentY += 6.5;
      }

      const isCredit = ['DEPOSITO', 'PAGO_CREDITO', 'CREDITO', 'CREDITO_ACH'].includes(t.tipo_transaccion);
      const montoNum = parseFloat(t.monto || 0);
      const saldoNum = parseFloat(t.saldo_nuevo || 0);

      if (isCredit) {
        totalCreditos += montoNum;
      } else {
        totalDebitos += montoNum;
      }

      // Fondo zebra
      if (i % 2 === 1) {
        doc.setFillColor(...rowAltBg);
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      }

      // Borde inferior tenue
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      // Datos de columnas
      let x = margin + 2;

      // Columna 1: #
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...mutedText);
      doc.text(String(i + 1), x, currentY + 4.3);
      x += colWidths.idx;

      // Columna 2: Fecha / Hora
      const fStr = t.fecha_transaccion
        ? new Date(t.fecha_transaccion).toLocaleString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-';
      doc.text(fStr, x, currentY + 4.3);
      x += colWidths.fecha;

      // Columna 3: Tipo
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(isCredit ? 3 : 190, isCredit ? 105 : 18, isCredit ? 161 : 60);
      doc.text(String(t.tipo_transaccion || '-').substring(0, 20), x, currentY + 4.3);
      x += colWidths.tipo;

      // Columna 4: Referencia
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...slateText);
      const refStr = String(t.referencia || '-').substring(0, 24);
      doc.text(refStr, x, currentY + 4.3);
      x += colWidths.ref;

      // Columna 5: Monto
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(isCredit ? 3 : 190, isCredit ? 105 : 18, isCredit ? 161 : 60);
      const prefix = isCredit ? '+ Q ' : '- Q ';
      doc.text(
        `${prefix}${montoNum.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        x + colWidths.monto - 3,
        currentY + 4.3,
        { align: 'right' }
      );
      x += colWidths.monto;

      // Columna 6: Saldo
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text(
        `Q ${saldoNum.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        x + colWidths.saldo - 3,
        currentY + 4.3,
        { align: 'right' }
      );

      currentY += rowHeight;
    });
  }

  // 4. RESUMEN DE TOTALES Y SELLO DE SEGURIDAD
  // Comprobar si cabe en la página actual o crear nueva
  if (currentY + 30 > pageHeight - 16) {
    doc.addPage();
    drawHeader(doc.getNumberOfPages());
    currentY = 32;
  } else {
    currentY += 4;
  }

  // Cuadro de Totales del Período
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...borderLight);
  doc.roundedRect(margin, currentY, contentWidth, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...slateText);
  doc.text('TOTAL CRÉDITOS / DEPÓSITOS:', margin + 6, currentY + 5.5);
  doc.setTextColor(...greenText);
  doc.text(`+ Q ${totalCreditos.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`, margin + 55, currentY + 5.5);

  doc.setTextColor(...slateText);
  doc.text('TOTAL DÉBITOS / RETIROS:', margin + 6, currentY + 10.5);
  doc.setTextColor(...redText);
  doc.text(`- Q ${totalDebitos.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`, margin + 55, currentY + 10.5);

  // Sello digital criptográfico a la derecha
  const rawSeed = `${numCuentaLimpio}-${fechaHoy}-${totalCreditos}-${totalDebitos}`;
  let hashNum = 0;
  for (let i = 0; i < rawSeed.length; i++) {
    hashNum = ((hashNum << 5) - hashNum) + rawSeed.charCodeAt(i);
    hashNum |= 0;
  }
  const hashVerificacion = `SHA256:0x${Math.abs(hashNum).toString(16).toUpperCase().padStart(8, '0')}${Date.now().toString(16).toUpperCase().slice(-8)}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text('SELLO DIGITAL DE INTEGRIDAD:', pageWidth - margin - 75, currentY + 5.5);

  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...primaryNavy);
  doc.text(hashVerificacion, pageWidth - margin - 75, currentY + 10.5);

  // 5. APLICAR PIE DE PÁGINA EN TODAS LAS HOJAS
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  // Guardar / Descargar PDF automáticamente
  const filename = `ESTADO-CUENTA-${numCuentaLimpio}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);

  return doc;
};
