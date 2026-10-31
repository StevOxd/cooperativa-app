// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testReportes.js (issue #85)
 *
 * - Solo el personal saca reportes, y cada rol solo los suyos (403 los demás; 404 uno que no existe).
 * - Los filtros se validan: formato PDF o CSV, fechas reales, período ordenado y de un año como máximo.
 * - El cierre de caja es del operador que lo pide: no se puede pedir el de otro, y cuenta el día de Guatemala.
 * - Los datos y los totales de cada reporte cuadran con lo que hay en la base.
 * - Cada reporte queda registrado (folio REP-XXXXXX) y el registro es de solo inserción.
 * - Un reporte que pasa del máximo de filas no se entrega cortado (422).
 *
 * Usa el backend en proceso y la base de datos local. Crea su propio personal y un asociado con efectivo, depósitos,
 * créditos, un cambio de estado, un documento con un acceso y una reversión; limpia todo al terminar.
 */
const crypto = require('crypto');
const { server } = require('./src/server');
const db = require('./src/config/db');
const { REPORTES: LIMITES } = require('./src/config/constants');
const { datosDelReporte, estadoDocumentos } = require('./src/services/reportesService');
const {
  makeRequest,
  poolDueno,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  purgarReversionesDePrueba,
} = require('./testHelper');

