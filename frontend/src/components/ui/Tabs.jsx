import React, { useId, useRef } from 'react';
import { cn } from './cn';

/**
 * Pestañas accesibles (patrón WAI-ARIA): flechas izquierda/derecha, Inicio y
 * Fin mueven el foco y activan la pestaña.
 *
 * El contenido va en `TabPanel` con el mismo `id` de la pestaña.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, count?: number, attention?: boolean}>} props.items
 *   `attention` resalta el contador (p. ej. hay pendientes).
 * @param {string} props.value - Id de la pestaña activa.
 * @param {Function} props.onChange - Recibe el id elegido.
 * @param {string} props.label - Nombre del grupo para lectores de pantalla.
 * @param {'md'|'sm'} [props.size='md']
 */
export const Tabs = ({ items, value, onChange, label, size = 'md', idPrefix, className }) => {
  const autoId = useId();
  const prefix = idPrefix || autoId;
  const refs = useRef([]);

  const handleKeyDown = (event, index) => {
    const last = items.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      // La línea base es una sombra interior (no ocupa espacio): así la pestaña activa la cubre
      // sin márgenes negativos que provoquen desplazamiento. En pantallas estrechas se desliza
      // en horizontal sin mostrar barra.
      className={cn(
        'flex gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.line.DEFAULT)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => (refs.current[index] = el)}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 whitespace-nowrap transition-colors cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 rounded-t-sm',
              size === 'sm' ? 'pb-2 text-sm' : 'pb-3 text-sm',
              selected
                ? 'border-brand-700 font-medium text-ink'
                : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'min-w-[1.25rem] rounded px-1.5 py-px text-center text-xs font-medium tabular-nums',
                  item.attention ? 'bg-warning-100 text-warning-800' : 'bg-surface-sunken text-ink-muted'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Contenido de una pestaña. Usar el mismo `idPrefix` que en `Tabs`.
 */
export const TabPanel = ({ id, idPrefix, className, children }) => (
  <div
    role="tabpanel"
    id={`${idPrefix}-panel-${id}`}
    aria-labelledby={`${idPrefix}-tab-${id}`}
    tabIndex={0}
    className={cn('focus-visible:outline-none', className)}
  >
    {children}
  </div>
);

export default Tabs;
