import React from 'react';
import { StatCard, StatGroup } from '../../ui';

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

/**
 * Indicadores principales del panel de administración.
 *
 * @param {Object} props
 * @param {Object} props.kpis - Resultado del cálculo de KPIs de AdminDashboard.
 * @param {boolean} props.loading
 */
export const AdminKpis = ({ kpis, loading }) => {
  const show = (value) => (loading ? '—' : value);

  return (
    <StatGroup aria-busy={loading || undefined}>
      <StatCard
        label="Usuarios registrados"
        value={show(kpis.total)}
        hint={`${kpis.asociadosCount} asociados · ${kpis.operadoresCount} operadores`}
      />
      <StatCard
        label="Activos"
        value={show(kpis.activos)}
        hint={`${pct(kpis.activos, kpis.total)}% del total`}
      />
      <StatCard
        label="Bloqueados o inactivos"
        value={show(kpis.bloqueadosOInactivos)}
        hint={`${kpis.bloqueadosIntentos} por intentos fallidos · ${kpis.inactivos} desactivados`}
        hintTone={kpis.bloqueadosIntentos > 0 ? 'warning' : 'neutral'}
      />
      <StatCard
        label="Conectados ahora"
        value={show(kpis.enLinea)}
        hint="Se actualiza sin recargar la página"
      />
    </StatGroup>
  );
};

export default AdminKpis;
