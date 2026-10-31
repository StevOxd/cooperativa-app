/**
 * @file constants.js
 * @description Catálogo centralizado e inmutable de constantes institucionales en el frontend.
 */

export const CONSTANTS = Object.freeze({
  FINANCIERO: {
    MONTO_MINIMO_APORTACION: 100.00,
    PORCENTAJE_BENEFICIARIOS_TOTAL: 100.00,
    TASA_INTERES_DEFAULT_CREDITO: 10.00,
  },
  ARCHIVOS: {
    // PDF firmado de una solicitud de crédito: el mismo máximo del servidor (nginx acepta 14 MB por el Base64)
    PDF_CREDITO_MAX_BYTES: 10 * 1024 * 1024,
  },
  SEGURIDAD: {
    LONGITUD_CUI_DPI: 13,
    EDAD_MINIMA_LEGAL: 18,
    MAX_INTENTOS_LOGIN_FALLIDOS: 3,
    MINUTOS_BLOQUEO_CUENTA: 15,
  },
  ROLES: {
    ADMINISTRADOR: 'ADMINISTRADOR',
    OPERADOR: 'OPERADOR',
    EJECUTIVO: 'EJECUTIVO',
    ASOCIADO: 'ASOCIADO',
  },
  ESTADOS_SOLICITUD: {
    PENDIENTE_AGENCIA: 'PENDIENTE_AGENCIA',
    ATENDIDA: 'ATENDIDA',
    CANCELADA: 'CANCELADA',
    EXPIRADA: 'EXPIRADA',
  },
});

export default CONSTANTS;
