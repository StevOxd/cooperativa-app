import React from 'react';
import { ArrowLeftRight, Send } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, SearchInput, Select, Table, TBody, TD, TH, THead, TR,
} from '../../ui';
import { formatDate, formatQ, humanize } from '../../../utils/format';

const TRANSFER_STATES = {
  PENDIENTE: { label: 'En revisión', tone: 'warning' },
  APROBADO: { label: 'Aprobado', tone: 'success' },
  RECHAZADO: { label: 'Rechazado', tone: 'danger' },
};

const transferStatus = (estado) => TRANSFER_STATES[estado] || { label: humanize(estado), tone: 'neutral' };

/**
 * Pestaña de traslados: cuenta de planilla (origen) e historial de solicitudes.
 */
export const AssociateTransfersTab = ({
  cuentaPlanilla,
  cuentas,
  filterTrasladoEstado,
  filterTrasladoTipo,
  filteredSolicitudesTraslado,
  openTrasladoModal,
  searchTrasladoQuery,
  setFilterTrasladoEstado,
  setFilterTrasladoTipo,
  setSearchTrasladoQuery,
  solicitudesTraslado,
}) => {
  const esCooperativa = cuentaPlanilla?.origen_cuenta === 'COOPERATIVA';
  const saldo = cuentaPlanilla
    ? cuentaPlanilla.saldo_disponible
    : cuentas.length > 0
    ? cuentas[0].saldo_disponible
    : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
      <Card className="lg:col-span-5">
        <CardHeader
          title="Cuenta de planilla"
          description={esCooperativa ? 'Cuenta principal en la cooperativa' : 'Cuenta bancaria vinculada'}
          actions={cuentaPlanilla && <Badge>{esCooperativa ? 'Cooperativa' : 'Banco'}</Badge>}
        />
        <CardBody className="space-y-5">
          <div>
            <p className="text-sm text-ink">
              {cuentaPlanilla ? cuentaPlanilla.tipo_cuenta : cuentas.length > 0 ? cuentas[0].tipo_cuenta : 'Cuenta de ahorro'}
            </p>
            {cuentaPlanilla ? (
              <p className="font-mono text-sm text-ink-muted">{cuentaPlanilla.numero_cuenta}</p>
            ) : cuentas.length > 0 ? (
              <p className="font-mono text-sm text-ink-muted">{cuentas[0].numero_cuenta} (ahorro activa)</p>
            ) : (
              <p className="text-sm text-danger-700">Sin cuenta vinculada</p>
            )}
          </div>

          <div>
            <p className="text-xs text-ink-muted">Saldo disponible</p>
            <p className="text-3xl font-semibold text-ink tabular-nums">{formatQ(saldo)}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {esCooperativa
                ? 'Puede usar estos fondos para traslados, pagos o aperturas en la cooperativa.'
                : 'Puede trasladar estos fondos a sus cuentas de la cooperativa o abrir una nueva.'}
            </p>
          </div>

          <Button fullWidth icon={Send} onClick={openTrasladoModal} disabled={!cuentaPlanilla}>
            Solicitar traslado
          </Button>
        </CardBody>
      </Card>

      <Card className="lg:col-span-7">
        <CardHeader
          title="Mis solicitudes de traslado"
          description="Un operador revisa cada solicitud antes de mover los fondos."
        />
        <div className="grid grid-cols-1 gap-2 border-b border-line px-5 py-3 sm:grid-cols-3">
          <SearchInput
            value={searchTrasladoQuery}
            onChange={setSearchTrasladoQuery}
            label="Buscar traslados"
            placeholder="Caso o cuenta destino"
          />
          <Select
            value={filterTrasladoEstado}
            onChange={(e) => setFilterTrasladoEstado(e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">En revisión</option>
            <option value="APROBADO">Aprobados</option>
            <option value="RECHAZADO">Rechazados</option>
          </Select>
          <Select
            value={filterTrasladoTipo}
            onChange={(e) => setFilterTrasladoTipo(e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="TODOS">Todos los tipos</option>
            <option value="TRASLADO_DIRECTO">Traslado directo</option>
            <option value="APERTURA_Y_TRASLADO">Apertura y traslado</option>
          </Select>
        </div>

        {filteredSolicitudesTraslado.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title={solicitudesTraslado.length === 0 ? 'Aún no ha solicitado traslados' : 'Sin resultados'}
            description={
              solicitudesTraslado.length === 0
                ? 'Cuando solicite un traslado, aquí podrá seguir su estado.'
                : 'Ningún traslado coincide con los filtros elegidos.'
            }
          />
        ) : (
          <Table bordered={false} caption="Mis solicitudes de traslado">
            <THead>
              <TR>
                <TH>Caso</TH>
                <TH>Operación</TH>
                <TH>Estado</TH>
                <TH>Resolución</TH>
                <TH numeric>Monto</TH>
              </TR>
            </THead>
            <TBody>
              {filteredSolicitudesTraslado.map((s) => {
                const status = transferStatus(s.estado);
                return (
                  <TR key={s.id_solicitud}>
                    <TD className="whitespace-nowrap">
                      <div className="font-mono text-ink">{s.numero_caso}</div>
                      {s.fecha_solicitud && <div className="text-xs text-ink-subtle">{formatDate(s.fecha_solicitud)}</div>}
                    </TD>
                    <TD className="min-w-[10rem]">
                      <div className="text-ink">
                        {s.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado directo' : 'Apertura y traslado'}
                      </div>
                      <div className="text-xs text-ink-subtle">
                        Destino:{' '}
                        {s.cuenta_destino_numero ? <span className="font-mono">{s.cuenta_destino_numero}</span> : s.tipo_cuenta_destino}
                      </div>
                    </TD>
                    <TD><Badge tone={status.tone}>{status.label}</Badge></TD>
                    <TD className="min-w-[8rem] max-w-xs text-xs">
                      {s.estado === 'PENDIENTE' ? (
                        <span className="text-ink-subtle">Esperando al operador</span>
                      ) : (
                        <span className="line-clamp-2" title={s.observaciones_operador}>
                          {s.observaciones_operador || '—'}
                        </span>
                      )}
                    </TD>
                    <TD numeric className="font-medium text-ink">{formatQ(s.monto)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default AssociateTransfersTab;
