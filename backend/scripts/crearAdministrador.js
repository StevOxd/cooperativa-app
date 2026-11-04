/**
 * Crea el primer administrador de una instalación nueva. El resto del personal se crea después desde la aplicación.
 *
 * La contraseña temporal se genera al azar, se muestra una sola vez en esta terminal y el usuario debe cambiarla
 * al iniciar sesión. Se niega a correr si ya hay un administrador activo.
 *
 * Uso en el servidor:
 *   docker compose exec backend node scripts/crearAdministrador.js \
 *     --cui=1234567890101 --nombres="Ana María" --apellidos="López Pérez" \
 *     --email=ana.lopez@cooperativa.com --nacimiento=1990-01-31
 */
const { parseArgs } = require('node:util');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const { getNextCorporateCode, generateSecureRandomPassword } = require('../src/utils/codeGenerator');

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function leerDatos() {
  const { values } = parseArgs({
    options: {
      cui: { type: 'string' },
      nombres: { type: 'string' },
      apellidos: { type: 'string' },
      email: { type: 'string' },
      nacimiento: { type: 'string' },
    },
  });
  const faltan = ['cui', 'nombres', 'apellidos', 'email', 'nacimiento'].filter((campo) => !values[campo]?.trim());
  if (faltan.length > 0) throw new Error(`Faltan datos: --${faltan.join(', --')}. Vea el uso al inicio del script.`);

  const cui = values.cui.trim();
  const email = values.email.trim().toLowerCase();
  const nacimiento = values.nacimiento.trim();
  if (!/^\d{13}$/.test(cui)) throw new Error('El CUI debe tener 13 dígitos.');
  if (!EMAIL_REGEX.test(email)) throw new Error('Revise el correo. Debe verse así: nombre@correo.com.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) throw new Error('La fecha de nacimiento va como AAAA-MM-DD.');

  const [primerNombre, ...otrosNombres] = values.nombres.trim().split(/\s+/);
  const [primerApellido, ...otrosApellidos] = values.apellidos.trim().split(/\s+/);
  return {
    cui,
    email,
    nacimiento,
    primerNombre,
    segundoNombre: otrosNombres.join(' ') || null,
    primerApellido,
    segundoApellido: otrosApellidos.join(' ') || null,
  };
}

async function main() {
  const datos = leerDatos();
  const passwordTemporal = generateSecureRandomPassword(12);
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admins = await client.query(
      `SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
       WHERE r.codigo = 'ADMINISTRADOR' AND u.estado = 'ACTIVO' LIMIT 1`
    );
    if (admins.rowCount > 0) {
      throw new Error('Ya hay un administrador activo: cree los demás usuarios desde la aplicación.');
    }

    const persona = await client.query(
      `INSERT INTO personas (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cui_dpi) DO UPDATE SET cui_dpi = EXCLUDED.cui_dpi
       RETURNING id_persona`,
      [
        datos.cui,
        datos.primerNombre,
        datos.segundoNombre,
        datos.primerApellido,
        datos.segundoApellido,
        datos.nacimiento,
      ]
    );
    const codigo = await getNextCorporateCode(client, 'AD');
    await client.query(
      `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
       SELECT $1, id_rol, $2, $3, $4, 'ACTIVO', TRUE FROM roles WHERE codigo = 'ADMINISTRADOR'`,
      [persona.rows[0].id_persona, codigo, datos.email, passwordHash]
    );
    await client.query('COMMIT');

    console.log(`Administrador creado. Código de usuario: ${codigo}`);
    console.log(`Contraseña temporal: ${passwordTemporal}`);
    console.log('Se muestra solo esta vez. El sistema pedirá cambiarla al iniciar sesión.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
