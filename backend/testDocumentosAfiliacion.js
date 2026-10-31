// Las pruebas nunca envían correo real (ver mailerService) y usan los límites de prueba: debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';
process.env.NODE_ENV = 'test';

/**
 * testDocumentosAfiliacion.js
 *
 * Documentos de afiliación (Fase 6, parte 1): validación por contenido, portal del asociado, expediente del
 * operador, bandeja y revisión, segregación de funciones, descarga protegida con registro de accesos y los triggers
 * que impiden cambiar o borrar documentos con el rol de la aplicación.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { server } = require('./src/server');
const db = require('./src/config/db');
const { DOCUMENTOS } = require('./src/config/constants');
const { leerDocumento } = require('./src/utils/documentoArchivo');
const {
  makeRequest,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  purgarDocumentosDePrueba,
  poolDueno,
} = require('./testHelper');
const mailerService = require('./src/services/mailerService');
const { firmarCargaDocumentosToken } = require('./src/utils/afiliacionToken');
const { purgarCargasPreviasVencidas } = require('./src/services/limpiezaCargasPreviasService');

const CARPETA = path.join(__dirname, 'uploads', 'afiliaciones');

// Archivos mínimos válidos; `marca` los hace distintos (cada versión necesita un sha256 propio)
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'
);
const png = (marca) => `data:image/png;base64,${Buffer.concat([PNG_1X1, Buffer.from(String(marca))]).toString('base64')}`;
const jpg = (marca) => `data:image/jpeg;base64,${Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.from(String(marca)),
  Buffer.from([0xff, 0xd9]),
]).toString('base64')}`;
const pdf = (marca, extra = '') =>
  `data:application/pdf;base64,${Buffer.from(`%PDF-1.4\n%${marca}\n1 0 obj<<${extra}>>endobj\ntrailer<<>>\n%%EOF\n`).toString('base64')}`;

/** GET binario (la descarga de un documento), con el token en la cabecera o en la URL. */
const getArchivo = (port, ruta, token) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path: ruta, method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        const partes = [];
        res.on('data', (parte) => partes.push(parte));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, cuerpo: Buffer.concat(partes) }));
      }
    );
    req.on('error', reject);
    req.end();
  });

/** Código de error de Postgres de una sentencia que debería fallar (null si no falló). */
const codigoDeError = async (sql, params = []) => (await errorDe(sql, params))?.code ?? null;

