import {
  Banknote, FileSearch, Gavel, HandCoins, History, Scale, ShieldCheck, UserPlus, Users, Wallet,
} from 'lucide-react';
import { formatDateOnly, formatQ, hoyEnGuatemala } from '../format';
import { etiquetaDocumento } from '../documentos';

/**
 * Reportes de gestión del personal (issue #85). El servidor arma los datos (`GET /api/reportes/:id`) y aquí se dice
 * cómo se presentan: columnas del PDF y del CSV, totales y notas. Los roles son los mismos de
 * backend/src/services/reportesService.js, que es quien decide.
 *
 * No importa jsPDF: el PDF se arma en `reportePdf.js`, que se descarga al usarlo.
 */

const ZONA = 'America/Guatemala';

/** "30/10/2026, 14:05" en hora de Guatemala. */
export const fechaHora = (valor) =>
  valor
    ? new Date(valor).toLocaleString('es-GT', {
        timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      })
    : '—';

/** "30/10/2026 14:05": sin la coma, para que quepa en la columna de las tablas del PDF. */
const fechaHoraTabla = (valor) => fechaHora(valor).replace(',', '');

/** "14:05" en hora de Guatemala. */
const hora = (valor) =>
  valor ? new Date(valor).toLocaleTimeString('es-GT', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—';

/** "2026-10-30 14:05" en hora de Guatemala, para el CSV (Excel lo reconoce como fecha). */
const fechaHoraCsv = (valor) => (valor ? new Date(valor).toLocaleString('sv-SE', { timeZone: ZONA }).slice(0, 16) : '');

/** "2026-10-30" → "30/10/2026" sin pasar por Date (que lo tomaría como medianoche UTC y restaría un día). */
export const fechaCorta = formatDateOnly;

export { hoyEnGuatemala };

const etiqueta = (mapa) => (valor) => mapa[valor] || valor || '—';
const codigoYNombre = (codigo, nombre) => [codigo, nombre].filter(Boolean).join(' · ') || '—';

const CONCEPTO_EFECTIVO = {
  AFILIACION_PRESENCIAL: 'Aportación al afiliar',
  FORMALIZACION_AGENCIA: 'Formalización en agencia',
  APERTURA_CUENTA: 'Apertura de cuenta',
  DEPOSITO_BANCO: 'Depósito al banco',
};
const ESTADO_DEPOSITO = {
  PENDIENTE: 'Pendiente',
  SIN_CONFIRMAR: 'Sin confirmar',
  ACREDITADO: 'Acreditado',
  RECHAZADO: 'Rechazado',
  REVERTIDO: 'Revertido',
};
const ESTADO_ASOCIADO = { ACTIVO: 'Activo', INACTIVO: 'Inactivo', SUSPENDIDO: 'Suspendido', BLOQUEADO: 'Bloqueado' };
// En plural: las cifras de los totales y el filtro del padrón cuentan asociados
export const ASOCIADOS_POR_ESTADO = { ACTIVO: 'Activos', INACTIVO: 'Inactivos', SUSPENDIDO: 'Suspendidos', BLOQUEADO: 'Bloqueados' };
const TIPO_ASOCIADO = { EB: 'Empleado del banco', EX: 'Cliente externo', SIN_DATO: 'Sin registro' };
const ASOCIADOS_POR_TIPO = { EB: 'Empleados del banco', EX: 'Clientes externos', SIN_DATO: 'Sin registro' };
const ESTADO_DOCUMENTOS = { COMPLETO: 'Completos', EN_REVISION: 'En revisión', INCOMPLETO: 'Incompletos' };
const GRUPO_CREDITO = {
  EN_TRAMITE: 'En trámite',
  APROBADA: 'Aprobadas',
  NO_APROBADA: 'Denegadas o rechazadas',
  CANCELADA: 'Canceladas por el asociado',
};
const ESTADO_CREDITO = {
  PENDIENTE_FIRMA: 'Por firmar',
  EN_REVISION_OPERADOR: 'Con el operador',
  PENDIENTE: 'Con el operador',
  EN_AUTORIZACION_EJECUTIVO: 'Por autorizar',
  DEVUELTA_OPERADOR: 'Devuelta',
  APROBADA: 'Aprobada',
  APROBADO: 'Aprobada',
  DESEMBOLSADA: 'Desembolsada',
  DENEGADA: 'Denegada',
  RECHAZADA: 'Rechazada',
  RECHAZADO: 'Rechazada',
  CANCELADA: 'Cancelada',
};
const RESOLUCION = { APROBADA: 'Aprobada', DEVUELTA: 'Devuelta', DENEGADA: 'Denegada' };
const CANAL = { AGENCIA: 'Solicitud en agencia', EN_LINEA: 'En línea', VENTANILLA: 'Ventanilla', SIN_DATO: 'Sin registro' };
const ESTADO_USUARIO = { ACTIVO: 'Activo', INACTIVO: 'Inactivo', BLOQUEADO: 'Bloqueado', BLOQUEADO_TEMPORAL: 'Bloqueo temporal' };
// Los cambios según el estado en que quedó el usuario
const CAMBIOS_POR_ESTADO = {
  ACTIVO: 'Activaciones y desbloqueos', INACTIVO: 'Bajas', BLOQUEADO: 'Bloqueos', BLOQUEADO_TEMPORAL: 'Bloqueos temporales',
};
const ROL = { ADMINISTRADOR: 'Administrador', OPERADOR: 'Operador', EJECUTIVO: 'Ejecutivo', ASOCIADO: 'Asociado' };
const ESTADO_REVERSION = { PENDIENTE: 'Pendiente', RESUELTA: 'Resuelta', DESCARTADA: 'Descartada' };
const ORIGEN_OPERACION = {
  DEPOSITO_VENTANILLA: 'Depósito en ventanilla',
  TRASLADO: 'Traslado',
  APERTURA_CUENTA: 'Apertura de cuenta',
  AFILIACION_EN_LINEA: 'Afiliación en línea',
  AFILIACION_PRESENCIAL: 'Afiliación en ventanilla',
  FORMALIZACION_AGENCIA: 'Formalización en agencia',
  DESEMBOLSO_CREDITO: 'Desembolso de crédito',
};
const MOVIMIENTO = { CREDITO: 'Crédito', DEBITO: 'Débito' };

const columnaMonto = (titulo = 'Monto', ancho = 0.1) => ({
  titulo, ancho, alinear: 'right', pdf: (f) => formatQ(f.monto), csv: (f) => f.monto,
});
const columnaFecha = (titulo = 'Fecha', ancho = 0.12, campo = 'fecha') => ({
  titulo, ancho, pdf: (f) => fechaHoraTabla(f[campo]), csv: (f) => fechaHoraCsv(f[campo]),
});

/** Cifras de un agrupamiento del servidor (`[{ clave, cantidad, monto? }]`) con sus etiquetas. */
const cifrasDe = (grupos = [], etiquetas = {}, { conMonto = false } = {}) =>
  grupos.map((g) => ({
    label: etiquetas[g.clave] || g.clave,
    value: conMonto ? `${formatQ(g.monto)} · ${g.cantidad}` : g.cantidad.toLocaleString('es-GT'),
  }));

/** Tabla de un agrupamiento con cantidad y, si se pide, monto. */
const tablaDe = (titulo, grupos = [], etiquetas = {}, { conMonto = false, columna = 'Concepto', cantidad = 'Operaciones' } = {}) => ({
  titulo,
  tabla: {
    columnas: conMonto
      ? [{ header: columna, width: 0.5 }, { header: cantidad, width: 0.2, align: 'right' }, { header: 'Monto', width: 0.3, align: 'right' }]
      : [{ header: columna, width: 0.7 }, { header: cantidad, width: 0.3, align: 'right' }],
    filas: grupos.map((g) => [
      etiquetas[g.clave] || g.clave,
      g.cantidad.toLocaleString('es-GT'),
      ...(conMonto ? [formatQ(g.monto)] : []),
    ]),
  },
});

const operaciones = (n) => `${n.toLocaleString('es-GT')} ${n === 1 ? 'operación' : 'operaciones'}`;

const totalesDeEfectivo = (r) => [
  {
    cifras: [
      { label: 'Confirmado', value: `${formatQ(r.confirmado.monto)} · ${operaciones(r.confirmado.cantidad)}`, strong: true },
      { label: 'Depósitos por conciliar', value: `${formatQ(r.por_conciliar.monto)} · ${operaciones(r.por_conciliar.cantidad)}` },
      { label: 'No cobrado (rechazado o revertido)', value: `${formatQ(r.no_cobrado.monto)} · ${operaciones(r.no_cobrado.cantidad)}` },
    ],
  },
  tablaDe('Confirmado por concepto', r.por_concepto, CONCEPTO_EFECTIVO, { conMonto: true }),
];

const NOTA_EFECTIVO =
  '«Confirmado» suma el efectivo recibido en ventanilla y los depósitos que el banco acreditó. Los depósitos por ' +
  'conciliar (pendientes o sin confirmar) los cierra el administrador en «Conciliación»; los rechazados o revertidos ' +
  'no se cobraron.';

/** Texto de los filtros de un reporte: período, día o estado. */
export const textoDeFiltros = (filtros = {}) => {
  if (filtros.fecha) return fechaCorta(filtros.fecha);
  if (filtros.desde) return `${fechaCorta(filtros.desde)} al ${fechaCorta(filtros.hasta)}`;
  if (filtros.estado) return (ASOCIADOS_POR_ESTADO[filtros.estado] || filtros.estado);
  return 'Todos';
};

/**
 * @typedef {Object} DefinicionReporte
 * @property {string} id - Como en la URL del servidor.
 * @property {string} codigo - Como queda en `reportes_generados`.
 * @property {string} titulo
 * @property {string} descripcion
 * @property {string[]} roles
 * @property {'periodo'|'dia'|'estado'} filtro
 * @property {boolean} [horizontal] - Hoja horizontal (tablas anchas).
 * @property {Array<{titulo: string, tituloCsv?: string, ancho?: number, alinear?: 'right', mono?: boolean,
 *   wrap?: boolean, texto?: boolean, soloCsv?: boolean, pdf: Function, csv?: Function}>} columnas - Los anchos de las
 *   que van al PDF suman 1. `wrap`: el texto ocupa varias líneas en el PDF. `texto`: un número que Excel debe dejar
 *   como texto (el DPI).
 * @property {(resumen: Object) => Object[]} totales - Bloques del PDF: `{ titulo?, cifras }` o `{ titulo, tabla }`.
 * @property {string} [nota]
 * @property {(usuario: Object) => Object[]} [firmas]
 * @property {string} vacio - Texto de la tabla sin filas.
 */

/** @type {DefinicionReporte[]} */
export const REPORTES = [
  {
    id: 'cierre-caja',
    codigo: 'CIERRE_CAJA',
    titulo: 'Cierre de caja',
    descripcion: 'El efectivo que usted recibió en ventanilla en un día: aportaciones, formalizaciones, aperturas y depósitos al banco.',
    icono: Wallet,
    roles: ['OPERADOR'],
    filtro: 'dia',
    horizontal: true,
    columnas: [
      { titulo: 'Hora', tituloCsv: 'Fecha y hora', ancho: 0.07, pdf: (f) => hora(f.fecha), csv: (f) => fechaHoraCsv(f.fecha) },
      { titulo: 'Concepto', ancho: 0.17, pdf: (f) => etiqueta(CONCEPTO_EFECTIVO)(f.concepto) },
      { titulo: 'Titular', wrap: true, ancho: 0.24, pdf: (f) => f.titular || '—' },
      { titulo: 'DPI', ancho: 0.13, mono: true, texto: true, pdf: (f) => f.cui_dpi },
      { titulo: 'Referencia', wrap: true, ancho: 0.19, mono: true, pdf: (f) => f.referencia || '—' },
      { titulo: 'Estado del depósito', ancho: 0.1, pdf: (f) => (f.estado ? etiqueta(ESTADO_DEPOSITO)(f.estado) : '—') },
      columnaMonto('Monto', 0.1),
    ],
    totales: totalesDeEfectivo,
    nota: NOTA_EFECTIVO,
    firmas: (usuario) => [
      { name: usuario.nombre, role: 'Operador', detail: usuario.codigo, mono: true },
      { name: 'Nombre y firma', role: 'Supervisor o tesorería' },
    ],
    vacio: 'No recibió efectivo ese día.',
  },
  {
    id: 'padron-asociados',
    codigo: 'PADRON_ASOCIADOS',
    titulo: 'Padrón de asociados',
    descripcion: 'Los asociados con su tipo, fecha de ingreso, estado, cuentas activas y documentos obligatorios.',
    icono: Users,
    roles: ['OPERADOR'],
    filtro: 'estado',
    horizontal: true,
    columnas: [
      { titulo: 'Código', ancho: 0.09, mono: true, pdf: (f) => f.codigo || '—' },
      { titulo: 'Nombre', wrap: true, ancho: 0.22, pdf: (f) => f.nombre_completo },
      { titulo: 'DPI', ancho: 0.13, mono: true, texto: true, pdf: (f) => f.cui_dpi },
      { titulo: 'Tipo', ancho: 0.15, pdf: (f) => etiqueta(TIPO_ASOCIADO)(f.tipo || 'SIN_DATO') },
      { titulo: 'Ingreso', ancho: 0.09, pdf: (f) => fechaCorta(f.fecha_ingreso), csv: (f) => f.fecha_ingreso },
      { titulo: 'Estado', ancho: 0.09, pdf: (f) => etiqueta(ESTADO_ASOCIADO)(f.estado) },
      { titulo: 'Cuentas activas', ancho: 0.09, alinear: 'right', pdf: (f) => String(f.cuentas_activas), csv: (f) => f.cuentas_activas },
      { titulo: 'Documentos', ancho: 0.14, pdf: (f) => etiqueta(ESTADO_DOCUMENTOS)(f.documentos) },
    ],
    totales: (r) => [
      { cifras: [{ label: 'Asociados', value: r.total.toLocaleString('es-GT'), strong: true }, ...cifrasDe(r.por_estado, ASOCIADOS_POR_ESTADO)] },
      { titulo: 'Por tipo', cifras: cifrasDe(r.por_tipo, ASOCIADOS_POR_TIPO) },
      { titulo: 'Documentos obligatorios', cifras: cifrasDe(r.por_documentos, ESTADO_DOCUMENTOS) },
    ],
    nota: 'Documentos «Completos»: los cuatro obligatorios aceptados. «En revisión»: entregados y alguno por revisar. «Incompletos»: falta o se rechazó alguno.',
    vacio: 'No hay asociados con ese estado.',
  },
  {
    id: 'cartera-creditos',
    codigo: 'CARTERA_CREDITOS',
    titulo: 'Cartera de créditos',
    descripcion: 'Las solicitudes de crédito del período por estado, con monto, plazo, cuota y quién las atendió.',
    icono: HandCoins,
    roles: ['EJECUTIVO', 'ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      { titulo: 'Solicitud', ancho: 0.07, mono: true, pdf: (f) => `#${f.id_solicitud_credito}`, csv: (f) => f.id_solicitud_credito },
      columnaFecha('Fecha', 0.12, 'fecha_solicitud'),
      { titulo: 'Asociado', wrap: true, ancho: 0.19, pdf: (f) => codigoYNombre(f.asociado_codigo, f.asociado_nombre) },
      columnaMonto('Monto', 0.1),
      { titulo: 'Plazo', ancho: 0.08, alinear: 'right', pdf: (f) => `${f.plazo_meses} meses`, csv: (f) => f.plazo_meses },
      { titulo: 'Tasa', ancho: 0.06, alinear: 'right', pdf: (f) => `${f.tasa_interes.toFixed(2)}%`, csv: (f) => f.tasa_interes },
      { titulo: 'Cuota', ancho: 0.09, alinear: 'right', pdf: (f) => formatQ(f.cuota), csv: (f) => f.cuota },
      { titulo: 'Estado', ancho: 0.12, pdf: (f) => etiqueta(ESTADO_CREDITO)(f.estado) },
      { titulo: 'Operador', ancho: 0.08, mono: true, pdf: (f) => f.operador_codigo || '—' },
      { titulo: 'Ejecutivo', ancho: 0.09, mono: true, pdf: (f) => f.ejecutivo_codigo || '—' },
    ],
    totales: (r) => [
      {
        cifras: [
          { label: 'Solicitudes', value: r.total.cantidad.toLocaleString('es-GT'), strong: true },
          { label: 'Monto solicitado', value: formatQ(r.total.monto), strong: true },
          { label: 'Tasa de aprobación', value: r.tasa_aprobacion === null ? 'Sin resoluciones' : `${r.tasa_aprobacion}%` },
        ],
      },
      tablaDe('Por estado', r.por_grupo, GRUPO_CREDITO, { conMonto: true, columna: 'Estado', cantidad: 'Solicitudes' }),
    ],
    nota: 'La tasa de aprobación cuenta solo las solicitudes resueltas: aprobadas entre aprobadas y denegadas o rechazadas.',
    vacio: 'No hubo solicitudes de crédito en el período.',
  },
  {
    id: 'resoluciones-comite',
    codigo: 'RESOLUCIONES_COMITE',
    titulo: 'Acta de resoluciones del comité',
    descripcion: 'Cada resolución del comité en el período (aprobar, devolver o denegar), con la observación del ejecutivo.',
    icono: Gavel,
    roles: ['EJECUTIVO', 'ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12, 'fecha_resolucion_ejecutivo'),
      { titulo: 'Solicitud', ancho: 0.07, mono: true, pdf: (f) => `#${f.id_solicitud_credito}`, csv: (f) => f.id_solicitud_credito },
      { titulo: 'Asociado', wrap: true, ancho: 0.2, pdf: (f) => codigoYNombre(f.asociado_codigo, f.asociado_nombre) },
      columnaMonto('Monto', 0.09),
      { titulo: 'Plazo', ancho: 0.08, alinear: 'right', pdf: (f) => `${f.plazo_meses} meses`, csv: (f) => f.plazo_meses },
      { titulo: 'Resolución', ancho: 0.1, pdf: (f) => etiqueta(RESOLUCION)(f.resolucion) },
      { titulo: 'Ejecutivo', ancho: 0.1, mono: true, pdf: (f) => f.ejecutivo_codigo || '—' },
      { titulo: 'Observación', wrap: true, ancho: 0.24, pdf: (f) => f.observaciones_ejecutivo || '—' },
    ],
    totales: (r) => [
      {
        cifras: [
          { label: 'Resoluciones', value: r.total.cantidad.toLocaleString('es-GT'), strong: true },
          { label: 'Créditos', value: r.creditos.toLocaleString('es-GT') },
          { label: 'Monto aprobado', value: `${formatQ(r.aprobado.monto)} · ${r.aprobado.cantidad}` },
        ],
      },
      tablaDe('Por resolución', r.por_resolucion, RESOLUCION, { conMonto: true, columna: 'Resolución', cantidad: 'Resoluciones' }),
      tablaDe('Por ejecutivo', r.por_ejecutivo, {}, { columna: 'Ejecutivo', cantidad: 'Resoluciones' }),
    ],
    nota:
      'Cada fila es una resolución: un crédito devuelto y después aprobado aparece dos veces, cada una en su fecha, y ' +
      'su monto cuenta en las dos. «Créditos» cuenta cada crédito una sola vez. De los créditos resueltos antes de que ' +
      'existiera el historial solo se conserva la última resolución.',
    firmas: () => [
      { name: 'Nombre y firma', role: 'Presidente del comité de crédito' },
      { name: 'Nombre y firma', role: 'Secretario del comité de crédito' },
    ],
    vacio: 'El comité no resolvió créditos en el período.',
  },
  {
    id: 'afiliaciones',
    codigo: 'AFILIACIONES',
    titulo: 'Afiliaciones',
    descripcion: 'Los asociados que ingresaron en el período, por canal (en línea, agencia o ventanilla) y tipo.',
    icono: UserPlus,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      { titulo: 'Ingreso', ancho: 0.1, pdf: (f) => fechaCorta(f.fecha_ingreso), csv: (f) => f.fecha_ingreso },
      { titulo: 'Código', ancho: 0.1, mono: true, pdf: (f) => f.codigo || '—' },
      { titulo: 'Nombre', wrap: true, ancho: 0.3, pdf: (f) => f.nombre_completo },
      { titulo: 'DPI', ancho: 0.14, mono: true, texto: true, pdf: (f) => f.cui_dpi },
      { titulo: 'Tipo', ancho: 0.16, pdf: (f) => etiqueta(TIPO_ASOCIADO)(f.tipo || 'SIN_DATO') },
      { titulo: 'Canal', ancho: 0.2, pdf: (f) => etiqueta(CANAL)(f.canal) },
      { titulo: 'Estado', soloCsv: true, pdf: (f) => etiqueta(ESTADO_ASOCIADO)(f.estado) },
    ],
    totales: (r) => [
      { cifras: [{ label: 'Afiliaciones', value: r.total.toLocaleString('es-GT'), strong: true }] },
      { titulo: 'Por canal', cifras: cifrasDe(r.por_canal, CANAL) },
      { titulo: 'Por tipo', cifras: cifrasDe(r.por_tipo, ASOCIADOS_POR_TIPO) },
    ],
    nota:
      'El tipo y el canal se guardan al afiliar. Para los asociados anteriores se deducen: el canal es «Solicitud en ' +
      'agencia» si se formalizó una solicitud de agencia (incluye al personal), «Ventanilla» si pagó la aportación en ' +
      'efectivo o su primera cuenta la abrió un operador, y «En línea» si su primera cuenta se abrió con un débito sin ' +
      'operador. «Sin registro» son asociados cargados antes de que existieran estos trámites.',
    vacio: 'No ingresaron asociados en el período.',
  },
  {
    id: 'auditoria-usuarios',
    codigo: 'AUDITORIA_USUARIOS',
    titulo: 'Auditoría de usuarios',
    descripcion: 'Cambios de estado y de rol de los usuarios (altas, bloqueos, desbloqueos y bajas), con motivo, IP y quién los hizo.',
    icono: ShieldCheck,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12),
      { titulo: 'Usuario', wrap: true, ancho: 0.19, pdf: (f) => codigoYNombre(f.usuario_codigo, f.usuario_nombre) },
      {
        titulo: 'Estado',
        ancho: 0.17,
        pdf: (f) => (f.estado_anterior
          ? `${etiqueta(ESTADO_USUARIO)(f.estado_anterior)} » ${etiqueta(ESTADO_USUARIO)(f.estado_nuevo)}`
          : etiqueta(ESTADO_USUARIO)(f.estado_nuevo)),
      },
      {
        titulo: 'Rol',
        ancho: 0.11,
        pdf: (f) => (f.rol_anterior && f.rol_nuevo && f.rol_anterior !== f.rol_nuevo
          ? `${etiqueta(ROL)(f.rol_anterior)} » ${etiqueta(ROL)(f.rol_nuevo)}`
          : etiqueta(ROL)(f.rol_nuevo || f.rol_anterior)),
      },
      { titulo: 'Hecho por', ancho: 0.07, pdf: (f) => f.modificado_por || 'Sistema' },
      { titulo: 'Motivo', wrap: true, ancho: 0.22, pdf: (f) => f.motivo || '—' },
      { titulo: 'IP', ancho: 0.12, mono: true, pdf: (f) => f.ip_origen || '—' },
      { titulo: 'Navegador', soloCsv: true, pdf: (f) => f.user_agent || '' },
    ],
    totales: (r) => [
      { cifras: [{ label: 'Cambios', value: r.total.toLocaleString('es-GT'), strong: true }, ...cifrasDe(r.por_estado_nuevo, CAMBIOS_POR_ESTADO)] },
      tablaDe('Por responsable', r.por_responsable, { SISTEMA: 'Sistema (bloqueo automático)' }, { columna: 'Hecho por', cantidad: 'Cambios' }),
    ],
    nota: 'Las cifras clasifican cada cambio por el estado en que quedó el usuario: un desbloqueo cuenta como activación.',
    vacio: 'No hubo cambios de estado ni de rol en el período.',
  },
  {
    id: 'efectivo-ventanilla',
    codigo: 'EFECTIVO_VENTANILLA',
    titulo: 'Efectivo de ventanilla',
    descripcion: 'El efectivo que recibieron todos los operadores en el período, por operador y por concepto.',
    icono: Banknote,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12),
      { titulo: 'Operador', ancho: 0.13, pdf: (f) => f.operador_codigo, csv: (f) => codigoYNombre(f.operador_codigo, f.operador_nombre) },
      { titulo: 'Concepto', ancho: 0.16, pdf: (f) => etiqueta(CONCEPTO_EFECTIVO)(f.concepto) },
      { titulo: 'Titular', wrap: true, ancho: 0.19, pdf: (f) => f.titular || '—' },
      { titulo: 'DPI', ancho: 0.12, mono: true, texto: true, pdf: (f) => f.cui_dpi },
      { titulo: 'Referencia', wrap: true, ancho: 0.12, mono: true, pdf: (f) => f.referencia || '—' },
      { titulo: 'Depósito', ancho: 0.07, pdf: (f) => (f.estado ? etiqueta(ESTADO_DEPOSITO)(f.estado) : '—') },
      columnaMonto('Monto', 0.09),
    ],
    totales: (r) => [
      ...totalesDeEfectivo(r),
      tablaDe('Confirmado por operador', r.por_operador, {}, { conMonto: true, columna: 'Operador' }),
    ],
    nota: NOTA_EFECTIVO,
    vacio: 'No se recibió efectivo en el período.',
  },
  {
    id: 'conciliacion',
    codigo: 'CONCILIACION',
    titulo: 'Conciliación con el banco',
    descripcion: 'Los depósitos en ventanilla y las reversiones con el banco del período, con su estado y quién los cerró.',
    icono: Scale,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12),
      { titulo: 'Tipo', ancho: 0.08, pdf: (f) => (f.tipo === 'DEPOSITO' ? 'Depósito' : 'Reversión') },
      { titulo: 'Origen', ancho: 0.13, pdf: (f) => etiqueta(ORIGEN_OPERACION)(f.origen) },
      { titulo: 'Movimiento', ancho: 0.07, pdf: (f) => etiqueta(MOVIMIENTO)(f.movimiento) },
      { titulo: 'Referencia', ancho: 0.15, mono: true, pdf: (f) => f.referencia },
      { titulo: 'Cuenta', ancho: 0.1, mono: true, pdf: (f) => f.cuenta || '—' },
      { titulo: 'DPI', ancho: 0.11, mono: true, texto: true, pdf: (f) => f.cui_dpi || '—' },
      columnaMonto('Monto', 0.09),
      {
        titulo: 'Estado',
        ancho: 0.08,
        pdf: (f) => (f.tipo === 'DEPOSITO' ? etiqueta(ESTADO_DEPOSITO) : etiqueta(ESTADO_REVERSION))(f.estado),
      },
      { titulo: 'Cerró', ancho: 0.07, mono: true, pdf: (f) => f.cerrado_por || (f.fecha_cierre ? 'Sistema' : '—') },
      { titulo: 'Registrado por', soloCsv: true, pdf: (f) => f.registrado_por || '' },
      { titulo: 'Fecha de cierre', soloCsv: true, pdf: (f) => fechaHora(f.fecha_cierre), csv: (f) => fechaHoraCsv(f.fecha_cierre) },
    ],
    totales: (r) => [
      tablaDe('Depósitos en ventanilla', r.depositos, ESTADO_DEPOSITO, { conMonto: true, columna: 'Estado', cantidad: 'Depósitos' }),
      tablaDe('Reversiones', r.reversiones, ESTADO_REVERSION, { conMonto: true, columna: 'Estado', cantidad: 'Reversiones' }),
    ],
    nota: '«Cerró: Sistema» es una reversión que el sistema hizo o descartó por su cuenta, sin intervención del administrador.',
    vacio: 'No hubo depósitos en ventanilla ni reversiones en el período.',
  },
  {
    id: 'accesos-documentos',
    codigo: 'ACCESOS_DOCUMENTOS',
    titulo: 'Accesos a documentos de identidad',
    descripcion: 'Quién abrió qué documento de afiliación y cuándo; distingue al titular del personal.',
    icono: FileSearch,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12),
      { titulo: 'Usuario', ancho: 0.1, mono: true, pdf: (f) => f.usuario_codigo },
      { titulo: 'Rol', ancho: 0.1, pdf: (f) => etiqueta(ROL)(f.rol) },
      { titulo: 'Documento', ancho: 0.16, pdf: (f) => etiquetaDocumento(f.tipo_documento) },
      { titulo: 'Titular', wrap: true, ancho: 0.22, pdf: (f) => f.titular_nombre || '—' },
      { titulo: 'DPI del titular', ancho: 0.13, mono: true, texto: true, pdf: (f) => f.titular_dpi },
      { titulo: 'Quién', ancho: 0.07, pdf: (f) => (f.es_titular ? 'Titular' : 'Personal') },
      { titulo: 'IP', ancho: 0.1, mono: true, pdf: (f) => f.ip_origen || '—' },
      { titulo: 'Navegador', soloCsv: true, pdf: (f) => f.user_agent || '' },
    ],
    totales: (r) => [
      {
        cifras: [
          { label: 'Accesos', value: r.total.toLocaleString('es-GT'), strong: true },
          { label: 'Del personal', value: r.del_personal.toLocaleString('es-GT') },
          { label: 'Del titular', value: (r.total - r.del_personal).toLocaleString('es-GT') },
        ],
      },
      tablaDe('Accesos del personal por usuario', r.por_usuario, {}, { columna: 'Usuario', cantidad: 'Accesos' }),
    ],
    vacio: 'Nadie abrió documentos de afiliación en el período.',
  },
  {
    id: 'reportes-generados',
    codigo: 'REPORTES_GENERADOS',
    titulo: 'Reportes generados',
    descripcion: 'Quién generó cada reporte, cuándo, en qué formato, con qué filtros y con qué totales.',
    icono: History,
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    horizontal: true,
    columnas: [
      columnaFecha('Fecha', 0.12),
      { titulo: 'Usuario', ancho: 0.07, mono: true, pdf: (f) => f.usuario_codigo },
      { titulo: 'Rol', ancho: 0.1, pdf: (f) => etiqueta(ROL)(f.rol) },
      { titulo: 'Reporte', wrap: true, ancho: 0.15, pdf: (f) => tituloDeReporte(f.tipo_reporte) },
      { titulo: 'Formato', ancho: 0.06, pdf: (f) => f.formato },
      { titulo: 'Filtros', wrap: true, ancho: 0.13, pdf: (f) => textoDeFiltros(f.parametros) },
      { titulo: 'Filas', ancho: 0.05, alinear: 'right', pdf: (f) => f.filas.toLocaleString('es-GT'), csv: (f) => f.filas },
      // Las cifras con que se generó: con ellas se coteja un reporte impreso (issue #95)
      { titulo: 'Totales', wrap: true, ancho: 0.19, pdf: (f) => totalesBreves(f.resumen) },
      { titulo: 'IP', wrap: true, ancho: 0.13, mono: true, pdf: (f) => f.ip_origen || '—' },
    ],
    totales: (r) => [
      { cifras: [{ label: 'Reportes', value: r.total.toLocaleString('es-GT'), strong: true }] },
      tablaDe('Por reporte', r.por_tipo.map((g) => ({ ...g, clave: tituloDeReporte(g.clave) })), {}, { columna: 'Reporte', cantidad: 'Veces' }),
      tablaDe('Por usuario', r.por_usuario, {}, { columna: 'Usuario', cantidad: 'Reportes' }),
    ],
    vacio: 'Nadie generó reportes en el período.',
  },
];

