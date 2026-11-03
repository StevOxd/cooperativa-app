/** Datos de prueba inventados que imitan las respuestas de la API. */
const persona = {
  primer_nombre: 'Ana',
  segundo_nombre: 'María',
  primer_apellido: 'Prueba',
  segundo_apellido: 'Uno',
  nombre_completo: 'Ana María Prueba Uno',
  nombre: 'Ana María Prueba Uno',
  cui_dpi: '1234567890123',
  telefono: '55555555',
  direccion: 'Zona 1',
  fecha_nacimiento: '1990-05-01',
};
const usuario = {
  ...persona,
  id_usuario: 11,
  id: 11,
  codigo_corporativo: 'OP-9',
  email: 'ana@prueba.test',
  rol: 'OPERADOR',
  estado: 'ACTIVO',
  mfa_enabled: false,
  ultimo_acceso: '2026-02-01T12:00:00Z',
};
const asociado = {
  ...persona,
  id_asociado: 21,
  codigo_corporativo: 'EB-9',
  codigo: 'EB-9',
  email: 'ana@prueba.test',
  estado: 'ACTIVO',
  estado_asociado: 'ACTIVO',
  tipo_asociado: 'EB',
  canal_afiliacion: 'AGENCIA',
  fecha_ingreso: '2026-01-15',
  total_cuentas: 1,
};
const cuenta = {
  id_cuenta: 31,
  numero_cuenta: '100200300',
  tipo_cuenta: 'Ahorro',
  nombre_tipo: 'Ahorro',
  saldo_disponible: '1500.50',
  saldo_reserva: '0.00',
  estado: 'ACTIVA',
  tasa_interes_anual: 4,
  fecha_apertura: '2026-01-15',
};
const credito = {
  ...persona,
  id_solicitud_credito: 41,
  numero_caso: 'CRED-2026-0001',
  monto_solicitado: '10000.00',
  plazo_meses: 12,
  tasa_interes: 10,
  cuota_mensual_estimada: '879.16',
  destino: 'Vivienda',
  estado: 'EN_REVISION_OPERADOR',
  fecha_solicitud: '2026-02-01T12:00:00Z',
};
const solicitud = {
  ...persona,
  id_solicitud: 51,
  numero_caso: 'CASO-2026-0001',
  estado: 'PENDIENTE',
  monto: '50.00',
  monto_estimado: '100.00',
  fecha_solicitud: '2026-02-01T12:00:00Z',
  tipo_operacion: 'TRASLADO_DIRECTO',
  cuenta_destino_numero: '100200300',
};
const beneficiario = {
  id_beneficiario: 61,
  nombre_completo: 'Beto Prueba',
  parentesco: 'HIJO/A',
  porcentaje: '100.00',
  cui_dpi: '1234567890124',
};
const deposito = {
  id_deposito: 71,
  ...persona,
  monto: '100.00',
  estado: 'SIN_CONFIRMAR',
  referencia: 'REF-1',
  fecha: '2026-02-01T12:00:00Z',
  cuenta: '100200300',
};
const evento = {
  id: 81,
  accion: 'LOGIN',
  estado_nuevo: 'ACTIVO',
  estado_anterior: 'INACTIVO',
  motivo: 'Prueba',
  fecha: '2026-02-01T12:00:00Z',
  ip_origen: '192.0.2.1',
  ...usuario,
};

export const BASE = { usuario, asociado, cuenta, credito, solicitud };

const ok = (data, extra = {}) => ({ data: { success: true, data, ...extra } });

