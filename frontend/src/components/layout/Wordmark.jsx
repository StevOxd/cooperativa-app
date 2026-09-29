import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../ui';

/**
 * Marca de la cooperativa: símbolo (el mismo del favicon) y nombre.
 *
 * @param {Object} props
 * @param {boolean} [props.inverse=false] - Versión clara para fondos azules.
 * @param {'sm'|'md'} [props.size='md']
 */
export const Wordmark = ({ inverse = false, size = 'md', className }) => (
  <span className={cn('flex items-center gap-2.5', className)}>
    <span
      className={cn(
        'flex items-center justify-center rounded-md text-white',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        inverse ? 'bg-white/10' : 'bg-brand-700'
      )}
    >
      <Layers className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} aria-hidden="true" />
    </span>
    <span
      className={cn(
        'font-semibold',
        size === 'sm' ? 'text-base' : 'text-lg',
        inverse ? 'text-white' : 'text-ink'
      )}
    >
      Cooperativa
    </span>
  </span>
);

export default Wordmark;
