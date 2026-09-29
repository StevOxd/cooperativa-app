import React from 'react';
import { cn } from './cn';

/**
 * Tabla con desplazamiento horizontal propio: nunca desborda la página.
 *
 * @param {Object} props
 * @param {string} [props.caption] - Descripción para lectores de pantalla.
 * @param {boolean} [props.bordered=true] - Borde y esquinas propias; `false` dentro de una `Card`.
 */
export const Table = ({ caption, bordered = true, className, children, ...props }) => (
  <div
    className={cn(
      'relative w-full overflow-x-auto',
      bordered && 'border border-line rounded-lg bg-white',
      'print:overflow-visible',
      className
    )}
  >
    <table className="w-full text-left text-sm" {...props}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  </div>
);

export const THead = ({ className, children, ...props }) => (
  <thead className={cn('bg-surface-muted border-b border-line', className)} {...props}>
    {children}
  </thead>
);

export const TBody = ({ className, children, ...props }) => (
  <tbody className={cn('divide-y divide-line', className)} {...props}>
    {children}
  </tbody>
);

const ROW_TONES = {
  none: { base: 'bg-white', hover: 'hover:bg-surface-muted' },
  brand: { base: 'bg-brand-50', hover: 'hover:bg-brand-100' },
  warning: { base: 'bg-warning-50', hover: 'hover:bg-warning-100' },
};

/**
 * Fila. El fondo siempre es opaco para que las celdas `sticky` lo hereden y no
 * dejen ver el contenido que se desplaza por debajo.
 *
 * @param {Object} props
 * @param {boolean} [props.interactive=false] - Resalta la fila al pasar el cursor.
 * @param {'none'|'brand'|'warning'} [props.highlight='none'] - Tinte de la fila (p. ej. caso en atención).
 */
export const TR = ({ interactive = false, highlight = 'none', className, children, ...props }) => {
  const tone = ROW_TONES[highlight] || ROW_TONES.none;
  return (
    <tr className={cn(tone.base, interactive && `${tone.hover} transition-colors`, className)} {...props}>
      {children}
    </tr>
  );
};

/**
 * Celda de encabezado.
 *
 * @param {Object} props
 * @param {boolean} [props.numeric=false] - Alinea a la derecha (montos, cantidades).
 * @param {boolean} [props.sticky=false] - Fija la columna al borde derecho (acciones).
 */
export const TH = ({ numeric = false, sticky = false, className, children, ...props }) => (
  <th
    scope="col"
    className={cn(
      'px-4 py-2.5 text-xs font-medium text-ink-muted whitespace-nowrap',
      numeric && 'text-right',
      sticky && 'sticky right-0 z-[1] bg-surface-muted border-l border-line',
      className
    )}
    {...props}
  >
    {children}
  </th>
);

/**
 * Celda de datos.
 *
 * @param {Object} props
 * @param {boolean} [props.numeric=false] - Alinea a la derecha, cifras tabulares y sin salto de línea.
 * @param {boolean} [props.sticky=false] - Fija la columna al borde derecho (acciones).
 */
export const TD = ({ numeric = false, sticky = false, className, children, ...props }) => (
  <td
    className={cn(
      'px-4 py-3 text-ink-soft align-middle',
      numeric && 'text-right tabular-nums whitespace-nowrap',
      sticky && 'sticky right-0 z-[1] bg-inherit border-l border-line',
      className
    )}
    {...props}
  >
    {children}
  </td>
);

export default Table;
