/**
 * Formatos de presentación compartidos (montos, fechas, estados).
 * Solo afectan cómo se muestra un dato; no lo modifican.
 */

/** Monto en quetzales: "Q1,250.00". */
export const formatQ = (value) =>
  `Q${parseFloat(value || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fecha y hora compacta para tablas: "12/09/2026, 22:30". */
export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('es-GT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : '—';

/** Fecha compacta: "12/09/2026". */
export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

/**
 * Fecha de una columna DATE (fecha de ingreso, de nacimiento): "30/10/2026". Se toma el día tal como viene
 * (AAAA-MM-DD), sin convertirlo a la hora local: la columna llega como medianoche UTC y en Guatemala se vería el
 * día anterior.
 */
export const formatDateOnly = (value) => {
  const dia = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.split('-').reverse().join('/') : '—';
};

/** Fecha de hoy en Guatemala (AAAA-MM-DD), p. ej. para el nombre de un archivo. */
export const hoyEnGuatemala = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guatemala' });

/** Tamaño en MB con un decimal: "12.3". */
export const megas = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/** "EN_REVISION_OPERADOR" → "En revision operador" (respaldo para estados sin etiqueta). */
export const humanize = (value) => {
  if (!value) return '';
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const RELATIVO = new Intl.RelativeTimeFormat('es-GT', { numeric: 'auto' });
// [unidad, segundos por unidad], de la mayor a la menor
const UNIDADES = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * Tiempo transcurrido desde una fecha: "hace 3 horas", "ayer", "hace 2 días". Cuenta unidades completas (59 minutos
 * no son "hace 1 hora") y una fecha un poco adelantada (reloj del servidor) se toma como "hace un momento".
 */
export const formatRelative = (value, ahora = Date.now()) => {
  if (!value) return '—';
  const segundos = Math.min(0, Math.round((new Date(value).getTime() - ahora) / 1000));
  for (const [unidad, segundosPorUnidad] of UNIDADES) {
    if (-segundos >= segundosPorUnidad) return RELATIVO.format(Math.trunc(segundos / segundosPorUnidad), unidad);
  }
  return 'hace un momento';
};

/** Horas transcurridas desde una fecha (0 si no hay fecha), para avisar de lo que lleva mucho esperando. */
export const horasDesde = (value, ahora = Date.now()) =>
  value ? Math.max(0, (ahora - new Date(value).getTime()) / 3600000) : 0;
