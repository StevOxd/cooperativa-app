import React from 'react';
import { CheckCircle, RotateCcw, XCircle } from 'lucide-react';
import { getSecureDocumentUrl } from '../../utils/documentUrl';
import { Alert, Badge, Button, Field, LoadingState, Modal, TabPanel, Tabs, Textarea } from '../ui';
import { formatDate } from '../../utils/format';
import { SignedPdfPanel } from '../credit/SignedPdfPanel';
import { AccountBalances } from '../credit/AccountBalances';
import { CreditTransactionsTable } from '../credit/CreditTransactionsTable';
import { CreditTerms } from '../credit/CreditTerms';
import { executiveCreditStatus } from './ExecutiveCreditsTable';

const TABS_ID = 'resolucion-ejecutivo';

/**
 * Dictamen y resolución ejecutiva de un crédito: aceptar y desembolsar,
 * devolver al operador o denegar.
 */
export const ExecutiveResolutionModal = ({
  selectedCredito,
  closeResolverModal,
  activeModalTab,
  setActiveModalTab,
  archivoFirmado,
  setArchivoFirmado,
  handleFileChange,
  fileError,
  loadingEvaluacion,
  evaluacionData,
  observaciones,
  setObservaciones,
  resolving,
  handleResolver,
}) => {
  if (!selectedCredito) return null;

  const isPending = selectedCredito.estado === 'EN_AUTORIZACION_EJECUTIVO';
  const status = executiveCreditStatus(selectedCredito.estado);
  const apto = evaluacionData?.evaluacion?.dictamen === 'APTO';

  const footer = isPending ? (
    <div className="w-full space-y-3">
      <Field label="Resolución" hint="Obligatoria para devolver o denegar. El operador la verá con la solicitud.">
        <Textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Comentarios de su resolución"
          rows={2}
          className="max-h-24 resize-none"
        />
      </Field>
      {!archivoFirmado && (
        <p className="text-sm text-warning-800">
          Para aceptar y desembolsar, descargue el documento, fírmelo y súbalo en la pestaña "Documento firmado".
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={closeResolverModal} disabled={resolving}>
          Cancelar
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="danger"
            icon={XCircle}
            disabled={resolving}
            onClick={() => handleResolver('DENEGAR')}
            title="Rechazar la solicitud de forma definitiva (requiere comentario)"
          >
            Denegar
          </Button>
          <Button
            variant="secondary"
            icon={RotateCcw}
            disabled={resolving}
            onClick={() => handleResolver('DEVOLVER')}
            title="Devolver al operador para que revise o complete la documentación (requiere comentario)"
          >
            Devolver al operador
          </Button>
          <Button
            icon={CheckCircle}
            loading={resolving}
            loadingText="Procesando…"
            disabled={!archivoFirmado}
            onClick={() => handleResolver('ACEPTAR')}
            title={!archivoFirmado ? 'Suba el documento firmado para poder autorizar' : 'Aprobar el crédito y desembolsar los fondos'}
          >
            Aceptar y desembolsar
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-ink-muted">
        <p>
          Estado: <span className="font-medium text-ink">{status.label}</span>
          {selectedCredito.fecha_resolucion_ejecutivo && <> · resuelta el {formatDate(selectedCredito.fecha_resolucion_ejecutivo)}</>}
        </p>
        {selectedCredito.observaciones_ejecutivo && <p className="mt-0.5">Resolución: {selectedCredito.observaciones_ejecutivo}</p>}
      </div>
      <Button variant="secondary" onClick={closeResolverModal}>
        Cerrar
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={closeResolverModal}
      dismissible={!resolving}
      closeOnOverlay={false}
      lockScroll={false}
      size="xl"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Resolución del crédito #{selectedCredito.id_solicitud_credito}
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      }
      description={
        <>
          {selectedCredito.primer_nombre} {selectedCredito.primer_apellido} ·{' '}
          <span className="font-mono">{selectedCredito.cui_dpi}</span>
          {selectedCredito.codigo_corporativo && <> · <span className="font-mono">{selectedCredito.codigo_corporativo}</span></>}
        </>
      }
      footer={footer}
    >
      <div className="space-y-5">
        <div className="space-y-3 rounded-md border border-line p-4">
          <CreditTerms credito={selectedCredito} showRate={false} />
        </div>

        {selectedCredito.dictamen_operador && (
          <Alert tone="info" title={`Dictamen del operador${selectedCredito.operador_revisa_nombre ? ` (${selectedCredito.operador_revisa_nombre})` : ''}`}>
            {selectedCredito.dictamen_operador}
          </Alert>
        )}

        <Tabs
          label="Secciones del expediente"
          idPrefix={TABS_ID}
          value={activeModalTab}
          onChange={setActiveModalTab}
          items={[
            { id: 'documento', label: 'Documento firmado' },
            { id: 'scoring', label: 'Capacidad de pago' },
            { id: 'transacciones', label: 'Movimientos', count: evaluacionData?.transaccionesRecientes?.length || 0 },
          ]}
        />

        <TabPanel id={activeModalTab} idPrefix={TABS_ID}>
          {activeModalTab === 'documento' && (
            <SignedPdfPanel
              existingUrl={selectedCredito.documento_firmado_url ? getSecureDocumentUrl(selectedCredito.documento_firmado_url) : undefined}
              existingName={selectedCredito.nombre_archivo_firmado}
              existingSize={selectedCredito.peso_archivo_bytes}
              downloadName={`Solicitud_Credito_${selectedCredito.id_solicitud_credito}.pdf`}
              newFile={archivoFirmado}
              onFileChange={handleFileChange}
              onDiscard={() => setArchivoFirmado(null)}
              fileError={fileError}
              title={archivoFirmado ? 'Documento firmado listo' : 'Firma del ejecutivo'}
              description={
                archivoFirmado
                  ? 'Se adjuntará a la resolución al aceptar y desembolsar.'
                  : 'Descargue el documento que envió el operador, fírmelo y súbalo en PDF para poder autorizar.'
              }
              uploadLabel="Subir PDF firmado"
              emptyText="El operador no adjuntó un documento a esta solicitud."
            />
          )}

          {activeModalTab === 'scoring' &&
            (loadingEvaluacion ? (
              <LoadingState label="Cargando el análisis financiero…" />
            ) : evaluacionData ? (
              <div className="space-y-4">
                <Alert tone={apto ? 'success' : 'warning'} title={evaluacionData.evaluacion.diagnostico}>
                  {apto ? 'El análisis automático considera al asociado apto.' : 'El análisis automático sugiere revisar la solicitud con cuidado.'}
                </Alert>

                {evaluacionData.analisisSolicitud?.diagnosticos?.length > 0 && (
                  <section className="rounded-md border border-line p-4">
                    <h4 className="text-sm font-medium text-ink">Verificaciones del sistema</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-soft marker:text-ink-subtle">
                      {evaluacionData.analisisSolicitud.diagnosticos.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </section>
                )}

                <AccountBalances
                  bank={{
                    total: Number(evaluacionData.solicitante.totalBanco) || 0,
                    items: (evaluacionData.solicitante.cuentasBancarias || []).map((cb) => ({
                      key: cb.id_cuenta_bancaria,
                      name: cb.tipo_cuenta,
                      number: cb.numero_cuenta_bancaria,
                      amount: Number(cb.saldo_disponible) || 0,
                    })),
                  }}
                  coop={{
                    total: Number(evaluacionData.solicitante.totalCoop) || 0,
                    items: (evaluacionData.solicitante.cuentas || []).map((c) => ({
                      key: c.id_cuenta,
                      name: c.tipo || c.tipo_cuenta || 'Cuenta de la cooperativa',
                      number: c.numero_cuenta,
                      amount: Number(c.saldo_disponible !== undefined ? c.saldo_disponible : c.saldo || 0) || 0,
                    })),
                  }}
                />
              </div>
            ) : (
              <Alert tone="danger">No se pudo cargar el análisis financiero.</Alert>
            ))}

          {activeModalTab === 'transacciones' && (
            <CreditTransactionsTable transactions={evaluacionData?.transaccionesRecientes || []} />
          )}
        </TabPanel>
      </div>
    </Modal>
  );
};

export default ExecutiveResolutionModal;
