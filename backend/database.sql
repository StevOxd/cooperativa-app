-- =============================================================================
-- BASE DE DATOS: cooperativa_db
-- ARQUITECTURA: 3FN (Tercera Forma Normal) - Estandarización de Identificadores
-- CONVENCIÓN: id_entidad (PRIMARY KEYs y FOREIGN KEYs)
-- TABLA USUARIOS: id_persona (PRIMARY KEY & FOREIGN KEY 1:1 con personas)
-- IDENTIFICADOR PRINCIPAL DE NEGOCIO: codigo_corporativo (4 dígitos)
-- =============================================================================

-- Limpieza previa en cascada para reejecución limpia en TablePlus / psql
DROP TABLE IF EXISTS beneficiarios CASCADE;
DROP TABLE IF EXISTS transacciones CASCADE;
DROP TABLE IF EXISTS solicitudes_traslado_apertura CASCADE;
DROP TABLE IF EXISTS aportaciones CASCADE;
DROP TABLE IF EXISTS solicitudes_credito CASCADE;
DROP TABLE IF EXISTS cuentas CASCADE;
DROP TABLE IF EXISTS tipos_cuenta CASCADE;
DROP TABLE IF EXISTS asociados CASCADE;
DROP TABLE IF EXISTS movimientos_cuenta_bancaria CASCADE;
DROP TABLE IF EXISTS cuenta_bancaria CASCADE;
DROP TABLE IF EXISTS cuentas_bancarias_externas CASCADE;
DROP TABLE IF EXISTS historial_estados_usuario CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS personas CASCADE;
DROP TABLE IF EXISTS roles_permisos CASCADE;
DROP TABLE IF EXISTS permisos CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- =============================================================================
-- 1. MÓDULO DE SEGURIDAD Y CONTROL DE ACCESO (ROLES Y PERMISOS)
-- =============================================================================
-- NOTA DE ARQUITECTURA: La autorización operativa del sistema se gestiona de forma
-- estricta y canónica mediante roles.codigo (ADMINISTRADOR, OPERADOR, ASOCIADO) en
-- los middlewares del backend. Las tablas permisos y roles_permisos se definen como
-- catálogo extensible para soporte de permisos granulares a nivel de acción futura.

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
    nombre_completo VARCHAR(255) GENERATED ALWAYS AS (TRIM(primer_nombre || ' ' || COALESCE(segundo_nombre || ' ', '') || primer_apellido || COALESCE(' ' || segundo_apellido, ''))) STORED,
    telefono VARCHAR(20),
    direccion TEXT,
    fecha_nacimiento DATE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla usuarios: id_persona es simultáneamente PRIMARY KEY y FOREIGN KEY (Relación 1:1)
CREATE TABLE usuarios (
    id_persona INT PRIMARY KEY REFERENCES personas(id_persona) ON DELETE CASCADE,
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
    codigo_corporativo VARCHAR(30) UNIQUE NOT NULL CHECK (codigo_corporativo ~ '^[A-Za-z0-9_.-]{3,30}$'),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')),
    intentos_fallidos INT DEFAULT 0,
    bloqueado_hasta TIMESTAMP WITH TIME ZONE NULL,
    sesion_activa_id VARCHAR(255) NULL,
    ultimo_ping TIMESTAMP WITH TIME ZONE NULL,
    ultimo_acceso TIMESTAMP WITH TIME ZONE,
    mfa_secret VARCHAR(64) NULL,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_qr_url TEXT NULL,
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. MÓDULO DE AUDITORÍA Y TRAZABILIDAD
-- =============================================================================

CREATE TABLE historial_estados_usuario (
    id_historial_estado SERIAL PRIMARY KEY,
    id_usuario_modificado INT NOT NULL REFERENCES usuarios(id_persona) ON DELETE RESTRICT ON UPDATE CASCADE,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    id_rol_anterior INT REFERENCES roles(id_rol),
    id_rol_nuevo INT REFERENCES roles(id_rol),
    id_modificado_por INT REFERENCES usuarios(id_persona),
    motivo TEXT,
    ip_origen VARCHAR(45),
    user_agent TEXT,
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
    estado_asociado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado_asociado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'BLOQUEADO'))
);

