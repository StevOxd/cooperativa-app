import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, X, Loader2, Info } from 'lucide-react';

/**
 * Modal corporativo de confirmación de alta calidad visual.
 * Reemplaza los diálogos nativos del navegador (window.confirm)
 * con un diseño institucional estilizado con Tailwind CSS.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Controla la visibilidad del modal
 * @param {Function} props.onClose - Función invocada al cancelar o cerrar
 * @param {Function} props.onConfirm - Función invocada al confirmar la acción
 * @param {string} props.title - Título principal del diálogo
 * @param {string} [props.subtitle] - Subtítulo o folio de referencia
 * @param {string|React.ReactNode} [props.message] - Mensaje explicativo
 * @param {Array<{label: string, value: string|number, highlight?: boolean}>} [props.details] - Lista de atributos clave del objeto
 * @param {string} [props.confirmText='Confirmar'] - Texto del botón de confirmación
 * @param {string} [props.cancelText='Cancelar'] - Texto del botón de cancelación
 * @param {'danger'|'warning'|'primary'} [props.variant='danger'] - Esquema de color semántico
 * @param {boolean} [props.loading=false] - Estado de carga mientras se procesa la confirmación
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  message,
  details = [],
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  loading = false,
}) => {
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !loading) {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const iconBg = isDanger
    ? 'bg-rose-50 border-rose-200 text-rose-600'
    : isWarning
    ? 'bg-amber-50 border-amber-200 text-amber-600'
    : 'bg-emerald-50 border-emerald-200 text-emerald-600';

  const confirmBtnBg = isDanger
    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-rose-200'
    : isWarning
    ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-amber-200'
    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-200';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Barra superior con gradiente de acento */}
        <div
          className={`h-1.5 w-full ${
            isDanger
              ? 'bg-gradient-to-r from-rose-500 to-red-600'
              : isWarning
              ? 'bg-gradient-to-r from-amber-400 to-orange-500'
              : 'bg-gradient-to-r from-emerald-500 to-teal-600'
          }`}
        />

        <div className="p-6">
          {/* Encabezado e Ícono */}
          <div className="flex items-start space-x-3.5 mb-4">
            <div
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-xs ${iconBg}`}
            >
              {isDanger || isWarning ? (
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              ) : (
                <Info className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1 pr-6 relative">
              <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs font-mono font-bold text-slate-500 mt-0.5">
                  {subtitle}
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="absolute -top-1 right-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-30"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mensaje descriptivo */}
          {message && (
            <div className="text-xs text-slate-600 leading-relaxed mb-4">
              {typeof message === 'string' ? (
                <p>{message}</p>
              ) : (
                message
              )}
            </div>
          )}

          {/* Tarjeta de Detalles del Objeto */}
          {details.length > 0 && (
            <div className="mb-4 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
              {details.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 border-b border-slate-100 last:border-b-0"
                >
                  <span className="text-slate-500 font-medium">{item.label}:</span>
                  <span
                    className={`font-mono font-bold ${
                      item.highlight ? 'text-emerald-700' : 'text-slate-800'
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Advertencia / Nota explicativa */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start space-x-2 text-amber-900 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              Esta acción no se puede deshacer. Podrá iniciar una nueva simulación con las condiciones de su preferencia cuando lo requiera.
            </p>
          </div>

          {/* Botones de Acción */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${confirmBtnBg}`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  <span>{confirmText}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
