// Las pruebas nunca envían correo real (ver mailerService): debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

/**
 * testCierreTecnico.js
 *
 * - El backend se conecta con un rol que solo usa lo que necesita: no es superusuario, no crea tablas (ni
 *   temporales) ni bases, no desactiva triggers ni los salta, no cambia secuencias, no modifica los registros que
 *   solo se agregan, borra solo en las tablas que el código limpia y no puede purgar los registros de auditoría.
 * - Los triggers de auditoría buscan el dueño de la tabla en pg_catalog con search_path fijo.
 * - Las migraciones corren con el rol dueño de las tablas, que tampoco es superusuario; las tablas de las dos bases
 *   son suyas, los permisos de la aplicación quedan como se definen y una tabla nueva nace con lectura y escritura.
 * - Dos altas simultáneas del mismo tipo de usuario reciben códigos distintos, y la que espera no lo hace sin límite.
 */
const { Pool } = require('pg');
const { server } = require('./src/server');
const db = require('./src/config/db');
const { runMigrations, TABLAS_SOLO_INSERCION, TABLAS_CON_BORRADO } = require('./src/config/migrations');
const { getNextCorporateCode } = require('./src/utils/codeGenerator');
const {
  makeRequest,
  createTestReporter,
  crearUsuarioDePrueba,
  borrarPersonaDePrueba,
  purgarEfectivoDePrueba,
  poolDueno,
} = require('./testHelper');

const SIN_PERMISO = '42501';
const FUNCIONES_DE_AUDITORIA = ['trg_depositos_ventanilla_inmutable', 'trg_registro_solo_insercion', 'trg_reversiones_pendientes_inmutable'];

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta una sentencia con el rol de la aplicación dentro de una transacción que siempre se deshace: aunque la
 * sentencia pasara, no cambia nada.
 *
 * @param {import('pg').Pool} pool
 * @param {string} sql
 * @returns {Promise<string>} el código de error de PostgreSQL, u 'OK' si la sentencia pasó.
 */
const intentar = async (pool, sql) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    return 'OK';
  } catch (error) {
    return error.code;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
};

/**
 * Tablas de la base en que los permisos del rol de la aplicación no son los esperados.
 *
 * @param {import('pg').Pool} pool - Pool del rol de la aplicación.
 * @param {(tabla: string) => { update: boolean, delete: boolean }} esperado
 * @returns {Promise<string[]>}
 */
const permisosDistintos = async (pool, esperado) => {
  const { rows } = await pool.query(`
    SELECT tablename AS tabla,
      has_table_privilege(format('public.%I', tablename), 'SELECT') AS s,
      has_table_privilege(format('public.%I', tablename), 'INSERT') AS i,
      has_table_privilege(format('public.%I', tablename), 'UPDATE') AS u,
      has_table_privilege(format('public.%I', tablename), 'DELETE') AS d,
      has_table_privilege(format('public.%I', tablename), 'TRUNCATE')
        OR has_table_privilege(format('public.%I', tablename), 'TRIGGER')
        OR has_table_privilege(format('public.%I', tablename), 'REFERENCES') AS otros
    FROM pg_tables WHERE schemaname = 'public'`);
  return rows
    .filter((r) => !r.s || !r.i || r.otros || r.u !== esperado(r.tabla).update || r.d !== esperado(r.tabla).delete)
    .map((r) => r.tabla);
};

