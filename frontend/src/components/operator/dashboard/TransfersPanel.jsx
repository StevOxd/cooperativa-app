import React from 'react';
import { ArrowLeftRight, History, Search } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, Select, StatCard, StatGroup, Table, TabPanel, Tabs, TBody, TD, TH,
  THead, TR,
} from '../../ui';
import { formatDate, formatDateTime, formatQ, formatRelative } from '../../../utils/format';
import { transferOperation, transferStatus } from './status';

const SUBTABS_ID = 'traslados';

/** Resumen de los pendientes: cuánto dinero espera dictamen, cuántas son aperturas y desde cuándo esperan. */
const PendingSummary = ({ solicitudes }) => {
  const monto = solicitudes.reduce((sum, s) => sum + (parseFloat(s.monto) || 0), 0);
  const aperturas = solicitudes.filter((s) => s.tipo_operacion === 'APERTURA_Y_TRASLADO').length;
  const masAntigua = solicitudes.reduce(
    (min, s) => (!min || new Date(s.fecha_solicitud) < new Date(min.fecha_solicitud) ? s : min),
    null
  );
  const sinSaldo = solicitudes.filter((s) => parseFloat(s.monto) > parseFloat(s.cuenta_origen_saldo)).length;
  return (
    <StatGroup columns={3}>
      <StatCard
        label="Monto por resolver"
        value={formatQ(monto)}
        hint={sinSaldo > 0 ? `${sinSaldo} sin saldo suficiente en el origen` : 'El saldo se confirma con el banco al aprobar'}
        hintTone={sinSaldo > 0 ? 'warning' : 'neutral'}
      />
      <StatCard label="Aperturas de cuenta" value={aperturas} hint={`${solicitudes.length - aperturas} traslados directos`} />
      <StatCard
        label="En espera desde"
        value={masAntigua ? formatRelative(masAntigua.fecha_solicitud) : '—'}
        hint={masAntigua?.numero_caso}
      />
    </StatGroup>
  );
};

