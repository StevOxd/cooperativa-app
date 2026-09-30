import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import api from '../../services/api';
import { toast } from '../../context/ToastContext';
import { Alert, Button, Field, Modal, PasswordInput, cn } from '../ui';
import { PasswordRequirement } from './PasswordRequirement';
import { checkPassword } from '../../utils/passwordPolicy';

const FORM_ID = 'cambio-obligatorio-password';

/**
 * Modal de cambio obligatorio de contraseña (SEC-09).
 * Bloquea la aplicación hasta que el usuario reemplace la contraseña temporal
 * de su primer acceso. No se puede cerrar: la única salida es cerrar sesión.
 */
const ForcedPasswordChangeModal = ({ isOpen, user, onSuccess, onLogout }) => {
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [showPassActual, setShowPassActual] = useState(false);
  const [showNuevaPass, setShowNuevaPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Criterios de validación en tiempo real (Contraseña Fuerte)
  const { hasMinLength, hasLetters, hasNumbers, hasSpecial } = checkPassword(nuevaPassword);
  const passwordsMatch = nuevaPassword.length > 0 && nuevaPassword === confirmarPassword;
  const isFormValid = hasMinLength && hasLetters && hasNumbers && hasSpecial && passwordsMatch && passwordActual.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!passwordActual) {
      setErrorMsg('Escriba la contraseña temporal que recibió por correo.');
      return;
    }

    if (!hasMinLength) {
      setErrorMsg('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (!hasLetters || !hasNumbers) {
      setErrorMsg('La nueva contraseña debe tener letras y números.');
      return;
    }

    if (!hasSpecial) {
      setErrorMsg('La nueva contraseña debe tener al menos un símbolo (!@#$…).');
      return;
    }

    if (passwordActual === nuevaPassword) {
      setErrorMsg('La nueva contraseña debe ser distinta de la temporal.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/cambiar-password', {
        password_actual: passwordActual.trim(),
        nueva_password: nuevaPassword.trim(),
        confirmar_password: confirmarPassword.trim(),
      });

      if (response.data?.success) {
        toast.success('Contraseña actualizada. Inicie sesión con su nueva contraseña.');
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(response.data?.message || 'No se pudo cambiar la contraseña. Intente de nuevo.');
      }
    } catch (err) {
      console.error('Error al cambiar contraseña obligatoria:', err);
      const backendMsg = err.response?.data?.message || 'No hay conexión con el servidor. Intente de nuevo.';
      setErrorMsg(backendMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen
      critical
      dismissible={false}
      size="sm"
      title="Cambie su contraseña"
      description={
        <>
          Hola, <span className="font-medium text-ink">{user?.nombre || user?.codigo_corporativo}</span>. Para activar su
          cuenta, reemplace la contraseña temporal que recibió por correo.
        </>
      }
      footer={
        <>
          <Button variant="ghost" icon={LogOut} onClick={onLogout}>
            Cerrar sesión
          </Button>
          <Button type="submit" form={FORM_ID} loading={loading} loadingText="Guardando…" disabled={!isFormValid}>
            Guardar y activar cuenta
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}

        <Field label="Contraseña temporal" hint="La recibió por correo al crear su cuenta.">
          <PasswordInput
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            visible={showPassActual}
            onVisibleChange={setShowPassActual}
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="space-y-2">
          <Field label="Nueva contraseña">
            <PasswordInput
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              visible={showNuevaPass}
              onVisibleChange={setShowNuevaPass}
              autoComplete="new-password"
              aria-describedby="requisitos-password"
              required
            />
          </Field>
          <ul id="requisitos-password" className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Requisitos de la contraseña">
            <PasswordRequirement met={hasMinLength}>Al menos 8 caracteres</PasswordRequirement>
            <PasswordRequirement met={hasLetters}>Letras</PasswordRequirement>
            <PasswordRequirement met={hasNumbers}>Números</PasswordRequirement>
            <PasswordRequirement met={hasSpecial}>Un símbolo (!@#$…)</PasswordRequirement>
          </ul>
        </div>

        <div className="space-y-1.5">
          <Field label="Confirme la nueva contraseña">
            <PasswordInput
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              visible={showConfirmPass}
              onVisibleChange={setShowConfirmPass}
              autoComplete="new-password"
              invalid={confirmarPassword.length > 0 && !passwordsMatch}
              required
            />
          </Field>
          {confirmarPassword && (
            <p role="status" className={cn('text-xs', passwordsMatch ? 'text-success-700' : 'text-danger-700')}>
              {passwordsMatch ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.'}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default ForcedPasswordChangeModal;
