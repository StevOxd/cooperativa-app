import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Bell } from 'lucide-react';
import { getSocket } from '../services/socket';

const ToastContext = createContext(null);

// Gestor de eventos global para invocar toasts desde cualquier módulo sin necesidad de hook
export const toast = {
  success: (message, title = 'Operación Exitosa', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'success', duration },
      })
    );
  },
  error: (message, title = 'Error en la Solicitud', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'error', duration },
      })
    );
  },
  warning: (message, title = 'Advertencia del Sistema', duration = 4000) => {
    window.dispatchEvent(
      new CustomEvent('app_show_toast', {
        detail: { message, title, type: 'warning', duration },
      })
    );
  },
  info: (message, title = 'Aviso Institucional', duration = 4000) => {
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

      {/* Contenedor Flotante de Toasts Tipo Socket (Superior Derecho) */}
      <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 pointer-events-none max-w-sm w-full sm:w-96 px-3 sm:px-0">
        {toasts.map((t) => {
          const config = {
            success: {
              icon: CheckCircle2,
              color: 'text-brand-600',
              bg: 'bg-brand-50',
              border: 'border-brand-200',
              badge: 'bg-brand-100 text-brand-800',
              progress: 'bg-brand-500',
              defaultTitle: 'Operación Exitosa',
            },
            error: {
              icon: AlertCircle,
              color: 'text-rose-600',
              bg: 'bg-rose-50',
              border: 'border-rose-200',
              badge: 'bg-rose-100 text-rose-800',
              progress: 'bg-rose-500',
              defaultTitle: 'Error del Sistema',
            },
            warning: {
              icon: AlertTriangle,
              color: 'text-warning-600',
              bg: 'bg-warning-50',
              border: 'border-warning-200',
              badge: 'bg-warning-100 text-warning-800',
              progress: 'bg-warning-500',
              defaultTitle: 'Aviso Importante',
            },
            info: {
              icon: Info,
              color: 'text-blue-600',
              bg: 'bg-blue-50',
              border: 'border-blue-200',
              badge: 'bg-blue-100 text-blue-800',
              progress: 'bg-blue-500',
              defaultTitle: 'Información',
            },
          }[t.type] || {
            icon: Bell,
            color: 'text-slate-600',
            bg: 'bg-slate-50',
            border: 'border-slate-200',
            badge: 'bg-slate-100 text-slate-800',
            progress: 'bg-slate-500',
            defaultTitle: 'Notificación',
          };

          const IconComponent = config.icon;

          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden animate-slide-in-right transition-all duration-300 transform hover:scale-[1.02]"
              role="alert"
            >
              <div className="p-4 flex items-start space-x-3">
                <div
                  className={`w-9 h-9 rounded-xl ${config.bg} ${config.color} flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5`}
                >
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${config.badge}`}
                    >
                      {t.title || config.defaultTitle}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">4s</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 mt-1.5 leading-relaxed break-words">
                    {t.message}
                  </p>
                </div>
                <button
                  onClick={() => removeToast(t.id)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer flex-shrink-0"
                  title="Cerrar notificación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Barra de progreso de 4 segundos */}
              <div className="w-full bg-slate-100 h-1 overflow-hidden">
                <div
                  className={`h-full ${config.progress} animate-toast-progress`}
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
