import React from 'react';
import { cn } from './cn';

/**
 * Mensaje para listas o tablas sin registros.
 *
 * @param {Object} props
 * @param {React.ElementType} [props.icon] - Ícono de lucide-react.
 * @param {React.ReactNode} props.title - Qué falta, p. ej. "No hay solicitudes pendientes".
 * @param {React.ReactNode} [props.description] - Qué puede hacer el usuario.
 * @param {React.ReactNode} [props.action] - Botón opcional.
 */
export const EmptyState = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
    {Icon && <Icon className="mb-3 w-8 h-8 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />}
    <p className="text-sm font-medium text-ink">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;
