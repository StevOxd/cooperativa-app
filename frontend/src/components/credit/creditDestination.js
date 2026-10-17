/** Cuenta donde se acreditará el crédito, con el texto disponible más claro. */
export const creditDestination = (c) =>
  c.cuenta_destino_info ||
  (c.cuenta_bancaria_destino_numero
    ? `Cuenta bancaria${c.cuenta_bancaria_destino_tipo ? ` ${c.cuenta_bancaria_destino_tipo}` : ''} (${c.cuenta_bancaria_destino_numero})`
    : 'Cuenta principal del asociado');
