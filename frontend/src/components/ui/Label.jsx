import React, { Children, cloneElement, isValidElement, useId } from 'react';
import { cn } from './cn';

/**
 * Etiqueta de formulario.
 *
 * @param {Object} props
 * @param {boolean} [props.required=false] - Muestra el asterisco y lo anuncia a lectores de pantalla.
 */
export const Label = ({ required = false, className, children, ...props }) => (
  <label className={cn('block text-sm font-medium text-ink-soft', className)} {...props}>
    {children}
    {required && (
      <>
        <span className="ml-0.5 text-danger-700" aria-hidden="true">*</span>
        <span className="sr-only"> (obligatorio)</span>
      </>
    )}
  </label>
);

/**
 * Agrupa etiqueta, control, ayuda y error, y los enlaza entre sí
 * (`htmlFor`, `aria-describedby`, `invalid`) sin tener que escribir los ids a mano.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.hint] - Texto de ayuda bajo el campo.
 * @param {string} [props.error] - Mensaje de error; si existe, el campo se marca inválido.
 * @param {boolean} [props.required=false] - Solo marca la etiqueta; la validación sigue en el control.
 * @param {string} [props.id] - Id del control; si no se pasa, se genera uno.
 * @param {React.ReactElement} props.children - Un único `Input`, `Select` o `Textarea`.
 */
export const Field = ({ label, hint, error, required = false, id, className, children }) => {
  const autoId = useId();
  const controlId = id || children?.props?.id || autoId;
  const hintId = hint ? `${controlId}-ayuda` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId, children?.props?.['aria-describedby']].filter(Boolean).join(' ') || undefined;

  const control = Children.only(children);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={controlId} required={required}>{label}</Label>
      {isValidElement(control) &&
        cloneElement(control, {
          id: controlId,
          invalid: control.props.invalid ?? Boolean(error),
          'aria-describedby': describedBy,
        })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger-700" role="alert">{error}</p>
      )}
    </div>
  );
};

export default Label;
