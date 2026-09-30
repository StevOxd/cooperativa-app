import React from 'react';
import { RefreshCw, Users2 } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, EmptyState, LoadingState, Table, TBody, TD, TH, THead, TR,
} from '../../ui';
import { formatQ } from '../../../utils/format';

/**
 * Pestaña de beneficiarios: quién recibe los fondos de cada cuenta.
 * La suma de porcentajes por cuenta debe ser 100 %.
 */
export const AssociateBeneficiariesTab = ({
  fetchMisBeneficiarios,
  loadingBeneficiarios,
  misBeneficiariosData,
  openEditarBeneficiariosModal,
}) => (
  <section aria-labelledby="beneficiarios-titulo" className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="beneficiarios-titulo" className="text-base font-semibold text-ink">Beneficiarios</h2>
        <p className="max-w-2xl text-sm text-ink-muted">
          Las personas que recibirán los fondos de cada cuenta. En cada cuenta, los porcentajes deben sumar 100 %.
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon={RefreshCw}
        onClick={fetchMisBeneficiarios}
        disabled={loadingBeneficiarios}
        className={loadingBeneficiarios ? '[&>svg]:animate-spin' : undefined}
      >
        Actualizar
      </Button>
    </div>

    {loadingBeneficiarios ? (
      <Card><LoadingState label="Cargando beneficiarios…" /></Card>
    ) : misBeneficiariosData.length === 0 ? (
      <Card>
        <EmptyState
          icon={Users2}
          title="No tiene cuentas para asignar beneficiarios"
          description="Cuando abra una cuenta en la cooperativa, podrá designar aquí a sus beneficiarios."
        />
      </Card>
    ) : (
      <div className="space-y-4">
        {misBeneficiariosData.map((cuenta) => {
          const totalPct = (cuenta.beneficiarios || []).reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);
          const isComplete = Math.abs(totalPct - 100.00) < 0.01;
          const hasBeneficiaries = cuenta.beneficiarios && cuenta.beneficiarios.length > 0;

          return (
            <Card as="article" key={cuenta.id_cuenta}>
              <CardHeader
                as="h3"
                title={cuenta.tipo_cuenta}
                description={
                  <>
                    <span className="font-mono">{cuenta.numero_cuenta}</span> · Saldo{' '}
                    <span className="tabular-nums">{formatQ(cuenta.saldo_disponible)}</span>
                  </>
                }
                actions={
                  <>
                    {hasBeneficiaries && (
                      <Badge tone={isComplete ? 'success' : 'warning'}>
                        {isComplete ? '100 % asignado' : `${totalPct.toFixed(2)} % asignado`}
                      </Badge>
                    )}
                    <Button size="sm" onClick={() => openEditarBeneficiariosModal(cuenta)}>
                      Gestionar beneficiarios
                    </Button>
                  </>
                }
              />

              {!hasBeneficiaries ? (
                <EmptyState
                  title="Sin beneficiarios"
                  description="Esta cuenta todavía no tiene beneficiarios designados."
                  className="py-8"
                />
              ) : (
                <Table bordered={false} caption={`Beneficiarios de la cuenta ${cuenta.numero_cuenta}`}>
                  <THead>
                    <TR>
                      <TH>Nombre</TH>
                      <TH>Parentesco</TH>
                      <TH>DPI</TH>
                      <TH>Teléfono</TH>
                      <TH numeric>Porcentaje</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {cuenta.beneficiarios.map((b, idx) => (
                      <TR key={b.id_beneficiario || idx}>
                        <TD className="whitespace-nowrap font-medium text-ink">{b.nombre_completo}</TD>
                        <TD>{b.parentesco}</TD>
                        <TD className="whitespace-nowrap font-mono">{b.cui_dpi || '—'}</TD>
                        <TD className="whitespace-nowrap font-mono">{b.telefono || '—'}</TD>
                        <TD numeric className="text-ink">{parseFloat(b.porcentaje).toFixed(2)} %</TD>
                      </TR>
                    ))}
                  </TBody>
                  <tfoot className="border-t border-line-strong bg-surface-muted text-sm">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-ink-muted">Total</td>
                      <td
                        className={`px-4 py-2.5 text-right font-medium tabular-nums ${isComplete ? 'text-ink' : 'text-warning-800'}`}
                      >
                        {totalPct.toFixed(2)} %
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              )}
            </Card>
          );
        })}
      </div>
    )}
  </section>
);

export default AssociateBeneficiariesTab;
