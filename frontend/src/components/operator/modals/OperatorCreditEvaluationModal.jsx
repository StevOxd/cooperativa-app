import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { getSecureDocumentUrl } from '../../../utils/documentUrl';
import {
  Alert, Badge, Button, Field, LoadingState, Modal, StatCard, StatGroup, TabPanel, Tabs, Textarea, cn,
} from '../../ui';
import { formatDate, formatQ } from '../../../utils/format';
import { creditStatus } from '../dashboard/status';
import { SignedPdfPanel } from '../../credit/SignedPdfPanel';
import { AccountBalances } from '../../credit/AccountBalances';
import { CreditTransactionsTable } from '../../credit/CreditTransactionsTable';
import { CreditTerms, creditDestination } from '../../credit/CreditTerms';

const TABS_ID = 'evaluacion-operador';
const PENDING_STATES = ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'];

/** Resultado del análisis automático → tono y titular. */
const VERDICTS = {
  APTO: { tone: 'success', title: 'El sistema considera al asociado apto (riesgo bajo)' },
  CONDICIONADO: { tone: 'warning', title: 'Crédito condicionado (riesgo moderado)' },
};
const NO_APTO = { tone: 'danger', title: 'El sistema no recomienda el crédito (riesgo alto)' };

/**
 * Expediente y evaluación de una solicitud de crédito por el operador (ARQ-04):
 * análisis automático, documento firmado, cuentas y movimientos, y dictamen.
 */
