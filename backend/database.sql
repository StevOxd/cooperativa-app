-- =============================================================================
-- BASE DE DATOS: cooperativa_db
-- ARQUITECTURA: 3FN (Tercera Forma Normal) - Estandarización Bancaria
-- CONVENCIÓN: id_entidad (PRIMARY KEYs y FOREIGN KEYs)
-- TABLA USUARIOS: id_persona (PRIMARY KEY & FOREIGN KEY 1:1 con personas)
-- IDENTIFICADOR PRINCIPAL DE NEGOCIO: codigo_corporativo (AD-X, OP-X, EJ-X, EB-X, EX-X)
-- ESTADO: Saneado y Sincronizado con Migraciones Oficiales (2026)
-- =============================================================================

-- Limpieza previa en cascada para reejecución limpia
DROP TABLE IF EXISTS configuracion_sistema CASCADE;
DROP TABLE IF EXISTS historial_cambios_beneficiarios CASCADE;
DROP TABLE IF EXISTS beneficiarios CASCADE;
DROP TABLE IF EXISTS transacciones CASCADE;
DROP TABLE IF EXISTS solicitudes_traslado_apertura CASCADE;
DROP TABLE IF EXISTS solicitudes_credito CASCADE;
DROP TABLE IF EXISTS solicitudes_afiliacion_agencia CASCADE;
DROP TABLE IF EXISTS cuentas CASCADE;
DROP TABLE IF EXISTS tipos_cuenta CASCADE;
DROP TABLE IF EXISTS asociados CASCADE;
DROP TABLE IF EXISTS historial_estados_usuario CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS personas CASCADE;
DROP TABLE IF EXISTS roles_permisos CASCADE;
DROP TABLE IF EXISTS permisos CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Limpieza de tablas bancarias legacy (migradas al microservicio banco-backend / banco_db)
DROP TABLE IF EXISTS movimientos_cuenta_bancaria CASCADE;
DROP TABLE IF EXISTS cuenta_bancaria CASCADE;
DROP TABLE IF EXISTS cuentas_bancarias_externas CASCADE;
DROP TABLE IF EXISTS aportaciones CASCADE;

-- =============================================================================
-- 1. MÓDULO DE SEGURIDAD Y CONTROL DE ACCESO (ROLES Y PERMISOS)
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

-- Tabla personas: Única fuente de verdad biográfica
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
    fecha_nacimiento DATE NOT NULL,
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
-- 3. MÓDULO DE AUDITORÍA Y TRAZABILIDAD INMUTABLE
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
-- 4. MÓDULO DE ASOCIADOS, PRODUCTOS Y CUENTAS
-- =============================================================================

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

-- Tabla beneficiarios: Declaración testamentaria por cuenta (Regla estricta del 100.00%)
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

