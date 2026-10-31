// Las pruebas nunca envían correo real y usan los límites de prueba: debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';
process.env.NODE_ENV = 'test';

/**
 * testLoteIssues.js
 *
 * Lote de los issues #99 a #106 y H-84: tope del cuerpo por ruta (igual en nginx), traslados repetidos o que pasan el
 * saldo, uno de cada tipo de cuenta, cuenta de origen inactiva al aprobar, la ruta de la planilla quitada, límite por
 * usuario del padrón y la purga de documentos de solicitudes que no se completaron (con su tope en línea).
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
      `UPDATE solicitudes_afiliacion_agencia SET id_operador_bloqueo = $2, fecha_bloqueo = CURRENT_TIMESTAMP,
         fecha_solicitud = CURRENT_TIMESTAMP - INTERVAL '31 days'
       WHERE id_solicitud = $1`,
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

    // Tope en línea por solicitud: con lo ya subido, otro archivo grande no cabe
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
    const pasaTope = await request('/api/afiliacion/documentos', 'POST', {
      carga_token: reciente.token, tipo_documento: 'DPI_REVERSO', archivo: pdfGrande(`extra-${sufijo}`, 3 * 1024 * 1024),
    });
    assert(resultados.every((s) => s === 201) && pasaTope.status === 409,
      'Sin sesión, a una solicitud no se le suben más de 25 MB en total (H-84)');
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
