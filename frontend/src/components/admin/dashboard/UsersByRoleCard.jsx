import React, { useMemo } from 'react';
import { Card, CardBody, CardHeader } from '../../ui';
import { ROLE_LABELS } from '../../layout/navigation';

const ROLE_ORDER = ['ASOCIADO', 'OPERADOR', 'EJECUTIVO', 'ADMINISTRADOR'];

/**
 * Usuarios por rol como barras horizontales de un solo color con la cifra
 * escrita: con un rol mucho mayor que los demás, una dona no se puede leer.
 *
 * @param {Object} props
 * @param {Array} props.users
 */
export const UsersByRoleCard = ({ users }) => {
  const rows = useMemo(() => {
    const total = users.length;
    const max = Math.max(1, ...ROLE_ORDER.map((rol) => users.filter((u) => u.rol === rol).length));
    return ROLE_ORDER.map((rol) => {
      const count = users.filter((u) => u.rol === rol).length;
      return {
        rol,
        label: ROLE_LABELS[rol],
        count,
        share: total > 0 ? Math.round((count / total) * 100) : 0,
        width: (count / max) * 100,
      };
    });
  }, [users]);

  return (
    <Card className="h-full">
      <CardHeader title="Usuarios por rol" description={`${users.length} en total`} />
      <CardBody>
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.rol}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-soft">{row.label}</span>
                <span className="tabular-nums">
                  <span className="font-medium text-ink">{row.count}</span>
                  <span className="ml-1.5 text-xs text-ink-subtle">{row.share}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-sm bg-surface-sunken" aria-hidden="true">
                <div
                  className="h-2 rounded-sm bg-brand-700"
                  style={{ width: `${row.width}%`, minWidth: row.count > 0 ? '4px' : 0 }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
};

export default UsersByRoleCard;