/** Fecha en Guatemala desplazada `dias` días (AAAA-MM-DD). */
const diaGuatemala = (dias = 0) =>
  new Date(Date.now() + dias * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Guatemala' });

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  const request = (ruta, token = null) => makeRequest(port, ruta, 'GET', null, token);
  const { assert, getStats } = createTestReporter();

  console.log('\n=============================================================');
  console.log('[SUITE] REPORTES DE GESTIÓN (#85)');
  console.log('=============================================================\n');

  const sufijo = String(Date.now()).slice(-7);
  const unico = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dpi = (prefijo) => `${prefijo}${sufijo}000`.slice(0, 13);
  const tokens = [];
  const asociados = [];
  const personal = [];
  const referenciaReversion = `TEST-REP-${sufijo}`;
  const hoy = diaGuatemala();
  const periodo = `desde=${hoy}&hasta=${hoy}`;
  // Día pasado para probar los bordes del cierre de caja (medianoche de Guatemala)
  const diaBorde = '2026-01-15';
  let errorInesperado = false;

  try {
    const login = async (identifier) => {
      const token = (await makeRequest(port, '/api/auth/login', 'POST', { identifier, password: 'admin123' })).body.token;
      if (token) tokens.push(token);
      return token;
    };
    const reporte = (tipo, query, token) => request(`/api/reportes/${tipo}?${query}`, token);

    // ---------------------------------------------------------------------------------------------------------
    // Datos de prueba
    // ---------------------------------------------------------------------------------------------------------
    const crear = async (lista, datos) => {
      const creado = await crearUsuarioDePrueba(db, datos);
      lista.push(creado.idPersona);
      return creado;
    };
    const asociado = await crear(asociados, {
      dpi: dpi('970'), codigo: `EX-T${sufijo}`, email: `test.rep.asoc.${unico}@cooperativa.com`, rol: 'ASOCIADO', asociado: true,
    });
    const operadorA = await crear(personal, {
      dpi: dpi('971'), codigo: `OP-TA${sufijo}`, email: `test.rep.opa.${unico}@cooperativa.com`, rol: 'OPERADOR',
    });
    const operadorB = await crear(personal, {
      dpi: dpi('972'), codigo: `OP-TB${sufijo}`, email: `test.rep.opb.${unico}@cooperativa.com`, rol: 'OPERADOR',
    });
    const ejecutivo = await crear(personal, {
      dpi: dpi('973'), codigo: `EJ-T${sufijo}`, email: `test.rep.ej.${unico}@cooperativa.com`, rol: 'EJECUTIVO',
    });
    const admin = await crear(personal, {
      dpi: dpi('974'), codigo: `AD-T${sufijo}`, email: `test.rep.ad.${unico}@cooperativa.com`, rol: 'ADMINISTRADOR',
    });
    const dpiAsociado = dpi('970');
    // Uno sin rastro de su afiliación y uno afiliado en línea (primera cuenta abierta sin operador)
    const sinRastro = await crear(asociados, {
      dpi: dpi('976'), codigo: `EX-TS${sufijo}`, email: `test.rep.sin.${unico}@cooperativa.com`, rol: 'ASOCIADO', asociado: true,
    });
    const enLinea = await crear(asociados, {
      dpi: dpi('977'), codigo: `EB-TL${sufijo}`, email: `test.rep.lin.${unico}@cooperativa.com`, rol: 'ASOCIADO', asociado: true,
    });
    const idCuentaEnLinea = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible) VALUES ($1, $2, 2, 100.00) RETURNING id_cuenta`,
      [`TEST-REP-${sufijo}`, enLinea.idAsociado]
    )).rows[0].id_cuenta;
    await db.query(
      `INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
       VALUES ($1, 'DEPOSITO', 100.00, 0.00, 100.00, 'Prueba de reportes: aporte en línea', NULL)`,
      [idCuentaEnLinea]
    );

    // Efectivo: A recibe 120.50 + 100.00 y hace tres depósitos al banco (acreditado, sin confirmar y rechazado); B, 75
    await db.query(
      `INSERT INTO efectivo_ventanilla (id_usuario_operador, cui_dpi, monto, origen, referencia) VALUES
         ($1, $3, 120.50, 'APERTURA_CUENTA', 'TEST-REP-EF1'), ($1, $3, 100.00, 'AFILIACION_PRESENCIAL', 'TEST-REP-EF2'),
         ($2, $3, 75.00, 'FORMALIZACION_AGENCIA', 'TEST-REP-EF3')`,
      [operadorA.idUsuario, operadorB.idUsuario, dpiAsociado]
    );
    // Bordes del día: un minuto antes y uno después de la medianoche de Guatemala del día de prueba
    await db.query(
      `INSERT INTO efectivo_ventanilla (id_usuario_operador, cui_dpi, monto, origen, referencia, fecha_registro) VALUES
         ($1, $2, 11.00, 'APERTURA_CUENTA', 'TEST-REP-ANTES', ($3::date)::timestamp AT TIME ZONE 'America/Guatemala' - INTERVAL '1 minute'),
         ($1, $2, 22.00, 'APERTURA_CUENTA', 'TEST-REP-DESPUES', ($3::date)::timestamp AT TIME ZONE 'America/Guatemala' + INTERVAL '1 minute')`,
      [operadorA.idUsuario, dpiAsociado, diaBorde]
    );
    await db.query(
      `INSERT INTO depositos_ventanilla_banco (id_usuario_operador, numero_cuenta_bancaria, titular_cui, monto, referencia, estado) VALUES
         ($1, 'CTA-TEST-1', $2, 200.00, $3, 'ACREDITADO'), ($1, 'CTA-TEST-1', $2, 50.00, $4, 'SIN_CONFIRMAR'),
         ($1, 'CTA-TEST-1', $2, 30.00, $5, 'RECHAZADO')`,
      [operadorA.idUsuario, dpiAsociado, `TEST-REP-D1-${sufijo}`, `TEST-REP-D2-${sufijo}`, `TEST-REP-D3-${sufijo}`]
    );
    // Créditos: las resoluciones del comité quedan en su historial (resoluciones_credito), como las deja el ejecutivo
    const resolver = (idSolicitud, resolucion, haceMinutos = 0) => db.query(
      `INSERT INTO resoluciones_credito (id_solicitud_credito, id_usuario_resuelve, resolucion, observaciones, fecha_resolucion)
       VALUES ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
      [idSolicitud, ejecutivo.idUsuario, resolucion, `Prueba ${resolucion}`, haceMinutos]
    );
    const credito = async (estado, resoluciones = []) => {
      const id = (await db.query(
        `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado,
           id_operador_revisa)
         VALUES ($1, 5000.00, 12, 10.00, 439.58, $2, $3) RETURNING id_solicitud_credito`,
        [asociado.idAsociado, estado, operadorA.idUsuario]
      )).rows[0].id_solicitud_credito;
      for (const [i, resolucion] of resoluciones.entries()) await resolver(id, resolucion, resoluciones.length - i);
      return id;
    };
    const creditos = {
      aprobado: await credito('APROBADA', ['APROBADA']),
      denegado: await credito('DENEGADA', ['DENEGADA']),
      enTramite: await credito('EN_REVISION_OPERADOR'),
      cancelado: await credito('CANCELADA'),
      // El comité lo devolvió y el operador lo volvió a elevar: queda la devolución
      reelevado: await credito('EN_AUTORIZACION_EJECUTIVO', ['DEVUELTA']),
      // Devuelto y después aprobado: dos resoluciones
      devueltoYAprobado: await credito('APROBADA', ['DEVUELTA', 'APROBADA']),
    };
    // Auditoría: el administrador de prueba bloquea al operador B
    await db.query(
      `INSERT INTO historial_estados_usuario (id_usuario_modificado, estado_anterior, estado_nuevo, id_modificado_por, motivo, ip_origen)
       VALUES ($1, 'ACTIVO', 'BLOQUEADO', $2, 'Prueba de reportes', '10.0.0.7')`,
      [operadorB.idUsuario, admin.idUsuario]
    );
    // Documento del asociado (pendiente) que abre el operador A
    const idExpediente = (await db.query(
      `INSERT INTO expedientes_documentos (cui_dpi, id_persona, canal_origen, id_usuario_crea, fecha_vinculacion)
       VALUES ($1, $2, 'ASOCIADO_ACTUAL', $3, CURRENT_TIMESTAMP) RETURNING id_expediente`,
      [dpiAsociado, asociado.idPersona, asociado.idUsuario]
    )).rows[0].id_expediente;
    const idDocumento = (await db.query(
      `INSERT INTO documentos_afiliacion (id_expediente, tipo_documento, archivo, tamano_bytes, sha256, canal_carga, id_usuario_carga)
       VALUES ($1, 'DPI_FRENTE', $2, 100, $3, 'PORTAL', $4) RETURNING id_documento`,
      [idExpediente, `doc_${crypto.randomUUID()}.pdf`, crypto.randomBytes(32).toString('hex'), asociado.idUsuario]
    )).rows[0].id_documento;
    await db.query(
      "INSERT INTO accesos_documento (id_documento, id_usuario, ip_origen) VALUES ($1, $2, '10.0.0.8'), ($1, $3, '10.0.0.9')",
      [idDocumento, operadorA.idUsuario, asociado.idUsuario]
    );
    // Reversión pendiente con el banco
    await db.query(
      `INSERT INTO reversiones_pendientes (origen, tipo_movimiento, numero_cuenta_bancaria, cui_dpi, monto, concepto,
         referencia_original, referencia_reversion, clave_operacion)
       VALUES ('TRASLADO', 'CREDITO', 'CTA-TEST-1', $1, 10.00, 'Prueba de reportes', $2, $3, 'prueba')`,
      [dpiAsociado, referenciaReversion, `REV-${referenciaReversion}`]
    );

    const tokenAsociado = await login(`EX-T${sufijo}`);
    const tokenOperadorA = await login(`OP-TA${sufijo}`);
    const tokenOperadorB = await login(`OP-TB${sufijo}`);
    const tokenEjecutivo = await login(`EJ-T${sufijo}`);
    const tokenAdmin = await login(`AD-T${sufijo}`);
    assert(tokenAsociado && tokenOperadorA && tokenOperadorB && tokenEjecutivo && tokenAdmin, 'Inician sesión los usuarios de prueba');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[1] Permisos por rol');
    // ---------------------------------------------------------------------------------------------------------
    assert((await reporte('afiliaciones', `formato=PDF&${periodo}`)).status === 401, 'Sin sesión: 401');
    assert((await reporte('cartera-creditos', `formato=PDF&${periodo}`, tokenAsociado)).status === 403, 'Un asociado no saca reportes del personal (403)');
    assert((await reporte('no-existe', `formato=PDF&${periodo}`, tokenAdmin)).status === 404, 'Un reporte que no existe: 404');
    assert((await reporte('__proto__', `formato=PDF&${periodo}`, tokenAdmin)).status === 404, 'Un nombre heredado del objeto (__proto__) no es un reporte: 404');
    assert((await reporte('cartera-creditos', `formato=PDF&${periodo}`, tokenOperadorA)).status === 403, 'El operador no saca la cartera de créditos (403)');
    assert((await reporte('afiliaciones', `formato=PDF&${periodo}`, tokenEjecutivo)).status === 403, 'El ejecutivo no saca el reporte de afiliaciones (403)');
    assert((await reporte('padron-asociados', 'formato=CSV', tokenAdmin)).status === 403, 'El administrador no saca el padrón (es del operador)');
    assert((await reporte('cierre-caja', `formato=PDF&fecha=${hoy}`, tokenAdmin)).status === 403, 'El administrador no saca un cierre de caja (403)');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[2] Validación de filtros');
    // ---------------------------------------------------------------------------------------------------------
    assert((await reporte('afiliaciones', periodo, tokenAdmin)).status === 400, 'Sin formato: 400');
    assert((await reporte('afiliaciones', `formato=XLSX&${periodo}`, tokenAdmin)).status === 400, 'Un formato que no es PDF ni CSV: 400');
    assert((await reporte('afiliaciones', 'formato=PDF', tokenAdmin)).status === 400, 'Sin período: 400');
    assert((await reporte('afiliaciones', 'formato=PDF&desde=2026-02-30&hasta=2026-03-01', tokenAdmin)).status === 400, 'Una fecha que no existe (30 de febrero): 400');
    assert((await reporte('afiliaciones', 'formato=PDF&desde=2026-10-31&hasta=2026-10-01', tokenAdmin)).status === 400, 'Desde después de hasta: 400');
    assert((await reporte('afiliaciones', 'formato=PDF&desde=2024-01-01&hasta=2026-01-01', tokenAdmin)).status === 400, 'Un período de más de un año: 400');
    assert((await reporte('afiliaciones', `formato=PDF&desde=${hoy}&desde=${hoy}&hasta=${hoy}`, tokenAdmin)).status === 400, 'Una fecha repetida en la URL (arreglo): 400');
    assert((await reporte('cierre-caja', 'formato=PDF', tokenOperadorA)).status === 400, 'Cierre de caja sin día: 400');
    assert((await reporte('padron-asociados', 'formato=CSV&estado=MOROSO', tokenOperadorA)).status === 400, 'Padrón con un estado que no existe: 400');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[3] Cierre de caja: solo el efectivo de quien lo pide');
    // ---------------------------------------------------------------------------------------------------------
    const cierreA = await reporte('cierre-caja', `formato=PDF&fecha=${hoy}`, tokenOperadorA);
    const datosA = cierreA.body.reporte;
    assert(cierreA.status === 200 && /^REP-\d{6,}$/.test(datosA?.folio || ''), 'El cierre de caja sale con su folio (REP-XXXXXX)');
    assert(datosA?.filas.length === 5 && datosA.filas.every((f) => f.operador_codigo === `OP-TA${sufijo}`),
      'Trae los 5 movimientos del operador A y ninguno de otro');
    assert(datosA?.resumen.confirmado.monto === 420.5 && datosA.resumen.confirmado.cantidad === 3,
      'Confirmado: efectivo recibido más depósitos acreditados (Q420.50 en 3 operaciones)');
    assert(datosA?.resumen.por_conciliar.monto === 50 && datosA.resumen.no_cobrado.monto === 30,
      'Aparte: Q50.00 por conciliar y Q30.00 no cobrados (rechazado)');
    assert(datosA?.filas.find((f) => f.concepto === 'APERTURA_CUENTA')?.titular === 'Prueba Automatizada',
      'Cada movimiento trae el nombre del titular del DPI');
    const cierreAntes = await reporte('cierre-caja', `formato=CSV&fecha=2026-01-14`, tokenOperadorA);
    const cierreDespues = await reporte('cierre-caja', `formato=CSV&fecha=${diaBorde}`, tokenOperadorA);
    assert(cierreDespues.body.reporte?.filas.map((f) => f.referencia).join() === 'TEST-REP-DESPUES'
      && cierreAntes.body.reporte?.filas.map((f) => f.referencia).join() === 'TEST-REP-ANTES',
      'El día del cierre es el de Guatemala: 23:59 cuenta en el día anterior y 00:01 en el siguiente');
    const cierreB = await reporte('cierre-caja', `formato=CSV&fecha=${hoy}&idUsuario=${operadorA.idUsuario}&idOperador=${operadorA.idUsuario}`, tokenOperadorB);
    assert(cierreB.status === 200 && cierreB.body.reporte.filas.length === 1 && cierreB.body.reporte.filas[0].monto === 75,
      'El operador B no puede pedir el cierre de A aunque mande su id en la URL: recibe solo el suyo');
    assert(cierreB.body.reporte?.filtros && Object.keys(cierreB.body.reporte.filtros).join() === 'fecha',
      'Los filtros guardados son solo los del reporte (se ignora lo demás de la URL)');

    const registro = (await db.query(
      `SELECT tipo_reporte, formato, parametros, filas, resumen, ip_origen IS NOT NULL AS con_ip
       FROM reportes_generados WHERE id_reporte = $1`,
      [parseInt(datosA.folio.slice(4), 10)]
    )).rows[0];
    assert(registro?.tipo_reporte === 'CIERRE_CAJA' && registro.formato === 'PDF' && registro.filas === 5
      && registro.parametros.fecha === hoy && registro.con_ip,
      'Queda registrado con su folio: tipo, formato, filtros, filas e IP');
    assert(registro?.resumen?.confirmado?.monto === 420.5 && registro.resumen.por_conciliar.monto === 50,
      'El registro guarda los totales del reporte: con el folio se cotejan las cifras impresas (#95)');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[4] Padrón, cartera, acta y afiliaciones');
    // ---------------------------------------------------------------------------------------------------------
    const padron = await reporte('padron-asociados', 'formato=CSV&estado=ACTIVO', tokenOperadorA);
    const filaPadron = padron.body.reporte?.filas.find((f) => f.codigo === `EX-T${sufijo}`);
    assert(padron.status === 200 && filaPadron?.tipo === 'EX' && filaPadron.documentos === 'INCOMPLETO' && filaPadron.cuentas_activas === 0,
      'Padrón: el asociado aparece como cliente externo, sin cuentas y con documentos incompletos');
    assert(padron.body.reporte?.filas.every((f) => f.estado === 'ACTIVO'), 'Padrón filtrado: solo asociados activos');
    assert(padron.body.reporte?.resumen.total === padron.body.reporte.filas.length, 'El total del padrón es el número de filas');

    const cartera = await reporte('cartera-creditos', `formato=CSV&${periodo}`, tokenEjecutivo);
    const deLaPrueba = (cartera.body.reporte?.filas || []).filter((f) => f.asociado_codigo === `EX-T${sufijo}`);
    const grupoDe = (id) => deLaPrueba.find((f) => f.id_solicitud_credito === id)?.grupo;
    assert(cartera.status === 200 && deLaPrueba.length === 6, 'Cartera: trae las 6 solicitudes de prueba del período');
    assert(grupoDe(creditos.aprobado) === 'APROBADA' && grupoDe(creditos.denegado) === 'NO_APROBADA'
      && grupoDe(creditos.enTramite) === 'EN_TRAMITE' && grupoDe(creditos.cancelado) === 'CANCELADA',
      'Cartera: cada estado cae en su grupo (aprobada, no aprobada, en trámite, cancelada)');
    const resumenCartera = cartera.body.reporte?.resumen;
    const sumaGrupos = (resumenCartera?.por_grupo || []).reduce((suma, g) => suma + g.cantidad, 0);
    const cantidadGrupo = (g) => resumenCartera?.por_grupo.find((x) => x.clave === g)?.cantidad || 0;
    const tasaEsperada = Math.round((cantidadGrupo('APROBADA') / (cantidadGrupo('APROBADA') + cantidadGrupo('NO_APROBADA'))) * 1000) / 10;
    assert(sumaGrupos === cartera.body.reporte.filas.length && resumenCartera.tasa_aprobacion === tasaEsperada,
      'Cartera: los grupos suman todas las filas y la tasa de aprobación sale de aprobadas entre resueltas');

    const acta = await reporte('resoluciones-comite', `formato=PDF&${periodo}`, tokenAdmin);
    const idsActa = (acta.body.reporte?.filas || []).map((f) => f.id_solicitud_credito);
    assert(acta.status === 200 && idsActa.includes(creditos.aprobado) && idsActa.includes(creditos.denegado)
      && !idsActa.includes(creditos.enTramite) && !idsActa.includes(creditos.cancelado),
      'Acta: solo los créditos que resolvió el comité en el período');
    const resolucionDe = (id) => acta.body.reporte?.filas.find((f) => f.id_solicitud_credito === id)?.resolucion;
    assert(resolucionDe(creditos.aprobado) === 'APROBADA' && resolucionDe(creditos.denegado) === 'DENEGADA'
      && resolucionDe(creditos.reelevado) === 'DEVUELTA',
      'Acta: la resolución es la del comité (un devuelto que se volvió a elevar figura como devuelto, no «por autorizar»)');
    assert(acta.body.reporte?.filas.find((f) => f.id_solicitud_credito === creditos.aprobado)?.ejecutivo_codigo === `EJ-T${sufijo}`,
      'Acta: cada resolución dice qué ejecutivo la tomó');
    const dosVeces = (acta.body.reporte?.filas || []).filter((f) => f.id_solicitud_credito === creditos.devueltoYAprobado);
    assert(dosVeces.map((f) => f.resolucion).join() === 'DEVUELTA,APROBADA',
      'Acta: un crédito devuelto y luego aprobado aparece con sus dos resoluciones, en orden (#89)');
    const resumenActa = acta.body.reporte?.resumen;
    assert(resumenActa && resumenActa.creditos < resumenActa.total.cantidad,
      'Acta: cuenta las resoluciones y, aparte, los créditos distintos');

    const afiliaciones = await reporte('afiliaciones', `formato=CSV&${periodo}`, tokenAdmin);
    const canalDe = (codigo) => afiliaciones.body.reporte?.filas.find((f) => f.codigo === codigo);
    assert(afiliaciones.status === 200 && canalDe(`EX-T${sufijo}`)?.canal === 'VENTANILLA' && canalDe(`EX-T${sufijo}`).tipo === 'EX',
      'Afiliaciones: un cliente externo que pagó la aportación en efectivo se afilió en ventanilla');
    assert(canalDe(`EB-TL${sufijo}`)?.canal === 'EN_LINEA' && canalDe(`EB-TL${sufijo}`).tipo === 'EB'
      && canalDe(`EX-TS${sufijo}`)?.canal === 'SIN_DATO',
      'Afiliaciones: primera cuenta sin operador = en línea; sin ningún rastro = sin registro');
    assert(canalDe(`EX-T${sufijo}`)?.fecha_ingreso === hoy,
      'Afiliaciones: la fecha de ingreso es el día de Guatemala (no el de UTC)');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[5] Auditoría, efectivo, conciliación, accesos y reportes generados');
    // ---------------------------------------------------------------------------------------------------------
    const auditoria = await reporte('auditoria-usuarios', `formato=PDF&${periodo}`, tokenAdmin);
    const cambio = auditoria.body.reporte?.filas.find((f) => f.usuario_codigo === `OP-TB${sufijo}`);
    assert(auditoria.status === 200 && cambio?.estado_nuevo === 'BLOQUEADO' && cambio.modificado_por === `AD-T${sufijo}`
      && cambio.ip_origen === '10.0.0.7',
      'Auditoría: el bloqueo del operador B con quién lo hizo, motivo e IP');

    const efectivo = await reporte('efectivo-ventanilla', `formato=CSV&${periodo}`, tokenAdmin);
    // Cada operador va como «código · nombre»
    const montoDe = (codigo) => (efectivo.body.reporte?.resumen.por_operador || []).find((g) => g.clave.startsWith(`${codigo} ·`))?.monto;
    assert(efectivo.status === 200 && montoDe(`OP-TA${sufijo}`) === 420.5 && montoDe(`OP-TB${sufijo}`) === 75,
      'Efectivo de ventanilla: confirmado por operador (A Q420.50, B Q75.00)');

    const conciliacion = await reporte('conciliacion', `formato=PDF&${periodo}`, tokenAdmin);
    const referencias = (conciliacion.body.reporte?.filas || []).map((f) => f.referencia);
    assert(conciliacion.status === 200 && referencias.includes(`TEST-REP-D2-${sufijo}`) && referencias.includes(`REV-${referenciaReversion}`),
      'Conciliación: trae los depósitos y las reversiones del período');

    const accesos = await reporte('accesos-documentos', `formato=CSV&${periodo}`, tokenAdmin);
    const acceso = accesos.body.reporte?.filas.find((f) => f.usuario_codigo === `OP-TA${sufijo}`);
    assert(accesos.status === 200 && acceso?.titular_dpi === dpiAsociado && acceso.es_titular === false && acceso.tipo_documento === 'DPI_FRENTE',
      'Accesos: el operador que abrió el DPI del asociado, marcado como personal (no titular)');
    assert(accesos.body.reporte?.filas.find((f) => f.usuario_codigo === `EX-T${sufijo}`)?.es_titular === true,
      'Accesos: el asociado que abre su propio documento con su usuario de asociado cuenta como titular');

    const generados = await reporte('reportes-generados', `formato=CSV&${periodo}`, tokenAdmin);
    const delOperador = generados.body.reporte?.filas.find((f) => f.usuario_codigo === `OP-TA${sufijo}` && f.tipo_reporte === 'CIERRE_CAJA');
    assert(generados.status === 200 && delOperador?.parametros?.fecha === hoy && delOperador.formato === 'PDF' && delOperador.rol === 'OPERADOR',
      'Reportes generados: aparece el cierre de caja del operador A con sus filtros y el rol que tenía');
    assert(!(generados.body.reporte?.filas || []).some((f) => f.user_agent !== undefined),
      'Reportes generados no devuelve el navegador completo');

    // ---------------------------------------------------------------------------------------------------------
    console.log('\n[6] Registro inmutable y límite de filas');
    // ---------------------------------------------------------------------------------------------------------
    const idRegistro = parseInt(datosA.folio.slice(4), 10);
    const intentar = (cliente, sql) => cliente.query(sql, [idRegistro]).then(() => 'ok', (e) => e.code);
    const cambiar = await intentar(db, 'UPDATE reportes_generados SET filas = 0 WHERE id_reporte = $1');
    const borrar = await intentar(db, 'DELETE FROM reportes_generados WHERE id_reporte = $1');
    assert(cambiar === '42501' && borrar === '42501', 'El rol de la aplicación no tiene permiso para modificar ni borrar el registro (42501)');
    // El dueño de la tabla tampoco, sin la marca de purga de pruebas: lo detiene el trigger
    const dueno = poolDueno(db.pool);
    const cambiarDueno = await intentar(dueno, 'UPDATE reportes_generados SET filas = 0 WHERE id_reporte = $1');
    const borrarDueno = await intentar(dueno, 'DELETE FROM reportes_generados WHERE id_reporte = $1');
    assert(cambiarDueno === '23001' && borrarDueno === '23001', 'Ni el dueño de la tabla lo modifica o borra sin la marca de purga (trigger, 23001)');

    const clienteConMuchas = { query: async () => ({ rows: Array.from({ length: LIMITES.MAX_FILAS + 1 }, () => ({})) }) };
    const sePasa = await datosDelReporte(clienteConMuchas, 'afiliaciones', { desde: hoy, hasta: hoy }).then(() => null, (e) => e);
    assert(sePasa?.statusCode === 422, `Más de ${LIMITES.MAX_FILAS} filas: 422 en lugar de un reporte cortado`);

    assert(estadoDocumentos(4, 0) === 'COMPLETO' && estadoDocumentos(4, 1) === 'EN_REVISION' && estadoDocumentos(3, 0) === 'INCOMPLETO',
      'Estado de los documentos del padrón: la misma regla que el expediente');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) {
      await makeRequest(port, '/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      await purgarReversionesDePrueba(db, [referenciaReversion]);
      // Primero el asociado (sus créditos y documentos apuntan al personal) y después el personal
      for (const idPersona of [...asociados, ...personal]) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }

    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
