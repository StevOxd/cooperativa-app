import React, { forwardRef } from 'react';
import { cn } from './cn';

/** Estilo compartido por Input, Textarea y Select. */
export const controlClasses = (invalid) =>
  cn(
    'block w-full rounded-md border bg-white text-sm text-ink placeholder:text-ink-subtle transition-colors',
    'focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle',
    invalid
      ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20'
      : 'border-line-input focus:border-brand-600 focus:ring-brand-600/20'
  );

/**
 * Campo de texto. Acepta todas las props nativas de `<input>`.
 *
 * @param {Object} props
 * @param {boolean} [props.invalid=false] - Marca el campo con error (también define `aria-invalid`).
 * @param {string} [props.prefix] - Texto fijo a la izquierda, p. ej. `"Q"` en montos.
 * @param {React.ElementType} [props.icon] - Ícono de lucide-react a la izquierda (p. ej. búsqueda).
 */
export const Input = forwardRef(function Input(
  { invalid = false, prefix, icon: Icon, className, ...props },
  ref
) {
  const hasAdornment = Boolean(prefix || Icon);

  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses(invalid), 'h-10 px-3 read-only:bg-surface-muted', hasAdornment && 'pl-8', className)}
      {...props}
    />
  );

  if (!hasAdornment) return input;

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-ink-subtle"
        aria-hidden="true"
      >
        {Icon ? <Icon className="w-4 h-4" /> : prefix}
      </span>
      {input}
    </div>
  );
});

/** Área de texto con el mismo estilo que `Input`. */
export const Textarea = forwardRef(function Textarea(
  { invalid = false, className, rows = 3, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses(invalid), 'px-3 py-2 read-only:bg-surface-muted', className)}
      {...props}
    />
  );
});

export default Input;
