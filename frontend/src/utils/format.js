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

/** "EN_REVISION_OPERADOR" → "En revision operador" (respaldo para estados sin etiqueta). */
export const humanize = (value) => {
  if (!value) return '';
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
