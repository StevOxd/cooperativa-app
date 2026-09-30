import React from 'react';
import { Button, Field, Modal, Textarea } from '../../ui';
import { formatQ } from '../../../utils/format';
import { transferOperation } from '../dashboard/status';

const FORM_ID = 'resolver-traslado';

/**
 * Confirmación del operador para aprobar o rechazar un traslado o apertura (ARQ-04).
 */
const OperatorTrasladoModal = ({
  selectedSolicitud,
  actionType,
  observacionesTraslado,
  setObservacionesTraslado,
  resolvingTraslado,
  closeResolverTrasladoModal,
  handleResolveTrasladoSubmit,
}) => {
  if (!selectedSolicitud || !actionType) return null;

  const aprobar = actionType === 'APROBAR';

  return (
    <Modal
      isOpen
      onClose={closeResolverTrasladoModal}
      dismissible={!resolvingTraslado}
      lockScroll={false}
      size="sm"
      title={aprobar ? 'Aprobar traslado' : 'Rechazar traslado'}
      description={`${selectedSolicitud.primer_nombre} ${selectedSolicitud.primer_apellido}`}
      footer={
        <>
          <Button variant="secondary" onClick={closeResolverTrasladoModal} disabled={resolvingTraslado}>
            Volver
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant={aprobar ? 'primary' : 'danger'}
            loading={resolvingTraslado}
            loadingText={aprobar ? 'Aprobando…' : 'Rechazando…'}
          >
            {aprobar ? 'Aprobar traslado' : 'Rechazar traslado'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <dl className="divide-y divide-line rounded-md border border-line text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Caso</dt>
            <dd className="font-mono text-ink">{selectedSolicitud.numero_caso}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Monto</dt>
            <dd className="font-medium text-ink tabular-nums">{formatQ(selectedSolicitud.monto)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Operación</dt>
            <dd className="text-ink">{transferOperation(selectedSolicitud.tipo_operacion)}</dd>
          </div>
          {selectedSolicitud.cuenta_destino_numero && (
            <div className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-ink-muted">Cuenta destino</dt>
              <dd className="font-mono text-ink">{selectedSolicitud.cuenta_destino_numero}</dd>
            </div>
          )}
        </dl>

        <form id={FORM_ID} onSubmit={handleResolveTrasladoSubmit}>
          <Field
            label={aprobar ? 'Comentario' : 'Motivo del rechazo'}
            hint={aprobar ? 'Opcional. El asociado lo verá en su historial.' : 'El asociado lo verá en su historial.'}
            required={!aprobar}
          >
            <Textarea
              value={observacionesTraslado}
              onChange={(e) => setObservacionesTraslado(e.target.value)}
              placeholder={aprobar ? 'Comentario de aprobación' : 'Explique por qué se rechaza'}
              required={!aprobar}
              rows={3}
            />
          </Field>
        </form>
      </div>
    </Modal>
  );
};

export default OperatorTrasladoModal;
