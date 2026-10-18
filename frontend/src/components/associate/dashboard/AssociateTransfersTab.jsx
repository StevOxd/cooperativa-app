import React from 'react';
import { ArrowLeftRight, Send } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, SearchInput, Select, StatCard, StatGroup, Table, TBody, TD, TH,
  THead, TR,
} from '../../ui';
import { formatDate, formatQ, formatRelative, humanize } from '../../../utils/format';

const TRANSFER_STATES = {
  PENDIENTE: { label: 'En revisión', tone: 'warning' },
  APROBADO: { label: 'Aprobado', tone: 'success' },
  RECHAZADO: { label: 'Rechazado', tone: 'danger' },
};

const transferStatus = (estado) => TRANSFER_STATES[estado] || { label: humanize(estado), tone: 'neutral' };

/** Cantidad y suma de los traslados en un estado. */
const totalPorEstado = (solicitudes, estado) => {
  const lista = solicitudes.filter((s) => s.estado === estado);
  return { cantidad: lista.length, monto: lista.reduce((sum, s) => sum + (parseFloat(s.monto) || 0), 0) };
};

/**
 * Pestaña de traslados: resumen de sus solicitudes, cuenta de planilla (origen) e historial.
 */
export const AssociateTransfersTab = ({
  cuentaPlanilla,
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
  const hayFiltros = filterTrasladoEstado !== 'TODOS' || filterTrasladoTipo !== 'TODOS' || searchTrasladoQuery.trim() !== '';
  const quitarFiltros = () => {
    setFilterTrasladoEstado('TODOS');
    setFilterTrasladoTipo('TODOS');
    setSearchTrasladoQuery('');
  };
  const enRevision = totalPorEstado(solicitudesTraslado, 'PENDIENTE');
  const aprobados = totalPorEstado(solicitudesTraslado, 'APROBADO');
  const rechazados = totalPorEstado(solicitudesTraslado, 'RECHAZADO');

  return (
    <div className="space-y-6">
      {solicitudesTraslado.length > 0 && (
        <StatGroup columns={3}>
          <StatCard
            label="En revisión"
            value={enRevision.cantidad}
            hint={enRevision.cantidad > 0 ? `${formatQ(enRevision.monto)} esperando al operador` : 'Nada pendiente'}
            hintTone={enRevision.cantidad > 0 ? 'warning' : 'neutral'}
          />
          <StatCard label="Aprobados" value={aprobados.cantidad} hint={`${formatQ(aprobados.monto)} trasladados`} />
          <StatCard
            label="Rechazados"
            value={rechazados.cantidad}
            hint={rechazados.cantidad > 0 ? 'El motivo está en el historial' : 'Ninguno'}
          />
        </StatGroup>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <Card className="lg:col-span-5">
          <CardHeader
            title="Cuenta de planilla"
            description={esCooperativa ? 'Cuenta principal en la cooperativa' : 'Cuenta bancaria vinculada'}
            actions={cuentaPlanilla && <Badge>{esCooperativa ? 'Cooperativa' : 'Banco'}</Badge>}
          />
          {cuentaPlanilla ? (
            <CardBody className="space-y-5">
              <div>
                <p className="text-sm text-ink">{cuentaPlanilla.tipo_cuenta}</p>
                <p className="font-mono text-sm text-ink-muted">{cuentaPlanilla.numero_cuenta}</p>
              </div>

              <div>
                <p className="text-xs text-ink-muted">Saldo disponible</p>
                <p className="text-3xl font-semibold text-ink tabular-nums">{formatQ(cuentaPlanilla.saldo_disponible)}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  {esCooperativa
                    ? 'Puede usar estos fondos para traslados, pagos o aperturas en la cooperativa.'
                    : 'Puede trasladar estos fondos a sus cuentas de la cooperativa o abrir una nueva.'}
                </p>
              </div>

              <Button fullWidth icon={Send} onClick={openTrasladoModal}>
                Solicitar traslado
              </Button>
            </CardBody>
          ) : (
            <CardBody>
              {/* Sin planilla los botones de traslado quedan deshabilitados: este aviso explica por qué */}
              <Alert tone="warning" title="No encontramos su cuenta de planilla">
                Para solicitar traslados necesita una cuenta vinculada. Acérquese a una agencia de la cooperativa.
              </Alert>
            </CardBody>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Mis solicitudes de traslado"
            description="Un operador revisa cada solicitud antes de mover los fondos."
          />
          {solicitudesTraslado.length > 0 && (
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
          )}

          {solicitudesTraslado.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="Aún no ha solicitado traslados"
              description="Con un traslado pasa dinero de su cuenta de planilla a una cuenta de la cooperativa, o abre una nueva. Un operador lo revisa y aquí verá su estado."
              action={
                cuentaPlanilla && (
                  <Button variant="secondary" icon={Send} onClick={openTrasladoModal}>
                    Solicitar traslado
                  </Button>
                )
              }
            />
          ) : filteredSolicitudesTraslado.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="Sin resultados"
              description="Ningún traslado coincide con los filtros elegidos."
              action={hayFiltros && <Button variant="secondary" onClick={quitarFiltros}>Quitar filtros</Button>}
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
                          <span className="text-ink-subtle">
                            Esperando al operador{s.fecha_solicitud && <> · {formatRelative(s.fecha_solicitud)}</>}
                          </span>
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
    </div>
  );
};

export default AssociateTransfersTab;
