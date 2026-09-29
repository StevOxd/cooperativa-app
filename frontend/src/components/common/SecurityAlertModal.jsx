import React from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { Button, Modal } from '../ui';

/**
 * Alerta de seguridad crítica: intento de inicio de sesión simultáneo,
 * recibido por WebSocket. No se cierra con Escape ni con clic fuera: el
 * usuario debe confirmarla o cerrar sesión.
 *
 * @param {Object} props
 * @param {Object|null} props.alert - Datos de la alerta (`message`, `timestamp`).
 * @param {Function} props.onClose - Se llama al pulsar "Entendido".
 * @param {Function} [props.onLogout] - Si existe, muestra el botón para cerrar sesión.
 */
export const SecurityAlertModal = ({ alert, onClose, onLogout }) => (
  <Modal
    isOpen={Boolean(alert)}
    onClose={onClose}
    critical
    dismissible={false}
    size="sm"
    title="Alguien intentó entrar a su cuenta"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Entendido
        </Button>
        {onLogout && (
          <Button variant="danger" icon={LogOut} onClick={onLogout}>
            Cerrar sesión
          </Button>
        )}
      </>
    }
  >
    {alert && (
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-700" aria-hidden="true">
          <ShieldAlert className="w-5 h-5" />
        </span>
        <div className="space-y-2 text-sm">
          <p className="font-medium text-ink">
            {alert.message || 'Se detectó un intento de inicio de sesión en su cuenta desde otro dispositivo.'}
          </p>
          <p className="text-ink-muted">
            Por seguridad, bloqueamos el acceso en ese dispositivo. Si no fue usted, cambie su contraseña cuanto antes.
          </p>
          {alert.timestamp && (
            <p className="text-xs text-ink-subtle tabular-nums">
              Detectado a las{' '}
              {new Date(alert.timestamp).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </div>
    )}
  </Modal>
);
