import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { controlClasses } from './Input';

/**
 * Lista desplegable nativa con el estilo de `Input`. Las opciones se pasan
 * como `<option>` hijos, igual que en un `<select>` normal.
 *
 * @param {Object} props
 * @param {boolean} [props.invalid=false]
 */
export const Select = forwardRef(function Select(
  { invalid = false, className, children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClasses(invalid), 'h-10 appearance-none pl-3 pr-9 cursor-pointer', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle"
        aria-hidden="true"
      />
    </div>
  );
});

export default Select;
