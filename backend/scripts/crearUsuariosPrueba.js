/**
 * Crea las cuentas de prueba del personal (AD-1, AD-2, EJ-1, OP-1 y OP-2) en una base de desarrollo o del CI.
 * Las pruebas de integración y de regresión inician sesión con ellas.
 *
 * La contraseña no está en el código: se toma de USUARIOS_PRUEBA_PASSWORD y el hash se calcula aquí.
 * No corre con NODE_ENV=production y no toca una cuenta que ya existe.
 *
 * Uso: USUARIOS_PRUEBA_PASSWORD=... node scripts/crearUsuariosPrueba.js
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const USUARIOS_PRUEBA = [
  {
    codigo: 'AD-1',
    rol: 'ADMINISTRADOR',
    email: 'admin@cooperativa.com',
    persona: ['1000000000001', 'Steven', 'Alejandro', 'Ortiz', 'Gómez', '55110001', '1995-03-12'],
  },
  {
    codigo: 'AD-2',
    rol: 'ADMINISTRADOR',
    email: 'admin.lucia@cooperativa.com',
    persona: ['1000000000002', 'Lucía', 'Fernanda', 'Morales', 'Castillo', '55110002', '1996-07-25'],
  },
  {
    codigo: 'EJ-1',
    rol: 'EJECUTIVO',
    email: 'ejecutivo@cooperativa.com',
    persona: ['6000000000001', 'Carlos', 'Eduardo', 'Mendoza', 'Gómez', '55110003', '1992-11-18'],
  },
  {
    codigo: 'OP-1',
    rol: 'OPERADOR',
    email: 'operador@cooperativa.com',
    persona: ['2000000000001', 'Juan', 'Carlos', 'Martínez', 'Pérez', '55110004', '1994-05-14'],
  },
  {
    codigo: 'OP-2',
    rol: 'OPERADOR',
    email: 'operador.maria@cooperativa.com',
    persona: ['2000000000002', 'María', 'Elena', 'Gutiérrez', 'Castro', '55110005', '1997-09-08'],
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Las cuentas de prueba no se crean con NODE_ENV=production.');
  }
  const password = process.env.USUARIOS_PRUEBA_PASSWORD;
  if (!password) {
    throw new Error('Falta USUARIOS_PRUEBA_PASSWORD (vea .env.example).');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const usuario of USUARIOS_PRUEBA) {
      const [cui, primerNombre, segundoNombre, primerApellido, segundoApellido, telefono, nacimiento] = usuario.persona;
      await client.query(
        `INSERT INTO personas (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono,
                               direccion, fecha_nacimiento)
         VALUES ($1, $2, $3, $4, $5, $6, 'Ciudad de Guatemala', $7)
         ON CONFLICT (cui_dpi) DO NOTHING`,
        [cui, primerNombre, segundoNombre, primerApellido, segundoApellido, telefono, nacimiento]
      );
      const res = await client.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
         SELECT p.id_persona, r.id_rol, $3, $4, $5, 'ACTIVO'
         FROM personas p, roles r
         WHERE p.cui_dpi = $1 AND r.codigo = $2
         ON CONFLICT (codigo_corporativo) DO NOTHING
         RETURNING id_usuario`,
        [cui, usuario.rol, usuario.codigo, usuario.email, passwordHash]
      );
      console.log(`[${res.rowCount ? 'CREADO' : 'YA EXISTE'}] ${usuario.codigo} (${usuario.rol})`);
    }
    await client.query('COMMIT');
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
