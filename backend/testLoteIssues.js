// Las pruebas nunca envían correo real y usan los límites de prueba: debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';
process.env.NODE_ENV = 'test';

/**
 * testLoteIssues.js
 *
 * Lote de los issues #99 a #106 y H-84: tope del cuerpo por ruta (igual en nginx), traslados repetidos o que pasan el
 * saldo, uno de cada tipo de cuenta, cuenta de origen inactiva al aprobar, la ruta de la planilla quitada, límite por
 * usuario del padrón y la purga de documentos de solicitudes que no se completaron (con su tope en línea y las
 * transiciones de la solicitud, #108). También el registro de las consultas del expediente 360° (#119), la fecha de
 * una solicitud de agencia al crearla (#120) y los límites por usuario compartidos entre las rutas (#121).
 */
const fs = require('fs');
const path = require('path');
const { server } = require('./src/server');
const db = require('./src/config/db');
const { DOCUMENTOS } = require('./src/config/constants');
const { RUTAS_DOCUMENTOS, RUTAS_PDF_CREDITO, limiteDeRuta } = require('./src/config/limitesCuerpo');
const { firmarCargaDocumentosToken } = require('./src/utils/afiliacionToken');
const { purgarCargasPreviasVencidas } = require('./src/services/limpiezaCargasPreviasService');
const {
  makeRequest,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  purgarDocumentosDePrueba,
  pdfDePrueba,
  poolDueno,
} = require('./testHelper');

