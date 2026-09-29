import React from 'react';
import { FileDown, Lock, UserPlus } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, Table, TBody, TD, TH, THead, TR, cn,
} from '../../ui';
import { formatDate, formatDateTime, formatQ } from '../../../utils/format';

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
  return <Badge dot>Disponible</Badge>;
};

/**
 * Pestaña de solicitudes de afiliación para atención en agencia.
 */
export const AffiliationsPanel = ({
  afiliaciones,
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
  const emptyTitle = search
    ? 'Sin resultados'
    : filter !== 'TODOS'
    ? 'No hay solicitudes en este estado'
    : 'No hay solicitudes de afiliación';
  const emptyDescription = search
    ? 'Revise el número de caso, DPI, nombre o correo.'
    : 'Las solicitudes en línea para atención en agencia aparecerán aquí.';

  return (
    <div className="space-y-4">
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
        <EmptyState icon={UserPlus} title={emptyTitle} description={emptyDescription} />
      ) : (
        <Table caption="Solicitudes de afiliación">
          <THead>
            <TR>
              <TH>Caso</TH>
              <TH>Solicitante</TH>
              <TH>DPI</TH>
              <TH>Contacto</TH>
              <TH numeric>Monto estimado</TH>
              <TH>Recibida</TH>
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
                  <TD className="whitespace-nowrap font-mono text-ink">{a.numero_caso}</TD>
                  <TD className="min-w-[12rem]">
                    <div className="font-medium text-ink">
                      {a.nombre_completo || `${a.primer_nombre} ${a.primer_apellido}`}
                    </div>
                    {a.fecha_nacimiento && (
                      <div className="text-xs text-ink-subtle">Nacimiento: {formatDate(a.fecha_nacimiento)}</div>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap font-mono">{a.cui_dpi}</TD>
                  <TD className="max-w-[14rem] text-xs">
                    {a.email && <div className="truncate" title={a.email}>{a.email}</div>}
                    {a.telefono && <div className="font-mono">{a.telefono}</div>}
                    {a.direccion && <div className="truncate text-ink-subtle" title={a.direccion}>{a.direccion}</div>}
                  </TD>
                  <TD numeric className="text-ink">{formatQ(a.monto_estimado || 100.0)}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(a.fecha_solicitud)}</TD>
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
