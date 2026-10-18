import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Select, StepProgress, Table, TBody, TD, TH, THead, TR, cn,
} from '../../ui';
import { formatDate, formatQ, formatRelative } from '../../../utils/format';
import { PASOS_CREDITO, avanceCredito, estadoCreditoAsociado } from '../../credit/creditProgress';

const longDate = (value) =>
  new Date(value).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' });

/** Solicitudes de crédito que aún no se resuelven, con el paso en que van. */
const CreditsInProgress = ({ creditos }) => (
  <section aria-labelledby="creditos-en-tramite" className="space-y-3">
    <h2 id="creditos-en-tramite" className="text-base font-semibold text-ink">Solicitudes en trámite</h2>
    <ul className="space-y-3">
      {creditos.map((c) => {
        const { paso, tono } = avanceCredito(c.estado);
        const estado = estadoCreditoAsociado(c.estado);
        const ultimoCambio = [c.fecha_resolucion_ejecutivo, c.fecha_revision_operador, c.fecha_carga_archivo, c.fecha_solicitud]
          .filter(Boolean)
          .reduce((max, f) => (!max || new Date(f) > new Date(max) ? f : max), null);
        const leToca = c.estado === 'PENDIENTE_FIRMA' || c.estado === 'DEVUELTA_OPERADOR';
        return (
          <li key={c.id_solicitud_credito}>
            <Card as="article" className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-ink">
                    Solicitud #{c.id_solicitud_credito} · <span className="tabular-nums">{formatQ(c.monto_solicitado)}</span>
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {c.plazo_meses} meses · último cambio {formatRelative(ultimoCambio)}
                  </p>
                </div>
                <Badge tone={estado.tone}>{estado.label}</Badge>
              </div>
              <StepProgress
                steps={PASOS_CREDITO}
                current={paso}
                tone={tono}
                label={`Avance de la solicitud #${c.id_solicitud_credito}`}
                className="mt-4"
              />
              {leToca && (
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                  {c.estado === 'PENDIENTE_FIRMA'
                    ? 'Falta subir el formulario firmado.'
                    : 'El comité la devolvió al operador con un comentario. Si le piden un documento nuevo, súbalo desde el simulador.'}
                  <Button as={Link} to="/simulador-credito" size="sm" variant="link" className="px-0">
                    Ir al simulador
                  </Button>
                </p>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  </section>
);

/**
 * Pestaña de créditos: solicitudes en trámite con su avance, y los datos del crédito aprobado con su calendario
 * de pagos (amortización francesa, cuota fija).
 *
 * @param {Object} props
 * @param {Object[]} props.creditosEnTramite - Solicitudes sin resolver (de la firma a la autorización).
 * @param {Object|null} props.proximaCuotaDelPlan - Siguiente cuota del crédito elegido; null si el calendario terminó.
 */
export const AssociateCreditsTab = ({
  creditosAprobados,
  creditosEnTramite,
  cuotaPage,
  cuotasPerPage,
  currentCreditoPlan,
  pageCapitalAmortizado,
  pageInteresAmortizado,
  pagePagadoAmortizado,
  paginatedCuotas,
  planAmortizacion,
  proximaCuotaDelPlan,
  setCuotaPage,
  setSelectedCreditoPlanId,
  totalCapitalAmortizado,
  totalCuotasPages,
  totalInteresAmortizado,
  totalPagadoAmortizado,
}) => {
  const enTramite = creditosEnTramite.length > 0 && <CreditsInProgress creditos={creditosEnTramite} />;

  if (creditosAprobados.length === 0) {
    return (
      <div className="space-y-6">
        {enTramite}
        {creditosEnTramite.length === 0 ? (
          <Card>
            <EmptyState
              icon={Calculator}
              title="Aún no tiene créditos"
              description="Calcule su cuota en el simulador. Si le conviene, envíe la solicitud desde ahí: aquí verá su avance y, cuando se apruebe, su calendario de pagos."
              action={
                <Button as={Link} to="/simulador-credito" icon={Calculator}>
                  Ir al simulador
                </Button>
              }
            />
          </Card>
        ) : (
          <p className="text-sm text-ink-muted">Cuando se apruebe, aquí verá su calendario de pagos.</p>
        )}
      </div>
    );
  }

  const tasaAnual = parseFloat(currentCreditoPlan?.tasa_interes);
  const fechaAprobacion = currentCreditoPlan?.fecha_resolucion || currentCreditoPlan?.fecha_solicitud;
  const primeraCuota = (cuotaPage - 1) * cuotasPerPage + 1;
  const ultimaCuota = Math.min(cuotaPage * cuotasPerPage, planAmortizacion.length);
  const estadoPlan = currentCreditoPlan ? estadoCreditoAsociado(currentCreditoPlan.estado) : null;
  const finDelCalendario = planAmortizacion[planAmortizacion.length - 1]?.fechaPago;

  return (
    <div className="space-y-6">
      {enTramite}

      {/* Selector cuando hay más de un crédito aprobado */}
      {creditosAprobados.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Elegir crédito">
          <span className="text-sm text-ink-muted">Crédito:</span>
          {creditosAprobados.map((cr) => {
            const isSelected = currentCreditoPlan?.id_solicitud_credito === cr.id_solicitud_credito;
            return (
              <button
                key={cr.id_solicitud_credito}
                type="button"
                onClick={() => setSelectedCreditoPlanId(cr.id_solicitud_credito)}
                aria-pressed={isSelected}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  isSelected
                    ? 'border-brand-700 bg-brand-50 font-medium text-brand-800'
                    : 'border-line-strong bg-white text-ink-soft hover:bg-surface-muted'
                )}
              >
                #{cr.id_solicitud_credito} · <span className="tabular-nums">{formatQ(cr.monto_solicitado)}</span>
              </button>
            );
          })}
        </div>
      )}

      {currentCreditoPlan && (
        <>
          <Card>
            <CardHeader
              title={`Crédito #${currentCreditoPlan.id_solicitud_credito}`}
              description={`Aprobado el ${longDate(fechaAprobacion)}`}
              actions={<Badge tone={estadoPlan.tone}>{estadoPlan.label}</Badge>}
            />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
                <div>
                  <dt className="text-xs text-ink-muted">Monto aprobado</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
                    {formatQ(currentCreditoPlan.monto_solicitado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Cuota mensual</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
                    {formatQ(currentCreditoPlan.cuota_mensual_estimada)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Plazo</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">{currentCreditoPlan.plazo_meses} meses</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Tasa de interés</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
                    {tasaAnual.toFixed(2)}% <span className="text-sm font-normal text-ink-muted">anual fija</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Próxima cuota</dt>
                  {proximaCuotaDelPlan ? (
                    <>
                      <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">{formatQ(proximaCuotaDelPlan.cuotaMes)}</dd>
                      <dd className="text-xs text-ink-muted">{longDate(proximaCuotaDelPlan.fechaPago)}</dd>
                    </>
                  ) : (
                    <dd className="mt-0.5 text-sm text-ink-soft">
                      El calendario terminó{finDelCalendario && <> el {formatDate(finDelCalendario)}</>}
                    </dd>
                  )}
                </div>
              </dl>

              <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm text-ink-muted">
                <p>
                  <span className="text-ink-soft">Se acreditó en:</span>{' '}
                  {currentCreditoPlan.cuenta_destino_info ||
                    (currentCreditoPlan.cuenta_bancaria_destino_numero
                      ? `Cuenta bancaria ${currentCreditoPlan.cuenta_bancaria_destino_tipo || ''} (${currentCreditoPlan.cuenta_bancaria_destino_numero})`
                      : 'Cuenta principal del asociado')}
                </p>
                <p>
                  La cuota es la misma todos los meses. Una parte abona al capital y otra paga el interés del mes,
                  calculado sobre lo que aún debe (tasa mensual de {(tasaAnual / 12).toFixed(4)}%). Al principio
                  la mayor parte es interés; hacia el final, casi todo es capital.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Calendario de pagos"
              description={`Fechas calculadas desde la aprobación, el ${formatDate(fechaAprobacion)}.`}
              actions={
                totalCuotasPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCuotaPage((prev) => Math.max(1, prev - 1))}
                      disabled={cuotaPage === 1}
                      aria-label="Año anterior"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <div className="w-44">
                      <Select
                        value={cuotaPage}
                        onChange={(e) => setCuotaPage(Number(e.target.value))}
                        aria-label="Año del calendario"
                      >
                        {Array.from({ length: totalCuotasPages }, (_, idx) => {
                          const pageNum = idx + 1;
                          const start = (pageNum - 1) * cuotasPerPage + 1;
                          const end = Math.min(pageNum * cuotasPerPage, planAmortizacion.length);
                          return (
                            <option key={pageNum} value={pageNum}>
                              Año {pageNum} · cuotas {start}–{end}
                            </option>
                          );
                        })}
                      </Select>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCuotaPage((prev) => Math.min(totalCuotasPages, prev + 1))}
                      disabled={cuotaPage === totalCuotasPages}
                      aria-label="Año siguiente"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                )
              }
            />
            <Table bordered={false} caption={`Calendario de pagos, cuotas ${primeraCuota} a ${ultimaCuota} de ${planAmortizacion.length}`}>
              <THead>
                <TR>
                  <TH>Cuota</TH>
                  <TH>Fecha de pago</TH>
                  <TH numeric>Capital</TH>
                  <TH numeric>Interés</TH>
                  <TH numeric>Cuota del mes</TH>
                  <TH numeric>Saldo pendiente</TH>
                </TR>
              </THead>
              <TBody>
                {paginatedCuotas.map((c) => (
                  <TR key={c.numero} interactive>
                    <TD className="tabular-nums text-ink-muted">{c.numero}</TD>
                    <TD className="whitespace-nowrap">{formatDate(c.fechaPago)}</TD>
                    <TD numeric>{formatQ(c.capital)}</TD>
                    <TD numeric>{formatQ(c.interes)}</TD>
                    <TD numeric className="font-medium text-ink">{formatQ(c.cuotaMes)}</TD>
                    <TD numeric className="text-ink-muted">{formatQ(c.saldoPendiente)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot className="border-t border-line-strong bg-surface-muted text-sm">
                {totalCuotasPages > 1 && (
                  <tr className="border-b border-line">
                    <td colSpan={2} className="px-4 py-2.5 text-ink-muted">
                      Año {cuotaPage} (cuotas {primeraCuota} a {ultimaCuota})
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatQ(pageCapitalAmortizado)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatQ(pageInteresAmortizado)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink tabular-nums">{formatQ(pagePagadoAmortizado)}</td>
                    <td />
                  </tr>
                )}
                <tr className="font-medium text-ink">
                  <td colSpan={2} className="px-4 py-3">
                    Total del crédito ({planAmortizacion.length} cuotas)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatQ(totalCapitalAmortizado)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatQ(totalInteresAmortizado)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatQ(totalPagadoAmortizado)}</td>
                  <td className="px-4 py-3 text-right text-ink-muted tabular-nums">{formatQ(0)}</td>
                </tr>
              </tfoot>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
};

export default AssociateCreditsTab;
