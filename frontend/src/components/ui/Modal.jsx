import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pila de modales abiertos: solo el de arriba responde a Escape y Tab.
const stack = [];

/**
 * Diálogo modal accesible: bloquea el scroll, atrapa el foco, lo devuelve al
 * cerrar y se cierra con Escape o clic en el fondo cuando `dismissible` es true.
 *
 * Para flujos que no se pueden omitir (cambio forzoso de contraseña, 2FA,
 * alerta de sesión) usar `dismissible={false}`: sin botón de cerrar, sin
 * Escape y sin cierre por clic fuera.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.footer] - Acciones; se alinean a la derecha.
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md']
 * @param {boolean} [props.dismissible=true]
 * @param {React.RefObject} [props.initialFocusRef] - Elemento que recibe el foco al abrir.
 * @param {boolean} [props.closeOnOverlay=true] - En `false`, un clic fuera no cierra (formularios con trabajo sin guardar).
 * @param {boolean} [props.printable=false] - Al imprimir, oculta el resto de la aplicación y deja solo este modal.
 * @param {boolean} [props.lockScroll=true] - En `false`, no bloquea el scroll (para modales que ya lo hacen por su cuenta).
 * @param {boolean} [props.critical=false] - Capa superior a cualquier otro modal (alertas de seguridad).
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  dismissible = true,
  initialFocusRef,
  critical = false,
  lockScroll = true,
  closeOnOverlay = true,
  printable = false,
  className,
  children,
}) => {
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!isOpen) return undefined;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    stack.push(panel);

    const target =
      initialFocusRef?.current ||
      bodyRef.current?.querySelector(FOCUSABLE) ||
      panel.querySelector(FOCUSABLE) ||
      panel;
    target.focus();

    const handleKeyDown = (e) => {
      if (stack[stack.length - 1] !== panel) return;
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      stack.splice(stack.indexOf(panel), 1);
      if (lockScroll && !stack.length) document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, initialFocusRef, lockScroll]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex',
        critical ? 'z-[9999]' : 'z-[1000]',
        'items-start justify-center overflow-y-auto bg-surface-inverse/60 p-4 sm:items-center print:static print:block print:bg-white print:p-0'
      )}
      data-print-dialog={printable || undefined}
      onMouseDown={(e) => {
        if (dismissible && closeOnOverlay && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative my-8 flex w-full flex-col bg-white border border-line rounded-lg shadow-lg focus:outline-none sm:my-0 sm:max-h-[90vh]',
          'print:my-0 print:max-h-none print:max-w-none print:border-0 print:shadow-none',
          SIZES[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line print:hidden">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">{description}</p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1.5 -mt-1 rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 print:overflow-visible print:p-0">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 px-5 py-3 border-t border-line bg-surface-muted rounded-b-lg sm:flex-row sm:justify-end print:hidden">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
