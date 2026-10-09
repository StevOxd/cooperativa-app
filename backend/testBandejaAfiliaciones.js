/**
 * @file testBandejaAfiliaciones.js
 * @description Suite de verificación de bandeja de afiliaciones en ventanilla,
 * bloqueo concurrente de casos (409 Conflict) e idempotencia institucional.
 */

require('dotenv').config({ path: __dirname + '/.env' });
const db = require('./src/config/db');
const { makeRequest, createTestReporter } = require('./testHelper');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

async function runTests() {
  console.log('\n===================================================================');
  console.log(' [SUITE] VERIFICACIÓN DE BANDEJA DE AFILIACIONES Y BLOQUEO OPERADOR');
  console.log('===================================================================\n');

  const reporter = createTestReporter();
  const request = (path, method = 'GET', body = null, token = null) =>
    makeRequest(BASE_URL, path, method, body, token);

  // Variables para cleanup e idempotencia en finally
  let casoMarvin = null;
  let formalizedSocio = null;

  try {
    // 1. Iniciar sesión como OP-1 y OP-2
    console.log('1. Autenticando operadores...');
    const loginOp1 = await request('/api/auth/login', 'POST', {
      email: 'OP-1',
      password: 'admin123',
    });
    reporter.assert(loginOp1.status === 200 && !!loginOp1.body.token, 'Token OP-1 obtenido exitosamente');
    const tokenOp1 = loginOp1.body.token;

    const loginOp2 = await request('/api/auth/login', 'POST', {
      email: 'OP-2',
      password: 'admin123',
    });
    reporter.assert(loginOp2.status === 200 && !!loginOp2.body.token, 'Token OP-2 obtenido exitosamente');
    const tokenOp2 = loginOp2.body.token;

    // 2. Consultar bandeja general de afiliaciones pendientes
    console.log('\n2. Consultando GET /api/operador/afiliaciones...');
    const listRes = await request('/api/operador/afiliaciones', 'GET', null, tokenOp1);
    reporter.assert(listRes.status === 200, 'Bandeja de afiliaciones consultada exitosamente (Status 200)');
    reporter.assert(Array.isArray(listRes.body.data), `Listado de casos recibido (${listRes.body.data?.length} casos)`);

    // Buscar caso pendiente
    casoMarvin = listRes.body.data.find(
      (c) => c.estado === 'PENDIENTE_AGENCIA' && !c.esta_bloqueado
    );

    if (!casoMarvin) {
      // Si no hay caso disponible, creamos uno de prueba en estado PENDIENTE_AGENCIA
      console.log('  [INFO] No hay casos pendientes libres. Creando caso temporal de prueba...');
      const dummyCui = '9' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
      const insertRes = await db.query(`
        INSERT INTO solicitudes_afiliacion_agencia (
          cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          telefono, direccion, fecha_nacimiento, email, monto_estimado, estado
        ) VALUES (
          $1, 'TestMarvin', 'Steven', 'Ortiz', 'Prueba',
          '55551234', 'Ciudad de Guatemala', '1995-05-15', 'test.marvin@cooperativa.com', 250.00, 'PENDIENTE_AGENCIA'
        ) RETURNING id_solicitud, numero_caso, cui_dpi, primer_nombre, primer_apellido, monto_estimado, estado;
      `, [dummyCui]);
      casoMarvin = insertRes.rows[0];
    }

    reporter.assert(!!casoMarvin, `Caso identificado para prueba: ${casoMarvin.numero_caso} (DPI: ${casoMarvin.cui_dpi})`);

    // 3. Probar Buscador por parámetros (?search=)
    console.log('\n3. Probando Buscador por parámetros (?search=)...');
    const searchCaso = await request(`/api/operador/afiliaciones?search=${casoMarvin.numero_caso}`, 'GET', null, tokenOp1);
    reporter.assert(
      searchCaso.body.data.some((c) => c.numero_caso === casoMarvin.numero_caso),
      `Búsqueda por número de caso (${casoMarvin.numero_caso}) exitosa`
    );

    const searchDpi = await request(`/api/operador/afiliaciones?search=${casoMarvin.cui_dpi}`, 'GET', null, tokenOp1);
    reporter.assert(
      searchDpi.body.data.some((c) => c.cui_dpi === casoMarvin.cui_dpi),
      `Búsqueda por DPI (${casoMarvin.cui_dpi}) exitosa`
    );

    const searchNombre = await request(`/api/operador/afiliaciones?search=${encodeURIComponent(casoMarvin.primer_nombre)}`, 'GET', null, tokenOp1);
    reporter.assert(
      searchNombre.body.data.some((c) => c.id_solicitud === casoMarvin.id_solicitud),
      `Búsqueda por nombre (${casoMarvin.primer_nombre}) exitosa`
    );

    const searchNone = await request('/api/operador/afiliaciones?search=NONEXISTENT_XYZ_999', 'GET', null, tokenOp1);
    reporter.assert(searchNone.body.data.length === 0, 'Búsqueda sin coincidencias retornó 0 casos correctamente');

    // 4. Probar Bloqueo Concurrente de Casos (409 Conflict)
    console.log('\n4. Probando Bloqueo Concurrente de Casos...');
    const lockOp1 = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/bloquear`, 'POST', null, tokenOp1);
    reporter.assert(lockOp1.status === 200, `OP-1 adquirió el bloqueo del caso ${casoMarvin.numero_caso} con éxito`);

    const lockOp2 = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/bloquear`, 'POST', null, tokenOp2);
    reporter.assert(
      lockOp2.status === 409,
      'OP-2 fue bloqueado correctamente con HTTP 409 Conflict ante caso ocupado'
    );

    // Verificar indicador de bloqueo desde la perspectiva de OP-2
    const listOp2 = await request('/api/operador/afiliaciones', 'GET', null, tokenOp2);
    const casoVistoPorOp2 = listOp2.body.data.find((c) => c.id_solicitud === casoMarvin.id_solicitud);
    reporter.assert(
      casoVistoPorOp2 && casoVistoPorOp2.esta_bloqueado === true && casoVistoPorOp2.bloqueado_por_mi === false,
      'Para OP-2 el caso refleja: esta_bloqueado = true y bloqueado_por_mi = false'
    );

    // 5. Liberar caso con OP-1 y tomar con OP-2
    console.log('\n5. Liberando caso con OP-1...');
    const unlockOp1 = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/liberar`, 'POST', null, tokenOp1);
    reporter.assert(unlockOp1.status === 200, 'Caso liberado exitosamente por OP-1');

    const lockOp2After = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/bloquear`, 'POST', null, tokenOp2);
    reporter.assert(lockOp2After.status === 200, 'OP-2 adquirió el caso liberado exitosamente');

    const unlockOp2 = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/liberar`, 'POST', null, tokenOp2);
    reporter.assert(unlockOp2.status === 200, 'Caso liberado nuevamente por OP-2');

    // 6. Formalizar afiliación en ventanilla con OP-1 (issue #26: el acceso al portal es opcional)
    console.log('\n6. Formalizando afiliación en ventanilla...');
    const datosFormalizacion = {
      monto_aportacion: 250.00,
      metodo_pago: 'EFECTIVO_VENTANILLA',
      tipo_asociado: 'EX',
      observaciones: 'Atención presencial en agencia central, DPI verificado con original.',
    };

    // Si el correo de la cooperativa no funciona, no se puede pedir el acceso al portal
    const estadoCorreo = await request('/api/operador/correo-estado', 'GET', null, tokenOp1);
    reporter.assert(estadoCorreo.status === 200 && typeof estadoCorreo.body.disponible === 'boolean', 'El operador consulta si el correo funciona');
    if (estadoCorreo.body.disponible === false) {
      const conAccesoSinCorreo = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/formalizar`, 'POST', {
        ...datosFormalizacion, crear_acceso_portal: true,
      }, tokenOp1);
      reporter.assert(
        conAccesoSinCorreo.status === 409 && conAccesoSinCorreo.body.error === 'CORREO_NO_DISPONIBLE',
        'Sin correo, pedir el acceso al portal se rechaza y no se formaliza'
      );
    }

    const formalizarRes = await request(`/api/operador/afiliaciones/${casoMarvin.id_solicitud}/formalizar`, 'POST', {
      ...datosFormalizacion, crear_acceso_portal: false,
    }, tokenOp1);

    reporter.assert(
      formalizarRes.status === 200 && formalizarRes.body.success,
      'Afiliación formalizada en ventanilla exitosamente'
    );

    formalizedSocio = formalizarRes.body.data;
    const usuarioCreado = await db.query(
      'SELECT 1 FROM usuarios u JOIN asociados a ON a.id_persona = u.id_persona WHERE a.id_asociado = $1',
      [formalizedSocio?.id_asociado]
    );
    reporter.assert(
      formalizedSocio && formalizedSocio.acceso_portal === false && !formalizedSocio.usuario && usuarioCreado.rows.length === 0,
      'Sin acceso al portal se afilia sin crear usuario'
    );

    // 7. Verificar que la solicitud ya no aparezca en pendientes
    const listFinal = await request('/api/operador/afiliaciones?estado=PENDIENTE_AGENCIA', 'GET', null, tokenOp1);
    const casoFinal = listFinal.body.data.find((c) => c.id_solicitud === casoMarvin.id_solicitud);
    reporter.assert(!casoFinal, 'La solicitud formalizada ya no aparece en el listado de pendientes (estado ATENDIDA)');

  } catch (err) {
    console.error('\n[ERROR] Fallo crítico durante la suite de bandeja:', err.message);
  } finally {
    // 8. Limpieza e idempotencia defensiva
    console.log('\n[CLEANUP] Restaurando estado original para garantizar idempotencia...');
    try {
      if (formalizedSocio) {
        // Eliminar transacciones de la cuenta de aportaciones creada
        await db.query(`
          DELETE FROM transacciones 
          WHERE id_cuenta IN (SELECT id_cuenta FROM cuentas WHERE numero_cuenta = $1)
        `, [formalizedSocio.numero_cuenta]);

        // Eliminar cuenta de aportaciones
        await db.query(`DELETE FROM cuentas WHERE numero_cuenta = $1`, [formalizedSocio.numero_cuenta]);

        // Eliminar asociado
        await db.query(`DELETE FROM asociados WHERE id_asociado = $1`, [formalizedSocio.id_asociado]);

        // Eliminar usuario (si se creó)
        if (formalizedSocio.usuario) {
          await db.query(`DELETE FROM usuarios WHERE codigo_corporativo = $1`, [formalizedSocio.usuario]);
        }

        console.log(`  [CLEANUP] Asociado temporal (${formalizedSocio.usuario}) y cuenta eliminados.`);
      }

      if (casoMarvin) {
        // Restablecer caso a PENDIENTE_AGENCIA y desbloqueado
        await db.query(`
          UPDATE solicitudes_afiliacion_agencia 
          SET estado = 'PENDIENTE_AGENCIA', id_operador_resuelve = NULL, fecha_resolucion = NULL,
              id_operador_bloqueo = NULL, fecha_bloqueo = NULL
          WHERE id_solicitud = $1
        `, [casoMarvin.id_solicitud]);
        console.log(`  [CLEANUP] Caso ${casoMarvin.numero_caso} restablecido a PENDIENTE_AGENCIA.`);
      }
    } catch (cleanErr) {
      console.error('  [ERROR] Fallo en cleanup:', cleanErr.message);
    } finally {
      const stats = reporter.getStats();
      console.log('\n===================================================================');
      console.log(` [RESULTADO] PRUEBAS SUPERADAS: ${stats.passed} / ${stats.total}`);
      if (stats.failed === 0) {
        console.log(' [SUCCESS] TODAS LAS PRUEBAS DE BANDEJA Y BLOQUEO PASARON AL 100%');
      } else {
        console.log(' [FAIL] Algunas aserciones de la suite fallaron.');
      }
      console.log('===================================================================\n');

      process.exit(stats.failed === 0 ? 0 : 1);
    }
  }
}

runTests();
