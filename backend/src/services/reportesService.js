const { DOCUMENTOS, REPORTES: LIMITES } = require('../config/constants');
const { errorDeNegocio } = require('../utils/errores');
const { entreDiasGuatemala } = require('../utils/fechas');

/**
 * Reportes de gestión del personal (issue #85). El servidor arma los datos con los filtros y los permisos de cada
 * reporte; el navegador los convierte en PDF o CSV. Cada reporte declara:
 *
 * - `codigo`: con el que queda en `reportes_generados` (la restricción chk_reportes_generados_tipo los lista).
 * - `roles`: quiénes lo sacan (los mismos de frontend/src/utils/reporteria/definiciones.js).
 * - `filtro`: `periodo` (desde y hasta), `dia` (una fecha) o `estado` (estado del asociado, opcional).
 * - `filas(cliente, parametros)`: hasta MAX_FILAS + 1 filas, para saber si se pasa del límite.
 * - `resumir(filas)`: totales del reporte, sobre todas sus filas.
 */

/**
 * @typedef {Object} ParametrosReporte
 * @property {string} [desde] - AAAA-MM-DD (filtro `periodo`).
 * @property {string} [hasta] - AAAA-MM-DD, incluido (filtro `periodo`).
 * @property {string} [fecha] - AAAA-MM-DD (filtro `dia`).
 * @property {string} [estado] - Estado del asociado (filtro `estado`).
 * @property {number} idUsuario - Quien pide el reporte.
 */

/**
 * @callback ConsultaReporte
 * @param {{ query: Function }} cliente
 * @param {ParametrosReporte} parametros
 * @returns {Promise<Object[]>} Hasta MAX_FILAS + 1 filas.
 */

const { MAX_FILAS } = LIMITES;
const LIMITE_SQL = `LIMIT ${MAX_FILAS + 1}`;

// Los montos se suman en centavos: sumar decimales en coma flotante acumula errores
const aCentavos = (monto) => Math.round(Number(monto) * 100);
const deCentavos = (centavos) => centavos / 100;

/**
 * Cantidad y monto por cada valor de `clave`, en el orden en que aparecen.
 *
 * @param {Object[]} filas
 * @param {string|Function} clave - Propiedad o función que da el grupo de cada fila.
 * @param {{ conMonto?: boolean }} [opciones]
 * @returns {Array<{ clave: string, cantidad: number, monto?: number }>}
 */
const agrupar = (filas, clave, { conMonto = false } = {}) => {
  const grupos = new Map();
  for (const fila of filas) {
    const valor = (typeof clave === 'function' ? clave(fila) : fila[clave]) ?? 'SIN_DATO';
    const grupo = grupos.get(valor) || { clave: valor, cantidad: 0, centavos: 0 };
    grupo.cantidad += 1;
    if (conMonto) grupo.centavos += aCentavos(fila.monto);
    grupos.set(valor, grupo);
  }
  return [...grupos.values()].map(({ centavos, ...grupo }) => (conMonto ? { ...grupo, monto: deCentavos(centavos) } : grupo));
};

/** Cantidad y suma de los montos de unas filas. */
const total = (filas) => ({
  cantidad: filas.length,
  monto: deCentavos(filas.reduce((suma, fila) => suma + aCentavos(fila.monto), 0)),
});

const conMontoNumerico = (filas) => filas.map((fila) => ({ ...fila, monto: Number(fila.monto) }));

// ---------------------------------------------------------------------------------------------------------------
// Efectivo de ventanilla (cierre de caja del operador y reporte del administrador)
// ---------------------------------------------------------------------------------------------------------------

const DEPOSITO_CONFIRMADO = ['ACREDITADO'];
const DEPOSITO_POR_CONCILIAR = ['PENDIENTE', 'SIN_CONFIRMAR'];

/**
 * Efectivo recibido en ventanilla y depósitos a cuentas del banco en el período, de un operador o de todos.
 *
 * @param {{ query: Function }} cliente
 * @param {{ desde: string, hasta: string, idOperador?: number, todos?: boolean }} parametros - `todos` se pide de forma
 *   explícita: sin él y sin un operador válido, la consulta falla en lugar de traer el efectivo de todos.
 * @returns {Promise<Object[]>}
 * @throws {Error} si no se indica el operador ni `todos`.
 */
