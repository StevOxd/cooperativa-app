import React from 'react';
import { FileDown, Wallet } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../../ui';
import { formatQ, humanize } from '../../../utils/format';

const ACCOUNT_STATES = {
  ACTIVA: { label: 'Activa', tone: 'success' },
  INACTIVA: { label: 'Inactiva', tone: 'neutral' },
  BLOQUEADA: { label: 'Bloqueada', tone: 'danger' },
};

const accountStatus = (estado) => ACCOUNT_STATES[estado] || { label: humanize(estado), tone: 'neutral' };

/**
 * Pestaña "Resumen": total ahorrado y cuentas del asociado.
 */
export const AssociateSummaryTab = ({
  activeCreditosCount,
  activeCuentasCount,
  cuentas,
  downloadingAccountId,
  generatingPdf,
  handleDownloadPdf,
  openMovimientosModal,
  setActiveTab,
  totalAhorrado,
}) => (
  <div className="space-y-8">
    {/* El total es la cifra principal del portal */}
    <Card aria-labelledby="total-ahorros" className="px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="total-ahorros" className="text-sm text-ink-muted">Total en sus cuentas</h2>
          <p className="mt-1 text-4xl font-semibold text-ink tabular-nums">{formatQ(totalAhorrado)}</p>
        </div>
        <dl className="flex gap-10 text-sm">
          <div>
            <dt className="text-ink-muted">Cuentas activas</dt>
            <dd className="mt-0.5 text-lg font-medium text-ink tabular-nums">{activeCuentasCount}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Créditos en curso</dt>
            <dd className="mt-0.5 text-lg font-medium text-ink tabular-nums">{activeCreditosCount}</dd>
          </div>
        </dl>
      </div>
    </Card>

    <section aria-labelledby="mis-cuentas" className="space-y-3">
      <h2 id="mis-cuentas" className="text-base font-semibold text-ink">Mis cuentas</h2>

      {cuentas.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Todavía no tiene cuentas en la cooperativa"
            description="Su depósito inicial está en su cuenta bancaria vinculada. Solicite un traslado para abrir una cuenta de ahorro, plazo fijo o metas."
            action={<Button onClick={() => setActiveTab('planilla')}>Ir a traslados</Button>}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) => {
            const status = accountStatus(c.estado);
            const downloading = generatingPdf && downloadingAccountId === c.id_cuenta;
            return (
              <li key={c.id_cuenta}>
                <Card as="article" className="flex h-full flex-col">
                  <div className="flex-1 px-5 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-ink">{c.tipo_cuenta}</h3>
                        <p className="font-mono text-xs text-ink-subtle">{c.numero_cuenta}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-5 text-xs text-ink-muted">Saldo disponible</p>
                    <p className="text-2xl font-semibold text-ink tabular-nums">{formatQ(c.saldo_disponible)}</p>
                    {parseFloat(c.saldo_reserva) > 0 && (
                      <p className="mt-1 text-xs text-ink-subtle tabular-nums">En reserva: {formatQ(c.saldo_reserva)}</p>
                    )}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={FileDown}
                      loading={downloading}
                      onClick={() => handleDownloadPdf(c)}
                      title="Descargar el estado de cuenta en PDF"
                    >
                      Estado de cuenta
                    </Button>
                    <Button size="sm" variant="link" className="px-2" onClick={() => openMovimientosModal(c)}>
                      Ver movimientos
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  </div>
);

export default AssociateSummaryTab;
