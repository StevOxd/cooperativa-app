// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testErroresFase3.js
 *
 * Errores corregidos juntos (fase 3): límites del crédito (#12), desistir de un crédito (#11), parentesco
 * con un solo juego de valores (#10), descarga de documentos propios del asociado, cambio de estado del
 * asociado auditado, usuario sin fecha de nacimiento, correo único sin importar mayúsculas y secuencia de
 * casos de traslado que no retrocede.
 *
 * Usa el backend en proceso (puerto efímero) y la base de datos local. Limpia lo que crea.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { server } = require('./src/server');
const db = require('./src/config/db');
const { poolDueno } = require('./testHelper');
// Limpieza con el rol dueño: el de la aplicación no borra filas (salvo en las pocas tablas que el código limpia)
const comoDueno = (sql, params) => poolDueno(db.pool).query(sql, params);
const { runMigrations } = require('./src/config/migrations');

// Hash bcrypt de admin123 (el mismo de los datos semilla)
const HASH_ADMIN123 = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] ERRORES CORREGIDOS (FASE 3)');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const request = (ruta, method = 'GET', data = null, token = null) =>
    new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (data) headers['Content-Length'] = Buffer.byteLength(payload);
      const req = http.request({ hostname: 'localhost', port, path: ruta, method, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      });
      req.on('error', reject);
      if (data) req.write(payload);
      req.end();
    });

  let total = 0;
  let passed = 0;
  const assert = (condition, title) => {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${title}`);
    } else {
      console.error(`  [FAIL] ${title}`);
    }
  };

  const login = (identifier) => request('/api/auth/login', 'POST', { identifier, password: 'admin123' });
  const sufijo = String(Date.now()).slice(-7);
  const codigoAsociado = `EXF3-${sufijo}`;
  const archivo = `doc_fase3_${sufijo}.pdf`;
  const rutaArchivo = path.join(__dirname, 'uploads', 'creditos', archivo);
  const tokens = [];
  let idPersona = null;

  try {
    // Asociado de prueba con cuenta en la cooperativa
    idPersona = (await db.query(
      `INSERT INTO personas (cui_dpi, primer_nombre, primer_apellido, telefono, fecha_nacimiento)
       VALUES ($1, 'Prueba', 'Fase', '55559037', '1990-01-01') RETURNING id_persona`,
      [`936${sufijo}000`.slice(0, 13)]
    )).rows[0].id_persona;
    const idAsociado = (await db.query(
      "INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO') RETURNING id_asociado",
      [idPersona]
    )).rows[0].id_asociado;
    const idUsuario = (await db.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
       VALUES ($1, 3, $2, $3, $4, 'ACTIVO') RETURNING id_usuario`,
      [idPersona, codigoAsociado, `fase3.${sufijo}@gmail.com`, HASH_ADMIN123]
    )).rows[0].id_usuario;
    const idCuenta = (await db.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible)
       VALUES ($1, $2, 2, 100) RETURNING id_cuenta`,
      [`CTA-F3-${sufijo}`, idAsociado]
    )).rows[0].id_cuenta;

    const tokenAsociado = (await login(codigoAsociado)).body.token;
    const tokenOperador = (await login('OP-1')).body.token;
    const tokenAdmin = (await login('AD-1')).body.token;
    tokens.push(tokenAsociado, tokenOperador, tokenAdmin);

    // ------------------------------------------------------------------
    console.log('--- Créditos ---');
    const montoBajo = await request('/api/asociado/creditos/iniciar', 'POST', { monto_solicitado: 1, plazo_meses: 12, id_cuenta_bancaria_destino: 1 }, tokenAsociado);
    const plazoLargo = await request('/api/asociado/creditos/iniciar', 'POST', { monto_solicitado: 1000, plazo_meses: 1000, id_cuenta_bancaria_destino: 1 }, tokenAsociado);
    assert(
      montoBajo.status === 400 && montoBajo.body.message.includes('monto') && plazoLargo.status === 400 && plazoLargo.body.message.includes('plazo'),
      'El servidor rechaza montos y plazos fuera de los límites del crédito (#12)'
    );

    const capacidad = await request('/api/asociado/capacidad-crediticia', 'GET', null, tokenAsociado);
    assert(
      capacidad.body.data?.tasaInteresAnual === 10 && capacidad.body.data?.limitesCredito?.plazoMaximoMeses === 120,
      'El simulador recibe del servidor la tasa y los límites (#12)'
    );

    const idCredito = (await db.query(
      `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado)
       VALUES ($1, 1000, 12, 10, 90, 'PENDIENTE_FIRMA') RETURNING id_solicitud_credito`,
      [idAsociado]
    )).rows[0].id_solicitud_credito;
    const cancelar = await request(`/api/asociado/creditos/${idCredito}/cancelar`, 'POST', null, tokenAsociado);
    const credito = (await db.query('SELECT estado FROM solicitudes_credito WHERE id_solicitud_credito = $1', [idCredito])).rows[0];
    assert(cancelar.status === 200 && credito.estado === 'CANCELADA', 'Desistir de un crédito lo deja CANCELADA, no RECHAZADA (#11)');

    // ------------------------------------------------------------------
    console.log('\n--- Beneficiarios ---');
    const conVariante = await request(
      `/api/asociado/cuentas/${idCuenta}/beneficiarios`,
      'POST',
      { beneficiarios: [{ nombre_completo: 'Ana Prueba', parentesco: 'hija', porcentaje: 100 }] },
      tokenAsociado
    );
    const guardado = (await db.query('SELECT parentesco FROM beneficiarios WHERE id_cuenta = $1', [idCuenta])).rows[0];
    const desconocido = await request(
      `/api/asociado/cuentas/${idCuenta}/beneficiarios`,
      'POST',
      { beneficiarios: [{ nombre_completo: 'Ana Prueba', parentesco: 'PRIMA', porcentaje: 100 }] },
      tokenAsociado
    );
    assert(
      conVariante.status === 200 && guardado?.parentesco === 'HIJO/A' && desconocido.status === 400,
      'El parentesco se guarda con el valor de la lista y uno desconocido se rechaza (#10)'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Documentos del asociado ---');
    fs.mkdirSync(path.dirname(rutaArchivo), { recursive: true });
    fs.writeFileSync(rutaArchivo, '%PDF-1.4 prueba');
    await db.query(
      `INSERT INTO solicitudes_credito (id_asociado, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado, documento_firmado_url)
       VALUES ($1, 1000, 12, 10, 90, 'EN_REVISION_OPERADOR', $2)`,
      [idAsociado, `/api/uploads/creditos/${archivo}`]
    );
    const propio = await new Promise((resolve) => {
      http.get({ hostname: 'localhost', port, path: `/api/uploads/creditos/${archivo}`, headers: { Authorization: `Bearer ${tokenAsociado}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
    });
    assert(propio === 200, 'El asociado descarga el documento de su propia solicitud');

    // ------------------------------------------------------------------
    console.log('\n--- Estado del asociado ---');
    const suspender = await request(`/api/admin/asociados/${idAsociado}/estado`, 'PATCH', { estado: 'SUSPENDIDO', motivo: 'Prueba fase 3' }, tokenOperador);
    const auditoria = (await db.query(
      "SELECT estado_anterior, estado_nuevo, id_modificado_por FROM historial_estados_usuario WHERE id_usuario_modificado = $1 AND motivo = 'Prueba fase 3'",
      [idUsuario]
    )).rows[0];
    const sesionAsociado = await request('/api/asociado/perfil', 'GET', null, tokenAsociado);
    assert(
      suspender.status === 200 && auditoria?.estado_anterior === 'ACTIVO' && auditoria?.estado_nuevo === 'INACTIVO'
        && auditoria?.id_modificado_por && sesionAsociado.status !== 200,
      'Suspender al asociado queda auditado y cierra la sesión de su usuario'
    );

    // ------------------------------------------------------------------
    console.log('\n--- Usuarios y esquema ---');
    const sinFecha = await request('/api/usuarios', 'POST', {
      primer_nombre: 'Sin',
      primer_apellido: 'Fecha',
      email: `sinfecha.${sufijo}@gmail.com`,
      rol: 'OPERADOR',
      cui_dpi: `937${sufijo}000`.slice(0, 13),
    }, tokenAdmin);
    assert(sinFecha.status === 400 && sinFecha.body.message.includes('fecha de nacimiento'), 'Crear un usuario sin fecha de nacimiento responde 400, no 500');

    const indiceCorreo = await db.query("SELECT 1 FROM pg_indexes WHERE indexname = 'uq_usuarios_email_lower'");
    let duplicado = null;
    try {
      await db.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash)
         VALUES ($1, 2, $2, $3, $4)`,
        [idPersona, `OPF3-${sufijo}`, `FASE3.${sufijo}@GMAIL.COM`, HASH_ADMIN123]
      );
    } catch (error) {
      duplicado = error;
    }
    assert(
      indiceCorreo.rows.length === 1 && duplicado?.code === '23505',
      'El correo es único sin importar mayúsculas'
    );

    const migro = await runMigrations();
    const secuencia = (await db.query(
      `SELECT (SELECT last_value FROM seq_numero_caso_traslado) AS valor,
              COALESCE((SELECT MAX(substring(numero_caso FROM '^CASO-\\d{4}-(\\d+)$')::bigint) FROM solicitudes_traslado_apertura), 0) AS mayor`
    )).rows[0];
    assert(migro && Number(secuencia.valor) >= Number(secuencia.mayor), 'Después de migrar, la secuencia de traslados no queda por debajo del último caso');
  } catch (error) {
    console.error('[ERROR] Error inesperado durante las pruebas:', error);
    total++;
  } finally {
    for (const token of tokens) {
      await request('/api/auth/logout', 'POST', null, token).catch(() => {});
    }
    try {
      if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
      if (idPersona) {
        await comoDueno(
          'DELETE FROM historial_estados_usuario WHERE id_usuario_modificado IN (SELECT id_usuario FROM usuarios WHERE id_persona = $1)',
          [idPersona]
        );
        await comoDueno(
          `DELETE FROM beneficiarios WHERE id_cuenta IN (
             SELECT c.id_cuenta FROM cuentas c JOIN asociados a ON a.id_asociado = c.id_asociado WHERE a.id_persona = $1)`,
          [idPersona]
        );
        await comoDueno(
          `DELETE FROM historial_cambios_beneficiarios WHERE id_cuenta IN (
             SELECT c.id_cuenta FROM cuentas c JOIN asociados a ON a.id_asociado = c.id_asociado WHERE a.id_persona = $1)`,
          [idPersona]
        );
        await comoDueno('DELETE FROM solicitudes_credito WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1)', [idPersona]);
        await comoDueno('DELETE FROM cuentas WHERE id_asociado IN (SELECT id_asociado FROM asociados WHERE id_persona = $1)', [idPersona]);
        await comoDueno('DELETE FROM usuarios WHERE id_persona = $1', [idPersona]);
        await comoDueno('DELETE FROM asociados WHERE id_persona = $1', [idPersona]);
        await comoDueno('DELETE FROM personas WHERE id_persona = $1', [idPersona]);
        console.log('\n  [CLEANUP] Datos de prueba eliminados.');
      }
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
    }

    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total ? 0 : 1);
  }
});