const movimientosDeEfectivo = async (cliente, { desde, hasta, idOperador, todos = false }) => {
  if (!todos && !(Number.isInteger(idOperador) && idOperador > 0)) {
    throw new Error('movimientosDeEfectivo: falta el operador del cierre de caja');
  }
  const delOperador = (columna) => (todos ? '' : `AND ${columna} = $3`);
  const { rows } = await cliente.query(
    `SELECT * FROM (
       SELECT e.fecha_registro AS fecha, e.origen AS concepto, e.cui_dpi, pt.nombre_completo AS titular, e.monto,
              e.referencia, NULL::varchar AS estado, u.codigo_corporativo AS operador_codigo,
              po.nombre_completo AS operador_nombre
       FROM efectivo_ventanilla e
       JOIN usuarios u ON u.id_usuario = e.id_usuario_operador
       JOIN personas po ON po.id_persona = u.id_persona
       LEFT JOIN personas pt ON pt.cui_dpi = e.cui_dpi
       WHERE ${entreDiasGuatemala('e.fecha_registro', 1)} ${delOperador('e.id_usuario_operador')}
       UNION ALL
       SELECT d.fecha_deposito, 'DEPOSITO_BANCO', d.titular_cui, pt.nombre_completo, d.monto,
              d.referencia, d.estado, u.codigo_corporativo, po.nombre_completo
       FROM depositos_ventanilla_banco d
       JOIN usuarios u ON u.id_usuario = d.id_usuario_operador
       JOIN personas po ON po.id_persona = u.id_persona
       LEFT JOIN personas pt ON pt.cui_dpi = d.titular_cui
       WHERE ${entreDiasGuatemala('d.fecha_deposito', 1)} ${delOperador('d.id_usuario_operador')}
     ) movimientos
     ORDER BY fecha, referencia
     ${LIMITE_SQL}`,
    todos ? [desde, hasta] : [desde, hasta, idOperador]
  );
  return conMontoNumerico(rows);
};

/**
 * Totales del efectivo: lo confirmado (efectivo recibido y depósitos acreditados en el banco), los depósitos que
 * esperan conciliación y los que el banco no hizo (rechazados o revertidos, que no se cobraron).
 *
 * @param {Object[]} filas
 * @returns {Object}
 */
