import { jsPDF } from 'jspdf';

/**
 * Piezas comunes de los PDF de la cooperativa: misma paleta que la interfaz
 * (tailwind.config.js), mismo membrete, secciones, tablas, firmas y pie.
 * Todas las medidas están en milímetros sobre hoja carta.
 */

export const INSTITUCION = 'Cooperativa Integral de Ahorro y Crédito, R.L.';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Colores de tailwind.config.js en RGB. */
export const C = {
  brand: hex('#0369a1'), // brand-700: color de marca en la interfaz
  brandDark: hex('#0c4a6e'), // brand-900
  brandSoft: hex('#f0f7ff'), // brand-50
  brandLine: hex('#bae0fd'), // brand-200
  ink: hex('#0f172a'),
  inkSoft: hex('#334155'),
  inkMuted: hex('#475569'),
  inkSubtle: hex('#64748b'),
  line: hex('#e2e8f0'),
  lineStrong: hex('#cbd5e1'),
  surfaceMuted: hex('#f8fafc'),
  surfaceSunken: hex('#f1f5f9'),
  success: hex('#047857'),
  successSoft: hex('#ecfdf5'),
  successLine: hex('#a7f3d0'),
  warning: hex('#92400e'),
  warningSoft: hex('#fffbeb'),
  warningLine: hex('#fde68a'),
  danger: hex('#b91c1c'),
};

const TONES = {
  neutral: { bg: C.surfaceMuted, border: C.line, title: C.ink, text: C.inkSoft },
  brand: { bg: C.brandSoft, border: C.brandLine, title: C.brandDark, text: C.inkSoft },
  success: { bg: C.successSoft, border: C.successLine, title: C.success, text: C.inkSoft },
  warning: { bg: C.warningSoft, border: C.warningLine, title: C.warning, text: C.inkSoft },
};

export const MARGIN = 18;
const FOOTER_SPACE = 20;