const testServer = server.listen(0, async () => {
  const port = testServer.address().port;
  console.log('\n=============================================================');
  console.log('[SUITE] CIERRE TÉCNICO');
  console.log(`[INFO] Servidor de pruebas en puerto: ${port}`);
  console.log('=============================================================\n');

  const { assert, getStats } = createTestReporter();
  const request = (ruta, method, data, token) => makeRequest(port, ruta, method, data, token);
  const sufijo = String(Date.now()).slice(-7);
  const personas = [];
  // Se borran al final: los operadores creados por el administrador dejan su auditoría a nombre de él
  const personasAlFinal = [];
  const dpiEfectivo = `961${sufijo}000`.slice(0, 13);
  const tablaNueva = `zz_cierre_${sufijo}`;
  const app = process.env.DB_USER;
  const dueno = process.env.DB_OWNER_USER;
  // pg guarda la contraseña fuera de las propiedades enumerables: se pasa aparte
  const bancoApp = new Pool({ ...db.pool.options, password: db.pool.options.password, database: 'banco_db', max: 2 });
  let tokenAdmin = null;
  let errorInesperado = false;

  try {
    // -------------------------------------------------------------------------
    console.log('--- 1. Rol de la aplicación ---');
    const rolApp = (await db.query(
      'SELECT current_user AS nombre, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )).rows[0];
    assert(rolApp.nombre === app && app !== dueno, 'El backend se conecta con DB_USER, distinto del rol dueño');
    assert(!rolApp.rolsuper && !rolApp.rolcreatedb && !rolApp.rolcreaterole && !rolApp.rolbypassrls,
      'El rol de la aplicación no es superusuario ni crea bases o roles');

    assert(await intentar(db.pool, 'CREATE TABLE zz_cierre_tecnico (id INT)') === SIN_PERMISO, 'No crea tablas');
    assert(await intentar(db.pool, 'CREATE TEMP TABLE pg_class (oid OID, relowner OID)') === SIN_PERMISO,
      'No crea tablas temporales (con una podría hacerse pasar por pg_class)');
    assert(await intentar(db.pool, 'ALTER TABLE efectivo_ventanilla DISABLE TRIGGER ALL') === SIN_PERMISO,
      'No desactiva los triggers de auditoría');
    assert(await intentar(db.pool, 'SET LOCAL session_replication_role = replica') === SIN_PERMISO,
      'No salta los triggers con session_replication_role');
    assert(await intentar(db.pool, 'TRUNCATE efectivo_ventanilla') === SIN_PERMISO, 'No vacía tablas con TRUNCATE');
    assert(await intentar(db.pool, 'DROP TABLE efectivo_ventanilla') === SIN_PERMISO, 'No borra tablas');
    // setval no se deshace con ROLLBACK: se intenta dejar la secuencia como está
    assert(await intentar(db.pool, 'SELECT setval(\'seq_numero_caso_traslado\', last_value, is_called) FROM seq_numero_caso_traslado')
      === SIN_PERMISO, 'No cambia secuencias (setval)');
    assert(await intentar(db.pool, 'DELETE FROM usuarios WHERE false') === SIN_PERMISO
      && await intentar(db.pool, 'DELETE FROM transacciones WHERE false') === SIN_PERMISO,
      'No borra usuarios ni movimientos (la desvinculación es por estado)');
    assert(await intentar(db.pool, 'UPDATE historial_estados_usuario SET motivo = motivo WHERE false') === SIN_PERMISO,
      'No modifica el historial de auditoría');
    assert(await intentar(bancoApp, 'CREATE TABLE zz_cierre_tecnico (id INT)') === SIN_PERMISO
      && await intentar(bancoApp, 'DELETE FROM movimientos_bancarios WHERE false') === SIN_PERMISO,
      'En banco_db tampoco crea tablas ni borra movimientos');

    const distintosCoop = await permisosDistintos(db.pool, (tabla) => ({
      update: !TABLAS_SOLO_INSERCION.includes(tabla),
      delete: TABLAS_CON_BORRADO.includes(tabla),
    }));
    assert(distintosCoop.length === 0,
      `cooperativa_db: lee y agrega en todo, modifica salvo en los registros de solo agregar y borra solo en ${TABLAS_CON_BORRADO.length} tablas${distintosCoop.length ? ` (distintas: ${distintosCoop.join(', ')})` : ''}`);
    const distintosBanco = await permisosDistintos(bancoApp, (tabla) => ({ update: tabla !== 'movimientos_bancarios', delete: false }));
    assert(distintosBanco.length === 0,
      `banco_db: lee y agrega en todo, no modifica movimientos y no borra${distintosBanco.length ? ` (distintas: ${distintosBanco.join(', ')})` : ''}`);
    // El CASE asegura que has_sequence_privilege solo se evalúe sobre secuencias
    // Una cascada corre como dueño: ningún cambio que la aplicación pueda hacer debe reescribir esos registros
    const cascadas = (await db.query(
      `SELECT conname FROM pg_constraint
       WHERE contype = 'f' AND conrelid::regclass::text = ANY($1)
         AND (confupdtype NOT IN ('a', 'r') OR (confdeltype NOT IN ('a', 'r') AND has_table_privilege(confrelid, 'DELETE')))`,
      [TABLAS_SOLO_INSERCION]
    )).rows.map((r) => r.conname);
    assert(cascadas.length === 0,
      `Ningún cambio en otra tabla reescribe por cascada los registros de solo agregar${cascadas.length ? ` (${cascadas.join(', ')})` : ''}`);
    const secuenciasModificables = (await db.query(
      `SELECT count(*) FILTER (WHERE CASE WHEN relkind = 'S' THEN has_sequence_privilege(oid, 'UPDATE') ELSE false END)::int AS n
       FROM pg_class WHERE relnamespace = 'public'::regnamespace`
    )).rows[0].n;
    assert(secuenciasModificables === 0, 'No tiene UPDATE en ninguna secuencia');

    // El rol de la aplicación registra efectivo y depósitos, pero ni con la marca de purga los cambia; el dueño sí
    // los purga. En el efectivo lo impide el permiso; en los depósitos (tiene UPDATE para conciliar), el trigger.
    const operador = await crearUsuarioDePrueba(db, {
      dpi: `962${sufijo}000`.slice(0, 13), codigo: `OP-TCT${sufijo}`, email: `op.cierre.${sufijo}@example.com`, rol: 'OPERADOR',
    });
    personas.push(operador.idPersona);
    const referenciaDeposito = `DEP-TCT-${sufijo}`;
    await db.query(
      "INSERT INTO efectivo_ventanilla (id_usuario_operador, cui_dpi, monto, origen) VALUES ($1, $2, 1, 'APERTURA_CUENTA')",
      [operador.idUsuario, dpiEfectivo]
    );
    await db.query(
      `INSERT INTO depositos_ventanilla_banco (id_usuario_operador, numero_cuenta_bancaria, titular_cui, monto, referencia, estado)
       VALUES ($1, 'CTA-PRUEBA', $2, 1, $3, 'ACREDITADO')`,
      [operador.idUsuario, dpiEfectivo, referenciaDeposito]
    );
    const conMarcaDePurga = async (sql, params) => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL cooperativa.purga_pruebas = 'on'");
        await client.query(sql, params);
        return 'OK';
      } catch (error) {
        return error.code;
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    };
    assert(await conMarcaDePurga('UPDATE efectivo_ventanilla SET monto = 2 WHERE cui_dpi = $1', [dpiEfectivo]) === SIN_PERMISO,
      'Con la marca de purga, el rol de la aplicación no cambia el efectivo registrado (sin permiso)');
    assert(await conMarcaDePurga('UPDATE depositos_ventanilla_banco SET monto = 2 WHERE referencia = $1', [referenciaDeposito]) === '23001',
      'Con la marca de purga, el trigger no deja al rol de la aplicación cambiar un depósito cerrado (no es el dueño)');
    await purgarEfectivoDePrueba(db, [dpiEfectivo]);
    const restante = await db.query(
      `SELECT (SELECT count(*) FROM efectivo_ventanilla WHERE cui_dpi = $1)
            + (SELECT count(*) FROM depositos_ventanilla_banco WHERE referencia = $2) AS n`,
      [dpiEfectivo, referenciaDeposito]
    );
    assert(Number(restante.rows[0].n) === 0, 'El rol dueño sí purga los registros de prueba');

    // Aunque alguien lograra crear una tabla temporal pg_class, los triggers no la leerían
    const funciones = (await db.query(
      'SELECT proname, proconfig, prosrc FROM pg_proc WHERE proname = ANY($1)', [FUNCIONES_DE_AUDITORIA]
    )).rows;
    assert(funciones.length === FUNCIONES_DE_AUDITORIA.length && funciones.every((f) =>
      (f.proconfig || []).includes('search_path=pg_catalog, pg_temp') && f.prosrc.includes('pg_catalog.pg_class')),
    'Los triggers de auditoría buscan el dueño de la tabla en pg_catalog con search_path fijo');

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Rol dueño y migraciones ---');
    const rolDueno = (await db.query('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1', [dueno])).rows[0];
    assert(rolDueno && !rolDueno.rolsuper && !rolDueno.rolcreatedb && !rolDueno.rolcreaterole,
      'El rol dueño tampoco es superusuario ni crea bases o roles');

    const tablasAjenas = 'SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = \'public\' AND tableowner <> $1';
    assert((await db.query(tablasAjenas, [dueno])).rows[0].n === 0, 'Todas las tablas de cooperativa_db son del rol dueño');
    assert((await bancoApp.query(tablasAjenas, [dueno])).rows[0].n === 0, 'Todas las tablas de banco_db son del rol dueño');

    assert(await runMigrations() === true, 'Las migraciones corren con el rol dueño');
    assert((await permisosDistintos(db.pool, (tabla) => ({
      update: !TABLAS_SOLO_INSERCION.includes(tabla),
      delete: TABLAS_CON_BORRADO.includes(tabla),
    }))).length === 0, 'Después de migrar, los permisos de la aplicación siguen como se definen');

    // Una tabla que cree el dueño nace con lectura y escritura para la aplicación, sin DELETE
    await poolDueno(db.pool).query(`CREATE TABLE ${tablaNueva} (id INT)`);
    const nueva = (await db.query(
      `SELECT has_table_privilege($1, 'SELECT') AND has_table_privilege($1, 'INSERT') AND has_table_privilege($1, 'UPDATE') AS escribe,
              has_table_privilege($1, 'DELETE') AS borra`,
      [tablaNueva]
    )).rows[0];
    assert(nueva.escribe && !nueva.borra, 'Una tabla nueva del rol dueño nace con lectura y escritura para la aplicación (sin DELETE)');

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Códigos de usuario en altas simultáneas ---');
    // Con un prefijo de prueba (ZT): la segunda alta espera a que la primera confirme y recibe el siguiente código
    const altaA = await db.pool.connect();
    const altaB = await db.pool.connect();
    try {
      await altaA.query('BEGIN');
      await altaB.query('BEGIN');
      const codigoA = await getNextCorporateCode(altaA, 'ZT');
      const esperaRestaurada = (await altaA.query('SHOW lock_timeout')).rows[0].lock_timeout === '0';
      const conCodigoA = await crearUsuarioDePrueba(altaA, {
        dpi: `963${sufijo}000`.slice(0, 13), codigo: codigoA, email: `zt.cierre.${sufijo}@example.com`, rol: 'OPERADOR',
      });
      let codigoB = null;
      const pendienteB = getNextCorporateCode(altaB, 'ZT').then((codigo) => { codigoB = codigo; });
      await esperar(300);
      assert(codigoB === null, 'La segunda alta espera mientras la primera no confirma');
      await altaA.query('COMMIT');
      personas.push(conCodigoA.idPersona);
      await pendienteB;
      const numero = (codigo) => Number(codigo.split('-')[1]);
      assert(codigoB !== codigoA && numero(codigoB) === numero(codigoA) + 1,
        `Al confirmar la primera (${codigoA}), la segunda recibe el siguiente código (${codigoB})`);
      assert(esperaRestaurada, 'Después del candado, el resto de la transacción vuelve a esperar sin límite propio');
    } finally {
      await altaA.query('ROLLBACK').catch(() => {});
      await altaB.query('ROLLBACK').catch(() => {});
      altaA.release();
      altaB.release();
    }

    // Si la otra alta no confirma en 15 s (por ejemplo, el banco no responde), la que espera recibe un 409
    const ocupada = await db.pool.connect();
    const enEspera = await db.pool.connect();
    try {
      await ocupada.query('BEGIN');
      await getNextCorporateCode(ocupada, 'ZT');
      await enEspera.query('BEGIN');
      const inicio = Date.now();
      const rechazo = await getNextCorporateCode(enEspera, 'ZT').catch((error) => error);
      const segundos = (Date.now() - inicio) / 1000;
      assert(rechazo?.statusCode === 409 && /otra alta/.test(rechazo.message) && segundos >= 14 && segundos < 30,
        `Quien espera más de 15 s recibe un 409 legible (${segundos.toFixed(1)} s)`);
    } finally {
      await ocupada.query('ROLLBACK').catch(() => {});
      await enEspera.query('ROLLBACK').catch(() => {});
      ocupada.release();
      enEspera.release();
    }

    // De punta a punta: dos operadores creados a la vez por un administrador
    const admin = await crearUsuarioDePrueba(db, {
      dpi: `964${sufijo}000`.slice(0, 13), codigo: `AD-TCT${sufijo}`, email: `ad.cierre.${sufijo}@example.com`, rol: 'ADMINISTRADOR',
    });
    personasAlFinal.push(admin.idPersona);
    const loginAdmin = await request('/api/auth/login', 'POST', { identifier: `AD-TCT${sufijo}`, password: 'admin123' });
    tokenAdmin = loginAdmin.body.token;
    const nuevoOperador = (n) => request('/api/usuarios', 'POST', {
      primer_nombre: 'Prueba',
      primer_apellido: 'Concurrente',
      cui_dpi: `96${n}${sufijo}000`.slice(0, 13),
      email: `op${n}.concurrente.${sufijo}@example.com`,
      fecha_nacimiento: '1990-01-01',
      rol: 'OPERADOR',
    }, tokenAdmin);
    const altas = await Promise.all([nuevoOperador(5), nuevoOperador(6)]);
    for (const alta of altas) if (alta.body.data?.id_persona) personas.push(alta.body.data.id_persona);
    const codigos = altas.map((alta) => alta.body.data?.codigo_corporativo);
    assert(loginAdmin.status === 200 && altas.every((alta) => alta.status === 201) && codigos[0] !== codigos[1],
      `Dos altas simultáneas de operadores responden 201 con códigos distintos (${codigos.join(' y ')})`);
  } catch (error) {
    console.error('\n[ERROR INESPERADO]', error);
    errorInesperado = true;
  } finally {
    if (tokenAdmin) await request('/api/auth/logout', 'POST', null, tokenAdmin).catch(() => {});
    try {
      await poolDueno(db.pool).query(`DROP TABLE IF EXISTS ${tablaNueva}`);
      await purgarEfectivoDePrueba(db, [dpiEfectivo]);
      for (const idPersona of [...personas, ...personasAlFinal]) await borrarPersonaDePrueba(db, idPersona);
      console.log('\n  [CLEANUP] Datos de prueba eliminados.');
    } catch (limpiezaError) {
      console.error('[ERROR] No se pudieron borrar los datos de prueba:', limpiezaError.message);
      errorInesperado = true;
    }
    await bancoApp.end();
    await poolDueno(db.pool).end();

    const { total, passed } = getStats();
    console.log('\n=============================================================');
    console.log(`[RESULTADO] PRUEBAS SUPERADAS: ${passed} / ${total}`);
    console.log('=============================================================\n');
    testServer.close();
    process.exit(passed === total && !errorInesperado ? 0 : 1);
  }
});