const resumirEfectivo = (filas) => {
  const esDeposito = (fila) => fila.concepto === 'DEPOSITO_BANCO';
  const confirmadas = filas.filter((fila) => !esDeposito(fila) || DEPOSITO_CONFIRMADO.includes(fila.estado));
  const porConciliar = filas.filter((fila) => esDeposito(fila) && DEPOSITO_POR_CONCILIAR.includes(fila.estado));
  const noCobradas = filas.filter(
    (fila) => esDeposito(fila) && !DEPOSITO_CONFIRMADO.includes(fila.estado) && !DEPOSITO_POR_CONCILIAR.includes(fila.estado)
  );
  return {
    confirmado: total(confirmadas),
    por_concepto: agrupar(confirmadas, 'concepto', { conMonto: true }),
    por_operador: agrupar(confirmadas, (fila) => `${fila.operador_codigo} · ${fila.operador_nombre}`, { conMonto: true }),
    por_conciliar: total(porConciliar),
    no_cobrado: total(noCobradas),
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Padrón de asociados
// ---------------------------------------------------------------------------------------------------------------

/**
 * Estado de los documentos obligatorios, con la misma regla que `documentosAfiliacionService.resumirDocumentos`.
 *
 * @param {number} entregados - Obligatorios vigentes pendientes o aceptados.
 * @param {number} pendientes - Obligatorios vigentes por revisar.
 * @returns {'COMPLETO'|'EN_REVISION'|'INCOMPLETO'}
 */
const estadoDocumentos = (entregados, pendientes) => {
  if (entregados < DOCUMENTOS.OBLIGATORIOS.length) return 'INCOMPLETO';
  return pendientes > 0 ? 'EN_REVISION' : 'COMPLETO';
};

/** Asociados con su tipo, cuentas activas y estado de documentos. @type {ConsultaReporte} */
const padronDeAsociados = async (cliente, { estado }) => {
  const { rows } = await cliente.query(
    `SELECT u.codigo_corporativo AS codigo, p.nombre_completo, p.cui_dpi,
            CASE WHEN u.codigo_corporativo LIKE 'EB-%' THEN 'EB' WHEN u.codigo_corporativo LIKE 'EX-%' THEN 'EX' END AS tipo,
            to_char(a.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso, a.estado_asociado AS estado,
            (SELECT COUNT(*) FROM cuentas c WHERE c.id_asociado = a.id_asociado AND c.estado = 'ACTIVA')::int AS cuentas_activas,
            COALESCE(doc.entregados, 0) AS entregados, COALESCE(doc.pendientes, 0) AS pendientes
     FROM asociados a
     JOIN personas p ON p.id_persona = a.id_persona
     LEFT JOIN usuarios u ON u.id_persona = a.id_persona AND u.id_rol = 3 /* ASOCIADO */
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE d.estado IN ('PENDIENTE', 'ACEPTADO'))::int AS entregados,
              COUNT(*) FILTER (WHERE d.estado = 'PENDIENTE')::int AS pendientes
       FROM expedientes_documentos x
       JOIN documentos_afiliacion d ON d.id_expediente = x.id_expediente
       WHERE x.id_persona = a.id_persona AND d.estado <> 'REEMPLAZADO' AND d.tipo_documento = ANY($2::text[])
     ) doc ON true
     WHERE ($1::text IS NULL OR a.estado_asociado = $1)
     ORDER BY p.primer_apellido, p.primer_nombre, a.id_asociado
     ${LIMITE_SQL}`,
    [estado || null, DOCUMENTOS.OBLIGATORIOS]
  );
  return rows.map(({ entregados, pendientes, ...fila }) => ({ ...fila, documentos: estadoDocumentos(entregados, pendientes) }));
};

/** Totales del padrón por estado, tipo y documentos. @param {Object[]} filas @returns {Object} */
const resumirPadron = (filas) => ({
  total: filas.length,
  por_estado: agrupar(filas, 'estado'),
  por_tipo: agrupar(filas, 'tipo'),
  por_documentos: agrupar(filas, 'documentos'),
});

// ---------------------------------------------------------------------------------------------------------------
// Créditos (cartera y acta del comité)
// ---------------------------------------------------------------------------------------------------------------

/** Grupo de un estado de crédito para los totales de la cartera. */
const GRUPO_CREDITO = {
  PENDIENTE_FIRMA: 'EN_TRAMITE',
  EN_REVISION_OPERADOR: 'EN_TRAMITE',
  EN_AUTORIZACION_EJECUTIVO: 'EN_TRAMITE',
  DEVUELTA_OPERADOR: 'EN_TRAMITE',
  PENDIENTE: 'EN_TRAMITE',
  APROBADA: 'APROBADA',
  APROBADO: 'APROBADA',
  DESEMBOLSADA: 'APROBADA',
  DENEGADA: 'NO_APROBADA',
  RECHAZADA: 'NO_APROBADA',
  RECHAZADO: 'NO_APROBADA',
  CANCELADA: 'CANCELADA',
};

const COLUMNAS_CREDITO = `
  sc.id_solicitud_credito, sc.fecha_solicitud, sc.estado, sc.monto_solicitado AS monto, sc.plazo_meses,
  sc.tasa_interes, sc.cuota_mensual_estimada AS cuota,
  ua.codigo_corporativo AS asociado_codigo, p.nombre_completo AS asociado_nombre,
  uo.codigo_corporativo AS operador_codigo, ue.codigo_corporativo AS ejecutivo_codigo,
  pe.nombre_completo AS ejecutivo_nombre, sc.fecha_resolucion_ejecutivo`;

const UNIONES_CREDITO = `
  FROM solicitudes_credito sc
  JOIN asociados a ON a.id_asociado = sc.id_asociado
  JOIN personas p ON p.id_persona = a.id_persona
  LEFT JOIN usuarios ua ON ua.id_persona = a.id_persona AND ua.id_rol = 3 /* ASOCIADO */
  LEFT JOIN usuarios uo ON uo.id_usuario = sc.id_operador_revisa
  LEFT JOIN usuarios ue ON ue.id_usuario = sc.id_ejecutivo_resuelve
  LEFT JOIN personas pe ON pe.id_persona = ue.id_persona`;

const creditoConNumeros = (fila) => ({
  ...fila,
  monto: Number(fila.monto),
  tasa_interes: Number(fila.tasa_interes),
  cuota: Number(fila.cuota),
  grupo: GRUPO_CREDITO[fila.estado] || 'EN_TRAMITE',
});

/** Solicitudes de crédito presentadas en el período. @type {ConsultaReporte} */
const carteraDeCreditos = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT ${COLUMNAS_CREDITO} ${UNIONES_CREDITO}
     WHERE ${entreDiasGuatemala('sc.fecha_solicitud', 1)}
     ORDER BY sc.fecha_solicitud, sc.id_solicitud_credito
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows.map(creditoConNumeros);
};

/** Totales de la cartera por grupo y tasa de aprobación. @param {Object[]} filas @returns {Object} */
const resumirCartera = (filas) => {
  const porGrupo = agrupar(filas, 'grupo', { conMonto: true });
  const cantidad = (grupo) => porGrupo.find((g) => g.clave === grupo)?.cantidad || 0;
  const resueltas = cantidad('APROBADA') + cantidad('NO_APROBADA');
  return {
    total: total(filas),
    por_grupo: porGrupo,
    // De las que se resolvieron (sin las que siguen en trámite ni las que el asociado canceló)
    tasa_aprobacion: resueltas > 0 ? Math.round((cantidad('APROBADA') / resueltas) * 1000) / 10 : null,
  };
};

/**
 * Resoluciones del comité en el período, del historial `resoluciones_credito` (issue #89): un crédito devuelto y luego
 * aprobado aparece dos veces, cada una con su fecha, su ejecutivo y su observación.
 *
 * @type {ConsultaReporte}
 */
const resolucionesDelComite = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT sc.id_solicitud_credito, sc.fecha_solicitud, sc.estado, sc.monto_solicitado AS monto, sc.plazo_meses,
            sc.tasa_interes, sc.cuota_mensual_estimada AS cuota,
            ua.codigo_corporativo AS asociado_codigo, p.nombre_completo AS asociado_nombre,
            uo.codigo_corporativo AS operador_codigo, ue.codigo_corporativo AS ejecutivo_codigo,
            pe.nombre_completo AS ejecutivo_nombre, r.fecha_resolucion AS fecha_resolucion_ejecutivo,
            r.resolucion, r.observaciones AS observaciones_ejecutivo
     FROM resoluciones_credito r
     JOIN solicitudes_credito sc ON sc.id_solicitud_credito = r.id_solicitud_credito
     JOIN asociados a ON a.id_asociado = sc.id_asociado
     JOIN personas p ON p.id_persona = a.id_persona
     LEFT JOIN usuarios ua ON ua.id_persona = a.id_persona AND ua.id_rol = 3 /* ASOCIADO */
     LEFT JOIN usuarios uo ON uo.id_usuario = sc.id_operador_revisa
     JOIN usuarios ue ON ue.id_usuario = r.id_usuario_resuelve
     JOIN personas pe ON pe.id_persona = ue.id_persona
     WHERE ${entreDiasGuatemala('r.fecha_resolucion', 1)}
     ORDER BY r.fecha_resolucion, r.id_resolucion
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows.map(creditoConNumeros);
};

