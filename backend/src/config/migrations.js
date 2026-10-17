const { pool } = require('./db');

/**
 * Da a `usuarios` su propia llave primaria (`id_usuario`) para que una persona pueda tener un usuario
 * del personal y uno de asociado (issue #32).
 *
 * - Los usuarios existentes reciben `id_usuario = id_persona`, así que las llaves foráneas que apuntan a
 *   usuarios conservan sus valores: solo se redirigen de `usuarios(id_persona)` a `usuarios(id_usuario)`.
 * - El índice único `uq_usuarios_persona_tipo` (id_persona, id_rol = 3) limita a cada persona a un usuario
 *   del personal y uno de asociado, y cubre la llave foránea hacia personas. El rol 3 es ASOCIADO en los
 *   datos semilla; si no lo fuera, la migración se detiene.
 * - Corre en una transacción y es idempotente: si `id_usuario` ya existe, solo asegura los índices.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} si la migración falla (la transacción se revierte).
 */
const migrarLlaveUsuario = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DO $$
      DECLARE
        fk RECORD;
        tablas TEXT[] := '{}';
        nombres TEXT[] := '{}';
        definiciones TEXT[] := '{}';
        i INT;
      BEGIN
        -- Los índices de usuarios por persona dan por hecho que ASOCIADO es el rol 3
        IF (SELECT id_rol FROM roles WHERE codigo = 'ASOCIADO') IS DISTINCT FROM 3 THEN
          RAISE EXCEPTION 'El rol ASOCIADO debe tener id_rol = 3';
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'usuarios' AND column_name = 'id_usuario'
        ) THEN
          RETURN;
        END IF;

        -- Guardar y quitar las llaves foráneas que apuntan a usuarios(id_persona)
        FOR fk IN
          SELECT c.conrelid::regclass::text AS tabla, c.conname::text AS nombre, pg_get_constraintdef(c.oid) AS definicion
          FROM pg_constraint c
          WHERE c.contype = 'f' AND c.confrelid = 'usuarios'::regclass
        LOOP
          tablas := tablas || fk.tabla;
          nombres := nombres || fk.nombre;
          definiciones := definiciones || fk.definicion;
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tabla, fk.nombre);
        END LOOP;

        -- Nueva llave primaria con el mismo valor que tenía cada usuario
        ALTER TABLE usuarios ADD COLUMN id_usuario INT;
        UPDATE usuarios SET id_usuario = id_persona;
        CREATE SEQUENCE usuarios_id_usuario_seq AS INTEGER OWNED BY usuarios.id_usuario;
        PERFORM setval('usuarios_id_usuario_seq', COALESCE((SELECT MAX(id_usuario) FROM usuarios), 0) + 1, false);
        ALTER TABLE usuarios
          ALTER COLUMN id_usuario SET DEFAULT nextval('usuarios_id_usuario_seq'),
          ALTER COLUMN id_usuario SET NOT NULL;
        ALTER TABLE usuarios DROP CONSTRAINT usuarios_pkey;
        ALTER TABLE usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);
        ALTER TABLE usuarios ALTER COLUMN id_persona SET NOT NULL;

        -- Volver a crear las llaves foráneas, ahora hacia usuarios(id_usuario)
        FOR i IN 1 .. COALESCE(array_length(tablas, 1), 0) LOOP
          EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I %s',
            tablas[i],
            nombres[i],
            replace(definiciones[i], 'REFERENCES usuarios(id_persona)', 'REFERENCES usuarios(id_usuario)')
          );
        END LOOP;
      END $$;
    `);
    await client.query(`
      -- Un usuario del personal y uno de asociado por persona; también cubre la FK hacia personas
      CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_persona_tipo ON usuarios (id_persona, (id_rol = 3));
      -- Primera versión de esta migración: dos índices parciales que no cubrían la FK
      DROP INDEX IF EXISTS uq_usuarios_persona_personal;
      DROP INDEX IF EXISTS uq_usuarios_persona_asociado;
      -- SERIAL es INTEGER: misma secuencia en bases nuevas y migradas
      ALTER SEQUENCE usuarios_id_usuario_seq AS INTEGER;
      -- Única FK hacia usuarios que no tenía índice
      CREATE INDEX IF NOT EXISTS idx_historial_beneficiarios_usuario
        ON historial_cambios_beneficiarios(id_usuario) WHERE id_usuario IS NOT NULL;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

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

    // 1.1 Llave propia del usuario (issue #32). Debe correr antes que los pasos que vuelven a crear
    //     llaves foráneas hacia usuarios(id_usuario).
    await migrarLlaveUsuario();

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

      -- La secuencia nunca retrocede: sigue al mayor número de caso emitido (no al id de la fila), para
      -- que un reinicio no vuelva a generar un número que ya existe.
      SELECT setval(
          'seq_numero_caso_traslado',
          GREATEST(
              (SELECT last_value FROM seq_numero_caso_traslado),
              COALESCE((SELECT MAX(substring(numero_caso FROM '^CASO-\\d{4}-(\\d+)$')::bigint) FROM solicitudes_traslado_apertura), 1)
          ),
          true
      );

      -- Función y trigger atómico para generar numero_caso en PostgreSQL
      CREATE OR REPLACE FUNCTION trg_generar_numero_caso()
      RETURNS TRIGGER AS $$
      DECLARE
          correlativo TEXT;
      BEGIN
          IF NEW.numero_caso IS NULL OR NEW.numero_caso = '' THEN
              -- Al menos 4 dígitos; desde el 10000 el número sigue creciendo (LPAD a 4 lo cortaría y se repetiría)
              correlativo := nextval('seq_numero_caso_traslado')::text;
              NEW.numero_caso := 'CASO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(correlativo, GREATEST(LENGTH(correlativo), 4), '0');
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
          FOREIGN KEY (id_usuario_modificado) REFERENCES usuarios(id_usuario) 
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
      ADD COLUMN IF NOT EXISTS id_operador_bloqueo INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS fecha_bloqueo TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS id_operador_resuelve INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
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
          CHECK (estado IN ('PENDIENTE', 'EN_ANALISIS', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR', 'APROBADA', 'APROBADO', 'RECHAZADA', 'RECHAZADO', 'DENEGADA', 'DESEMBOLSADA', 'CANCELADA'));

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
        ADD COLUMN IF NOT EXISTS id_operador_revisa INT REFERENCES usuarios(id_usuario),
        ADD COLUMN IF NOT EXISTS fecha_revision_operador TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS dictamen_operador TEXT,
        ADD COLUMN IF NOT EXISTS id_ejecutivo_resuelve INT REFERENCES usuarios(id_usuario),
        ADD COLUMN IF NOT EXISTS fecha_resolucion_ejecutivo TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS observaciones_ejecutivo TEXT;

      -- 6.3 Actualización de estados permitidos en solicitudes_credito
      ALTER TABLE solicitudes_credito ALTER COLUMN estado TYPE VARCHAR(50);
      ALTER TABLE solicitudes_credito DROP CONSTRAINT IF EXISTS solicitudes_credito_estado_check;
      ALTER TABLE solicitudes_credito ADD CONSTRAINT solicitudes_credito_estado_check 
        CHECK (estado IN ('PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR', 'APROBADA', 'APROBADO', 'DESEMBOLSADA', 'DENEGADA', 'RECHAZADA', 'RECHAZADO', 'PENDIENTE', 'CANCELADA'));

      -- 6.4 Crear persona y usuario demo para rol EJECUTIVO (EJ-1)
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
      DECLARE
          correlativo TEXT;
      BEGIN
          IF NEW.numero_caso IS NULL OR NEW.numero_caso = '' THEN
              -- Al menos 4 dígitos; desde el 10000 el número sigue creciendo (LPAD a 4 lo cortaría y se repetiría)
              correlativo := nextval('seq_numero_caso_afiliacion')::text;
              NEW.numero_caso := 'CASO-AFIL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(correlativo, GREATEST(LENGTH(correlativo), 4), '0');
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
          id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
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

    // 8.1 Un crédito del que el asociado desistió tiene su propio estado (issue #11). Antes se guardaba como
    //     RECHAZADA con una marca en las observaciones; se pasan al estado nuevo y se quita la marca.
    await pool.query(`
      UPDATE solicitudes_credito
      SET estado = 'CANCELADA',
          observaciones = NULLIF(TRIM(REPLACE(observaciones, '[Cancelada voluntariamente por el asociado]', '')), '')
      WHERE estado = 'RECHAZADA' AND observaciones LIKE '%[Cancelada voluntariamente por el asociado]%'
    `);

    // 8.2 Parentesco de beneficiarios con un solo juego de valores (issue #10): se convierten las variantes que
    //     guardaban el operador y el asociado, lo desconocido pasa a OTRO y se restringe con un CHECK.
    await pool.query(`
      UPDATE beneficiarios
      SET parentesco = CASE TRANSLATE(UPPER(TRIM(parentesco)), 'ÁÉÍÓÚ', 'AEIOU')
          WHEN 'CONYUGE' THEN 'CONYUGE'
          WHEN 'HIJO/A' THEN 'HIJO/A' WHEN 'HIJO' THEN 'HIJO/A' WHEN 'HIJA' THEN 'HIJO/A'
          WHEN 'PADRE/MADRE' THEN 'PADRE/MADRE' WHEN 'PADRE' THEN 'PADRE/MADRE' WHEN 'MADRE' THEN 'PADRE/MADRE'
          WHEN 'HERMANO/A' THEN 'HERMANO/A' WHEN 'HERMANO' THEN 'HERMANO/A' WHEN 'HERMANA' THEN 'HERMANO/A'
          WHEN 'SOBRINO/A' THEN 'SOBRINO/A' WHEN 'SOBRINO' THEN 'SOBRINO/A' WHEN 'SOBRINA' THEN 'SOBRINO/A'
          ELSE 'OTRO'
        END
      WHERE parentesco NOT IN ('CONYUGE', 'HIJO/A', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO');

      ALTER TABLE beneficiarios DROP CONSTRAINT IF EXISTS chk_beneficiarios_parentesco;
      ALTER TABLE beneficiarios ADD CONSTRAINT chk_beneficiarios_parentesco
        CHECK (parentesco IN ('CONYUGE', 'HIJO/A', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO'));
    `);

    // 9. El correo es único sin importar mayúsculas: el inicio de sesión y las validaciones comparan con
    //    LOWER(email). Si hubiera correos repetidos que solo difieren en mayúsculas, no se crea y se avisa
    //    (hay que corregirlos a mano) en lugar de detener el arranque.
    const correosRepetidos = await pool.query('SELECT LOWER(email) FROM usuarios GROUP BY 1 HAVING COUNT(*) > 1');
    if (correosRepetidos.rowCount > 0) {
      console.warn(`[MIGRATION] Hay ${correosRepetidos.rowCount} correo(s) repetidos sin distinguir mayúsculas: no se creó uq_usuarios_email_lower. Corríjalos y reinicie.`);
    } else {
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_lower ON usuarios (LOWER(email))');
    }

    // 10. Registro de los depósitos en ventanilla a cuentas del banco: quién, cuánto, a qué cuenta y desde dónde.
    //     Solo se insertan filas; el índice cubre la FK y la consulta por operador.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS depositos_ventanilla_banco (
        id_deposito SERIAL PRIMARY KEY,
        id_usuario_operador INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
        numero_cuenta_bancaria VARCHAR(50) NOT NULL,
        titular_cui VARCHAR(13) NOT NULL,
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        referencia VARCHAR(50) NOT NULL UNIQUE,
        ip_origen VARCHAR(45),
        user_agent TEXT,
        fecha_deposito TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_depositos_ventanilla_operador
        ON depositos_ventanilla_banco (id_usuario_operador, fecha_deposito DESC);
    `);

    // 10.1 El depósito se registra antes de llamar al banco y luego se cierra su estado: si el banco no confirma
    //      a tiempo queda SIN_CONFIRMAR para conciliarlo con la referencia. El DPI se valida también aquí.
    await pool.query(`
      ALTER TABLE depositos_ventanilla_banco ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE';
      ALTER TABLE depositos_ventanilla_banco DROP CONSTRAINT IF EXISTS chk_depositos_ventanilla_estado;
      ALTER TABLE depositos_ventanilla_banco ADD CONSTRAINT chk_depositos_ventanilla_estado
        CHECK (estado IN ('PENDIENTE', 'ACREDITADO', 'RECHAZADO', 'SIN_CONFIRMAR', 'REVERTIDO'));
      ALTER TABLE depositos_ventanilla_banco DROP CONSTRAINT IF EXISTS chk_depositos_ventanilla_cui;
      ALTER TABLE depositos_ventanilla_banco ADD CONSTRAINT chk_depositos_ventanilla_cui CHECK (titular_cui ~ '^[0-9]{13}$');
      CREATE INDEX IF NOT EXISTS idx_depositos_ventanilla_por_conciliar
        ON depositos_ventanilla_banco (fecha_deposito) WHERE estado IN ('PENDIENTE', 'SIN_CONFIRMAR');
      -- Acumulado del día por colaborador (el del operador usa idx_depositos_ventanilla_operador)
      CREATE INDEX IF NOT EXISTS idx_depositos_ventanilla_titular
        ON depositos_ventanilla_banco (titular_cui, fecha_deposito DESC);
    `);

    // 10.2 Es un registro de auditoría: no se borra ni se cambia, salvo el estado de un depósito sin cerrar
    //      (PENDIENTE o SIN_CONFIRMAR). Las pruebas lo limpian con SET LOCAL cooperativa.purga_pruebas = 'on'.
    await pool.query(`
      CREATE OR REPLACE FUNCTION trg_depositos_ventanilla_inmutable()
      RETURNS TRIGGER AS $$
      BEGIN
          IF current_setting('cooperativa.purga_pruebas', true) = 'on' THEN
              RETURN COALESCE(NEW, OLD);
          END IF;
          -- De un depósito sin cerrar solo cambian el estado y quién lo concilió y cuándo (10.3)
          IF TG_OP = 'UPDATE' AND OLD.estado IN ('PENDIENTE', 'SIN_CONFIRMAR')
             AND (to_jsonb(NEW) - 'estado' - 'id_usuario_concilia' - 'fecha_conciliacion')
               = (to_jsonb(OLD) - 'estado' - 'id_usuario_concilia' - 'fecha_conciliacion') THEN
              RETURN NEW;
          END IF;
          RAISE EXCEPTION 'depositos_ventanilla_banco es un registro de auditoría: no se modifica ni se borra'
              USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_depositos_ventanilla_inmutable ON depositos_ventanilla_banco;
      CREATE TRIGGER trg_depositos_ventanilla_inmutable
          BEFORE UPDATE OR DELETE ON depositos_ventanilla_banco
          FOR EACH ROW EXECUTE FUNCTION trg_depositos_ventanilla_inmutable();
      DROP TRIGGER IF EXISTS trg_depositos_ventanilla_sin_truncate ON depositos_ventanilla_banco;
      CREATE TRIGGER trg_depositos_ventanilla_sin_truncate
          BEFORE TRUNCATE ON depositos_ventanilla_banco
          FOR EACH STATEMENT EXECUTE FUNCTION trg_depositos_ventanilla_inmutable();
    `);

    // 10.3 Conciliación de depósitos (issue #66): quién cerró un depósito sin confirmar y cuándo. El trigger (10.2)
    //      deja cambiar solo el estado y estos dos datos de un depósito sin cerrar.
    await pool.query(`
      ALTER TABLE depositos_ventanilla_banco ADD COLUMN IF NOT EXISTS id_usuario_concilia INT REFERENCES usuarios(id_usuario);
      ALTER TABLE depositos_ventanilla_banco ADD COLUMN IF NOT EXISTS fecha_conciliacion TIMESTAMP WITH TIME ZONE;
      CREATE INDEX IF NOT EXISTS idx_depositos_ventanilla_concilia
        ON depositos_ventanilla_banco (id_usuario_concilia) WHERE id_usuario_concilia IS NOT NULL;
      -- Quién concilia y cuándo van juntos; el usuario no se borra mientras tenga conciliaciones
      ALTER TABLE depositos_ventanilla_banco DROP CONSTRAINT IF EXISTS chk_depositos_ventanilla_conciliacion;
      ALTER TABLE depositos_ventanilla_banco ADD CONSTRAINT chk_depositos_ventanilla_conciliacion
        CHECK ((id_usuario_concilia IS NULL) = (fecha_conciliacion IS NULL));
      ALTER TABLE depositos_ventanilla_banco DROP CONSTRAINT IF EXISTS depositos_ventanilla_banco_id_usuario_concilia_fkey;
      ALTER TABLE depositos_ventanilla_banco ADD CONSTRAINT depositos_ventanilla_banco_id_usuario_concilia_fkey
        FOREIGN KEY (id_usuario_concilia) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
    `);

    // 11. Efectivo recibido en ventanilla (aportación al afiliar, formalización de agencia y apertura de cuentas):
    //     con el depósito al banco, suma el acumulado del día por persona. Registro de auditoría: solo se inserta.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS efectivo_ventanilla (
        id_efectivo SERIAL PRIMARY KEY,
        id_usuario_operador INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
        cui_dpi VARCHAR(13) NOT NULL CHECK (cui_dpi ~ '^[0-9]{13}$'),
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        origen VARCHAR(25) NOT NULL
          CHECK (origen IN ('AFILIACION_PRESENCIAL', 'FORMALIZACION_AGENCIA', 'APERTURA_CUENTA')),
        referencia VARCHAR(100),
        fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_efectivo_ventanilla_persona ON efectivo_ventanilla (cui_dpi, fecha_registro DESC);
      CREATE INDEX IF NOT EXISTS idx_efectivo_ventanilla_operador ON efectivo_ventanilla (id_usuario_operador, fecha_registro DESC);

      CREATE OR REPLACE FUNCTION trg_registro_solo_insercion()
      RETURNS TRIGGER AS $$
      BEGIN
          IF current_setting('cooperativa.purga_pruebas', true) = 'on' THEN
              RETURN COALESCE(NEW, OLD);
          END IF;
          RAISE EXCEPTION '% es un registro de auditoría: no se modifica ni se borra', TG_TABLE_NAME
              USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_efectivo_ventanilla_inmutable ON efectivo_ventanilla;
      CREATE TRIGGER trg_efectivo_ventanilla_inmutable
          BEFORE UPDATE OR DELETE ON efectivo_ventanilla
          FOR EACH ROW EXECUTE FUNCTION trg_registro_solo_insercion();
      DROP TRIGGER IF EXISTS trg_efectivo_ventanilla_sin_truncate ON efectivo_ventanilla;
      CREATE TRIGGER trg_efectivo_ventanilla_sin_truncate
          BEFORE TRUNCATE ON efectivo_ventanilla
          FOR EACH STATEMENT EXECUTE FUNCTION trg_registro_solo_insercion();
    `);

    // 12. Reversiones con el banco (issue #64): cada una queda registrada antes de pedirla. RESUELTA si el banco la
    //     hizo (sin usuario: la hizo el sistema), DESCARTADA si no había nada que revertir y PENDIENTE para hacerla
    //     desde «Conciliación». El banco es idempotente por referencia, así que reintentarlas es seguro.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reversiones_pendientes (
        id_reversion SERIAL PRIMARY KEY,
        origen VARCHAR(30) NOT NULL CHECK (origen IN (
          'TRASLADO', 'APERTURA_CUENTA', 'AFILIACION_EN_LINEA', 'AFILIACION_PRESENCIAL', 'FORMALIZACION_AGENCIA', 'DESEMBOLSO_CREDITO'
        )),
        tipo_movimiento VARCHAR(10) NOT NULL CHECK (tipo_movimiento IN ('DEBITO', 'CREDITO')),
        -- NULL solo en una apertura que el banco no confirmó: la cuenta se toma del movimiento al conciliar
        numero_cuenta_bancaria VARCHAR(50),
        cui_dpi VARCHAR(20),
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        concepto VARCHAR(255) NOT NULL,
        referencia_original VARCHAR(50) NOT NULL,
        referencia_reversion VARCHAR(55) NOT NULL UNIQUE,
        detalle TEXT,
        -- Con qué se confirma si la operación quedó registrada: la solicitud, o el asociado o la cuenta del intento
        clave_operacion VARCHAR(60) NOT NULL,
        estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',
        id_usuario_resuelve INT REFERENCES usuarios(id_usuario),
        fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_resolucion TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_reversiones_pendientes_abiertas
        ON reversiones_pendientes (fecha_registro) WHERE estado = 'PENDIENTE';
      CREATE INDEX IF NOT EXISTS idx_reversiones_pendientes_resuelve
        ON reversiones_pendientes (id_usuario_resuelve) WHERE id_usuario_resuelve IS NOT NULL;

      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS reversiones_pendientes_id_usuario_resuelve_fkey;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT reversiones_pendientes_id_usuario_resuelve_fkey
        FOREIGN KEY (id_usuario_resuelve) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
      -- Una reversión cerrada dice cuándo (y quién, si no la cerró el sistema); un débito lleva el DPI del titular
      -- (el banco lo exige); la referencia de la reversión es REV-<original> y cabe en el banco (50 caracteres)
      ALTER TABLE reversiones_pendientes ALTER COLUMN numero_cuenta_bancaria DROP NOT NULL;
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_cuenta;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_cuenta
        CHECK (estado <> 'RESUELTA' OR numero_cuenta_bancaria IS NOT NULL);
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS reversiones_pendientes_estado_check;
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_estado;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_estado
        CHECK (estado IN ('PENDIENTE', 'RESUELTA', 'DESCARTADA'));
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_resolucion;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_resolucion
        CHECK ((estado = 'PENDIENTE') = (fecha_resolucion IS NULL)
               AND (estado <> 'PENDIENTE' OR id_usuario_resuelve IS NULL));
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_cui;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_cui
        CHECK (cui_dpi IS NULL OR cui_dpi ~ '^[0-9]{13}$');
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_debito_con_dpi;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_debito_con_dpi
        CHECK (tipo_movimiento <> 'DEBITO' OR cui_dpi IS NOT NULL);
      ALTER TABLE reversiones_pendientes DROP CONSTRAINT IF EXISTS chk_reversiones_ref_cabe;
      ALTER TABLE reversiones_pendientes ADD CONSTRAINT chk_reversiones_ref_cabe
        CHECK (length(referencia_reversion) <= 50 AND referencia_reversion = 'REV-' || referencia_original);

      -- Registro de auditoría: no se borra ni se cambia; una pendiente solo se cierra (resuelta o descartada) y, si se
      -- anotó sin la cuenta del banco, al cerrarla se guarda la cuenta en que se hizo
      CREATE OR REPLACE FUNCTION trg_reversiones_pendientes_inmutable()
      RETURNS TRIGGER AS $$
      BEGIN
          IF current_setting('cooperativa.purga_pruebas', true) = 'on' THEN
              RETURN COALESCE(NEW, OLD);
          END IF;
          IF TG_OP = 'UPDATE' AND OLD.estado = 'PENDIENTE' AND NEW.estado IN ('RESUELTA', 'DESCARTADA')
             AND (OLD.numero_cuenta_bancaria IS NULL OR NEW.numero_cuenta_bancaria = OLD.numero_cuenta_bancaria)
             AND (to_jsonb(NEW) - 'estado' - 'id_usuario_resuelve' - 'fecha_resolucion' - 'numero_cuenta_bancaria')
               = (to_jsonb(OLD) - 'estado' - 'id_usuario_resuelve' - 'fecha_resolucion' - 'numero_cuenta_bancaria') THEN
              RETURN NEW;
          END IF;
          RAISE EXCEPTION 'reversiones_pendientes es un registro de auditoría: solo se cierra'
              USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_reversiones_pendientes_inmutable ON reversiones_pendientes;
      CREATE TRIGGER trg_reversiones_pendientes_inmutable
          BEFORE UPDATE OR DELETE ON reversiones_pendientes
          FOR EACH ROW EXECUTE FUNCTION trg_reversiones_pendientes_inmutable();
      DROP TRIGGER IF EXISTS trg_reversiones_pendientes_sin_truncate ON reversiones_pendientes;
      CREATE TRIGGER trg_reversiones_pendientes_sin_truncate
          BEFORE TRUNCATE ON reversiones_pendientes
          FOR EACH STATEMENT EXECUTE FUNCTION trg_reversiones_pendientes_inmutable();
    `);

    // 12.1 El DPI de una persona tiene 13 dígitos (el registro de efectivo lo exige). Si hubiera alguno que no,
    //      no se crea la restricción y se avisa (hay que corregirlo a mano) en lugar de detener el arranque.
    const dpiFueraDeFormato = await pool.query("SELECT 1 FROM personas WHERE cui_dpi !~ '^[0-9]{13}$' LIMIT 1");
    if (dpiFueraDeFormato.rowCount > 0) {
      console.warn('[MIGRATION] Hay personas con un DPI que no tiene 13 dígitos: no se creó chk_personas_cui. Corríjalos y reinicie.');
    } else {
      await pool.query(`
        ALTER TABLE personas DROP CONSTRAINT IF EXISTS chk_personas_cui;
        ALTER TABLE personas ADD CONSTRAINT chk_personas_cui CHECK (cui_dpi ~ '^[0-9]{13}$');
      `);
    }

    // 12.2 La fecha de creación de una solicitud forma su referencia fija con el banco (`referenciaDeOperacion`):
    //      no puede faltar. Ya tiene valor por defecto; las filas sin ella (no debería haber) toman la fecha actual.
    await pool.query(`
      UPDATE solicitudes_credito SET fecha_solicitud = CURRENT_TIMESTAMP WHERE fecha_solicitud IS NULL;
      ALTER TABLE solicitudes_credito ALTER COLUMN fecha_solicitud SET NOT NULL;
      UPDATE solicitudes_traslado_apertura SET fecha_solicitud = CURRENT_TIMESTAMP WHERE fecha_solicitud IS NULL;
      ALTER TABLE solicitudes_traslado_apertura ALTER COLUMN fecha_solicitud SET NOT NULL;
      UPDATE solicitudes_afiliacion_agencia SET fecha_solicitud = CURRENT_TIMESTAMP WHERE fecha_solicitud IS NULL;
      ALTER TABLE solicitudes_afiliacion_agencia ALTER COLUMN fecha_solicitud SET NOT NULL;
    `);

    console.log('[MIGRATION] Esquema, cuenta_bancaria corporativa, MFA TOTP, roles, beneficiarios y optimizaciones DBA aplicadas exitosamente.');
    return true;
  } catch (error) {
    console.error('[MIGRATION ERROR] Error al verificar/migrar esquema en PostgreSQL:', error.message);
    return false;
  }
};

module.exports = { runMigrations };
