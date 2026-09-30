import React from 'react';
import { Alert, Button, Modal, cn } from '../ui';

/**
 * Confirmación genérica para acciones importantes (reemplaza `window.confirm`).
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose - Cancelar o cerrar.
 * @param {Function} props.onConfirm
 * @param {string} props.title
 * @param {string} [props.subtitle] - Referencia corta (folio, nombre).
 * @param {string|React.ReactNode} [props.message]
 * @param {Array<{label: string, value: string|number, highlight?: boolean}>} [props.details] - Datos clave del objeto.
 * @param {string} [props.note] - Advertencia opcional (p. ej. "Esta acción no se puede deshacer").
 * @param {string} [props.confirmText='Confirmar']
 * @param {string} [props.cancelText='Cancelar']
 * @param {'danger'|'warning'|'primary'} [props.variant='danger']
 * @param {boolean} [props.loading=false] - Bloquea el cierre mientras se procesa.
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  message,
  details = [],
  note,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  loading = false,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    dismissible={!loading}
    critical
    size="sm"
    title={title}
    description={subtitle}
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
          loadingText="Procesando…"
        >
          {confirmText}
        </Button>
      </>
    }
  >
    <div className="space-y-4 text-sm">
      {message && (typeof message === 'string' ? <p className="text-ink-soft">{message}</p> : message)}

      {details.length > 0 && (
        <dl className="divide-y divide-line rounded-md border border-line">
          {details.map((item, idx) => (
            <div key={idx} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-ink-muted">{item.label}</dt>
              <dd className={cn('text-right tabular-nums', item.highlight ? 'font-medium text-ink' : 'text-ink-soft')}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {note && <Alert tone="warning">{note}</Alert>}
    </div>
  </Modal>
);

export default ConfirmModal;
