import React from 'react';
import { cn } from './cn';

/**
 * Contenedor base: fondo blanco, borde fino y sin sombra.
 * Se compone con `CardHeader`, `CardBody` y `CardFooter`.
 *
 * @param {Object} props
 * @param {React.ElementType} [props.as='section']
 */
export const Card = ({ as: Component = 'section', className, children, ...props }) => (
  <Component
    className={cn('bg-white border border-line rounded-lg print:border-line-strong', className)}
    {...props}
  >
    {children}
  </Component>
);

/**
 * Encabezado de tarjeta con título, descripción opcional y acciones a la derecha.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.actions]
 * @param {'h2'|'h3'|'h4'} [props.as='h2'] - Nivel del título, según la jerarquía de la página.
 */
export const CardHeader = ({ title, description, actions, as: Heading = 'h2', className, children }) => (
  <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-line', className)}>
    <div className="min-w-0">
      {title && <Heading className="text-base font-semibold text-ink">{title}</Heading>}
      {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export const CardBody = ({ className, children, ...props }) => (
  <div className={cn('px-5 py-4', className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ className, children, ...props }) => (
  <div
    className={cn('flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-muted rounded-b-lg', className)}
    {...props}
  >
    {children}
  </div>
);

export default Card;
