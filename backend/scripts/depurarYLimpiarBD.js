/**
 * Script de Depuración, Saneamiento y Carga de Semillas Oficiales
 * para cooperativa_db y banco_db.
 *
 * Cumple estrictamente con los requisitos del usuario:
 * - 2 Administradores (Empleados)
 * - 1 Ejecutivo (Empleado)
 * - 2 Operadores (Empleados)
 * - 0 Asociados (Limpieza total de asociados, cuentas, movimientos y solicitudes)
 * - 10 Clientes Bancarios Externos (con cuentas y credenciales de banca en línea)
 * - 10 Clientes Bancarios Empleados (con cuentas y credenciales de banca en línea)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const dbConfigCoop = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'cooperativa_user',
  password: process.env.DB_PASSWORD || 'cooperativa_secure_password_2026',
  database: 'cooperativa_db',
};

const dbConfigBanco = {
  ...dbConfigCoop,
  database: 'banco_db',
};

// Hash bcrypt de 'admin123' (Cooperativa)
const COOP_PASSWORD_HASH = '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey';
// Hash bcrypt de 'Banco123!' (Entidad Bancaria)
const BANCO_PASSWORD_HASH = '$2a$10$c.ezlTlClo7c0X8/52PO6uNFL8oGSv9QBP0EMIWo7MuRMnoBsSL6u';

async function main() {
  console.log('================================================================');
  console.log(' INICIANDO SANEAMIENTO Y LIMPIEZA DE BASES DE DATOS (ACID)');
  console.log('================================================================\n');

  const poolCoop = new Pool(dbConfigCoop);
  const poolBanco = new Pool(dbConfigBanco);

  const clientCoop = await poolCoop.connect();
  const clientBanco = await poolBanco.connect();

  try {
    // =========================================================================
    // 1. SANEAMIENTO DE BANCO_DB
    // =========================================================================
    console.log('--- 1. Depurando y cargando semillas en banco_db ---');
    await clientBanco.query('BEGIN');

    // Truncar tablas bancarias
    await clientBanco.query(`
      TRUNCATE TABLE movimientos_bancarios, cuentas_bancarias, usuarios_banca_en_linea, clientes_banco RESTART IDENTITY CASCADE;
    `);

    // Inserción de 10 Empleados Bancarios
    const empleadosBanco = [
      {
        id: 1,
        cui: '1000000000001',
        pNombre: 'Steven',
        sNombre: 'Alejandro',
        pApellido: 'Ortiz',
        sApellido: 'Gómez',
        nombreCompleto: 'Steven Alejandro Ortiz Gómez',
        tel: '55110001',
        dir: 'Ciudad de Guatemala',
        email: 'steven.ortiz@corporacionbanco.com',
        fnac: '1995-03-12',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'steven.ortiz',
        codigo: 'AD-1',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-1001', tipo: 'AHORRO', saldo: 25000.00 },
          { num: 'CTA-BCO-MONET-1001', tipo: 'MONETARIA', saldo: 15000.00 }
        ]
      },
      {
        id: 2,
        cui: '1000000000002',
        pNombre: 'Lucía',
        sNombre: 'Fernanda',
        pApellido: 'Morales',
        sApellido: 'Castillo',
        nombreCompleto: 'Lucía Fernanda Morales Castillo',
        tel: '55110002',
        dir: 'Ciudad de Guatemala',
        email: 'lucia.morales@corporacionbanco.com',
        fnac: '1996-07-25',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'lucia.morales',
        codigo: 'AD-2',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-1002', tipo: 'AHORRO', saldo: 20000.00 }
        ]
      },
      {
        id: 3,
        cui: '6000000000001',
        pNombre: 'Carlos',
        sNombre: 'Eduardo',
        pApellido: 'Mendoza',
        sApellido: 'Gómez',
        nombreCompleto: 'Carlos Eduardo Mendoza Gómez',
        tel: '55110003',
        dir: 'Ciudad de Guatemala',
        email: 'carlos.mendoza@corporacionbanco.com',
        fnac: '1992-11-18',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'carlos.mendoza',
        codigo: 'EJ-1',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-6001', tipo: 'AHORRO', saldo: 18000.00 }
        ]
      },
      {
        id: 4,
        cui: '2000000000001',
        pNombre: 'Juan',
        sNombre: 'Carlos',
        pApellido: 'Martínez',
        sApellido: 'Pérez',
        nombreCompleto: 'Juan Carlos Martínez Pérez',
        tel: '55110004',
        dir: 'Ciudad de Guatemala',
        email: 'juan.martinez@corporacionbanco.com',
        fnac: '1994-05-14',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'juan.martinez',
        codigo: 'OP-1',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-2001', tipo: 'AHORRO', saldo: 15000.00 },
          { num: 'CTA-BCO-MONET-2001', tipo: 'MONETARIA', saldo: 10000.00 }
        ]
      },
      {
        id: 5,
        cui: '2000000000002',
        pNombre: 'María',
        sNombre: 'Elena',
        pApellido: 'Gutiérrez',
        sApellido: 'Castro',
        nombreCompleto: 'María Elena Gutiérrez Castro',
        tel: '55110005',
        dir: 'Ciudad de Guatemala',
        email: 'maria.gutierrez@corporacionbanco.com',
        fnac: '1997-09-08',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'maria.gutierrez',
        codigo: 'OP-2',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-2002', tipo: 'AHORRO', saldo: 16500.00 }
        ]
      },
      {
        id: 6,
        cui: '1000000000003',
        pNombre: 'Fernando',
        sNombre: 'José',
        pApellido: 'Herrera',
        sApellido: 'Ríos',
        nombreCompleto: 'Fernando José Herrera Ríos',
        tel: '55110006',
        dir: 'Ciudad de Guatemala',
        email: 'fernando.herrera@corporacionbanco.com',
        fnac: '1993-02-20',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'fernando.herrera',
        codigo: 'EMP-1003',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-1003', tipo: 'AHORRO', saldo: 14000.00 }
        ]
      },
      {
        id: 7,
        cui: '1000000000004',
        pNombre: 'Valeria',
        sNombre: 'Sofía',
        pApellido: 'Méndez',
        sApellido: 'Alvarado',
        nombreCompleto: 'Valeria Sofía Méndez Alvarado',
        tel: '55110007',
        dir: 'Ciudad de Guatemala',
        email: 'valeria.mendez@corporacionbanco.com',
        fnac: '1998-10-30',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'valeria.mendez',
        codigo: 'EMP-1004',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-1004', tipo: 'AHORRO', saldo: 12500.00 }
        ]
      },
      {
        id: 8,
        cui: '1000000000005',
        pNombre: 'Rodrigo',
        sNombre: 'Esteban',
        pApellido: 'Sandoval',
        sApellido: 'Paz',
        nombreCompleto: 'Rodrigo Esteban Sandoval Paz',
        tel: '55110008',
        dir: 'Ciudad de Guatemala',
        email: 'rodrigo.sandoval@corporacionbanco.com',
        fnac: '1991-04-15',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'rodrigo.sandoval',
        codigo: 'EMP-1005',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-1005', tipo: 'AHORRO', saldo: 19000.00 }
        ]
      },
      {
        id: 9,
        cui: '2000000000003',
        pNombre: 'Pedro',
        sNombre: 'Antonio',
        pApellido: 'Ramírez',
        sApellido: 'Solís',
        nombreCompleto: 'Pedro Antonio Ramírez Solís',
        tel: '55110009',
        dir: 'Ciudad de Guatemala',
        email: 'pedro.ramirez@corporacionbanco.com',
        fnac: '1995-12-01',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'pedro.ramirez',
        codigo: 'EMP-2003',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-2003', tipo: 'AHORRO', saldo: 11000.00 }
        ]
      },
      {
        id: 10,
        cui: '2000000000004',
        pNombre: 'Ana',
        sNombre: 'Patricia',
        pApellido: 'Vásquez',
        sApellido: 'Cruz',
        nombreCompleto: 'Ana Patricia Vásquez Cruz',
        tel: '55110010',
        dir: 'Ciudad de Guatemala',
        email: 'ana.vasquez@corporacionbanco.com',
        fnac: '1999-06-19',
        tipo: 'EMPLEADO_PLANILLA',
        user: 'ana.vasquez',
        codigo: 'EMP-2004',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-2004', tipo: 'AHORRO', saldo: 13200.00 }
        ]
      }
    ];

    // Inserción de 10 Clientes Bancarios Externos
    const clientesExternos = [
      {
        id: 11,
        cui: '4000000000001',
        pNombre: 'Marcos',
        sNombre: 'Vinicio',
        pApellido: 'Castillo',
        sApellido: 'Mendoza',
        nombreCompleto: 'Marcos Vinicio Castillo Mendoza',
        tel: '44110001',
        dir: 'Ciudad de Guatemala',
        email: 'marcos.castillo@correo.com',
        fnac: '1990-08-14',
        tipo: 'CLIENTE_EXTERNO',
        user: 'marcos.castillo',
        codigo: 'CLI-4001',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4001', tipo: 'AHORRO', saldo: 8500.00 }
        ]
      },
      {
        id: 12,
        cui: '4000000000002',
        pNombre: 'Sofía',
        sNombre: 'Alejandra',
        pApellido: 'Reyes',
        sApellido: 'Pineda',
        nombreCompleto: 'Sofía Alejandra Reyes Pineda',
        tel: '44110002',
        dir: 'Antigua Guatemala',
        email: 'sofia.reyes@correo.com',
        fnac: '1993-01-22',
        tipo: 'CLIENTE_EXTERNO',
        user: 'sofia.reyes',
        codigo: 'CLI-4002',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4002', tipo: 'AHORRO', saldo: 9200.00 }
        ]
      },
      {
        id: 13,
        cui: '1010101010101',
        pNombre: 'Steven',
        sNombre: 'Alejandro',
        pApellido: 'Castillo',
        sApellido: 'Gómez',
        nombreCompleto: 'Steven Alejandro Castillo Gómez',
        tel: '44110003',
        dir: 'Mixco, Guatemala',
        email: 'steven.castillo@correo.com',
        fnac: '1996-09-10',
        tipo: 'CLIENTE_EXTERNO',
        user: 'steven.castillo',
        codigo: 'CLI-4003',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4003', tipo: 'AHORRO', saldo: 7800.00 }
        ]
      },
      {
        id: 14,
        cui: '8888777766665',
        pNombre: 'Juan',
        sNombre: 'Carlos',
        pApellido: 'Pérez',
        sApellido: 'Gómez',
        nombreCompleto: 'Juan Carlos Pérez Gómez',
        tel: '44110004',
        dir: 'Villa Nueva, Guatemala',
        email: 'juan.perez@correo.com',
        fnac: '1988-04-18',
        tipo: 'CLIENTE_EXTERNO',
        user: 'juan.perez',
        codigo: 'CLI-4004',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4004', tipo: 'AHORRO', saldo: 6400.00 }
        ]
      },
      {
        id: 15,
        cui: '4000000000005',
        pNombre: 'Marvin',
        sNombre: 'Steven',
        pApellido: 'Ortiz',
        sApellido: 'Valle',
        nombreCompleto: 'Marvin Steven Ortiz Valle',
        tel: '44110005',
        dir: 'Ciudad de Guatemala',
        email: 'marvin.ortiz@correo.com',
        fnac: '1992-12-05',
        tipo: 'CLIENTE_EXTERNO',
        user: 'marvin.ortiz',
        codigo: 'CLI-4005',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4005', tipo: 'AHORRO', saldo: 12000.00 }
        ]
      },
      {
        id: 16,
        cui: '2183728407142',
        pNombre: 'Juan',
        sNombre: 'José',
        pApellido: 'Ramírez',
        sApellido: 'Castillo',
        nombreCompleto: 'Juan José Ramírez Castillo',
        tel: '44110006',
        dir: 'Quetzaltenango',
        email: 'juan.ramirez@correo.com',
        fnac: '1994-03-30',
        tipo: 'CLIENTE_EXTERNO',
        user: 'juan.ramirez',
        codigo: 'CLI-4006',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4006', tipo: 'AHORRO', saldo: 10500.00 }
        ]
      },
      {
        id: 17,
        cui: '4000000000007',
        pNombre: 'Andrea',
        sNombre: 'Carolina',
        pApellido: 'Morales',
        sApellido: 'Soto',
        nombreCompleto: 'Andrea Carolina Morales Soto',
        tel: '44110007',
        dir: 'Escuintla',
        email: 'andrea.morales@correo.com',
        fnac: '1997-11-12',
        tipo: 'CLIENTE_EXTERNO',
        user: 'andrea.morales',
        codigo: 'CLI-4007',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4007', tipo: 'AHORRO', saldo: 5500.00 }
        ]
      },
      {
        id: 18,
        cui: '4000000000008',
        pNombre: 'Luis',
        sNombre: 'Fernando',
        pApellido: 'Gómez',
        sApellido: 'Barillas',
        nombreCompleto: 'Luis Fernando Gómez Barillas',
        tel: '44110008',
        dir: 'Cobán, Alta Verapaz',
        email: 'luis.gomez@correo.com',
        fnac: '1985-07-03',
        tipo: 'CLIENTE_EXTERNO',
        user: 'luis.gomez',
        codigo: 'CLI-4008',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4008', tipo: 'AHORRO', saldo: 14000.00 }
        ]
      },
      {
        id: 19,
        cui: '4000000000009',
        pNombre: 'Karla',
        sNombre: 'Patricia',
        pApellido: 'Juárez',
        sApellido: 'Rivera',
        nombreCompleto: 'Karla Patricia Juárez Rivera',
        tel: '44110009',
        dir: 'Chimaltenango',
        email: 'karla.juarez@correo.com',
        fnac: '1999-05-24',
        tipo: 'CLIENTE_EXTERNO',
        user: 'karla.juarez',
        codigo: 'CLI-4009',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4009', tipo: 'AHORRO', saldo: 6900.00 }
        ]
      },
      {
        id: 20,
        cui: '4000000000010',
        pNombre: 'Héctor',
        sNombre: 'Daniel',
        pApellido: 'Ruiz',
        sApellido: 'Estrada',
        nombreCompleto: 'Héctor Daniel Ruiz Estrada',
        tel: '44110010',
        dir: 'Petén',
        email: 'hector.ruiz@correo.com',
        fnac: '1991-10-15',
        tipo: 'CLIENTE_EXTERNO',
        user: 'hector.ruiz',
        codigo: 'CLI-4010',
        cuentas: [
          { num: 'CTA-BCO-AHORRO-4010', tipo: 'AHORRO', saldo: 8100.00 }
        ]
      }
    ];

    const todosBanco = [...empleadosBanco, ...clientesExternos];

    for (const b of todosBanco) {
      await clientBanco.query(`
        INSERT INTO clientes_banco (
          id_cliente, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          telefono, direccion, email, fecha_nacimiento, tipo_cliente, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVO')
      `, [
        b.id, b.cui, b.pNombre, b.sNombre, b.pApellido, b.sApellido,
        b.tel, b.dir, b.email, b.fnac, b.tipo
      ]);

      await clientBanco.query(`
        INSERT INTO usuarios_banca_en_linea (
          id_cliente, nombre_usuario, codigo_bancario, password_hash, estado
        ) VALUES ($1, $2, $3, $4, 'ACTIVO')
      `, [b.id, b.user, b.codigo, BANCO_PASSWORD_HASH]);

      for (const c of b.cuentas) {
        await clientBanco.query(`
          INSERT INTO cuentas_bancarias (
            id_cliente, numero_cuenta, tipo_cuenta, saldo_disponible, saldo_reserva, estado
          ) VALUES ($1, $2, $3, $4, 0.00, 'ACTIVA')
        `, [b.id, c.num, c.tipo, c.saldo]);
      }
    }

    await clientBanco.query('COMMIT');
    console.log(`✓ banco_db saneado: 20 clientes registrados (10 empleados, 10 externos) con cuentas bancarias.`);


    // =========================================================================
    // 2. SANEAMIENTO DE COOPERATIVA_DB
    // =========================================================================
    console.log('\n--- 2. Depurando y limpiando cooperativa_db ---');
    await clientCoop.query('BEGIN');

    // Limpieza total de asociados, cuentas, movimientos y solicitudes
    console.log('  * Eliminando transacciones, beneficiarios y cuentas de asociados...');
    await clientCoop.query('DELETE FROM transacciones;');
    await clientCoop.query('DELETE FROM beneficiarios;');
    await clientCoop.query('DELETE FROM solicitudes_credito;');
    await clientCoop.query('DELETE FROM solicitudes_traslado_apertura;');
    await clientCoop.query('DELETE FROM solicitudes_afiliacion_agencia;');
    await clientCoop.query('DELETE FROM cuentas;');
    await clientCoop.query('DELETE FROM asociados;');

    // Definición de los 5 usuarios autorizados
    const autorizados = [
      {
        cui: '1000000000001',
        codigo: 'AD-1',
        pNombre: 'Steven',
        sNombre: 'Alejandro',
        pApellido: 'Ortiz',
        sApellido: 'Gómez',
        email: 'admin@cooperativa.com',
        tel: '55110001',
        dir: 'Ciudad de Guatemala',
        fnac: '1995-03-12',
        rolCodigo: 'ADMINISTRADOR',
      },
      {
        cui: '1000000000002',
        codigo: 'AD-2',
        pNombre: 'Lucía',
        sNombre: 'Fernanda',
        pApellido: 'Morales',
        sApellido: 'Castillo',
        email: 'admin.lucia@cooperativa.com',
        tel: '55110002',
        dir: 'Ciudad de Guatemala',
        fnac: '1996-07-25',
        rolCodigo: 'ADMINISTRADOR',
      },
      {
        cui: '6000000000001',
        codigo: 'EJ-1',
        pNombre: 'Carlos',
        sNombre: 'Eduardo',
        pApellido: 'Mendoza',
        sApellido: 'Gómez',
        email: 'ejecutivo@cooperativa.com',
        tel: '55110003',
        dir: 'Ciudad de Guatemala',
        fnac: '1992-11-18',
        rolCodigo: 'EJECUTIVO',
      },
      {
        cui: '2000000000001',
        codigo: 'OP-1',
        pNombre: 'Juan',
        sNombre: 'Carlos',
        pApellido: 'Martínez',
        sApellido: 'Pérez',
        email: 'operador@cooperativa.com',
        tel: '55110004',
        dir: 'Ciudad de Guatemala',
        fnac: '1994-05-14',
        rolCodigo: 'OPERADOR',
      },
      {
        cui: '2000000000002',
        codigo: 'OP-2',
        pNombre: 'María',
        sNombre: 'Elena',
        pApellido: 'Gutiérrez',
        sApellido: 'Castro',
        email: 'operador.maria@cooperativa.com',
        tel: '55110005',
        dir: 'Ciudad de Guatemala',
        fnac: '1997-09-08',
        rolCodigo: 'OPERADOR',
      }
    ];

    const cuisAutorizados = autorizados.map(a => `'${a.cui}'`).join(',');

    // Eliminar historial de usuarios no autorizados
    await clientCoop.query(`
      DELETE FROM historial_estados_usuario 
      WHERE id_usuario_modificado NOT IN (
        SELECT u.id_persona FROM usuarios u
        JOIN personas p ON u.id_persona = p.id_persona
        WHERE p.cui_dpi IN (${cuisAutorizados})
      )
    `);

    // Eliminar usuarios no autorizados
    await clientCoop.query(`
      DELETE FROM usuarios 
      WHERE id_persona NOT IN (
        SELECT id_persona FROM personas WHERE cui_dpi IN (${cuisAutorizados})
      )
    `);

    // Eliminar personas no autorizadas
    await clientCoop.query(`
      DELETE FROM personas WHERE cui_dpi NOT IN (${cuisAutorizados})
    `);

    // Asegurar / actualizar datos exactos de los 5 usuarios autorizados
    for (const a of autorizados) {
      // Upsert persona
      let pRes = await clientCoop.query('SELECT id_persona FROM personas WHERE cui_dpi = $1', [a.cui]);
      let idPersona;
      if (pRes.rows.length === 0) {
        const insP = await clientCoop.query(`
          INSERT INTO personas (
            cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
            telefono, direccion, fecha_nacimiento
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id_persona
        `, [a.cui, a.pNombre, a.sNombre, a.pApellido, a.sApellido, a.tel, a.dir, a.fnac]);
        idPersona = insP.rows[0].id_persona;
      } else {
        idPersona = pRes.rows[0].id_persona;
        await clientCoop.query(`
          UPDATE personas SET
            primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
            telefono = $5, direccion = $6, fecha_nacimiento = $7
          WHERE id_persona = $8
        `, [a.pNombre, a.sNombre, a.pApellido, a.sApellido, a.tel, a.dir, a.fnac, idPersona]);
      }

      // Upsert usuario
      let uRes = await clientCoop.query('SELECT id_persona FROM usuarios WHERE id_persona = $1', [idPersona]);
      if (uRes.rows.length === 0) {
        await clientCoop.query(`
          INSERT INTO usuarios (
            id_persona, id_rol, codigo_corporativo, email, password_hash,
            estado, intentos_fallidos, bloqueado_hasta, sesion_activa_id, mfa_enabled, mfa_secret
          ) VALUES ($1, (SELECT id_rol FROM roles WHERE codigo = $2), $3, $4, $5, 'ACTIVO', 0, NULL, NULL, false, NULL)
        `, [idPersona, a.rolCodigo, a.codigo, a.email, COOP_PASSWORD_HASH]);
      } else {
        await clientCoop.query(`
          UPDATE usuarios SET
            id_rol = (SELECT id_rol FROM roles WHERE codigo = $1), codigo_corporativo = $2, email = $3, password_hash = $4,
            estado = 'ACTIVO', intentos_fallidos = 0, bloqueado_hasta = NULL, sesion_activa_id = NULL
          WHERE id_persona = $5
        `, [a.rolCodigo, a.codigo, a.email, COOP_PASSWORD_HASH, idPersona]);
      }
    }

    // Reiniciar secuencias de casos para que los nuevos empiecen desde 0001
    await clientCoop.query('ALTER SEQUENCE seq_numero_caso_afiliacion RESTART WITH 1;');
    await clientCoop.query('ALTER SEQUENCE seq_numero_caso_traslado RESTART WITH 1;');

    await clientCoop.query('COMMIT');
    console.log('✓ cooperativa_db saneada: exactamente 2 administradores, 1 ejecutivo, 2 operadores y 0 asociados.');

    console.log('\n================================================================');
    console.log(' ¡SANEAMIENTO Y LIMPIEZA COMPLETADOS EXITOSAMENTE AL 100%!');
    console.log('================================================================\n');

  } catch (error) {
    await clientBanco.query('ROLLBACK').catch(() => {});
    await clientCoop.query('ROLLBACK').catch(() => {});
    console.error('ERROR EN SANEAMIENTO:', error);
    process.exit(1);
  } finally {
    clientBanco.release();
    clientCoop.release();
    await poolBanco.end();
    await poolCoop.end();
  }
}

main();
