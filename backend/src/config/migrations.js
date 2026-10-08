const { pool } = require('./db');

/**
 * Aplica migraciones automáticas e idempotentes para soportar protocolos de seguridad bancaria,
 * optimización de índices, prevención de condiciones de carrera, integridad referencial y columnas generadas.
 *
 * @async
 * @function runMigrations
 * @returns {Promise<boolean>} true si las migraciones concluyeron exitosamente, false si ocurrió un error.
 */
const runMigrations = async () => {
  try {
    console.log('[MIGRATION] Verificando esquema y optimizaciones de base de datos en PostgreSQL...');
    
    // 1. Columnas críticas de seguridad en usuarios y columna generada en personas
    const ddlColumnsQuery = `
      DO $$ 
      BEGIN 
        -- Agregar columna intentos_fallidos si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='intentos_fallidos') THEN
          ALTER TABLE usuarios ADD COLUMN intentos_fallidos INT DEFAULT 0;
        END IF;

        -- Agregar columna bloqueado_hasta si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='bloqueado_hasta') THEN
          ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TIMESTAMP WITH TIME ZONE NULL;
        END IF;

        -- Agregar columna sesion_activa_id si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='sesion_activa_id') THEN
          ALTER TABLE usuarios ADD COLUMN sesion_activa_id VARCHAR(255) NULL;
        END IF;

        -- Agregar columna ultimo_ping si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='ultimo_ping') THEN
          ALTER TABLE usuarios ADD COLUMN ultimo_ping TIMESTAMP WITH TIME ZONE NULL;
        END IF;

        -- Agregar columna debe_cambiar_password si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='debe_cambiar_password') THEN
          ALTER TABLE usuarios ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;

        -- Agregar columna generada nombre_completo en personas si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='personas' AND column_name='nombre_completo') THEN
          ALTER TABLE personas ADD COLUMN nombre_completo VARCHAR(255) 
            GENERATED ALWAYS AS (TRIM(primer_nombre || ' ' || COALESCE(segundo_nombre || ' ', '') || primer_apellido || COALESCE(' ' || segundo_apellido, ''))) STORED;
        END IF;
      END $$;
    `;
    await pool.query(ddlColumnsQuery);

    // 2. Optimización de Índices (Eliminar redundantes y crear índices de cobertura FK y compuestos)
    const indexesQuery = `
      -- Eliminación de índices manuales redundantes (duplicados de constraints UNIQUE)
      DROP INDEX IF EXISTS idx_usuarios_codigo_corporativo;
      DROP INDEX IF EXISTS idx_usuarios_email;
      DROP INDEX IF EXISTS idx_personas_cui;
      DROP INDEX IF EXISTS idx_asociados_persona;
      DROP INDEX IF EXISTS idx_cuentas_numero;

      -- Índices de cobertura para Foreign Keys (Prevenir Seq Scans)
      CREATE INDEX IF NOT EXISTS idx_historial_modificado_por 
          ON historial_estados_usuario(id_modificado_por);

      CREATE INDEX IF NOT EXISTS idx_cuentas_tipo_cuenta 
          ON cuentas(id_tipo_cuenta);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_asociado 
          ON solicitudes_credito(id_asociado);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_analista 
          ON solicitudes_credito(id_analista) 
          WHERE id_analista IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_asociado 
          ON solicitudes_traslado_apertura(id_asociado);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_origen 
          ON solicitudes_traslado_apertura(id_cuenta_origen);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_destino 
          ON solicitudes_traslado_apertura(id_cuenta_destino) 
          WHERE id_cuenta_destino IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_tipo_destino 
          ON solicitudes_traslado_apertura(id_tipo_cuenta_destino);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_operador 
          ON solicitudes_traslado_apertura(id_operador_resuelve) 
          WHERE id_operador_resuelve IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_registra 
          ON transacciones(id_usuario_registra) 
          WHERE id_usuario_registra IS NOT NULL;

      -- Índices compuestos y parciales de alto rendimiento
      DROP INDEX IF EXISTS idx_transacciones_cuenta;
      CREATE INDEX IF NOT EXISTS idx_transacciones_cuenta_fecha 
          ON transacciones(id_cuenta, fecha_transaccion DESC);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_pendientes 
          ON solicitudes_traslado_apertura(fecha_solicitud ASC) 
          WHERE estado = 'PENDIENTE';

      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_asociado_fecha 
          ON solicitudes_traslado_apertura(id_asociado, fecha_solicitud DESC);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_asociado_fecha 
          ON solicitudes_credito(id_asociado, fecha_solicitud DESC);
    `;
    await pool.query(indexesQuery);

    // 3. Constraints financieras, precisión y secuencia/trigger anti-concurrencia
    const constraintsAndTriggersQuery = `
      -- Soportar origen desde cuenta_bancaria y cuentas cooperativas
      ALTER TABLE solicitudes_traslado_apertura ALTER COLUMN id_cuenta_origen DROP NOT NULL;
      ALTER TABLE solicitudes_traslado_apertura DROP CONSTRAINT IF EXISTS solicitudes_traslado_apertura_id_cuenta_bancaria_origen_fkey;
      ALTER TABLE solicitudes_traslado_apertura ADD COLUMN IF NOT EXISTS id_cuenta_bancaria_origen INT;
      CREATE INDEX IF NOT EXISTS idx_solicitudes_traslado_bco_origen ON solicitudes_traslado_apertura(id_cuenta_bancaria_origen);

      -- Restricción: No trasladar fondos hacia la misma cuenta de origen
      ALTER TABLE solicitudes_traslado_apertura 
          DROP CONSTRAINT IF EXISTS chk_traslado_cuentas_diferentes;

      ALTER TABLE solicitudes_traslado_apertura 
          ADD CONSTRAINT chk_traslado_cuentas_diferentes 
          CHECK (id_cuenta_destino IS NULL OR id_cuenta_origen IS NULL OR id_cuenta_origen <> id_cuenta_destino);

      -- Eliminar concepto obsoleto de aportaciones
      DROP TABLE IF EXISTS aportaciones CASCADE;
      DELETE FROM tipos_cuenta WHERE id_tipo_cuenta = 1;

      -- Restricción: Tasas de crédito no negativas y cuotas válidas
      ALTER TABLE solicitudes_credito 
          DROP CONSTRAINT IF EXISTS chk_credito_tasa_valida;

      ALTER TABLE solicitudes_credito 
          ADD CONSTRAINT chk_credito_tasa_valida 
          CHECK (tasa_interes >= 0 AND cuota_mensual_estimada > 0);

      -- Homogeneizar precisión de monto de traslados a NUMERIC(14, 2)
      ALTER TABLE solicitudes_traslado_apertura 
          ALTER COLUMN monto TYPE NUMERIC(14, 2);

      -- Secuencia atómica para correlativo de casos CASO-YYYY-XXXX
      CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_traslado START WITH 100;

      SELECT setval(
          'seq_numero_caso_traslado', 
          COALESCE((SELECT MAX(id_solicitud) FROM solicitudes_traslado_apertura), 1), 
          true
      );

      -- Función y trigger atómico para generar numero_caso en PostgreSQL
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

      -- Inmutabilidad en auditoría: Restringir eliminación en cascada
      ALTER TABLE historial_estados_usuario 
          DROP CONSTRAINT IF EXISTS historial_estados_usuario_id_usuario_modificado_fkey;

      ALTER TABLE historial_estados_usuario 
          ADD CONSTRAINT historial_estados_usuario_id_usuario_modificado_fkey 
          FOREIGN KEY (id_usuario_modificado) REFERENCES usuarios(id_persona) 
          ON DELETE RESTRICT ON UPDATE CASCADE;
    `;
    await pool.query(constraintsAndTriggersQuery);

    // 4. Módulo 1: Eliminación definitiva de tablas bancarias legacy (migradas al microservicio Core Bancario banco_db)
    const modulo1Query = `
      -- 4.1 Eliminar tablas obsoletas y referencias foráneas legacy
      ALTER TABLE solicitudes_credito DROP CONSTRAINT IF EXISTS solicitudes_credito_id_cuenta_bancaria_destino_fkey;
      ALTER TABLE solicitudes_traslado_apertura DROP CONSTRAINT IF EXISTS solicitudes_traslado_apertura_id_cuenta_bancaria_origen_fkey;
      DROP TABLE IF EXISTS cuentas_bancarias_externas CASCADE;
      DROP TABLE IF EXISTS movimientos_cuenta_bancaria CASCADE;
      DROP TABLE IF EXISTS cuenta_bancaria CASCADE;

      -- 4.4 Tabla de Solicitudes de Afiliación para atención en Agencia (Personas Nuevas)
      CREATE TABLE IF NOT EXISTS solicitudes_afiliacion_agencia (
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
          fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_solicitudes_afiliacion_cui ON solicitudes_afiliacion_agencia(cui_dpi);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_afiliacion_estado ON solicitudes_afiliacion_agencia(estado);

      ALTER TABLE solicitudes_afiliacion_agencia 
      ADD COLUMN IF NOT EXISTS id_operador_bloqueo INTEGER REFERENCES usuarios(id_persona) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS fecha_bloqueo TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS id_operador_resuelve INTEGER REFERENCES usuarios(id_persona) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS numero_cuenta_bancaria VARCHAR(50);

      -- Secuencia para números de caso de afiliación
      CREATE SEQUENCE IF NOT EXISTS seq_numero_caso_afiliacion START WITH 1001;

      -- 4.5 Insertar personas cliente de banco (sin rol ni membresía previa) si no existen
      INSERT INTO personas (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, fecha_nacimiento)
      VALUES 
      ('4000000000001', 'Marcos', 'Vinicio', 'Castillo', 'Mendoza', '55440001', 'Zona 10, Ciudad de Guatemala', '1992-06-14'),
      ('4000000000002', 'Sofía', 'Alejandra', 'Reyes', 'Pineda', '55440002', 'Zona 14, Ciudad de Guatemala', '1995-09-20')
      ON CONFLICT (cui_dpi) DO NOTHING;

      -- 4.5 Tabla de Beneficiarios por Cuenta de Cooperativa
      CREATE TABLE IF NOT EXISTS beneficiarios (
          id_beneficiario SERIAL PRIMARY KEY,
          id_cuenta INT NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
          nombre_completo VARCHAR(150) NOT NULL,
          parentesco VARCHAR(50) NOT NULL,
          cui_dpi VARCHAR(20),
          telefono VARCHAR(20),
          porcentaje NUMERIC(5, 2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
          fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_beneficiarios_cuenta ON beneficiarios(id_cuenta);
    `;
    await pool.query(modulo1Query);

    // 5. Módulo de Seguridad Avanzada: Eliminación de SUPERADMIN y Usuario steven08 como ADMINISTRADOR
    const securityMfaSuperAdminQuery = `
      -- 5.1 Columnas MFA en tabla usuarios
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64) NULL;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_qr_url TEXT NULL;

      -- 5.2 Ampliación de codigo_corporativo para admitir alfanuméricos (ej. steven08)
      ALTER TABLE usuarios ALTER COLUMN codigo_corporativo TYPE VARCHAR(30);
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_codigo_corporativo_check;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_codigo_corporativo_check 
          CHECK (codigo_corporativo ~ '^[A-Za-z0-9_.-]{3,30}$');

      -- 5.3 Eliminación total del rol SUPERADMIN y reasignación a ADMINISTRADOR
      UPDATE usuarios 
      SET id_rol = (SELECT id_rol FROM roles WHERE codigo = 'ADMINISTRADOR')
      WHERE id_rol IN (SELECT id_rol FROM roles WHERE codigo = 'SUPERADMIN');

      DELETE FROM roles_permisos 
      WHERE id_rol IN (SELECT id_rol FROM roles WHERE codigo = 'SUPERADMIN');

      DELETE FROM roles WHERE codigo = 'SUPERADMIN';

      -- 5.4 Soporte para estado BLOQUEADO en usuarios y asociados
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_estado_check;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_estado_check CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO'));

      ALTER TABLE asociados DROP CONSTRAINT IF EXISTS asociados_estado_asociado_check;
      ALTER TABLE asociados ADD CONSTRAINT asociados_estado_asociado_check CHECK (estado_asociado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'BLOQUEADO'));

      -- 5.6 Soporte para resolución de solicitudes de crédito por analistas/operadores
      ALTER TABLE solicitudes_credito ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMP WITH TIME ZONE;
      ALTER TABLE solicitudes_credito DROP CONSTRAINT IF EXISTS solicitudes_credito_estado_check;
      ALTER TABLE solicitudes_credito ADD CONSTRAINT solicitudes_credito_estado_check 
          CHECK (estado IN ('PENDIENTE', 'EN_ANALISIS', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR', 'APROBADA', 'APROBADO', 'RECHAZADA', 'RECHAZADO', 'DENEGADA', 'DESEMBOLSADA'));

      -- 5.7 Soporte para acreditación y desembolso de créditos en cuenta de ahorro o monetaria
      ALTER TABLE solicitudes_credito DROP CONSTRAINT IF EXISTS solicitudes_credito_id_cuenta_bancaria_destino_fkey;
      ALTER TABLE solicitudes_credito 
          ADD COLUMN IF NOT EXISTS id_cuenta_bancaria_destino INT,
          ADD COLUMN IF NOT EXISTS id_cuenta_destino INT REFERENCES cuentas(id_cuenta),
          ADD COLUMN IF NOT EXISTS cuenta_destino_info VARCHAR(120);

      -- 6. MÓDULO DE CRÉDITO JERÁRQUICO: ROL EJECUTIVO Y FIRMA DE FORMULARIO
      -- 6.1 Crear rol EJECUTIVO si no existe
      INSERT INTO roles (codigo, nombre, descripcion, estado)
      VALUES (
        'EJECUTIVO',
        'Ejecutivo de Créditos y Aprobaciones',
        'Autorización final, devolución a operador y resolución definitiva de solicitudes crediticias',
        'ACTIVO'
      )
      ON CONFLICT (codigo) DO UPDATE 
      SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, estado = 'ACTIVO';

      -- Asignar permisos básicos y de resolución de créditos al rol EJECUTIVO
      INSERT INTO roles_permisos (id_rol, id_permiso)
      SELECT r.id_rol, p.id_permiso
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.codigo = 'EJECUTIVO'
        AND p.codigo IN ('CRED_VER_TODOS', 'CRED_APROBAR', 'CRED_RECHAZAR', 'AUDIT_VER_REGISTROS')
      ON CONFLICT DO NOTHING;

      -- 6.2 Ampliación de columnas en solicitudes_credito para firma y trazabilidad jerárquica
      ALTER TABLE solicitudes_credito 
        ADD COLUMN IF NOT EXISTS documento_firmado_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS nombre_archivo_firmado VARCHAR(255),
        ADD COLUMN IF NOT EXISTS peso_archivo_bytes BIGINT,
        ADD COLUMN IF NOT EXISTS fecha_carga_archivo TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS id_operador_revisa INT REFERENCES usuarios(id_persona),
        ADD COLUMN IF NOT EXISTS fecha_revision_operador TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS dictamen_operador TEXT,
        ADD COLUMN IF NOT EXISTS id_ejecutivo_resuelve INT REFERENCES usuarios(id_persona),
        ADD COLUMN IF NOT EXISTS fecha_resolucion_ejecutivo TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS observaciones_ejecutivo TEXT;

      -- 6.3 Actualización de estados permitidos en solicitudes_credito
      ALTER TABLE solicitudes_credito ALTER COLUMN estado TYPE VARCHAR(50);
      ALTER TABLE solicitudes_credito DROP CONSTRAINT IF EXISTS solicitudes_credito_estado_check;
      ALTER TABLE solicitudes_credito ADD CONSTRAINT solicitudes_credito_estado_check 
        CHECK (estado IN ('PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR', 'APROBADA', 'APROBADO', 'DESEMBOLSADA', 'DENEGADA', 'RECHAZADA', 'RECHAZADO', 'PENDIENTE'));

      -- 6.4 Crear persona y usuario demo para rol EJECUTIVO (EJ-1 / admin123)
      INSERT INTO personas (
        cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        telefono, direccion, fecha_nacimiento
      ) VALUES (
        '6000000000001', 'Carlos', 'Eduardo', 'Mendoza', 'Gómez',
        '44445555', 'Zona 10, Ciudad de Guatemala', '1985-05-15'
      )
      ON CONFLICT (cui_dpi) DO NOTHING;

      INSERT INTO usuarios (
        id_persona, id_rol, codigo_corporativo, email, password_hash, estado, mfa_enabled
      ) VALUES (
        (SELECT id_persona FROM personas WHERE cui_dpi = '6000000000001'),
        (SELECT id_rol FROM roles WHERE codigo = 'EJECUTIVO'),
        'EJ-1',
        'ejecutivo@cooperativa.com',
        '$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey',
        'ACTIVO',
        FALSE
      )
      ON CONFLICT (codigo_corporativo) DO UPDATE SET
        id_rol = (SELECT id_rol FROM roles WHERE codigo = 'EJECUTIVO'),
        estado = 'ACTIVO';
    `;
    await pool.query(securityMfaSuperAdminQuery);

    // 7. OPTIMIZACIONES DE BASE DE DATOS AUDITORÍA DBA (REPORTE_BASE_DATOS.md)
    const dbaOptimizationsQuery = `
      -- 7.1 Cobertura de FK en beneficiarios
      CREATE INDEX IF NOT EXISTS idx_beneficiarios_cuenta 
          ON beneficiarios(id_cuenta);

      -- 7.2 Cobertura de FKs en solicitudes_credito
      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_cuenta_destino 
          ON solicitudes_credito(id_cuenta_destino) 
          WHERE id_cuenta_destino IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_operador_revisa 
          ON solicitudes_credito(id_operador_revisa) 
          WHERE id_operador_revisa IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_ejecutivo_resuelve 
          ON solicitudes_credito(id_ejecutivo_resuelve) 
          WHERE id_ejecutivo_resuelve IS NOT NULL;

      -- 7.3 Cobertura de FKs y estado en solicitudes_afiliacion_agencia
      CREATE INDEX IF NOT EXISTS idx_solicitudes_afiliacion_operador_bloqueo 
          ON solicitudes_afiliacion_agencia(id_operador_bloqueo) 
          WHERE id_operador_bloqueo IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_solicitudes_afiliacion_operador_resuelve 
          ON solicitudes_afiliacion_agencia(id_operador_resuelve) 
          WHERE id_operador_resuelve IS NOT NULL;

      -- 7.4 Índice parcial para cola operativa de afiliaciones pendientes
      CREATE INDEX IF NOT EXISTS idx_solicitudes_afiliacion_pendientes 
          ON solicitudes_afiliacion_agencia(fecha_solicitud ASC) 
          WHERE estado = 'PENDIENTE_AGENCIA';

      -- 7.5 Cobertura en tabla intermedia de seguridad
      CREATE INDEX IF NOT EXISTS idx_roles_permisos_permiso 
          ON roles_permisos(id_permiso);

      -- 7.6 Trigger anti-concurrencia para solicitudes_afiliacion_agencia
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

      -- 8. AUDITORÍA FORENSE Y TRAZABILIDAD (REPORTE_CIBERSEGURIDAD.md - SEC-09)
      ALTER TABLE historial_estados_usuario
          ADD COLUMN IF NOT EXISTS ip_origen VARCHAR(45) NULL,
          ADD COLUMN IF NOT EXISTS user_agent TEXT NULL;

      -- 9. CONFIGURACIÓN DEL SISTEMA (Google Mail SMTP, parámetros dinámicos)
      CREATE TABLE IF NOT EXISTS configuracion_sistema (
          clave VARCHAR(100) PRIMARY KEY,
          valor TEXT NOT NULL,
          descripcion TEXT,
          actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      -- 10. BENEFICIARIOS AMPLIACIÓN Y TABLA DE AUDITORÍA
      ALTER TABLE beneficiarios ALTER COLUMN cui_dpi TYPE VARCHAR(50);
      ALTER TABLE beneficiarios ALTER COLUMN telefono TYPE VARCHAR(50);
      ALTER TABLE beneficiarios ALTER COLUMN parentesco TYPE VARCHAR(100);

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
    `;
    await pool.query(dbaOptimizationsQuery);

    // 7. Secretos 2FA que se generaban al afiliar o crear usuarios y nunca se activaban: se borran.
    //    El 2FA solo se guarda cuando el usuario lo activa desde «Seguridad» (menú del usuario).
    await pool.query(`
      UPDATE usuarios SET mfa_secret = NULL, mfa_qr_url = NULL
      WHERE mfa_enabled = FALSE AND (mfa_secret IS NOT NULL OR mfa_qr_url IS NOT NULL)
    `);

    // 8. Códigos de verificación de correo de la afiliación en línea (issue #25). Solo se guarda el hash.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS codigos_verificacion_correo (
        email VARCHAR(150) PRIMARY KEY,
        codigo_hash CHAR(64) NOT NULL,
        expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
        intentos INT NOT NULL DEFAULT 0,
        enviado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        envios_hora INT NOT NULL DEFAULT 1,
        ventana_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[MIGRATION] Esquema, cuenta_bancaria corporativa, MFA TOTP, roles, beneficiarios y optimizaciones DBA aplicadas exitosamente.');
    return true;
  } catch (error) {
    console.error('[MIGRATION ERROR] Error al verificar/migrar esquema en PostgreSQL:', error.message);
    return false;
  }
};

module.exports = { runMigrations };
