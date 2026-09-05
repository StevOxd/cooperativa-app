const http = require('http');
const { app } = require('./src/server');
const db = require('./src/config/db');

const server = app.listen(0, async () => {
  const testPort = server.address().port;
  console.log('\n=========================================');
  console.log('[SUITE] INICIANDO PRUEBAS DE TRASLADO Y APERTURA DE PLANILLA (3FN)');
  console.log(`[INFO] Puerto de prueba: ${testPort}`);
  console.log('=========================================\n');

  const request = (path, method, data, token) => {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (data) {
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

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
    // 1. Obtener JWT de Asociado (3001) y de Operador (2001)
    console.log('1. Autenticando usuarios de prueba...');
    const assocLogin = await request('/api/auth/login', 'POST', { email: '3001', password: 'admin123' });
    const assocToken = assocLogin.body.token;

    const opLogin = await request('/api/auth/login', 'POST', { email: '2001', password: 'admin123' });
    const opToken = opLogin.body.token;

    if (!assocToken || !opToken) {
      throw new Error('Fallo de autenticación en login de pruebas.');
    }
    console.log('   [PASS] Autenticación exitosa.');

    // 2. GET /api/asociado/cuenta-planilla
    console.log('\n2. Obteniendo cuenta de planilla de Carlos López (3001)...');
    const resPlanilla = await request('/api/asociado/cuenta-planilla', 'GET', null, assocToken);
    console.log('   Status:', resPlanilla.status);
    console.log('   Nro Cuenta:', resPlanilla.body.data?.numero_cuenta);
    console.log('   Saldo Disponible:', resPlanilla.body.data?.saldo_disponible);
    const idCuentaOrigen = resPlanilla.body.data?.id_cuenta;
    const saldoInicialOrigen = parseFloat(resPlanilla.body.data?.saldo_disponible);

    if (resPlanilla.status !== 200 || !idCuentaOrigen) {
      throw new Error('No se pudo cargar la cuenta de planilla.');
    }
    console.log('   [PASS] Cuenta planilla leída correctamente.');

    // 3. GET /api/asociado/mis-cuentas-destino
    console.log('\n3. Obteniendo opciones de destino para traslados...');
    const resDestinos = await request('/api/asociado/mis-cuentas-destino', 'GET', null, assocToken);
    console.log('   Status:', resDestinos.status);
    console.log('   Cuentas existentes:', resDestinos.body.data?.cuentasExistentes?.length);
    console.log('   Tipos disponibles para nueva apertura:', resDestinos.body.data?.tiposDisponibles?.length);
    if (resDestinos.status === 200 && Array.isArray(resDestinos.body.data?.tiposDisponibles)) {
      console.log('   [PASS] Catálogo de destinos consultado.');
    } else {
      throw new Error('Fallo al obtener destinos.');
    }

    // 4. POST /api/asociado/solicitudes-traslado (Apertura de Ahorro Programado ID 5 con Q1,500.00)
    console.log('\n4. Solicitando nueva apertura de Ahorro Programado con traslado de Q1,500.00...');
    const payloadSolicitud = {
      id_cuenta_origen: idCuentaOrigen,
      id_tipo_cuenta_destino: 5, // Ahorro Programado
      monto: 1500.00,
      tipo_operacion: 'APERTURA_Y_TRASLADO',
      observaciones: 'Prueba traslado automatizada'
    };
    const resSolicitar = await request('/api/asociado/solicitudes-traslado', 'POST', payloadSolicitud, assocToken);
    console.log('   Status:', resSolicitar.status, '(Esperado: 201)');
    console.log('   Caso Generado:', resSolicitar.body.data?.numero_caso);
    console.log('   Estado:', resSolicitar.body.data?.estado);
    const idSolicitud = resSolicitar.body.data?.id_solicitud;

    if (resSolicitar.status === 201 && idSolicitud) {
      console.log('   [PASS] Solicitud registrada en estado PENDIENTE.');
    } else {
      throw new Error('Fallo al registrar traslado.');
    }

    // 5. GET /api/operador/bandeja-solicitudes (Validar presencia del caso)
    console.log('\n5. Consultando bandeja del operador para validar caso...');
    const resBandeja = await request('/api/operador/bandeja-solicitudes', 'GET', null, opToken);
    const casoEnBandeja = resBandeja.body.data?.find(s => s.id_solicitud === idSolicitud);
    console.log('   Status:', resBandeja.status);
    console.log('   ¿Caso encontrado en bandeja?:', !!casoEnBandeja);
    if (resBandeja.status === 200 && casoEnBandeja) {
      console.log('   [PASS] Caso pendiente visible para el operador.');
    } else {
      throw new Error('El caso no se listó en la bandeja de entrada del operador.');
    }

    // 6. POST /api/operador/solicitudes/:id/resolver (Aprobar y ejecutar transacción)
    console.log(`\n6. Resolviendo caso ${casoEnBandeja.numero_caso} (APROBAR)...`);
    const resResolver = await request(`/api/operador/solicitudes/${idSolicitud}/resolver`, 'POST', {
      accion: 'APROBAR',
      observaciones: 'Caso aprobado en prueba de integración.'
    }, opToken);
    console.log('   Status:', resResolver.status, '(Esperado: 200)');
    console.log('   Estado Final:', resResolver.body.data?.estado);
    if (resResolver.status === 200 && resResolver.body.data?.estado === 'APROBADO') {
      console.log('   [PASS] Caso resuelto y transacción de base de datos exitosa.');
    } else {
      throw new Error('No se pudo resolver el caso.');
    }

    // 7. Verificar impacto financiero en base de datos
    console.log('\n7. Verificando saldos y transacciones post-aprobación...');
    
    // Consultar saldo de origen
    const checkOrigen = await db.query('SELECT saldo_disponible FROM cuentas WHERE id_cuenta = $1', [idCuentaOrigen]);
    const saldoFinalOrigen = parseFloat(checkOrigen.rows[0].saldo_disponible);
    console.log(`   Saldo inicial planilla: Q${saldoInicialOrigen.toFixed(2)} | Saldo final: Q${saldoFinalOrigen.toFixed(2)}`);
    
    // Consultar cuenta de destino creada
    const checkDest = await db.query('SELECT id_cuenta, numero_cuenta, id_tipo_cuenta, saldo_disponible FROM cuentas WHERE id_asociado = 1 AND id_tipo_cuenta = 5 LIMIT 1');
    const cuentaDestino = checkDest.rows[0];
    console.log('   Nueva Cuenta Creada:', cuentaDestino?.numero_cuenta);
    console.log('   Saldo Cuenta Destino: Q' + parseFloat(cuentaDestino?.saldo_disponible).toFixed(2));

    // Consultar transacciones
    const checkTxs = await db.query('SELECT tipo_transaccion, monto, referencia FROM transacciones WHERE referencia LIKE $1', [`%${casoEnBandeja.numero_caso}`]);
    console.log('   Transacciones registradas en auditoría:');
    checkTxs.rows.forEach(t => {
      console.log(`   - Tipo: ${t.tipo_transaccion} | Monto: Q${t.monto} | Ref: ${t.referencia}`);
    });

    const debitoOk = saldoFinalOrigen === (saldoInicialOrigen - 1500.00);
    const creditoOk = parseFloat(cuentaDestino?.saldo_disponible) === 1500.00;
    const txCountOk = checkTxs.rows.length === 2;

    if (debitoOk && creditoOk && txCountOk) {
      console.log('   [PASS] Saldo de planilla debitado, nueva cuenta acreditada y transacciones registradas de forma atómica (ACID).');
    } else {
      throw new Error('Fallo de consistencia en el estado de cuentas o transacciones.');
    }

    // 8. Limpiar datos de prueba
    console.log('\n8. Iniciando limpieza de registros de prueba...');
    await db.query('DELETE FROM transacciones WHERE id_cuenta = $1 OR id_cuenta = $2', [idCuentaOrigen, cuentaDestino.id_cuenta]);
    await db.query('DELETE FROM solicitudes_traslado_apertura WHERE id_solicitud = $1', [idSolicitud]);
    await db.query('DELETE FROM cuentas WHERE id_cuenta = $1', [cuentaDestino.id_cuenta]);
    console.log('   [PASS] Limpieza completada.');

    console.log('\n=========================================');
    console.log('[SUCCESS] TODAS LAS PRUEBAS DE TRASLADO COMPLETADAS CON ÉXITO');
    console.log('=========================================\n');
  } catch (error) {
    console.error('Error durante la prueba de traslados:', error);
  } finally {
    server.close();
    process.exit(0);
  }
});