/** PDF de prueba de `bytes` aproximados (el relleno lo hace distinto de los demás). */
const pdfGrande = (marca, bytes) =>
  `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n%${marca}\n${'x'.repeat(bytes)}\n%%EOF\n`).toString('base64')}`;

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] LOTE DE ISSUES #99 A #106 Y H-84');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-7);
  const dpi = (prefijo) => `${prefijo}${sufijo}000`.slice(0, 13);
  const personas = [];
  const tokens = [];
  const solicitudesAgencia = [];
  const dpisDocumentos = [];
  let errorInesperado = false;

  try {
    // -------------------------------------------------------------------------
    console.log('\n--- #99 Tope del cuerpo por ruta ---');
    const nginx = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'nginx.conf'), 'utf8');
    const reglaNginx = (tope) => {
      const linea = nginx.split('\n').findIndex((l) => l.includes(`client_max_body_size ${tope};`));
      const location = nginx.split('\n').slice(0, linea).reverse().find((l) => l.trim().startsWith('location ~'));
      return new RegExp(location.trim().replace(/^location ~ /, '').replace(/ \{$/, ''));
    };
    const ejemplosDocumentos = [
      '/api/asociado/documentos', '/api/admin/asociados/12/documentos', '/api/admin/asociados/documentos-afiliacion',
      '/api/operador/afiliaciones/7/documentos', '/api/afiliacion/documentos', '/api/afiliacion/personal/documentos',
    ];
    const ejemplosPdf = ['/api/asociado/creditos/3/subir-expediente-firmado', '/api/operador/creditos/3/elevar', '/api/ejecutivo/creditos/3/resolver'];
    assert(ejemplosDocumentos.every((r) => RUTAS_DOCUMENTOS.test(r) && reglaNginx('8m').test(r))
      && ejemplosPdf.every((r) => RUTAS_PDF_CREDITO.test(r) && reglaNginx('14m').test(r))
      && ['/api/auth/login', '/api/afiliacion/documentos/consultar', '/api/admin/asociados'].every((r) => !RUTAS_DOCUMENTOS.test(r) && !reglaNginx('8m').test(r)),
      'Las rutas con archivos son las mismas en el backend y en nginx (incluidas las de la Fase 6)');
    const grande = await request('/api/auth/login', 'POST', { identifier: 'x', password: 'y', relleno: 'x'.repeat(2 * 1024 * 1024) });
    assert(limiteDeRuta('/api/auth/login') === '1mb' && grande.status === 413,
      'Fuera de las rutas de archivos, un cuerpo de 2 MB se rechaza (413) antes de llegar al controlador');

    // -------------------------------------------------------------------------
    console.log('\n--- #100 / #101 Traslados ---');
    const socio = await crearUsuarioDePrueba(db, {
      dpi: dpi('951'), codigo: `EX-TLI${sufijo}`, email: `socio.lote.${sufijo}@example.com`, rol: 'ASOCIADO', asociado: true,
    });
    personas.push(socio.idPersona);
    const login = await request('/api/auth/login', 'POST', { identifier: `EX-TLI${sufijo}`, password: 'admin123' });
    tokens.push(login.body.token);
    const idAsociado = (await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1', [socio.idPersona])).rows[0].id_asociado;
    const origen = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
       VALUES ($1, $2, 2, 1000.00, 0.00, 'ACTIVA') RETURNING id_cuenta`,
      [`CTA-AHORR-T${sufijo}`, idAsociado]
    )).rows[0].id_cuenta;
    const trasladar = (datos) => request('/api/asociado/solicitudes-traslado', 'POST', {
      id_cuenta_origen: origen, origen_cuenta: 'COOPERATIVA', tipo_operacion: 'APERTURA_Y_TRASLADO', ...datos,
    }, login.body.token);

    const destinos = await request('/api/asociado/mis-cuentas-destino', 'GET', null, login.body.token);
    const tipos = (destinos.body.data?.tiposDisponibles || []).map((t) => t.id_tipo_cuenta);
    assert(tipos.includes(4) && !tipos.includes(2), 'Se ofrece el Plan de Ahorro Programado y no un tipo que ya tiene (#101)');

    const primera = await trasladar({ id_tipo_cuenta_destino: 5, monto: 300 });
    const repetida = await trasladar({ id_tipo_cuenta_destino: 5, monto: 300 });
    const otraDelMismoTipo = await trasladar({ id_tipo_cuenta_destino: 5, monto: 200 });
    assert(primera.status === 201 && repetida.status === 409 && otraDelMismoTipo.status === 409,
      'Un doble envío no crea dos casos y no se pide abrir otro del mismo tipo (#100, #101)');
    const yaTiene = await trasladar({ id_tipo_cuenta_destino: 2, monto: 150 });
    assert(yaTiene.status === 409, 'No se pide abrir un tipo de cuenta que ya tiene activo (#101)');
    const tresDecimales = await trasladar({ id_tipo_cuenta_destino: 4, monto: 100.005 });
    assert(tresDecimales.status === 400, 'Un monto con más de dos decimales se rechaza (no se redondea al guardar)');
    const pasaSaldo = await trasladar({ id_tipo_cuenta_destino: 4, monto: 800 });
    const cabe = await trasladar({ id_tipo_cuenta_destino: 4, monto: 700 });
    assert(pasaSaldo.status === 400 && /pendientes/.test(pasaSaldo.body.message) && cabe.status === 201,
      'Con los traslados pendientes de la misma cuenta no se pasa el saldo (#100)');

    // -------------------------------------------------------------------------
    console.log('\n--- #102 Cuenta de origen inactiva al aprobar ---');
    const loginOp = await request('/api/auth/login', 'POST', { identifier: 'OP-1', password: 'admin123' });
    tokens.push(loginOp.body.token);
    await poolDueno(db.pool).query("UPDATE cuentas SET estado = 'BLOQUEADA' WHERE id_cuenta = $1", [origen]);
    const aprobar = await request(`/api/operador/solicitudes/${primera.body.data.id_solicitud}/resolver`, 'POST', {
      accion: 'APROBAR', observaciones: 'Prueba del lote',
    }, loginOp.body.token);
    const sinMovimientos = await db.query('SELECT 1 FROM transacciones WHERE id_cuenta = $1', [origen]);
    assert(aprobar.status === 409 && sinMovimientos.rows.length === 0,
      'No se aprueba un traslado si la cuenta de origen ya no está activa (#102)');

    // -------------------------------------------------------------------------
    console.log('\n--- #103 / #104 Planilla y padrón ---');
    const planilla = await request('/api/asociado/cuenta-planilla', 'GET', null, login.body.token);
    assert(planilla.status === 404, 'La ruta de la «Cuenta de Planilla» ya no existe (#103)');
    const padron = await request('/api/admin/asociados?limit=1', 'GET', null, loginOp.body.token);
    assert(padron.status === 200 && padron.headers['ratelimit-limit'] !== undefined,
      'El padrón del personal tiene límite por usuario (#104)');
    // #110: el expediente 360° también tiene límite, y una página más grande que la de la pantalla queda registrada
    const idOpPadron = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'OP-1'")).rows[0].id_usuario;
    const consultasAntes = (await db.query('SELECT COUNT(*)::int AS n FROM consultas_padron WHERE id_usuario = $1', [idOpPadron])).rows[0].n;
    const padron10 = await request('/api/admin/asociados?limit=10', 'GET', null, loginOp.body.token);
    const padron11 = await request('/api/admin/asociados?limit=11', 'GET', null, loginOp.body.token);
    const padron100 = await request('/api/admin/asociados?limit=100', 'GET', null, loginOp.body.token);
    const consultasDespues = (await db.query('SELECT COUNT(*)::int AS n FROM consultas_padron WHERE id_usuario = $1', [idOpPadron])).rows[0].n;
    assert(padron10.status === 200 && padron11.status === 200 && padron100.status === 200
      && consultasDespues === consultasAntes + 2,
      'Las páginas del padrón de más de 10 asociados quedan registradas en consultas_padron; la de la pantalla no (#110)');
    // El expediente del socio de la prueba: su consulta queda registrada (#119) y se borra con él al final
    const expediente = await request(`/api/admin/asociados/${idAsociado}/expediente`, 'GET', null, loginOp.body.token);
    assert(expediente.headers['ratelimit-limit'] !== undefined, 'El expediente 360° tiene límite por usuario (#110)');
    // #121: con el middleware compartido, cada ruta conserva su tope de pruebas
    const cargaSinArchivo = await request('/api/asociado/documentos', 'POST', {}, login.body.token);
    const reporteInexistente = await request('/api/reportes/no-existe', 'GET', null, loginOp.body.token);
    const topes = [padron, expediente, cargaSinArchivo, primera, reporteInexistente].map((r) => r.headers['ratelimit-limit']);
    assert(topes.join() === '1000,1000,200,200,300',
      `Los límites por usuario conservan sus topes de pruebas: padrón, expediente, documentos, traslados y reportes (#121): ${topes.join()}`);
    // Lo registrado: la última consulta es la de 100, con sus filtros y filas
    const ultimaConsulta = (await db.query(
      'SELECT id_consulta, parametros, filas FROM consultas_padron WHERE id_usuario = $1 ORDER BY id_consulta DESC LIMIT 1',
      [idOpPadron])).rows[0];
    assert(ultimaConsulta?.parametros?.limit === 100 && ultimaConsulta.parametros.page === 1
      && ultimaConsulta.filas === padron100.body.data.length,
      'consultas_padron guarda los filtros y las filas entregadas (#110)');
    // Es de solo agregar: ni el rol de la aplicación (sin permiso) ni el dueño sin la marca de purga (trigger) la cambian
    // Intentos del rol dueño en una transacción que siempre se deshace: si un trigger faltara, no queda nada cambiado
    const enTransaccionDueno = async (conMarca, pasos) => {
      const cliente = await poolDueno(db.pool).connect();
      try {
        await cliente.query('BEGIN');
        if (conMarca) await cliente.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
        return await pasos(cliente);
      } catch (error) {
        return error.code ?? error.message;
      } finally {
        await cliente.query('ROLLBACK').catch(() => {});
        cliente.release();
      }
    };
    const comoAplicacion = (sql, params) => db.query(sql, params).then(() => 'ok', (e) => e.code ?? e.message);
    const duenoSinMarca = (sql, params) => enTransaccionDueno(false, (c) => c.query(sql, params).then(() => 'ok'));
    const idPadron = [ultimaConsulta.id_consulta];
    const cambiosPadron = [
      await comoAplicacion('UPDATE consultas_padron SET filas = 0 WHERE id_consulta = $1', idPadron),
      await comoAplicacion('DELETE FROM consultas_padron WHERE id_consulta = $1', idPadron),
      await duenoSinMarca('UPDATE consultas_padron SET filas = 0 WHERE id_consulta = $1', idPadron),
      await duenoSinMarca('DELETE FROM consultas_padron WHERE id_consulta = $1', idPadron),
    ];
    const truncarDueno = await duenoSinMarca('TRUNCATE consultas_padron', []);
    assert(cambiosPadron.join() === '42501,42501,23001,23001' && truncarDueno === '23001',
      'consultas_padron no se modifica, borra ni vacía: 42501 para la aplicación y 23001 para el dueño sin la marca (#110)');

    // #119: cada consulta del expediente 360° queda registrada con quién, qué asociado y desde dónde. La de un asociado
    // que no existe responde 404: la llave foránea no deja registrarla, así que un registro previo daría 500
    const consultasDelSocio = async () => (await db.query(
      `SELECT id_consulta, id_usuario, ip_origen FROM consultas_expediente WHERE id_asociado = $1
       ORDER BY id_consulta DESC`, [idAsociado])).rows;
    const delSocioAntes = await consultasDelSocio();
    const otraVez = await request(`/api/admin/asociados/${idAsociado}/expediente`, 'GET', null, loginOp.body.token);
    const inexistente = await request('/api/admin/asociados/2147483646/expediente', 'GET', null, loginOp.body.token);
    const delSocioDespues = await consultasDelSocio();
    const registrada = delSocioDespues[0];
    assert(expediente.status === 200 && otraVez.status === 200 && inexistente.status === 404
      && delSocioAntes.length === 1 && delSocioDespues.length === 2
      && registrada.id_usuario === idOpPadron && !!registrada.ip_origen,
      'Cada consulta del expediente 360° queda en consultas_expediente (usuario, asociado e IP); la de uno que no existe no (#119)');
    const idExpediente = [registrada.id_consulta];
    const cambiosExpediente = [
      await comoAplicacion('UPDATE consultas_expediente SET ip_origen = NULL WHERE id_consulta = $1', idExpediente),
      await comoAplicacion('DELETE FROM consultas_expediente WHERE id_consulta = $1', idExpediente),
      await duenoSinMarca('UPDATE consultas_expediente SET ip_origen = NULL WHERE id_consulta = $1', idExpediente),
      await duenoSinMarca('DELETE FROM consultas_expediente WHERE id_consulta = $1', idExpediente),
      await duenoSinMarca('TRUNCATE consultas_expediente', []),
    ];
    assert(cambiosExpediente.join() === '42501,42501,23001,23001,23001',
      `consultas_expediente no se modifica, borra ni vacía: 42501 para la aplicación y 23001 para el dueño sin la marca (#119): ${cambiosExpediente.join()}`);

    // -------------------------------------------------------------------------
    console.log('\n--- H-84 Documentos de solicitudes que no se completaron ---');
    const nuevaSolicitud = async (prefijo, estado, diasAtras) => {
      const cui = dpi(prefijo);
      dpisDocumentos.push(cui);
      const fila = (await db.query(
        `INSERT INTO solicitudes_afiliacion_agencia (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
         VALUES ('', $1, 'Purga', 'Lote', '55550952', '1990-03-03', $2, 'PENDIENTE_AGENCIA') RETURNING id_solicitud`,
        [cui, `purga.${prefijo}.${sufijo}@example.com`]
      )).rows[0];
      solicitudesAgencia.push(fila.id_solicitud);
      const token = firmarCargaDocumentosToken({ id_solicitud: fila.id_solicitud, cui_dpi: cui });
      const subida = await request('/api/afiliacion/documentos', 'POST', { carga_token: token, tipo_documento: 'DPI_FRENTE', archivo: pdfDePrueba(`purga-${prefijo}`) });
      if (estado !== 'PENDIENTE_AGENCIA' || diasAtras) {
        // Solicitud y documentos con esa antigüedad (los documentos solo los cambia el rol dueño con la marca de pruebas)
        const dueno = await poolDueno(db.pool).connect();
        try {
          await dueno.query('BEGIN');
          await dueno.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
          await dueno.query(
            `UPDATE solicitudes_afiliacion_agencia SET estado = $2, fecha_solicitud = CURRENT_TIMESTAMP - make_interval(days => $3)
             WHERE id_solicitud = $1`,
            [fila.id_solicitud, estado, diasAtras]
          );
          await dueno.query(
            `UPDATE documentos_afiliacion SET fecha_carga = CURRENT_TIMESTAMP - make_interval(days => $2)
             WHERE id_expediente IN (SELECT id_expediente FROM expedientes_documentos WHERE id_solicitud = $1)`,
            [fila.id_solicitud, diasAtras]
          );
          await dueno.query('COMMIT');
        } finally {
          dueno.release();
        }
      }
      return { ...fila, cui, token, subida };
    };
    const cancelada = await nuevaSolicitud('953', 'CANCELADA', 0);
    const vieja = await nuevaSolicitud('954', 'PENDIENTE_AGENCIA', 31);
    const reciente = await nuevaSolicitud('955', 'PENDIENTE_AGENCIA', 0);
    // Vieja, pero un operador la está atendiendo: no se le borra nada
    const atendiendose = await nuevaSolicitud('956', 'PENDIENTE_AGENCIA', 31);
    const idOp1 = (await db.query("SELECT id_usuario FROM usuarios WHERE codigo_corporativo = 'OP-1'")).rows[0].id_usuario;
    await poolDueno(db.pool).query(
      'UPDATE solicitudes_afiliacion_agencia SET id_operador_bloqueo = $2, fecha_bloqueo = CURRENT_TIMESTAMP WHERE id_solicitud = $1',
      [atendiendose.id_solicitud, idOp1]
    );
    const archivosDe = async (idSolicitud) => (await db.query(
      `SELECT d.archivo FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE e.id_solicitud = $1`, [idSolicitud]
    )).rows.map((f) => f.archivo);
    const archivoCancelada = (await archivosDe(cancelada.id_solicitud))[0];
    await purgarCargasPreviasVencidas();
    const carpeta = path.join(__dirname, 'uploads', 'afiliaciones');
    assert([cancelada, vieja, reciente].every((s) => s.subida.status === 201)
      && (await archivosDe(cancelada.id_solicitud)).length === 0 && (await archivosDe(vieja.id_solicitud)).length === 0
      && (await archivosDe(reciente.id_solicitud)).length === 1 && (await archivosDe(atendiendose.id_solicitud)).length === 1
      && !fs.existsSync(path.join(carpeta, archivoCancelada)),
      'La purga borra los documentos de solicitudes canceladas o pendientes por más de 30 días, no los de una reciente ni los de una que se está atendiendo');

    // #108: con el rol de la aplicación, una solicitud cerrada no se reabre y la fecha de solicitud no cambia
    const rechazaUpdate = async (sql, params) => {
      try {
        await db.query(sql, params);
        return false;
      } catch (error) {
        return error.code === '23001';
      }
    };
    const reabrir = await rechazaUpdate(
      "UPDATE solicitudes_afiliacion_agencia SET estado = 'PENDIENTE_AGENCIA' WHERE id_solicitud = $1", [cancelada.id_solicitud]);
    const retrasar = await rechazaUpdate(
      "UPDATE solicitudes_afiliacion_agencia SET fecha_solicitud = fecha_solicitud - INTERVAL '31 days' WHERE id_solicitud = $1",
      [reciente.id_solicitud]);
    const bloqueo = await db.query(
      'UPDATE solicitudes_afiliacion_agencia SET id_operador_bloqueo = NULL, fecha_bloqueo = NULL WHERE id_solicitud = $1',
      [reciente.id_solicitud]);
    assert(reabrir && retrasar && bloqueo.rowCount === 1,
      'Una solicitud cerrada no vuelve a pendiente y la fecha de solicitud no cambia; el bloqueo sí se libera (#108)');
    // El dueño de la tabla tampoco, salvo con la marca de pruebas (transacciones que se deshacen al final)
    const reabrirSql = "UPDATE solicitudes_afiliacion_agencia SET estado = 'PENDIENTE_AGENCIA' WHERE id_solicitud = $1";
    const reabrirSinMarca = await enTransaccionDueno(false,
      (c) => c.query(reabrirSql, [cancelada.id_solicitud]).then(() => 'ok'));
    const reabrirConMarca = await enTransaccionDueno(true,
      (c) => c.query(reabrirSql, [cancelada.id_solicitud]).then((r) => (r.rowCount === 1 ? 'ok' : 'sin-fila')));
    // Una pendiente sí expira, pero una expirada no vuelve a pendiente
    const expiradaReabierta = await enTransaccionDueno(false, async (c) => {
      await c.query("UPDATE solicitudes_afiliacion_agencia SET estado = 'EXPIRADA' WHERE id_solicitud = $1", [reciente.id_solicitud]);
      await c.query(reabrirSql, [reciente.id_solicitud]);
      return 'ok';
    });
    assert(reabrirSinMarca === '23001' && reabrirConMarca === 'ok' && expiradaReabierta === '23001',
      'El dueño de la tabla solo cambia una solicitud cerrada con la marca de pruebas; una expirada no se reabre (#108)');

    // #120: al crear una solicitud, la fecha es la del momento aunque el INSERT traiga una pasada; solo el dueño con la
    // marca de pruebas la elige (la transacción del dueño se deshace al final)
    const crearConFechaPasada = (cliente, prefijo) => cliente.query(
      `INSERT INTO solicitudes_afiliacion_agencia
         (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, fecha_solicitud)
       VALUES ('', $1, 'Fecha', 'Lote', '55550957', '1990-03-03', $2, CURRENT_TIMESTAMP - INTERVAL '40 days')
       RETURNING id_solicitud, fecha_solicitud = CURRENT_TIMESTAMP AS fecha_del_momento`,
      [dpi(prefijo), `fecha.${prefijo}.${sufijo}@example.com`]
    ).then((r) => r.rows[0]);
    const comoAplicacionConFecha = await crearConFechaPasada(db, '957');
    solicitudesAgencia.push(comoAplicacionConFecha.id_solicitud);
    const duenoConFecha = await enTransaccionDueno(true,
      async (c) => (await crearConFechaPasada(c, '958')).fecha_del_momento);
    assert(comoAplicacionConFecha.fecha_del_momento === true && duenoConFecha === false,
      'Una solicitud de agencia se crea con la fecha del momento aunque el INSERT traiga otra; solo el dueño con la marca la elige (#120)');

    // Tope en línea por solicitud: solo cuenta lo vigente, así que cerca del tope todavía se reemplaza un documento (#109)
    const casi = DOCUMENTOS.MAX_BYTES_SOLICITUD_EN_LINEA - 100;
    const tipos84 = ['DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI', 'CONSTANCIA_INGRESOS', 'DPI_FRENTE'];
    let restante = casi;
    const resultados = [];
    for (const tipo of tipos84) {
      const tam = Math.min(4.5 * 1024 * 1024, restante);
      if (tam <= 0) break;
      resultados.push((await request('/api/afiliacion/documentos', 'POST', {
        carga_token: reciente.token, tipo_documento: tipo, archivo: pdfGrande(`${tipo}-${sufijo}`, tam),
      })).status);
      restante -= tam;
    }
    const reemplazo = await request('/api/afiliacion/documentos', 'POST', {
      carga_token: reciente.token, tipo_documento: 'DPI_REVERSO', archivo: pdfGrande(`extra-${sufijo}`, 3 * 1024 * 1024),
    });
    assert(resultados.every((s) => s === 201) && reemplazo.status === 201,
      'Sin sesión, cerca de los 25 MB se puede reemplazar un documento: las versiones reemplazadas no cuentan (#109)');
    // Cada tipo tiene su propio tope de versiones; el reverso ya lleva dos
    const subirReverso = async (marca) => (await request('/api/afiliacion/documentos', 'POST', {
      carga_token: reciente.token, tipo_documento: 'DPI_REVERSO', archivo: pdfDePrueba(`${marca}-${sufijo}`),
    })).status;
    const hastaElTope = [];
    for (let version = 3; version <= DOCUMENTOS.MAX_VERSIONES_POR_TIPO_SOLICITUD; version++) {
      hastaElTope.push(await subirReverso(`reverso-${version}`));
    }
    assert(hastaElTope.every((s) => s === 201) && (await subirReverso('reverso-extra')) === 409,
      `Sin sesión, un documento admite ${DOCUMENTOS.MAX_VERSIONES_POR_TIPO_SOLICITUD} versiones; después se lleva a la agencia (#109)`);
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    try {
      await purgarDocumentosDePrueba(db, dpisDocumentos);
      if (solicitudesAgencia.length) {
        await poolDueno(db.pool).query('DELETE FROM solicitudes_afiliacion_agencia WHERE id_solicitud = ANY($1)', [solicitudesAgencia]);
      }
      for (const idPersona of personas) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }
    await poolDueno(db.pool).end();
    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
