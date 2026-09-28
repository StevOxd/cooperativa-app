import React from 'react';
import { cn } from './cn';

/**
 * Encabezado de pantalla: un solo `h1` por página.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description] - Una frase corta sobre qué se hace aquí.
 * @param {React.ReactNode} [props.eyebrow] - Contexto sobre el título (p. ej. el área o la agencia).
 * @param {React.ReactNode} [props.actions] - Botones principales de la pantalla.
 */
export const PageHeader = ({ title, description, eyebrow, actions, className }) => (
  <header
    className={cn(
      'flex flex-col gap-4 pb-5 mb-6 border-b border-line sm:flex-row sm:items-end sm:justify-between',
      className
    )}
  >
    <div className="min-w-0">
      {eyebrow && <p className="text-sm text-ink-muted">{eyebrow}</p>}
      <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
  </header>
);

export default PageHeader;
