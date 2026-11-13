// Las pruebas nunca envían correo real y usan el código de verificación de desarrollo: debe ir antes de cargar el servidor.
const CODIGO_DEV = '246810';
process.env.CODIGO_VERIFICACION_DEV = CODIGO_DEV;
process.env.MAIL_ENABLED = 'false';
process.env.NODE_ENV = 'test';

/**
 * testIdentidadAfiliacionBanco.js
 *
 * Issue #124: un cliente del banco que la cooperativa todavía no tiene se registra con la identidad que el banco
 * devuelve al validar la Banca en Línea (nombres, apellidos, teléfono, dirección y fecha de nacimiento), nunca con
 * datos de relleno. También: el comprobante sin identidad no sirve, un menor de edad no se afilia ni se le debita,
 * «terminar en una agencia» usa el nombre del banco y no el del cuerpo, y sin fecha de nacimiento en el banco no se
 * emite comprobante. Usa el banco real (puerto 5002) con clientes de prueba que crea y borra.
 */
const bcrypt = require('bcryptjs');
const { server } = require('./src/server');
const db = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { firmarAfiliacionToken } = require('./src/utils/afiliacionToken');
const {
  makeRequest,
  createTestReporter,
  borrarPersonaDePrueba,
  borrarClienteBancoDePrueba,
  purgarDocumentosDePrueba,
  purgarEfectivoDePrueba,
  pdfDePrueba,
  poolDueno,
} = require('./testHelper');

