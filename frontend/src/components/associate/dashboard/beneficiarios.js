/** Suma de los porcentajes de los beneficiarios de una cuenta. */
export const porcentajeAsignado = (cuenta) =>
  (cuenta.beneficiarios || []).reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);

/** La cuenta tiene beneficiarios y sus porcentajes suman 100 %. */
export const beneficiariosCompletos = (cuenta) => Math.abs(porcentajeAsignado(cuenta) - 100) < 0.01;
