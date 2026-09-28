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
      'w-full overflow-x-auto',
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

/**
 * @param {Object} props
 * @param {boolean} [props.interactive=false] - Resalta la fila al pasar el cursor.
 */
export const TR = ({ interactive = false, className, children, ...props }) => (
  <tr className={cn(interactive && 'hover:bg-surface-muted transition-colors', className)} {...props}>
    {children}
  </tr>
);

/**
 * Celda de encabezado.
 *
 * @param {Object} props
 * @param {boolean} [props.numeric=false] - Alinea a la derecha (montos, cantidades).
 */
export const TH = ({ numeric = false, className, children, ...props }) => (
  <th
    scope="col"
    className={cn(
      'px-4 py-2.5 text-xs font-medium text-ink-muted whitespace-nowrap',
      numeric && 'text-right',
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
 */
export const TD = ({ numeric = false, className, children, ...props }) => (
  <td
    className={cn(
      'px-4 py-3 text-ink-soft align-middle',
      numeric && 'text-right tabular-nums whitespace-nowrap',
      className
    )}
    {...props}
  >
    {children}
  </td>
);

export default Table;
