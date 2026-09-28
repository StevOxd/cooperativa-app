import React from 'react';
import { cn } from './cn';

const TONES = {
  neutral: 'bg-surface-sunken text-ink-soft ring-line-strong',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-success-50 text-success-800 ring-success-200',
  warning: 'bg-warning-50 text-warning-800 ring-warning-200',
  danger: 'bg-danger-50 text-danger-800 ring-danger-200',
};

const DOTS = {
  neutral: 'bg-ink-subtle',
  brand: 'bg-brand-600',
  success: 'bg-success-600',
  warning: 'bg-warning-500',
  danger: 'bg-danger-600',
};

/**
 * Etiqueta corta de estado. El texto se escribe normal (no en mayúsculas):
 * "Activo", "En revisión", "Rechazado".
 *
 * @param {Object} props
 * @param {'neutral'|'brand'|'success'|'warning'|'danger'} [props.tone='neutral']
 * @param {boolean} [props.dot=false] - Muestra un punto de color antes del texto.
 */
export const Badge = ({ tone = 'neutral', dot = false, className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
      TONES[tone],
      className
    )}
    {...props}
  >
    {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden="true" />}
    {children}
  </span>
);

export default Badge;
