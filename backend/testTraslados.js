// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * @file testTraslados.js
 * @description Suite automatizada de pruebas de traslados y apertura de subcuentas (3FN y ACID).
 * Implementa idempotencia estricta con restauración de saldos en bloque finally y helper DRY.
 */

const { server } = require('./src/server');
const db = require('./src/config/db');
const { makeRequest, createTestReporter, crearUsuarioDePrueba, borrarPersonaDePrueba, poolDueno } = require('./testHelper');
// Limpieza con el rol dueño: el de la aplicación no borra filas (salvo en las pocas tablas que el código limpia)
const comoDueno = (sql, params) => poolDueno(db.pool).query(sql, params);

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
  // Un error fuera de los asserts también hace fallar la suite (código de salida 1)
  let errorInesperado = false;
  const tokens = [];

  try {
    // 0. Asociado de prueba propio (no depende de que exista o no un EX-1 creado por otras suites)
    const sufijo = String(Date.now()).slice(-7);
    const codigoAsociado = `EX-T6${sufijo}`;
    tempAssocPersonaId = (await crearUsuarioDePrueba(db, {
      dpi: `945${sufijo}000`.slice(0, 13),
      codigo: codigoAsociado,
      email: `test.traslado.${sufijo}@cooperativa.com`,
      rol: 'ASOCIADO',
      asociado: true,
    })).idPersona;

    // 1. Autenticación de Operador (OP-1) y del asociado de prueba
    console.log('1. Autenticando usuarios de prueba...');
    const assocLogin = await request('/api/auth/login', 'POST', { identifier: codigoAsociado, password: 'admin123' });
    const assocToken = assocLogin.body.token;

    const opLogin = await request('/api/auth/login', 'POST', { identifier: 'OP-1', password: 'admin123' });
    const opToken = opLogin.body.token;
    tokens.push(assocToken, opToken);

    reporter.assert(!!assocToken, 'Token JWT del asociado de prueba obtenido exitosamente');
    reporter.assert(!!opToken, 'Token JWT de Operador (OP-1) obtenido exitosamente');

    if (!assocToken || !opToken) {
      throw new Error('Fallo de autenticación en suite de traslados.');
    }

    // 2. Cuenta de origen con saldo para la prueba: su cuenta principal en la cooperativa (Ahorro a la Vista). El
    //    asociado de prueba no tiene cuentas en el banco, así que es la que el portal le ofrece como origen.
    console.log('\n2. Preparando la cuenta de origen del traslado...');
    const userRes = await db.query(`
      SELECT a.id_asociado, a.id_persona 
      FROM asociados a 
      JOIN usuarios u ON a.id_persona = u.id_persona 
      WHERE u.codigo_corporativo = $1
    `, [codigoAsociado]);
    const idAsociado = userRes.rows[0].id_asociado;
    const nuevaOrigen = await db.query(`
      INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
      VALUES ('CTA-ORIG-TEST-' || FLOOR(RANDOM() * 89999 + 10000)::text, $1, 2, 15000.00, 0.00, 'ACTIVA')
      RETURNING id_cuenta, saldo_disponible;
    `, [idAsociado]);
    idCuentaOrigen = nuevaOrigen.rows[0].id_cuenta;
    saldoInicialOrigen = parseFloat(nuevaOrigen.rows[0].saldo_disponible);
    isTempPlanilla = true;

    // Consultar vía API GET /api/asociado/cuentas-origen
    const resOrigenApi = await request('/api/asociado/cuentas-origen', 'GET', null, assocToken);
    const origenApi = (resOrigenApi.body.data || []).find((c) => Number(c.id_cuenta) === Number(idCuentaOrigen));
    reporter.assert(resOrigenApi.status === 200 && Boolean(origenApi), 'El portal ofrece su cuenta principal como origen del traslado');
    reporter.assert(parseFloat(origenApi?.saldo_disponible) >= 1500.00, `Cuenta de origen con saldo suficiente (Q${saldoInicialOrigen.toFixed(2)})`);

    // 3. Consultar opciones de destino para el asociado
    console.log('\n3. Consultando catálogo de destinos para el asociado...');
    const resDestinos = await request('/api/asociado/mis-cuentas-destino', 'GET', null, assocToken);
    reporter.assert(resDestinos.status === 200, 'Endpoint mis-cuentas-destino retornó status 200');
    reporter.assert(Array.isArray(resDestinos.body.data?.tiposDisponibles), 'Catálogo de tipos de cuenta disponibles retornado');

    // 4. Solicitar nueva apertura de subcuenta con traslado (Q1,500.00)
    console.log('\n4. Registrando solicitud de apertura de subcuenta con traslado (Q1,500.00)...');
    const payloadSolicitud = {
      id_cuenta_origen: idCuentaOrigen,
      origen_cuenta: 'COOPERATIVA',
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
    errorInesperado = true;
    console.error('\n[ERROR] Fallo inesperado en testTraslados:', suiteError.stack || suiteError);
  } finally {
    for (const token of tokens.filter(Boolean)) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    // 8. Limpieza defensiva e idempotente (RESTAURACIÓN OBLIGATORIA DE FONDOS)
    console.log('\n[CLEANUP] Ejecutando limpieza defensiva e idempotente de la prueba...');
    try {
      if (numeroCasoGenerado) {
        await comoDueno('DELETE FROM transacciones WHERE referencia LIKE $1', [`%${numeroCasoGenerado}%`]);
      }
      if (idSolicitudGenerada) {
        await comoDueno('DELETE FROM solicitudes_traslado_apertura WHERE id_solicitud = $1', [idSolicitudGenerada]);
      }
      if (idCuentaDestinoCreada) {
        await comoDueno('DELETE FROM transacciones WHERE id_cuenta = $1', [idCuentaDestinoCreada]);
        await comoDueno('DELETE FROM cuentas WHERE id_cuenta = $1', [idCuentaDestinoCreada]);
      }
      if (idCuentaOrigen) {
        if (isTempPlanilla) {
          await comoDueno('DELETE FROM transacciones WHERE id_cuenta = $1', [idCuentaOrigen]);
          await comoDueno('DELETE FROM cuentas WHERE id_cuenta = $1', [idCuentaOrigen]);
          console.log('  [CLEANUP] Cuenta de origen temporal eliminada.');
        } else if (saldoInicialOrigen !== null) {
          await db.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [saldoInicialOrigen, idCuentaOrigen]);
          console.log(`  [CLEANUP] Saldo original de la cuenta de prueba restaurado a Q${saldoInicialOrigen.toFixed(2)}.`);
        }
      }
      if (tempAssocPersonaId) {
        await borrarPersonaDePrueba(db, tempAssocPersonaId);
        console.log('  [CLEANUP] Asociado de prueba y registros vinculados eliminados.');
      }
      console.log('  [CLEANUP] Todos los registros temporales eliminados con éxito.');
    } catch (cleanErr) {
      errorInesperado = true;
      console.error('  [ERROR] Fallo durante cleanup:', cleanErr.message);
    } finally {
      const stats = reporter.getStats();
      console.log('\n=============================================================');
      console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${stats.passed} / ${stats.total}`);
      if (stats.failed === 0 && !errorInesperado) {
        console.log('[SUCCESS] TODAS LAS PRUEBAS DE TRASLADO COMPLETADAS CON ÉXITO');
      } else {
        console.log('[FAIL] Algunas aserciones de la suite fallaron.');
      }
      console.log('=============================================================\n');

      testServer.close();
      process.exit(stats.failed === 0 && !errorInesperado ? 0 : 1);
    }
  }
});
