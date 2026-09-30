import React from 'react';
import { cn } from './cn';

const TREND_TONES = {
  neutral: 'text-ink-muted',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
};

/**
 * Indicador numérico. Sin ícono en recuadro ni título en mayúsculas: la cifra
 * es lo que manda.
 *
 * @param {Object} props
 * @param {string} props.label - Qué se mide, p. ej. "Solicitudes pendientes".
 * @param {React.ReactNode} props.value - La cifra ya formateada.
 * @param {React.ReactNode} [props.hint] - Contexto breve bajo la cifra.
 * @param {'neutral'|'success'|'warning'|'danger'} [props.hintTone='neutral']
 * @param {React.ElementType} [props.icon] - Ícono pequeño junto a la etiqueta (opcional).
 * @param {boolean} [props.bare=false] - Sin borde propio, para usar dentro de `StatGroup`.
 */
export const StatCard = ({
  label,
  value,
  hint,
  hintTone = 'neutral',
  icon: Icon,
  bare = false,
  className,
  ...props
}) => {
  // Suelto es su propio <dl>; dentro de StatGroup es un grupo <div> del <dl> padre.
  const Component = bare ? 'div' : 'dl';
  return (
    <Component
      className={cn('bg-white px-5 py-4', !bare && 'border border-line rounded-lg', className)}
      {...props}
    >
      <dt className="flex items-center gap-1.5 text-sm text-ink-muted">
        {Icon && <Icon className="w-4 h-4 text-ink-subtle shrink-0" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</dd>
      {hint && <dd className={cn('mt-1 text-xs', TREND_TONES[hintTone])}>{hint}</dd>}
    </Component>
  );
};

/**
 * Agrupa varios `StatCard` en una sola franja con divisores, en lugar de
 * repetir tarjetas sueltas. Pasa `bare` a cada hijo.
 *
 * @param {Object} props
 * @param {2|3|4} [props.columns=4]
 */
export const StatGroup = ({ columns = 4, className, children, ...props }) => {
  const cols = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    // El fondo `bg-line` asoma por el `gap-px` y dibuja los divisores en cualquier número de filas.
    <dl
      className={cn(
        'grid gap-px overflow-hidden bg-line border border-line rounded-lg',
        cols,
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child, { bare: true }) : child
      )}
    </dl>
  );
};

export default StatCard;