CREATE TABLE tipos_cuenta (
    id_tipo_cuenta SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tasa_interes_anual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    monto_minimo_apertura NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    descripcion TEXT,
    beneficios TEXT
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

-- Tabla beneficiarios: Registro y declaración porcentual por cuenta (Regla 100%)
CREATE TABLE beneficiarios (
    id_beneficiario SERIAL PRIMARY KEY,
    id_cuenta INT NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
    nombre_completo VARCHAR(150) NOT NULL,
    parentesco VARCHAR(100) NOT NULL,
    cui_dpi VARCHAR(50),
    telefono VARCHAR(50),
    porcentaje NUMERIC(5, 2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla historial_cambios_beneficiarios: Auditoría de cambios de beneficiarios
CREATE TABLE IF NOT EXISTS historial_cambios_beneficiarios (
    id_historial SERIAL PRIMARY KEY,
    id_cuenta INT NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
    id_usuario INT REFERENCES usuarios(id_persona) ON DELETE SET NULL,
    nombre_usuario VARCHAR(150),
    rol_usuario VARCHAR(50),
    beneficiarios_anteriores JSONB,
    beneficiarios_nuevos JSONB,
    motivo VARCHAR(255) DEFAULT 'Actualización de beneficiarios',
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historial_beneficiarios_cuenta ON historial_cambios_beneficiarios(id_cuenta);



-- Solicitudes de Afiliación en Agencia para personas sin cuenta bancaria previa
CREATE TABLE solicitudes_afiliacion_agencia (
    id_solicitud SERIAL PRIMARY KEY,
    numero_caso VARCHAR(30) UNIQUE NOT NULL,
    cui_dpi VARCHAR(20) NOT NULL,
    primer_nombre VARCHAR(50) NOT NULL,
    segundo_nombre VARCHAR(50),
    primer_apellido VARCHAR(50) NOT NULL,
    segundo_apellido VARCHAR(50),
    telefono VARCHAR(20),
    direccion TEXT,
    fecha_nacimiento DATE NOT NULL,
    email VARCHAR(150),
    monto_estimado NUMERIC(14, 2) DEFAULT 100.00,
    estado VARCHAR(25) NOT NULL DEFAULT 'PENDIENTE_AGENCIA' CHECK (estado IN ('PENDIENTE_AGENCIA', 'ATENDIDA', 'CANCELADA', 'EXPIRADA')),
    observaciones TEXT,
    id_operador_bloqueo INT REFERENCES usuarios(id_persona) ON DELETE SET NULL,
    fecha_bloqueo TIMESTAMP WITH TIME ZONE,
    id_operador_resuelve INT REFERENCES usuarios(id_persona) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMP WITH TIME ZONE,
    numero_cuenta_bancaria VARCHAR(50),
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Secuencia atómica y trigger para correlativo de casos de afiliación (Previene condiciones de carrera)
CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_afiliacion START WITH 1001;

CREATE OR REPLACE FUNCTION trg_generar_numero_caso_afiliacion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_caso IS NULL OR NEW.numero_caso = '' THEN
        NEW.numero_caso := 'CASO-AFIL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('seq_numero_caso_afiliacion')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_numero_caso_afiliacion ON solicitudes_afiliacion_agencia;
CREATE TRIGGER trg_set_numero_caso_afiliacion
    BEFORE INSERT ON solicitudes_afiliacion_agencia
    FOR EACH ROW
    EXECUTE FUNCTION trg_generar_numero_caso_afiliacion();

CREATE TABLE solicitudes_credito (
    id_solicitud_credito SERIAL PRIMARY KEY,
    id_asociado INT NOT NULL REFERENCES asociados(id_asociado) ON DELETE RESTRICT,
    monto_solicitado NUMERIC(14, 2) NOT NULL CHECK (monto_solicitado > 0),
    plazo_meses INT NOT NULL CHECK (plazo_meses > 0),
    tasa_interes NUMERIC(5, 2) NOT NULL CHECK (tasa_interes >= 0),
    cuota_mensual_estimada NUMERIC(14, 2) NOT NULL CHECK (cuota_mensual_estimada > 0),
    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE_FIRMA' CHECK (estado IN ('PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR', 'APROBADA', 'APROBADO', 'DESEMBOLSADA', 'DENEGADA', 'RECHAZADA', 'RECHAZADO', 'PENDIENTE')),
    id_analista INT REFERENCES usuarios(id_persona),
    id_cuenta_destino INT REFERENCES cuentas(id_cuenta),
    id_cuenta_bancaria_destino INT,
    cuenta_destino_info VARCHAR(120),
    documento_firmado_url VARCHAR(500),
    nombre_archivo_firmado VARCHAR(255),
    peso_archivo_bytes BIGINT,
    fecha_carga_archivo TIMESTAMP WITH TIME ZONE,
    id_operador_revisa INT REFERENCES usuarios(id_persona),
    fecha_revision_operador TIMESTAMP WITH TIME ZONE,
    dictamen_operador TEXT,
    id_ejecutivo_resuelve INT REFERENCES usuarios(id_persona),
    fecha_resolucion_ejecutivo TIMESTAMP WITH TIME ZONE,
    observaciones_ejecutivo TEXT,
    fecha_resolucion TIMESTAMP WITH TIME ZONE,
    observaciones TEXT,
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE solicitudes_traslado_apertura (
    id_solicitud SERIAL PRIMARY KEY,
    numero_caso VARCHAR(20) UNIQUE NOT NULL,
    id_asociado INT NOT NULL REFERENCES asociados(id_asociado) ON DELETE RESTRICT,
    id_cuenta_origen INT REFERENCES cuentas(id_cuenta) ON DELETE RESTRICT,
    id_cuenta_bancaria_origen INT,
    id_cuenta_destino INT REFERENCES cuentas(id_cuenta) ON DELETE RESTRICT,
    id_tipo_cuenta_destino INT NOT NULL REFERENCES tipos_cuenta(id_tipo_cuenta) ON DELETE RESTRICT,
    monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
    tipo_operacion VARCHAR(30) NOT NULL CHECK (tipo_operacion IN ('TRASLADO_DIRECTO', 'APERTURA_Y_TRASLADO')),
    estado VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    id_operador_resuelve INT REFERENCES usuarios(id_persona) ON DELETE RESTRICT,
    observaciones_operador TEXT,
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_traslado_origen_valido CHECK (id_cuenta_origen IS NOT NULL OR id_cuenta_bancaria_origen IS NOT NULL),
    CONSTRAINT chk_traslado_cuentas_diferentes CHECK (id_cuenta_destino IS NULL OR id_cuenta_origen IS NULL OR id_cuenta_origen <> id_cuenta_destino)
);

-- Secuencia atómica y trigger para correlativo de casos (Previene condiciones de carrera)
CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_traslado START WITH 100;

CREATE OR REPLACE FUNCTION trg_generar_numero_caso()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_caso IS NULL OR NEW.numero_caso = '' THEN
        NEW.numero_caso := 'CASO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('seq_numero_caso_traslado')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_numero_caso ON solicitudes_traslado_apertura;
CREATE TRIGGER trg_set_numero_caso
    BEFORE INSERT ON solicitudes_traslado_apertura
    FOR EACH ROW
    EXECUTE FUNCTION trg_generar_numero_caso();

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
-- 5. ÍNDICES PARA RENDIMIENTO Y BÚSQUEDA RÁPIDA (OPTIMIZADOS SEGÚN AUDITORÍA)
-- =============================================================================
-- NOTA: Los índices para codigo_corporativo, email, cui_dpi, id_persona (asociados)
-- y numero_cuenta se omiten manualmente aquí porque PostgreSQL crea índices B-Tree
-- únicos implícitos de forma automática para todas las restricciones PRIMARY KEY y UNIQUE.

-- 5.1 Índices de cobertura en Claves Foráneas (Prevenir Sequential Scans)
CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX idx_historial_usuario ON historial_estados_usuario(id_usuario_modificado);
CREATE INDEX idx_historial_modificado_por ON historial_estados_usuario(id_modificado_por);
CREATE INDEX idx_cuentas_asociado ON cuentas(id_asociado);
CREATE INDEX idx_cuentas_tipo_cuenta ON cuentas(id_tipo_cuenta);
CREATE INDEX idx_solicitudes_credito_asociado ON solicitudes_credito(id_asociado);
CREATE INDEX idx_solicitudes_credito_analista ON solicitudes_credito(id_analista) WHERE id_analista IS NOT NULL;
CREATE INDEX idx_solicitudes_traslado_asociado ON solicitudes_traslado_apertura(id_asociado);
CREATE INDEX idx_solicitudes_traslado_origen ON solicitudes_traslado_apertura(id_cuenta_origen);
CREATE INDEX idx_solicitudes_traslado_destino ON solicitudes_traslado_apertura(id_cuenta_destino) WHERE id_cuenta_destino IS NOT NULL;
CREATE INDEX idx_solicitudes_traslado_tipo_destino ON solicitudes_traslado_apertura(id_tipo_cuenta_destino);
CREATE INDEX idx_solicitudes_traslado_operador ON solicitudes_traslado_apertura(id_operador_resuelve) WHERE id_operador_resuelve IS NOT NULL;
CREATE INDEX idx_transacciones_usuario_registra ON transacciones(id_usuario_registra) WHERE id_usuario_registra IS NOT NULL;
CREATE INDEX idx_roles_permisos_permiso ON roles_permisos(id_permiso);
CREATE INDEX idx_beneficiarios_cuenta ON beneficiarios(id_cuenta);
CREATE INDEX idx_solicitudes_credito_cuenta_destino ON solicitudes_credito(id_cuenta_destino) WHERE id_cuenta_destino IS NOT NULL;
CREATE INDEX idx_solicitudes_credito_operador_revisa ON solicitudes_credito(id_operador_revisa) WHERE id_operador_revisa IS NOT NULL;
CREATE INDEX idx_solicitudes_credito_ejecutivo_resuelve ON solicitudes_credito(id_ejecutivo_resuelve) WHERE id_ejecutivo_resuelve IS NOT NULL;
CREATE INDEX idx_solicitudes_afiliacion_cui ON solicitudes_afiliacion_agencia(cui_dpi);
CREATE INDEX idx_solicitudes_afiliacion_estado ON solicitudes_afiliacion_agencia(estado);
CREATE INDEX idx_solicitudes_afiliacion_operador_bloqueo ON solicitudes_afiliacion_agencia(id_operador_bloqueo) WHERE id_operador_bloqueo IS NOT NULL;
CREATE INDEX idx_solicitudes_afiliacion_operador_resuelve ON solicitudes_afiliacion_agencia(id_operador_resuelve) WHERE id_operador_resuelve IS NOT NULL;

-- 5.2 Índices compuestos y parciales de alto rendimiento
CREATE INDEX idx_transacciones_cuenta_fecha ON transacciones(id_cuenta, fecha_transaccion DESC);
CREATE INDEX idx_solicitudes_traslado_pendientes ON solicitudes_traslado_apertura(fecha_solicitud ASC) WHERE estado = 'PENDIENTE';
CREATE INDEX idx_solicitudes_afiliacion_pendientes ON solicitudes_afiliacion_agencia(fecha_solicitud ASC) WHERE estado = 'PENDIENTE_AGENCIA';
CREATE INDEX idx_solicitudes_traslado_asociado_fecha ON solicitudes_traslado_apertura(id_asociado, fecha_solicitud DESC);
CREATE INDEX idx_solicitudes_credito_asociado_fecha ON solicitudes_credito(id_asociado, fecha_solicitud DESC);

-- =============================================================================
-- 6. DATOS SEMILLA (SEED DATA)
-- =============================================================================

-- 6.1 Insertar Roles
INSERT INTO roles (id_rol, codigo, nombre, descripcion, estado) VALUES
(1, 'ADMINISTRADOR', 'Administrador del Sistema', 'Acceso total y configuración global del sistema', 'ACTIVO'),
(2, 'OPERADOR', 'Operador de Cooperativa', 'Gestión operativa, transacciones de caja y atención', 'ACTIVO'),
(3, 'ASOCIADO', 'Asociado Cooperativista', 'Consultas de cuentas, préstamos y aportaciones', 'ACTIVO'),
(4, 'EJECUTIVO', 'Ejecutivo de Créditos y Aprobaciones', 'Autorización final, devolución a operador y resolución definitiva de solicitudes crediticias', 'ACTIVO');

SELECT setval('roles_id_rol_seq', 4, true);

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
-- Administrador: Permisos exclusivos de gestión de usuarios y seguridad institucional
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 1, id_permiso FROM permisos WHERE modulo IN ('SEGURIDAD', 'USUARIOS');

-- Operador: Permisos de lectura de usuarios y operaciones financieras
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 2, id_permiso FROM permisos WHERE modulo IN ('FINANZAS', 'CREDITOS') OR codigo = 'USR_USUARIOS_LEER';

-- Asociado: Consultas básicas
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 3, id_permiso FROM permisos WHERE codigo IN ('FIN_CUENTAS_CONSULTAR', 'CRE_SOLICITUDES_CREAR');

-- 6.4 Insertar Personas (17 Registros)
-- Contraseña en texto plano para usuarios estándar: admin123
-- Hash bcrypt (salt rounds = 10): $2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey
-- Contraseña para steven08: steven
-- Hash bcrypt para steven08: $2a$10$VzSM1tEzgyOc1ZNEa0/Cwu/dTV5wiX/XR97ZBIzeDuEhddRN6orsi

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
(16, '3000000000000', 'Usuario', 'Asociado', 'Inactivo', 'Prueba', '55330000', 'Zona 1, Ciudad de Guatemala', '1995-12-10'),

-- Administradores (id_rol = 1)
(17, '1000000000008', 'Steven', 'Administrador', 'Ortiz', 'García', '55000008', 'Sede Central Corporativa', '1990-01-01');

SELECT setval('personas_id_persona_seq', 17, true);

-- 6.5 Insertar Usuarios (id_persona como PK y FK)
INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, mfa_enabled) VALUES
-- Administradores (id_rol = 1, Prefijo: AD-X)
(1, 1, 'AD-1', 'admin@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(2, 1, 'AD-2', 'admin.lucia@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(3, 1, 'AD-3', 'admin.fernando@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(4, 1, 'AD-4', 'admin.valeria@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(5, 1, 'AD-5', 'admin.rodrigo@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),

-- Operadores (id_rol = 2, Prefijo: OP-X)
(6, 2, 'OP-1', 'operador@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(7, 2, 'OP-2', 'operador.maria@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(8, 2, 'OP-3', 'operador.pedro@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(9, 2, 'OP-4', 'operador.ana@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(10, 2, 'OP-5', 'operador.diego@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),

-- Asociados: Empleados Bancarios (EB-X) y Ajenos/Externos (EX-X)
(11, 3, 'EB-1', 'asociado.carlos@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(12, 3, 'EX-1', 'asociado.claudia@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(13, 3, 'EB-2', 'asociado.mario@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(14, 3, 'EX-2', 'asociado.karen@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(15, 3, 'EX-3', 'asociado.jorge@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', false),
(16, 3, 'EX-4', 'inactivo@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'INACTIVO', false),

-- Administrador Institucional
(17, 1, 'steven08', 'steven08@cooperativa.com', '$2a$10$VzSM1tEzgyOc1ZNEa0/Cwu/dTV5wiX/XR97ZBIzeDuEhddRN6orsi', 'ACTIVO', false);

-- 6.6 Insertar Tipos de Cuenta (Ahorro Cooperativo)
INSERT INTO tipos_cuenta (id_tipo_cuenta, nombre, tasa_interes_anual, monto_minimo_apertura, descripcion, beneficios) VALUES
(2, 'Ahorro a la Vista (Corriente)', 3.00, 50.00, 'Cuenta de ahorro libre con disponibilidad inmediata de sus fondos.', 'Retiros ilimitados, sin costo por manejo de cuenta, acceso a banca web.'),
(3, 'Ahorro a Plazo Fijo (12 Meses)', 8.25, 1000.00, 'Inversión a plazo determinado de 12 meses con rendimiento de alta tasa fija.', 'Tasa preferencial de hasta 8.25%, capitalización al vencimiento, opción de renovación automática.'),
(4, 'Cuenta de Planilla', 1.50, 0.00, 'Cuenta especial receptora del salario patronal mensual con beneficios de traslado.', 'Apertura sin monto mínimo, exenta de cobros operativos, traslado inmediato a subcuentas.'),
(5, 'Ahorro Programado (Metas)', 5.50, 25.00, 'Ahorro programado con aportes mensuales automáticos para cumplir sus metas financieras.', 'Tasa de interés del 5.50%, débito automático configurable, flexibilidad de plazos.');

SELECT setval('tipos_cuenta_id_tipo_cuenta_seq', 5, true);

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
('CTA-APORT-001', 1, 2, 3500.00, 500.00, 'ACTIVA'),
('CTA-AHORR-001', 1, 2, 12500.00, 0.00, 'ACTIVA'),
('CTA-PLAN-001', 1, 4, 15000.00, 0.00, 'ACTIVA'),
('CTA-APORT-002', 2, 2, 2800.00, 500.00, 'ACTIVA'),
('CTA-PLAZO-002', 2, 3, 50000.00, 0.00, 'ACTIVA'),
('CTA-PLAN-002', 2, 4, 12000.00, 0.00, 'ACTIVA'),
('CTA-APORT-003', 3, 2, 4100.00, 500.00, 'ACTIVA'),
('CTA-PLAN-003', 3, 4, 8500.00, 0.00, 'ACTIVA'),
('CTA-APORT-004', 4, 2, 1500.00, 500.00, 'ACTIVA'),
('CTA-PLAN-004', 4, 4, 11000.00, 0.00, 'ACTIVA'),
('CTA-APORT-005', 5, 2, 6200.00, 500.00, 'ACTIVA'),
('CTA-PLAN-005', 5, 4, 9500.00, 0.00, 'ACTIVA');


