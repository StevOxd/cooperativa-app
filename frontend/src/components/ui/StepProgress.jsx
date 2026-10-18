import React from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

const CURRENT = {
  brand: 'border-brand-700 text-brand-800 bg-white',
  warning: 'border-warning-700 text-warning-800 bg-warning-50',
  success: 'border-success-700 bg-success-700 text-white',
  danger: 'border-danger-600 bg-danger-600 text-white',
  neutral: 'border-line-strong text-ink-soft bg-surface-sunken',
};
const SEGMENT = {
  brand: 'bg-brand-700',
  warning: 'bg-warning-700',
  success: 'bg-success-600',
  danger: 'bg-danger-600',
  neutral: 'bg-ink-subtle',
};

/**
 * Avance por pasos, por ejemplo el trámite de un crédito. Los pasos anteriores a `current` se marcan como hechos;
 * `tone` colorea el paso en curso (warning si espera algo, success o danger si es la resolución).
 *
 * @param {Object} props
 * @param {string[]} props.steps - Nombre de cada paso.
 * @param {number} props.current - Índice del paso en curso.
 * @param {'brand'|'warning'|'success'|'danger'|'neutral'} [props.tone='brand']
 * @param {boolean} [props.compact=false] - Barra segmentada con «Paso N de M · nombre», para tablas.
 * @param {string} [props.label='Avance'] - Nombre accesible de la lista de pasos.
 */
export const StepProgress = ({ steps, current, tone = 'brand', compact = false, label = 'Avance', className }) => {
  const total = steps.length;
  if (compact) {
    return (
      <div className={cn('min-w-[7rem]', className)}>
        <div className="flex gap-0.5" aria-hidden="true">
          {steps.map((paso, i) => (
            <span
              key={paso}
              className={cn('h-1 flex-1 rounded-sm', i < current ? 'bg-brand-700' : i === current ? SEGMENT[tone] : 'bg-line-strong')}
            />
          ))}
        </div>
        <p className="mt-1 max-w-[10rem] whitespace-normal text-xs text-ink-muted">
          <span className="sr-only">{label}: </span>Paso {current + 1} de {total} · {steps[current]}
        </p>
      </div>
    );
  }
  return (
    <ol aria-label={label} className={cn('flex items-start', className)}>
      {steps.map((paso, i) => {
        const hecho = i < current;
        const enCurso = i === current;
        return (
          <li key={paso} className="flex flex-1 flex-col items-center text-center" aria-current={enCurso ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <span className={cn('h-px flex-1', i === 0 ? 'bg-transparent' : hecho || enCurso ? 'bg-brand-700' : 'bg-line')} aria-hidden="true" />
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  hecho ? 'border-brand-700 bg-brand-700 text-white' : enCurso ? CURRENT[tone] : 'border-line bg-white text-ink-subtle'
                )}
              >
                {hecho ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('h-px flex-1', i === total - 1 ? 'bg-transparent' : hecho ? 'bg-brand-700' : 'bg-line')} aria-hidden="true" />
            </div>
            <span className={cn('mt-1.5 px-1 text-xs', enCurso ? 'font-medium text-ink' : hecho ? 'text-ink-soft' : 'text-ink-muted')}>
              {paso}
              {hecho && <span className="sr-only"> (hecho)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export default StepProgress;