/** Totales del acta por resolución y por ejecutivo. @param {Object[]} filas @returns {Object} */
const resumirResoluciones = (filas) => ({
  total: total(filas),
  // Un crédito devuelto y luego aprobado cuenta dos resoluciones pero un solo crédito
  creditos: new Set(filas.map((fila) => fila.id_solicitud_credito)).size,
  aprobado: total(filas.filter((fila) => fila.resolucion === 'APROBADA')),
  por_resolucion: agrupar(filas, 'resolucion', { conMonto: true }),
  por_ejecutivo: agrupar(filas, (fila) => `${fila.ejecutivo_codigo} · ${fila.ejecutivo_nombre}`),
});

// ---------------------------------------------------------------------------------------------------------------
// Afiliaciones
// ---------------------------------------------------------------------------------------------------------------

/**
 * Asociados que ingresaron en el período, con su tipo y el canal por el que se afiliaron. El canal sale de lo que
 * dejó cada trámite: una solicitud de agencia atendida (agencia, incluido el personal), la aportación en efectivo al
 * afiliar (ventanilla; un cliente externo no abre cuenta en la cooperativa), o el primer movimiento de sus cuentas sin
 * operador (en línea) o con operador (ventanilla). Sin ninguno (datos semilla), SIN_DATO.
 *
 * @type {ConsultaReporte}
 */
