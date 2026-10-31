/** Formas de cobrar el aporte en ventanilla (Fase 6, #81). */
export const COBRO = Object.freeze({
  EFECTIVO_NUEVA: 'EFECTIVO_NUEVA',
  EFECTIVO_EXISTENTE: 'EFECTIVO_EXISTENTE',
  DEBITO: 'DEBITO',
});

/**
 * Lo que espera la API según la forma de cobro elegida.
 *
 * @param {{ metodo: string, cuenta: string }} cobro
 * @returns {{ metodo_pago: 'EFECTIVO_VENTANILLA'|'DEBITO_CUENTA', numero_cuenta_bancaria?: string }}
 */
export const cobroParaApi = ({ metodo, cuenta }) => {
  if (metodo === COBRO.DEBITO) return { metodo_pago: 'DEBITO_CUENTA', numero_cuenta_bancaria: cuenta };
  if (metodo === COBRO.EFECTIVO_EXISTENTE) return { metodo_pago: 'EFECTIVO_VENTANILLA', numero_cuenta_bancaria: cuenta };
  return { metodo_pago: 'EFECTIVO_VENTANILLA' };
};
