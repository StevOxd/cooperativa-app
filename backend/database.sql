-- =============================================================================
-- BASE DE DATOS: cooperativa_db
-- ARQUITECTURA: 3FN (Tercera Forma Normal) - Estandarización de Identificadores
-- CONVENCIÓN: id_entidad (PRIMARY KEYs y FOREIGN KEYs)
-- TABLA USUARIOS: id_persona (PRIMARY KEY & FOREIGN KEY 1:1 con personas)
-- IDENTIFICADOR PRINCIPAL DE NEGOCIO: codigo_corporativo (4 dígitos)
-- =============================================================================

-- Limpieza previa en cascada para reejecución limpia en TablePlus / psql
DROP TABLE IF EXISTS transacciones CASCADE;
DROP TABLE IF EXISTS solicitudes_credito CASCADE;
DROP TABLE IF EXISTS cuentas CASCADE;
DROP TABLE IF EXISTS tipos_cuenta CASCADE;
DROP TABLE IF EXISTS asociados CASCADE;
DROP TABLE IF EXISTS historial_estados_usuario CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS personas CASCADE;
DROP TABLE IF EXISTS roles_permisos CASCADE;
DROP TABLE IF EXISTS permisos CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- =============================================================================
-- 1. MÓDULO DE SEGURIDAD Y CONTROL DE ACCESO (RBAC DINÁMICO)
-- =============================================================================

CREATE TABLE roles (
    id_rol SERIAL PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO'))
);

CREATE TABLE permisos (
    id_permiso SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    descripcion TEXT
);

CREATE TABLE roles_permisos (
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
    id_permiso INT NOT NULL REFERENCES permisos(id_permiso) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, id_permiso)
);

-- =============================================================================
-- 2. MÓDULO DE IDENTIDADES (PERSONAS Y CUENTAS DE USUARIO)
-- =============================================================================