const afiliaciones = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT to_char(a.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso, u.codigo_corporativo AS codigo,
            p.nombre_completo, p.cui_dpi, a.estado_asociado AS estado,
            CASE WHEN u.codigo_corporativo LIKE 'EB-%' THEN 'EB' WHEN u.codigo_corporativo LIKE 'EX-%' THEN 'EX' END AS tipo,
            CASE
              WHEN EXISTS (SELECT 1 FROM solicitudes_afiliacion_agencia s WHERE s.cui_dpi = p.cui_dpi AND s.estado = 'ATENDIDA')
                THEN 'AGENCIA'
              WHEN EXISTS (SELECT 1 FROM efectivo_ventanilla e WHERE e.cui_dpi = p.cui_dpi AND e.origen = 'AFILIACION_PRESENCIAL')
                THEN 'VENTANILLA'
              WHEN apertura.id_transaccion IS NOT NULL AND apertura.id_usuario_registra IS NULL THEN 'EN_LINEA'
              WHEN apertura.id_transaccion IS NOT NULL THEN 'VENTANILLA'
              ELSE 'SIN_DATO'
            END AS canal
     FROM asociados a
     JOIN personas p ON p.id_persona = a.id_persona
     LEFT JOIN usuarios u ON u.id_persona = a.id_persona AND u.id_rol = 3 /* ASOCIADO */
     LEFT JOIN LATERAL (
       SELECT t.id_transaccion, t.id_usuario_registra
       FROM transacciones t JOIN cuentas c ON c.id_cuenta = t.id_cuenta
       WHERE c.id_asociado = a.id_asociado
       ORDER BY t.fecha_transaccion, t.id_transaccion
       LIMIT 1
     ) apertura ON true
     WHERE a.fecha_ingreso BETWEEN $1::date AND $2::date
     ORDER BY a.fecha_ingreso, a.id_asociado
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows;
};

/** Totales de afiliaciones por canal y tipo. @param {Object[]} filas @returns {Object} */
const resumirAfiliaciones = (filas) => ({
  total: filas.length,
  por_canal: agrupar(filas, 'canal'),
  por_tipo: agrupar(filas, 'tipo'),
});

// ---------------------------------------------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------------------------------------------

/** Cambios de estado y de rol de los usuarios en el período. @type {ConsultaReporte} */
const auditoriaDeUsuarios = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT h.fecha_cambio AS fecha, um.codigo_corporativo AS usuario_codigo, pm.nombre_completo AS usuario_nombre,
            h.estado_anterior, h.estado_nuevo, ra.codigo AS rol_anterior, rn.codigo AS rol_nuevo,
            up.codigo_corporativo AS modificado_por, h.motivo, h.ip_origen, h.user_agent
     FROM historial_estados_usuario h
     JOIN usuarios um ON um.id_usuario = h.id_usuario_modificado
     JOIN personas pm ON pm.id_persona = um.id_persona
     LEFT JOIN roles ra ON ra.id_rol = h.id_rol_anterior
     LEFT JOIN roles rn ON rn.id_rol = h.id_rol_nuevo
     LEFT JOIN usuarios up ON up.id_usuario = h.id_modificado_por
     WHERE ${entreDiasGuatemala('h.fecha_cambio', 1)}
     ORDER BY h.fecha_cambio, h.id_historial_estado
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows;
};

/** Totales de la auditoría por estado nuevo y por responsable. @param {Object[]} filas @returns {Object} */
const resumirAuditoria = (filas) => ({
  total: filas.length,
  por_estado_nuevo: agrupar(filas, 'estado_nuevo'),
  por_responsable: agrupar(filas, (fila) => fila.modificado_por || 'SISTEMA'),
});

