const db = require('../config/db');
const socketService = require('../services/socketService');
const bancoApiService = require('../services/bancoApiService');
const { saveBase64File } = require('../utils/fileStorage');

/**
 * Obtener solicitudes de crédito para revisión y resolución de la Gerencia Ejecutiva
 * GET /api/ejecutivo/creditos
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
        op_rev.primer_nombre AS operador_revisa_nombre,
        op_rev.primer_apellido AS operador_revisa_apellido,
        ej_res.primer_nombre AS ejecutivo_resuelve_nombre,
        ej_res.primer_apellido AS ejecutivo_resuelve_apellido
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      LEFT JOIN cuentas c ON sc.id_cuenta_destino = c.id_cuenta
      LEFT JOIN usuarios u ON p.id_persona = u.id_persona
      LEFT JOIN personas op_rev ON sc.id_operador_revisa = op_rev.id_persona
      LEFT JOIN personas ej_res ON sc.id_ejecutivo_resuelve = ej_res.id_persona
      ORDER BY 
        CASE 
          WHEN sc.estado = 'EN_AUTORIZACION_EJECUTIVO' THEN 1 
          WHEN sc.estado = 'DEVUELTA_OPERADOR' THEN 2
          WHEN sc.estado = 'APROBADA' THEN 3
          WHEN sc.estado = 'DENEGADA' THEN 4
          ELSE 5 
        END,
        sc.fecha_revision_operador DESC NULLS LAST,
        sc.fecha_solicitud DESC
    `;
    const result = await db.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en ejecutivoController.getBandejaCreditos:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las solicitudes. Intente de nuevo.',
    });
  }
};

/**
 * Resolver una solicitud de crédito en el nivel Ejecutivo:
 * Acciones exclusivas:
 * 1. ACEPTAR: Aprueba la solicitud y acredita/desembolsa los fondos inmediatamente.
 * 2. DEVOLVER: Devuelve el expediente al Operador solicitando subsanación o corrección.
 * 3. DENEGAR: Rechaza formal y definitivamente la solicitud de crédito.
 * 
 * POST /api/ejecutivo/creditos/:id/resolver
 */
