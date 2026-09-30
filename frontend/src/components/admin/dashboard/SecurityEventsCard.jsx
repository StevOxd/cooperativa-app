import React from 'react';
import { History } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from '../../ui';

const STATE_LABELS = {
  ACTIVO: 'Activado',
  INACTIVO: 'Desactivado',
  BLOQUEADO_TEMPORAL: 'Bloqueo por intentos',
};

/** Traduce el cambio de estado a una etiqueta corta y su tono. */
const describeAction = (estadoNuevo, motivo) => {
  const reason = motivo?.toLowerCase() || '';
  if (estadoNuevo === 'BLOQUEADO_TEMPORAL' || reason.includes('fuerza bruta')) {
    return { label: 'Bloqueo por intentos', tone: 'warning' };
  }
  if (reason.includes('desbloqueo')) {
    return { label: 'Desbloqueo', tone: 'success' };
  }
  if (estadoNuevo === 'INACTIVO') {
    return { label: 'Desactivado', tone: 'neutral' };
  }
  return { label: STATE_LABELS[estadoNuevo] || estadoNuevo || 'Actualización', tone: 'brand' };
};

const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Últimos cambios de estado de usuarios (bloqueos, desbloqueos, desactivaciones).
 *
 * @param {Object} props
 * @param {Array} props.events
 */
export const SecurityEventsCard = ({ events }) => (
  <Card>
    <CardHeader title="Cambios recientes de estado" description="Bloqueos, desbloqueos y desactivaciones" />
    {events.length === 0 ? (
      <EmptyState
        icon={History}
        title="No hay cambios recientes"
        description="Aquí aparecerán los bloqueos y desactivaciones de cuentas."
      />
    ) : (
      <Table bordered={false} caption="Cambios recientes de estado de usuarios">
        <THead>
          <TR>
            <TH>Usuario</TH>
            <TH>Acción</TH>
            <TH>Realizada por</TH>
            <TH>Fecha</TH>
            <TH>Motivo</TH>
          </TR>
        </THead>
        <TBody>
          {events.map((ev) => {
            const action = describeAction(ev.estado_nuevo, ev.motivo);
            return (
              <TR key={ev.id_historial_estado} interactive>
                <TD className="whitespace-nowrap">
                  <div className="font-medium text-ink">{ev.usuario_nombre}</div>
                  <div className="font-mono text-xs text-ink-subtle">{ev.usuario_codigo || 'Sin código'}</div>
                </TD>
                <TD>
                  <Badge tone={action.tone}>{action.label}</Badge>
                </TD>
                <TD className="whitespace-nowrap">
                  <div>{ev.actor_nombre}</div>
                  {ev.actor_codigo && <div className="font-mono text-xs text-ink-subtle">{ev.actor_codigo}</div>}
                </TD>
                <TD className="whitespace-nowrap">{formatDate(ev.fecha_cambio)}</TD>
                <TD className="min-w-[16rem] max-w-sm" title={ev.motivo}>
                  {ev.motivo || <span className="text-ink-subtle">—</span>}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    )}
  </Card>
);

export default SecurityEventsCard;
