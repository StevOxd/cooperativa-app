import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * Indicador de carga para listas y tablas.
 *
 * @param {Object} props
 * @param {string} [props.label='Cargando…']
 */
export const LoadingState = ({ label = 'Cargando…', className }) => (
  <div role="status" className={cn('flex items-center justify-center gap-2 py-16 text-sm text-ink-muted', className)}>
    <Loader2 className="w-4 h-4 animate-spin text-brand-700" aria-hidden="true" />
    {label}
  </div>
);

export default LoadingState;