const OperatorCreditEvaluationModal = ({
  selectedCredito,
  loadingEvaluacion,
  evaluacionData,
  activeEvalTab,
  setActiveEvalTab,
  observacionesCredito,
  setObservacionesCredito,
  resolvingCredito,
  closeResolverCreditoModal,
  handleResolveCreditoSubmit,
  handleElevarCredito,
}) => {
  const [archivoFirmado, setArchivoFirmado] = useState(null);
  const [fileError, setFileError] = useState('');

  // El operador debe adjuntar obligatoriamente el archivo PDF firmado para poder aceptar la solicitud
  const hasOperatorSignedPdf = Boolean(archivoFirmado);

  useEffect(() => {
    setArchivoFirmado(null);
    setFileError('');
  }, [selectedCredito?.id_solicitud_credito]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFileError('El archivo debe ser un PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError('El PDF no puede pasar de 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setArchivoFirmado({
        file,
        name: file.name,
        size: file.size,
        base64: event.target.result,
      });
      setActiveEvalTab('documento');
    };
    reader.onerror = () => {
      setFileError('No se pudo leer el PDF. Intente con otro archivo.');
    };
    reader.readAsDataURL(file);
  };
  if (!selectedCredito) return null;

  const isPending = PENDING_STATES.includes(selectedCredito.estado);
  const status = creditStatus(selectedCredito.estado);
  const analisis = evaluacionData?.analisisSolicitud;
  const solicitante = evaluacionData?.solicitante;
  const verdict = analisis ? VERDICTS[analisis.dictamen] || NO_APTO : null;
  const nombre = [selectedCredito.primer_nombre, selectedCredito.segundo_nombre, selectedCredito.primer_apellido, selectedCredito.segundo_apellido]
    .filter(Boolean)
    .join(' ');

  const footer = isPending ? (
    <div className="w-full space-y-3">
      <Field label="Dictamen" hint="Obligatorio para elevar o rechazar. El ejecutivo lo verá con la solicitud.">
        <Textarea
          value={observacionesCredito}
          onChange={(e) => setObservacionesCredito(e.target.value)}
          placeholder="Resumen de su análisis o motivo del rechazo"
          rows={2}
          className="max-h-24 resize-none"
        />
      </Field>
      {!hasOperatorSignedPdf && (
        <p className="text-sm text-warning-800">
          Para elevar la solicitud al ejecutivo, adjunte el PDF firmado en la pestaña "Documento firmado".
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={closeResolverCreditoModal} disabled={resolvingCredito}>
          Volver
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="danger"
            onClick={() => handleResolveCreditoSubmit('RECHAZAR', archivoFirmado)}
            disabled={resolvingCredito}
          >
            Rechazar solicitud
          </Button>
          <Button
            icon={Send}
            onClick={() => handleElevarCredito(archivoFirmado)}
            loading={resolvingCredito}
            loadingText="Procesando…"
            disabled={!hasOperatorSignedPdf}
            title={!hasOperatorSignedPdf ? 'Adjunte el PDF firmado para elevar la solicitud' : undefined}
          >
            Elevar al ejecutivo
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-ink-muted">
        <p>
          Resuelta como <span className="font-medium text-ink">{status.label}</span>
          {selectedCredito.fecha_resolucion && <> el {formatDate(selectedCredito.fecha_resolucion)}</>}.
        </p>
        {selectedCredito.observaciones && <p className="mt-0.5">Motivo: {selectedCredito.observaciones}</p>}
      </div>
      <Button variant="secondary" onClick={closeResolverCreditoModal}>
        Cerrar
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={closeResolverCreditoModal}
      dismissible={!resolvingCredito}
      closeOnOverlay={false}
      lockScroll={false}
      size="xl"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Solicitud de crédito #{selectedCredito.id_solicitud_credito}
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      }
      description={
        <>
          {nombre} · <span className="font-mono">{selectedCredito.cui_dpi}</span>
          {selectedCredito.codigo_corporativo && <> · <span className="font-mono">{selectedCredito.codigo_corporativo}</span></>}
        </>
      }
      footer={footer}
    >
      {loadingEvaluacion ? (
        <LoadingState label="Analizando saldos, deudas y movimientos del asociado…" />
      ) : !evaluacionData ? (
        <Alert tone="danger">No se pudo cargar la información financiera del asociado.</Alert>
      ) : (
        <div className="space-y-5">
          <Alert tone={verdict.tone} title={verdict.title}>
            {analisis.dictamen === 'APTO' ? (
              <>
                Saldo consolidado de <span className="font-medium tabular-nums">{formatQ(solicitante.saldoTotal)}</span> y un
                endeudamiento proyectado del <span className="font-medium tabular-nums">{analisis.porcentajeEndeudamiento}%</span>,
                dentro de rangos seguros.
              </>
            ) : analisis.dictamen === 'CONDICIONADO' ? (
              <>
                Tiene solvencia básica, pero la deuda proyectada de{' '}
                <span className="font-medium tabular-nums">{formatQ(analisis.deudaProyectada)}</span> usa el{' '}
                <span className="font-medium tabular-nums">{analisis.porcentajeEndeudamiento}%</span> de su límite.
              </>
            ) : (
              <>
                El monto solicitado de <span className="font-medium tabular-nums">{formatQ(analisis.montoSolicitado)}</span>{' '}
                supera el cupo disponible de <span className="font-medium tabular-nums">{formatQ(analisis.cupoDisponible)}</span> o
                su capacidad de pago.
              </>
            )}
          </Alert>

          <StatGroup>
            <StatCard
              label="Saldo total"
              value={formatQ(solicitante.saldoTotal)}
              hint={`Banco ${formatQ(solicitante.totalBanco)} · Cooperativa ${formatQ(solicitante.totalCoop)}`}
            />
            <StatCard
              label="Límite asignado"
              value={formatQ(evaluacionData.capacidad.limiteMaximo)}
              hint={`${evaluacionData.capacidad.nivel} (${evaluacionData.capacidad.rangoTexto})`}
            />
            <StatCard
              label="Deuda proyectada"
              value={formatQ(analisis.deudaProyectada)}
              hint={`Actual ${formatQ(solicitante.deudaActiva)} + esta solicitud ${formatQ(analisis.montoSolicitado)}`}
            />
            <StatCard
              label="Endeudamiento"
              value={`${analisis.porcentajeEndeudamiento}%`}
              hint={
                <span className="block space-y-1.5">
                  <span className="block">Cupo disponible {formatQ(analisis.cupoDisponible)}</span>
                  <span className="block h-1.5 w-full rounded-sm bg-surface-sunken" aria-hidden="true">
                    <span
                      className={cn(
                        'block h-1.5 rounded-sm',
                        analisis.porcentajeEndeudamiento > 100
                          ? 'bg-danger-600'
                          : analisis.porcentajeEndeudamiento > 75
                          ? 'bg-warning-500'
                          : 'bg-brand-700'
                      )}
                      style={{ width: `${Math.min(100, analisis.porcentajeEndeudamiento)}%` }}
                    />
                  </span>
                </span>
              }
            />
          </StatGroup>

          {selectedCredito.estado === 'DEVUELTA_OPERADOR' && (
            <Alert tone="warning" title="El ejecutivo devolvió esta solicitud">
              {selectedCredito.observaciones_ejecutivo ||
                'Pidió revisar los datos o los documentos adjuntos.'}
            </Alert>
          )}

          <Tabs
            label="Secciones del expediente"
            idPrefix={TABS_ID}
            value={activeEvalTab}
            onChange={setActiveEvalTab}
            items={[
              { id: 'documento', label: 'Documento firmado' },
              { id: 'scoring', label: 'Capacidad de pago' },
              { id: 'transacciones', label: 'Movimientos', count: evaluacionData?.transaccionesRecientes?.length || 0 },
            ]}
          />

          <TabPanel id={activeEvalTab} idPrefix={TABS_ID}>
            {activeEvalTab === 'documento' && (
              <SignedPdfPanel
                existingUrl={selectedCredito.documento_firmado_url ? getSecureDocumentUrl(selectedCredito.documento_firmado_url) : undefined}
                existingName={selectedCredito.nombre_archivo_firmado}
                existingSize={selectedCredito.peso_archivo_bytes}
                downloadName={`Solicitud_Credito_${selectedCredito.id_solicitud_credito}.pdf`}
                newFile={archivoFirmado}
                onFileChange={handleFileChange}
                onDiscard={() => setArchivoFirmado(null)}
                fileError={fileError}
                title={archivoFirmado ? 'PDF firmado listo' : 'Solicitud firmada por el operador'}
                description={
                  archivoFirmado
                    ? 'Se enviará al ejecutivo junto con su dictamen.'
                    : 'Descargue la solicitud, fírmela y súbala en PDF para poder elevarla al ejecutivo.'
                }
                uploadLabel="Subir PDF firmado"
                emptyText="La solicitud no tiene un documento adjunto. Suba el PDF firmado para continuar."
              />
            )}

            {activeEvalTab === 'scoring' && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-md border border-line p-4">
                  <CreditTerms credito={selectedCredito} />
                  <div className="space-y-1 border-t border-line pt-3 text-sm text-ink-muted">
                    <p>
                      <span className="text-ink-soft">Se acredita en:</span> {creditDestination(selectedCredito)}
                    </p>
                    {selectedCredito.observaciones && (
                      <p>
                        <span className="text-ink-soft">Destino declarado:</span> {selectedCredito.observaciones}
                      </p>
                    )}
                  </div>
                </div>

                {analisis.diagnosticos?.length > 0 && (
                  <section className="rounded-md border border-line p-4">
                    <h4 className="text-sm font-medium text-ink">Verificaciones del sistema</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-soft marker:text-ink-subtle">
                      {analisis.diagnosticos.map((diag, index) => <li key={index}>{diag}</li>)}
                    </ul>
                  </section>
                )}

                <AccountBalances
                  bank={{
                    total: solicitante.totalBanco,
                    items: (solicitante.cuentasBancarias || []).map((cb) => ({
                      key: cb.id_cuenta_bancaria,
                      name: cb.tipo_cuenta,
                      number: cb.numero_cuenta_bancaria,
                      amount: cb.saldo_disponible,
                    })),
                  }}
                  coop={{
                    total: solicitante.totalCoop,
                    items: (solicitante.cuentas || []).map((c) => ({
                      key: c.id_cuenta,
                      name: c.tipo || c.tipo_cuenta || 'Cuenta de la cooperativa',
                      number: c.numero_cuenta,
                      amount: c.saldo_disponible !== undefined ? c.saldo_disponible : c.saldo || 0,
                    })),
                  }}
                />
              </div>
            )}

            {activeEvalTab === 'transacciones' && (
              <CreditTransactionsTable transactions={evaluacionData.transaccionesRecientes || []} />
            )}
          </TabPanel>
        </div>
      )}
    </Modal>
  );
};

export default OperatorCreditEvaluationModal;
