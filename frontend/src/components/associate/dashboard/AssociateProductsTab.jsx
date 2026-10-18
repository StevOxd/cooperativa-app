import React from 'react';
import { Package, RefreshCw, Send } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '../../ui';
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
 * Pestaña de productos: tasas y requisitos de apertura de cada tipo de cuenta, cuáles ya tiene y, de los que
 * puede abrir, un acceso al traslado de apertura.
 *
 * @param {Object} props
 * @param {Object[]} props.catalogoProductos - Tipos de cuenta (`/catalogo/tipos-cuenta`).
 * @param {Object[]} props.cuentas - Sus cuentas en la cooperativa (`tipo_cuenta` es el nombre del tipo).
 * @param {number[]} props.tiposParaAbrir - Tipos que puede abrir con un traslado (`mis-cuentas-destino`).
 * @param {Object|null} props.cuentaPlanilla - Sin cuenta de planilla no se puede solicitar el traslado.
 * @param {Function} props.abrirTrasladoHacia - Abre el traslado con el destino "APERTURA:<id>".
 * @param {Function} props.fetchData - Vuelve a cargar el portal.
 */
export const AssociateProductsTab = ({ abrirTrasladoHacia, catalogoProductos, cuentaPlanilla, cuentas, fetchData, tiposParaAbrir }) => {
  // Una cuenta inactiva o bloqueada no cuenta como producto que ya tiene (se puede volver a abrir)
  const tiposPropios = new Set(cuentas.filter((c) => c.estado === 'ACTIVA').map((c) => c.tipo_cuenta));
  const tiene = catalogoProductos.filter((p) => tiposPropios.has(p.nombre)).length;

  if (catalogoProductos.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Package}
          title="No pudimos cargar los productos"
          description="Actualice para intentarlo de nuevo."
          action={<Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Actualizar</Button>}
        />
      </Card>
    );
  }

  return (
    <section aria-labelledby="productos-titulo" className="space-y-4">
      <div>
        <h2 id="productos-titulo" className="text-base font-semibold text-ink">Productos</h2>
        <p className="text-sm text-ink-muted">
          Tiene <span className="font-medium text-ink tabular-nums">{tiene} de {catalogoProductos.length}</span> productos.
          Para abrir otro, solicite un traslado desde su cuenta de planilla.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {catalogoProductos.map((p) => {
          const loTiene = tiposPropios.has(p.nombre);
          const puedeAbrir = !loTiene && cuentaPlanilla && tiposParaAbrir.includes(p.id_tipo_cuenta);
          return (
            <li key={p.id_tipo_cuenta}>
              <Card as="article" className="flex h-full flex-col">
                <div className="flex-1 space-y-4 px-5 py-5">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-ink">{p.nombre}</h3>
                      {loTiene && <Badge tone="success">Ya la tiene</Badge>}
                    </div>
                    {p.descripcion && <p className="mt-1 text-sm text-ink-muted">{p.descripcion}</p>}
                  </div>
                  <p>
                    <span className="text-3xl font-semibold text-ink tabular-nums">{p.tasa_interes_anual}%</span>
                    <span className="ml-1.5 text-sm text-ink-muted">tasa anual</span>
                  </p>
                  <Benefits value={p.beneficios} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-sm text-ink-muted">
                  <span>
                    Apertura desde <span className="font-medium text-ink tabular-nums">{formatQ(p.monto_minimo_apertura)}</span>
                  </span>
                  {puedeAbrir && (
                    <Button size="sm" variant="link" icon={Send} className="px-0" onClick={() => abrirTrasladoHacia(`APERTURA:${p.id_tipo_cuenta}`)}>
                      Abrir con un traslado
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default AssociateProductsTab;
