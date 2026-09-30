import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../ui';

/**
 * Encabezado de cada paso de la afiliación en línea.
 *
 * @param {Object} props
 * @param {number} [props.step] - Paso actual (se omite en pantallas sin secuencia).
 * @param {number} [props.total]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description]
 */
export const StepHeader = ({ step, total, title, description }) => (
  <div className="mb-6">
    {step && total && (
      <p className="text-sm text-ink-muted tabular-nums">
        Paso {step} de {total}
      </p>
    )}
    <h2 className="text-lg font-semibold text-ink">{title}</h2>
    {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
  </div>
);

/**
 * Resumen de la persona identificada por su DPI, con la opción de empezar de nuevo.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.nombre
 * @param {string} props.dpi
 * @param {React.ReactNode} [props.detalle] - Tipo de cliente u otro dato breve.
 * @param {Function} props.onChange - Vuelve a la consulta de DPI.
 * @param {boolean} [props.disabled=false]
 */
export const IdentityBar = ({ nombre, dpi, detalle, onChange, disabled = false }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-muted px-4 py-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-ink">{nombre}</p>
      <p className="text-xs text-ink-subtle">
        DPI <span className="font-mono">{dpi}</span>
        {detalle && <> · {detalle}</>}
      </p>
    </div>
    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={onChange} disabled={disabled}>
      Cambiar DPI
    </Button>
  </div>
);

/** Fila de botones al pie de cada paso: volver a la izquierda, continuar a la derecha. */
export const StepActions = ({ children }) => (
  <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
    {children}
  </div>
);

export default StepHeader;
