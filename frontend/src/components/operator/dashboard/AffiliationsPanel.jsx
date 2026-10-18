import React from 'react';
import { Link } from 'react-router-dom';
import { FileDown, Lock, UserPlus } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, StatCard, StatGroup, Table, TBody, TD, TH, THead, TR, cn,
} from '../../ui';
import { formatDateTime, formatQ, formatRelative, horasDesde } from '../../../utils/format';

const FILTERS = [
  { id: 'TODOS', label: 'Todas', key: 'total' },
  { id: 'PENDIENTE_AGENCIA', label: 'Pendientes', key: 'pendientes' },
  { id: 'ATENDIDA', label: 'Formalizadas', key: 'atendidas' },
  { id: 'CANCELADA', label: 'Canceladas', key: 'canceladas' },
];

/** Estado visible de una solicitud, incluido quién la está atendiendo. */
const AffiliationStatus = ({ a }) => {
  const bloqueadoPorOtro = a.esta_bloqueado && !a.bloqueado_por_mi;
  if (a.estado === 'ATENDIDA') {
    return (
      <div>
        <Badge tone="success">Formalizada</Badge>
        {a.fecha_resolucion && <div className="mt-1 text-xs text-ink-subtle">{formatDateTime(a.fecha_resolucion)}</div>}
      </div>
    );
  }
  if (a.estado === 'CANCELADA') {
    return (
      <div title={a.observaciones ? `Motivo: ${a.observaciones}` : undefined}>
        <Badge tone="danger">Cancelada</Badge>
        {a.fecha_resolucion && <div className="mt-1 text-xs text-ink-subtle">{formatDateTime(a.fecha_resolucion)}</div>}
      </div>
    );
  }
  if (bloqueadoPorOtro) {
    return (
      <span title={`Caso tomado por ${a.operador_bloqueo_nombre} (${a.operador_bloqueo_codigo})`}>
        <Badge tone="warning">
          <Lock className="w-3 h-3" aria-hidden="true" />
          Lo atiende {a.operador_bloqueo_codigo || 'otro operador'}
        </Badge>
      </span>
    );
  }
  if (a.bloqueado_por_mi) return <Badge tone="brand" dot>La atiende usted</Badge>;
  if (a.es_propia) return <Badge>Su solicitud</Badge>;
  return <Badge dot>Disponible</Badge>;
};

const esDeHoy = (fecha) => fecha && new Date(fecha).toDateString() === new Date().toDateString();

/**
 * Resumen de la bandeja: quién espera desde hace más tiempo, los casos que atiende el operador y lo formalizado hoy.
 *
 * @param {Object[]} todas - Las solicitudes cargadas, sin el filtro de estado (si se buscó, el servidor ya las filtró).
 */
const AffiliationsSummary = ({ todas }) => {
  const pendientes = todas.filter((a) => a.estado === 'PENDIENTE_AGENCIA');
  const masAntigua = pendientes.reduce(
    (min, a) => (!min || new Date(a.fecha_solicitud) < new Date(min.fecha_solicitud) ? a : min),
    null
  );
  const atiendeUsted = todas.filter((a) => a.bloqueado_por_mi && a.estado === 'PENDIENTE_AGENCIA').length;
  const formalizadasHoy = todas.filter((a) => a.estado === 'ATENDIDA' && esDeHoy(a.fecha_resolucion)).length;
  const esperaLarga = masAntigua && horasDesde(masAntigua.fecha_solicitud) > 24;

  return (
    <StatGroup columns={3}>
      <StatCard
        label="En espera desde"
        value={masAntigua ? formatRelative(masAntigua.fecha_solicitud) : '—'}
        hint={masAntigua ? `${masAntigua.numero_caso}${esperaLarga ? ' · más de un día esperando' : ''}` : 'No hay pendientes'}
        hintTone={esperaLarga ? 'warning' : 'neutral'}
      />
      <StatCard
        label="Las atiende usted"
        value={atiendeUsted}
        hint={atiendeUsted > 0 ? 'Termínelas o libérelas para un colega' : 'Ningún caso tomado'}
      />
      <StatCard label="Formalizadas hoy" value={formalizadasHoy} hint="Afiliaciones terminadas en agencia" />
    </StatGroup>
  );
};

/**
 * Pestaña de solicitudes de afiliación para atención en agencia.
 *
 * @param {Object} props
 * @param {Object[]} props.afiliaciones - Las solicitudes que se muestran (con filtro y búsqueda).
 * @param {Object[]} props.todas - Las solicitudes cargadas sin el filtro de estado, para el resumen.
 */
