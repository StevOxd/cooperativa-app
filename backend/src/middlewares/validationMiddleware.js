/**
 * Middleware y Validadores de Perímetro (ARQ-05)
 * Centraliza las validaciones de entrada para CUI/DPI, mayoría de edad, montos numéricos y beneficiarios.
 */

const { edadEnGuatemala } = require('../utils/fechas');

/**
 * Valida formato estándar de CUI / DPI guatemalteco (exactamente 13 dígitos numéricos)
 * @param {string} cui
 * @returns {{ valid: boolean, message?: string }}
 */
const validateCui = (cui) => {
  if (!cui || typeof cui !== 'string') {
    return { valid: false, message: 'Escriba el número de DPI.' };
  }
  const clean = cui.trim().replace(/\s+/g, '');
  if (!/^\d{13}$/.test(clean)) {
    return { valid: false, message: 'El DPI debe tener 13 dígitos, sin espacios ni guiones.' };
  }
  return { valid: true, clean };
};

const EDAD_MINIMA = 18;

/**
 * Fecha de nacimiento como texto AAAA-MM-DD, o null si no se puede leer.
 * - Texto: toma los primeros 10 caracteres («1990-05-20» o «1990-05-20T00:00:00Z»).
 * - Date: usa la fecha local del proceso, que es como `pg` arma las columnas DATE (medianoche local); así no se
 *   corre un día al pasarla a UTC.
 *
 * @param {string|Date} valor
 * @returns {string|null}
 */
const fechaComoTexto = (valor) => {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const dosDigitos = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
  }
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor.trim())) return valor.trim().slice(0, 10);
  return null;
};

/**
 * Valida que una fecha de nacimiento corresponda a una persona mayor de 18 años, contando la edad con la fecha de hoy
 * en Guatemala (issue #127): no depende de la zona horaria del servidor.
 * @param {string|Date} fechaNacimiento
 * @param {Date} [ahora] - Momento de referencia (para pruebas).
 * @returns {{ valid: boolean, age?: number, message?: string }}
 */
const validateAge18 = (fechaNacimiento, ahora = new Date()) => {
  if (!fechaNacimiento) {
    return { valid: false, message: 'Escriba la fecha de nacimiento.' };
  }
  const age = edadEnGuatemala(fechaComoTexto(fechaNacimiento), ahora);
  if (age === null) {
    return { valid: false, message: 'La fecha de nacimiento no es válida.' };
  }
  if (age < EDAD_MINIMA) {
    return { valid: false, message: 'La persona debe ser mayor de edad (18 años cumplidos).' };
  }
  return { valid: true, age };
};

/**
 * Valida que un monto sea numérico y estrictamente positivo (> min)
 * @param {number|string} monto
 * @param {number} min
 * @param {string} fieldName
 * @returns {{ valid: boolean, value?: number, message?: string }}
 */
const validatePositiveAmount = (monto, min = 0, fieldName = 'monto') => {
  const num = Number.parseFloat(monto);
  if (isNaN(num) || num <= min) {
    return {
      valid: false,
      message: `El campo ${fieldName} debe ser un valor numérico mayor a Q${min.toFixed(2)}.`,
    };
  }
  return { valid: true, value: num };
};

/**
 * Valida que la suma de porcentajes de beneficiarios totalice exactamente 100%
 * @param {Array} beneficiarios
 * @returns {{ valid: boolean, message?: string }}
 */
const validateBeneficiarios = (beneficiarios) => {
  if (!Array.isArray(beneficiarios) || beneficiarios.length === 0) {
    return { valid: false, message: 'Agregue al menos un beneficiario.' };
  }
  const total = beneficiarios.reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    return {
      valid: false,
      message: `Los porcentajes deben sumar 100.00%. Ahora suman ${total}%.`,
    };
  }
  return { valid: true, total };
};

/**
 * Express Middleware: Valida CUI en el cuerpo de la petición
 */
const validateCuiMiddleware = (field = 'cui_dpi') => {
  return (req, res, next) => {
    const cui = req.body[field] || req.params[field] || req.query[field];
    const result = validateCui(cui);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }
    req.cleanedCui = result.clean;
    next();
  };
};

/**
 * Valida que un monto sea numérico y alcance un mínimo inclusivo (>= min), por ejemplo el aporte
 * inicial de Q100.00, que debe aceptar exactamente Q100.00.
 * @param {number|string} monto
 * @param {number} min
 * @returns {{ valid: boolean, value?: number }}
 */
const validateMinimumAmount = (monto, min) => {
  const num = Number.parseFloat(monto);
  return isNaN(num) || num < min ? { valid: false } : { valid: true, value: num };
};

/**
 * Express Middleware: Valida monto en solicitudes de crédito o traslado
 */
const validateMontoMiddleware = (field = 'monto', min = 0) => {
  return (req, res, next) => {
    const val = req.body[field];
    const result = validatePositiveAmount(val, min, field);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }
    next();
  };
};

module.exports = {
  validateMinimumAmount,
  validateCui,
  validateAge18,
  validatePositiveAmount,
  validateBeneficiarios,
  validateCuiMiddleware,
  validateMontoMiddleware,
};
