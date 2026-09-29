import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from './Input';

/**
 * Campo de búsqueda con botón para limpiar.
 *
 * @param {Object} props
 * @param {string} props.value
 * @param {Function} props.onChange - Recibe el texto, no el evento.
 * @param {Function} [props.onClear] - Por defecto llama a `onChange('')`.
 * @param {string} props.label - Nombre accesible (el placeholder no lo reemplaza).
 */
export const SearchInput = ({ value, onChange, onClear, label, className, ...props }) => (
  <div className={className}>
    <Input
      type="search"
      icon={Search}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="[&::-webkit-search-cancel-button]:hidden"
      trailing={
        value ? (
          <button
            type="button"
            onClick={() => (onClear ? onClear() : onChange(''))}
            aria-label="Limpiar búsqueda"
            className="rounded-md p-1.5 text-ink-subtle hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null
      }
      {...props}
    />
  </div>
);

export default SearchInput;
