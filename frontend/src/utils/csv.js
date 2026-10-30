/**
 * Archivos CSV que se abren en Excel: UTF-8 con BOM (para que respete las tildes), separados por comas y con fin de
 * línea CRLF.
 */

// Excel ejecuta como fórmula una celda que empieza con = + - @ (inyección de fórmulas, CWE-1236). Se revisa el inicio
// y lo que sigue a cualquier separador: en un equipo que separa listas con «;», «X;=1+1» se partiría en dos celdas.
const DISPARADOR_DE_FORMULA = /(^|[;,|\t\r\n])(\s*)([=+\-@])/g;

/**
 * Celda lista para el CSV. Los números van tal cual; un texto va siempre entre comillas (así ningún separador de su
 * interior abre otra celda) y cada disparador de fórmula se antepone con un apóstrofo. `{ textoFijo }` es un número
 * que Excel debe dejar como texto (un DPI de 13 dígitos saldría en notación científica): si son solo dígitos, va
 * como `="…"`, que no ejecuta nada.
 *
 * @param {*} valor
 * @returns {string}
 */
export const celdaCsv = (valor) => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object' && 'textoFijo' in valor) {
    const texto = String(valor.textoFijo ?? '');
    return /^\d+$/.test(texto) ? `="${texto}"` : celdaCsv(texto);
  }
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  const texto = String(valor).replace(DISPARADOR_DE_FORMULA, "$1$2'$3");
  return `"${texto.replace(/"/g, '""')}"`;
};

/**
 * Arma el CSV y lo descarga.
 *
 * @param {Object} params
 * @param {string} params.nombre - Nombre del archivo, con la extensión .csv.
 * @param {string[]} params.encabezados
 * @param {Array<Array<*>>} params.filas
 */
export const descargarCsv = ({ nombre, encabezados, filas }) => {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(','));
  const blob = new Blob([`\uFEFF${lineas.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Después del clic: algunos navegadores leen la URL de forma asíncrona
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
