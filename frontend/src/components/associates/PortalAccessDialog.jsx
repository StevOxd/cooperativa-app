import React, { useEffect, useState } from 'react';
import { KeyRound, MailX } from 'lucide-react';
import api from '../../services/api';
import { Alert, Button, Field, Input, Modal } from '../ui';
import { useEstadoCorreo } from '../../hooks/useCorreoDisponible';

const FORM_ID = 'acceso-portal';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Activa el acceso al portal de un asociado desde su expediente, o se lo reenvía si nunca entró
 * (issue #27). Permite corregir el correo. Si el correo de la cooperativa no funciona, no se puede
 * continuar: la contraseña temporal solo viaja por correo.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object} props.asociado - Datos del expediente (`id_asociado`, `nombre_completo`, `acceso_portal`, `codigo_corporativo`, `correo_sugerido`).
 * @param {Function} props.onClose
 * @param {Function} props.onSuccess - Recibe el mensaje del servidor.
 * @param {Function} [props.onCambioDeEstado] - Se llama si el servidor rechaza porque el acceso cambió (recargar el expediente).
 */
export const PortalAccessDialog = ({ isOpen, asociado, onClose, onSuccess, onCambioDeEstado }) => {
  const { disponible: correoDisponible, consultando, error: errorCorreo } = useEstadoCorreo(isOpen);
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail(asociado?.correo_sugerido || '');
      setError('');
    }
  }, [isOpen, asociado]);

  if (!isOpen || !asociado) return null;

  const reenvio = asociado.acceso_portal === 'PENDIENTE';
  const sinCorreo = correoDisponible === false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Revise el correo. Debe verse así: nombre@correo.com.');
      return;
    }
    setEnviando(true);
    try {
      const res = await api.post(`/admin/asociados/${asociado.id_asociado}/acceso-portal`, { email: email.trim() });
      onSuccess(res.data?.message || 'Acceso al portal enviado.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo activar el acceso. Intente de nuevo.');
      // El estado del acceso cambió en el servidor: que el expediente muestre el actual
      if (err.response?.status === 409 && onCambioDeEstado) onCambioDeEstado();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={enviando ? () => {} : onClose}
      closeOnOverlay={false}
      lockScroll={false}
      title={reenvio ? 'Reenviar acceso al portal' : 'Activar acceso al portal'}
      description={asociado.nombre_completo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button
            type="submit"
            form={FORM_ID}
            icon={KeyRound}
            loading={enviando}
            loadingText="Enviando…"
            disabled={sinCorreo || consultando}
          >
            {reenvio ? 'Reenviar acceso' : 'Activar acceso'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {sinCorreo && (
          <Alert tone="warning" icon={MailX} title="El correo de la cooperativa no está funcionando">
            No se puede activar el acceso ahora: la contraseña temporal solo se entrega por correo. Intente cuando el
            correo funcione.
          </Alert>
        )}
        {consultando && <p className="text-sm text-ink-muted">Comprobando el correo de la cooperativa…</p>}
        {errorCorreo && (
          <Alert tone="info">
            No pudimos comprobar si el correo de la cooperativa funciona. Puede intentarlo: si no funciona, no se activará
            nada.
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-sm text-ink-muted">
          {reenvio
            ? `El asociado tiene el usuario ${asociado.codigo_corporativo}, pero nunca entró al portal. Le enviaremos una contraseña temporal nueva; la anterior deja de servir.`
            : 'Crearemos su usuario del portal y le enviaremos al correo su código de usuario y una contraseña temporal.'}
        </p>

        <Field label="Correo del asociado" hint="Puede corregirlo. Si el correo no sale, no se activa nada." required>
          <Input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase().replace(/\s+/g, ''))}
            disabled={enviando}
            required
          />
        </Field>
      </form>
    </Modal>
  );
};

export default PortalAccessDialog;