/** "Q12,500.50" */
export const money = (value) =>
  `Q${parseFloat(value || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "29/09/2026" */
export const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** "29/09/2026, 14:05" */
export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

/** Texto seguro para nombres de archivo. */
export const fileSafe = (text) => String(text || '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '');

/** Valor para mostrar: nunca "undefined" ni un marcador inventado. */
export const show = (value) => (value === undefined || value === null || value === '' ? '—' : String(value));

/** Nombre completo de una persona: el calculado por la base o sus nombres y apellidos. */
export const nombreCompleto = (persona) =>
  persona?.nombre_completo ||
  [persona?.primer_nombre, persona?.segundo_nombre, persona?.primer_apellido, persona?.segundo_apellido].filter(Boolean).join(' ');

/** Fecha de hoy en Guatemala (AAAA-MM-DD) para el nombre del archivo; la de UTC sería mañana después de las 18:00. */
export const fechaArchivo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guatemala' });

/** Hoja carta; horizontal para las tablas anchas de los reportes. */
export const createDoc = (orientation = 'portrait') => new jsPDF({ orientation, unit: 'mm', format: 'letter' });

const pageSize = (doc) => ({ w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() });
const contentWidth = (doc) => pageSize(doc).w - MARGIN * 2;

const font = (doc, { size = 9, style = 'normal', color = C.ink, family = 'helvetica' } = {}) => {
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

/** Símbolo de la marca (el mismo del favicon): tres capas sobre un cuadro azul. */
const drawMark = (doc, x, y, size) => {
  doc.setFillColor(...C.brand);
  doc.roundedRect(x, y, size, size, 1.6, 1.6, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.55);
  const cx = x + size / 2;
  const w = size * 0.3;
  [0.34, 0.5, 0.66].forEach((f) => {
    const cy = y + size * f;
    doc.line(cx - w, cy, cx, cy - size * 0.1);
    doc.line(cx, cy - size * 0.1, cx + w, cy);
  });
};

/**
 * Membrete: marca y nombre de la institución a la izquierda; referencia y
 * fecha del documento a la derecha. Devuelve la Y donde empieza el contenido.
 */
export const drawHeader = (doc, { title, reference, date = new Date() }) => {
  const { w } = pageSize(doc);
  const top = 14;
  drawMark(doc, MARGIN, top, 10);

  font(doc, { size: 10.5, style: 'bold' });
  doc.text(INSTITUCION, MARGIN + 13.5, top + 4.2);
  font(doc, { size: 9, color: C.inkMuted });
  doc.text(title, MARGIN + 13.5, top + 8.8);

  if (reference) {
    font(doc, { size: 9, style: 'bold', family: 'courier' });
    doc.text(reference, w - MARGIN, top + 4.2, { align: 'right' });
  }
  font(doc, { size: 8, color: C.inkSubtle });
  doc.text(`Emitido el ${dateTime(date)}`, w - MARGIN, top + 8.8, { align: 'right' });

  doc.setDrawColor(...C.lineStrong);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, top + 13, w - MARGIN, top + 13);
  return top + 21;
};

/** Agrega página si no cabe `needed` mm. Llama a `onNewPage(y)` y devuelve la nueva Y. */
export const ensureSpace = (doc, y, needed, onNewPage) => {
  const { h } = pageSize(doc);
  if (y + needed <= h - FOOTER_SPACE) return y;
  doc.addPage();
  const startY = 20;
  return onNewPage ? onNewPage(startY) : startY;
};

/** Título de sección. */
export const sectionTitle = (doc, y, text) => {
  font(doc, { size: 9.5, style: 'bold' });
  doc.text(text, MARGIN, y);
  return y + 5;
};

/**
 * Datos en columnas: etiqueta pequeña y valor debajo.
 * @param {Array<{label: string, value: any, mono?: boolean, strong?: boolean, span?: number}>} fields
 */
export const fieldsGrid = (doc, y, fields, { columns = 2 } = {}) => {
  const colW = contentWidth(doc) / columns;
  let col = 0;
  let rowY = y;
  let rowH = 0;
  fields.forEach((f) => {
    const span = Math.min(f.span || 1, columns);
    if (col + span > columns) {
      rowY += rowH;
      col = 0;
      rowH = 0;
    }
    const x = MARGIN + col * colW;
    font(doc, { size: 7.5, color: C.inkSubtle });
    doc.text(f.label, x, rowY);
    font(doc, { size: 9.5, style: f.strong ? 'bold' : 'normal', family: f.mono ? 'courier' : 'helvetica' });
    const lines = doc.splitTextToSize(show(f.value), colW * span - 4);
    doc.text(lines, x, rowY + 4.6);
    rowH = Math.max(rowH, 5 + lines.length * 4.4 + 3);
    col += span;
    if (col >= columns) {
      rowY += rowH;
      col = 0;
      rowH = 0;
    }
  });
  return rowY + rowH + 2;
};

/**
 * Recuadro con la cifra o el dato principal del documento, y opcionalmente
 * otro dato a la derecha.
 */
export const highlightBox = (doc, y, { label, value, mono = false, detail, aside }) => {
  const width = contentWidth(doc);
  const height = detail ? 22 : 18;
  doc.setFillColor(...C.brandSoft);
  doc.setDrawColor(...C.brandLine);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, width, height, 1.5, 1.5, 'FD');

  font(doc, { size: 8, color: C.inkMuted });
  doc.text(label, MARGIN + 5, y + 6);
  font(doc, { size: 15, style: 'bold', color: C.brandDark, family: mono ? 'courier' : 'helvetica' });
  doc.text(show(value), MARGIN + 5, y + 13.5);
  if (detail) {
    font(doc, { size: 8, color: C.inkSubtle });
    doc.text(detail, MARGIN + 5, y + 18.5);
  }
  if (aside) {
    const x = MARGIN + width - 5;
    font(doc, { size: 8, color: C.inkMuted });
    doc.text(aside.label, x, y + 6, { align: 'right' });
    font(doc, { size: 15, style: 'bold', color: C.ink });
    doc.text(show(aside.value), x, y + 13.5, { align: 'right' });
  }
  return y + height + 7;
};

/** Nota con título y párrafo (o lista si `text` es un arreglo). */
export const noteBox = (doc, y, { title, text, tone = 'neutral' }) => {
  const t = TONES[tone] || TONES.neutral;
  const width = contentWidth(doc);
  const items = Array.isArray(text) ? text : [text];
  font(doc, { size: 8.5 });
  const wrapped = items.map((item, i) =>
    doc.splitTextToSize(Array.isArray(text) ? `${i + 1}. ${item}` : item, width - 10)
  );
  const lineCount = wrapped.reduce((n, l) => n + l.length, 0);
  const height = (title ? 9 : 5) + lineCount * 4.2 + 3;

  doc.setFillColor(...t.bg);
  doc.setDrawColor(...t.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, width, height, 1.5, 1.5, 'FD');

  let ty = y + 6;
  if (title) {
    font(doc, { size: 8.5, style: 'bold', color: t.title });
    doc.text(title, MARGIN + 5, ty);
    ty += 5;
  }
  font(doc, { size: 8.5, color: t.text });
  wrapped.forEach((lines) => {
    doc.text(lines, MARGIN + 5, ty);
    ty += lines.length * 4.2;
  });
  return y + height + 7;
};

// Una fila de una línea mide 6.4 mm; cada línea más de una celda con `wrap` suma LINEA (8 pt × 1.25)
const ALTO_FILA = 6.4;
const LINEA = 3.53;
const MAX_LINEAS = 12;

/** El texto, recortado con «…» si no cabe en `maxW` (con la fuente ya puesta). */
const recortar = (doc, texto, maxW) => {
  if (doc.getTextWidth(texto) <= maxW) return texto;
  let corto = doc.splitTextToSize(texto, maxW)[0].trimEnd();
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > maxW) corto = corto.slice(0, -1);
  return `${corto}…`;
};

/**
 * Tabla con encabezado repetido en cada página. Una celda va en una línea (recortada con «…»), salvo en las columnas
 * con `wrap`, que ocupan las líneas que necesiten (hasta 12). Los saltos de línea del texto se vuelven espacios.
 * @param {Array<{header: string, width: number, align?: 'left'|'right', mono?: boolean, wrap?: boolean}>} cols -
 *   `width` en fracción del ancho.
 * @param {Array<Array<string|{text: string, color?: number[], bold?: boolean}>>} rows
 */
export const table = (doc, y, cols, rows, { onNewPage, emptyText = 'Sin registros.' } = {}) => {
  const width = contentWidth(doc);
  const widths = cols.map((c) => c.width * width);

  const drawHead = (hy) => {
    doc.setFillColor(...C.surfaceSunken);
    doc.rect(MARGIN, hy, width, 7, 'F');
    font(doc, { size: 7.5, style: 'bold', color: C.inkMuted });
    let x = MARGIN;
    cols.forEach((c, i) => {
      const tx = c.align === 'right' ? x + widths[i] - 2.5 : x + 2.5;
      doc.text(c.header, tx, hy + 4.7, { align: c.align === 'right' ? 'right' : 'left' });
      x += widths[i];
    });
    return hy + 7;
  };

  let cy = drawHead(y);
  if (rows.length === 0) {
    font(doc, { size: 8.5, color: C.inkSubtle });
    doc.text(emptyText, MARGIN + width / 2, cy + 7, { align: 'center' });
    return cy + 16;
  }

  rows.forEach((row) => {
    // Primero las líneas de cada celda: el alto de la fila es el de la celda más alta
    const celdas = row.map((cell, i) => {
      const c = cols[i];
      const cellObj = typeof cell === 'object' && cell !== null ? cell : { text: cell };
      const estilo = {
        size: 8,
        style: cellObj.bold ? 'bold' : 'normal',
        color: cellObj.color || C.inkSoft,
        family: c.mono ? 'courier' : 'helvetica',
      };
      font(doc, estilo);
      const maxW = widths[i] - 5;
      const texto = show(cellObj.text).replace(/\s+/g, ' ').trim() || '—';
      let lineas = [recortar(doc, texto, maxW)];
      if (c.wrap) {
        lineas = doc.splitTextToSize(texto, maxW);
        if (lineas.length > MAX_LINEAS) lineas = [...lineas.slice(0, MAX_LINEAS - 1), recortar(doc, `${lineas[MAX_LINEAS - 1]}…`, maxW)];
      }
      return { estilo, lineas };
    });
    const rowH = ALTO_FILA + (Math.max(...celdas.map((celda) => celda.lineas.length)) - 1) * LINEA;
    cy = ensureSpace(doc, cy, rowH, (ny) => drawHead(onNewPage ? onNewPage(ny) : ny));
    let x = MARGIN;
    celdas.forEach(({ estilo, lineas }, i) => {
      const c = cols[i];
      font(doc, estilo);
      const tx = c.align === 'right' ? x + widths[i] - 2.5 : x + 2.5;
      doc.text(lineas, tx, cy + 4.3, { align: c.align === 'right' ? 'right' : 'left', lineHeightFactor: 1.25 });
      x += widths[i];
    });
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, cy + rowH, MARGIN + width, cy + rowH);
    cy += rowH;
  });
  return cy + 6;
};

/** Líneas de firma lado a lado. */
export const signatures = (doc, y, people) => {
  const gap = 14;
  const width = (contentWidth(doc) - gap * (people.length - 1)) / people.length;
  const lineY = y + 16;
  people.forEach((p, i) => {
    const x = MARGIN + i * (width + gap);
    const cx = x + width / 2;
    doc.setDrawColor(...C.inkSubtle);
    doc.setLineWidth(0.3);
    doc.line(x, lineY, x + width, lineY);
    font(doc, { size: 8.5, style: 'bold' });
    doc.text(show(p.name), cx, lineY + 4.5, { align: 'center' });
    font(doc, { size: 7.5, color: C.inkMuted });
    doc.text(p.role, cx, lineY + 8.5, { align: 'center' });
    if (p.detail) {
      font(doc, { size: 7.5, color: C.inkSubtle, family: p.mono ? 'courier' : 'helvetica' });
      doc.text(p.detail, cx, lineY + 12.3, { align: 'center' });
    }
  });
  return lineY + 18;
};

/** Pie en todas las páginas: nota del documento y número de página. */
export const drawFooters = (doc, note) => {
  const { w, h } = pageSize(doc);
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, h - 14, w - MARGIN, h - 14);
    font(doc, { size: 7, color: C.inkSubtle });
    doc.text(note ? `${INSTITUCION} · ${note}` : INSTITUCION, MARGIN, h - 9.5);
    doc.text(`Página ${i} de ${total}`, w - MARGIN, h - 9.5, { align: 'right' });
  }
};
