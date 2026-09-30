/**
 * Servicio de Dominio: Créditos Operativos (ARQ-03)
 * Centraliza la lógica de negocio, evaluación crediticia, elevación a ejecutivo y desembolso contable.
 */

const db = require('../config/db');
const creditScoringService = require('./creditScoringService');
const bancoApiService = require('./bancoApiService');
const socketService = require('./socketService');
const { saveBase64File } = require('../utils/fileStorage');

/**
 * Obtiene la evaluación crediticia y scoring para una solicitud de crédito
 */
const obtenerEvaluacionCredito = async (idSolicitud) => {
  const credRes = await db.query(
    `SELECT sc.id_solicitud_credito, sc.id_asociado, sc.monto_solicitado, sc.plazo_meses, sc.tasa_interes, sc.cuota_mensual_estimada, sc.estado,
            a.id_persona, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.cui_dpi, p.telefono,
            u.email, u.codigo_corporativo
     FROM solicitudes_credito sc
     JOIN asociados a ON sc.id_asociado = a.id_asociado
     JOIN personas p ON a.id_persona = p.id_persona
     LEFT JOIN usuarios u ON p.id_persona = u.id_persona
     WHERE sc.id_solicitud_credito = $1`,
    [idSolicitud]
  );

  if (credRes.rows.length === 0) {
    return {
      status: 404,
      success: false,
      message: 'No encontramos esa solicitud.',
    };
  }

  const credito = credRes.rows[0];
  const evaluacion = await creditScoringService.evaluarSolicitudCrediticia({
    idAsociado: credito.id_asociado,
    idPersona: credito.id_persona,
    montoSolicitado: parseFloat(credito.monto_solicitado),
  });

  return {
    status: 200,
    success: true,
    data: {
      solicitud: credito,
      evaluacion,
    },
  };
};

/**
 * Eleva una solicitud de crédito al rol de Ejecutivo tras dictamen operativo
 */
const elevarCredito = async ({ idSolicitud, idOperador, dictamen_operador, documento_firmado, nombre_archivo_firmado }) => {
  if (!dictamen_operador || dictamen_operador.trim() === '') {
    return {
      status: 400,
      success: false,
      message: 'Escriba su dictamen antes de enviar la solicitud al ejecutivo.',
    };
  }

  const checkRes = await db.query(
    `SELECT sc.*, a.id_persona AS id_persona_asociado, p.primer_nombre, p.primer_apellido
     FROM solicitudes_credito sc
     JOIN asociados a ON sc.id_asociado = a.id_asociado
     JOIN personas p ON a.id_persona = p.id_persona
     WHERE sc.id_solicitud_credito = $1`,
    [idSolicitud]
  );

  if (checkRes.rows.length === 0) {
    return {
      status: 404,
      success: false,
      message: 'No encontramos esa solicitud.',
    };
  }

  const sol = checkRes.rows[0];
  const estadosPermitidos = ['EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR', 'PENDIENTE'];
  if (!estadosPermitidos.includes(sol.estado)) {
    return {
      status: 400,
      success: false,
      message: `Esa solicitud no se puede enviar al ejecutivo en su estado actual.`,
    };
  }

  if (!documento_firmado) {
    return {
      status: 400,
      success: false,
      message: 'Adjunte el PDF firmado por usted para enviar la solicitud al ejecutivo.',
    };
  }

  let fileData = null;
  if (documento_firmado) {
    fileData = await saveBase64File(
      documento_firmado,
      'creditos',
      nombre_archivo_firmado || `dictamen_operador_sol_${idSolicitud}.pdf`,
      `solicitud_credito_${idSolicitud}_op`
    );
  }

  let updateQuery = `
    UPDATE solicitudes_credito
    SET 
      estado = 'EN_AUTORIZACION_EJECUTIVO',
      id_operador_revisa = $1,
      dictamen_operador = $2,
      fecha_revision_operador = CURRENT_TIMESTAMP
  `;
  const updateParams = [idOperador, dictamen_operador.trim()];

  if (fileData) {
    updateQuery += `,
      documento_firmado_url = $${updateParams.length + 1},
      nombre_archivo_firmado = $${updateParams.length + 2},
      peso_archivo_bytes = $${updateParams.length + 3},
      fecha_carga_archivo = CURRENT_TIMESTAMP
    `;
    updateParams.push(fileData.relativeUrl, fileData.filename, fileData.sizeBytes);
  }

  updateQuery += ` WHERE id_solicitud_credito = $${updateParams.length + 1} RETURNING *`;
  updateParams.push(idSolicitud);

  const updateRes = await db.query(updateQuery, updateParams);

  // Notificaciones en tiempo real por WebSockets
  try {
    socketService.emitToRole('EJECUTIVO', 'solicitud_credito:elevada', {
      id_solicitud_credito: idSolicitud,
      monto: sol.monto_solicitado,
      asociado: `${sol.primer_nombre} ${sol.primer_apellido}`,
      dictamen: dictamen_operador.trim(),
    });
    socketService.emitToUser(sol.id_persona_asociado, 'solicitud_credito:actualizada', {
      id_solicitud_credito: idSolicitud,
      estado: 'EN_AUTORIZACION_EJECUTIVO',
      mensaje: 'Su solicitud ha sido revisada por el operador y elevada al Comité Ejecutivo para su dictamen final.',
    });
  } catch (sockErr) {
    console.warn('Aviso: Error emitiendo socket en elevarCredito:', sockErr.message);
  }

  return {
    status: 200,
    success: true,
    message: `La solicitud #${idSolicitud} se envió al ejecutivo con su dictamen.`,
    data: updateRes.rows[0],
  };
};

