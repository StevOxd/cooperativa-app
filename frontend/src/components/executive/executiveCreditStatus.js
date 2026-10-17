import { humanize } from '../../utils/format';

/** Estados vistos desde el ejecutivo. */
const STATES = {
  EN_AUTORIZACION_EJECUTIVO: { label: 'Por autorizar', tone: 'warning' },
  DEVUELTA_OPERADOR: { label: 'Devuelta', tone: 'neutral' },
  APROBADA: { label: 'Aprobada', tone: 'success' },
  APROBADO: { label: 'Aprobada', tone: 'success' },
  DESEMBOLSADA: { label: 'Desembolsada', tone: 'success' },
  DENEGADA: { label: 'Denegada', tone: 'danger' },
  RECHAZADA: { label: 'Denegada', tone: 'danger' },
  CANCELADA: { label: 'Cancelada por el asociado', tone: 'neutral' },
  EN_REVISION_OPERADOR: { label: 'Con el operador', tone: 'brand' },
  PENDIENTE: { label: 'Con el operador', tone: 'brand' },
};

export const executiveCreditStatus = (estado) => STATES[estado] || { label: humanize(estado), tone: 'neutral' };
