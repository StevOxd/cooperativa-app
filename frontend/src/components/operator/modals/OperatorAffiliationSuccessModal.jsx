import React from 'react';
import { FileDown, Landmark } from 'lucide-react';
import { generateAccountOpeningReceiptPdf } from '../../../utils/accountOpeningReceiptPdf';
import { Alert, Button, Modal } from '../../ui';
import { formatQ } from '../../../utils/format';

/**
 * Resumen de una afiliación formalizada, con descarga del comprobante (ARQ-04).
 * Por seguridad, nunca muestra la contraseña temporal: solo indica si se envió por correo.
 */
const OperatorAffiliationSuccessModal = ({ formalizadoResult, onClose, onAbrirCuenta }) => {
  if (!formalizadoResult) return null;

  const handleDownloadPdf = () => {
    try {
      generateAccountOpeningReceiptPdf({ data: formalizadoResult });
    } catch (err) {
      console.error('Error al generar comprobante de apertura:', err);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      lockScroll={false}
      size="lg"
      title="Afiliación formalizada"
      description="El depósito inicial quedó en su cuenta de ahorro del banco."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={onClose}>Volver a la bandeja</Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" icon={FileDown} onClick={handleDownloadPdf}>
              Descargar comprobante
            </Button>
            {onAbrirCuenta && (
              <Button icon={Landmark} onClick={() => onAbrirCuenta(formalizadoResult)}>
                Abrir cuenta en la cooperativa
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-line rounded-md border border-line text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Asociado</dt>
            <dd className="text-right font-medium text-ink">{formalizadoResult.nombre_completo}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Usuario</dt>
            <dd className="font-mono text-ink">{formalizadoResult.usuario}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Cuenta de ahorro en el banco</dt>
            <dd className="font-mono text-ink">{formalizadoResult.numero_cuenta}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Depósito inicial</dt>
            <dd className="font-medium text-ink tabular-nums">{formatQ(formalizadoResult.saldo_inicial)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Acceso al portal</dt>
            <dd className="text-right text-ink">
              {!formalizadoResult.acceso_portal
                ? 'Sin acceso'
                : formalizadoResult.acceso_existente
                  ? 'Conserva su acceso'
                  : formalizadoResult.correo_enviado
                    ? 'Contraseña enviada por correo'
                    : 'No se pudo enviar'}
              {formalizadoResult.email && <span className="block text-xs text-ink-subtle">{formalizadoResult.email}</span>}
            </dd>
          </div>
        </dl>

        {!formalizadoResult.acceso_portal && (
          <Alert tone="info" title="Afiliado sin acceso al portal">
            Cuando el asociado lo pida, el acceso al portal se activa desde su expediente.
          </Alert>
        )}

        {formalizadoResult.acceso_portal && !formalizadoResult.acceso_existente && !formalizadoResult.correo_enviado && (
          <Alert tone="warning" title="El asociado no recibió su acceso al portal">
            La afiliación quedó registrada, pero el correo con su usuario y su contraseña temporal no se pudo
            enviar, así que todavía no puede entrar al portal. Cuando el correo de la cooperativa funcione, reenvíe el
            acceso desde su expediente.
          </Alert>
        )}
      </div>
    </Modal>
  );
};

export default OperatorAffiliationSuccessModal;
