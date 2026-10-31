import React, { useCallback } from 'react';
import { Lock } from 'lucide-react';
import api from '../../../services/api';
import { Alert, Button, Field, Input, Modal, Textarea } from '../../ui';
import { PortalAccessOption } from '../../common/PortalAccessOption';
import { AffiliationPaymentOptions } from '../../common/AffiliationPaymentOptions';
import { AffiliationDocumentsPanel } from '../../documents';

const FORM_ID = 'formalizar-afiliacion';
const REJECT_FORM_ID = 'cancelar-afiliacion';
const soloLetras = (value) => value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');

/**
 * Atención y formalización de una afiliación en agencia (ARQ-04).
 * El operador revisa y corrige los datos, escanea los documentos que falten (obligatorios para formalizar), cobra el
 * aporte (efectivo a una cuenta nueva o a una que ya tiene, o débito de su cuenta del banco) o cancela la solicitud.
 *
 * No se cierra con Escape ni con clic fuera: al salir se libera el bloqueo del
 * caso, así que la salida es siempre explícita ("Liberar y salir").
 */
const OperatorAffiliationModal = ({
  selectedAfiliacion,
  showRechazarAfiliacion,
  setShowRechazarAfiliacion,
  motivoRechazoAfiliacion,
  setMotivoRechazoAfiliacion,
  rechazandoAfiliacion,
  handleRechazarAfiliacionSubmit,
  handleLiberarAfiliacion,
  handleFormalizarSubmit,
  editPrimerNombre,
  setEditPrimerNombre,
  editSegundoNombre,
  setEditSegundoNombre,
  editPrimerApellido,
  setEditPrimerApellido,
  editSegundoApellido,
  setEditSegundoApellido,
  editCuiDpi,
  setEditCuiDpi,
  editFechaNacimiento,
  setEditFechaNacimiento,
  editTelefono,
  setEditTelefono,
  editEmail,
  setEditEmail,
  editDireccion,
  setEditDireccion,
  operatorEmailStatus,
  correoDisponible,
  crearAccesoPortal,
  setCrearAccesoPortal,
  montoAportacion,
  setMontoAportacion,
  observacionesAfiliacion,
  setObservacionesAfiliacion,
  cobroAfiliacion,
  setCobroAfiliacion,
  documentosCompletos,
  setDocumentosCompletos,
  formalizando,
}) => {
  const idSolicitud = selectedAfiliacion?.id_solicitud;
  const cargarDocumentos = useCallback(
    () => api.get(`/operador/afiliaciones/${idSolicitud}/documentos`).then((r) => r.data.data),
    [idSolicitud]
  );
  const subirDocumento = useCallback(
    (tipo, archivo) => api.post(`/operador/afiliaciones/${idSolicitud}/documentos`, { tipo_documento: tipo, archivo }).then((r) => r.data.data),
    [idSolicitud]
  );
  const onCambioDocumentos = useCallback(
    (resumen) => setDocumentosCompletos(Boolean(resumen) && resumen.faltantes.length === 0),
    [setDocumentosCompletos]
  );

  if (!selectedAfiliacion) return null;

  const emailHint = !crearAccesoPortal
    ? 'Opcional: sin acceso al portal no se le envía nada.'
    : operatorEmailStatus.checking
      ? 'Verificando que el correo esté disponible…'
      : operatorEmailStatus.disponible === true
        ? operatorEmailStatus.message
        : 'A este correo se enviarán el usuario y la contraseña temporal.';
  const correoEnUso = crearAccesoPortal && operatorEmailStatus.disponible === false;

  const footer = showRechazarAfiliacion ? (
    <>
      <Button variant="secondary" onClick={() => setShowRechazarAfiliacion(false)}>
        Volver
      </Button>
      <Button type="submit" form={REJECT_FORM_ID} variant="danger" loading={rechazandoAfiliacion} loadingText="Cancelando…">
        Cancelar solicitud
      </Button>
    </>
  ) : (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ghost" onClick={handleLiberarAfiliacion}>
          Liberar y salir
        </Button>
        <Button variant="secondaryDanger" onClick={() => setShowRechazarAfiliacion(true)}>
          Cancelar solicitud
        </Button>
      </div>
      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <Button
          type="submit"
          form={FORM_ID}
          loading={formalizando}
          loadingText="Formalizando…"
          disabled={!documentosCompletos || correoEnUso || (crearAccesoPortal && operatorEmailStatus.checking)}
          aria-describedby={!documentosCompletos ? 'formalizar-falta' : undefined}
        >
          Formalizar afiliación
        </Button>
        {!documentosCompletos && (
          <p id="formalizar-falta" className="text-xs text-ink-muted">Faltan documentos obligatorios.</p>
        )}
      </div>
    </div>
  );

  // La persona ya está en la cooperativa (por ejemplo, trabaja aquí): se conservan sus datos (issue #32)
  const personaRegistrada = Boolean(selectedAfiliacion.persona_registrada);
  const yaEsAsociado = Boolean(selectedAfiliacion.ya_es_asociado);

  return (
    <Modal
      isOpen
      onClose={handleLiberarAfiliacion}
      dismissible={false}
      lockScroll={false}
      size="lg"
      title="Atender afiliación"
      description={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span className="font-mono text-ink">{selectedAfiliacion.numero_caso}</span>
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            Solo usted puede atender este caso mientras esté abierto.
          </span>
        </span>
      }
      footer={footer}
    >
      {showRechazarAfiliacion ? (
        <form id={REJECT_FORM_ID} onSubmit={handleRechazarAfiliacionSubmit} className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Cancelar la solicitud</h3>
            <p className="text-sm text-ink-muted">
              Explique por qué no se formaliza: por ejemplo, datos distintos a los del DPI, depósito menor al
              mínimo o el solicitante desistió.
            </p>
          </div>
          <Field label="Motivo" required>
            <Textarea
              value={motivoRechazoAfiliacion}
              onChange={(e) => setMotivoRechazoAfiliacion(e.target.value)}
              rows={3}
              required
            />
          </Field>
        </form>
      ) : (
        <form id={FORM_ID} onSubmit={handleFormalizarSubmit} className="space-y-6">
          <section aria-labelledby="datos-solicitante" className="space-y-3">
            <h3 id="datos-solicitante" className="text-sm font-semibold text-ink">Datos del solicitante</h3>
            {yaEsAsociado ? (
              <Alert tone="warning" title="Esta persona ya es asociada">
                La solicitud no se puede formalizar. Cancélela; si necesita acceso al portal, se activa desde su
                expediente.
              </Alert>
            ) : personaRegistrada && (
              <Alert tone="info" title="Esta persona ya está registrada en la cooperativa">
                Se conservan sus datos registrados, por eso quedan bloqueados: la solicitud no los cambia. Solo se usa el
                correo, para su usuario de asociado.
                {selectedAfiliacion.es_personal && ' Trabaja en la cooperativa: ese correo debe ser distinto al de su usuario del personal.'}
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Primer nombre" required>
                <Input
                  value={editPrimerNombre}
                  disabled={personaRegistrada}
                  onChange={(e) => setEditPrimerNombre(soloLetras(e.target.value))}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Segundo nombre">
                <Input value={editSegundoNombre} disabled={personaRegistrada} onChange={(e) => setEditSegundoNombre(soloLetras(e.target.value))} autoComplete="off" />
              </Field>
              <Field label="Primer apellido" required>
                <Input
                  value={editPrimerApellido}
                  disabled={personaRegistrada}
                  onChange={(e) => setEditPrimerApellido(soloLetras(e.target.value))}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Segundo apellido">
                <Input value={editSegundoApellido} disabled={personaRegistrada} onChange={(e) => setEditSegundoApellido(soloLetras(e.target.value))} autoComplete="off" />
              </Field>
              <Field label="DPI" hint={`${editCuiDpi.length}/13 dígitos`} required>
                <Input
                  inputMode="numeric"
                  maxLength={13}
                  value={editCuiDpi}
                  disabled={personaRegistrada}
                  onChange={(e) => setEditCuiDpi(e.target.value.replace(/\D/g, ''))}
                  className="font-mono"
                  required
                />
              </Field>
              <Field label="Fecha de nacimiento" required>
                <Input type="date" value={editFechaNacimiento} disabled={personaRegistrada} onChange={(e) => setEditFechaNacimiento(e.target.value)} required />
              </Field>
              <Field label="Teléfono" hint={`${editTelefono.length}/8 dígitos`}>
                <Input
                  inputMode="numeric"
                  maxLength={8}
                  value={editTelefono}
                  disabled={personaRegistrada}
                  onChange={(e) => setEditTelefono(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="font-mono"
                />
              </Field>
              <Field
                label="Correo electrónico"
                hint={emailHint}
                error={correoEnUso ? operatorEmailStatus.message : undefined}
                required={crearAccesoPortal}
              >
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2">
                <Input value={editDireccion} disabled={personaRegistrada} onChange={(e) => setEditDireccion(e.target.value)} />
              </Field>
            </div>
          </section>

          <div className="space-y-2 border-t border-line pt-5">
            <AffiliationDocumentsPanel
              key={idSolicitud}
              titulo="Documentos"
              cargar={cargarDocumentos}
              subir={subirDocumento}
              onCambio={onCambioDocumentos}
              conAyuda={false}
              nota="Escanee los que falten: sin los obligatorios no se puede formalizar. Lo que usted escanea lo revisa otro operador."
            />
          </div>

          <section aria-labelledby="deposito-inicial" className="space-y-3 border-t border-line pt-5">
            <h3 id="deposito-inicial" className="text-sm font-semibold text-ink">Aporte inicial</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Monto" hint="Mínimo Q100.00." required>
                <Input
                  type="number"
                  step="0.01"
                  min="100.00"
                  prefix="Q"
                  value={montoAportacion}
                  onChange={(e) => setMontoAportacion(e.target.value)}
                  className="tabular-nums"
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <AffiliationPaymentOptions
                  cui={editCuiDpi}
                  value={cobroAfiliacion}
                  onChange={setCobroAfiliacion}
                  permitirDebito
                  disabled={formalizando}
                />
              </div>
              <Field label="Observaciones" hint="Opcional." className="sm:col-span-2">
                <Textarea
                  value={observacionesAfiliacion}
                  onChange={(e) => setObservacionesAfiliacion(e.target.value)}
                  rows={2}
                />
              </Field>
            </div>
            <PortalAccessOption
              correoDisponible={correoDisponible}
              checked={crearAccesoPortal}
              onChange={setCrearAccesoPortal}
              disabled={formalizando}
            />
          </section>
        </form>
      )}
    </Modal>
  );
};

export default OperatorAffiliationModal;