/**
 * Las cifras principales de un reporte, tal como quedaron registradas (`reportes_generados.resumen`): con ellas se
 * coteja un reporte impreso por su folio.
 *
 * @param {Object} [r] - Resumen del reporte.
 * @returns {string}
 */
export function totalesBreves(r) {
  if (!r || Object.keys(r).length === 0) return '—';
  if (r.confirmado) return `${formatQ(r.confirmado.monto)} confirmado en ${r.confirmado.cantidad} operaciones`;
  if (r.aprobado && r.total) return `${r.total.cantidad} resoluciones; ${formatQ(r.aprobado.monto)} aprobado`;
  if (r.total && typeof r.total === 'object') return `${formatQ(r.total.monto)} · ${r.total.cantidad} registros`;
  if (r.depositos || r.reversiones) {
    const suma = (grupos = []) => grupos.reduce((acc, g) => acc + g.cantidad, 0);
    return `${suma(r.depositos)} depósitos, ${suma(r.reversiones)} reversiones`;
  }
  if (typeof r.total === 'number') return `${r.total.toLocaleString('es-GT')} en total`;
  return '—';
}

/** Título de un reporte por su código (`CARTERA_CREDITOS`). */
export function tituloDeReporte(codigo) {
  return REPORTES.find((r) => r.codigo === codigo)?.titulo || codigo;
}