/**
 * Resuelve una solicitud de crédito (APROBAR o RECHAZAR) con desembolso contable
 */
const resolverCredito = async ({ idSolicitud, idOperador, accion, observaciones }) => {
  if (!['APROBAR', 'RECHAZAR'].includes(accion)) {
    return {
      status: 400,
      success: false,
      message: "La acción debe ser 'APROBAR' o 'RECHAZAR'.",
    };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener la solicitud con bloqueo
    const solRes = await client.query(`
      SELECT sc.*, a.id_persona
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      WHERE sc.id_solicitud_credito = $1
      FOR UPDATE
    `, [idSolicitud]);

    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 404,
        success: false,
        message: 'No encontramos esa solicitud.',
      };
    }

    const sol = solRes.rows[0];

    const estadosPermitidos = ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'];
    if (!estadosPermitidos.includes(sol.estado)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: `Esa solicitud ya fue resuelta.`,
      };
    }

    if (accion === 'RECHAZAR') {
      const updateRes = await client.query(`
        UPDATE solicitudes_credito
        SET 
          estado = 'RECHAZADA',
          id_analista = $1,
          id_operador_revisa = $1,
          fecha_resolucion = CURRENT_TIMESTAMP,
          fecha_revision_operador = CURRENT_TIMESTAMP,
          dictamen_operador = COALESCE($2, dictamen_operador),
          observaciones = COALESCE($2, observaciones)
        WHERE id_solicitud_credito = $3
        RETURNING id_solicitud_credito, monto_solicitado, estado, fecha_resolucion
      `, [idOperador, observaciones || null, idSolicitud]);

      await client.query('COMMIT');
      return {
        status: 200,
        success: true,
        message: `Se rechazó la solicitud #${idSolicitud}.`,
        data: updateRes.rows[0],
      };
    }

    // ACCION === 'APROBAR': Desembolso y acreditación contable
    if (accion === 'APROBAR' && !documento_firmado) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'Adjunte el PDF firmado por usted para aprobar la solicitud.',
      };
    }
    const monto = parseFloat(sol.monto_solicitado);
    let cuentaBancariaId = sol.id_cuenta_bancaria_destino;
    let cuentaCoopId = sol.id_cuenta_destino;
    let destinoInfo = sol.cuenta_destino_info;

    // Si la solicitud no tenía cuenta fijada, buscar la cuenta bancaria o cooperativa del asociado
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
          throw new Error('El asociado no posee ninguna cuenta activa (de ahorro o monetaria) para acreditar el desembolso.');
        }
      }
    }

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
        concepto: `Desembolso de Crédito Aprobado - Solicitud #${idSolicitud}`,
        referencia: `SOL-CRED-${idSolicitud}`,
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
          id_cuenta, id_usuario_registra, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia
        ) VALUES ($1, $2, 'DEPOSITO', $3, $4, $5, $6)
      `, [
        cuentaCoopId,
        idOperador,
        monto,
        saldoAnterior,
        saldoPosterior,
        `Desembolso de Crédito Aprobado - Solicitud #${idSolicitud}`
      ]);
    }

    // Actualizar solicitud
    const updateRes = await client.query(`
      UPDATE solicitudes_credito
      SET 
        estado = 'APROBADA',
        id_analista = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        id_cuenta_bancaria_destino = $2,
        id_cuenta_destino = $3,
        cuenta_destino_info = $4,
        observaciones = COALESCE($5, observaciones)
      WHERE id_solicitud_credito = $6
      RETURNING id_solicitud_credito, monto_solicitado, estado, fecha_resolucion, cuenta_destino_info
    `, [idOperador, cuentaBancariaId, cuentaCoopId, destinoInfo, observaciones || null, idSolicitud]);

    await client.query('COMMIT');

    return {
      status: 200,
      success: true,
      message: `Se aprobó la solicitud #${idSolicitud} y se acreditaron Q${monto.toFixed(2)} a ${destinoInfo}.`,
      data: updateRes.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  obtenerEvaluacionCredito,
  elevarCredito,
  resolverCredito,
};
