import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, AlertTriangle, LogOut, Check } from 'lucide-react';

/**
 * Modal dialog component for critical banking security alerts.
 * Displays real-time warnings (e.g., concurrent login attempts) delivered via WebSockets.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object|null} props.alert - Security alert payload object containing message and timestamp.
 * @param {Function} props.onClose - Callback invoked when acknowledging the alert.
 * @param {Function} [props.onLogout] - Optional callback to immediately log out upon alert receipt.
 * @returns {JSX.Element|null} The rendered security alert modal or null.
 */
export const SecurityAlertModal = ({ alert, onClose, onLogout }) => {
  useEffect(() => {
    if (alert) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [alert]);

  if (!alert) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-danger-100 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-alert-title"
      >
        {/* Encabezado con gradiente de alerta bancaria */}
        <div className="bg-gradient-to-r from-danger-600 to-rose-700 p-6 text-white text-center relative">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldAlert className="w-9 h-9 text-white animate-pulse" />
          </div>
          <h3 id="security-alert-title" className="text-xl font-bold tracking-tight">Alerta de Seguridad</h3>
          <p className="text-danger-100 text-xs mt-1 uppercase tracking-widest font-semibold">
            Protocolo Bancario de Sesión Única
          </p>
        </div>

        {/* Contenido de la alerta */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-200 text-danger-900 text-sm leading-relaxed flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-danger-950">
                {alert.message || 'Se ha detectado un intento de inicio de sesión en tu cuenta desde otro dispositivo/navegador.'}
              </p>
              <p className="text-xs text-danger-700 mt-1.5">
                Por políticas de seguridad, el acceso simultáneo ha sido denegado en el otro dispositivo. Si no fuiste tú, te recomendamos cambiar tu contraseña de inmediato.
              </p>
            </div>
          </div>

          {alert.timestamp && (
            <div className="text-center text-xs text-slate-400 font-mono">
              Detectado: {new Date(alert.timestamp).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 mr-1.5 text-slate-500" />
              Entendido
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-danger-600 hover:bg-danger-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Cerrar Sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