/** Depósitos en ventanilla y reversiones con el banco del período. @type {ConsultaReporte} */
const conciliacion = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT * FROM (
       SELECT 'DEPOSITO' AS tipo, d.fecha_deposito AS fecha, d.referencia, 'CREDITO' AS movimiento,
              'DEPOSITO_VENTANILLA' AS origen, d.numero_cuenta_bancaria AS cuenta, d.titular_cui AS cui_dpi, d.monto,
              d.estado, u.codigo_corporativo AS registrado_por, uc.codigo_corporativo AS cerrado_por,
              d.fecha_conciliacion AS fecha_cierre
       FROM depositos_ventanilla_banco d
       JOIN usuarios u ON u.id_usuario = d.id_usuario_operador
       LEFT JOIN usuarios uc ON uc.id_usuario = d.id_usuario_concilia
       WHERE ${entreDiasGuatemala('d.fecha_deposito', 1)}
       UNION ALL
       SELECT 'REVERSION', r.fecha_registro, r.referencia_reversion, r.tipo_movimiento, r.origen,
              r.numero_cuenta_bancaria, r.cui_dpi, r.monto, r.estado, NULL, ur.codigo_corporativo, r.fecha_resolucion
       FROM reversiones_pendientes r
       LEFT JOIN usuarios ur ON ur.id_usuario = r.id_usuario_resuelve
       WHERE ${entreDiasGuatemala('r.fecha_registro', 1)}
     ) operaciones
     ORDER BY fecha, referencia
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return conMontoNumerico(rows);
};

/** Totales de depósitos y reversiones por estado. @param {Object[]} filas @returns {Object} */
const resumirConciliacion = (filas) => ({
  depositos: agrupar(filas.filter((fila) => fila.tipo === 'DEPOSITO'), 'estado', { conMonto: true }),
  reversiones: agrupar(filas.filter((fila) => fila.tipo === 'REVERSION'), 'estado', { conMonto: true }),
});

/**
 * Quién abrió los documentos de afiliación en el período. `es_titular` es el dueño que abre los suyos con su usuario de
 * asociado; un colaborador que abre su propio expediente con su usuario del personal cuenta como personal.
 *
 * @type {ConsultaReporte}
 */
const accesosADocumentos = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT ac.fecha_acceso AS fecha, u.codigo_corporativo AS usuario_codigo, r.codigo AS rol, d.tipo_documento,
            x.cui_dpi AS titular_dpi,
            COALESCE(pt.nombre_completo, TRIM(CONCAT(s.primer_nombre, ' ', s.primer_apellido))) AS titular_nombre,
            COALESCE(u.id_rol = 3 /* ASOCIADO */ AND u.id_persona = x.id_persona, false) AS es_titular, ac.ip_origen, ac.user_agent
     FROM accesos_documento ac
     JOIN usuarios u ON u.id_usuario = ac.id_usuario
     JOIN roles r ON r.id_rol = u.id_rol
     JOIN documentos_afiliacion d ON d.id_documento = ac.id_documento
     JOIN expedientes_documentos x ON x.id_expediente = d.id_expediente
     LEFT JOIN personas pt ON pt.id_persona = x.id_persona
     LEFT JOIN solicitudes_afiliacion_agencia s ON s.id_solicitud = x.id_solicitud
     WHERE ${entreDiasGuatemala('ac.fecha_acceso', 1)}
     ORDER BY ac.fecha_acceso, ac.id_acceso
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows;
};

/** Totales de accesos por rol y por usuario del personal. @param {Object[]} filas @returns {Object} */
const resumirAccesos = (filas) => ({
  total: filas.length,
  del_personal: filas.filter((fila) => !fila.es_titular).length,
  por_rol: agrupar(filas, 'rol'),
  por_usuario: agrupar(filas.filter((fila) => !fila.es_titular), 'usuario_codigo'),
});

/** Reportes que sacó el personal en el período, con el rol que tenía al sacarlos. @type {ConsultaReporte} */
const reportesGenerados = async (cliente, { desde, hasta }) => {
  const { rows } = await cliente.query(
    `SELECT rg.fecha_generacion AS fecha, u.codigo_corporativo AS usuario_codigo, r.codigo AS rol, rg.tipo_reporte,
            rg.formato, rg.parametros, rg.filas, rg.resumen, rg.ip_origen
     FROM reportes_generados rg
     JOIN usuarios u ON u.id_usuario = rg.id_usuario
     JOIN roles r ON r.id_rol = rg.id_rol
     WHERE ${entreDiasGuatemala('rg.fecha_generacion', 1)}
     ORDER BY rg.fecha_generacion, rg.id_reporte
     ${LIMITE_SQL}`,
    [desde, hasta]
  );
  return rows;
};