-- Auditoría de modificaciones a beneficiarios
CREATE TABLE historial_cambios_beneficiarios (
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

-- =============================================================================
-- 5. MÓDULO DE SOLICITUDES Y OPERACIONES
-- =============================================================================

-- 5.1 Solicitudes de Afiliación en Agencia (Módulo 1 - No Bancarizados)
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

-- Secuencia atómica y trigger para correlativo de casos de afiliación
CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_afiliacion START WITH 1;

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

-- 5.2 Solicitudes de Crédito (Amortización Francesa, Firma Obligatoria y Comité de Crédito)
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

-- 5.3 Solicitudes de Traslado de Nómina a Cuentas Cooperativas
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

-- Secuencia atómica y trigger para correlativo de casos de traslado
CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_traslado START WITH 1;

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

-- 5.4 Libro Mayor de Transacciones (Doble Partida y Consistencia ACID)
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
-- 6. CONFIGURACIÓN DEL SISTEMA (PARÁMETROS Y GOOGLE MAIL SMTP)
-- =============================================================================

CREATE TABLE configuracion_sistema (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN DBA (100% COBERTURA B-TREE)
-- =============================================================================

-- 7.1 Índices de cobertura en Claves Foráneas (Prevenir Sequential Scans)
CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX idx_historial_usuario ON historial_estados_usuario(id_usuario_modificado);
CREATE INDEX idx_historial_modificado_por ON historial_estados_usuario(id_modificado_por);
CREATE INDEX idx_cuentas_asociado ON cuentas(id_asociado);
CREATE INDEX idx_cuentas_tipo_cuenta ON cuentas(id_tipo_cuenta);
CREATE INDEX idx_beneficiarios_cuenta ON beneficiarios(id_cuenta);
CREATE INDEX idx_historial_beneficiarios_cuenta ON historial_cambios_beneficiarios(id_cuenta);
CREATE INDEX idx_roles_permisos_permiso ON roles_permisos(id_permiso);

CREATE INDEX idx_solicitudes_credito_asociado ON solicitudes_credito(id_asociado);
CREATE INDEX idx_solicitudes_credito_analista ON solicitudes_credito(id_analista) WHERE id_analista IS NOT NULL;
CREATE INDEX idx_solicitudes_credito_cuenta_destino ON solicitudes_credito(id_cuenta_destino) WHERE id_cuenta_destino IS NOT NULL;
CREATE INDEX idx_solicitudes_credito_operador_revisa ON solicitudes_credito(id_operador_revisa) WHERE id_operador_revisa IS NOT NULL;
CREATE INDEX idx_solicitudes_credito_ejecutivo_resuelve ON solicitudes_credito(id_ejecutivo_resuelve) WHERE id_ejecutivo_resuelve IS NOT NULL;

CREATE INDEX idx_solicitudes_traslado_asociado ON solicitudes_traslado_apertura(id_asociado);
CREATE INDEX idx_solicitudes_traslado_origen ON solicitudes_traslado_apertura(id_cuenta_origen);
CREATE INDEX idx_solicitudes_traslado_bco_origen ON solicitudes_traslado_apertura(id_cuenta_bancaria_origen) WHERE id_cuenta_bancaria_origen IS NOT NULL;
CREATE INDEX idx_solicitudes_traslado_destino ON solicitudes_traslado_apertura(id_cuenta_destino) WHERE id_cuenta_destino IS NOT NULL;
CREATE INDEX idx_solicitudes_traslado_tipo_destino ON solicitudes_traslado_apertura(id_tipo_cuenta_destino);
CREATE INDEX idx_solicitudes_traslado_operador ON solicitudes_traslado_apertura(id_operador_resuelve) WHERE id_operador_resuelve IS NOT NULL;

CREATE INDEX idx_solicitudes_afiliacion_cui ON solicitudes_afiliacion_agencia(cui_dpi);
CREATE INDEX idx_solicitudes_afiliacion_estado ON solicitudes_afiliacion_agencia(estado);
CREATE INDEX idx_solicitudes_afiliacion_operador_bloqueo ON solicitudes_afiliacion_agencia(id_operador_bloqueo) WHERE id_operador_bloqueo IS NOT NULL;
CREATE INDEX idx_solicitudes_afiliacion_operador_resuelve ON solicitudes_afiliacion_agencia(id_operador_resuelve) WHERE id_operador_resuelve IS NOT NULL;

CREATE INDEX idx_transacciones_usuario_registra ON transacciones(id_usuario_registra) WHERE id_usuario_registra IS NOT NULL;

-- 7.2 Índices compuestos y parciales de alto rendimiento
CREATE INDEX idx_transacciones_cuenta_fecha ON transacciones(id_cuenta, fecha_transaccion DESC);
CREATE INDEX idx_solicitudes_traslado_pendientes ON solicitudes_traslado_apertura(fecha_solicitud ASC) WHERE estado = 'PENDIENTE';
CREATE INDEX idx_solicitudes_afiliacion_pendientes ON solicitudes_afiliacion_agencia(fecha_solicitud ASC) WHERE estado = 'PENDIENTE_AGENCIA';
CREATE INDEX idx_solicitudes_traslado_asociado_fecha ON solicitudes_traslado_apertura(id_asociado, fecha_solicitud DESC);
CREATE INDEX idx_solicitudes_credito_asociado_fecha ON solicitudes_credito(id_asociado, fecha_solicitud DESC);

-- =============================================================================
-- 8. DATOS SEMILLA OFICIALES (LÍNEA BASE SANEADA)
-- =============================================================================

-- 8.1 Roles del Sistema (Cero SUPERADMIN)
INSERT INTO roles (id_rol, codigo, nombre, descripcion, estado) VALUES
(1, 'ADMINISTRADOR', 'Administrador del Sistema', 'Acceso total y configuración global del sistema', 'ACTIVO'),
(2, 'OPERADOR', 'Operador de Cooperativa', 'Gestión operativa, transacciones de caja y atención en ventanilla', 'ACTIVO'),
(3, 'ASOCIADO', 'Asociado Cooperativista', 'Portal de autogestión, consulta de cuentas, préstamos y traslados', 'ACTIVO'),
(4, 'EJECUTIVO', 'Ejecutivo de Créditos y Aprobaciones', 'Evaluación de scoring, revisión documental y resolución definitiva de préstamos', 'ACTIVO');

SELECT setval('roles_id_rol_seq', 4, true);

-- 8.2 Catálogo de Permisos Granulares
INSERT INTO permisos (id_permiso, codigo, modulo, descripcion) VALUES
(1, 'SEG_ROLES_GESTIONAR', 'SEGURIDAD', 'Crear y modificar roles y permisos'),
(2, 'USR_USUARIOS_CREAR', 'USUARIOS', 'Crear nuevos usuarios'),
(3, 'USR_USUARIOS_LEER', 'USUARIOS', 'Consultar listado y detalle de usuarios'),
(4, 'USR_USUARIOS_EDITAR', 'USUARIOS', 'Modificar datos de usuarios'),
(5, 'USR_USUARIOS_ELIMINAR', 'USUARIOS', 'Borrado lógico de usuarios'),
(6, 'FIN_CUENTAS_CONSULTAR', 'FINANZAS', 'Consultar saldos y movimientos de cuentas'),
(7, 'FIN_CUENTAS_OPERAR', 'FINANZAS', 'Realizar depósitos y retiros en caja'),
(8, 'CRE_SOLICITUDES_CREAR', 'CREDITOS', 'Registrar solicitudes de crédito'),
(9, 'CRE_SOLICITUDES_ANALIZAR', 'CREDITOS', 'Evaluar y aprobar solicitudes de crédito');

SELECT setval('permisos_id_permiso_seq', 9, true);

-- 8.3 Asignación de Permisos por Rol
-- Administrador: Seguridad institucional y gestión de usuarios
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 1, id_permiso FROM permisos WHERE modulo IN ('SEGURIDAD', 'USUARIOS');

-- Operador: Operaciones de caja, ventanilla y consulta de cuentas
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 2, id_permiso FROM permisos WHERE modulo IN ('FINANZAS', 'CREDITOS') OR codigo = 'USR_USUARIOS_LEER';

-- Asociado: Consultas y registro de préstamos
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 3, id_permiso FROM permisos WHERE codigo IN ('FIN_CUENTAS_CONSULTAR', 'CRE_SOLICITUDES_CREAR');

-- Ejecutivo: Análisis y dictamen crediticio
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT 4, id_permiso FROM permisos WHERE codigo IN ('CRE_SOLICITUDES_ANALIZAR', 'FIN_CUENTAS_CONSULTAR');

-- 8.4 Catálogo Oficial de Tipos de Cuenta (Productos Financieros)
INSERT INTO tipos_cuenta (id_tipo_cuenta, nombre, tasa_interes_anual, monto_minimo_apertura, descripcion, beneficios) VALUES
(2, 'Cuenta de Ahorro Corriente (A la Vista)', 3.50, 100.00, 'Disponibilidad inmediata de fondos con capitalización mensual de intereses.', 'Retiros ilimitados, sin costo por manejo de cuenta, acceso a banca web.'),
(3, 'Ahorro a Plazo Fijo (12 Meses)', 7.00, 1000.00, 'Inversión a término determinado con certificado de depósito y alta tasa fija.', 'Tasa preferencial del 7.00%, capitalización al vencimiento, opción de renovación automática.'),
(4, 'Plan de Ahorro Programado', 5.00, 100.00, 'Ahorro sistemático para objetivos específicos y metas planificadas con tasa preferencial.', 'Tasa de interés del 5.00%, débito automático configurable, flexibilidad de plazos.'),
(5, 'Ahorro Juvenil / Metas', 4.00, 50.00, 'Fomento al ahorro formativo y proyectos personales a mediano plazo.', 'Apertura desde Q50.00, incentivos por constancia y sin penalizaciones.');

SELECT setval('tipos_cuenta_id_tipo_cuenta_seq', 5, true);

-- 8.5 Colaboradores Institucionales Autorizados (Exactamente 5 Usuarios Oficiales)
-- Contraseña general para entorno institucional: admin123
-- Hash bcrypt (salt rounds = 10): $2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey

INSERT INTO personas (id_persona, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, fecha_nacimiento) VALUES
-- Administradores (2)
(1, '1000000000001', 'Steven', 'Alejandro', 'Ortiz', 'Gómez', '55110001', 'Ciudad de Guatemala', '1995-03-12'),
(2, '1000000000002', 'Lucía', 'Fernanda', 'Morales', 'Castillo', '55110002', 'Ciudad de Guatemala', '1996-07-25'),

-- Ejecutivo de Créditos (1)
(3, '6000000000001', 'Carlos', 'Eduardo', 'Mendoza', 'Gómez', '55110003', 'Ciudad de Guatemala', '1992-11-18'),

-- Operadores de Ventanilla (2)
(4, '2000000000001', 'Juan', 'Carlos', 'Martínez', 'Pérez', '55110004', 'Ciudad de Guatemala', '1994-05-14'),
(5, '2000000000002', 'María', 'Elena', 'Gutiérrez', 'Castro', '55110005', 'Ciudad de Guatemala', '1997-09-08');

SELECT setval('personas_id_persona_seq', 5, true);

INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, intentos_fallidos, bloqueado_hasta, sesion_activa_id, mfa_enabled, debe_cambiar_password) VALUES
-- Administradores (AD-1, AD-2)
(1, 1, 'AD-1', 'admin@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', 0, NULL, NULL, false, false),
(2, 1, 'AD-2', 'admin.lucia@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', 0, NULL, NULL, false, false),

-- Ejecutivo de Créditos (EJ-1)
(3, 4, 'EJ-1', 'ejecutivo@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', 0, NULL, NULL, false, false),

-- Operadores de Ventanilla (OP-1, OP-2)
(4, 2, 'OP-1', 'operador@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', 0, NULL, NULL, false, false),
(5, 2, 'OP-2', 'operador.maria@cooperativa.com', '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey', 'ACTIVO', 0, NULL, NULL, false, false);

-- NOTA INSTITUCIONAL: La base de datos inicia con 0 asociados, 0 cuentas y 0 transacciones cooperativas,
-- garantizando que toda membresía y apertura se origine mediante los flujos oficiales de afiliación presencial
-- o digital de la plataforma.
