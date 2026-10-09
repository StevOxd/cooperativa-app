// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';
// Sin correo real, los códigos de verificación usan este código fijo (solo fuera de producción).
const CODIGO_DEV = '246810';
process.env.CODIGO_VERIFICACION_DEV = CODIGO_DEV;

const http = require('http');
const { app } = require('./src/server');
const { pool } = require('./src/config/db');
const bancoApiService = require('./src/services/bancoApiService');
const { firmarAfiliacionToken } = require('./src/utils/afiliacionToken');

const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n===============================================================');
  console.log(' [SUITE] VERIFICACIÓN INTEGRAL DE MÓDULO 1: CORPORACIÓN BANCARIA');
  console.log(` [INFO] Servidor efímero ejecutándose en puerto: ${testPort}`);
  console.log('===============================================================\n');

  const request = (path, method = 'GET', data = null, token = null) => {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (data) headers['Content-Length'] = Buffer.byteLength(payload);

      const req = http.request(
        {
          hostname: 'localhost',
          port: testPort,
          path,
          method,
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, body });
            }
          });
        }
      );

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };

  // Pide el código de verificación del correo (con CODIGO_VERIFICACION_DEV siempre es CODIGO_DEV)
  const pedirCodigo = async (email) => {
    const r = await request('/api/afiliacion/codigo-correo', 'POST', { email });
    if (r.status !== 200 || !r.body.success) {
      throw new Error('No se pudo pedir el código para ' + email + ': ' + JSON.stringify(r.body));
    }
    return CODIGO_DEV;
  };

  try {
    // Limpiar afiliación previa de prueba para Marcos Castillo (4000000000001) para idempotencia
    const pMarcos = await pool.query("SELECT id_persona FROM personas WHERE cui_dpi = '4000000000001'");
    if (pMarcos.rows.length > 0) {
      const idMarcos = pMarcos.rows[0].id_persona;
      await pool.query("DELETE FROM transacciones WHERE id_cuenta IN (SELECT id_cuenta FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1))", [idMarcos]);
      await pool.query("DELETE FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1)", [idMarcos]);
      await pool.query("DELETE FROM asociados WHERE id_persona = $1", [idMarcos]);
      await pool.query("DELETE FROM usuarios WHERE id_persona = $1", [idMarcos]);
    }

    // Quitar una afiliación previa de María Gutiérrez (OP-2, 2000000000002), conservando su usuario de operadora
    const pOp2 = await pool.query("SELECT id_persona FROM personas WHERE cui_dpi = '2000000000002'");
    if (pOp2.rows.length > 0) {
      const idOp2 = pOp2.rows[0].id_persona;
      await pool.query("DELETE FROM transacciones WHERE id_cuenta IN (SELECT id_cuenta FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1))", [idOp2]);
      await pool.query("DELETE FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1)", [idOp2]);
      await pool.query("DELETE FROM asociados WHERE id_persona = $1", [idOp2]);
    }

    // Limpiar solicitudes de agencia de prueba con el DPI de Marcos (caso de suplantación, sección 4.3)
    await pool.query("DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = '4000000000001'");

    // Limpiar solicitud de agencia previa para Gabriela Alvarado (7777666655551)
    await pool.query("DELETE FROM solicitudes_afiliacion_agencia WHERE cui_dpi = '7777666655551'");

    // =========================================================================
    // 1. VERIFICACIÓN PREVIA OBLIGATORIA POR DPI
    // =========================================================================
    console.log('--- 1. Pruebas de Validación Previa por DPI ---');

    // 1.1 Rechazo por formato de DPI inválido
    const dpiInvalidoRes = await request('/api/afiliacion/validar-dpi', 'POST', {
      cui_dpi: '12345ABC',
    });
    if (dpiInvalidoRes.status !== 400 || !dpiInvalidoRes.body.message.includes('13 dígitos')) {
      throw new Error('Debería rechazar DPI no numérico o de longitud distinta a 13: ' + JSON.stringify(dpiInvalidoRes.body));
    }
    console.log('✓ Rechazo correcto ante DPI con formato inválido (< 13 dígitos o letras).');

    // 1.2 DPI no registrado (Escenario 2)
    const dpiNoExiste = '9999888877771';
    const noExisteRes = await request('/api/afiliacion/validar-dpi', 'POST', {
      cui_dpi: dpiNoExiste,
    });
    if (noExisteRes.status !== 200 || noExisteRes.body.pertenece_banco !== false) {
      throw new Error('DPI no existente debería retornar pertenece_banco = false: ' + JSON.stringify(noExisteRes.body));
    }
    const expectedMsg = 'No encontramos una cuenta del banco con este DPI. Complete sus datos y le daremos un número de caso para terminar la afiliación en una agencia.';
    if (noExisteRes.body.message !== expectedMsg) {
      throw new Error(`Mensaje no coincide.\nEsperado: "${expectedMsg}"\nRecibido: "${noExisteRes.body.message}"`);
    }
    console.log('✓ Escenario 2 identificado correctamente para DPI no registrado con el mensaje institucional exacto:');
    console.log(`  "${noExisteRes.body.message}"`);

    // 1.3 DPI registrado: Colaborador / Empleado de la Corporación Bancaria sin usuario en la cooperativa
    //     (1000000000003 - Fernando Herrera)
    const empleadoDpiRes = await request('/api/afiliacion/validar-dpi', 'POST', {
      cui_dpi: '1000000000003',
    });
    if (empleadoDpiRes.status !== 200 || !empleadoDpiRes.body.requiere_autenticacion_banco) {
      throw new Error('Fallo al validar DPI de colaborador del banco: ' + JSON.stringify(empleadoDpiRes.body));
    }
    // La consulta pública del DPI no revela datos de la persona (nombre, tipo de cliente, id interno)
    if ('cliente' in empleadoDpiRes.body || JSON.stringify(empleadoDpiRes.body).includes('Fernando')) {
      throw new Error('validar-dpi no debería devolver datos personales: ' + JSON.stringify(empleadoDpiRes.body));
    }
    console.log('✓ La consulta pública del DPI no devuelve datos personales.');
    const empleadoAuthRes = await request('/api/afiliacion/validar-credenciales-banco', 'POST', {
      cui_dpi: '1000000000003',
      nombre_usuario: 'fernando.herrera',
      codigo: 'CLI-104', // código del colaborador en banco-backend/src/config/initBancoDb.js
      password: 'Banco123!',
    });
    if (empleadoAuthRes.status !== 200 || empleadoAuthRes.body.tipo_sujeto !== 'EMPLEADO_BANCO') {
      throw new Error('Fallo al autenticar colaborador del banco: ' + JSON.stringify(empleadoAuthRes.body));
    }
    console.log(`✓ Colaborador del banco detectado con éxito (${empleadoAuthRes.body.persona.nombre_completo} - ${empleadoAuthRes.body.tipo_sujeto_descripcion}).`);
    console.log(`  - Cuentas de ahorro bancarias encontradas: ${empleadoAuthRes.body.cuentas_bancarias.length}`);

    // 1.3.1 Los errores de la Banca en Línea no revelan qué dato está mal ni si el DPI tiene usuario
    const credsFernando = { cui_dpi: '1000000000003', nombre_usuario: 'fernando.herrera', codigo: 'CLI-104', password: 'Banco123!' };
    const intentosBanco = [
      { ...credsFernando, nombre_usuario: 'otro.usuario' },
      { ...credsFernando, codigo: 'CLI-999' },
      { ...credsFernando, password: 'Incorrecta123!' },
      { ...credsFernando, cui_dpi: '9999888877771' }, // DPI sin Banca en Línea
    ];
    const respuestasBanco = [];
    for (const datos of intentosBanco) {
      const r = await request('/api/afiliacion/validar-credenciales-banco', 'POST', datos);
      respuestasBanco.push(JSON.stringify({ status: r.status, body: r.body }));
    }
    if (new Set(respuestasBanco).size !== 1 || !respuestasBanco[0].includes('no son correctos')) {
      throw new Error('Los errores de la Banca en Línea deberían ser idénticos: ' + respuestasBanco.join(' | '));
    }
    console.log('✓ Usuario, código o contraseña incorrectos y DPI sin Banca en Línea responden igual.');

    // 1.4 DPI registrado: Cliente Externo de la Entidad Bancaria (4000000000001 - Marcos Castillo)
    const clienteDpiRes = await request('/api/afiliacion/validar-dpi', 'POST', {
      cui_dpi: '4000000000001',
    });
    if (clienteDpiRes.status !== 200 || !clienteDpiRes.body.requiere_autenticacion_banco) {
      throw new Error('Fallo al validar DPI de cliente del banco: ' + JSON.stringify(clienteDpiRes.body));
    }
    const clienteAuthRes = await request('/api/afiliacion/validar-credenciales-banco', 'POST', {
      cui_dpi: '4000000000001',
      nombre_usuario: 'marcos.castillo',
      codigo: 'CLI-4001',
      password: 'Banco123!',
    });
    if (clienteAuthRes.status !== 200 || clienteAuthRes.body.tipo_sujeto !== 'CLIENTE_BANCO') {
      throw new Error('Fallo al autenticar cliente del banco: ' + JSON.stringify(clienteAuthRes.body));
    }
    const cuentaBcoCliente = clienteAuthRes.body.cuentas_bancarias[0];
    console.log(`✓ Cliente de la entidad bancaria identificado (${clienteAuthRes.body.persona.nombre_completo}).`);
    console.log(`  - Cuenta Bancaria: ${cuentaBcoCliente.numero_cuenta_bancaria} (Saldo: Q${cuentaBcoCliente.saldo_disponible})`);

    // =========================================================================
    // 2. ESCENARIO 1: AFILIACIÓN DE CLIENTE EXISTENTE DEL BANCO
    // =========================================================================
    console.log('\n--- 2. Escenario 1: Afiliación con Débito de Cuenta Bancaria ---');

    const tokenMarcos = clienteAuthRes.body.afiliacion_token;
    if (!tokenMarcos) {
      throw new Error('validar-credenciales-banco debería devolver afiliacion_token: ' + JSON.stringify(clienteAuthRes.body));
    }

    // 2.0 Sin validar la Banca en Línea no se puede afiliar ni tocar cuentas ajenas
    const sinTokenRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      monto_aportacion: 250.00,
      password: 'Password123!',
    });
    if (sinTokenRes.status !== 403) {
      throw new Error('Debería rechazar la afiliación sin comprobante de la Banca en Línea: ' + JSON.stringify(sinTokenRes.body));
    }
    console.log('✓ Rechazo de afiliación sin validar la Banca en Línea.');

    const otroDpiRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '2000000000002',
      numero_cuenta_bancaria: cuentaBcoCliente.numero_cuenta_bancaria,
      monto_aportacion: 250.00,
      password: 'Password123!',
      afiliacion_token: tokenMarcos,
    });
    if (otroDpiRes.status !== 403) {
      throw new Error('Debería rechazar el comprobante de otro DPI: ' + JSON.stringify(otroDpiRes.body));
    }
    console.log('✓ Rechazo del comprobante usado con un DPI distinto.');

    const cuentaAjena = empleadoAuthRes.body.cuentas_bancarias[0];
    const cuentaAjenaRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      numero_cuenta_bancaria: cuentaAjena.numero_cuenta_bancaria,
      monto_aportacion: 250.00,
      password: 'Password123!',
      afiliacion_token: tokenMarcos,
    });
    if (cuentaAjenaRes.status !== 403 || !cuentaAjenaRes.body.message.includes('no pertenece')) {
      throw new Error('Debería rechazar el débito de una cuenta de otra persona: ' + JSON.stringify(cuentaAjenaRes.body));
    }
    console.log('✓ Rechazo del débito de una cuenta bancaria que no es del DPI.');

    // El banco también rechaza el débito si la cuenta no es del DPI indicado
    const debitoAjenoRes = await bancoApiService.debitarCuenta({
      numero_cuenta: cuentaAjena.numero_cuenta_bancaria,
      cui_dpi: '4000000000001',
      monto: 1,
      concepto: 'Prueba de titularidad',
      referencia: 'TEST-TITULARIDAD-' + Date.now(),
    });
    if (debitoAjenoRes.status !== 403) {
      throw new Error('El banco debería rechazar el débito de una cuenta de otro DPI: ' + JSON.stringify(debitoAjenoRes));
    }
    console.log('✓ El banco rechaza el débito de una cuenta que no pertenece al DPI.');

    // 2.0.1 Verificación del correo con código (issue #25)
    const afiliarConCodigo = (email, codigo, extra = {}) => request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      afiliacion_token: tokenMarcos,
      monto_aportacion: 250.00,
      password: 'Password123!',
      email,
      codigo_verificacion: codigo,
      ...extra,
    });

    const sinCodigoRes = await afiliarConCodigo(`sin.codigo.${Date.now()}@example.com`, undefined);
    if (sinCodigoRes.status !== 400 || sinCodigoRes.body.error !== 'CODIGO_VENCIDO') {
      throw new Error('Sin código no debería poder afiliarse: ' + JSON.stringify(sinCodigoRes.body));
    }
    console.log('✓ Sin código de verificación del correo la afiliación se rechaza.');

    const emailBloqueo = `bloqueo.codigo.${Date.now()}@example.com`;
    await pedirCodigo(emailBloqueo);
    const hashGuardado = (await pool.query('SELECT codigo_hash FROM codigos_verificacion_correo WHERE email = $1', [emailBloqueo])).rows[0].codigo_hash;
    if (hashGuardado.includes(CODIGO_DEV)) {
      throw new Error('El código no debería guardarse en claro.');
    }
    const reenvioRapido = await request('/api/afiliacion/codigo-correo', 'POST', { email: emailBloqueo });
    if (reenvioRapido.status !== 429 || reenvioRapido.body.error !== 'CODIGO_ESPERE_REENVIO') {
      throw new Error('Debería pedir esperar 60 segundos para reenviar: ' + JSON.stringify(reenvioRapido.body));
    }
    let ultimoIntento;
    for (let i = 0; i < 5; i++) {
      ultimoIntento = await afiliarConCodigo(emailBloqueo, '000000');
    }
    const conCodigoCorrecto = await afiliarConCodigo(emailBloqueo, CODIGO_DEV);
    if (ultimoIntento.body.error !== 'CODIGO_BLOQUEADO' || conCodigoCorrecto.body.error !== 'CODIGO_BLOQUEADO') {
      throw new Error('Tras 5 intentos fallidos el código ya no debería servir: ' + JSON.stringify(conCodigoCorrecto.body));
    }
    console.log('✓ El código se guarda cifrado, el reenvío espera 60 s y tras 5 intentos fallidos deja de servir.');

    await pool.query("UPDATE codigos_verificacion_correo SET expira_en = CURRENT_TIMESTAMP - INTERVAL '1 minute', enviado_en = CURRENT_TIMESTAMP - INTERVAL '2 minutes' WHERE email = $1", [emailBloqueo]);
    await pool.query('UPDATE codigos_verificacion_correo SET intentos = 0 WHERE email = $1', [emailBloqueo]);
    const codigoVencidoRes = await afiliarConCodigo(emailBloqueo, CODIGO_DEV);
    if (codigoVencidoRes.body.error !== 'CODIGO_VENCIDO') {
      throw new Error('Un código vencido no debería servir: ' + JSON.stringify(codigoVencidoRes.body));
    }
    console.log('✓ Un código vencido ya no sirve.');

    const verificarEmailPublico = await request('/api/afiliacion/verificar-email', 'POST', { email: 'admin@cooperativa.com' });
    if (verificarEmailPublico.status !== 401) {
      throw new Error('verificar-email no debería ser pública: ' + JSON.stringify(verificarEmailPublico.body));
    }
    console.log('✓ La consulta de disponibilidad de correo ya no es pública.');

    // El correo del socio se verifica una vez; el código sirve hasta que una afiliación se complete.
    const emailNuevoSocio = `marcos.castillo.${Date.now()}@example.com`;
    const codigoMarcos = await pedirCodigo(emailNuevoSocio);

    // 2.1 Rechazo por saldo insuficiente en cuenta bancaria corporativa (el código sigue vigente)
    const saldoInsufRes = await afiliarConCodigo(emailNuevoSocio, codigoMarcos, { monto_aportacion: 9999999.00 });
    if (saldoInsufRes.status !== 400 || !saldoInsufRes.body.message.includes('Fondos insuficientes')) {
      throw new Error('Debería rechazar por saldo insuficiente en cuenta bancaria: ' + JSON.stringify(saldoInsufRes.body));
    }
    console.log('✓ Rechazo exitoso por fondos insuficientes en la cuenta bancaria corporativa.');

    // 2.2 Rechazo por monto inferior al mínimo de aportación (< Q100)
    const montoMinRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      afiliacion_token: tokenMarcos,
      monto_aportacion: 50.00,
    });
    if (montoMinRes.status !== 400 || !montoMinRes.body.message.includes('Q100.00')) {
      throw new Error('Debería rechazar por aportación < Q100: ' + JSON.stringify(montoMinRes.body));
    }
    console.log('✓ Rechazo exitoso por aportación inferior al mínimo estatutario de Q100.00.');

    // 2.2.1 Rechazo por contraseña que no cumple la política (antes de debitar)
    const passDebilRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      afiliacion_token: tokenMarcos,
      monto_aportacion: 250.00,
      password: 'abc123',
    });
    if (passDebilRes.status !== 400 || !passDebilRes.body.message.includes('contraseña')) {
      throw new Error('Debería rechazar una contraseña que no cumple la política: ' + JSON.stringify(passDebilRes.body));
    }
    console.log('✓ Rechazo exitoso de contraseña débil antes de debitar la cuenta bancaria.');

    // 2.3 Procesar afiliación exitosa de cliente bancario
    const afiliacionExitosa = await afiliarConCodigo(emailNuevoSocio, codigoMarcos);
    if (afiliacionExitosa.status !== 201 || !afiliacionExitosa.body.success) {
      throw new Error('Fallo al procesar afiliación de cliente existente: ' + JSON.stringify(afiliacionExitosa.body));
    }
    const codigoUsado = await pool.query('SELECT 1 FROM codigos_verificacion_correo WHERE email = $1', [emailNuevoSocio]);
    if (codigoUsado.rows.length !== 0) {
      throw new Error('El código debería borrarse al completar la afiliación.');
    }
    const dataAfiliado = afiliacionExitosa.body.data;
    console.log('✓ Afiliación inmediata completada con éxito para cliente de la entidad bancaria!');
    console.log(`  - Asociado: ${dataAfiliado.asociado.nombre_completo} (ID: ${dataAfiliado.asociado.id_asociado})`);
    console.log(`  - Código Corporativo Asignado: ${dataAfiliado.usuario.codigo_corporativo}`);
    console.log(`  - Cuenta Bancaria Origen debitada: ${dataAfiliado.cuenta_bancaria_origen.numero_cuenta_bancaria} (Nuevo Saldo: Q${dataAfiliado.cuenta_bancaria_origen.nuevo_saldo})`);
    console.log(`  - Cuenta de Aportaciones Cooperativa: ${dataAfiliado.cuenta_aportaciones.numero_cuenta} (Saldo: Q${dataAfiliado.cuenta_aportaciones.saldo_disponible})`);

    // 2.4 La afiliación no genera ni expone un secreto 2FA: el asociado lo activa desde «Seguridad»
    if ('mfa' in dataAfiliado) {
      throw new Error('La respuesta de la afiliación no debería incluir datos de 2FA: ' + JSON.stringify(dataAfiliado.mfa));
    }
    const mfaMarcos = (await pool.query(
      'SELECT mfa_secret, mfa_qr_url, mfa_enabled FROM usuarios WHERE codigo_corporativo = $1',
      [dataAfiliado.usuario.codigo_corporativo]
    )).rows[0];
    if (mfaMarcos.mfa_secret !== null || mfaMarcos.mfa_qr_url !== null || mfaMarcos.mfa_enabled !== false) {
      throw new Error('La afiliación no debería guardar un secreto 2FA sin activar: ' + JSON.stringify(mfaMarcos));
    }
    console.log('✓ La afiliación no genera, guarda ni expone un secreto 2FA.');

    // 2.4.1 Login del nuevo asociado con su código corporativo y la contraseña que eligió
    const loginRes = await request('/api/auth/login', 'POST', {
      email: dataAfiliado.usuario.codigo_corporativo,
      password: 'Password123!',
    });
    if (loginRes.status !== 200 || !loginRes.body.token) {
      throw new Error('El nuevo asociado no pudo autenticarse con su código corporativo: ' + JSON.stringify(loginRes.body));
    }
    console.log(`✓ Acceso al portal confirmado para el socio con código ${dataAfiliado.usuario.codigo_corporativo}.`);

    // 2.4.2 Con solo el DPI no se puede saber que ya es asociado; se informa tras validar la Banca en Línea
    const dpiAsociadoRes = await request('/api/afiliacion/validar-dpi', 'POST', { cui_dpi: '4000000000001' });
    if (dpiAsociadoRes.status !== 200 || dpiAsociadoRes.body.ya_es_asociado || !dpiAsociadoRes.body.requiere_autenticacion_banco) {
      throw new Error('validar-dpi no debería revelar que el DPI ya es asociado: ' + JSON.stringify(dpiAsociadoRes.body));
    }
    const credsAsociadoRes = await request('/api/afiliacion/validar-credenciales-banco', 'POST', {
      cui_dpi: '4000000000001',
      nombre_usuario: 'marcos.castillo',
      codigo: 'CLI-4001',
      password: 'Banco123!',
    });
    if (credsAsociadoRes.status !== 400 || !credsAsociadoRes.body.ya_es_asociado) {
      throw new Error('Tras validar la Banca en Línea debería indicar que ya es asociado: ' + JSON.stringify(credsAsociadoRes.body));
    }
    console.log('✓ «Ya es asociado» solo se informa después de validar la Banca en Línea.');

    // 2.5 Personal con usuario en el portal (OP-2): no se afilia en línea y su acceso no cambia
    const accesoOp2Query = `SELECT u.password_hash, u.id_rol, u.mfa_secret, u.mfa_enabled, u.debe_cambiar_password
       FROM usuarios u JOIN personas p ON u.id_persona = p.id_persona WHERE p.cui_dpi = '2000000000002'`;
    const accesoOp2Antes = (await pool.query(accesoOp2Query)).rows[0];

    const op2AuthRes = await request('/api/afiliacion/validar-credenciales-banco', 'POST', {
      cui_dpi: '2000000000002',
      nombre_usuario: 'maria.gutierrez',
      codigo: 'CLI-202',
      password: 'Banco123!',
    });
    if (op2AuthRes.status !== 409 || !op2AuthRes.body.es_personal || op2AuthRes.body.afiliacion_token) {
      throw new Error('Debería rechazar la afiliación en línea del personal sin emitir comprobante: ' + JSON.stringify(op2AuthRes.body));
    }
    console.log('✓ Personal de la cooperativa (OP-2) rechazado al validar la Banca en Línea.');

    // Aunque llegara con un comprobante válido, el servidor tampoco lo afilia
    const tokenOp2 = firmarAfiliacionToken({
      cui_dpi: '2000000000002',
      cuentas: [{ id_cuenta_bancaria: 0, numero_cuenta_bancaria: 'CTA-BCO-MONET-2002' }],
    });
    const afiliacionOp2Res = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '2000000000002',
      numero_cuenta_bancaria: 'CTA-BCO-MONET-2002',
      monto_aportacion: 100.00,
      password: 'OtraClave123!',
      afiliacion_token: tokenOp2,
    });
    if (afiliacionOp2Res.status !== 409 || !afiliacionOp2Res.body.es_personal) {
      throw new Error('Debería rechazar la afiliación del personal en procesar-existente: ' + JSON.stringify(afiliacionOp2Res.body));
    }
    const accesoOp2Despues = (await pool.query(accesoOp2Query)).rows[0];
    if (JSON.stringify(accesoOp2Antes) !== JSON.stringify(accesoOp2Despues)) {
      throw new Error('La afiliación no debería modificar la contraseña, el rol ni el 2FA del personal.');
    }
    console.log('✓ Personal rechazado también en procesar-existente, sin cambios en su contraseña, rol ni 2FA.');

    // =========================================================================
    // 3. ESCENARIO 2: SOLICITUD PARA PERSONA SIN REGISTRO BANCARIO
    // =========================================================================
    console.log('\n--- 3. Escenario 2: Solicitud con Emisión de Caso para Agencia ---');

    // 3.1 Rechazo por minoría de edad (< 18 años)
    const dpiMenor = '8888777766661';
    const menorRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiMenor,
      primer_nombre: 'Santiago',
      primer_apellido: 'Morales',
      fecha_nacimiento: '2012-05-10', // 14 años
      telefono: '55551234',
      direccion: 'Ciudad de Guatemala',
      email: 'santiago.morales@example.com',
    });
    if (menorRes.status !== 400 || !menorRes.body.message.includes('mayor de edad')) {
      throw new Error('Debería rechazar a menores de edad: ' + JSON.stringify(menorRes.body));
    }
    console.log('✓ Rechazo estricto verificado para menores de edad (< 18 años cumplidos).');

    // 3.2 Registro válido de solicitud para persona nueva (sin código se rechaza)
    const dpiNuevoValido = '7777666655551';
    const solicitudSinCodigoRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiNuevoValido,
      primer_nombre: 'Gabriela',
      primer_apellido: 'Alvarado',
      fecha_nacimiento: '1998-04-12',
      telefono: '55559876',
      email: `gabriela.sin.codigo.${Date.now()}@example.com`,
    });
    if (solicitudSinCodigoRes.status !== 400 || !String(solicitudSinCodigoRes.body.error).startsWith('CODIGO_')) {
      throw new Error('Sin código no debería crearse el caso: ' + JSON.stringify(solicitudSinCodigoRes.body));
    }
    console.log('✓ Sin código de verificación no se crea el caso.');

    const emailGabriela = `gabriela.alvarado.${Date.now()}@example.com`;
    const codigoGabriela = await pedirCodigo(emailGabriela);
    const solicitudRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiNuevoValido,
      primer_nombre: 'Gabriela',
      segundo_nombre: 'María',
      primer_apellido: 'Alvarado',
      segundo_apellido: 'Díaz',
      fecha_nacimiento: '1998-04-12',
      telefono: '55559876',
      direccion: 'Mixco, Guatemala',
      email: emailGabriela,
      monto_estimado: 350.00,
      codigo_verificacion: codigoGabriela,
    });
    if (solicitudRes.status !== 201 || !solicitudRes.body.success) {
      throw new Error('Fallo al emitir solicitud de caso para agencia: ' + JSON.stringify(solicitudRes.body));
    }
    const dataCaso = solicitudRes.body.data;
    if (!dataCaso.numero_caso || !dataCaso.numero_caso.startsWith('CASO-AFIL-')) {
      throw new Error('Número de caso no cumple con el formato oficial CASO-AFIL-YYYY-XXXX: ' + dataCaso.numero_caso);
    }
    console.log('✓ Número de Caso emitido exitosamente para formalizar en agencia:');
    console.log(`  - No. Caso: ${dataCaso.numero_caso}`);
    console.log(`  - Solicitante: ${dataCaso.nombre_completo} (DPI: ${dataCaso.cui_dpi})`);
    console.log(`  - Estado: ${dataCaso.estado}`);

    // 3.3 Reintento con el mismo DPI devuelve el caso existente sin duplicar
    const emailReintento = `gabriela.reintento.${Date.now()}@example.com`;
    const codigoReintento = await pedirCodigo(emailReintento);
    const reintentoCasoRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiNuevoValido,
      primer_nombre: 'Gabriela',
      primer_apellido: 'Alvarado',
      fecha_nacimiento: '1998-04-12',
      telefono: '55559876',
      email: emailReintento,
      codigo_verificacion: codigoReintento,
    });
    if (reintentoCasoRes.status !== 200 || reintentoCasoRes.body.data.numero_caso !== dataCaso.numero_caso) {
      throw new Error('Debería retornar el número de caso existente sin duplicar registro.');
    }
    console.log(`✓ Retención de caso activo confirmada para DPI duplicado (${reintentoCasoRes.body.data.numero_caso}).`);

    // =========================================================================
    // 4. AUTORIZACIÓN: RESTRICCIÓN DE ADMINISTRADOR Y ACCESO DE OPERADOR
    // =========================================================================
    console.log('\n--- 4. Verificación de Roles en Gestión de Asociados ---');
    const adminLogin = await request('/api/auth/login', 'POST', {
      email: 'AD-1',
      password: 'admin123',
    });
    if (adminLogin.status !== 200 || !adminLogin.body.token) {
      throw new Error('Error autenticando como administrador: ' + JSON.stringify(adminLogin.body));
    }
    const adminToken = adminLogin.body.token;
    console.log('✓ Token de Administrador obtenido (AD-1).');

    // Validar que ADMINISTRADOR NO tiene acceso a Gestión de Asociados (403 Forbidden)
    const adminDenyRes = await request('/api/admin/asociados?limit=5', 'GET', null, adminToken);
    if (adminDenyRes.status !== 403) {
      throw new Error('El Administrador NO debería tener acceso a Gestión de Asociados, pero respondió con status ' + adminDenyRes.status);
    }
    console.log('✓ Acceso denegado correctamente para ADMINISTRADOR en Gestión de Asociados (403 Forbidden).');

    // Autenticar como OPERADOR (OP-1) para la gestión operativa de asociados
    const operatorLogin = await request('/api/auth/login', 'POST', {
      email: 'OP-1',
      password: 'admin123',
    });
    if (operatorLogin.status !== 200 || !operatorLogin.body.token) {
      throw new Error('Error autenticando como operador: ' + JSON.stringify(operatorLogin.body));
    }
    const operatorToken = operatorLogin.body.token;
    console.log('✓ Token de Operador obtenido (OP-1).');

    // Consultar padrón como OPERADOR
    const padronRes = await request('/api/admin/asociados?limit=5', 'GET', null, operatorToken);
    if (padronRes.status !== 200 || !Array.isArray(padronRes.body.data)) {
      throw new Error('Fallo al consultar padrón de asociados como operador: ' + JSON.stringify(padronRes.body));
    }
    console.log(`✓ Padrón de asociados consultado (${padronRes.body.pagination.total} asociados registrados en total).`);

    // 4. FORMULARIO 1: Afiliación presencial en ventanilla con efectivo (OPERADOR)
    console.log('\n--- 4. Formulario 1: Afiliación Presencial en Ventanilla ---');
    const dpiPresencial = '2' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const datosPresencial = {
      cui_dpi: dpiPresencial,
      primer_nombre: 'Juan',
      segundo_nombre: 'José',
      primer_apellido: 'Ramírez',
      segundo_apellido: 'Castillo',
      fecha_nacimiento: '1985-11-10',
      telefono: '33332222',
      direccion: 'Antigua Guatemala, Sacatepéquez',
      email: `juan.ramirez.${Date.now()}@example.com`,
      monto_aportacion: 500.00,
      metodo_pago: 'EFECTIVO_VENTANILLA',
    };

    // 4.0 Sin correo (MAIL_ENABLED=false en esta suite) no se puede pedir el acceso al portal (issue #26)
    const conAccesoSinCorreo = await request('/api/admin/asociados/presencial', 'POST', {
      ...datosPresencial, crear_acceso_portal: true,
    }, operatorToken);
    const personaSinCrear = await pool.query('SELECT 1 FROM personas WHERE cui_dpi = $1', [dpiPresencial]);
    if (conAccesoSinCorreo.status !== 409 || conAccesoSinCorreo.body.error !== 'CORREO_NO_DISPONIBLE' || personaSinCrear.rows.length !== 0) {
      throw new Error('Sin correo, pedir el acceso al portal debería rechazarse sin registrar nada: ' + JSON.stringify(conAccesoSinCorreo.body));
    }
    console.log('✓ Sin correo, pedir el acceso al portal se rechaza y no se registra nada.');

    const presencialRes = await request('/api/admin/asociados/presencial', 'POST', {
      ...datosPresencial, crear_acceso_portal: false,
    }, operatorToken);
    if (presencialRes.status !== 201 || !presencialRes.body.success) {
      throw new Error('Fallo al crear afiliación presencial: ' + JSON.stringify(presencialRes.body));
    }
    const socioPresencial = presencialRes.body.data;
    console.log(`✓ Afiliación presencial registrada con éxito!`);
    console.log(`  - Asociado ID: ${socioPresencial.id_asociado}`);
    console.log(`  - No. Cuenta: ${socioPresencial.cuenta_aportaciones}`);
    console.log(`  - Depósito Inicial: Q${socioPresencial.saldo_inicial}`);

    // 4.1 Sin acceso al portal: se afilia con sus cuentas, sin usuario
    const usuarioPresencial = await pool.query(
      'SELECT 1 FROM usuarios u JOIN personas p ON p.id_persona = u.id_persona WHERE p.cui_dpi = $1',
      [dpiPresencial]
    );
    if (socioPresencial.acceso_portal !== false || socioPresencial.codigo_corporativo || usuarioPresencial.rows.length !== 0
      || !presencialRes.body.message.includes('sin acceso al portal')) {
      throw new Error('La afiliación sin acceso no debería crear usuario: ' + JSON.stringify(presencialRes.body));
    }
    console.log('✓ Afiliación en ventanilla sin acceso al portal: cuentas abiertas y sin usuario.');

    // 4.2 Sin correo, el administrador no puede reiniciar la contraseña: la actual no cambia
    const hashQuery = 'SELECT password_hash FROM usuarios WHERE codigo_corporativo = $1';
    const usuarioMarcos = dataAfiliado.usuario.codigo_corporativo;
    const hashAntes = (await pool.query(hashQuery, [usuarioMarcos])).rows[0].password_hash;
    const resetSinCorreoRes = await request(`/api/usuarios/${usuarioMarcos}/reset-password`, 'POST', {}, adminToken);
    const hashDespues = (await pool.query(hashQuery, [usuarioMarcos])).rows[0].password_hash;
    if (resetSinCorreoRes.status !== 503 || resetSinCorreoRes.body.error !== 'CORREO_NO_DISPONIBLE' || hashAntes !== hashDespues) {
      throw new Error('Sin correo, el reinicio de contraseña debería rechazarse sin cambiar la contraseña: ' + JSON.stringify(resetSinCorreoRes.body));
    }
    console.log('✓ Sin correo, el reinicio de contraseña se rechaza y la contraseña actual no cambia.');

    // 4.3 Una solicitud pública con el DPI de alguien que ya es asociado no se puede formalizar:
    //     le daría su cuenta a quien escribió el correo de la solicitud (issue #26)
    const emailSuplantador = `suplantador.${Date.now()}@example.com`;
    const codigoSuplantador = await pedirCodigo(emailSuplantador);
    const solicitudSuplantada = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: '4000000000001', // DPI de Marcos, ya asociado
      primer_nombre: 'Marcos',
      primer_apellido: 'Castillo',
      fecha_nacimiento: '1992-06-14',
      telefono: '55440001',
      email: emailSuplantador,
      codigo_verificacion: codigoSuplantador,
    });
    const idSolicitudSuplantada = solicitudSuplantada.body.data?.id_solicitud;
    const accesoMarcosAntes = (await pool.query('SELECT email, password_hash FROM usuarios WHERE codigo_corporativo = $1', [usuarioMarcos])).rows[0];
    const formalizarSuplantada = await request(`/api/operador/afiliaciones/${idSolicitudSuplantada}/formalizar`, 'POST', {
      monto_aportacion: 100.00,
      crear_acceso_portal: false,
    }, operatorToken);
    const accesoMarcosDespues = (await pool.query('SELECT email, password_hash FROM usuarios WHERE codigo_corporativo = $1', [usuarioMarcos])).rows[0];
    await pool.query('DELETE FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1', [idSolicitudSuplantada]);
    if (!idSolicitudSuplantada || formalizarSuplantada.status !== 409 || JSON.stringify(accesoMarcosAntes) !== JSON.stringify(accesoMarcosDespues)) {
      throw new Error('Formalizar una solicitud con el DPI de un asociado debería rechazarse sin tocar su acceso: ' + JSON.stringify(formalizarSuplantada.body));
    }
    console.log('✓ Una solicitud con el DPI de un asociado existente no se formaliza y su acceso no cambia.');

    // 5. FORMULARIO 2: Apertura de Cuentas Financieras
    console.log('\n--- 5. Formulario 2: Apertura de Cuenta Adicional ---');
    // Validar monto inferior al mínimo de cuenta de ahorro (ej. cuenta de ahorro id_tipo_cuenta = 2, min Q100)
    const badApertura = await request('/api/admin/asociados/aperturar-cuenta', 'POST', {
      id_asociado: socioPresencial.id_asociado,
      id_tipo_cuenta: 2, // Ahorro corriente
      monto_apertura: 10.00, // Menor a Q50.00 o Q100.00
      origen_fondos: 'EFECTIVO_VENTANILLA',
    }, operatorToken);
    if (badApertura.status !== 400 || !badApertura.body.message.includes('menor al monto mínimo')) {
      throw new Error('Debería haber rechazado por monto inferior al mínimo: ' + JSON.stringify(badApertura.body));
    }
    console.log('✓ Validación correcta de monto mínimo de apertura rechazada según política.');

    // 5.0 Las operaciones con el banco desde la ventanilla requieren sesión de operador
    const bancoSinSesion = await request('/api/banco-externo/cuentas-cliente/4000000000002');
    const acreditarSinSesion = await request('/api/banco-externo/acreditar', 'POST', { numero_cuenta: 'CTA-BCO-AHORRO-4002', monto: 1 });
    const bancoConOperador = await request('/api/banco-externo/cuentas-cliente/4000000000002', 'GET', null, operatorToken);
    if (bancoSinSesion.status !== 401 || acreditarSinSesion.status !== 401 || bancoConOperador.status !== 200) {
      throw new Error(`Las rutas del banco deberían exigir sesión de operador (sin sesión: ${bancoSinSesion.status}/${acreditarSinSesion.status}, operador: ${bancoConOperador.status})`);
    }
    console.log('✓ Las rutas del banco rechazan el acceso sin sesión y responden al operador.');

    // 5.0.1 Abrir una cuenta con fondos del banco exige que la cuenta sea del asociado
    const saldoAjenoAntes = await bancoApiService.consultarCuenta('CTA-BCO-AHORRO-4002');
    const aperturaAjena = await request('/api/admin/asociados/aperturar-cuenta', 'POST', {
      id_asociado: dataAfiliado.asociado.id_asociado, // Marcos
      id_tipo_cuenta: 2,
      monto_apertura: 100.00,
      origen_fondos: 'BANCO_EXTERNO',
      numero_cuenta_bancaria: 'CTA-BCO-AHORRO-4002', // cuenta de Sofía Reyes
    }, operatorToken);
    const saldoAjenoDespues = await bancoApiService.consultarCuenta('CTA-BCO-AHORRO-4002');
    if (aperturaAjena.status !== 403 || saldoAjenoAntes.data.saldo_disponible !== saldoAjenoDespues.data.saldo_disponible) {
      throw new Error('No debería abrirse una cuenta con fondos de otra persona: ' + JSON.stringify(aperturaAjena.body));
    }
    const saldoPropioAntes = await bancoApiService.consultarCuenta(cuentaBcoCliente.numero_cuenta_bancaria);
    const aperturaPropia = await request('/api/admin/asociados/aperturar-cuenta', 'POST', {
      id_asociado: dataAfiliado.asociado.id_asociado,
      id_tipo_cuenta: 2,
      monto_apertura: 100.00,
      origen_fondos: 'BANCO_EXTERNO',
      numero_cuenta_bancaria: cuentaBcoCliente.numero_cuenta_bancaria, // cuenta de Marcos
    }, operatorToken);
    const saldoPropioDespues = await bancoApiService.consultarCuenta(cuentaBcoCliente.numero_cuenta_bancaria);
    if (aperturaPropia.status !== 201 || saldoPropioAntes.data.saldo_disponible - saldoPropioDespues.data.saldo_disponible !== 100) {
      throw new Error('La apertura con fondos de su propia cuenta debería debitar Q100: ' + JSON.stringify(aperturaPropia.body));
    }
    console.log('✓ La apertura con fondos del banco solo acepta cuentas del asociado y debita el monto.');

    // Apertura válida de cuenta de ahorro corriente (tipo 2)
    const buenaApertura = await request('/api/admin/asociados/aperturar-cuenta', 'POST', {
      id_asociado: socioPresencial.id_asociado,
      id_tipo_cuenta: 2,
      monto_apertura: 300.00,
      origen_fondos: 'EFECTIVO_VENTANILLA',
    }, operatorToken);
    if (buenaApertura.status !== 201 || !buenaApertura.body.success) {
      throw new Error('Fallo al aperturar cuenta adicional: ' + JSON.stringify(buenaApertura.body));
    }
    const nuevaCuentaAhorro = buenaApertura.body.data;
    console.log(`✓ Cuenta de ahorro aperturada exitosamente: ${nuevaCuentaAhorro.numero_cuenta} con saldo Q${nuevaCuentaAhorro.saldo_disponible}`);

    // 6. FORMULARIO 3: Asignación y Distribución de Beneficiarios
    console.log('\n--- 6. Formulario 3: Asignación y Validación de Beneficiarios (100.00%) ---');
    // Rechazo por suma de porcentajes diferente de 100% (ej. 60% + 30% = 90%)
    const badBeneficiarios = await request(
      `/api/admin/asociados/cuentas/${nuevaCuentaAhorro.id_cuenta}/beneficiarios`,
      'POST',
      {
        beneficiarios: [
          {
            nombre_completo: 'Ana Lucía Ramírez',
            parentesco: 'HIJA',
            cui_dpi: '1234567890101',
            telefono: '55554444',
            porcentaje: 60.00,
          },
          {
            nombre_completo: 'Mario Ramírez',
            parentesco: 'HIJO',
            cui_dpi: '1234567890102',
            telefono: '55553333',
            porcentaje: 30.00, // Suma = 90%
          },
        ],
      },
      operatorToken
    );
    if (badBeneficiarios.status !== 400 || !badBeneficiarios.body.message.includes('100.00%')) {
      throw new Error('Debería haber rechazado porque la suma de porcentajes no es 100%: ' + JSON.stringify(badBeneficiarios.body));
    }
    console.log('✓ Rechazo estricto verificado cuando los porcentajes no suman el 100.00%.');

    // Aceptación con suma exacta de 100.00% (70% + 30%)
    const goodBeneficiarios = await request(
      `/api/admin/asociados/cuentas/${nuevaCuentaAhorro.id_cuenta}/beneficiarios`,
      'POST',
      {
        beneficiarios: [
          {
            nombre_completo: 'Ana Lucía Ramírez',
            parentesco: 'HIJA',
            cui_dpi: '1234567890101',
            telefono: '55554444',
            porcentaje: 70.00,
          },
          {
            nombre_completo: 'Mario Ramírez',
            parentesco: 'HIJO',
            cui_dpi: '1234567890102',
            telefono: '55553333',
            porcentaje: 30.00,
          },
        ],
      },
      operatorToken
    );
    if (goodBeneficiarios.status !== 200 || !goodBeneficiarios.body.success) {
      throw new Error('Fallo al guardar beneficiarios que suman 100%: ' + JSON.stringify(goodBeneficiarios.body));
    }
    console.log('✓ Beneficiarios registrados exitosamente con validación de 100.00% aprobada.');

    // Consultar beneficiarios guardados
    const getBenRes = await request(
      `/api/admin/asociados/cuentas/${nuevaCuentaAhorro.id_cuenta}/beneficiarios`,
      'GET',
      null,
      operatorToken
    );
    if (getBenRes.status !== 200 || !Array.isArray(getBenRes.body.data) || getBenRes.body.data.length !== 2) {
      throw new Error('Error al consultar beneficiarios guardados: ' + JSON.stringify(getBenRes.body));
    }
    console.log(`✓ Consulta de beneficiarios guardada verificada (${getBenRes.body.data.length} beneficiarios asignados).`);

    // 7. EXPEDIENTE 360° Y REPORTE
    console.log('\n--- 7. Expediente Integral 360° del Asociado ---');
    const expedienteRes = await request(
      `/api/admin/asociados/${socioPresencial.id_asociado}/expediente`,
      'GET',
      null,
      operatorToken
    );
    if (expedienteRes.status !== 200 || !expedienteRes.body.data) {
      throw new Error('Fallo al obtener expediente 360°: ' + JSON.stringify(expedienteRes.body));
    }
    const exp = expedienteRes.body.data;
    console.log(`✓ Expediente 360° de ${exp.asociado.nombre_completo} cargado exitosamente.`);
    console.log(`  - Cuentas activas: ${exp.cuentas.length}`);
    console.log(`  - Saldo total disponible: Q${exp.metricas.saldo_total_disponible}`);
    console.log(`  - Total aportaciones: Q${exp.metricas.saldo_aportaciones}`);

    console.log('\n===============================================================');
    console.log(' [RESULTADO] ¡TODAS LAS PRUEBAS DEL MÓDULO 1 PASARON CON ÉXITO!');
    console.log('===============================================================\n');

    server.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n[FALLO EN SUITE DE PRUEBAS]', err);
    server.close();
    await pool.end();
    process.exit(1);
  }
});
