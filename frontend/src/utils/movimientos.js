/**
 * Sentido de un movimiento de cuenta (issue #8).
 *
 * Un movimiento suma a la cuenta si su saldo nuevo es mayor que el anterior: así un traslado recibido o un
 * ajuste a favor se ven como ingreso, aunque su tipo sea TRANSFERENCIA o AJUSTE. Si no vienen los saldos,
 * se decide por el tipo (un desembolso de crédito se registra como DEPOSITO; PAGO_CREDITO es un abono que
 * sale de la cuenta).
 *
 * @param {{tipo_transaccion?: string, saldo_anterior?: number|string, saldo_nuevo?: number|string}} movimiento
 * @returns {boolean} true si es un ingreso.
 */
export const esIngreso = (movimiento) => {
  const anterior = Number(movimiento?.saldo_anterior);
  const nuevo = Number(movimiento?.saldo_nuevo);
  if (Number.isFinite(anterior) && Number.isFinite(nuevo) && anterior !== nuevo) return nuevo > anterior;
  return ['DEPOSITO', 'CREDITO', 'CREDITO_ACH'].includes(movimiento?.tipo_transaccion);
};

export default esIngreso;
