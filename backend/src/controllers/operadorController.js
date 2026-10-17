const db = require('../config/db');
const mailerService = require('../services/mailerService');
const bancoApiService = require('../services/bancoApiService');
const operadorAfiliacionService = require('../services/operadorAfiliacionService');
const operadorCreditoService = require('../services/operadorCreditoService');
const { errorDeNegocio, respuestaDeError, estadoPorFalloDelBanco } = require('../utils/errores');
const {
  revertirOAnotar,
  errorTrasCommitFallido,
  hayReversionPendiente,
  movimientoSinRegistrar,
  revertirMovimientoSinRegistrar,
  avisoDeReversion,
} = require('../services/reversionesService');

/**
 * Obtener solicitudes en estado 'PENDIENTE' para traslados y aperturas
 * GET /api/operador/bandeja-solicitudes
 */
const getBandejaSolicitudes = async (req, res) => {
  try {
    const query = `
      SELECT 
        s.id_solicitud,
        s.numero_caso,
        s.monto,
        s.tipo_operacion,
        s.estado,
        s.fecha_solicitud,
        p.primer_nombre,
        p.primer_apellido,
        p.cui_dpi,
        a.id_asociado,
        s.id_cuenta_bancaria_origen,
        COALESCE(co.numero_cuenta, ('CTA-BCO-' || s.id_cuenta_bancaria_origen)) AS cuenta_origen_numero,
        COALESCE(co.saldo_disponible, s.monto) AS cuenta_origen_saldo,
        cd.numero_cuenta AS cuenta_destino_numero,
        tc.nombre AS tipo_cuenta_destino_nombre
      FROM solicitudes_traslado_apertura s
      JOIN asociados a ON s.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN cuentas co ON s.id_cuenta_origen = co.id_cuenta
      JOIN tipos_cuenta tc ON s.id_tipo_cuenta_destino = tc.id_tipo_cuenta
      LEFT JOIN cuentas cd ON s.id_cuenta_destino = cd.id_cuenta
      WHERE s.estado = 'PENDIENTE'
      ORDER BY s.fecha_solicitud ASC
    `;
    const result = await db.query(query);

    // Enriquecer datos de origen bancario vía Core Banking API
    const bankItems = result.rows.filter(r => r.id_cuenta_bancaria_origen && r.cui_dpi);
    if (bankItems.length > 0) {
      try {
        const uniqueCuis = [...new Set(bankItems.map(r => r.cui_dpi))];
        const clientAccountsMap = new Map();
        await Promise.all(
          uniqueCuis.map(async (cui) => {
            const bcoRes = await bancoApiService.obtenerCuentasCliente(cui);
            if (bcoRes.success && Array.isArray(bcoRes.data)) {
              bcoRes.data.forEach(cta => {
                clientAccountsMap.set(String(cta.id_cuenta_bancaria), cta);
              });
            }
          })
        );

        result.rows.forEach(r => {
          if (r.id_cuenta_bancaria_origen && clientAccountsMap.has(String(r.id_cuenta_bancaria_origen))) {
            const bcoCta = clientAccountsMap.get(String(r.id_cuenta_bancaria_origen));
            r.cuenta_origen_numero = bcoCta.numero_cuenta_bancaria;
            r.cuenta_origen_saldo = bcoCta.saldo_disponible;
          }
        });
      } catch (e) {
        // En caso de error de conexión con Core Banking, se mantiene fallback
      }
    }

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en operadorController.getBandejaSolicitudes:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar la bandeja. Intente de nuevo.',
    });
  }
};

/**
 * Resolver una solicitud de traslado (Aprobar / Rechazar)
 * POST /api/operador/solicitudes/:id/resolver
 */
