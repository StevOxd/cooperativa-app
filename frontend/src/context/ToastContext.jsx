import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Bell } from 'lucide-react';
import { cn } from '../components/ui/cn';
import { getSocket } from '../services/socket';

const ToastContext = createContext(null);

/** Ícono y colores de cada tipo de aviso. */
const TOAST_TONES = {
  success: { icon: CheckCircle2, color: 'text-success-700', progress: 'bg-success-600', defaultTitle: 'Listo' },
  error: { icon: AlertCircle, color: 'text-danger-700', progress: 'bg-danger-600', defaultTitle: 'No se pudo completar' },
  warning: { icon: AlertTriangle, color: 'text-warning-700', progress: 'bg-warning-500', defaultTitle: 'Atención' },
  info: { icon: Info, color: 'text-brand-700', progress: 'bg-brand-600', defaultTitle: 'Aviso' },
  default: { icon: Bell, color: 'text-ink-subtle', progress: 'bg-ink-subtle', defaultTitle: 'Notificación' },
};

// Gestor de eventos global para invocar toasts desde cualquier módulo sin necesidad de hook
export const toast = {
  success: (message, title = 'Listo', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'success', duration },
      })
    );
  },
  error: (message, title = 'No se pudo completar', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'error', duration },
      })
    );
  },
  warning: (message, title = 'Atención', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'warning', duration },
      })
    );
  },
  info: (message, title = 'Aviso', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'info', duration },
      })
    );
  },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ message, title, type = 'success', duration = 4000 }) => {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newToast = { id, message, title, type, duration };

      setToasts((prev) => [...prev, newToast]);

      // Desaparición automática tras 4 segundos exactos
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  // Escuchar eventos globales disparados con la utilidad toast.success/error
  useEffect(() => {
    const handleCustomToast = (event) => {
      if (event.detail) {
        addToast(event.detail);
      }
    };

    window.addEventListener('app_show_toast', handleCustomToast);
    return () => {
      window.removeEventListener('app_show_toast', handleCustomToast);
    };
  }, [addToast]);

  // Escuchar eventos de WebSockets en tiempo real si el socket está activo
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleSocketNotification = (data) => {
      if (data?.mensaje || data?.message) {
        addToast({
          title: data.titulo || 'Notificación en Tiempo Real',
          message: data.mensaje || data.message,
          type: data.tipo || 'info',
          duration: 4000,
        });
      }
    };

    socket.on('notificacion_sistema', handleSocketNotification);
    socket.on('alerta_seguridad', (data) => {
      addToast({
        title: 'Alerta de Seguridad',
        message: data?.mensaje || 'Evento de seguridad detectado.',
        type: 'warning',
        duration: 4000,
      });
    });

    return () => {
      socket.off('notificacion_sistema', handleSocketNotification);
      socket.off('alerta_seguridad');
    };
  }, [addToast]);

  const value = {
    toast,
    addToast,
    removeToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Avisos flotantes (arriba a la derecha; a todo el ancho en móvil) */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[99999] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end sm:px-0">
        {toasts.map((t) => {
          const config = TOAST_TONES[t.type] || TOAST_TONES.default;
          const IconComponent = config.icon;
          const title = t.title || config.defaultTitle;

          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-line bg-white shadow-lg animate-slide-in-right"
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <IconComponent className={cn('mt-0.5 w-5 h-5 shrink-0', config.color)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {title && <p className="text-sm font-semibold text-ink">{title}</p>}
                  <p className={cn('break-words text-sm text-ink-soft', title && 'mt-0.5')}>{t.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  aria-label="Cerrar aviso"
                  className="-mr-1 shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink-soft cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Tiempo restante antes de cerrarse solo */}
              <div className="h-0.5 w-full bg-surface-sunken" aria-hidden="true">
                <div
                  className={cn('h-full animate-toast-progress', config.progress)}
                  style={{ animationDuration: `${t.duration || 4000}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
};

export default ToastContext;
