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
      -- Restricción: No trasladar fondos hacia la misma cuenta de origen
      ALTER TABLE solicitudes_traslado_apertura 
          DROP CONSTRAINT IF EXISTS chk_traslado_cuentas_diferentes;

      ALTER TABLE solicitudes_traslado_apertura 
          ADD CONSTRAINT chk_traslado_cuentas_diferentes 
          CHECK (id_cuenta_destino IS NULL OR id_cuenta_origen <> id_cuenta_destino);

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

    console.log('[MIGRATION] Esquema, índices y secuencias optimizados exitosamente en PostgreSQL.');
    return true;
  } catch (error) {
    console.error('[MIGRATION ERROR] Error al verificar/migrar esquema en PostgreSQL:', error.message);
    return false;
  }
};

module.exports = { runMigrations };
