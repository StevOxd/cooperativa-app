// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

const http = require('http');
const { app } = require('./src/server');
const { pool } = require('./src/config/db');
const speakeasy = require('speakeasy');

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

    // 1.3 DPI registrado: Colaborador / Empleado de la Corporación Bancaria (1000000000001 - Steven Ortiz)
    const empleadoDpiRes = await request('/api/afiliacion/validar-dpi', 'POST', {
      cui_dpi: '1000000000001',
    });
    if (empleadoDpiRes.status !== 200 || !empleadoDpiRes.body.requiere_autenticacion_banco) {
      throw new Error('Fallo al validar DPI de colaborador del banco: ' + JSON.stringify(empleadoDpiRes.body));
    }
    const empleadoAuthRes = await request('/api/afiliacion/validar-credenciales-banco', 'POST', {
      cui_dpi: '1000000000001',
      nombre_usuario: 'steven.ortiz',
      codigo: 'CLI-102', // código del colaborador en banco-backend/src/config/initBancoDb.js
      password: 'Banco123!',
    });
    if (empleadoAuthRes.status !== 200 || empleadoAuthRes.body.tipo_sujeto !== 'EMPLEADO_BANCO') {
      throw new Error('Fallo al autenticar colaborador del banco: ' + JSON.stringify(empleadoAuthRes.body));
    }
    console.log(`✓ Colaborador del banco detectado con éxito (${empleadoAuthRes.body.persona.nombre_completo} - ${empleadoAuthRes.body.tipo_sujeto_descripcion}).`);
    console.log(`  - Cuentas de ahorro bancarias encontradas: ${empleadoAuthRes.body.cuentas_bancarias.length}`);

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

    // 2.1 Rechazo por saldo insuficiente en cuenta bancaria corporativa
    const saldoInsufRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      monto_aportacion: 9999999.00,
      password: 'Password123!',
    });
    if (saldoInsufRes.status !== 400 || !saldoInsufRes.body.message.includes('Fondos insuficientes')) {
      throw new Error('Debería rechazar por saldo insuficiente en cuenta bancaria: ' + JSON.stringify(saldoInsufRes.body));
    }
    console.log('✓ Rechazo exitoso por fondos insuficientes en la cuenta bancaria corporativa.');

    // 2.2 Rechazo por monto inferior al mínimo de aportación (< Q100)
    const montoMinRes = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
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
      monto_aportacion: 250.00,
      password: 'abc123',
    });
    if (passDebilRes.status !== 400 || !passDebilRes.body.message.includes('contraseña')) {
      throw new Error('Debería rechazar una contraseña que no cumple la política: ' + JSON.stringify(passDebilRes.body));
    }
    console.log('✓ Rechazo exitoso de contraseña débil antes de debitar la cuenta bancaria.');

    // 2.3 Procesar afiliación exitosa de cliente bancario
    const emailNuevoSocio = `marcos.castillo.${Date.now()}@example.com`;
    const afiliacionExitosa = await request('/api/afiliacion/procesar-existente', 'POST', {
      cui_dpi: '4000000000001',
      id_cuenta_bancaria: cuentaBcoCliente.id_cuenta_bancaria,
      monto_aportacion: 250.00,
      email: emailNuevoSocio,
      password: 'Password123!',
    });
    if (afiliacionExitosa.status !== 201 || !afiliacionExitosa.body.success) {
      throw new Error('Fallo al procesar afiliación de cliente existente: ' + JSON.stringify(afiliacionExitosa.body));
    }
    const dataAfiliado = afiliacionExitosa.body.data;
    console.log('✓ Afiliación inmediata completada con éxito para cliente de la entidad bancaria!');
    console.log(`  - Asociado: ${dataAfiliado.asociado.nombre_completo} (ID: ${dataAfiliado.asociado.id_asociado})`);
    console.log(`  - Código Corporativo Asignado: ${dataAfiliado.usuario.codigo_corporativo}`);
    console.log(`  - Cuenta Bancaria Origen debitada: ${dataAfiliado.cuenta_bancaria_origen.numero_cuenta_bancaria} (Nuevo Saldo: Q${dataAfiliado.cuenta_bancaria_origen.nuevo_saldo})`);
    console.log(`  - Cuenta de Aportaciones Cooperativa: ${dataAfiliado.cuenta_aportaciones.numero_cuenta} (Saldo: Q${dataAfiliado.cuenta_aportaciones.saldo_disponible})`);

    // 2.4 Login del nuevo asociado con su código corporativo y verificación 2FA (MFA)
    const loginRes = await request('/api/auth/login', 'POST', {
      email: dataAfiliado.usuario.codigo_corporativo,
      password: 'Password123!',
    });
    if (loginRes.body.mfa_required) {
      console.log('✓ Desafío de Doble Factor de Autenticación (MFA) detectado en el login del nuevo asociado.');
      const validCode = speakeasy.totp({
        secret: dataAfiliado.mfa.secret,
        encoding: 'base32',
      });
      const verifyRes = await request('/api/auth/verify-mfa', 'POST', {
        temp_token: loginRes.body.temp_token,
        totp_code: validCode,
      });
      if (verifyRes.status !== 200 || !verifyRes.body.token) {
        throw new Error('El nuevo asociado no pudo verificar su 2FA: ' + JSON.stringify(verifyRes.body));
      }
      console.log(`✓ Verificación 2FA completada y acceso confirmado para el socio con código ${dataAfiliado.usuario.codigo_corporativo}.`);
    } else {
      if (loginRes.status !== 200 || !loginRes.body.token) {
        throw new Error('El nuevo asociado no pudo autenticarse con su código corporativo: ' + JSON.stringify(loginRes.body));
      }
      console.log(`✓ Acceso al portal confirmado para el socio con código ${dataAfiliado.usuario.codigo_corporativo}.`);
    }

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
    });
    if (menorRes.status !== 400 || !menorRes.body.message.includes('mayor de edad')) {
      throw new Error('Debería rechazar a menores de edad: ' + JSON.stringify(menorRes.body));
    }
    console.log('✓ Rechazo estricto verificado para menores de edad (< 18 años cumplidos).');

    // 3.2 Registro válido de solicitud para persona nueva
    const dpiNuevoValido = '7777666655551';
    const solicitudRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiNuevoValido,
      primer_nombre: 'Gabriela',
      segundo_nombre: 'María',
      primer_apellido: 'Alvarado',
      segundo_apellido: 'Díaz',
      fecha_nacimiento: '1998-04-12',
      telefono: '55559876',
      direccion: 'Mixco, Guatemala',
      email: 'gabriela.alvarado@example.com',
      monto_estimado: 350.00,
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
    const reintentoCasoRes = await request('/api/afiliacion/solicitar-nuevo', 'POST', {
      cui_dpi: dpiNuevoValido,
      primer_nombre: 'Gabriela',
      primer_apellido: 'Alvarado',
      fecha_nacimiento: '1998-04-12',
      telefono: '55559876',
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
    const presencialRes = await request('/api/admin/asociados/presencial', 'POST', {
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
      crear_acceso_portal: true,
      password_inicial: 'Temporal123!',
    }, operatorToken);
    if (presencialRes.status !== 201 || !presencialRes.body.success) {
      throw new Error('Fallo al crear afiliación presencial: ' + JSON.stringify(presencialRes.body));
    }
    const socioPresencial = presencialRes.body.data;
    console.log(`✓ Afiliación presencial registrada con éxito!`);
    console.log(`  - Asociado ID: ${socioPresencial.id_asociado}`);
    console.log(`  - No. Cuenta: ${socioPresencial.cuenta_aportaciones}`);
    console.log(`  - Depósito Inicial: Q${socioPresencial.saldo_inicial}`);

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