/** Bandeja de traslados y aperturas pendientes de dictamen. */
const PendingTransfers = ({ solicitudes, loading, onResolve, onVerHistorial }) => {
  if (loading) return <LoadingState label="Cargando traslados…" />;
  if (solicitudes.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No hay traslados por resolver"
        description="Los asociados los piden desde su portal. Para revisar uno ya resuelto, busque al asociado en el historial."
        action={<Button variant="secondary" icon={History} onClick={onVerHistorial}>Ver historial</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PendingSummary solicitudes={solicitudes} />
      <Table caption="Traslados y aperturas pendientes">
        <THead>
          <TR>
            <TH>Caso</TH>
            <TH>Asociado</TH>
            <TH>Operación</TH>
            <TH>Cuenta de origen</TH>
            <TH>Recibida</TH>
            <TH numeric>Monto</TH>
            <TH sticky><span className="sr-only">Acciones</span></TH>
          </TR>
        </THead>
        <TBody>
          {solicitudes.map((s) => (
            <TR key={s.id_solicitud} interactive>
              <TD className="whitespace-nowrap font-mono text-ink">{s.numero_caso}</TD>
              <TD className="whitespace-nowrap">
                <div className="font-medium text-ink">{s.primer_nombre} {s.primer_apellido}</div>
                <div className="text-xs text-ink-subtle">Asociado {s.id_asociado}</div>
              </TD>
              <TD className="min-w-[12rem]">
                <div className="text-ink">{transferOperation(s.tipo_operacion)}</div>
                <div className="text-xs text-ink-subtle">
                  {s.tipo_cuenta_destino_nombre}
                  {s.cuenta_destino_numero && <> · <span className="font-mono">{s.cuenta_destino_numero}</span></>}
                </div>
              </TD>
              <TD className="whitespace-nowrap">
                <div className="font-mono">{s.cuenta_origen_numero}</div>
                <div className="text-xs text-ink-subtle tabular-nums">Saldo {formatQ(s.cuenta_origen_saldo)}</div>
                {parseFloat(s.monto) > parseFloat(s.cuenta_origen_saldo) && (
                  <Badge tone="danger" className="mt-1">Saldo insuficiente</Badge>
                )}
              </TD>
              <TD className="whitespace-nowrap text-xs">
                <span title={formatDateTime(s.fecha_solicitud)}>{formatRelative(s.fecha_solicitud)}</span>
              </TD>
              <TD numeric className="font-medium text-ink">{formatQ(s.monto)}</TD>
              <TD sticky className="whitespace-nowrap text-center">
                <div className="flex justify-center gap-2">
                  <Button size="sm" onClick={() => onResolve(s, 'APROBAR')}>Aprobar</Button>
                  <Button size="sm" variant="secondaryDanger" onClick={() => onResolve(s, 'RECHAZAR')}>
                    Rechazar
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
};

/** Buscador del historial de traslados por asociado. */
const TransferHistory = ({ historial, loading, search, onSearchChange, estado, onEstadoChange, onSearch }) => (
  <div className="space-y-4">
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(search, estado);
      }}
    >
      <SearchInput
        value={search}
        onChange={onSearchChange}
        onClear={() => {
          onSearchChange('');
          onSearch('', estado);
        }}
        label="Buscar en el historial de traslados"
        placeholder="Nombre, DPI, caso o número de cuenta"
        className="w-full sm:max-w-sm"
      />
      <div className="sm:w-48">
        <Select
          value={estado}
          onChange={(e) => {
            onEstadoChange(e.target.value);
            onSearch(search, e.target.value);
          }}
          aria-label="Filtrar por estado"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="APROBADO">Aprobados</option>
          <option value="RECHAZADO">Rechazados</option>
        </Select>
      </div>
      <Button type="submit" variant="secondary" icon={Search} disabled={loading}>Buscar</Button>
    </form>

    {loading ? (
      <LoadingState label="Buscando traslados…" />
    ) : historial.length === 0 ? (
      <EmptyState
        icon={History}
        title={search ? 'Sin resultados' : estado !== 'TODOS' ? 'No hay traslados en este estado' : 'Aún no hay traslados'}
        description={
          search
            ? 'No hay traslados que coincidan con la búsqueda.'
            : estado !== 'TODOS'
            ? 'Cambie el estado para ver los demás.'
            : 'Cuando los asociados pidan traslados y se resuelvan, quedarán aquí.'
        }
        action={
          search ? (
            <Button
              variant="secondary"
              onClick={() => {
                onSearchChange('');
                onSearch('', estado);
              }}
            >
              Limpiar búsqueda
            </Button>
          ) : (
            estado !== 'TODOS' && (
              <Button
                variant="secondary"
                onClick={() => {
                  onEstadoChange('TODOS');
                  onSearch('', 'TODOS');
                }}
              >
                Ver todos
              </Button>
            )
          )
        }
      />
    ) : (
      <Table caption="Historial de traslados">
        <THead>
          <TR>
            <TH>Caso</TH>
            <TH>Asociado</TH>
            <TH>DPI</TH>
            <TH>Operación</TH>
            <TH>Fechas</TH>
            <TH>Estado</TH>
            <TH>Resolución</TH>
            <TH numeric>Monto</TH>
          </TR>
        </THead>
        <TBody>
          {historial.map((h) => {
            const nombreCompleto = `${h.primer_nombre} ${h.segundo_nombre || ''} ${h.primer_apellido} ${h.segundo_apellido || ''}`.trim();
            const status = transferStatus(h.estado);
            return (
              <TR key={h.id_solicitud} interactive>
                <TD className="whitespace-nowrap font-mono text-ink">{h.numero_caso}</TD>
                <TD className="whitespace-nowrap">
                  <div className="font-medium text-ink">{nombreCompleto}</div>
                  {h.codigo_corporativo && <div className="font-mono text-xs text-ink-subtle">{h.codigo_corporativo}</div>}
                </TD>
                <TD className="whitespace-nowrap font-mono">{h.cui_dpi}</TD>
                <TD className="whitespace-nowrap">
                  <div className="text-ink">{transferOperation(h.tipo_operacion)}</div>
                  <div className="font-mono text-xs text-ink-subtle">{h.cuenta_destino_numero || h.tipo_cuenta_destino_nombre}</div>
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  <div>Solicitado: {formatDate(h.fecha_solicitud)}</div>
                  {h.fecha_resolucion && <div className="text-ink-subtle">Resuelto: {formatDate(h.fecha_resolucion)}</div>}
                </TD>
                <TD><Badge tone={status.tone}>{status.label}</Badge></TD>
                <TD className="min-w-[12rem] max-w-xs text-xs">
                  {h.operador_nombre ? (
                    <div>{h.operador_nombre} {h.operador_apellido || ''}</div>
                  ) : (
                    <div className="text-ink-subtle">—</div>
                  )}
                  {h.observaciones_operador && (
                    <div className="truncate text-ink-subtle" title={h.observaciones_operador}>{h.observaciones_operador}</div>
                  )}
                </TD>
                <TD numeric className="font-medium text-ink">{formatQ(h.monto)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    )}
  </div>
);

/**
 * Pestaña de traslados: bandeja de pendientes e historial por asociado.
 */
export const TransfersPanel = ({
  subTab,
  onSubTabChange,
  solicitudes,
  loadingTraslados,
  onResolve,
  historial,
  loadingHistorial,
  historialSearch,
  onHistorialSearchChange,
  historialEstado,
  onHistorialEstadoChange,
  onHistorialSearch,
}) => (
  <div className="space-y-4">
    <Tabs
      size="sm"
      label="Vista de traslados"
      idPrefix={SUBTABS_ID}
      value={subTab}
      onChange={onSubTabChange}
      items={[
        { id: 'pendientes', label: 'Pendientes', count: solicitudes.length, attention: solicitudes.length > 0 },
        // El historial se carga al abrir esta vista: hasta entonces no hay cifra que mostrar
        { id: 'historial', label: 'Historial', ...(historial.length > 0 && { count: historial.length }) },
      ]}
    />
    <TabPanel id={subTab} idPrefix={SUBTABS_ID}>
      {subTab === 'pendientes' ? (
        <PendingTransfers
          solicitudes={solicitudes}
          loading={loadingTraslados}
          onResolve={onResolve}
          onVerHistorial={() => onSubTabChange('historial')}
        />
      ) : (
        <TransferHistory
          historial={historial}
          loading={loadingHistorial}
          search={historialSearch}
          onSearchChange={onHistorialSearchChange}
          estado={historialEstado}
          onEstadoChange={onHistorialEstadoChange}
          onSearch={onHistorialSearch}
        />
      )}
    </TabPanel>
  </div>
);

export default TransfersPanel;
