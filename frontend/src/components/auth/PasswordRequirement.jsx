import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cn } from '../ui';

/**
 * Un requisito de la contraseña en una lista de comprobación: se marca en
 * verde cuando se cumple y lo anuncia a lectores de pantalla.
 */
export const PasswordRequirement = ({ met, children }) => (
  <li className={cn('flex items-center gap-1.5', met ? 'text-success-700' : 'text-ink-muted')}>
    {met ? <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Circle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
    <span>{children}</span>
    <span className="sr-only">{met ? '(cumplido)' : '(pendiente)'}</span>
  </li>
);

export default PasswordRequirement;
