import React from 'react';
import { ArrowLeftRight, History, Search } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, Select, Table, TabPanel, Tabs, TBody, TD, TH, THead, TR,
} from '../../ui';
import { formatDate, formatDateTime, formatQ } from '../../../utils/format';
import { transferOperation, transferStatus } from './status';

const SUBTABS_ID = 'traslados';

/** Bandeja de traslados y aperturas pendientes de dictamen. */
const PendingTransfers = ({ solicitudes, loading, onResolve }) => {
  if (loading) return <LoadingState label="Cargando traslados…" />;
  if (solicitudes.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No hay traslados pendientes"
        description="Cuando un asociado solicite un traslado o una apertura de cuenta, aparecerá aquí."
      />
    );
  }

  return (
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
            </TD>
            <TD className="whitespace-nowrap text-xs">{formatDateTime(s.fecha_solicitud)}</TD>
            <TD numeric className="font-medium text-ink">{formatQ(s.monto)}</TD>
            <TD sticky className="whitespace-nowrap text-center">
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={() => onResolve(s, 'APROBAR')}>Aprobar</Button>
                <Button size="sm" variant="secondary" className="text-danger-700" onClick={() => onResolve(s, 'RECHAZAR')}>
                  Rechazar
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
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
        title={search ? 'Sin resultados' : 'Busque a un asociado'}
        description={
          search
            ? 'No hay traslados que coincidan con la búsqueda.'
            : 'Escriba un nombre, DPI, caso o número de cuenta para ver su historial.'
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
        { id: 'historial', label: 'Historial', count: historial.length },
      ]}
    />
    <TabPanel id={subTab} idPrefix={SUBTABS_ID}>
      {subTab === 'pendientes' ? (
        <PendingTransfers solicitudes={solicitudes} loading={loadingTraslados} onResolve={onResolve} />
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