/** Reportes que puede sacar un rol. */
export const reportesDelRol = (rol) => REPORTES.filter((r) => r.roles.includes(rol));

/** Nombre de archivo sin tildes ni espacios: "Cartera_de_creditos_REP-000123_2026-10-01_al_2026-10-31.pdf". */
export const nombreDeArchivo = (definicion, reporte, extension) => {
  const { desde, hasta, fecha, estado } = reporte.filtros || {};
  const filtros = fecha || (desde ? `${desde}_al_${hasta}` : estado || 'todos');
  const base = `${definicion.titulo}_${reporte.folio}_${filtros}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base}.${extension}`;
};

/**
 * Encabezados y filas del CSV de un reporte (todas las columnas, también las que no caben en el PDF).
 *
 * @param {DefinicionReporte} definicion
 * @param {Object} reporte - Respuesta del servidor.
 * @returns {{ encabezados: string[], filas: Array<Array<*>> }}
 */
export const tablaCsv = (definicion, reporte) => ({
  encabezados: definicion.columnas.map((c) => c.tituloCsv || c.titulo),
  // En una hoja de cálculo, un dato que falta va vacío (en el PDF se marca con «—»)
  filas: reporte.filas.map((fila) => definicion.columnas.map((c) => {
    const valor = (c.csv || c.pdf)(fila);
    if (valor === '—') return '';
    return c.texto ? { textoFijo: valor } : valor;
  })),
});
