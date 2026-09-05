const db = require('../config/db');

/**
 * Obtener solicitudes en estado 'PENDIENTE'
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
        a.id_asociado,
        co.numero_cuenta AS cuenta_origen_numero,
        co.saldo_disponible AS cuenta_origen_saldo,
        cd.numero_cuenta AS cuenta_destino_numero,
        tc.nombre AS tipo_cuenta_destino_nombre
      FROM solicitudes_traslado_apertura s
      JOIN asociados a ON s.id_asociado = a.id_asociado
      JOIN personas p ON a.id_persona = p.id_persona
      JOIN cuentas co ON s.id_cuenta_origen = co.id_cuenta
      JOIN tipos_cuenta tc ON s.id_tipo_cuenta_destino = tc.id_tipo_cuenta
      LEFT JOIN cuentas cd ON s.id_cuenta_destino = cd.id_cuenta
      WHERE s.estado = 'PENDIENTE'
      ORDER BY s.fecha_solicitud ASC
    `;
    const result = await db.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en operadorController.getBandejaSolicitudes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener la bandeja de solicitudes.',
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
  const idOperador = req.user.id_persona;

  if (!['APROBAR', 'RECHAZAR'].includes(accion)) {
    return res.status(400).json({
      success: false,
      message: "La acción debe ser 'APROBAR' o 'RECHAZAR'.",
    });
  }

  try {
    // 1. Obtener la solicitud
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
        message: `Esta solicitud ya fue resuelta anteriormente (Estado: ${solicitud.estado}).`,
      });
    }

    // 2. Si se RECHAZA, simplemente actualizar el estado
    if (accion === 'RECHAZAR') {
      const updateQuery = `
        UPDATE solicitudes_traslado_apertura 
        SET estado = 'RECHAZADO',
            id_operador_resuelve = $1,
            observaciones_operador = $2,
            fecha_resolucion = CURRENT_TIMESTAMP
        WHERE id_solicitud = $3
        RETURNING id_solicitud, numero_caso, estado, fecha_resolucion
      `;
      const updateRes = await db.query(updateQuery, [idOperador, observaciones || 'Rechazado por operador.', id]);
      return res.status(200).json({
        success: true,
        message: 'Solicitud rechazada exitosamente.',
        data: updateRes.rows[0],
      });
    }

    // 3. Si se APRUEBA, iniciar una transacción SQL
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Obtener saldo de cuenta origen con bloqueo
      const originQuery = 'SELECT saldo_disponible, numero_cuenta FROM cuentas WHERE id_cuenta = $1 FOR UPDATE';
      const originRes = await client.query(originQuery, [solicitud.id_cuenta_origen]);
      
      if (originRes.rows.length === 0) {
        throw new Error('Cuenta de origen no encontrada.');
      }

      const saldoOrigen = parseFloat(originRes.rows[0].saldo_disponible);
      const monto = parseFloat(solicitud.monto);

      if (saldoOrigen < monto) {
        throw new Error(`Saldo insuficiente en cuenta de origen para procesar el traslado (Saldo: Q${saldoOrigen.toFixed(2)}).`);
      }

      // Restar saldo de origen
      const nuevoSaldoOrigen = saldoOrigen - monto;
      await client.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [
        nuevoSaldoOrigen,
        solicitud.id_cuenta_origen
      ]);

      // Registrar transacción de débito (RETIRO)
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

      let idCuentaDestino = solicitud.id_cuenta_destino;

      if (solicitud.tipo_operacion === 'APERTURA_Y_TRASLADO') {
        // Generar un número de cuenta único para el nuevo producto
        let prefix = 'AHORR';
        if (solicitud.id_tipo_cuenta_destino === 1) prefix = 'APORT';
        else if (solicitud.id_tipo_cuenta_destino === 3) prefix = 'PLAZO';
        else if (solicitud.id_tipo_cuenta_destino === 5) prefix = 'METAS';

        // Generar número de cuenta aleatorio y validar que no exista
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

        // Crear la cuenta destino con el saldo inicial del traslado
        const insertCtaQuery = `
          INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
          VALUES ($1, $2, $3, $4, 0.00, 'ACTIVA')
          RETURNING id_cuenta
        `;
        const insertCtaRes = await client.query(insertCtaQuery, [
          numeroCuentaNuevo,
          solicitud.id_asociado,
          solicitud.id_tipo_cuenta_destino,
          monto
        ]);
        idCuentaDestino = insertCtaRes.rows[0].id_cuenta;

        // Actualizar la solicitud con la cuenta de destino generada
        await client.query('UPDATE solicitudes_traslado_apertura SET id_cuenta_destino = $1 WHERE id_solicitud = $2', [
          idCuentaDestino,
          id
        ]);

        // Registrar transacción de crédito (DEPOSITO) para la nueva cuenta
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
        // TRASLADO_DIRECTO a una cuenta existente
        const destQuery = 'SELECT saldo_disponible FROM cuentas WHERE id_cuenta = $1 FOR UPDATE';
        const destRes = await client.query(destQuery, [idCuentaDestino]);
        if (destRes.rows.length === 0) {
          throw new Error('Cuenta de destino no encontrada.');
        }

        const saldoDestino = parseFloat(destRes.rows[0].saldo_disponible);
        const nuevoSaldoDestino = saldoDestino + monto;

        // Acreditar saldo en destino
        await client.query('UPDATE cuentas SET saldo_disponible = $1 WHERE id_cuenta = $2', [
          nuevoSaldoDestino,
          idCuentaDestino
        ]);

        // Registrar transacción de crédito (DEPOSITO) para la cuenta existente
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

      // Actualizar estado de la solicitud a APROBADO
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

      await client.query('COMMIT');
      client.release();

      return res.status(200).json({
        success: true,
        message: 'Solicitud aprobada y fondos trasladados exitosamente.',
        data: finalUpdateRes.rows[0],
      });

    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      throw txError;
    }

  } catch (error) {
    console.error('Error en operadorController.resolverSolicitud:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al procesar la resolución de la solicitud.',
    });
  }
};

module.exports = {
  getBandejaSolicitudes,
  resolverSolicitud,
};
