/**
 * @file constants.js
 * @description Catálogo centralizado e inmutable de constantes institucionales y reglas de negocio bancario.
 */

module.exports = Object.freeze({
  FINANCIERO: {
    MONTO_MINIMO_APORTACION: 100.00,
    FACTOR_APALANCAMIENTO_MAXIMO: 1.5,
    PORCENTAJE_BENEFICIARIOS_TOTAL: 100.00,
    TASA_INTERES_DEFAULT_CREDITO: 10.00,
    // Límites de una solicitud de crédito (issue #12): los mismos del simulador del portal
    CREDITO_MONTO_MINIMO: 500.00,
    CREDITO_MONTO_MAXIMO: 500000.00,
    CREDITO_PLAZO_MINIMO_MESES: 3,
    CREDITO_PLAZO_MAXIMO_MESES: 120,
    // Efectivo recibido en ventanilla (aportación, formalización, apertura de cuentas y depósito al banco):
    // tope por persona al día, sumando todas las vías. Sin tope por operador (decisión de negocio).
    EFECTIVO_VENTANILLA_DIARIO_POR_PERSONA: 100000.00,
    // Un movimiento que el banco no confirmó a tiempo se concilia pasado este tiempo: antes, su llamada al banco
    // puede seguir en curso (el banco no lo tiene todavía y se cerraría como si no hubiera entrado)
    MINUTOS_PARA_CONCILIAR: 2,
    CUENTA_APORTACIONES_ID: 1,
    CUENTA_AHORRO_DISPONIBLE_ID: 2,
    CUENTA_PLAZO_FIJO_ID: 3,
    CUENTA_PLANILLA_ID: 4,
    CUENTA_AHORRO_PROGRAMADO_ID: 5,
  },
  SEGURIDAD: {
    MAX_INTENTOS_LOGIN_FALLIDOS: 3,
    MINUTOS_BLOQUEO_CUENTA: 15,
    MINUTOS_TIMEOUT_PRESENCIA: 2,
    MINUTOS_BLOQUEO_EXPEDIENTE_AGENCIA: 15,
    LONGITUD_CUI_DPI: 13,
    EDAD_MINIMA_LEGAL: 18,
    ADMIN_ROOT_CUI: '1000000000008',
    // Tras cambiar el correo de un usuario, su contraseña no se reinicia hasta pasado este tiempo: el correo
    // anterior recibe un aviso y la persona puede reclamar antes de que una temporal llegue al correo nuevo
    HORAS_ESPERA_REINICIO_TRAS_CAMBIO_CORREO: 24,
  },
  ROLES: {
    ADMINISTRADOR: 'ADMINISTRADOR',
    OPERADOR: 'OPERADOR',
    EJECUTIVO: 'EJECUTIVO',
    ASOCIADO: 'ASOCIADO',
  },
  ESTADOS_USUARIO: {
    ACTIVO: 'ACTIVO',
    INACTIVO: 'INACTIVO',
    BLOQUEADO: 'BLOQUEADO',
  },
  ESTADOS_ASOCIADO: {
    ACTIVO: 'ACTIVO',
    INACTIVO: 'INACTIVO',
    SUSPENDIDO: 'SUSPENDIDO',
    BLOQUEADO: 'BLOQUEADO',
  },
  ESTADOS_SOLICITUD_AFILIACION: {
    PENDIENTE_AGENCIA: 'PENDIENTE_AGENCIA',
    ATENDIDA: 'ATENDIDA',
    CANCELADA: 'CANCELADA',
    EXPIRADA: 'EXPIRADA',
  },
  ESTADOS_CREDITO: {
    PENDIENTE_FIRMA: 'PENDIENTE_FIRMA',
    EN_REVISION_OPERADOR: 'EN_REVISION_OPERADOR',
    EN_AUTORIZACION_EJECUTIVO: 'EN_AUTORIZACION_EJECUTIVO',
    DEVUELTA_OPERADOR: 'DEVUELTA_OPERADOR',
    APROBADA: 'APROBADA',
    DESEMBOLSADA: 'DESEMBOLSADA',
    RECHAZADA: 'RECHAZADA',
    DENEGADA: 'DENEGADA',
    // El asociado desistió (issue #11): no cuenta como rechazo de la cooperativa
    CANCELADA: 'CANCELADA',
  },
  ESTADOS_CUENTA: {
    ACTIVA: 'ACTIVA',
    BLOQUEADA: 'BLOQUEADA',
    CANCELADA: 'CANCELADA',
  },
  // Documentos de afiliación: los obligatorios se piden en todos los canales; la constancia de ingresos es opcional
  DOCUMENTOS: Object.freeze({
    TIPOS: Object.freeze(['DPI_FRENTE', 'DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI', 'CONSTANCIA_INGRESOS']),
    OBLIGATORIOS: Object.freeze(['DPI_FRENTE', 'DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI']),
    TAMANO_MAXIMO_BYTES: 5 * 1024 * 1024,
    // Versiones de un mismo tipo que puede subir el interesado; después, el documento se escanea en ventanilla
    MAX_VERSIONES_POR_TIPO: 8,
    MOTIVO_RECHAZO_MIN: 5,
    MOTIVO_RECHAZO_MAX: 500,
  }),
});
