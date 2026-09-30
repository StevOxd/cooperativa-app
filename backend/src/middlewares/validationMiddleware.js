/**
 * Middleware y Validadores de Perímetro (ARQ-05)
 * Centraliza las validaciones de entrada para CUI/DPI, mayoría de edad, montos numéricos y beneficiarios.
 */

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

/**
 * Valida que una fecha de nacimiento corresponda a una persona mayor de 18 años
 * @param {string|Date} fechaNacimiento
 * @returns {{ valid: boolean, message?: string }}
 */
const validateAge18 = (fechaNacimiento) => {
  if (!fechaNacimiento) {
    return { valid: false, message: 'Escriba la fecha de nacimiento.' };
  }
  const birth = new Date(fechaNacimiento);
  if (isNaN(birth.getTime())) {
    return { valid: false, message: 'La fecha de nacimiento no es válida.' };
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  if (age < 18) {
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
  const num = parseFloat(monto);
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
  validateCui,
  validateAge18,
  validatePositiveAmount,
  validateBeneficiarios,
  validateCuiMiddleware,
  validateMontoMiddleware,
};