const RESPUESTAS = [
  [/^\/usuarios\/next-code/, () => ok(null, { next_code: 'OP-10' })],
  [/^\/usuarios\/auditoria/, () => ok([evento])],
  [/^\/usuarios/, () => ok([usuario])],
  [/^\/conciliacion\/resumen/, () => ok({ depositos: 1, reversiones: 1 })],
  [/^\/conciliacion\/depositos/, () => ok([deposito], { resumen: [], limitado: false })],
  [/^\/conciliacion\/reversiones/, () => ok([deposito], { total_pendientes: 1, limitado: false })],
  [/^\/operador\/bandeja-solicitudes/, () => ok([solicitud])],
  [/^\/operador\/creditos/, () => ok([credito])],
  [/^\/operador\/traslados\/historial/, () => ok([solicitud])],
  [/^\/operador\/documentos/, () => ({ data: { success: true, data: [], por_revisar: 1 } })],
  [/^\/operador/, () => ok([solicitud])],
  [
    /^\/admin\/asociados\/\d+\/expediente/,
    () =>
      ok({
        asociado,
        perfil: asociado,
        datos: asociado,
        metricas: { saldo_total: 1500, saldo_aportaciones: 100, total_cuentas: 1, total_creditos: 1 },
        documentos_resumen: { faltantes: ['DPI_FRENTE'], obligatorios: 4, entregados: 3, aceptados: 3 },
        cuentas: [{ ...cuenta, beneficiarios: [beneficiario] }],
        beneficiarios: [beneficiario],
        creditos: [credito],
        movimientos: [],
        documentos: [],
        resumen_documentos: { faltantes: ['DPI_FRENTE'] },
        estados: [],
        traslados: [solicitud],
      }),
  ],
  [/^\/admin\/asociados/, () => ok([asociado], { pagination: { total: 1, page: 1, pages: 1, limit: 20 } })],
  [
    /^\/ejecutivo\/creditos\/\d+\/evaluacion/,
    () =>
      ok({
        evaluacion: {
          evaluacion: { apto: true, score: 700, diagnostico: 'Apto para crédito' },
          solicitante: { ...persona, cuentas: [cuenta], cuentasBancarias: [cuenta], totalBanco: 1500, totalCoop: 1500 },
          analisisSolicitud: { diagnosticos: ['Sin observaciones'] },
        },
      }),
  ],
  [/^\/ejecutivo\/creditos/, () => ok([credito])],
  [/^\/asociado\/perfil/, () => ok(asociado)],
  [
    /^\/asociado\/cuentas-acreditacion/,
    () => ok({ todas: [{ ...cuenta, key: 'banco-5', id_cuenta_bancaria: 5, disponible_para_credito: true }] }),
  ],
  [/^\/asociado\/cuentas-origen/, () => ok([cuenta], { banco_disponible: true })],
  [/^\/asociado\/cuentas/, () => ok([cuenta])],
  [
    /^\/asociado\/capacidad-crediticia/,
    () => ok({ capacidad_maxima: 50000, creditos_activos: 0, puede_solicitar: true }),
  ],
  [/^\/asociado\/creditos/, () => ok([credito])],
  [/^\/asociado\/mis-cuentas-destino/, () => ok([cuenta])],
  [/^\/asociado\/mis-solicitudes/, () => ok([solicitud])],
  [/^\/asociado\/beneficiarios/, () => ok([beneficiario])],
  [
    /^\/asociado\/documentos/,
    () =>
      ok({
        documentos: [],
        resumen: { faltantes: ['DPI_FRENTE'], rechazados: [], obligatorios: 4, entregados: 3, aceptados: 3 },
      }),
  ],
  [
    /^\/catalogo\/tipos-cuenta/,
    () => ok([{ id_tipo_cuenta: 1, nombre: 'Ahorro', tasa_interes_anual: 4, monto_minimo_apertura: 100 }]),
  ],
];

/** Responde según la ruta; lo que no está en la lista recibe una lista vacía. */
export const responder = async (url) => {
  const coincidencia = RESPUESTAS.find(([patron]) => patron.test(url));
  return coincidencia ? coincidencia[1]() : ok([], { pagination: { total: 0, page: 1, pages: 1, limit: 20 } });
};
