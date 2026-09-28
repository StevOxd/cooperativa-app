/**
 * @file testTraslados.js
 * @description Suite automatizada de pruebas de traslados y apertura de subcuentas (3FN y ACID).
 * Implementa idempotencia estricta con restauración de saldos en bloque finally y helper DRY.
 */

const { server } = require('./src/server');
const db = require('./src/config/db');
const { makeRequest, createTestReporter } = require('./testHelper');

const testServer = server.listen(0, async () => {
  const testPort = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] PRUEBAS DE TRASLADO Y APERTURA DE CUENTAS (ACID)');
  console.log(`[INFO] Servidor de pruebas ejecutándose en puerto efímero: ${testPort}`);
  console.log('=============================================================\n');

  const reporter = createTestReporter();
  const request = (path, method = 'GET', data = null, token = null) =>
    makeRequest(testPort, path, method, data, token);

  // Variables de ámbito para restauración e idempotencia en finally
  let idCuentaOrigen = null;
  let saldoInicialOrigen = null;
  let idSolicitudGenerada = null;
  let idCuentaDestinoCreada = null;
  let numeroCasoGenerado = null;
  let isTempPlanilla = false;

  let tempAssocPersonaId = null;

  try {
    // 0. Asegurar que exista un socio de prueba temporal si la base de datos está limpia
    const checkEx1 = await db.query("SELECT id_persona FROM usuarios WHERE codigo_corporativo = 'EX-1'");
    if (checkEx1.rows.length === 0) {
      const pRes = await db.query(`
        INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, direccion, fecha_nacimiento)
        VALUES ('9999000011112', 'Asociado', 'Prueba', '55119999', 'Guatemala', '1995-01-01')
        RETURNING id_persona
      `);
      tempAssocPersonaId = pRes.rows[0].id_persona;
      await db.query(`
        INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
        VALUES ($1, (SELECT id_rol FROM roles WHERE codigo = 'ASOCIADO'), 'EX-1', 'test.traslado@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO')
      `, [tempAssocPersonaId]);
      await db.query(`
        INSERT INTO asociados (id_persona, estado_asociado)
        VALUES ($1, 'ACTIVO')
      `, [tempAssocPersonaId]);
    }

    // 1. Autenticación de Operador (OP-1) y Asociado (EX-1)
    console.log('1. Autenticando usuarios de prueba...');
    const assocLogin = await request('/api/auth/login', 'POST', { identifier: 'EX-1', password: 'admin123' });
    const assocToken = assocLogin.body.token;

    const opLogin = await request('/api/auth/login', 'POST', { identifier: 'OP-1', password: 'admin123' });
    const opToken = opLogin.body.token;

    reporter.assert(!!assocToken, 'Token JWT de Asociado (EX-1) obtenido exitosamente');
    reporter.assert(!!opToken, 'Token JWT de Operador (OP-1) obtenido exitosamente');

    if (!assocToken || !opToken) {
      throw new Error('Fallo de autenticación en suite de traslados.');
    }

    // 2. Asegurar que EX-1 tenga una Cuenta de Planilla activa con saldo para la prueba
    console.log('\n2. Obteniendo cuenta de planilla para traslado...');
    const userRes = await db.query(`
      SELECT a.id_asociado, a.id_persona 
      FROM asociados a 
      JOIN usuarios u ON a.id_persona = u.id_persona 
      WHERE u.codigo_corporativo = 'EX-1'
    `);
    const idAsociado = userRes.rows[0].id_asociado;

    // Buscar si ya tiene cuenta de planilla
    const planRes = await db.query(`
      SELECT c.id_cuenta, c.numero_cuenta, c.saldo_disponible 
      FROM cuentas c 
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta 
      WHERE c.id_asociado = $1 AND tc.nombre = 'Cuenta de Planilla' AND c.estado = 'ACTIVA'
    `, [idAsociado]);

    if (planRes.rows.length > 0) {
      idCuentaOrigen = planRes.rows[0].id_cuenta;
      saldoInicialOrigen = parseFloat(planRes.rows[0].saldo_disponible);
    } else {
      // Crear cuenta temporal de planilla para la prueba
      const newPlan = await db.query(`
        INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
        VALUES ('CTA-PLAN-TEST-' || FLOOR(RANDOM() * 89999 + 10000)::text, $1, 4, 15000.00, 0.00, 'ACTIVA')
        RETURNING id_cuenta, saldo_disponible;
      `, [idAsociado]);
      idCuentaOrigen = newPlan.rows[0].id_cuenta;
      saldoInicialOrigen = parseFloat(newPlan.rows[0].saldo_disponible);
      isTempPlanilla = true;
    }

    // Consultar vía API GET /api/asociado/cuenta-planilla
    const resPlanillaApi = await request('/api/asociado/cuenta-planilla', 'GET', null, assocToken);
    reporter.assert(resPlanillaApi.status === 200, 'Endpoint GET /api/asociado/cuenta-planilla retornó status 200');
    reporter.assert(parseFloat(resPlanillaApi.body.data?.saldo_disponible) >= 1500.00, `Cuenta planilla con saldo disponible suficiente (Q${saldoInicialOrigen.toFixed(2)})`);

    // 3. Consultar opciones de destino para el asociado
    console.log('\n3. Consultando catálogo de destinos para el asociado...');
    const resDestinos = await request('/api/asociado/mis-cuentas-destino', 'GET', null, assocToken);
    reporter.assert(resDestinos.status === 200, 'Endpoint mis-cuentas-destino retornó status 200');
    reporter.assert(Array.isArray(resDestinos.body.data?.tiposDisponibles), 'Catálogo de tipos de cuenta disponibles retornado');

    // 4. Solicitar nueva apertura de subcuenta con traslado (Q1,500.00)
    console.log('\n4. Registrando solicitud de apertura de subcuenta con traslado (Q1,500.00)...');
    const payloadSolicitud = {
      id_cuenta_origen: idCuentaOrigen,
      id_tipo_cuenta_destino: 5, // Ahorro Programado / Metas
      monto: 1500.00,
      tipo_operacion: 'APERTURA_Y_TRASLADO',
      observaciones: 'Prueba de integración automatizada (Idempotente)',
    };

    const resSolicitud = await request('/api/asociado/solicitudes-traslado', 'POST', payloadSolicitud, assocToken);
    reporter.assert(resSolicitud.status === 201, 'Solicitud de traslado registrada con status 201 Created');
    
    idSolicitudGenerada = resSolicitud.body.data?.id_solicitud;
    numeroCasoGenerado = resSolicitud.body.data?.numero_caso;
    reporter.assert(!!idSolicitudGenerada, `ID de solicitud generado: ${idSolicitudGenerada}`);
    reporter.assert(numeroCasoGenerado && numeroCasoGenerado.startsWith('CASO-'), `Correlativo generado correctamente: ${numeroCasoGenerado}`);

    // 5. Verificar presencia del caso en la bandeja del operador
    console.log('\n5. Verificando caso en la bandeja operativa del operador...');
    const resBandeja = await request('/api/operador/bandeja-solicitudes', 'GET', null, opToken);
    reporter.assert(resBandeja.status === 200, 'Bandeja de operador consultada exitosamente');
    const casoEnBandeja = resBandeja.body.data?.find((s) => s.id_solicitud === idSolicitudGenerada);
    reporter.assert(!!casoEnBandeja, `Caso ${numeroCasoGenerado} visible en la bandeja de pendientes`);

    // 6. Operador aprueba y ejecuta el traslado
    console.log(`\n6. Resolviendo caso ${numeroCasoGenerado} (APROBAR)...`);
    const resResolver = await request(`/api/operador/solicitudes/${idSolicitudGenerada}/resolver`, 'POST', {
      accion: 'APROBAR',
      observaciones: 'Aprobado en suite automatizada de pruebas.',
    }, opToken);

    reporter.assert(resResolver.status === 200, 'Resolución de caso retornó status 200');
    reporter.assert(resResolver.body.data?.estado === 'APROBADO', 'Estado final del caso actualizado a APROBADO');

    // 7. Verificar consistencia financiera en base de datos
    console.log('\n7. Verificando consistencia contable post-aprobación...');
    const checkOrigen = await db.query('SELECT saldo_disponible FROM cuentas WHERE id_cuenta = $1', [idCuentaOrigen]);
    const saldoPostDebito = parseFloat(checkOrigen.rows[0].saldo_disponible);
    reporter.assert(
      Math.abs(saldoPostDebito - (saldoInicialOrigen - 1500.00)) < 0.01,
      `Saldo de origen debitado exactamente en Q1,500.00 (Antes: Q${saldoInicialOrigen.toFixed(2)}, Ahora: Q${saldoPostDebito.toFixed(2)})`
    );

    // Identificar cuenta destino creada
    const checkDestino = await db.query(
      `SELECT c.id_cuenta, c.numero_cuenta, c.saldo_disponible 
       FROM cuentas c 
       JOIN transacciones t ON c.id_cuenta = t.id_cuenta 
       WHERE t.referencia LIKE $1 AND t.tipo_transaccion = 'DEPOSITO'`,
      [`%${numeroCasoGenerado}%`]
    );
    if (checkDestino.rows.length > 0) {
      idCuentaDestinoCreada = checkDestino.rows[0].id_cuenta;
      const saldoDestino = parseFloat(checkDestino.rows[0].saldo_disponible);
      reporter.assert(saldoDestino === 1500.00, `Nueva cuenta acreditada exactamente con Q1,500.00 (${checkDestino.rows[0].numero_cuenta})`);
    }

    const checkTxs = await db.query('SELECT id_transaccion, tipo_transaccion, monto FROM transacciones WHERE referencia LIKE $1', [`%${numeroCasoGenerado}%`]);
    reporter.assert(checkTxs.rows.length === 2, 'Se registraron exactamente 2 transacciones en el libro mayor (Débito y Crédito)');

  } catch (suiteError) {
    console.error('\n[ERROR] Fallo inesperado en testTraslados:', suiteError.stack || suiteError);
  } finally {
    // 8. Limpieza defensiva e idempotente (RESTAURACIÓN OBLIGATORIA DE FONDOS)
    console.log('\n[CLEANUP] Ejecutando limpieza defensiva e idempotente de la prueba...');
    try {
      if (numeroCasoGenerado) {
        await db.query('DELETE FROM transacciones WHERE referencia LIKE $1', [`%${numeroCasoGenerado}%`]);
      }
      if (idSolicitudGenerada) {
        await db.query('DELETE FROM solicitudes_traslado_apertura WHERE id_solicitud = $1', [idSolicitudGenerada]);
      }
      if (idCuentaDestinoCreada) {
        await db.query('DELETE FROM transacciones WHERE id_cuenta = $1', [idCuentaDestinoCreada]);
        await db.query('DELETE FROM cuentas WHERE id_cuenta = $1', [idCuentaDestinoCreada]);
      }
      if (idCuentaOrigen) {
        if (isTempPlanilla) {
          await db.query('DELETE FROM transacciones WHERE id_cuenta = $1', [idCuentaOrigen]);
          await db.query('DELETE FROM cuentas WHERE id_cuenta = $1', [idCuentaOrigen]);
          console.log('  [CLEANUP] Cuenta temporal de planilla eliminada.');
        } else if (saldoInicialOrigen !== null) {
          await db.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [saldoInicialOrigen, idCuentaOrigen]);
          console.log(`  [CLEANUP] Saldo original de la cuenta de prueba restaurado a Q${saldoInicialOrigen.toFixed(2)}.`);
        }
      }
      if (tempAssocPersonaId) {
        await db.query('DELETE FROM transacciones WHERE id_cuenta IN (SELECT id_cuenta FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1))', [tempAssocPersonaId]);
        await db.query('DELETE FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1)', [tempAssocPersonaId]);
        await db.query('DELETE FROM asociados WHERE id_persona = $1', [tempAssocPersonaId]);
        await db.query('DELETE FROM usuarios WHERE id_persona = $1', [tempAssocPersonaId]);
        await db.query('DELETE FROM personas WHERE id_persona = $1', [tempAssocPersonaId]);
        console.log('  [CLEANUP] Asociado temporal EX-1 y registros vinculados eliminados.');
      }
      console.log('  [CLEANUP] Todos los registros temporales eliminados con éxito.');
    } catch (cleanErr) {
      console.error('  [ERROR] Fallo durante cleanup:', cleanErr.message);
    } finally {
      const stats = reporter.getStats();
      console.log('\n=============================================================');
      console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${stats.passed} / ${stats.total}`);
      if (stats.failed === 0) {
        console.log('[SUCCESS] TODAS LAS PRUEBAS DE TRASLADO COMPLETADAS CON ÉXITO');
      } else {
        console.log('[FAIL] Algunas aserciones de la suite fallaron.');
      }
      console.log('=============================================================\n');

      testServer.close();
      process.exit(stats.failed === 0 ? 0 : 1);
    }
  }
});
