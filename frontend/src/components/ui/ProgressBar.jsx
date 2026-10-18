import React from 'react';
import { cn } from './cn';

// Todos cumplen 3:1 sobre `surface-sunken` (WCAG 1.4.11); el ámbar es warning-700, no warning-500
const TONES = {
  brand: 'bg-brand-700',
  success: 'bg-success-600',
  warning: 'bg-warning-700',
  danger: 'bg-danger-600',
};

/**
 * Barra de avance. Con `label` se anuncia como barra de progreso; sin él es decorativa (el dato ya está escrito
 * al lado, como «70 % de 100 %»).
 *
 * @param {Object} props
 * @param {number} props.value
 * @param {number} [props.max=100]
 * @param {'brand'|'success'|'warning'|'danger'} [props.tone='brand']
 * @param {string} [props.label] - Nombre accesible; si falta, la barra queda oculta para lectores de pantalla.
 * @param {'sm'|'md'} [props.size='sm']
 * @param {string} [props.valueText] - Cómo leer el valor (p. ej. «Paso 2 de 6»); por defecto se anuncia el porcentaje.
 * @param {boolean} [props.minVisible=false] - Muestra unos píxeles aunque el valor sea muy pequeño (quien llama
 *   decide cuándo, por ejemplo si hay al menos un registro).
 */
export const ProgressBar = ({ value, max = 100, tone = 'brand', label, valueText, size = 'sm', minVisible = false, className }) => {
  const porcentaje = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const alto = size === 'md' ? 'h-2' : 'h-1.5';
  const accesible = label
    ? { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-valuetext': valueText }
    : { 'aria-hidden': true };
  return (
    <div className={cn(alto, 'w-full rounded-sm bg-surface-sunken', className)} {...accesible}>
      <div
        className={cn(alto, 'rounded-sm transition-all', TONES[tone])}
        style={{ width: `${porcentaje}%`, minWidth: minVisible ? '4px' : undefined }}
      />
    </div>
  );
};

export default ProgressBar;