const resolverSolicitud = async (req, res) => {
  const { id } = req.params;
  const { accion, observaciones } = req.body;
  const idOperador = req.user.id_usuario;

  if (!['APROBAR', 'RECHAZAR'].includes(accion)) {
    return res.status(400).json({
      success: false,
      message: "La acción debe ser 'APROBAR' o 'RECHAZAR'.",
    });
  }

  try {
    const solQuery = 'SELECT * FROM solicitudes_traslado_apertura WHERE id_solicitud = $1';
    const solRes = await db.query(solQuery, [id]);

    if (solRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Solicitud no encontrada.',
      });
    }

    const solicitud = solRes.rows[0];

    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(400).json({
        success: false,
        message: `Esa solicitud ya fue resuelta.`,
      });
    }

    if (accion === 'RECHAZAR') {
      // Un intento anterior de aprobarlo pudo dejar el débito en el banco sin registrar (un tiempo agotado): se
      // busca antes de rechazar (sin poder consultar el banco no se rechaza) y después se devuelve
      const sinRegistrar = solicitud.id_cuenta_bancaria_origen
        ? await movimientoSinRegistrar(bancoApiService.referenciaDeOperacion(solicitud.numero_caso, solicitud.fecha_solicitud), 'DEBITO')
        : null;
      const updateQuery = `
        UPDATE solicitudes_traslado_apertura 
        SET estado = 'RECHAZADO',
            id_operador_resuelve = $1,
            observaciones_operador = $2,
            fecha_resolucion = CURRENT_TIMESTAMP
        WHERE id_solicitud = $3 AND estado = 'PENDIENTE'
        RETURNING id_solicitud, numero_caso, estado, fecha_resolucion
      `;
      const updateRes = await db.query(updateQuery, [idOperador, observaciones || 'Rechazado por operador.', id]);
      if (updateRes.rowCount === 0) {
        return res.status(409).json({ success: false, message: 'Esa solicitud ya fue resuelta.' });
      }
      const reversion = await revertirMovimientoSinRegistrar(sinRegistrar, {
        origen: 'TRASLADO',
        concepto: `Reversión de traslado rechazado - Caso ${solicitud.numero_caso}`,
        detalle: `Caso ${solicitud.numero_caso} (rechazado)`,
        clave: solicitud.id_solicitud,
      });
      return res.status(200).json({
        success: true,
        message: `Solicitud rechazada.${avisoDeReversion(reversion)}`,
        data: updateRes.rows[0],
      });
    }

    // ACCION === 'APROBAR'
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Se bloquea la solicitud y se vuelve a revisar: si dos operadores aprueban a la vez, el segundo se
      // detiene aquí, antes de mover dinero.
      const bloqueo = await client.query(
        'SELECT estado FROM solicitudes_traslado_apertura WHERE id_solicitud = $1 FOR UPDATE',
        [id]
      );
      if (bloqueo.rows[0]?.estado !== 'PENDIENTE') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ success: false, message: 'Esa solicitud ya fue resuelta.' });
      }

      const monto = parseFloat(solicitud.monto);
      // Débito en el banco, si el origen es una cuenta del banco: se hace al final, justo antes del COMMIT (issue #31)
      let debitoBanco = null;

      // Obtener saldo de cuenta origen con bloqueo (banco o cooperativa)
      if (solicitud.id_cuenta_bancaria_origen) {
        const assocCui = await client.query(
          `SELECT p.cui_dpi FROM asociados a JOIN personas p ON a.id_persona = p.id_persona WHERE a.id_asociado = $1`,
          [solicitud.id_asociado]
        );
        let numCuentaBco = null;
        let bancoSinRespuesta = false;
        if (assocCui.rows.length > 0 && assocCui.rows[0].cui_dpi) {
          const bcoRes = await bancoApiService.obtenerCuentasCliente(assocCui.rows[0].cui_dpi);
          if (bcoRes.success && Array.isArray(bcoRes.data)) {
            const foundCta = bcoRes.data.find(c => String(c.id_cuenta_bancaria) === String(solicitud.id_cuenta_bancaria_origen));
            if (foundCta) numCuentaBco = foundCta.numero_cuenta_bancaria;
          } else {
            bancoSinRespuesta = true;
          }
        }
        // Si la cuenta no aparece entre las del asociado, no se debita nada (no se usa su id como número)
        if (!numCuentaBco) {
          throw bancoSinRespuesta
            ? errorDeNegocio(502, 'No pudimos comunicarnos con el banco. Intente de nuevo en unos minutos.')
            : errorDeNegocio(404, 'No encontramos la cuenta del banco de origen entre las del asociado.');
        }

        // La referencia es la del caso: si un intento anterior agotó el tiempo pero el banco sí debitó, el banco no
        // debita dos veces. Si ese intento quedó por revertir, hasta conciliarlo no se vuelve a debitar.
        const referenciaCaso = bancoApiService.referenciaDeOperacion(solicitud.numero_caso, solicitud.fecha_solicitud);
        if (await hayReversionPendiente(client, referenciaCaso)) {
          throw errorDeNegocio(409, 'Un intento anterior de este caso quedó pendiente de conciliar con el banco. El administrador debe conciliarlo antes de aprobarlo.');
        }
        debitoBanco = {
          numero_cuenta: numCuentaBco,
          // El banco rechaza el débito si la cuenta no es del asociado.
          cui_dpi: assocCui.rows[0]?.cui_dpi,
          monto,
          concepto: `Traslado a Cuenta Cooperativa - Caso ${solicitud.numero_caso}`,
          referencia: referenciaCaso,
        };
      } else {
        const originQuery = 'SELECT saldo_disponible, numero_cuenta FROM cuentas WHERE id_cuenta = $1 FOR UPDATE';
        const originRes = await client.query(originQuery, [solicitud.id_cuenta_origen]);
        
        if (originRes.rows.length === 0) {
          throw errorDeNegocio(404, 'Cuenta de origen no encontrada.');
        }

        const saldoOrigen = parseFloat(originRes.rows[0].saldo_disponible);
        if (saldoOrigen < monto) {
          throw errorDeNegocio(400, `Saldo insuficiente en cuenta de origen para procesar el traslado (Saldo: Q${saldoOrigen.toFixed(2)}).`);
        }

        const nuevoSaldoOrigen = saldoOrigen - monto;
        await client.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [
          nuevoSaldoOrigen,
          solicitud.id_cuenta_origen
        ]);

        await client.query(`
          INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
          VALUES ($1, 'RETIRO', $2, $3, $4, $5, $6)
        `, [
          solicitud.id_cuenta_origen,
          monto,
          saldoOrigen,
          nuevoSaldoOrigen,
          `Débito Planilla - Caso ${solicitud.numero_caso}`,
          idOperador
        ]);
      }

      let idCuentaDestino = solicitud.id_cuenta_destino;

      if (solicitud.tipo_operacion === 'APERTURA_Y_TRASLADO') {
        let prefix = 'AHORR';
        if (solicitud.id_tipo_cuenta_destino === 3) prefix = 'PLAZO';
        else if (solicitud.id_tipo_cuenta_destino === 5) prefix = 'METAS';

        let numeroCuentaNuevo = '';
        let exists = true;
        while (exists) {
          numeroCuentaNuevo = `CTA-${prefix}-${String(Math.floor(1000 + Math.random() * 9000))}`;
          const checkQuery = 'SELECT id_cuenta FROM cuentas WHERE numero_cuenta = $1';
          const checkRes = await client.query(checkQuery, [numeroCuentaNuevo]);
          if (checkRes.rows.length === 0) {
            exists = false;
          }
        }

        const insertCtaRes = await client.query(`
          INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
          VALUES ($1, $2, $3, $4, 0.00, 'ACTIVA')
          RETURNING id_cuenta
        `, [
          numeroCuentaNuevo,
          solicitud.id_asociado,
          solicitud.id_tipo_cuenta_destino,
          monto
        ]);
        idCuentaDestino = insertCtaRes.rows[0].id_cuenta;

        await client.query('UPDATE solicitudes_traslado_apertura SET id_cuenta_destino = $1 WHERE id_solicitud = $2', [
          idCuentaDestino,
          id
        ]);

        await client.query(`
          INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
          VALUES ($1, 'DEPOSITO', $2, 0.00, $3, $4, $5)
        `, [
          idCuentaDestino,
          monto,
          monto,
          `Apertura de Cuenta - Caso ${solicitud.numero_caso}`,
          idOperador
        ]);

      } else {
        const destQuery = 'SELECT saldo_disponible FROM cuentas WHERE id_cuenta = $1 FOR UPDATE';
        const destRes = await client.query(destQuery, [idCuentaDestino]);
        if (destRes.rows.length === 0) {
          throw errorDeNegocio(404, 'Cuenta de destino no encontrada.');
        }

        const saldoDestino = parseFloat(destRes.rows[0].saldo_disponible);
        const nuevoSaldoDestino = saldoDestino + monto;

        await client.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [
          nuevoSaldoDestino,
          idCuentaDestino
        ]);

        await client.query(`
          INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
          VALUES ($1, 'DEPOSITO', $2, $3, $4, $5, $6)
        `, [
          idCuentaDestino,
          monto,
          saldoDestino,
          nuevoSaldoDestino,
          `Crédito Traslado - Caso ${solicitud.numero_caso}`,
          idOperador
        ]);
      }

      const finalUpdateQuery = `
        UPDATE solicitudes_traslado_apertura
        SET estado = 'APROBADO',
            id_operador_resuelve = $1,
            observaciones_operador = $2,
            fecha_resolucion = CURRENT_TIMESTAMP
        WHERE id_solicitud = $3
        RETURNING id_solicitud, numero_caso, estado, fecha_resolucion
      `;
      const finalUpdateRes = await client.query(finalUpdateQuery, [
        idOperador,
        observaciones || 'Aprobado y ejecutado por operador.',
        id
      ]);

      // Débito en el banco (último paso): si falla, el ROLLBACK deshace lo de la cooperativa
      if (debitoBanco) {
        const debitRes = await bancoApiService.debitarConReferenciaDeOperacion(debitoBanco);
        if (!debitRes.success) {
          const porReferencia = bancoApiService.mensajePorReferencia(debitRes);
          if (porReferencia) throw errorDeNegocio(409, porReferencia);
          throw errorDeNegocio(estadoPorFalloDelBanco(debitRes.status), debitRes.message || 'No se pudo debitar la cuenta bancaria de origen.');
        }
        debitoBanco.referencia = debitRes.referencia_usada;
        // El banco devolvió el débito de un intento anterior: si ese intento se está revirtiendo, no se registra
        if (debitRes.idempotente && await hayReversionPendiente(client, debitoBanco.referencia)) {
          throw errorDeNegocio(409, 'Un intento anterior de este caso se está revirtiendo en el banco. Espere a que termine y vuelva a intentarlo.');
        }
      }

      try {
        await client.query('COMMIT');
      } catch (commitError) {
        if (!debitoBanco) throw commitError;
        // El dinero ya salió del banco: se devuelve, o queda en «Conciliación» si no se puede. Si el COMMIT sí se
        // aplicó (se confirma con otra conexión), el traslado quedó hecho y se responde como tal.
        const reversion = await revertirOAnotar({
          origen: 'TRASLADO',
          tipo: 'CREDITO',
          numeroCuenta: debitoBanco.numero_cuenta,
          cui: debitoBanco.cui_dpi,
          monto,
          referencia: debitoBanco.referencia,
          concepto: `Reversión de traslado no completado - Caso ${solicitud.numero_caso}`,
          detalle: `Caso ${solicitud.numero_caso}`,
          clave: solicitud.id_solicitud,
          pid: client.processID,
        });
        if (!reversion.aplicada) throw errorTrasCommitFallido(reversion, commitError, debitoBanco.referencia);
      }
      client.release();

      return res.status(200).json({
        success: true,
        message: 'Traslado aprobado y fondos acreditados.',
        data: finalUpdateRes.rows[0],
      });

    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      throw txError;
    }

  } catch (error) {
    console.error('Error en operadorController.resolverSolicitud:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo resolver la solicitud. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Obtener solicitudes de afiliación en agencia (Nuevos Asociados)
 * GET /api/operador/afiliaciones
 */
const getBandejaAfiliaciones = async (req, res) => {
  try {
    const { search, estado } = req.query;

    // 1. Limpieza preventiva de bloqueos vencidos (> 15 minutos)
    await db.query(`
      UPDATE solicitudes_afiliacion_agencia 
      SET id_operador_bloqueo = NULL, fecha_bloqueo = NULL 
      WHERE id_operador_bloqueo IS NOT NULL AND fecha_bloqueo <= NOW() - INTERVAL '15 minutes'
    `);

    // 2. Consulta de solicitudes con filtros
    let query = `
      SELECT 
        s.id_solicitud,
        s.numero_caso,
        s.cui_dpi,
        s.primer_nombre,
        s.segundo_nombre,
        s.primer_apellido,
        s.segundo_apellido,
        (s.primer_nombre || ' ' || COALESCE(s.segundo_nombre || ' ', '') || s.primer_apellido || ' ' || COALESCE(s.segundo_apellido, '')) AS nombre_completo,
        s.telefono,
        s.direccion,
        s.fecha_nacimiento,
        s.email,
        s.monto_estimado AS monto_inicial_propuesto,
        s.monto_estimado,
        s.observaciones,
        s.estado,
        s.fecha_solicitud,
        s.id_operador_bloqueo,
        s.fecha_bloqueo,
        s.id_operador_resuelve,
        s.fecha_resolucion,
        op_bloq.primer_nombre || ' ' || op_bloq.primer_apellido AS operador_bloqueo_nombre,
        op_bloq_u.codigo_corporativo AS operador_bloqueo_codigo,
        op_res.primer_nombre || ' ' || op_res.primer_apellido AS operador_resuelve_nombre,
        u_asoc.codigo_corporativo AS asociado_codigo,
        p_asoc.id_persona AS id_persona_registrada,
        (a_asoc.id_asociado IS NOT NULL) AS ya_es_asociado,
        EXISTS (SELECT 1 FROM usuarios u_per WHERE u_per.id_persona = p_asoc.id_persona AND u_per.id_rol <> 3) AS es_personal,
        COALESCE(s.numero_cuenta_bancaria, c_asoc.numero_cuenta) AS numero_cuenta,
        s.numero_cuenta_bancaria,
        COALESCE(s.monto_estimado, c_asoc.saldo_disponible) AS saldo_disponible
      FROM solicitudes_afiliacion_agencia s
      LEFT JOIN usuarios op_bloq_u ON op_bloq_u.id_usuario = s.id_operador_bloqueo
      LEFT JOIN personas op_bloq ON op_bloq.id_persona = op_bloq_u.id_persona
      LEFT JOIN usuarios op_res_u ON op_res_u.id_usuario = s.id_operador_resuelve
      LEFT JOIN personas op_res ON op_res.id_persona = op_res_u.id_persona
      LEFT JOIN personas p_asoc ON p_asoc.cui_dpi = s.cui_dpi
      LEFT JOIN usuarios u_asoc ON u_asoc.id_persona = p_asoc.id_persona AND u_asoc.id_rol = 3 /* ASOCIADO */
      LEFT JOIN asociados a_asoc ON a_asoc.id_persona = p_asoc.id_persona
      LEFT JOIN cuentas c_asoc ON c_asoc.id_asociado = a_asoc.id_asociado AND c_asoc.estado = 'ACTIVA'
      WHERE 1=1
    `;

    const params = [];
    if (estado) {
      params.push(estado);
      query += ` AND s.estado = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      query += ` AND (
        LOWER(s.numero_caso) LIKE $${pIdx} OR 
        s.cui_dpi LIKE $${pIdx} OR 
        LOWER(s.primer_nombre) LIKE $${pIdx} OR 
        LOWER(s.primer_apellido) LIKE $${pIdx} OR
        LOWER(s.primer_nombre || ' ' || s.primer_apellido) LIKE $${pIdx}
      )`;
    }

    query += `
      ORDER BY 
        CASE WHEN s.estado = 'PENDIENTE_AGENCIA' THEN 1 ELSE 2 END,
        s.fecha_solicitud DESC
    `;

    const result = await db.query(query, params);

    const idOperador = req.user?.id_usuario;
    result.rows.forEach((r) => {
      r.esta_bloqueado = !!(r.id_operador_bloqueo && r.fecha_bloqueo);
      r.bloqueado_por_mi = r.id_operador_bloqueo === idOperador;
      // La persona ya está en la cooperativa (por ejemplo, alguien del personal): se conservan sus datos
      r.persona_registrada = Boolean(r.id_persona_registrada);
      // Su propia solicitud la atiende un colega (issue #32)
      r.es_propia = Number(r.id_persona_registrada) === Number(req.user?.id_persona);
      delete r.id_persona_registrada;
    });

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en operadorController.getBandejaAfiliaciones:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar la bandeja de afiliaciones. Intente de nuevo.',
    });
  }
};

/**
 * Bloquear caso de afiliación para atención exclusiva
 * POST /api/operador/afiliaciones/:id/bloquear
 */
const bloquearCasoAfiliacion = async (req, res) => {
  try {
    const result = await operadorAfiliacionService.bloquearCaso({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.bloquearCasoAfiliacion:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo tomar el caso. Intente de nuevo.',
    });
  }
};

/**
 * Liberar bloqueo de un caso de afiliación
 * POST /api/operador/afiliaciones/:id/liberar
 */
const liberarCasoAfiliacion = async (req, res) => {
  try {
    const result = await operadorAfiliacionService.liberarCaso({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
      esAdmin: req.user.rol === 'ADMINISTRADOR',
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.liberarCasoAfiliacion:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo liberar el caso. Intente de nuevo.',
    });
  }
};

/**
 * Formalizar y completar la afiliación en ventanilla
 * POST /api/operador/afiliaciones/:id/formalizar
 */
const formalizarAfiliacion = async (req, res) => {
  try {
    const result = await operadorAfiliacionService.formalizarAfiliacion({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
      rolUsuario: req.user.rol,
      nombreOperador: req.user.nombre || req.user.nombre_completo || req.user.codigo_corporativo,
      datos: req.body,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.formalizarAfiliacion:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo formalizar la afiliación. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Rechazar / Cancelar caso de afiliación en agencia
 * POST /api/operador/afiliaciones/:id/rechazar
 */
const rechazarCasoAfiliacion = async (req, res) => {
  try {
    const result = await operadorAfiliacionService.rechazarCaso({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
      motivo: req.body.motivo,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.rechazarCasoAfiliacion:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo rechazar el caso. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Obtener todas las solicitudes de crédito para revisión operativa
 * GET /api/operador/creditos
 */
const getBandejaCreditos = async (req, res) => {
  try {
    const query = `
      SELECT 
        sc.id_solicitud_credito,
        sc.monto_solicitado,
        sc.plazo_meses,
        sc.tasa_interes,
        sc.cuota_mensual_estimada,
        sc.estado,
        sc.observaciones,
        sc.fecha_solicitud,
        sc.fecha_resolucion,
        sc.id_cuenta_bancaria_destino,
        sc.id_cuenta_destino,
        sc.cuenta_destino_info,
        sc.documento_firmado_url,
        sc.nombre_archivo_firmado,
        sc.peso_archivo_bytes,
        sc.fecha_carga_archivo,
        sc.id_operador_revisa,
        sc.dictamen_operador,
        sc.fecha_revision_operador,
        sc.id_ejecutivo_resuelve,
        sc.observaciones_ejecutivo,
        sc.fecha_resolucion_ejecutivo,
        sc.cuenta_destino_info AS cuenta_bancaria_destino_numero,
        'BANCO' AS cuenta_bancaria_destino_tipo,
        c.numero_cuenta AS cuenta_cooperativa_destino_numero,
        a.id_asociado,
        p.cui_dpi,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        u.email,
        u.codigo_corporativo,
        analista.primer_nombre AS analista_nombre,
        analista.primer_apellido AS analista_apellido,
        op_rev.primer_nombre AS operador_revisa_nombre,
        op_rev.primer_apellido AS operador_revisa_apellido,
        ej_res.primer_nombre AS ejecutivo_resuelve_nombre,
        ej_res.primer_apellido AS ejecutivo_resuelve_apellido
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN cuentas c ON sc.id_cuenta_destino = c.id_cuenta
      LEFT JOIN usuarios u ON u.id_persona = p.id_persona AND u.id_rol = 3 /* ASOCIADO */
      LEFT JOIN usuarios analista_u ON analista_u.id_usuario = sc.id_analista
      LEFT JOIN personas analista ON analista.id_persona = analista_u.id_persona
      LEFT JOIN usuarios op_rev_u ON op_rev_u.id_usuario = sc.id_operador_revisa
      LEFT JOIN personas op_rev ON op_rev.id_persona = op_rev_u.id_persona
      LEFT JOIN usuarios ej_res_u ON ej_res_u.id_usuario = sc.id_ejecutivo_resuelve
      LEFT JOIN personas ej_res ON ej_res.id_persona = ej_res_u.id_persona
      ORDER BY 
        CASE 
          WHEN sc.estado IN ('EN_REVISION_OPERADOR', 'PENDIENTE') THEN 1 
          WHEN sc.estado = 'DEVUELTA_OPERADOR' THEN 2 
          WHEN sc.estado = 'EN_AUTORIZACION_EJECUTIVO' THEN 3
          ELSE 4 
        END,
        sc.fecha_solicitud DESC
    `;
    const result = await db.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en operadorController.getBandejaCreditos:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las solicitudes. Intente de nuevo.',
    });
  }
};

/**
 * Rechazar una solicitud de crédito desde la bandeja del operador. Aprobar y desembolsar lo hace el
 * ejecutivo (ver `operadorCreditoService.resolverCredito`).
 * POST /api/operador/creditos/:id/resolver
 */
const resolverSolicitudCredito = async (req, res) => {
  try {
    const result = await operadorCreditoService.resolverCredito({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
      accion: req.body.accion,
      observaciones: req.body.observaciones,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.resolverSolicitudCredito:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo resolver la solicitud de crédito. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Obtener la evaluación crediticia e historial financiero para una solicitud de crédito
 * GET /api/operador/creditos/:id/evaluacion
 */
const getEvaluacionCredito = async (req, res) => {
  try {
    const result = await operadorCreditoService.obtenerEvaluacionCredito(req.params.id);
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.getEvaluacionCredito:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar la evaluación. Intente de nuevo.',
    });
  }
};

/**
 * Elevar una solicitud de crédito al rol de Ejecutivo tras dictamen operativo
 * POST /api/operador/creditos/:id/elevar
 */
const elevarSolicitudCredito = async (req, res) => {
  try {
    const result = await operadorCreditoService.elevarCredito({
      idSolicitud: req.params.id,
      idOperador: req.user.id_usuario,
      dictamen_operador: req.body.dictamen_operador,
      documento_firmado: req.body.documento_firmado,
      nombre_archivo_firmado: req.body.nombre_archivo_firmado,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error('Error en operadorController.elevarSolicitudCredito:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo enviar la solicitud al ejecutivo. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Obtener historial de solicitudes de traslado y aperturas con filtros y buscador por asociado
 * GET /api/operador/traslados/historial
 */
const getHistorialTraslados = async (req, res) => {
  try {
    const { search, estado, id_asociado } = req.query;

    let query = `
      SELECT 
        s.id_solicitud,
        s.numero_caso,
        s.monto,
        s.tipo_operacion,
        s.estado,
        s.fecha_solicitud,
        s.fecha_resolucion,
        s.observaciones_operador,
        s.id_asociado,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.cui_dpi,
        p.telefono,
        u.email,
        u.codigo_corporativo,
        s.id_cuenta_bancaria_origen,
        COALESCE(co.numero_cuenta, ('CTA-BCO-' || s.id_cuenta_bancaria_origen)) AS cuenta_origen_numero,
        cd.numero_cuenta AS cuenta_destino_numero,
        tc.nombre AS tipo_cuenta_destino_nombre,
        op_p.primer_nombre AS operador_nombre,
        op_p.primer_apellido AS operador_apellido
      FROM solicitudes_traslado_apertura s
      JOIN asociados a ON s.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN usuarios u ON u.id_persona = p.id_persona AND u.id_rol = 3 /* ASOCIADO */
      LEFT JOIN cuentas co ON s.id_cuenta_origen = co.id_cuenta
      JOIN tipos_cuenta tc ON s.id_tipo_cuenta_destino = tc.id_tipo_cuenta
      LEFT JOIN cuentas cd ON s.id_cuenta_destino = cd.id_cuenta
      LEFT JOIN usuarios op_p_u ON op_p_u.id_usuario = s.id_operador_resuelve
      LEFT JOIN personas op_p ON op_p.id_persona = op_p_u.id_persona
      WHERE 1=1
    `;
    const params = [];

    if (id_asociado) {
      params.push(parseInt(id_asociado, 10));
      query += ` AND s.id_asociado = $${params.length}`;
    }

    if (estado && estado !== 'TODOS') {
      params.push(estado);
      query += ` AND s.estado = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIndex = params.length;
      query += ` AND (
        LOWER(p.primer_nombre) LIKE $${pIndex} OR
        LOWER(p.primer_apellido) LIKE $${pIndex} OR
        LOWER(COALESCE(p.segundo_nombre, '')) LIKE $${pIndex} OR
        LOWER(COALESCE(p.segundo_apellido, '')) LIKE $${pIndex} OR
        LOWER(p.cui_dpi) LIKE $${pIndex} OR
        LOWER(COALESCE(u.codigo_corporativo, '')) LIKE $${pIndex} OR
        LOWER(s.numero_caso) LIKE $${pIndex} OR
        LOWER(COALESCE(cd.numero_cuenta, '')) LIKE $${pIndex} OR
        LOWER(COALESCE(co.numero_cuenta, '')) LIKE $${pIndex} OR
        CAST(s.id_asociado AS TEXT) = $${pIndex}
      )`;
    }

    query += ` ORDER BY s.fecha_solicitud DESC LIMIT 200`;

    const result = await db.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en operadorController.getHistorialTraslados:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar el historial de traslados. Intente de nuevo.',
    });
  }
};

/**
 * Indica al operador si el correo de la cooperativa funciona, antes de afiliar (issue #26).
 * Sin correo no se puede crear el acceso al portal: la contraseña temporal solo viaja por correo.
 *
 * @route GET /api/operador/correo-estado
 */
const getEstadoCorreo = (req, res) => {
  return res.status(200).json({
    success: true,
    disponible: mailerService.isAvailable(),
  });
};

module.exports = {
  getEstadoCorreo,
  getBandejaSolicitudes,
  resolverSolicitud,
  getBandejaAfiliaciones,
  bloquearCasoAfiliacion,
  liberarCasoAfiliacion,
  formalizarAfiliacion,
  rechazarCasoAfiliacion,
  getBandejaCreditos,
  resolverSolicitudCredito,
  elevarSolicitudCredito,
  getEvaluacionCredito,
  getHistorialTraslados,
};
