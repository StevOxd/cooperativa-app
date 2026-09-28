import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
  secondary: 'bg-white text-ink-soft border border-line-strong hover:bg-surface-muted active:bg-surface-sunken',
  ghost: 'text-ink-soft hover:bg-surface-sunken active:bg-line',
  danger: 'bg-danger-700 text-white hover:bg-danger-800 active:bg-danger-900',
  link: 'text-brand-700 underline-offset-4 hover:underline hover:text-brand-800',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
};

/**
 * Botón institucional. Por defecto es `type="button"`: en formularios hay que
 * pasar `type="submit"` de forma explícita.
 *
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'link'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'|'icon'} [props.size='md']
 * @param {React.ElementType} [props.icon] - Ícono de lucide-react a la izquierda del texto.
 * @param {boolean} [props.loading=false] - Muestra un indicador y bloquea el botón.
 * @param {string} [props.loadingText] - Texto opcional mientras carga.
 * @param {boolean} [props.fullWidth=false]
 * @param {React.ElementType} [props.as='button'] - Permite renderizar un `Link` o `a` con el mismo estilo.
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon: Icon,
    loading = false,
    loadingText,
    fullWidth = false,
    as: Component = 'button',
    type,
    disabled,
    className,
    children,
    ...props
  },
  ref
) {
  const isButton = Component === 'button';
  const isDisabled = disabled || loading;

  return (
    <Component
      ref={ref}
      type={isButton ? type || 'button' : type}
      disabled={isButton ? isDisabled : undefined}
      aria-disabled={!isButton && isDisabled ? true : undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        VARIANTS[variant],
        variant === 'link' ? 'text-sm gap-1.5' : SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      {loading && loadingText ? loadingText : children}
    </Component>
  );
});

export default Button;
