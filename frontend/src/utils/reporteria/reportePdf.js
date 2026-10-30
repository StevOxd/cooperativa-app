import {
  createDoc, drawFooters, drawHeader, ensureSpace, fieldsGrid, noteBox, sectionTitle, signatures, table,
} from '../pdf/pdfKit';
import { nombreDeArchivo, textoDeFiltros } from './definiciones';

const ETIQUETA_FILTRO = { periodo: 'Período', dia: 'Día', estado: 'Estado' };
const SIN_DATOS = { periodo: 'Sin datos en el período.', dia: 'Sin datos ese día.', estado: 'Sin datos.' };

// Va en el pie de cada página: así no queda una hoja suelta solo con el aviso
const AVISO = 'Documento interno con datos personales';

/**
 * Genera y descarga el PDF de un reporte de gestión: membrete con el folio, filtros, totales con su nota, detalle y
 * firmas. Las firmas van pegadas al detalle; si pasan a otra página, llevan arriba el folio y los filtros del reporte.
 * El pie de cada página lleva el folio y el aviso de datos personales.
 *
 * @param {Object} params
 * @param {import('./definiciones').DefinicionReporte} params.definicion
 * @param {Object} params.reporte - Respuesta de `GET /api/reportes/:id` (folio, filtros, filas, resumen…).
 * @param {{ nombre: string }} params.usuario - Quien lo generó; su código es el del registro (`reporte.generado_por`).
 * @returns {import('jspdf').jsPDF} El documento, ya descargado.
 */
export const generateReportPdf = ({ definicion, reporte, usuario }) => {
  const doc = createDoc(definicion.horizontal ? 'landscape' : 'portrait');
  const autor = { nombre: usuario.nombre, codigo: reporte.generado_por };
  const filtros = textoDeFiltros(reporte.filtros);
  const registros = reporte.filas.length.toLocaleString('es-GT');
  const registrosTexto = `${registros} ${reporte.filas.length === 1 ? 'registro' : 'registros'}`;

  let y = drawHeader(doc, { title: definicion.titulo, reference: reporte.folio, date: new Date(reporte.generado_en) });
  y = fieldsGrid(
    doc,
    y,
    [
      { label: ETIQUETA_FILTRO[definicion.filtro], value: filtros, strong: true },
      { label: 'Generado por', value: `${autor.nombre} (${autor.codigo})` },
      { label: 'Registros', value: registros },
    ],
    { columns: 3 }
  );

  for (const bloque of definicion.totales(reporte.resumen)) {
    if (bloque.tabla) {
      y = ensureSpace(doc, y, 28);
      y = sectionTitle(doc, y, bloque.titulo);
      y = table(doc, y, bloque.tabla.columnas, bloque.tabla.filas, { emptyText: SIN_DATOS[definicion.filtro] });
    } else if (bloque.cifras.length > 0) {
      y = ensureSpace(doc, y, 18);
      if (bloque.titulo) y = sectionTitle(doc, y, bloque.titulo);
      y = fieldsGrid(doc, y, bloque.cifras, { columns: Math.min(4, Math.max(2, bloque.cifras.length)) });
    }
  }

  // La nota explica los totales: va junto a ellos, antes del detalle
  if (definicion.nota) {
    y = ensureSpace(doc, y, 22);
    y = noteBox(doc, y, { title: 'Cómo leer este reporte', text: definicion.nota, tone: 'brand' });
  }

  const columnas = definicion.columnas.filter((c) => !c.soloCsv);
  y = ensureSpace(doc, y, 28);
  y = sectionTitle(doc, y, `Detalle (${registros})`);
  y = table(
    doc,
    y,
    columnas.map((c) => ({ header: c.titulo, width: c.ancho, align: c.alinear, mono: c.mono, wrap: c.wrap })),
    reporte.filas.map((fila) => columnas.map((c) => c.pdf(fila))),
    { emptyText: definicion.vacio }
  );

  if (definicion.firmas) {
    const paginas = doc.getNumberOfPages();
    // Lo que ocupan las firmas (`signatures`: 16 mm para firmar y 18 de nombres)
    y = ensureSpace(doc, y, 34);
    // Una hoja de firmas sola se puede separar del documento: dice a qué reporte pertenece
    if (doc.getNumberOfPages() > paginas) {
      y = fieldsGrid(doc, y, [{ label: 'Firmas del reporte', value: `${reporte.folio} · ${definicion.titulo} · ${filtros} · ${registrosTexto}` }], { columns: 1 });
    }
    signatures(doc, y, definicion.firmas(autor));
  }

  drawFooters(doc, `${definicion.titulo} · ${reporte.folio} · ${AVISO}`);
  doc.save(nombreDeArchivo(definicion, reporte, 'pdf'));
  return doc;
};
