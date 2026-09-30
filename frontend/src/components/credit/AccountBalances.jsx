import React from 'react';
import { formatQ } from '../../utils/format';

const AccountList = ({ title, total, items, emptyText }) => (
  <section className="rounded-md border border-line">
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      <span className="text-sm text-ink-muted tabular-nums">
        Total <span className="font-medium text-ink">{formatQ(total)}</span>
      </span>
    </div>
    {items.length === 0 ? (
      <p className="px-4 py-3 text-sm text-ink-subtle">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-ink">{item.name}</span>
              <span className="font-mono text-xs text-ink-subtle">{item.number}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{formatQ(item.amount)}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

/**
 * Saldos del solicitante: cuentas bancarias vinculadas y cuentas en la cooperativa.
 *
 * @param {Object} props
 * @param {{total: number, items: Array<{key, name, number, amount}>}} props.bank
 * @param {{total: number, items: Array<{key, name, number, amount}>}} props.coop
 */
export const AccountBalances = ({ bank, coop }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <AccountList title="Cuentas bancarias" emptyText="No tiene cuentas bancarias registradas." {...bank} />
    <AccountList title="Cuentas en la cooperativa" emptyText="No tiene cuentas en la cooperativa." {...coop} />
  </div>
);

export default AccountBalances;
