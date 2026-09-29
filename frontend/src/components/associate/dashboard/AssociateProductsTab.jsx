import React from 'react';
import { Card } from '../../ui';
import { formatQ } from '../../../utils/format';

/** Los beneficios pueden llegar como lista o como texto. */
const Benefits = ({ value }) => {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-4 text-sm text-ink-soft marker:text-ink-subtle">
        {value.map((b) => <li key={b}>{b}</li>)}
      </ul>
    );
  }
  return <p className="text-sm text-ink-soft">{value}</p>;
};

/**
 * Pestaña de productos: tasas y requisitos de apertura de cada tipo de cuenta.
 */
export const AssociateProductsTab = ({ catalogoProductos }) => (
  <section aria-labelledby="productos-titulo" className="space-y-4">
    <div>
      <h2 id="productos-titulo" className="text-base font-semibold text-ink">Productos</h2>
      <p className="text-sm text-ink-muted">Tasas y montos de apertura de nuestras cuentas.</p>
    </div>

    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {catalogoProductos.map((p) => (
        <li key={p.id_tipo_cuenta}>
          <Card as="article" className="flex h-full flex-col">
            <div className="flex-1 space-y-4 px-5 py-5">
              <div>
                <h3 className="text-base font-semibold text-ink">{p.nombre}</h3>
                {p.descripcion && <p className="mt-1 text-sm text-ink-muted">{p.descripcion}</p>}
              </div>
              <p>
                <span className="text-3xl font-semibold text-ink tabular-nums">{p.tasa_interes_anual}%</span>
                <span className="ml-1.5 text-sm text-ink-muted">tasa anual</span>
              </p>
              <Benefits value={p.beneficios} />
            </div>
            <div className="border-t border-line px-5 py-3 text-sm text-ink-muted">
              Apertura desde <span className="font-medium text-ink tabular-nums">{formatQ(p.monto_minimo_apertura)}</span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  </section>
);

export default AssociateProductsTab;
