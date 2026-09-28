const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const initBancoDb = async () => {
  const client = await pool.connect();
  try {
    console.log('[BANCO CORE INIT] Inicializando tablas y datos de la Entidad Bancaria...');

    // 1. DDL de Tablas del Core Bancario
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes_banco (
        id_cliente SERIAL PRIMARY KEY,
        cui_dpi VARCHAR(20) UNIQUE NOT NULL,
        primer_nombre VARCHAR(50) NOT NULL,
        segundo_nombre VARCHAR(50),
        primer_apellido VARCHAR(50) NOT NULL,
        segundo_apellido VARCHAR(50),
        nombre_completo VARCHAR(255) GENERATED ALWAYS AS (TRIM(primer_nombre || ' ' || COALESCE(segundo_nombre || ' ', '') || primer_apellido || COALESCE(' ' || segundo_apellido, ''))) STORED,
        telefono VARCHAR(20),
        direccion TEXT,
        email VARCHAR(150),
        fecha_nacimiento DATE,
        tipo_cliente VARCHAR(30) NOT NULL DEFAULT 'CLIENTE_EXTERNO' CHECK (tipo_cliente IN ('EMPLEADO_PLANILLA', 'CLIENTE_EXTERNO')),
        estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')),
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS usuarios_banca_en_linea (
        id_usuario_banca SERIAL PRIMARY KEY,
        id_cliente INT NOT NULL REFERENCES clientes_banco(id_cliente) ON DELETE RESTRICT,
        nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
        codigo_bancario VARCHAR(30) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'INACTIVO')),
        intentos_fallidos INT DEFAULT 0,
        ultimo_acceso TIMESTAMP WITH TIME ZONE,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cuentas_bancarias (
        id_cuenta_bancaria SERIAL PRIMARY KEY,
        id_cliente INT NOT NULL REFERENCES clientes_banco(id_cliente) ON DELETE RESTRICT,
        numero_cuenta VARCHAR(30) UNIQUE NOT NULL,
        tipo_cuenta VARCHAR(20) NOT NULL DEFAULT 'AHORRO' CHECK (tipo_cuenta IN ('AHORRO', 'MONETARIA')),
        saldo_disponible NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (saldo_disponible >= 0),
        saldo_reserva NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (saldo_reserva >= 0),
        estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'BLOQUEADA', 'CANCELADA')),
        fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS movimientos_bancarios (
        id_movimiento SERIAL PRIMARY KEY,
        id_cuenta_bancaria INT NOT NULL REFERENCES cuentas_bancarias(id_cuenta_bancaria) ON DELETE RESTRICT,
        tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('DEBITO', 'CREDITO')),
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        saldo_anterior NUMERIC(14, 2) NOT NULL,
        saldo_posterior NUMERIC(14, 2) NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        referencia VARCHAR(50),
        fecha_movimiento TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Saneamiento DBA: Eliminar indices redundantes sobre columnas ya UNIQUE
      DROP INDEX IF EXISTS idx_clientes_banco_cui;
      DROP INDEX IF EXISTS idx_cuentas_banco_numero;

      -- Cobertura de claves foraneas y cartolas de movimientos
      CREATE INDEX IF NOT EXISTS idx_usuarios_banca_cliente ON usuarios_banca_en_linea(id_cliente);
      CREATE INDEX IF NOT EXISTS idx_usuarios_banca_login ON usuarios_banca_en_linea(nombre_usuario, codigo_bancario);
      CREATE INDEX IF NOT EXISTS idx_cuentas_banco_cliente ON cuentas_bancarias(id_cliente);
      CREATE INDEX IF NOT EXISTS idx_movimientos_banco_cuenta ON movimientos_bancarios(id_cuenta_bancaria, fecha_movimiento DESC);
    `);

    // 2. Hash bcrypt estándar para las contraseñas bancarias ("Banco123!")
    const defaultPasswordHash = await bcrypt.hash('Banco123!', 10);

    // 3. Semilla de Clientes Bancarios
    const clientesSeed = [
      // Colaboradores de Nómina
      { cui: '6000000000001', pNom: 'Carlos', sNom: 'Eduardo', pApe: 'Mendoza', sApe: 'Gómez', tel: '44445555', dir: 'Zona 10, Ciudad de Guatemala', email: 'ejecutivo@cooperativa.com', nac: '1985-05-15', tipo: 'EMPLEADO_PLANILLA', user: 'carlos.mendoza', cod: 'CLI-101', numMonet: 'CTA-BCO-MONET-6001', monetario: 9500.00, numAhorro: null, ahorro: null },
      { cui: '1000000000001', pNom: 'Steven', sNom: 'Alejandro', pApe: 'Ortiz', sApe: 'Gómez', tel: '55110001', dir: 'Zona 10, Ciudad de Guatemala', email: 'admin@cooperativa.com', nac: '1990-03-15', tipo: 'EMPLEADO_PLANILLA', user: 'steven.ortiz', cod: 'CLI-102', numMonet: 'CTA-BCO-MONET-1001', monetario: 8500.00, numAhorro: 'CTA-BCO-AHORRO-1001', ahorro: 7500.00 },
      { cui: '1000000000002', pNom: 'Lucía', sNom: 'Fernanda', pApe: 'Morales', sApe: 'Castillo', tel: '55110002', dir: 'Zona 14, Ciudad de Guatemala', email: 'admin.lucia@cooperativa.com', nac: '1988-07-22', tipo: 'EMPLEADO_PLANILLA', user: 'lucia.morales', cod: 'CLI-103', numMonet: 'CTA-BCO-MONET-1002', monetario: 7200.00, numAhorro: null, ahorro: null },
      { cui: '1000000000003', pNom: 'Fernando', sNom: 'José', pApe: 'Herrera', sApe: 'Ríos', tel: '55110003', dir: 'Zona 15, Ciudad de Guatemala', email: 'admin.fernando@cooperativa.com', nac: '1985-11-05', tipo: 'EMPLEADO_PLANILLA', user: 'fernando.herrera', cod: 'CLI-104', numMonet: 'CTA-BCO-MONET-1003', monetario: 6800.00, numAhorro: null, ahorro: null },
      { cui: '1000000000004', pNom: 'Valeria', sNom: 'Sofía', pApe: 'Méndez', sApe: 'Alvarado', tel: '55110004', dir: 'Zona 16, Ciudad de Guatemala', email: 'admin.valeria@cooperativa.com', nac: '1992-04-18', tipo: 'EMPLEADO_PLANILLA', user: 'valeria.mendez', cod: 'CLI-105', numMonet: 'CTA-BCO-MONET-1004', monetario: 7500.00, numAhorro: null, ahorro: null },
      { cui: '1000000000005', pNom: 'Rodrigo', sNom: 'Esteban', pApe: 'Sandoval', sApe: 'Paz', tel: '55110005', dir: 'Carretera a El Salvador, Km 14', email: 'admin.rodrigo@cooperativa.com', nac: '1987-09-30', tipo: 'EMPLEADO_PLANILLA', user: 'rodrigo.sandoval', cod: 'CLI-106', numMonet: 'CTA-BCO-MONET-1005', monetario: 8200.00, numAhorro: null, ahorro: null },
      
      { cui: '2000000000001', pNom: 'Juan', sNom: 'Carlos', pApe: 'Martínez', sApe: 'Pérez', tel: '55220001', dir: 'Zona 1, Ciudad de Guatemala', email: 'operador@cooperativa.com', nac: '1993-01-12', tipo: 'EMPLEADO_PLANILLA', user: 'juan.martinez', cod: 'CLI-201', numMonet: 'CTA-BCO-MONET-2001', monetario: 5500.00, numAhorro: 'CTA-BCO-AHORRO-2001', ahorro: 4500.00 },
      { cui: '2000000000002', pNom: 'María', sNom: 'Elena', pApe: 'Gutiérrez', sApe: 'Castro', tel: '55220002', dir: 'Zona 7, Mixco', email: 'operador.maria@cooperativa.com', nac: '1995-06-25', tipo: 'EMPLEADO_PLANILLA', user: 'maria.gutierrez', cod: 'CLI-202', numMonet: 'CTA-BCO-MONET-2002', monetario: 4800.00, numAhorro: null, ahorro: null },
      { cui: '2000000000003', pNom: 'Pedro', sNom: 'Antonio', pApe: 'Ramírez', sApe: 'Solís', tel: '55220003', dir: 'Zona 11, Ciudad de Guatemala', email: 'operador.pedro@cooperativa.com', nac: '1991-10-14', tipo: 'EMPLEADO_PLANILLA', user: 'pedro.ramirez', cod: 'CLI-203', numMonet: 'CTA-BCO-MONET-2003', monetario: 5100.00, numAhorro: null, ahorro: null },
      { cui: '2000000000004', pNom: 'Ana', sNom: 'Patricia', pApe: 'Vásquez', sApe: 'Cruz', tel: '55220004', dir: 'Zona 12, Villa Nueva', email: 'operador.ana@cooperativa.com', nac: '1994-02-28', tipo: 'EMPLEADO_PLANILLA', user: 'ana.vasquez', cod: 'CLI-204', numMonet: 'CTA-BCO-MONET-2004', monetario: 4900.00, numAhorro: null, ahorro: null },
      { cui: '2000000000005', pNom: 'Diego', sNom: 'Armando', pApe: 'Flores', sApe: 'Lima', tel: '55220005', dir: 'San Cristóbal, Mixco', email: 'operador.diego@cooperativa.com', nac: '1996-08-09', tipo: 'EMPLEADO_PLANILLA', user: 'diego.flores', cod: 'CLI-205', numMonet: 'CTA-BCO-MONET-2005', monetario: 4700.00, numAhorro: null, ahorro: null },

      // Clientes Externos Particulares (No Colaboradores)
      { cui: '4000000000005', pNom: 'Marvin', sNom: 'Steven', pApe: 'Ortiz', sApe: 'Valle', tel: '55555555', dir: 'Zona 10, Ciudad de Guatemala', email: 'ortiz20marvin@gmail.com', nac: '1999-05-31', tipo: 'CLIENTE_EXTERNO', user: 'marvin.ortiz', cod: 'CLI-4005', numMonet: 'CTA-BCO-MONET-0069418', monetario: 25000.00, numAhorro: 'CTA-BCO-AHORRO-0069417', ahorro: 15000.00 },
      { cui: '1010101010101', pNom: 'Steven', sNom: 'Alejandro', pApe: 'Steven', sApe: 'Castillo', tel: '0101001010', dir: 'Ciudad de Guatemala', email: 'ortiz201marvin@gmail.com', nac: '1995-01-01', tipo: 'CLIENTE_EXTERNO', user: 'steven.steven', cod: 'CLI-4003', numMonet: 'CTA-BCO-MONET-0080361', monetario: 18000.00, numAhorro: 'CTA-BCO-AHORRO-0080360', ahorro: 12500.00 },
      { cui: '8888777766665', pNom: 'Juan', sNom: 'Carlos', pApe: 'Perez', sApe: 'Gomez', tel: '55667788', dir: 'Ciudad de Guatemala', email: 'carlos.valido@correo.com', nac: '1990-02-02', tipo: 'CLIENTE_EXTERNO', user: 'juan.perez', cod: 'CLI-4004', numMonet: 'CTA-BCO-MONET-8881', monetario: 14000.00, numAhorro: 'CTA-BCO-AHORRO-8881', ahorro: 8000.00 },
      { cui: '2183728407142', pNom: 'Juan', sNom: 'José', pApe: 'Ramírez', sApe: 'Castillo', tel: '55551234', dir: 'Ciudad de Guatemala', email: 'juan.ramirez@correo.com', nac: '1995-03-10', tipo: 'CLIENTE_EXTERNO', user: 'juan.ramirez', cod: 'CLI-4006', numMonet: 'CTA-BCO-MONET-2181', monetario: 11000.00, numAhorro: 'CTA-BCO-AHORRO-2181', ahorro: 7000.00 },
      { cui: '4000000000001', pNom: 'Marcos', sNom: 'Vinicio', pApe: 'Castillo', sApe: 'Mendoza', tel: '55440001', dir: 'Zona 10, Ciudad de Guatemala', email: 'marcos.castillo@correo.com', nac: '1992-06-14', tipo: 'CLIENTE_EXTERNO', user: 'marcos.castillo', cod: 'CLI-4001', numMonet: null, monetario: null, numAhorro: 'CTA-BCO-AHORRO-4001', ahorro: 5000.00 },
      { cui: '4000000000002', pNom: 'Sofía', sNom: 'Alejandra', pApe: 'Reyes', sApe: 'Pineda', tel: '55440002', dir: 'Zona 14, Ciudad de Guatemala', email: 'sofia.reyes@correo.com', nac: '1995-09-20', tipo: 'CLIENTE_EXTERNO', user: 'sofia.reyes', cod: 'CLI-4002', numMonet: null, monetario: null, numAhorro: 'CTA-BCO-AHORRO-4002', ahorro: 3200.00 },
    ];

    for (const c of clientesSeed) {
      // Insertar o recuperar cliente
      const clienteRes = await client.query(`
        INSERT INTO clientes_banco (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, email, fecha_nacimiento, tipo_cliente)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (cui_dpi) DO UPDATE SET
          telefono = EXCLUDED.telefono,
          direccion = EXCLUDED.direccion,
          email = EXCLUDED.email,
          tipo_cliente = EXCLUDED.tipo_cliente
        RETURNING id_cliente;
      `, [c.cui, c.pNom, c.sNom, c.pApe, c.sApe, c.tel, c.dir, c.email, c.nac, c.tipo]);

      const idCliente = clienteRes.rows[0].id_cliente;

      // Insertar o actualizar credenciales de banca en línea
      await client.query(`
        INSERT INTO usuarios_banca_en_linea (id_cliente, nombre_usuario, codigo_bancario, password_hash, estado)
        VALUES ($1, $2, $3, $4, 'ACTIVO')
        ON CONFLICT (nombre_usuario) DO UPDATE SET
          codigo_bancario = EXCLUDED.codigo_bancario,
          password_hash = EXCLUDED.password_hash,
          estado = 'ACTIVO';
      `, [idCliente, c.user, c.cod, defaultPasswordHash]);

      // Insertar cuenta Monetaria si aplica
      if (c.monetario !== null && c.numMonet) {
        await client.query(`
          INSERT INTO cuentas_bancarias (id_cliente, numero_cuenta, tipo_cuenta, saldo_disponible, estado)
          VALUES ($1, $2, 'MONETARIA', $3, 'ACTIVA')
          ON CONFLICT (numero_cuenta) DO UPDATE SET
            saldo_disponible = EXCLUDED.saldo_disponible,
            estado = 'ACTIVA';
        `, [idCliente, c.numMonet, c.monetario]);
      }

      // Insertar cuenta de Ahorro si aplica
      if (c.ahorro !== null && c.numAhorro) {
        await client.query(`
          INSERT INTO cuentas_bancarias (id_cliente, numero_cuenta, tipo_cuenta, saldo_disponible, estado)
          VALUES ($1, $2, 'AHORRO', $3, 'ACTIVA')
          ON CONFLICT (numero_cuenta) DO UPDATE SET
            saldo_disponible = EXCLUDED.saldo_disponible,
            estado = 'ACTIVA';
        `, [idCliente, c.numAhorro, c.ahorro]);
      }
    }

    console.log('[BANCO CORE INIT] Esquema y datos semilla del Banco inicializados con éxito.');
    return true;
  } catch (error) {
    console.error('[BANCO CORE INIT ERROR] Error al inicializar banco_db:', error);
    return false;
  } finally {
    client.release();
  }
};

module.exports = { initBancoDb };