/** Error de Postgres de una sentencia que debería fallar (null si no falló). */
const errorDe = async (sql, params = []) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return error;
  }
};

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] DOCUMENTOS DE AFILIACIÓN');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-7);
  const dpi = (prefijo) => `${prefijo}${sufijo}000`.slice(0, 13);
  // Primero las personas con documentos, después el personal que los escaneó o revisó (ver borrarPersonaDePrueba)
  const asociados = [];
  const personal = [];
  // DPI sin persona (cargas previas y solicitudes de la sección 7) y solicitudes creadas
  const dpisSinPersona = [];
  const solicitudes = [];
  const tokens = [];
  let errorInesperado = false;

  const entrar = async (codigo) => {
    const login = await request('/api/auth/login', 'POST', { identifier: codigo, password: 'admin123' });
    if (login.body?.token) tokens.push(login.body.token);
    return login.body?.token;
  };
  const crear = async (lista, datos) => {
    const creado = await crearUsuarioDePrueba(db, datos);
    lista.push(creado.idPersona);
    return { ...creado, token: await entrar(datos.codigo) };
  };

  try {
    const ana = await crear(asociados, { dpi: dpi('981'), codigo: `EX-TDA${sufijo}`, email: `ana.doc.${sufijo}@example.com`, rol: 'ASOCIADO', asociado: true });
    const beto = await crear(asociados, { dpi: dpi('982'), codigo: `EX-TDB${sufijo}`, email: `beto.doc.${sufijo}@example.com`, rol: 'ASOCIADO', asociado: true });
    // Operador que además es asociado: no atiende sus propios documentos
    const doble = await crear(asociados, { dpi: dpi('983'), codigo: `OP-TDD${sufijo}`, email: `doble.doc.${sufijo}@example.com`, rol: 'OPERADOR', asociado: true });
    // Usuario de asociado sin afiliación (no debería pasar, pero el portal no debe fallar)
    const sinAfiliacion = await crear(asociados, { dpi: dpi('987'), codigo: `EX-TDS${sufijo}`, email: `sin.doc.${sufijo}@example.com`, rol: 'ASOCIADO' });
    const op = await crear(personal, { dpi: dpi('984'), codigo: `OP-TDO${sufijo}`, email: `op.doc.${sufijo}@example.com`, rol: 'OPERADOR' });
    const op2 = await crear(personal, { dpi: dpi('988'), codigo: `OP-TDP${sufijo}`, email: `op2.doc.${sufijo}@example.com`, rol: 'OPERADOR' });
    const ej = await crear(personal, { dpi: dpi('985'), codigo: `EJ-TDE${sufijo}`, email: `ej.doc.${sufijo}@example.com`, rol: 'EJECUTIVO' });
    const ad = await crear(personal, { dpi: dpi('986'), codigo: `AD-TDA${sufijo}`, email: `ad.doc.${sufijo}@example.com`, rol: 'ADMINISTRADOR' });

    // -------------------------------------------------------------------------
    console.log('--- 1. Validación por contenido ---');
    assert(leerDocumento(pdf('a')).mime === 'application/pdf' && leerDocumento(png('a')).mime === 'image/png'
      && leerDocumento(jpg('a')).mime === 'image/jpeg', 'Acepta PDF, PNG y JPG completos');
    const falla = (dataUri) => { try { leerDocumento(dataUri); return null; } catch (e) { return e.statusCode; } };
    assert(falla(`data:application/pdf;base64,${Buffer.from('<html><script>x</script></html>').toString('base64')}`) === 400,
      'Rechaza un HTML declarado como PDF');
    assert(falla(png('b').replace('image/png', 'image/jpeg')) === 400, 'Rechaza un PNG declarado como JPG');
    assert(falla(`data:image/gif;base64,${PNG_1X1.toString('base64')}`) === 400, 'Rechaza un formato no permitido');
    assert(falla('') === 400 && falla('data:application/pdf;base64,@@@') === 400 && falla(null) === 400,
      'Rechaza un archivo vacío o mal codificado');
    assert(falla(pdf('c', '/OpenAction 2 0 R /JavaScript (app.alert(1))')) === 400, 'Rechaza un PDF con JavaScript');
    assert(falla(pdf('d', '/OpenAction [3 0 R /Fit] /URI (https://ejemplo.gt)')) === null,
      'Acepta un PDF que solo fija la vista inicial y tiene enlaces');
    assert(falla(pdf('e', '/J#53 (app.alert(1))')) === 400 && falla(pdf('f', '/Type/EmbeddedFile>>')) === 400
      && falla(pdf('g', '/JS%comentario\n(x)')) === 400 && falla(pdf('h', '/S/SubmitForm')) === 400,
      'Tampoco pasan los nombres escritos en hexadecimal, seguidos de > o de un comentario, ni el envío de formularios');
    const grande = Buffer.alloc(DOCUMENTOS.TAMANO_MAXIMO_BYTES + 1, 0x20);
    PNG_1X1.copy(grande);
    assert(falla(`data:image/png;base64,${grande.toString('base64')}`) === 413, 'Rechaza un archivo de más de 5 MB (413)');

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Portal del asociado ---');
    assert((await request('/api/asociado/documentos', 'GET', null, sinAfiliacion.token)).status === 404,
      'Un usuario de asociado sin afiliación recibe 404');
    const vacio = await request('/api/asociado/documentos', 'GET', null, ana.token);
    assert(vacio.status === 200 && vacio.body.data.documentos.length === 0 && vacio.body.data.resumen.estado === 'INCOMPLETO'
      && vacio.body.data.resumen.faltantes.length === 4, 'Sin documentos: le faltan los 4 obligatorios');
    const subir = (token, tipo, archivo) => request('/api/asociado/documentos', 'POST', { tipo_documento: tipo, archivo }, token);
    const frente = await subir(ana.token, 'DPI_FRENTE', jpg('frente-1'));
    assert(frente.status === 201 && frente.body.data.documentos[0]?.estado === 'PENDIENTE'
      && frente.body.data.documentos[0]?.url?.startsWith('/api/uploads/afiliaciones/doc_'), 'Sube el frente del DPI (PENDIENTE, con URL protegida)');
    assert((await subir(ana.token, 'PASAPORTE', jpg('x'))).status === 400, 'Un tipo de documento desconocido da 400');
    assert((await subir(ana.token, 'DPI_REVERSO', jpg('frente-1'))).status === 400, 'El mismo archivo no entra como frente y reverso');
    assert((await subir(ana.token, 'DPI_FRENTE', jpg('frente-1'))).status === 400, 'No vuelve a subir el mismo archivo que ya está');
    await subir(ana.token, 'DPI_REVERSO', jpg('reverso-1'));
    await subir(ana.token, 'RECIBO_SERVICIOS', pdf('recibo-1'));
    const completo = await subir(ana.token, 'FOTO_CON_DPI', png('foto-1'));
    assert(completo.status === 201 && completo.body.data.resumen.estado === 'EN_REVISION' && completo.body.data.resumen.faltantes.length === 0,
      'Con los 4 obligatorios queda en revisión');

    const archivoAnterior = frente.body.data.documentos[0].url.split('/').pop();
    const reemplazo = await subir(ana.token, 'DPI_FRENTE', jpg('frente-2'));
    const versiones = (await db.query(
      `SELECT d.estado FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE e.id_persona = $1 AND d.tipo_documento = 'DPI_FRENTE' ORDER BY d.id_documento`, [ana.idPersona]
    )).rows.map((v) => v.estado);
    assert(reemplazo.status === 201 && versiones.join() === 'REEMPLAZADO,PENDIENTE' && fs.existsSync(path.join(CARPETA, archivoAnterior)),
      'Reemplazar un pendiente deja la versión anterior REEMPLAZADO y conserva su archivo');

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Bandeja y revisión ---');
    const bandeja = await request('/api/operador/documentos?estado=PENDIENTE&search=' + `EX-TDA${sufijo}`, 'GET', null, op.token);
    const deAna = bandeja.body.data || [];
    assert(bandeja.status === 200 && deAna.length === 4 && deAna.every((d) => d.es_propio === false && d.id_asociado === ana.idAsociado)
      && bandeja.body.conteos.PENDIENTE >= 4, 'El operador ve los 4 pendientes de la asociada');
    assert((await request('/api/operador/documentos', 'GET', null, ad.token)).status === 403
      && (await request('/api/operador/documentos', 'GET', null, ej.token)).status === 403,
      'El administrador y el ejecutivo no tienen la bandeja de documentos');

    const idDe = (tipo) => deAna.find((d) => d.tipo_documento === tipo).id_documento;
    const revisar = (token, id, resultado, motivo) => request(`/api/operador/documentos/${id}/revision`, 'PATCH', { resultado, motivo }, token);
    assert((await revisar(op.token, idDe('DPI_REVERSO'), 'RECHAZADO', 'no')).status === 400
      && (await revisar(op.token, idDe('DPI_REVERSO'), 'RECHAZADO', '😀😀😀')).status === 400,
      'Rechazar exige un motivo de al menos 5 caracteres (los emojis cuentan como uno, igual que en el CHECK)');
    const rechazo = await revisar(op.token, idDe('DPI_REVERSO'), 'RECHAZADO', 'La foto está borrosa, no se lee el número.');
    assert(rechazo.status === 200 && rechazo.body.documento.estado === 'RECHAZADO' && rechazo.body.correo_enviado === false,
      'Rechaza con motivo e informa que el correo no salió (correo desactivado)');
    assert((await revisar(op.token, idDe('DPI_REVERSO'), 'ACEPTADO')).status === 409, 'Un documento ya revisado no se vuelve a revisar (409)');
    const acepto = await revisar(op.token, idDe('DPI_FRENTE'), 'ACEPTADO');
    assert(acepto.status === 200 && acepto.body.correo_enviado === null, 'Acepta el frente del DPI (sin correo)');
    assert((await revisar(ej.token, idDe('RECIBO_SERVICIOS'), 'ACEPTADO')).status === 403
      && (await revisar(ad.token, idDe('RECIBO_SERVICIOS'), 'ACEPTADO')).status === 403
      && (await revisar(ana.token, idDe('RECIBO_SERVICIOS'), 'ACEPTADO')).status === 403,
      'El ejecutivo, el administrador y el asociado no revisan documentos');

    const vista = (await request('/api/asociado/documentos', 'GET', null, ana.token)).body.data;
    const reverso = vista.documentos.find((d) => d.tipo_documento === 'DPI_REVERSO');
    assert(reverso.estado === 'RECHAZADO' && reverso.motivo_rechazo === 'La foto está borrosa, no se lee el número.'
      && vista.resumen.estado === 'INCOMPLETO' && vista.resumen.faltantes.join() === 'DPI_REVERSO',
      'La asociada ve el rechazo con su motivo y que le falta el reverso');
    const otraVez = await subir(ana.token, 'DPI_REVERSO', jpg('reverso-2'));
    assert(otraVez.status === 201 && otraVez.body.data.documentos.find((d) => d.tipo_documento === 'DPI_REVERSO').estado === 'PENDIENTE',
      'Vuelve a subir el reverso y queda pendiente');
    assert((await subir(ana.token, 'DPI_FRENTE', jpg('frente-3'))).status === 409, 'La asociada no reemplaza un documento aceptado (409)');
    const escaneado = await request(`/api/admin/asociados/${ana.idAsociado}/documentos`, 'POST',
      { tipo_documento: 'DPI_FRENTE', archivo: jpg('frente-ventanilla') }, op.token);
    const escaneadoFrente = escaneado.body.data?.documentos.find((d) => d.tipo_documento === 'DPI_FRENTE');
    assert(escaneado.status === 201 && escaneadoFrente?.estado === 'PENDIENTE' && escaneadoFrente.cargado_por_mi === true,
      'El operador sí reemplaza un aceptado desde el expediente (queda pendiente y marcado como suyo)');
    assert((await request(`/api/admin/asociados/abc/documentos`, 'POST', { tipo_documento: 'DPI_FRENTE', archivo: jpg('z') }, op.token)).status === 400
      && (await request(`/api/admin/asociados/999999999/documentos`, 'POST', { tipo_documento: 'DPI_FRENTE', archivo: jpg('z') }, op.token)).status === 404,
      'Un asociado inválido da 400 y uno que no existe, 404');
    const porRevisar = async (token) => (await request('/api/operador/documentos?estado=PENDIENTE&limit=1', 'GET', null, token)).body.por_revisar;
    const [pendientesOp, pendientesOp2] = [await porRevisar(op.token), await porRevisar(op2.token)];
    const cuatroOjos = await revisar(op.token, escaneadoFrente.id_documento, 'ACEPTADO');
    assert(cuatroOjos.status === 403 && cuatroOjos.body.error === 'REVISION_POR_QUIEN_CARGO',
      'Quien escaneó el documento no lo acepta (403 REVISION_POR_QUIEN_CARGO)');
    assert(pendientesOp2 === pendientesOp + 1, 'El contador «por revisar» no incluye lo que subió el mismo operador');
    assert((await revisar(op2.token, escaneadoFrente.id_documento, 'ACEPTADO')).status === 200, 'Un colega sí lo acepta');
    const historial = await request(`/api/operador/documentos/${idDe('DPI_FRENTE')}/historial`, 'GET', null, op.token);
    assert(historial.status === 200 && historial.body.data.length === 3
      && historial.body.data[0].canal_carga === 'VENTANILLA' && historial.body.data[0].revisado_por === `OP-TDP${sufijo}`
      && historial.body.data[1].resultado === 'ACEPTADO',
      'El historial muestra las 3 versiones del frente con su revisión');
    const expediente = await request(`/api/admin/asociados/${ana.idAsociado}/expediente`, 'GET', null, op.token);
    assert(expediente.status === 200 && expediente.body.data.documentos.length === 4 && expediente.body.data.documentos_resumen.estado === 'EN_REVISION'
      && expediente.body.data.asociado.es_propio === false,
      'El expediente del asociado trae sus documentos y su resumen');

    // Tope de versiones del interesado
    let ultima = null;
    for (let i = 0; i < DOCUMENTOS.MAX_VERSIONES_POR_TIPO + 1; i++) ultima = await subir(ana.token, 'CONSTANCIA_INGRESOS', pdf(`constancia-${i}`));
    assert(ultima.status === 409, `Después de ${DOCUMENTOS.MAX_VERSIONES_POR_TIPO} versiones de un tipo, el asociado debe ir a la agencia (409)`);
    // Lo que se escanea en ventanilla no cuenta para ese tope
    await subir(beto.token, 'RECIBO_SERVICIOS', pdf('beto-recibo-0'));
    for (let i = 1; i <= DOCUMENTOS.MAX_VERSIONES_POR_TIPO; i++) {
      await request(`/api/admin/asociados/${beto.idAsociado}/documentos`, 'POST', { tipo_documento: 'RECIBO_SERVICIOS', archivo: pdf(`beto-recibo-${i}`) }, op.token);
    }
    const reciboBeto = await subir(beto.token, 'RECIBO_SERVICIOS', pdf('beto-recibo-final'));
    assert(reciboBeto.status === 201, 'Las versiones escaneadas en ventanilla no cuentan para el tope del asociado');

    // -------------------------------------------------------------------------
    console.log('\n--- 4. Segregación de funciones ---');
    const propio = await request(`/api/admin/asociados/${doble.idAsociado}/documentos`, 'POST',
      { tipo_documento: 'DPI_FRENTE', archivo: jpg('doble-1') }, doble.token);
    assert(propio.status === 403 && propio.body.error === 'AUTOATENCION_NO_PERMITIDA', 'El operador no escanea documentos a su propio expediente');
    await request(`/api/admin/asociados/${doble.idAsociado}/documentos`, 'POST', { tipo_documento: 'DPI_FRENTE', archivo: jpg('doble-2') }, op.token);
    const porDpi = (await request(`/api/operador/documentos?search=${dpi('983')}`, 'GET', null, doble.token)).body.data || [];
    assert(porDpi.length === 1 && porDpi[0].es_propio === true, 'En la bandeja, sus propios documentos vienen marcados');
    const autoRevision = await revisar(doble.token, porDpi[0].id_documento, 'ACEPTADO');
    assert(autoRevision.status === 403 && autoRevision.body.error === 'AUTOATENCION_NO_PERMITIDA', 'Nadie revisa sus propios documentos (403)');
    const suExpediente = await request(`/api/admin/asociados/${doble.idAsociado}/expediente`, 'GET', null, doble.token);
    assert(suExpediente.status === 200 && suExpediente.body.data.asociado.es_propio === true,
      'Su propio expediente viene marcado (la pantalla no ofrece escanear ni revisar)');

    // -------------------------------------------------------------------------
    console.log('\n--- 5. Descarga protegida ---');
    const url = (await request('/api/asociado/documentos', 'GET', null, ana.token)).body.data.documentos
      .find((d) => d.tipo_documento === 'RECIBO_SERVICIOS').url;
    const accesosAntes = (await db.query('SELECT count(*)::int AS n FROM accesos_documento a JOIN documentos_afiliacion d ON d.id_documento = a.id_documento WHERE d.archivo = $1', [url.split('/').pop()])).rows[0].n;
    const delOperador = await getArchivo(port, url, op.token);
    assert(delOperador.status === 200 && delOperador.headers['content-type'].startsWith('application/pdf')
      && delOperador.headers['cache-control'] === 'private, no-store'
      && /inline; filename="RECIBO_SERVICIOS\.pdf"/.test(delOperador.headers['content-disposition'])
      && delOperador.cuerpo.subarray(0, 5).toString() === '%PDF-', 'El operador abre el documento, sin caché y con su tipo real');
    assert((await getArchivo(port, url, ana.token)).status === 200, 'La dueña abre su documento');
    assert((await getArchivo(port, url, ad.token)).status === 200 && (await getArchivo(port, url, ej.token)).status === 200,
      'El administrador y el ejecutivo también lo abren');
    assert((await getArchivo(port, url, beto.token)).status === 404, 'Otro asociado no lo abre: se le responde como si no existiera (404)');
    assert((await getArchivo(port, url)).status === 401, 'Sin sesión, 401');
    assert((await getArchivo(port, `${url}?token=${ana.token}`)).status === 401, 'Los documentos de afiliación no aceptan el token en la URL');
    assert((await getArchivo(port, '/api/uploads/afiliaciones/doc_00000000-0000-0000-0000-000000000000.pdf', op.token)).status === 404,
      'Un documento que no existe da 404');
    const accesosDespues = (await db.query('SELECT count(*)::int AS n FROM accesos_documento a JOIN documentos_afiliacion d ON d.id_documento = a.id_documento WHERE d.archivo = $1', [url.split('/').pop()])).rows[0].n;
    assert(accesosDespues === accesosAntes + 4, 'Cada apertura queda registrada (operador, dueña, administrador y ejecutivo; los rechazos no)');
    const enMayusculas = url.replace('/afiliaciones/', '/AFILIACIONES/');
    assert((await getArchivo(port, `${enMayusculas}?token=${op.token}`)).status === 401
      && (await getArchivo(port, enMayusculas, op.token)).status === 200
      && (await getArchivo(port, '/api/uploads/otra/archivo.pdf', op.token)).status === 404,
      'La carpeta con otras mayúsculas sigue las reglas de los documentos (sin token en la URL) y una carpeta desconocida da 404');

    // -------------------------------------------------------------------------
    console.log('\n--- 6. Triggers y permisos con el rol de la aplicación ---');
    const idAceptado = idDe('DPI_FRENTE');
    assert(await codigoDeError('UPDATE documentos_afiliacion SET tamano_bytes = 1 WHERE id_documento = $1', [idAceptado]) === '23001',
      'No cambia nada de un documento salvo su estado');
    assert(await codigoDeError("UPDATE documentos_afiliacion SET estado = 'PENDIENTE' WHERE id_documento = $1", [idAceptado]) === '23001',
      'No devuelve un documento reemplazado a pendiente');
    assert(await codigoDeError('DELETE FROM documentos_afiliacion WHERE id_documento = $1', [idAceptado]) === '42501',
      'No borra documentos');
    assert(await codigoDeError("UPDATE revisiones_documento SET motivo = 'otro' WHERE id_documento = $1", [idDe('DPI_REVERSO')]) === '42501'
      && await codigoDeError('DELETE FROM accesos_documento WHERE id_documento = $1', [idDe('RECIBO_SERVICIOS')]) === '42501',
      'No cambia revisiones ni accesos');
    assert(await codigoDeError('UPDATE expedientes_documentos SET id_persona = $1 WHERE id_persona = $2', [beto.idPersona, ana.idPersona]) === '23001',
      'Un expediente no cambia de dueño');
    const otroDpi = await errorDe(
      `INSERT INTO expedientes_documentos (cui_dpi, id_persona, canal_origen, id_usuario_crea, fecha_vinculacion)
       VALUES ($1, $2, 'ASOCIADO_ACTUAL', $3, CURRENT_TIMESTAMP)`, [dpi('981'), ej.idPersona, op.idUsuario]
    );
    assert(otroDpi?.code === '23503' && otroDpi.constraint === 'fk_expediente_persona_dpi',
      'El expediente de una persona lleva su DPI, no el de otra');
    const expedienteBeto = (await db.query('SELECT id_expediente FROM expedientes_documentos WHERE id_persona = $1', [beto.idPersona])).rows[0].id_expediente;
    const otroTipo = await errorDe(
      `INSERT INTO documentos_afiliacion (id_expediente, tipo_documento, archivo, tamano_bytes, sha256, id_documento_anterior, canal_carga, id_usuario_carga)
       VALUES ($1, 'DPI_FRENTE', 'doc_00000000-0000-0000-0000-000000000001.pdf', 1, $2, $3, 'PORTAL', $4)`,
      [expedienteBeto, '0'.repeat(64), idDe('RECIBO_SERVICIOS'), beto.idUsuario]
    );
    assert(otroTipo?.code === '23503' && otroTipo.constraint === 'fk_documento_anterior_mismo_tipo',
      'Una versión solo reemplaza a otra del mismo expediente y tipo');
    const idReciboBeto = reciboBeto.body.data.documentos.find((d) => d.tipo_documento === 'RECIBO_SERVICIOS').id_documento;
    await revisar(op2.token, idReciboBeto, 'RECHAZADO', 'El recibo no muestra la dirección completa.');
    const sinMotivo = await errorDe(
      "INSERT INTO revisiones_documento (id_documento, resultado, motivo, id_usuario_revisa) VALUES ($1, 'RECHAZADO', NULL, $2)",
      [idReciboBeto, op2.idUsuario]
    );
    assert(sinMotivo?.code === '23514' && sinMotivo.constraint === 'chk_revision_motivo', 'Un rechazo sin motivo (NULL) no pasa el CHECK');
    const incoherente = await errorDe(
      "INSERT INTO revisiones_documento (id_documento, resultado, id_usuario_revisa) VALUES ($1, 'ACEPTADO', $2)",
      [idReciboBeto, op2.idUsuario]
    );
    assert(incoherente?.code === '23514' && /resultado debe ser el estado/.test(incoherente.message),
      'Una revisión no puede decir otra cosa que el estado del documento');

    // -------------------------------------------------------------------------
    console.log('\n--- 7. Afiliación con documentos (Fase 6, partes 2 y 3) ---');
    // 7.1 Personal que se afilia: sube los suyos a su expediente; quien ya es asociado los sube desde su portal
    const delPersonal = await request('/api/afiliacion/personal/documentos', 'POST', { tipo_documento: 'DPI_FRENTE', archivo: pdf('personal-op') }, op.token);
    const origenPersonal = (await db.query('SELECT canal_origen FROM expedientes_documentos WHERE id_persona = $1', [op.idPersona])).rows[0];
    const personalAsociado = await request('/api/afiliacion/personal/documentos', 'GET', null, doble.token);
    assert(delPersonal.status === 201 && origenPersonal?.canal_origen === 'PERSONAL' && personalAsociado.status === 409,
      'El personal sube sus documentos de afiliación; si ya es asociado, se le manda a su portal');

    // 7.2 Ventanilla escanea antes de afiliar: queda como carga previa, sin enlace y sin poder abrirse
    const dpiVentanilla = dpi('989');
    dpisSinPersona.push(dpiVentanilla);
    const escaneo = await request('/api/admin/asociados/documentos-afiliacion', 'POST', {
      cui_dpi: dpiVentanilla, tipo_documento: 'DPI_FRENTE', archivo: pdf('ventanilla-previa'),
    }, op.token);
    const listaPrevia = await request(`/api/admin/asociados/documentos-afiliacion?cui_dpi=${dpiVentanilla}`, 'GET', null, op2.token);
    const archivoPrevio = (await db.query(
      `SELECT d.archivo FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE e.cui_dpi = $1 AND e.id_persona IS NULL AND e.id_solicitud IS NULL`, [dpiVentanilla]
    )).rows[0]?.archivo;
    const abrirPrevio = await getArchivo(port, `/api/uploads/afiliaciones/${archivoPrevio}`, op2.token);
    assert(escaneo.status === 201 && listaPrevia.status === 200 && listaPrevia.body.data.resumen.faltantes.length === 3
      && listaPrevia.body.data.documentos.every((d) => !d.url) && abrirPrevio.status === 404,
      'El documento escaneado antes de afiliar queda como carga previa: se lista sin enlace y no se abre');
    const escaneoPropio = await request('/api/admin/asociados/documentos-afiliacion', 'POST', {
      cui_dpi: dpi('983'), tipo_documento: 'DPI_FRENTE', archivo: pdf('propio'),
    }, doble.token);
    assert(escaneoPropio.status === 403 && escaneoPropio.body.error === 'AUTOATENCION_NO_PERMITIDA', 'Nadie escanea sus propios documentos');

    // 7.2.1 Una carga previa vencida que la purga todavía no borró no bloquea al DPI: se reutiliza y vuelve a vencer en 30 días
    await db.query("UPDATE expedientes_documentos SET expira_en = now() - interval '1 minute' WHERE cui_dpi = $1 AND id_persona IS NULL", [dpiVentanilla]);
    const trasVencer = await request('/api/admin/asociados/documentos-afiliacion', 'POST', {
      cui_dpi: dpiVentanilla, tipo_documento: 'DPI_REVERSO', archivo: pdf('ventanilla-vencida'),
    }, op.token);
    const renovada = (await db.query(
      "SELECT count(*)::int AS n, bool_and(expira_en > now() + interval '29 days') AS renovada FROM expedientes_documentos WHERE cui_dpi = $1",
      [dpiVentanilla]
    )).rows[0];
    assert(trasVencer.status === 201 && renovada.n === 1 && renovada.renovada,
      'Una carga previa vencida sin purgar se reutiliza (no da error) y vuelve a vencer en 30 días');

    // 7.3 La purga diaria borra la carga previa vencida (filas y archivo); el rol de la aplicación no puede borrarla
    await db.query("UPDATE expedientes_documentos SET expira_en = now() - interval '1 minute' WHERE cui_dpi = $1 AND id_persona IS NULL", [dpiVentanilla]);
    assert(await codigoDeError('DELETE FROM expedientes_documentos WHERE cui_dpi = $1', [dpiVentanilla]) === '42501',
      'El rol de la aplicación no borra una carga previa vencida por su cuenta');
    const borrados = await purgarCargasPreviasVencidas();
    const quedan = await db.query('SELECT 1 FROM expedientes_documentos WHERE cui_dpi = $1', [dpiVentanilla]);
    const archivoExiste = fs.existsSync(path.join(CARPETA, archivoPrevio));
    const personalSigue = await db.query('SELECT 1 FROM expedientes_documentos WHERE id_persona = $1', [op.idPersona]);
    assert(borrados >= 1 && quedan.rows.length === 0 && !archivoExiste && personalSigue.rows.length === 1,
      'La purga borra la carga previa vencida y su archivo, y no toca otros expedientes');

    // 7.4 Externo: sube sus documentos después de registrar la solicitud, con el permiso de esa solicitud
    const dpiExterno = dpi('990');
    dpisSinPersona.push(dpiExterno);
    const idSolicitud = (await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
       VALUES ('', $1, 'Externo', 'Documentos', '55550990', '1990-03-03', $2, 'PENDIENTE_AGENCIA') RETURNING id_solicitud`,
      [dpiExterno, `externo.doc.${sufijo}@example.com`]
    )).rows[0].id_solicitud;
    solicitudes.push(idSolicitud);
    const cargaToken = firmarCargaDocumentosToken({ id_solicitud: idSolicitud, cui_dpi: dpiExterno });
    const otroToken = firmarCargaDocumentosToken({ id_solicitud: idSolicitud, cui_dpi: dpi('999') });
    const delExterno = await request('/api/afiliacion/documentos', 'POST', { carga_token: cargaToken, tipo_documento: 'RECIBO_SERVICIOS', archivo: pdf('externo-recibo') });
    const conOtroDpi = await request('/api/afiliacion/documentos', 'POST', { carga_token: otroToken, tipo_documento: 'DPI_FRENTE', archivo: pdf('externo-otro') });
    const expedienteExterno = (await db.query('SELECT id_solicitud, expira_en FROM expedientes_documentos WHERE cui_dpi = $1', [dpiExterno])).rows[0];
    assert(delExterno.status === 201 && conOtroDpi.status === 403
      && expedienteExterno?.id_solicitud === idSolicitud && expedienteExterno.expira_en === null,
      'El externo sube sus documentos a su solicitud con el permiso de esa solicitud (no con otro DPI)');

    // 7.4.1 El permiso de una solicitud no llega a los documentos de otra persona con ese DPI: si ya es asociado se
    //       rechaza, y si es del personal (con su propio expediente) solo toca el de la solicitud
    const idSolicitudAna = (await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
       VALUES ('', $1, 'Suplanta', 'Ana', '55550991', '1990-03-03', $2, 'PENDIENTE_AGENCIA') RETURNING id_solicitud`,
      [dpi('981'), `suplanta.ana.${sufijo}@example.com`]
    )).rows[0].id_solicitud;
    solicitudes.push(idSolicitudAna);
    const contraAsociada = await request('/api/afiliacion/documentos/consultar', 'POST', {
      carga_token: firmarCargaDocumentosToken({ id_solicitud: idSolicitudAna, cui_dpi: dpi('981') }),
    });
    const idSolicitudOp = (await db.query(
      `INSERT INTO solicitudes_afiliacion_agencia (numero_caso, cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento, email, estado)
       VALUES ('', $1, 'Suplanta', 'Operador', '55550992', '1990-03-03', $2, 'PENDIENTE_AGENCIA') RETURNING id_solicitud`,
      [dpi('984'), `suplanta.op.${sufijo}@example.com`]
    )).rows[0].id_solicitud;
    solicitudes.push(idSolicitudOp);
    dpisSinPersona.push(dpi('984'));
    const tokenOp = firmarCargaDocumentosToken({ id_solicitud: idSolicitudOp, cui_dpi: dpi('984') });
    const vistaOp = await request('/api/afiliacion/documentos/consultar', 'POST', { carga_token: tokenOp });
    const subidaOp = await request('/api/afiliacion/documentos', 'POST', { carga_token: tokenOp, tipo_documento: 'DPI_FRENTE', archivo: pdf('suplanta-op') });
    const delPersonalOp = (await db.query(
      `SELECT count(*)::int AS n FROM documentos_afiliacion d JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
       WHERE e.id_persona = $1`, [op.idPersona]
    )).rows[0].n;
    // Con el DPI de una asociada no se responde distinto (no revela que lo es) ni se ven sus documentos
    assert(contraAsociada.status === 200 && contraAsociada.body.data.documentos.length === 0 && vistaOp.status === 200 && vistaOp.body.data.documentos.length === 0
      && subidaOp.status === 201 && delPersonalOp === 1,
      'El permiso de una solicitud no ve ni toca los documentos de otra persona con ese DPI, ni revela si es asociada');

    // 7.5 Rechazo a un solicitante sin portal: el correo le pide llevarlo a la agencia
    const idReciboExterno = delExterno.body.data.documentos.find((d) => d.tipo_documento === 'RECIBO_SERVICIOS').id_documento;
    const enviarOriginal = mailerService.sendDocumentoRechazadoEmail;
    let datosCorreo = null;
    mailerService.sendDocumentoRechazadoEmail = async (datos) => {
      datosCorreo = datos;
      return { success: true, simulado: false, messageId: 'prueba' };
    };
    let rechazoExterno;
    try {
      rechazoExterno = await revisar(op.token, idReciboExterno, 'RECHAZADO', 'El recibo tiene más de tres meses.');
    } finally {
      mailerService.sendDocumentoRechazadoEmail = enviarOriginal;
    }
    assert(rechazoExterno.status === 200 && datosCorreo?.sinPortal === true && datosCorreo.to === `externo.doc.${sufijo}@example.com`,
      'El rechazo a un solicitante sin portal le avisa que lleve el documento a la agencia');
    await db.query("UPDATE solicitudes_afiliacion_agencia SET estado = 'CANCELADA' WHERE id_solicitud = $1", [idSolicitud]);
    const solicitudCerrada = await request('/api/afiliacion/documentos', 'POST', { carga_token: cargaToken, tipo_documento: 'DPI_FRENTE', archivo: pdf('externo-cerrada') });
    assert(solicitudCerrada.status === 403, 'Con la solicitud cerrada ya no se suben documentos en línea');
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    for (const token of tokens) await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    try {
      await purgarDocumentosDePrueba(db, dpisSinPersona);
      if (solicitudes.length) {
        await poolDueno(db.pool).query('DELETE FROM solicitudes_afiliacion_agencia WHERE id_solicitud = ANY($1)', [solicitudes]);
      }
      for (const idPersona of [...asociados, ...personal]) await borrarPersonaDePrueba(db, idPersona);
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
