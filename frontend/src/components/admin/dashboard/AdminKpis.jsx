import React from 'react';
import { Link } from 'react-router-dom';
import { StatCard, StatGroup } from '../../ui';

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const plural = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;

/**
 * Indicadores principales del panel de administración.
 *
 * @param {Object} props
 * @param {Object} props.kpis - Resultado del cálculo de KPIs de AdminDashboard.
 * @param {boolean} props.loading
 */
export const AdminKpis = ({ kpis, loading }) => {
  const show = (value) => (loading ? '—' : value);
  // Mientras carga no hay contexto que mostrar (serían ceros)
  const hint = (texto) => (loading ? undefined : texto);

  return (
    <StatGroup aria-busy={loading || undefined}>
      <StatCard
        label="Usuarios registrados"
        value={show(kpis.total)}
        hint={hint(
          [
            plural(kpis.asociadosCount, 'asociado', 'asociados'),
            plural(kpis.operadoresCount, 'operador', 'operadores'),
            plural(kpis.ejecutivosCount, 'ejecutivo', 'ejecutivos'),
            plural(kpis.adminCount, 'administrador', 'administradores'),
          ].join(' · ')
        )}
      />
      <StatCard
        label="Activos"
        value={show(kpis.activos)}
        hint={hint(`${pct(kpis.activos, kpis.total)}% del total`)}
      />
      <StatCard
        label="Bloqueados o inactivos"
        value={show(kpis.bloqueadosOInactivos)}
        hint={hint(
          <>
            {kpis.bloqueadosIntentos} por intentos fallidos · {kpis.inactivos} desactivados
            {kpis.bloqueadosIntentos > 0 && (
              <>
                {' · '}
                <Link to="/usuarios?estado=BLOQUEADO" className="font-medium underline underline-offset-2 hover:text-warning-800">
                  Ver y desbloquear
                </Link>
              </>
            )}
          </>
        )}
        hintTone={kpis.bloqueadosIntentos > 0 ? 'warning' : 'neutral'}
      />
      <StatCard
        label="Conectados ahora"
        value={show(kpis.enLinea)}
        hint={hint('Se actualiza sin recargar la página')}
      />
    </StatGroup>
  );
};

export default AdminKpis;
