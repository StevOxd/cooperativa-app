import React from 'react';
import { Send } from 'lucide-react';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { formatQ } from '../../../utils/format';

const FORM_ID = 'solicitud-traslado';

/**
 * Solicitud de traslado desde la cuenta de planilla: a una cuenta existente o
 * abriendo una cuenta nueva. Un operador la revisa antes de mover los fondos.
 */
export const TransferRequestModal = ({
  closeTrasladoModal,
  cuentaPlanilla,
  cuentasDestino,
  cuentasDestinoFiltradas,
  destinoSeleccionado,
  enviandoTraslado,
  handleDestinoChange,
  handleTrasladoSubmit,
  isTrasladoModalOpen,
  modalErrorMessage,
  montoTraslado,
  observacionesTraslado,
  realTimeError,
  setMontoTraslado,
  setObservacionesTraslado,
}) => {
  if (!isTrasladoModalOpen || !cuentaPlanilla) return null;

  return (
    <Modal
      isOpen
      onClose={closeTrasladoModal}
      dismissible={!enviandoTraslado}
      closeOnOverlay={false}
      lockScroll={false}
      title="Solicitar traslado"
      description="Mueva fondos de su cuenta de planilla a una cuenta de la cooperativa."
      footer={
        <>
          <Button variant="secondary" onClick={closeTrasladoModal} disabled={enviandoTraslado}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            icon={Send}
            loading={enviandoTraslado}
            loadingText="Enviando…"
            disabled={!!realTimeError}
          >
            Enviar solicitud
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleTrasladoSubmit} className="space-y-5">
        <dl className="divide-y divide-line rounded-md border border-line text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Desde</dt>
            <dd className="text-right text-ink">
              {cuentaPlanilla.tipo_cuenta} <span className="font-mono text-ink-muted">{cuentaPlanilla.numero_cuenta}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Saldo disponible</dt>
            <dd className="font-medium text-ink tabular-nums">{formatQ(cuentaPlanilla.saldo_disponible)}</dd>
          </div>
        </dl>

        {(modalErrorMessage || realTimeError) && <Alert tone="danger">{modalErrorMessage || realTimeError}</Alert>}

        <Field label="Monto" required>
          <Input
            type="number"
            min={1}
            max={parseFloat(cuentaPlanilla.saldo_disponible)}
            step={0.01}
            prefix="Q"
            value={montoTraslado}
            onChange={(e) => setMontoTraslado(e.target.value)}
            placeholder="0.00"
            className="tabular-nums"
            required
          />
        </Field>

        <Field label="Destino" required>
          <Select value={destinoSeleccionado} onChange={(e) => handleDestinoChange(e.target.value)} required>
            <option value="">Elija una cuenta o un producto</option>
            {/* Cuentas existentes elegibles (excluye la cuenta de origen) */}
            {cuentasDestinoFiltradas.length > 0 && (
              <optgroup label="A una cuenta que ya tiene">
                {cuentasDestinoFiltradas.map((d) => (
                  <option key={`EXISTENTE:${d.id_cuenta}`} value={`EXISTENTE:${d.id_cuenta}`}>
                    {d.tipo_cuenta} · {d.numero_cuenta} (saldo {formatQ(d.saldo_disponible)})
                  </option>
                ))}
              </optgroup>
            )}
            {/* Productos disponibles para abrir */}
            {cuentasDestino.tiposDisponibles.length > 0 && (
              <optgroup label="Abrir una cuenta nueva">
                {cuentasDestino.tiposDisponibles.map((t) => (
                  <option key={`APERTURA:${t.id_tipo_cuenta}`} value={`APERTURA:${t.id_tipo_cuenta}`}>
                    {t.nombre} (mínimo {formatQ(t.monto_minimo_apertura)})
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        <Field label="Motivo" hint="Opcional.">
          <Textarea
            value={observacionesTraslado}
            onChange={(e) => setObservacionesTraslado(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </Field>

        <p className="text-sm text-ink-muted">
          Al enviarla, recibirá un número de caso. Un operador revisará la solicitud y podrá seguir su estado en la
          pestaña Traslados.
        </p>
      </form>
    </Modal>
  );
};

export default TransferRequestModal;
