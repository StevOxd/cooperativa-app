const db = require('../config/db');
const socketService = require('../services/socketService');
const bancoApiService = require('../services/bancoApiService');
const { saveBase64File, eliminarArchivoGuardado, eliminarPdfDeCreditoSinUso } = require('../utils/fileStorage');
const { errorDeNegocio, respuestaDeError } = require('../utils/errores');
const {
  revertirOAnotar,
  errorTrasCommitFallido,
  hayReversionPendiente,
  movimientoSinRegistrar,
  revertirMovimientoSinRegistrar,
  avisoDeReversion,
} = require('../services/reversionesService');

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
      LEFT JOIN usuarios u ON u.id_persona = p.id_persona AND u.id_rol = 3 /* ASOCIADO */
      LEFT JOIN usuarios op_rev_u ON op_rev_u.id_usuario = sc.id_operador_revisa
      LEFT JOIN personas op_rev ON op_rev.id_persona = op_rev_u.id_persona
      LEFT JOIN usuarios ej_res_u ON ej_res_u.id_usuario = sc.id_ejecutivo_resuelve
      LEFT JOIN personas ej_res ON ej_res.id_persona = ej_res_u.id_persona
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
 * En ACEPTAR, el desembolso a una cuenta del banco es el último paso antes del COMMIT (issue #54): si el banco
 * falla no se aprueba nada. Si falla el COMMIT, `revertirOAnotar` confirma el estado con otra conexión y, si la
 * solicitud no quedó aprobada, retira el dinero del banco; si tampoco puede, queda en «Conciliación».
 *
 * POST /api/ejecutivo/creditos/:id/resolver
 *
 * @param {import('express').Request} req - `req.params.id`; `req.body`: `{ accion, observaciones,
 *   documento_firmado, nombre_archivo_firmado }`. ACEPTAR exige el PDF firmado; DEVOLVER y DENEGAR, el motivo.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 al resolver; 400 por datos inválidos o si la solicitud ya
 *   no espera al ejecutivo; 403 si quien aprueba es quien la elevó; 409 si no la elevó un operador; 404 si no existe o la cuenta de destino no es del asociado; 409 si no tiene cuenta
 *   activa o el banco rechaza la acreditación; 502 o 504 si el banco no responde; 500 si no se completa.
 */
const resolverSolicitudCredito = async (req, res) => {
  const { id } = req.params;
  const { accion, observaciones, documento_firmado, nombre_archivo_firmado } = req.body;
  const idEjecutivo = req.user.id_usuario;

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
  let conexionRota = false;
  // El PDF del ejecutivo se borra si la resolución no se completa (issue #63)
  let fileData = null;
  // Si el COMMIT informa un error, pudo aplicarse igual: el PDF se borra solo si la solicitud no lo guardó
  let commitIntentado = false;
  try {
    await client.query('BEGIN');

    // 1. Obtener la solicitud con bloqueo transaccional estricto
    const solRes = await client.query(`
      SELECT sc.*, a.id_persona, p.cui_dpi, p.primer_nombre, p.primer_apellido,
        (SELECT u.id_usuario FROM usuarios u WHERE u.id_persona = a.id_persona AND u.id_rol = 3 /* ASOCIADO */) AS id_usuario_asociado
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      WHERE sc.id_solicitud_credito = $1
      FOR UPDATE OF sc
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

    // La referencia del desembolso es la de la solicitud: si un intento anterior agotó el tiempo pero el banco sí
    // acreditó, el banco no acredita dos veces. Si ese intento quedó por revertir, no se vuelve a aprobar.
    const referenciaSolicitud = bancoApiService.referenciaDeOperacion(`SOL-CRED-${sol.id_solicitud_credito}`, sol.fecha_solicitud);
    if (accion === 'ACEPTAR' && await hayReversionPendiente(client, referenciaSolicitud)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Un intento anterior de esta solicitud quedó pendiente de conciliar con el banco. Pida al administrador que lo concilie en «Conciliación» antes de aprobarla.',
      });
    }

    // Cuatro ojos: una solicitud se aprueba solo si la elevó un operador, y no la aprueba quien la elevó
    if (accion === 'ACEPTAR' && !sol.id_operador_revisa) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Esta solicitud no tiene la revisión de un operador: debe elevarla un operador antes de aprobarla.',
      });
    }
    if (accion === 'ACEPTAR') {
      const elevo = await client.query('SELECT id_persona FROM usuarios WHERE id_usuario = $1', [sol.id_operador_revisa]);
      if (
        Number(sol.id_operador_revisa) === Number(idEjecutivo)
        || Number(elevo.rows[0]?.id_persona) === Number(req.user.id_persona)
      ) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: 'APROBACION_POR_QUIEN_ELEVO',
          message: 'Usted elevó esta solicitud: la aprueba otra persona del comité de crédito.',
        });
      }
    }

    // Al devolver o denegar: un intento anterior de aprobarla pudo dejar el desembolso en el banco sin registrar (un
    // tiempo agotado). Se busca ahora (sin poder consultar el banco no se resuelve) y se retira después del COMMIT.
    const sinRegistrar = accion === 'ACEPTAR' ? null : await movimientoSinRegistrar(referenciaSolicitud, 'CREDITO');
    const revertirIntentoAnterior = () => revertirMovimientoSinRegistrar(sinRegistrar, {
      origen: 'DESEMBOLSO_CREDITO',
      concepto: `Reversión de desembolso: la solicitud #${sol.id_solicitud_credito} no se aprobó`,
      detalle: `Solicitud de crédito #${sol.id_solicitud_credito} (${accion === 'DEVOLVER' ? 'devuelta' : 'denegada'})`,
      clave: sol.id_solicitud_credito,
    });

    // Procesar archivo firmado si fue adjuntado por el Ejecutivo
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

      commitIntentado = true;
      await client.query('COMMIT');
      const reversion = await revertirIntentoAnterior();

      // Notificaciones WebSocket
      try {
        socketService.emitToRole('OPERADOR', 'solicitud_credito:devuelta', {
          id_solicitud_credito: id,
          monto: sol.monto_solicitado,
          asociado: `${sol.primer_nombre} ${sol.primer_apellido}`,
          observaciones_ejecutivo: observaciones.trim(),
        });
        socketService.emitToUser(sol.id_usuario_asociado, 'solicitud_credito:actualizada', {
          id_solicitud_credito: id,
          estado: 'DEVUELTA_OPERADOR',
          mensaje: 'Su solicitud ha sido devuelta al operador para revisión de observaciones adicionales.',
        });
      } catch (sockErr) {
        console.warn('Error emitiendo socket al devolver crédito:', sockErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `La solicitud #${id} se devolvió al operador con sus observaciones.${avisoDeReversion(reversion)}`,
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

      commitIntentado = true;
      await client.query('COMMIT');
      const reversion = await revertirIntentoAnterior();

      // Notificaciones WebSocket
      try {
        socketService.emitToUser(sol.id_usuario_asociado, 'solicitud_credito:actualizada', {
          id_solicitud_credito: id,
          estado: 'DENEGADA',
          mensaje: `Su solicitud de crédito ha sido denegada por la gerencia ejecutiva. Motivo: ${observaciones.trim()}`,
        });
      } catch (sockErr) {
        console.warn('Error emitiendo socket al denegar crédito:', sockErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Se denegó la solicitud #${id}.${avisoDeReversion(reversion)}`,
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
          throw errorDeNegocio(409, 'El asociado no posee una cuenta activa para realizar la acreditación de los fondos.');
        }
      }
    }

    // Acreditación según el destino. La del banco se hace al final, justo antes del COMMIT (como el traslado,
    // issue #31): si algo falla antes no salió dinero, y si falla el COMMIT se revierte.
    let acreditacionBanco = null;
    if (cuentaBancariaId) {
      // El número sale de las cuentas que el banco devuelve para el DPI del titular: así el dinero solo va a
      // una cuenta suya, y sin el número no se acredita (el banco identifica la cuenta solo por su número)
      const bcoRes = sol.cui_dpi ? await bancoApiService.obtenerCuentasCliente(sol.cui_dpi) : null;
      if (!bcoRes?.success || !Array.isArray(bcoRes.data)) {
        throw errorDeNegocio(502, 'No pudimos comunicarnos con el banco. Intente de nuevo en unos minutos.');
      }
      const cuentaDestino = bcoRes.data.find(c => String(c.id_cuenta_bancaria) === String(cuentaBancariaId));
      if (!cuentaDestino?.numero_cuenta_bancaria) {
        throw errorDeNegocio(404, 'No encontramos la cuenta del banco de destino entre las del asociado.');
      }

      acreditacionBanco = {
        numero_cuenta: cuentaDestino.numero_cuenta_bancaria,
        monto,
        concepto: `Desembolso de Crédito Aprobado por Ejecutivo - Solicitud #${sol.id_solicitud_credito}`,
        referencia: referenciaSolicitud,
      };
    } else if (cuentaCoopId) {
      const coopRes = await client.query(`
        SELECT id_cuenta, numero_cuenta, saldo_disponible
        FROM cuentas
        WHERE id_cuenta = $1 AND id_asociado = $2 AND estado = 'ACTIVA'
        FOR UPDATE
      `, [cuentaCoopId, sol.id_asociado]);

      if (coopRes.rows.length === 0) {
        throw errorDeNegocio(409, 'La cuenta cooperativa de acreditación no existe o fue cancelada.');
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
          id_cuenta, id_usuario_registra, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia
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

    // Acreditación en el banco (último paso): si falla, el ROLLBACK deshace lo de la cooperativa
    if (acreditacionBanco) {
      const acreRes = await bancoApiService.acreditarConReferenciaDeOperacion(acreditacionBanco);
      if (!acreRes.success) {
        console.error(`[ERROR] El banco no acreditó ${acreRes.referencia_usada} (${acreRes.status}):`, acreRes.message);
        if (acreRes.status === 504) {
          throw errorDeNegocio(504, 'El banco no confirmó a tiempo. Puede intentarlo de nuevo: si el desembolso ya había entrado, no se acredita dos veces.');
        }
        // Por ejemplo, un intento anterior acreditó en otra cuenta del asociado
        const porReferencia = bancoApiService.mensajePorReferencia(acreRes);
        if (porReferencia) throw errorDeNegocio(409, porReferencia);
        throw acreRes.status >= 500 || !acreRes.status
          ? errorDeNegocio(502, 'El banco no respondió. No se desembolsó nada: intente de nuevo en unos minutos.')
          : errorDeNegocio(409, 'El banco rechazó la acreditación en la cuenta de destino. Revise la cuenta del asociado.');
      }
      acreditacionBanco.referencia = acreRes.referencia_usada;
      // El banco devolvió el desembolso de un intento anterior: si ese intento se está revirtiendo, no se aprueba
      if (acreRes.idempotente && await hayReversionPendiente(client, acreditacionBanco.referencia)) {
        throw errorDeNegocio(409, 'Un intento anterior de esta solicitud se está revirtiendo en el banco. Espere a que termine y vuelva a intentarlo.');
      }
    }

    try {
      commitIntentado = true;
      await client.query('COMMIT');
    } catch (commitError) {
      if (!acreditacionBanco) throw commitError;
      // El dinero ya entró al banco: se retira, o queda en «Conciliación» si no se puede. Si el COMMIT sí se aplicó
      // (se confirma con otra conexión), la solicitud quedó aprobada y se responde como tal.
      const reversion = await revertirOAnotar({
        origen: 'DESEMBOLSO_CREDITO',
        tipo: 'DEBITO',
        numeroCuenta: acreditacionBanco.numero_cuenta,
        cui: sol.cui_dpi,
        monto,
        referencia: acreditacionBanco.referencia,
        concepto: `Reversión de desembolso no completado - Solicitud #${sol.id_solicitud_credito}`,
        detalle: `Solicitud de crédito #${sol.id_solicitud_credito}`,
        clave: sol.id_solicitud_credito,
        pid: client.processID,
      });
      if (!reversion.aplicada) throw errorTrasCommitFallido(reversion, commitError, acreditacionBanco.referencia);
    }

    // Notificaciones WebSocket
    try {
      socketService.emitToUser(sol.id_usuario_asociado, 'solicitud_credito:actualizada', {
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
    // Si ni el ROLLBACK responde, la conexión se descarta en lugar de volver al pool
    await client.query('ROLLBACK').catch(() => { conexionRota = true; });
    // La resolución no se completó: el PDF sobra, salvo que un COMMIT que informó un error sí lo haya guardado
    if (commitIntentado) await eliminarPdfDeCreditoSinUso(fileData);
    else await eliminarArchivoGuardado(fileData);
    console.error('Error en ejecutivoController.resolverSolicitudCredito:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo resolver la solicitud de crédito. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  } finally {
    client.release(conexionRota);
  }
};

module.exports = {
  getBandejaCreditos,
  resolverSolicitudCredito,
};