-- Tabla personas: Única fuente de verdad de datos personales y biométricos
CREATE TABLE personas (
    id_persona SERIAL PRIMARY KEY,
    cui_dpi VARCHAR(20) UNIQUE NOT NULL,
    primer_nombre VARCHAR(50) NOT NULL,
    segundo_nombre VARCHAR(50),
    primer_apellido VARCHAR(50) NOT NULL,
    segundo_apellido VARCHAR(50),
    telefono VARCHAR(20),
    direccion TEXT,
    fecha_nacimiento DATE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla usuarios: id_persona es simultáneamente PRIMARY KEY y FOREIGN KEY (Relación 1:1)
CREATE TABLE usuarios (
    id_persona INT PRIMARY KEY REFERENCES personas(id_persona) ON DELETE CASCADE,
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
    codigo_corporativo VARCHAR(10) UNIQUE NOT NULL CHECK (codigo_corporativo ~ '^[0-9]{4}$'),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
    ultimo_acceso TIMESTAMP WITH TIME ZONE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. MÓDULO DE AUDITORÍA Y TRAZABILIDAD
-- =============================================================================

CREATE TABLE historial_estados_usuario (
    id_historial_estado SERIAL PRIMARY KEY,
    id_usuario_modificado INT NOT NULL REFERENCES usuarios(id_persona) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    id_rol_anterior INT REFERENCES roles(id_rol),
    id_rol_nuevo INT REFERENCES roles(id_rol),
    id_modificado_por INT REFERENCES usuarios(id_persona),
    motivo TEXT,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 4. MÓDULO DE ASOCIADOS Y FINANZAS
-- =============================================================================

-- Tabla asociados: Vinculada directamente a la persona mediante id_persona
CREATE TABLE asociados (
    id_asociado SERIAL PRIMARY KEY,
    id_persona INT UNIQUE NOT NULL REFERENCES personas(id_persona) ON DELETE RESTRICT,
    fecha_ingreso DATE DEFAULT CURRENT_DATE,
    estado_asociado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado_asociado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO'))
);

CREATE TABLE tipos_cuenta (
    id_tipo_cuenta SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tasa_interes_anual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    monto_minimo_apertura NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

CREATE TABLE cuentas (
    id_cuenta SERIAL PRIMARY KEY,
    numero_cuenta VARCHAR(30) UNIQUE NOT NULL,
    id_asociado INT NOT NULL REFERENCES asociados(id_asociado) ON DELETE RESTRICT,
    id_tipo_cuenta INT NOT NULL REFERENCES tipos_cuenta(id_tipo_cuenta) ON DELETE RESTRICT,
    saldo_disponible NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (saldo_disponible >= 0),
    saldo_reserva NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (saldo_reserva >= 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'BLOQUEADA', 'CANCELADA')),
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE solicitudes_credito (
    id_solicitud_credito SERIAL PRIMARY KEY,
    id_asociado INT NOT NULL REFERENCES asociados(id_asociado) ON DELETE RESTRICT,
    monto_solicitado NUMERIC(14, 2) NOT NULL CHECK (monto_solicitado > 0),
    plazo_meses INT NOT NULL CHECK (plazo_meses > 0),
    tasa_interes NUMERIC(5, 2) NOT NULL,
    cuota_mensual_estimada NUMERIC(14, 2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_ANALISIS', 'APROBADA', 'RECHAZADA', 'DESEMBOLSADA')),
    id_analista INT REFERENCES usuarios(id_persona),
    observaciones TEXT,
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transacciones (
    id_transaccion SERIAL PRIMARY KEY,
    id_cuenta INT NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE RESTRICT,
    tipo_transaccion VARCHAR(30) NOT NULL CHECK (tipo_transaccion IN ('DEPOSITO', 'RETIRO', 'TRANSFERENCIA', 'PAGO_CREDITO', 'AJUSTE')),
    monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
    saldo_anterior NUMERIC(14, 2) NOT NULL,
    saldo_nuevo NUMERIC(14, 2) NOT NULL,
    referencia VARCHAR(100),
    id_usuario_registra INT REFERENCES usuarios(id_persona),
    fecha_transaccion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 5. ÍNDICES PARA RENDIMIENTO Y BÚSQUEDA RÁPIDA
-- =============================================================================

CREATE INDEX idx_usuarios_codigo_corporativo ON usuarios(codigo_corporativo);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX idx_personas_cui ON personas(cui_dpi);
CREATE INDEX idx_asociados_persona ON asociados(id_persona);
CREATE INDEX idx_cuentas_numero ON cuentas(numero_cuenta);
CREATE INDEX idx_cuentas_asociado ON cuentas(id_asociado);
CREATE INDEX idx_transacciones_cuenta ON transacciones(id_cuenta);
CREATE INDEX idx_transacciones_fecha ON transacciones(fecha_transaccion);
CREATE INDEX idx_historial_usuario ON historial_estados_usuario(id_usuario_modificado);

-- =============================================================================
-- 6. DATOS SEMILLA (SEED DATA)
-- =============================================================================

-- 6.1 Insertar Roles
INSERT INTO roles (id_rol, codigo, nombre, descripcion, estado) VALUES
(1, 'ADMINISTRADOR', 'Administrador del Sistema', 'Acceso total y configuración global del sistema', 'ACTIVO'),
(2, 'OPERADOR', 'Operador de Cooperativa', 'Gestión operativa, transacciones de caja y atención', 'ACTIVO'),
(3, 'ASOCIADO', 'Asociado Cooperativista', 'Consultas de cuentas, préstamos y aportaciones', 'ACTIVO');

SELECT setval('roles_id_rol_seq', 3, true);

-- 6.2 Insertar Permisos
INSERT INTO permisos (id_permiso, codigo, modulo, descripcion) VALUES
(1, 'SEG_ROLES_GESTIONAR', 'SEGURIDAD', 'Crear y modificar roles y permisos'),
(2, 'USR_USUARIOS_CREAR', 'USUARIOS', 'Crear nuevos usuarios'),
(3, 'USR_USUARIOS_LEER', 'USUARIOS', 'Consultar listado y detalle de usuarios'),
(4, 'USR_USUARIOS_EDITAR', 'USUARIOS', 'Modificar datos de usuarios'),
(5, 'USR_USUARIOS_ELIMINAR', 'USUARIOS', 'Borrado lógico de usuarios'),
(6, 'FIN_CUENTAS_CONSULTAR', 'FINANZAS', 'Consultar saldos y movimientos de cuentas'),
(7, 'FIN_CUENTAS_OPERAR', 'FINANZAS', 'Realizar depósitos y retiros'),
(8, 'CRE_SOLICITUDES_CREAR', 'CREDITOS', 'Registrar solicitudes de crédito'),
(9, 'CRE_SOLICITUDES_ANALIZAR', 'CREDITOS', 'Evaluar y aprobar solicitudes de crédito');

SELECT setval('permisos_id_permiso_seq', 9, true);

-- 6.3 Asignar Permisos a Roles
-- Administrador: Todos los permisos
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 1, id_permiso FROM permisos;

-- Operador: Permisos de lectura de usuarios y operaciones financieras
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 2, id_permiso FROM permisos WHERE modulo IN ('FINANZAS', 'CREDITOS') OR codigo = 'USR_USUARIOS_LEER';

-- Asociado: Consultas básicas
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 3, id_permiso FROM permisos WHERE codigo IN ('FIN_CUENTAS_CONSULTAR', 'CRE_SOLICITUDES_CREAR');

-- 6.4 Insertar Personas (16 Registros)
-- Contraseña en texto plano para TODOS los usuarios: admin123
-- Hash bcrypt (salt rounds = 10): $2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey

INSERT INTO personas (id_persona, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, fecha_nacimiento) VALUES
-- Administradores (5)
(1, '1000000000001', 'Steven', 'Alejandro', 'Ortiz', 'Gómez', '55110001', 'Zona 10, Ciudad de Guatemala', '1990-03-15'),
(2, '1000000000002', 'Lucía', 'Fernanda', 'Morales', 'Castillo', '55110002', 'Zona 14, Ciudad de Guatemala', '1988-07-22'),
(3, '1000000000003', 'Fernando', 'José', 'Herrera', 'Ríos', '55110003', 'Zona 15, Ciudad de Guatemala', '1985-11-05'),
(4, '1000000000004', 'Valeria', 'Sofía', 'Méndez', 'Alvarado', '55110004', 'Zona 16, Ciudad de Guatemala', '1992-04-18'),
(5, '1000000000005', 'Rodrigo', 'Esteban', 'Sandoval', 'Paz', '55110005', 'Carretera a El Salvador, Km 14', '1987-09-30'),

-- Operadores (5)
(6, '2000000000001', 'Juan', 'Carlos', 'Martínez', 'Pérez', '55220001', 'Zona 1, Ciudad de Guatemala', '1993-01-12'),
(7, '2000000000002', 'María', 'Elena', 'Gutiérrez', 'Castro', '55220002', 'Zona 7, Mixco', '1995-06-25'),
(8, '2000000000003', 'Pedro', 'Antonio', 'Ramírez', 'Solís', '55220003', 'Zona 11, Ciudad de Guatemala', '1991-10-14'),
(9, '2000000000004', 'Ana', 'Patricia', 'Vásquez', 'Cruz', '55220004', 'Zona 12, Villa Nueva', '1994-02-28'),
(10, '2000000000005', 'Diego', 'Armando', 'Flores', 'Lima', '55220005', 'San Cristóbal, Mixco', '1996-08-09'),

-- Asociados (5 Activos + 1 Inactivo)
(11, '3000000000001', 'Carlos', 'Roberto', 'López', 'Gómez', '55330001', 'Zona 5, Ciudad de Guatemala', '1989-12-03'),
(12, '3000000000002', 'Claudia', 'Marcela', 'Torres', 'Reyes', '55330002', 'Zona 2, Ciudad de Guatemala', '1991-05-19'),
(13, '3000000000003', 'Mario', 'René', 'Estrada', 'Fuentes', '55330003', 'Zona 6, Ciudad de Guatemala', '1984-08-11'),
(14, '3000000000004', 'Karen', 'Paola', 'Aguilar', 'Romero', '55330004', 'Zona 18, Ciudad de Guatemala', '1997-03-24'),
(15, '3000000000005', 'Jorge', 'Luis', 'Guzmán', 'Cifuentes', '55330005', 'Zona 9, Ciudad de Guatemala', '1990-11-17'),
(16, '3000000000000', 'Usuario', 'Asociado', 'Inactivo', 'Prueba', '55330000', 'Zona 1, Ciudad de Guatemala', '1995-12-10');

SELECT setval('personas_id_persona_seq', 16, true);

-- 6.5 Insertar Usuarios (id_persona como PK y FK)
INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado) VALUES
-- Administradores (id_rol = 1, Rango: 1001-1005)
(1, 1, '1001', 'admin@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(2, 1, '1002', 'admin.lucia@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(3, 1, '1003', 'admin.fernando@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(4, 1, '1004', 'admin.valeria@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(5, 1, '1005', 'admin.rodrigo@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),

-- Operadores (id_rol = 2, Rango: 2001-2005)
(6, 2, '2001', 'operador@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(7, 2, '2002', 'operador.maria@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(8, 2, '2003', 'operador.pedro@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(9, 2, '2004', 'operador.ana@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(10, 2, '2005', 'operador.diego@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),

-- Asociados (id_rol = 3, Rango: 3001-3005, 3000)
(11, 3, '3001', 'asociado.carlos@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(12, 3, '3002', 'asociado.claudia@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(13, 3, '3003', 'asociado.mario@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(14, 3, '3004', 'asociado.karen@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(15, 3, '3005', 'asociado.jorge@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO'),
(16, 3, '3000', 'inactivo@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'INACTIVO');

-- 6.6 Insertar Tipos de Cuenta
INSERT INTO tipos_cuenta (id_tipo_cuenta, nombre, tasa_interes_anual, monto_minimo_apertura) VALUES
(1, 'Aportaciones Ordinarias', 6.50, 100.00),
(2, 'Ahorro a la Vista (Corriente)', 3.00, 50.00),
(3, 'Ahorro a Plazo Fijo (12 Meses)', 8.25, 1000.00);

SELECT setval('tipos_cuenta_id_tipo_cuenta_seq', 3, true);

-- 6.7 Insertar Asociados (Membresías)
INSERT INTO asociados (id_asociado, id_persona, fecha_ingreso, estado_asociado) VALUES
(1, 11, '2024-01-10', 'ACTIVO'),
(2, 12, '2024-02-15', 'ACTIVO'),
(3, 13, '2024-05-20', 'ACTIVO'),
(4, 14, '2024-08-05', 'ACTIVO'),
(5, 15, '2024-11-12', 'ACTIVO'),
(6, 16, '2023-12-01', 'INACTIVO');

SELECT setval('asociados_id_asociado_seq', 6, true);

-- 6.8 Insertar Cuentas
INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado) VALUES
('CTA-APORT-001', 1, 1, 3500.00, 500.00, 'ACTIVA'),
('CTA-AHORR-001', 1, 2, 12500.00, 0.00, 'ACTIVA'),
('CTA-APORT-002', 2, 1, 2800.00, 500.00, 'ACTIVA'),
('CTA-PLAZO-002', 2, 3, 50000.00, 0.00, 'ACTIVA'),
('CTA-APORT-003', 3, 1, 4100.00, 500.00, 'ACTIVA'),
('CTA-APORT-004', 4, 1, 1500.00, 500.00, 'ACTIVA'),
('CTA-APORT-005', 5, 1, 6200.00, 500.00, 'ACTIVA');