const CLAVE_BANCA = 'BancoPrueba1!';
const DOCUMENTOS_OBLIGATORIOS = ['DPI_FRENTE', 'DPI_REVERSO', 'RECIBO_SERVICIOS', 'FOTO_CON_DPI'];
const APORTE = 150;
const ANIOS_MENOR = 17;

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] IDENTIDAD DEL BANCO EN LA AFILIACIÓN EN LÍNEA (#124)');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-8);
  // DPI de prueba (13 dígitos) que no existen en la semilla de la cooperativa ni del banco
  const dpi = (prefijo) => `${prefijo}${sufijo}`.padEnd(13, '0').slice(0, 13);
  const dpis = { adulto: dpi('81'), menor: dpi('82'), agencia: dpi('83'), sinFecha: dpi('84') };
  const bancoDueno = poolDueno(db.pool, 'banco_db');
  let errorInesperado = false;

  const fechaHaceAnios = (anios) => {
    const fecha = new Date();
    fecha.setFullYear(fecha.getFullYear() - anios);
    return fecha.toISOString().slice(0, 10);
  };

  /** Cliente externo del banco con una cuenta de ahorro de Q1,000.00 y acceso a la Banca en Línea. */
  const clienteDelBanco = async (cui, datos) => {
    const res = await bancoApiService.aperturarCuentaBancaria({
      cui_dpi: cui, email: `${datos.primer_nombre.toLowerCase()}.${sufijo}@example.com`, tipo_cuenta: 'AHORRO',
      monto_inicial: 1000, referencia: `TEST-IDENTIDAD-${cui}`, ...datos,
    });
    if (!res.success) throw new Error(`No se pudo crear el cliente del banco ${cui}: ${res.message}`);
    const usuario = `identidad.${cui}`;
    const codigo = `CLI-T${cui.slice(0, 2)}${sufijo.slice(-4)}`;
    await bancoDueno.query(
      `INSERT INTO usuarios_banca_en_linea (id_cliente, nombre_usuario, codigo_bancario, password_hash, estado)
       SELECT id_cliente, $2, $3, $4, 'ACTIVO' FROM clientes_banco WHERE cui_dpi = $1`,
      [cui, usuario, codigo, await bcrypt.hash(CLAVE_BANCA, 10)]
    );
    return { cuenta: res.data.numero_cuenta, credenciales: { cui_dpi: cui, nombre_usuario: usuario, codigo, password: CLAVE_BANCA } };
  };

  const validarBanca = (credenciales) => request('/api/afiliacion/validar-credenciales-banco', 'POST', credenciales);
  const subirDocumentos = async (token, marca) => {
    for (const tipo of DOCUMENTOS_OBLIGATORIOS) {
      const subido = await request('/api/afiliacion/documentos', 'POST', {
        afiliacion_token: token, tipo_documento: tipo, archivo: pdfDePrueba(`${marca}-${tipo}-${sufijo}`),
      });
      if (subido.status !== 201) throw new Error(`No se pudo subir ${tipo}: ${JSON.stringify(subido.body)}`);
    }
  };
  const afiliarEnLinea = async (cui, token, cuenta, email) => {
    await request('/api/afiliacion/codigo-correo', 'POST', { email });
    return request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: cui, numero_cuenta_bancaria: cuenta, afiliacion_token: token, monto_aportacion: APORTE,
      password: 'Password123!', email, codigo_verificacion: CODIGO_DEV,
    });
  };
  const saldo = async (numero) => Number((await bancoApiService.consultarCuenta(numero)).data?.saldo_disponible);
  const personaDe = async (cui) => (await db.query(
    `SELECT primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, telefono, direccion,
            to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento
     FROM personas WHERE cui_dpi = $1`,
    [cui]
  )).rows[0];

  const limpiar = async () => {
    const lista = Object.values(dpis);
    for (const cui of lista) {
      const persona = await db.query('SELECT id_persona FROM personas WHERE cui_dpi = $1', [cui]);
      if (persona.rows[0]) await borrarPersonaDePrueba(db, persona.rows[0].id_persona);
    }
    await purgarDocumentosDePrueba(db, lista);
    await purgarEfectivoDePrueba(db, lista);
    await poolDueno(db.pool).query('DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = ANY($1)', [lista]);
    for (const cui of lista) await borrarClienteBancoDePrueba(db.pool, cui);
  };

  try {
    await limpiar();

    // -------------------------------------------------------------------------
    console.log('\n--- 1. Cliente del banco que la cooperativa no tiene: se registra con sus datos del banco ---');
    const identidadAdulto = {
      primer_nombre: 'Ingrid', segundo_nombre: 'Marisol', primer_apellido: 'Quiñónez', segundo_apellido: 'Arévalo',
      telefono: '55448101', direccion: 'Zona 7, Quetzaltenango', fecha_nacimiento: '1991-12-31',
    };
    const adulto = await clienteDelBanco(dpis.adulto, identidadAdulto);
    const banca = await validarBanca(adulto.credenciales);
    const persona = banca.body.persona || {};
    assert(banca.status === 200 && persona.segundo_nombre === 'Marisol' && persona.segundo_apellido === 'Arévalo'
      && persona.fecha_nacimiento === '1991-12-31',
    'La Banca en Línea devuelve el segundo nombre, el segundo apellido y la fecha como AAAA-MM-DD');

    await subirDocumentos(banca.body.afiliacion_token, 'adulto');
    const afiliado = await afiliarEnLinea(dpis.adulto, banca.body.afiliacion_token, adulto.cuenta, `ingrid.${sufijo}@example.com`);
    const registrada = await personaDe(dpis.adulto);
    assert(afiliado.status === 201 && afiliado.body.data?.asociado?.nombre_completo === 'Ingrid Marisol Quiñónez Arévalo',
      'La pantalla final muestra el nombre del banco, no «Cliente Bancario»');
    assert(registrada && registrada.primer_nombre === 'Ingrid' && registrada.segundo_nombre === 'Marisol'
      && registrada.primer_apellido === 'Quiñónez' && registrada.segundo_apellido === 'Arévalo'
      && registrada.telefono === '55448101' && registrada.direccion === 'Zona 7, Quetzaltenango'
      && registrada.fecha_nacimiento === '1991-12-31',
    'La persona queda con los nombres, el teléfono, la dirección y la fecha de nacimiento del banco');

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Un comprobante sin la identidad del banco no sirve ---');
    const sinIdentidad = firmarAfiliacionToken({
      cui_dpi: dpis.menor, tipo_asociado: 'EX', cuentas: [{ id_cuenta_bancaria: 1, numero_cuenta_bancaria: 'CTA-X' }],
    });
    const conTokenViejo = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: dpis.menor, numero_cuenta_bancaria: 'CTA-X', afiliacion_token: sinIdentidad, monto_aportacion: APORTE,
    });
    assert(conTokenViejo.status === 403, 'El comprobante emitido sin identidad se rechaza (403)');

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Un menor de edad no se afilia ni se le debita ---');
    const menor = await clienteDelBanco(dpis.menor, {
      primer_nombre: 'Kevin', primer_apellido: 'Menor', telefono: '55448102', direccion: 'Guatemala',
      fecha_nacimiento: fechaHaceAnios(ANIOS_MENOR),
    });
    const bancaMenor = await validarBanca(menor.credenciales);
    await subirDocumentos(bancaMenor.body.afiliacion_token, 'menor');
    const saldoMenorAntes = await saldo(menor.cuenta);
    const afiliacionMenor = await afiliarEnLinea(dpis.menor, bancaMenor.body.afiliacion_token, menor.cuenta, `kevin.${sufijo}@example.com`);
    assert(afiliacionMenor.status === 400 && afiliacionMenor.body.error === 'MENOR_DE_EDAD'
      && (await saldo(menor.cuenta)) === saldoMenorAntes && !(await personaDe(dpis.menor)),
    'Con 17 años según el banco se rechaza (MENOR_DE_EDAD), sin débito y sin registrar a la persona');

    // -------------------------------------------------------------------------
    console.log('\n--- 4. «Terminar en una agencia» usa el nombre del banco, no el del cuerpo ---');
    const agencia = await clienteDelBanco(dpis.agencia, {
      primer_nombre: 'Luisa', segundo_nombre: 'Fernanda', primer_apellido: 'Barrientos', segundo_apellido: "D'León",
      telefono: '55448103', direccion: 'Mixco', fecha_nacimiento: '1988-03-09',
    });
    const bancaAgencia = await validarBanca(agencia.credenciales);
    const emailAgencia = `luisa.${sufijo}@example.com`;
    await request('/api/afiliacion/codigo-correo', 'POST', { email: emailAgencia });
    const caso = await request('/api/afiliacion/terminar-en-ventanilla', 'POST', {
      afiliacion_token: bancaAgencia.body.afiliacion_token, cui_dpi: dpis.agencia,
      primer_nombre: 'Otro', primer_apellido: 'Nombre', fecha_nacimiento: '2000-01-01',
      telefono: '55448199', email: emailAgencia, monto_estimado: 200, codigo_verificacion: CODIGO_DEV,
    });
    const solicitud = (await db.query(
      `SELECT primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono,
              to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento
       FROM solicitudes_afiliacion_agencia WHERE cui_dpi = $1`,
      [dpis.agencia]
    )).rows[0];
    assert(caso.status === 201 && solicitud && solicitud.primer_nombre === 'Luisa' && solicitud.segundo_nombre === 'Fernanda'
      && solicitud.primer_apellido === 'Barrientos' && solicitud.segundo_apellido === "D'León"
      && solicitud.fecha_nacimiento === '1988-03-09' && solicitud.telefono === '55448199',
    'El caso guarda el nombre (también con apóstrofo) y la fecha del banco; el teléfono es el que eligió el solicitante');

    // -------------------------------------------------------------------------
    console.log('\n--- 5. Sin fecha de nacimiento en el banco no se emite comprobante ---');
    const sinFecha = await clienteDelBanco(dpis.sinFecha, {
      primer_nombre: 'Rocio', primer_apellido: 'Sinfecha', telefono: '55448104', direccion: 'Guatemala',
      fecha_nacimiento: '1990-01-15',
    });
    await bancoDueno.query('UPDATE clientes_banco SET fecha_nacimiento = NULL WHERE cui_dpi = $1', [dpis.sinFecha]);
    const bancaSinFecha = await validarBanca(sinFecha.credenciales);
    assert(bancaSinFecha.status === 422 && bancaSinFecha.body.error === 'DATOS_BANCO_INCOMPLETOS' && !bancaSinFecha.body.afiliacion_token,
      'Si al banco le falta la fecha de nacimiento, responde 422 y no entrega comprobante');
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    try {
      await limpiar();
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }
    await poolDueno(db.pool).end();
    await bancoDueno.end().catch(() => {});
    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