export const AffiliationsPanel = ({
  afiliaciones,
  todas,
  loading,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  lockingCaso,
  onAttend,
  onDownloadReceipt,
}) => {
  // Un estado vacío por motivo: búsqueda, filtro o bandeja sin solicitudes, cada uno con su acción
  const vacio = search
    ? {
        title: 'Sin resultados',
        description: 'Revise el número de caso, DPI, nombre o correo.',
        action: <Button variant="secondary" onClick={() => onSearchChange('')}>Limpiar búsqueda</Button>,
      }
    : filter !== 'TODOS'
    ? {
        title: 'No hay solicitudes en este estado',
        description: 'Cambie el filtro para ver las demás.',
        action: <Button variant="secondary" onClick={() => onFilterChange('TODOS')}>Ver todas</Button>,
      }
    : {
        title: 'No hay afiliaciones por atender',
        description:
          'Aquí llegan las personas que pidieron afiliarse en línea para terminar en agencia. Si alguien está en ventanilla sin solicitud, afílielo desde Asociados.',
        action: <Button as={Link} to="/asociados" variant="secondary">Ir a Asociados</Button>,
      };

  return (
    <div className="space-y-4">
      {!loading && todas.length > 0 && <AffiliationsSummary todas={todas} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  active
                    ? 'border-brand-700 bg-brand-50 font-medium text-brand-800'
                    : 'border-line-strong bg-white text-ink-soft hover:bg-surface-muted'
                )}
              >
                {f.label}
                <span className="text-xs tabular-nums text-ink-subtle">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <SearchInput
          value={search}
          onChange={onSearchChange}
          label="Buscar solicitudes de afiliación"
          placeholder="Caso, DPI, nombre o correo"
          className="w-full lg:max-w-sm"
        />
      </div>

      {loading ? (
        <LoadingState label="Cargando solicitudes…" />
      ) : afiliaciones.length === 0 ? (
        <EmptyState icon={UserPlus} title={vacio.title} description={vacio.description} action={vacio.action} />
      ) : (
        <Table caption="Solicitudes de afiliación">
          <THead>
            <TR>
              <TH>Caso</TH>
              <TH>Solicitante</TH>
              <TH>Contacto</TH>
              <TH numeric>Monto estimado</TH>
              <TH>Estado</TH>
              <TH sticky><span className="sr-only">Acciones</span></TH>
            </TR>
          </THead>
          <TBody>
            {afiliaciones.map((a) => {
              const bloqueadoPorOtro = a.esta_bloqueado && !a.bloqueado_por_mi;
              const bloqueadoPorMi = a.bloqueado_por_mi;
              return (
                <TR
                  key={a.id_solicitud}
                  interactive
                  highlight={bloqueadoPorMi ? 'brand' : bloqueadoPorOtro ? 'warning' : 'none'}
                >
                  <TD className="whitespace-nowrap">
                    <div className="font-mono text-ink">{a.numero_caso}</div>
                    <div className="text-xs text-ink-subtle" title={formatDateTime(a.fecha_solicitud)}>
                      Recibida {formatRelative(a.fecha_solicitud)}
                    </div>
                  </TD>
                  <TD className="min-w-[12rem]">
                    <div className="font-medium text-ink">
                      {a.nombre_completo || `${a.primer_nombre} ${a.primer_apellido}`}
                    </div>
                    <div className="font-mono text-xs text-ink-subtle">DPI {a.cui_dpi}</div>
                  </TD>
                  <TD className="max-w-[13rem] text-xs">
                    {a.email && <div className="truncate" title={a.email}>{a.email}</div>}
                    {a.telefono && <div className="font-mono">{a.telefono}</div>}
                    {a.direccion && <div className="truncate text-ink-subtle" title={a.direccion}>{a.direccion}</div>}
                  </TD>
                  <TD numeric className="text-ink">{formatQ(a.monto_estimado || 100.0)}</TD>
                  <TD className="whitespace-nowrap"><AffiliationStatus a={a} /></TD>
                  <TD sticky className="whitespace-nowrap text-center">
                    {a.estado === 'ATENDIDA' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={FileDown}
                        onClick={() => onDownloadReceipt(a)}
                        title="Descargar el comprobante de apertura en PDF"
                      >
                        Comprobante
                      </Button>
                    ) : a.estado === 'CANCELADA' ? (
                      <span className="text-ink-subtle" aria-label="Sin acciones">—</span>
                    ) : a.es_propia ? (
                      <span className="text-xs text-ink-subtle">La atiende un colega</span>
                    ) : bloqueadoPorOtro ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Lock}
                        disabled
                        title={`Este caso lo atiende ${a.operador_bloqueo_nombre} (${a.operador_bloqueo_codigo})`}
                      >
                        Bloqueado
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onAttend(a)} disabled={lockingCaso}>
                        {bloqueadoPorMi ? 'Continuar' : 'Atender'}
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
};

export default AffiliationsPanel;
