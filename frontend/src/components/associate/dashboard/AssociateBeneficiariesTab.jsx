import React from 'react';
import { RefreshCw, UserPlus, Users2 } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, EmptyState, LoadingState, ProgressBar, Table, TBody, TD, TH, THead, TR,
} from '../../ui';
import { formatQ } from '../../../utils/format';
import { parentescoLabel } from '../../../utils/parentesco';
import { beneficiariosCompletos, porcentajeAsignado } from './beneficiarios';

/**
 * Pestaña de beneficiarios: quién recibe los fondos de cada cuenta.
 * La suma de porcentajes por cuenta debe ser 100 %.
 */
export const AssociateBeneficiariesTab = ({
  fetchMisBeneficiarios,
  loadingBeneficiarios,
  misBeneficiariosData,
  openEditarBeneficiariosModal,
  setActiveTab,
}) => {
  const completas = misBeneficiariosData.filter(beneficiariosCompletos).length;
  const total = misBeneficiariosData.length;

  return (
    <section aria-labelledby="beneficiarios-titulo" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="beneficiarios-titulo" className="text-base font-semibold text-ink">Beneficiarios</h2>
          <p className="max-w-2xl text-sm text-ink-muted">
            Las personas que recibirán los fondos de cada cuenta. En cada cuenta, los porcentajes deben sumar 100&nbsp;%.
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

      {!loadingBeneficiarios && total > 0 && (
        <Card className="space-y-2 px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-muted">Cuentas con beneficiarios completos</span>
            <span className="font-medium text-ink tabular-nums">{completas} de {total}</span>
          </div>
          <ProgressBar value={completas} max={total} tone={completas === total ? 'success' : 'warning'} />
          {completas < total && (
            <p className="text-sm text-ink-muted">
              Si falta designarlos, los fondos de esa cuenta no tienen a quién entregarse.
            </p>
          )}
        </Card>
      )}

      {loadingBeneficiarios ? (
        <Card><LoadingState label="Cargando beneficiarios…" /></Card>
      ) : misBeneficiariosData.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users2}
            title="No tiene cuentas para asignar beneficiarios"
            description="Cuando abra una cuenta en la cooperativa, podrá designar aquí a sus beneficiarios. Puede abrir una con un traslado."
            action={<Button variant="secondary" onClick={() => setActiveTab('planilla')}>Ir a traslados</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {misBeneficiariosData.map((cuenta) => {
            const totalPct = porcentajeAsignado(cuenta);
            const isComplete = beneficiariosCompletos(cuenta);
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
                      {hasBeneficiaries ? (
                        <Badge tone={isComplete ? 'success' : 'warning'}>
                          {isComplete ? '100 % asignado' : `${totalPct.toFixed(2)} % asignado`}
                        </Badge>
                      ) : (
                        <Badge tone="warning">Sin asignar</Badge>
                      )}
                      {hasBeneficiaries && (
                        <Button size="sm" onClick={() => openEditarBeneficiariosModal(cuenta)}>
                          Gestionar beneficiarios
                        </Button>
                      )}
                    </>
                  }
                />

                {!hasBeneficiaries ? (
                  <EmptyState
                    title="Sin beneficiarios"
                    description={'Designe quién recibe los fondos de esta cuenta. Los porcentajes deben sumar 100\u00a0%.'}
                    action={
                      <Button size="sm" icon={UserPlus} onClick={() => openEditarBeneficiariosModal(cuenta)}>
                        Agregar beneficiarios
                      </Button>
                    }
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
                          <TD>{parentescoLabel(b.parentesco)}</TD>
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
};

export default AssociateBeneficiariesTab;
