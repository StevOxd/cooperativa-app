/**
 * Cuentas de origen de los traslados (issue #82): la de planilla en la cooperativa y las del banco. El id de una cuenta
 * del banco y el de una de la cooperativa pueden coincidir, así que una cuenta se identifica por su origen y su id.
 */

/** "BANCO:12" o "COOPERATIVA:5"; vacío si no hay cuenta. */
export const claveDeCuenta = (cuenta) => (cuenta ? `${cuenta.origen_cuenta}:${cuenta.id_cuenta}` : '');

/** La cuenta es de la cooperativa (puede coincidir con un destino). */
export const esDeLaCooperativa = (cuenta) => cuenta?.origen_cuenta === 'COOPERATIVA';