/** Totales de reportes por tipo y por usuario. @param {Object[]} filas @returns {Object} */
const resumirReportesGenerados = (filas) => ({
  total: filas.length,
  por_tipo: agrupar(filas, 'tipo_reporte'),
  por_usuario: agrupar(filas, 'usuario_codigo'),
});

// ---------------------------------------------------------------------------------------------------------------

const ACORTAR_PERIODO = 'Acorte el período.';

/** Reportes por su nombre en la URL (`/api/reportes/:tipo`). */
const REPORTES = Object.freeze({
  'cierre-caja': {
    codigo: 'CIERRE_CAJA',
    roles: ['OPERADOR'],
    filtro: 'dia',
    // Solo el efectivo que recibió quien lo pide: nadie saca el cierre de caja de otro
    filas: (cliente, { fecha, idUsuario }) => movimientosDeEfectivo(cliente, { desde: fecha, hasta: fecha, idOperador: idUsuario }),
    resumir: resumirEfectivo,
    siSePasa: 'Hay demasiados movimientos ese día para un solo reporte.',
  },
  'padron-asociados': {
    codigo: 'PADRON_ASOCIADOS',
    roles: ['OPERADOR'],
    filtro: 'estado',
    filas: padronDeAsociados,
    resumir: resumirPadron,
    siSePasa: 'Filtre por estado.',
  },
  'cartera-creditos': {
    codigo: 'CARTERA_CREDITOS',
    roles: ['EJECUTIVO', 'ADMINISTRADOR'],
    filtro: 'periodo',
    filas: carteraDeCreditos,
    resumir: resumirCartera,
  },
  'resoluciones-comite': {
    codigo: 'RESOLUCIONES_COMITE',
    roles: ['EJECUTIVO', 'ADMINISTRADOR'],
    filtro: 'periodo',
    filas: resolucionesDelComite,
    resumir: resumirResoluciones,
  },
  afiliaciones: {
    codigo: 'AFILIACIONES',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: afiliaciones,
    resumir: resumirAfiliaciones,
  },
  'auditoria-usuarios': {
    codigo: 'AUDITORIA_USUARIOS',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: auditoriaDeUsuarios,
    resumir: resumirAuditoria,
  },
  'efectivo-ventanilla': {
    codigo: 'EFECTIVO_VENTANILLA',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: (cliente, { desde, hasta }) => movimientosDeEfectivo(cliente, { desde, hasta, todos: true }),
    resumir: resumirEfectivo,
  },
  conciliacion: {
    codigo: 'CONCILIACION',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: conciliacion,
    resumir: resumirConciliacion,
  },
  'accesos-documentos': {
    codigo: 'ACCESOS_DOCUMENTOS',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: accesosADocumentos,
    resumir: resumirAccesos,
  },
  'reportes-generados': {
    codigo: 'REPORTES_GENERADOS',
    roles: ['ADMINISTRADOR'],
    filtro: 'periodo',
    filas: reportesGenerados,
    resumir: resumirReportesGenerados,
  },
});

/**
 * Datos de un reporte con sus totales.
 *
 * @param {{ query: Function }} cliente
 * @param {string} tipo - Clave de REPORTES.
 * @param {Object} parametros - Filtros ya validados y `idUsuario` de quien lo pide.
 * @returns {Promise<{ filas: Object[], resumen: Object }>}
 * @throws {Error} 422 si pasa de MAX_FILAS (un reporte cortado tendría totales falsos).
 */
const datosDelReporte = async (cliente, tipo, parametros) => {
  const reporte = REPORTES[tipo];
  const filas = await reporte.filas(cliente, parametros);
  if (filas.length > MAX_FILAS) {
    throw errorDeNegocio(
      422,
      `El reporte pasa de ${MAX_FILAS.toLocaleString('es-GT')} filas. ${reporte.siSePasa || ACORTAR_PERIODO}`
    );
  }
  return { filas, resumen: reporte.resumir(filas) };
};

module.exports = { REPORTES, datosDelReporte, estadoDocumentos };
