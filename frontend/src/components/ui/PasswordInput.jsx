import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './Input';

/**
 * Campo de contraseña con botón accesible para mostrar u ocultar el texto.
 *
 * La visibilidad puede manejarse por dentro o desde afuera con
 * `visible` + `onVisibleChange` (útil cuando el formulario ya guarda ese estado).
 */
export const PasswordInput = forwardRef(function PasswordInput(
  { visible, onVisibleChange, ...props },
  ref
) {
  const [internalVisible, setInternalVisible] = useState(false);
  const isControlled = visible !== undefined;
  const shown = isControlled ? visible : internalVisible;
  const toggle = () => (isControlled ? onVisibleChange?.(!shown) : setInternalVisible(!shown));

  return (
    <Input
      ref={ref}
      type={shown ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={toggle}
          aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={shown}
          className="rounded-md p-2 text-ink-subtle hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
        >
          {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      }
      {...props}
    />
  );
});

export default PasswordInput;
