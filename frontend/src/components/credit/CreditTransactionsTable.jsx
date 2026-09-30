import React from 'react';
import { Activity } from 'lucide-react';
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR, cn } from '../ui';
import { formatDateTime, formatQ, humanize } from '../../utils/format';

const isIngreso = (tx) => (tx.tipo_movimiento || tx.tipo) === 'CREDITO';

/**
 * Movimientos recientes del solicitante (bancarios y de la cooperativa).
 * Las columnas de cuenta y saldo aparecen solo si los datos las traen.
 *
 * @param {Object} props
 * @param {Array} props.transactions
 */
export const CreditTransactionsTable = ({ transactions = [] }) => {
  if (transactions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong">
        <EmptyState icon={Activity} title="Sin movimientos" description="No hay movimientos recientes registrados para este asociado." />
      </div>
    );
  }

  const showAccount = transactions.some((tx) => tx.cuenta_numero);
  const showBalance = transactions.some((tx) => tx.saldo_resultante !== undefined && tx.saldo_resultante !== null);

  return (
    <Table caption="Movimientos recientes del solicitante" className="max-h-80 overflow-y-auto">
      <THead>
        <TR>
          <TH>Fecha</TH>
          <TH>Origen</TH>
          {showAccount && <TH>Cuenta</TH>}
          <TH>Tipo</TH>
          <TH numeric>Monto</TH>
          {showBalance && <TH numeric>Saldo</TH>}
          <TH>Descripción</TH>
        </TR>
      </THead>
      <TBody>
        {transactions.map((tx, idx) => {
          const ingreso = isIngreso(tx);
          return (
            <TR key={idx}>
              <TD className="whitespace-nowrap text-xs">{formatDateTime(tx.fecha)}</TD>
              <TD className="whitespace-nowrap">{tx.origen === 'BANCO' ? 'Banco' : humanize(tx.origen) || '—'}</TD>
              {showAccount && <TD className="whitespace-nowrap font-mono text-xs">{tx.cuenta_numero || '—'}</TD>}
              <TD>
                <Badge tone={ingreso ? 'success' : 'neutral'}>{ingreso ? 'Ingreso' : 'Egreso'}</Badge>
              </TD>
              <TD numeric className={cn('font-medium', ingreso ? 'text-success-700' : 'text-ink')}>
                {ingreso ? '+' : '−'}
                {formatQ(tx.monto)}
              </TD>
              {showBalance && <TD numeric className="text-ink-muted">{formatQ(tx.saldo_resultante || 0)}</TD>}
              <TD className="min-w-[12rem] max-w-xs text-xs">
                <span className="line-clamp-2" title={tx.descripcion}>{tx.descripcion || '—'}</span>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
};

export default CreditTransactionsTable;
