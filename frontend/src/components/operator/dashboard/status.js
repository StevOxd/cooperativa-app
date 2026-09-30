import { humanize } from '../../../utils/format';

/** Estados de una solicitud de crédito → etiqueta y tono de `Badge`. */
const CREDIT_STATES = {
  PENDIENTE: { label: 'Pendiente', tone: 'warning' },
  PENDIENTE_FIRMA: { label: 'Pendiente de firma', tone: 'neutral' },
  EN_REVISION_OPERADOR: { label: 'En revisión', tone: 'brand' },
  DEVUELTA_OPERADOR: { label: 'Devuelta', tone: 'warning' },
  EN_AUTORIZACION_EJECUTIVO: { label: 'Con el ejecutivo', tone: 'brand' },
  APROBADA: { label: 'Aprobada', tone: 'success' },
  APROBADO: { label: 'Aprobada', tone: 'success' },
  DESEMBOLSADA: { label: 'Desembolsada', tone: 'success' },
  RECHAZADA: { label: 'Rechazada', tone: 'danger' },
  RECHAZADO: { label: 'Rechazada', tone: 'danger' },
  DENEGADA: { label: 'Denegada', tone: 'danger' },
};

export const creditStatus = (estado) => CREDIT_STATES[estado] || { label: humanize(estado), tone: 'neutral' };

/** Estados del historial de traslados. */
const TRANSFER_STATES = {
  PENDIENTE: { label: 'Pendiente', tone: 'warning' },
  APROBADO: { label: 'Aprobado', tone: 'success' },
  RECHAZADO: { label: 'Rechazado', tone: 'danger' },
};

export const transferStatus = (estado) => TRANSFER_STATES[estado] || { label: humanize(estado), tone: 'neutral' };

export const transferOperation = (tipo) => (tipo === 'TRASLADO_DIRECTO' ? 'Traslado directo' : 'Apertura y traslado');
