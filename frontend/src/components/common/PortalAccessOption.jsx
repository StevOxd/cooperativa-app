import React from 'react';
import { MailX } from 'lucide-react';
import { Alert, cn } from '../ui';

/**
 * Casilla «Crear acceso al portal» de los formularios de afiliación en ventanilla (issue #26), con
 * el aviso cuando el correo de la cooperativa no funciona. Sin correo la casilla queda desmarcada y
 * bloqueada: la contraseña temporal solo viaja por correo.
 *
 * @component
 * @param {Object} props
 * @param {boolean|null} props.correoDisponible - Estado del correo (`null` mientras se consulta).
 * @param {boolean} props.checked
 * @param {Function} props.onChange - Recibe el nuevo valor (boolean).
 * @param {boolean} [props.disabled]
 */
export const PortalAccessOption = ({ correoDisponible, checked, onChange, disabled = false }) => {
  const sinCorreo = correoDisponible === false;
  const bloqueada = disabled || sinCorreo;

  return (
    <div className="space-y-3">
      {sinCorreo && (
        <Alert tone="warning" icon={MailX} title="El correo de la cooperativa no está funcionando">
          Puede afiliar sin acceso al portal. El asociado queda registrado con sus cuentas, y el acceso se activa
          después desde su expediente, cuando el correo funcione.
        </Alert>
      )}

      <label
        className={cn(
          'flex items-start gap-3 rounded-md border border-line px-4 py-3 text-sm',
          bloqueada ? 'bg-surface-muted text-ink-muted' : 'cursor-pointer text-ink'
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-700"
          checked={checked && !sinCorreo}
          disabled={bloqueada}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="font-medium">Crear acceso al portal</span>
          <span className="mt-0.5 block text-ink-muted">
            {sinCorreo
              ? 'No disponible: sin correo, el asociado no recibiría su contraseña temporal.'
              : checked
                ? 'Le enviaremos al correo su código de usuario y una contraseña temporal.'
                : 'Queda afiliado sin usuario del portal. El correo es opcional; el acceso se activa después desde su expediente.'}
          </span>
        </span>
      </label>
    </div>
  );
};

export default PortalAccessOption;
