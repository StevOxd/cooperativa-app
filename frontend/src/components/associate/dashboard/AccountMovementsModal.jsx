import React from 'react';
import { Activity, FileDown } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingState, Modal, Table, TBody, TD, TH, THead, TR, cn } from '../../ui';
import { formatDateTime, formatQ, humanize } from '../../../utils/format';

/**
 * Movimientos de una cuenta del asociado, con descarga del estado de cuenta en PDF.
 */
export const AccountMovementsModal = ({
  generatingPdf,
  handleDownloadPdf,
  isModalOpen,
  loadingTx,
  selectedCuenta,
  setIsModalOpen,
  setTransactions,
  transactions,
}) => {
  if (!isModalOpen || !selectedCuenta) return null;

  const close = () => {
    setIsModalOpen(false);
    setTransactions([]);
  };

  return (
    <Modal
      isOpen
      onClose={close}
      lockScroll={false}
      size="xl"
      title={`Movimientos de ${selectedCuenta.tipo_cuenta}`}
      description={<span className="font-mono">{selectedCuenta.numero_cuenta}</span>}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cerrar
          </Button>
          <Button
            icon={FileDown}
            onClick={() => handleDownloadPdf(selectedCuenta, transactions)}
            loading={generatingPdf}
            loadingText="Generando PDF…"
          >
            Descargar estado de cuenta
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-xs text-ink-muted">Saldo disponible</dt>
            <dd className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{formatQ(selectedCuenta.saldo_disponible)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">En reserva</dt>
            <dd className="mt-0.5 text-lg text-ink-soft tabular-nums">{formatQ(selectedCuenta.saldo_reserva)}</dd>
          </div>
          {selectedCuenta.tasa_interes_anual !== undefined && selectedCuenta.tasa_interes_anual !== null && (
            <div>
              <dt className="text-xs text-ink-muted">Tasa anual</dt>
              <dd className="mt-0.5 text-lg text-ink-soft tabular-nums">{selectedCuenta.tasa_interes_anual}%</dd>
            </div>
          )}
        </dl>

        {loadingTx ? (
          <LoadingState label="Consultando movimientos…" />
        ) : transactions.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong">
            <EmptyState icon={Activity} title="Sin movimientos" description="Esta cuenta todavía no tiene movimientos registrados." />
          </div>
        ) : (
          <Table caption={`Movimientos de la cuenta ${selectedCuenta.numero_cuenta}`} className="max-h-96 overflow-y-auto">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Tipo</TH>
                <TH>Referencia</TH>
                <TH numeric>Monto</TH>
                <TH numeric>Saldo</TH>
              </TR>
            </THead>
            <TBody>
              {transactions.map((t) => {
                const isCredit = ['DEPOSITO', 'PAGO_CREDITO'].includes(t.tipo_transaccion);
                return (
                  <TR key={t.id_transaccion}>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(t.fecha_transaccion)}</TD>
                    <TD>
                      <Badge tone={isCredit ? 'success' : 'neutral'}>{humanize(t.tipo_transaccion)}</Badge>
                    </TD>
                    <TD className="min-w-[10rem] text-xs">{t.referencia || '—'}</TD>
                    <TD numeric className={cn('font-medium', isCredit ? 'text-success-700' : 'text-ink')}>
                      {isCredit ? '+' : '−'}
                      {formatQ(t.monto)}
                    </TD>
                    <TD numeric className="text-ink-muted">{formatQ(t.saldo_nuevo)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </Modal>
  );
};

export default AccountMovementsModal;
