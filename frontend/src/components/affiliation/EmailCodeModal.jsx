import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, Input, Modal } from '../ui';

/**
 * Ventana para escribir el código de 6 dígitos que se envió al correo (issue #25).
 * El código se valida en el servidor al confirmar la afiliación o la solicitud.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {string} props.email - Correo al que se envió el código.
 * @param {Function} props.onConfirm - Recibe el código; envía el formulario.
 * @param {Function} props.onResend - Pide un código nuevo; devuelve los segundos de espera para el siguiente reenvío.
 * @param {Function} props.onClose
 * @param {boolean} props.loading - El formulario se está enviando.
 * @param {string} [props.error] - Error del código devuelto por el servidor.
 * @param {string} props.confirmLabel - Texto del botón principal.
 * @param {number} [props.initialWait=60] - Segundos antes de poder reenviar.
 */
export const EmailCodeModal = ({ isOpen, email, onConfirm, onResend, onClose, loading, error, confirmLabel, initialWait = 60 }) => {
  const [codigo, setCodigo] = useState('');
  const [espera, setEspera] = useState(initialWait);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const inputRef = useRef(null);

  // Al abrir: código vacío y cuenta regresiva para el reenvío.
  useEffect(() => {
    if (isOpen) {
      setCodigo('');
      setAviso('');
      setEspera(initialWait);
    }
  }, [isOpen, initialWait]);

  useEffect(() => {
    if (!isOpen || espera <= 0) return undefined;
    const timer = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [isOpen, espera]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (codigo.length === 6) onConfirm(codigo);
  };

  const handleResend = async () => {
    setReenviando(true);
    setAviso('');
    try {
      const siguienteEspera = await onResend();
      setCodigo('');
      setEspera(siguienteEspera || initialWait);
      setAviso('Le enviamos un código nuevo. El anterior ya no sirve.');
    } catch (err) {
      setAviso(err.message || 'No se pudo reenviar el código.');
      if (err.reenviarEn) setEspera(err.reenviarEn);
    } finally {
      setReenviando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Confirme su correo"
      description={
        <>
          Le enviamos un código de 6 dígitos a <span className="font-medium text-ink">{email}</span>. Vence en 10
          minutos; revise también la carpeta de spam.
        </>
      }
      size="sm"
      closeOnOverlay={false}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" form="form-codigo-correo" loading={loading} disabled={codigo.length !== 6}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="form-codigo-correo" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {aviso && !error && <Alert tone="info">{aviso}</Alert>}

        <Field label="Código de verificación" hint="Solo números, 6 dígitos." required>
          <Input
            ref={inputRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="font-mono tracking-[0.5em] text-center text-lg"
            required
          />
        </Field>

        <p className="text-sm text-ink-muted">
          ¿No le llegó?{' '}
          {espera > 0 ? (
            <span>Puede pedir otro en {espera} s.</span>
          ) : (
            <Button variant="link" onClick={handleResend} loading={reenviando} disabled={loading}>
              Reenviar código
            </Button>
          )}
        </p>
      </form>
    </Modal>
  );
};

export default EmailCodeModal;
