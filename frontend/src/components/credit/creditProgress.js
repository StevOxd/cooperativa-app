import { humanize } from '../../utils/format';

/**
 * Avance del trámite de un crédito, igual para el asociado, el operador y el ejecutivo. El operador y el ejecutivo
 * nombran los estados a su manera (`operator/dashboard/status.js`, `executive/executiveCreditStatus.js`); aquí van
 * el paso, el tono y las etiquetas que ve el asociado.
 */

/** Pasos del trámite, en orden. */
export const PASOS_CREDITO = ['Firma', 'Revisión del operador', 'Autorización del ejecutivo', 'Resolución'];

/** Solicitudes que todavía no se resuelven. */
export const ESTADOS_CREDITO_EN_TRAMITE = ['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'];

/** Créditos aprobados (con o sin desembolso registrado). */
export const ESTADOS_CREDITO_VIGENTES = ['APROBADA', 'APROBADO', 'DESEMBOLSADA'];

/** Estados de la solicitud vistos por el asociado (simulador y plan de pagos). */
const ETIQUETAS_ASOCIADO = {
  PENDIENTE_FIRMA: { label: 'Falta firmar', tone: 'warning' },
  PENDIENTE: { label: 'En revisión', tone: 'brand' },
  EN_REVISION_OPERADOR: { label: 'En revisión', tone: 'brand' },
  EN_AUTORIZACION_EJECUTIVO: { label: 'En autorización', tone: 'brand' },
  DEVUELTA_OPERADOR: { label: 'Devuelta para corregir', tone: 'warning' },
  APROBADA: { label: 'Aprobada', tone: 'success' },
  APROBADO: { label: 'Aprobada', tone: 'success' },
  DESEMBOLSADA: { label: 'Desembolsada', tone: 'success' },
  RECHAZADA: { label: 'Denegada', tone: 'danger' },
  RECHAZADO: { label: 'Denegada', tone: 'danger' },
  DENEGADA: { label: 'Denegada', tone: 'danger' },
};

/** Etiqueta y tono de `Badge` del estado, como lo ve el asociado. */
export const estadoCreditoAsociado = (estado) => ETIQUETAS_ASOCIADO[estado] || { label: humanize(estado), tone: 'neutral' };

/**
 * Paso en curso y su tono según el estado de la solicitud.
 *
 * @param {string} estado
 * @returns {{ paso: number, tono: 'brand'|'warning'|'success'|'danger'|'neutral', terminado: boolean }}
 */
export const avanceCredito = (estado) => {
  switch (estado) {
    case 'PENDIENTE_FIRMA':
      return { paso: 0, tono: 'warning', terminado: false };
    case 'PENDIENTE':
    case 'EN_REVISION_OPERADOR':
      return { paso: 1, tono: 'brand', terminado: false };
    case 'DEVUELTA_OPERADOR':
      return { paso: 1, tono: 'warning', terminado: false };
    case 'EN_AUTORIZACION_EJECUTIVO':
      return { paso: 2, tono: 'brand', terminado: false };
    case 'APROBADA':
    case 'APROBADO':
    case 'DESEMBOLSADA':
      return { paso: 3, tono: 'success', terminado: true };
    // El ejecutivo deniega en la resolución; el operador rechaza en su revisión (no llegó al ejecutivo)
    case 'DENEGADA':
      return { paso: 3, tono: 'danger', terminado: true };
    case 'RECHAZADA':
    case 'RECHAZADO':
      return { paso: 1, tono: 'danger', terminado: true };
    // El asociado la canceló: no se marca ningún paso como hecho (quien muestra el avance puede omitirlo)
    case 'CANCELADA':
      return { paso: 0, tono: 'neutral', terminado: true };
    default:
      return { paso: 0, tono: 'neutral', terminado: false };
  }
};