const resolverSolicitudCredito = async (req, res) => {
  const { id } = req.params;
  const { accion, observaciones, documento_firmado, nombre_archivo_firmado } = req.body;
  const idEjecutivo = req.user.id_persona;

  const ACCIONES_VALIDAS = ['ACEPTAR', 'DEVOLVER', 'DENEGAR'];
  if (!ACCIONES_VALIDAS.includes(accion)) {
    return res.status(400).json({
      success: false,
      message: `Acción inválida. Las opciones permitidas son: ${ACCIONES_VALIDAS.join(', ')}.`,
    });
  }

  // Devolver y Denegar requieren obligatoriamente observaciones justificativas
  if (['DEVOLVER', 'DENEGAR'].includes(accion) && (!observaciones || observaciones.trim() === '')) {
    return res.status(400).json({
      success: false,
      message: `Escriba el motivo de su decisión.`,
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener la solicitud con bloqueo transaccional estricto
    const solRes = await client.query(`
      SELECT sc.*, a.id_persona, p.primer_nombre, p.primer_apellido
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      WHERE sc.id_solicitud_credito = $1
      FOR UPDATE
    `, [id]);

    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'No encontramos esa solicitud.',
      });
    }

    const sol = solRes.rows[0];

    if (sol.estado !== 'EN_AUTORIZACION_EJECUTIVO') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Esa solicitud ya no está pendiente de su autorización.`,
      });
    }

    // Procesar archivo firmado si fue adjuntado por el Ejecutivo
    let fileData = null;
    if (documento_firmado) {
      fileData = await saveBase64File(
        documento_firmado,
        'creditos',
        nombre_archivo_firmado || `resolucion_ejecutivo_sol_${id}.pdf`,
        `solicitud_credito_${id}_ej`
      );
    }

    // ACCIÓN: DEVOLVER AL OPERADOR
    if (accion === 'DEVOLVER') {
      let devolverQuery = `
        UPDATE solicitudes_credito
        SET 
          estado = 'DEVUELTA_OPERADOR',
          id_ejecutivo_resuelve = $1,
          observaciones_ejecutivo = $2,
          fecha_resolucion_ejecutivo = CURRENT_TIMESTAMP
      `;
      const devolverParams = [idEjecutivo, observaciones.trim()];

      if (fileData) {
        devolverQuery += `,
          documento_firmado_url = $${devolverParams.length + 1},
          nombre_archivo_firmado = $${devolverParams.length + 2},
          peso_archivo_bytes = $${devolverParams.length + 3},
          fecha_carga_archivo = CURRENT_TIMESTAMP
        `;
        devolverParams.push(fileData.relativeUrl, fileData.filename, fileData.sizeBytes);
      }

      devolverQuery += ` WHERE id_solicitud_credito = $${devolverParams.length + 1} RETURNING *`;
      devolverParams.push(id);

      const updateRes = await client.query(devolverQuery, devolverParams);

      await client.query('COMMIT');

      // Notificaciones WebSocket
      try {
        socketService.emitToRole('OPERADOR', 'solicitud_credito:devuelta', {
          id_solicitud_credito: id,
          monto: sol.monto_solicitado,
          asociado: `${sol.primer_nombre} ${sol.primer_apellido}`,
          observaciones_ejecutivo: observaciones.trim(),
        });
        socketService.emitToUser(sol.id_persona, 'solicitud_credito:actualizada', {
          id_solicitud_credito: id,
          estado: 'DEVUELTA_OPERADOR',
          mensaje: 'Su solicitud ha sido devuelta al operador para revisión de observaciones adicionales.',
        });
      } catch (sockErr) {
        console.warn('Error emitiendo socket al devolver crédito:', sockErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `La solicitud #${id} se devolvió al operador con sus observaciones.`,
        data: updateRes.rows[0],
      });
    }

    // ACCIÓN: DENEGAR DEFINITIVAMENTE
    if (accion === 'DENEGAR') {
      let denegarQuery = `
        UPDATE solicitudes_credito
        SET 
          estado = 'DENEGADA',
          id_ejecutivo_resuelve = $1,
          id_analista = $1,
          observaciones_ejecutivo = $2,
          observaciones = COALESCE($2, observaciones),
          fecha_resolucion = CURRENT_TIMESTAMP,
          fecha_resolucion_ejecutivo = CURRENT_TIMESTAMP
      `;
      const denegarParams = [idEjecutivo, observaciones.trim()];

      if (fileData) {
        denegarQuery += `,
          documento_firmado_url = $${denegarParams.length + 1},
          nombre_archivo_firmado = $${denegarParams.length + 2},
          peso_archivo_bytes = $${denegarParams.length + 3},
          fecha_carga_archivo = CURRENT_TIMESTAMP
        `;
        denegarParams.push(fileData.relativeUrl, fileData.filename, fileData.sizeBytes);
      }

      denegarQuery += ` WHERE id_solicitud_credito = $${denegarParams.length + 1} RETURNING *`;
      denegarParams.push(id);

      const updateRes = await client.query(denegarQuery, denegarParams);

      await client.query('COMMIT');

      // Notificaciones WebSocket
      try {
        socketService.emitToUser(sol.id_persona, 'solicitud_credito:actualizada', {
          id_solicitud_credito: id,
          estado: 'DENEGADA',
          mensaje: `Su solicitud de crédito ha sido denegada por la gerencia ejecutiva. Motivo: ${observaciones.trim()}`,
        });
      } catch (sockErr) {
        console.warn('Error emitiendo socket al denegar crédito:', sockErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Se denegó la solicitud #${id}.`,
        data: updateRes.rows[0],
      });
    }

    // ACCIÓN: ACEPTAR (Aprobación y Desembolso Financiero Inmediato)
    if (accion === 'ACEPTAR' && !documento_firmado) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Adjunte el PDF firmado por usted para aprobar la solicitud.',
      });
    }

    const monto = parseFloat(sol.monto_solicitado);
    let cuentaBancariaId = sol.id_cuenta_bancaria_destino;
    let cuentaCoopId = sol.id_cuenta_destino;
    let destinoInfo = sol.cuenta_destino_info;

    // Si no tenía cuenta fijada, auto-detectar cuenta activa de acreditación
    if (!cuentaBancariaId && !cuentaCoopId) {
      let autoBcoAccount = null;
      if (sol.cui_dpi) {
        const bcoRes = await bancoApiService.obtenerCuentasCliente(sol.cui_dpi);
        if (bcoRes.success && Array.isArray(bcoRes.data)) {
          autoBcoAccount = bcoRes.data.find(c => c.estado === 'ACTIVA');
        }
      }

      if (autoBcoAccount) {
        cuentaBancariaId = autoBcoAccount.id_cuenta_bancaria;
        destinoInfo = `Cuenta Bancaria de ${autoBcoAccount.tipo_cuenta} (${autoBcoAccount.numero_cuenta_bancaria})`;
      } else {
        const autoCoop = await client.query(`
          SELECT c.id_cuenta, c.numero_cuenta, tc.nombre AS tipo_cuenta
          FROM cuentas c
          JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
          WHERE c.id_asociado = $1 AND c.estado = 'ACTIVA'
          ORDER BY c.id_cuenta ASC LIMIT 1
        `, [sol.id_asociado]);

        if (autoCoop.rows.length > 0) {
          cuentaCoopId = autoCoop.rows[0].id_cuenta;
          destinoInfo = `Cuenta de ${autoCoop.rows[0].tipo_cuenta} (${autoCoop.rows[0].numero_cuenta})`;
        } else {
          throw new Error('El asociado no posee una cuenta activa para realizar la acreditación de los fondos.');
        }
      }
    }

    // Acreditación según el destino
    if (cuentaBancariaId) {
      let targetNumeroCuenta = null;
      if (sol.cui_dpi) {
        const bcoRes = await bancoApiService.obtenerCuentasCliente(sol.cui_dpi);
        if (bcoRes.success && Array.isArray(bcoRes.data)) {
          const matched = bcoRes.data.find(c => String(c.id_cuenta_bancaria) === String(cuentaBancariaId));
          if (matched) targetNumeroCuenta = matched.numero_cuenta_bancaria;
        }
      }
      if (!targetNumeroCuenta && destinoInfo) {
        const matchRegex = destinoInfo.match(/\((CTA-BCO-[^)]+)\)/i);
        if (matchRegex) targetNumeroCuenta = matchRegex[1];
      }

      if (!targetNumeroCuenta) {
        targetNumeroCuenta = String(cuentaBancariaId);
      }

      // Acreditar en Core Banking API (banco_db)
      const acreRes = await bancoApiService.acreditarCuenta({
        numero_cuenta: targetNumeroCuenta,
        monto,
        concepto: `Desembolso de Crédito Aprobado por Ejecutivo - Solicitud #${id}`,
        referencia: `SOL-CRED-${id}`,
      });

      if (!acreRes.success) {
        throw new Error(acreRes.message || 'Error al acreditar fondos en la cuenta bancaria corporativa.');
      }
    } else if (cuentaCoopId) {
      const coopRes = await client.query(`
        SELECT id_cuenta, numero_cuenta, saldo_disponible
        FROM cuentas
        WHERE id_cuenta = $1
        FOR UPDATE
      `, [cuentaCoopId]);

      if (coopRes.rows.length === 0) {
        throw new Error('La cuenta cooperativa de acreditación no existe o fue cancelada.');
      }

      const saldoAnterior = parseFloat(coopRes.rows[0].saldo_disponible);
      const saldoPosterior = saldoAnterior + monto;

      await client.query(`
        UPDATE cuentas 
        SET saldo_disponible = $1 
        WHERE id_cuenta = $2
      `, [saldoPosterior, cuentaCoopId]);

      await client.query(`
        INSERT INTO transacciones (
          id_cuenta, id_usuario, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia
        ) VALUES ($1, $2, 'DEPOSITO', $3, $4, $5, $6)
      `, [
        cuentaCoopId,
        idEjecutivo,
        monto,
        saldoAnterior,
        saldoPosterior,
        `Desembolso de Crédito Aprobado por Ejecutivo - Solicitud #${id}`
      ]);
    }

    // Actualización de estado en solicitudes_credito
    const obsFinal = observaciones && observaciones.trim() !== '' ? observaciones.trim() : 'Aprobado y desembolsado por Gerencia Ejecutiva.';
    let aceptarQuery = `
      UPDATE solicitudes_credito
      SET 
        estado = 'APROBADA',
        id_ejecutivo_resuelve = $1,
        id_analista = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        fecha_resolucion_ejecutivo = CURRENT_TIMESTAMP,
        id_cuenta_bancaria_destino = $2,
        id_cuenta_destino = $3,
        cuenta_destino_info = $4,
        observaciones_ejecutivo = $5
    `;
    const aceptarParams = [idEjecutivo, cuentaBancariaId, cuentaCoopId, destinoInfo, obsFinal];

    if (fileData) {
      aceptarQuery += `,
        documento_firmado_url = $${aceptarParams.length + 1},
        nombre_archivo_firmado = $${aceptarParams.length + 2},
        peso_archivo_bytes = $${aceptarParams.length + 3},
        fecha_carga_archivo = CURRENT_TIMESTAMP
      `;
      aceptarParams.push(fileData.relativeUrl, fileData.filename, fileData.sizeBytes);
    }

    aceptarQuery += ` WHERE id_solicitud_credito = $${aceptarParams.length + 1} RETURNING *`;
    aceptarParams.push(id);

    const updateRes = await client.query(aceptarQuery, aceptarParams);

    await client.query('COMMIT');

    // Notificaciones WebSocket
    try {
      socketService.emitToUser(sol.id_persona, 'solicitud_credito:actualizada', {
        id_solicitud_credito: id,
        estado: 'APROBADA',
        monto: monto,
        mensaje: `¡Felicidades! Su crédito por Q${monto.toFixed(2)} ha sido ACEPTADO y acreditado exitosamente a su ${destinoInfo}.`,
      });
      socketService.emitToRole('OPERADOR', 'solicitud_credito:actualizada', {
        id_solicitud_credito: id,
        estado: 'APROBADA',
        mensaje: `Crédito #${id} aprobado y desembolsado por Gerencia Ejecutiva.`,
      });
    } catch (sockErr) {
      console.warn('Error emitiendo socket al aceptar crédito:', sockErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Se aprobó la solicitud #${id} y se acreditaron Q${monto.toFixed(2)} a ${destinoInfo}.`,
      data: updateRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en ejecutivoController.resolverSolicitudCredito:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar la resolución de la solicitud de crédito.',
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getBandejaCreditos,
  resolverSolicitudCredito,
};
