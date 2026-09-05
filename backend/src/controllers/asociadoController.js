const db = require('../config/db');

// Constantes institucionales para eliminación de números mágicos
const CONSTANTS = {
  TIPO_CUENTA_PLANILLA: 'Cuenta de Planilla',
};

/**
 * Obtiene el perfil integral del asociado autenticado con sus datos personales y membresía.
 *
 * @async
 * @function getPerfil
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con datos del asociado.
 * @returns {Promise<import('express').Response>} Retorna 200 con el perfil, 404 si no existe asociado o 500.
 */
const getPerfil = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        p.id_persona,
        p.cui_dpi,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        a.id_asociado,
        a.fecha_ingreso,
        a.estado_asociado,
        u.codigo_corporativo,
        u.email
      FROM personas p
      JOIN asociados a ON p.id_persona = a.id_persona
      JOIN usuarios u ON p.id_persona = u.id_persona
      WHERE p.id_persona = $1
      LIMIT 1
    `;
    const result = await db.query(query, [idPersona]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Datos de asociado no encontrados.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.getPerfil:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el perfil del asociado.',
    });
  }
};

/**
 * Obtener cuentas activas del asociado
 * GET /api/asociado/cuentas
 */
const getCuentas = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        c.saldo_reserva,
        c.estado,
        c.fecha_apertura,
        tc.nombre AS tipo_cuenta,
        tc.tasa_interes_anual
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1
      ORDER BY c.id_cuenta ASC
    `;
    const result = await db.query(query, [idPersona]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getCuentas:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las cuentas del asociado.',
    });
  }
};

/**
 * Obtener transacciones de una cuenta específica del asociado
 * GET /api/asociado/cuentas/:id_cuenta/transacciones
 */
const getTransacciones = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta } = req.params;

    // 1. Validar que la cuenta pertenece al asociado logueado
    const ownershipQuery = `
      SELECT c.id_cuenta 
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      WHERE c.id_cuenta = $1 AND a.id_persona = $2
    `;
    const ownershipRes = await db.query(ownershipQuery, [id_cuenta, idPersona]);

    if (ownershipRes.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Esta cuenta no le pertenece o no existe.',
      });
    }

    // 2. Traer transacciones
    const txQuery = `
      SELECT 
        t.id_transaccion,
        t.tipo_transaccion,
        t.monto,
        t.saldo_anterior,
        t.saldo_nuevo,
        t.referencia,
        t.fecha_transaccion
      FROM transacciones t
      WHERE t.id_cuenta = $1
      ORDER BY t.fecha_transaccion DESC, t.id_transaccion DESC
    `;
    const txRes = await db.query(txQuery, [id_cuenta]);

    return res.status(200).json({
      success: true,
      data: txRes.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getTransacciones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las transacciones de la cuenta.',
    });
  }
};

/**
 * Listar solicitudes de crédito del asociado
 * GET /api/asociado/creditos
 */
const getCreditos = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        sc.id_solicitud_credito,
        sc.monto_solicitado,
        sc.plazo_meses,
        sc.tasa_interes,
        sc.cuota_mensual_estimada,
        sc.estado,
        sc.observaciones,
        sc.fecha_solicitud
      FROM solicitudes_credito sc
      JOIN asociados a ON sc.id_asociado = a.id_asociado
      WHERE a.id_persona = $1
      ORDER BY sc.fecha_solicitud DESC
    `;
    const result = await db.query(query, [idPersona]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getCreditos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener las solicitudes de crédito.',
    });
  }
};

/**
 * Crear una nueva solicitud de crédito
 * POST /api/asociado/creditos
 */
const createCredito = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { monto_solicitado, plazo_meses, observaciones } = req.body;

    // 1. Validar inputs
    const monto = parseFloat(monto_solicitado);
    const plazo = parseInt(plazo_meses, 10);

    if (isNaN(monto) || monto <= 0 || isNaN(plazo) || plazo <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese un monto y plazo en meses válidos mayores a cero.',
      });
    }

    // 2. Obtener id_asociado
    const assocRes = await db.query('SELECT id_asociado FROM asociados WHERE id_persona = $1 LIMIT 1', [idPersona]);
    if (assocRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró un registro de asociado para este usuario.',
      });
    }
    const idAsociado = assocRes.rows[0].id_asociado;

    // 3. Calcular cuota mensual (Fórmula de amortización francesa)
    // Tasa base anual del 10% (0.10)
    const tasaAnual = 10.00;
    const tasaMensual = (tasaAnual / 100) / 12;

    let cuotaMensual = 0;
    if (tasaMensual > 0) {
      cuotaMensual = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
    } else {
      cuotaMensual = monto / plazo;
    }

    // Redondear a dos decimales
    cuotaMensual = Math.round(cuotaMensual * 100) / 100;

    // 4. Registrar la solicitud
    const insertQuery = `
      INSERT INTO solicitudes_credito (
        id_asociado, 
        monto_solicitado, 
        plazo_meses, 
        tasa_interes, 
        cuota_mensual_estimada, 
        estado, 
        observaciones
      )
      VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6)
      RETURNING id_solicitud_credito, monto_solicitado, plazo_meses, tasa_interes, cuota_mensual_estimada, estado, fecha_solicitud
    `;
    const result = await db.query(insertQuery, [
      idAsociado,
      monto,
      plazo,
      tasaAnual,
      cuotaMensual,
      observaciones || 'Solicitud enviada por autogestión'
    ]);

    return res.status(201).json({
      success: true,
      message: 'Solicitud de crédito registrada exitosamente.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.createCredito:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar la solicitud de crédito.',
    });
  }
};

/**
 * Obtiene la cuenta de nómina/planilla activa asociada a la persona autenticada.
 *
 * @async
 * @function getCuentaPlanilla
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con la cuenta encontrada.
 * @returns {Promise<import('express').Response>} Retorna 200 con la cuenta, 404 si no posee planilla activa o 500.
 */
const getCuentaPlanilla = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        c.saldo_reserva,
        c.estado,
        tc.nombre AS tipo_cuenta
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1 AND tc.nombre = $2 AND c.estado = 'ACTIVA'
      LIMIT 1
    `;
    const result = await db.query(query, [idPersona, CONSTANTS.TIPO_CUENTA_PLANILLA]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No posee una Cuenta de Planilla activa.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.getCuentaPlanilla:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener la cuenta de planilla.',
    });
  }
};

/**
 * Obtiene las cuentas activas del asociado elegibles como destino de traslados y los tipos de cuenta
 * disponibles para nueva apertura inmediata. Excluye la cuenta de planilla.
 *
 * @async
 * @function getMisCuentasDestino
 * @param {import('express').Request} req - Solicitud HTTP con `req.user.id_persona`.
 * @param {import('express').Response} res - Respuesta HTTP con cuentasExistentes y tiposDisponibles.
 * @returns {Promise<import('express').Response>} Retorna 200 con el objeto agrupado o 500.
 */
const getMisCuentasDestino = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    // 1. Cuentas destino existentes (excluye Cuenta de Planilla)
    const existingCuentasQuery = `
      SELECT 
        c.id_cuenta,
        c.numero_cuenta,
        c.saldo_disponible,
        tc.id_tipo_cuenta,
        tc.nombre AS tipo_cuenta
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE a.id_persona = $1 AND tc.nombre != $2 AND c.estado = 'ACTIVA'
      ORDER BY c.id_cuenta ASC
    `;
    const existingRes = await db.query(existingCuentasQuery, [idPersona, CONSTANTS.TIPO_CUENTA_PLANILLA]);

    // 2. Tipos de cuenta disponibles para nueva apertura (excluye planilla y las que ya posee)
    const availableTypesQuery = `
      SELECT 
        tc.id_tipo_cuenta,
        tc.nombre,
        tc.tasa_interes_anual,
        tc.monto_minimo_apertura,
        tc.descripcion
      FROM tipos_cuenta tc
      WHERE tc.id_tipo_cuenta NOT IN (
        SELECT c.id_tipo_cuenta 
        FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        WHERE a.id_persona = $1 AND c.estado = 'ACTIVA'
      ) AND tc.nombre != $2
      ORDER BY tc.id_tipo_cuenta ASC
    `;
    const availableRes = await db.query(availableTypesQuery, [idPersona, CONSTANTS.TIPO_CUENTA_PLANILLA]);

    return res.status(200).json({
      success: true,
      data: {
        cuentasExistentes: existingRes.rows,
        tiposDisponibles: availableRes.rows,
      },
    });
  } catch (error) {
    console.error('Error en asociadoController.getMisCuentasDestino:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener opciones de cuentas destino.',
    });
  }
};

/**
 * Crea una nueva solicitud de traslado de fondos o apertura de producto para revisión operativa.
 *
 * @async
 * @function createSolicitudTraslado
 * @param {import('express').Request} req - Solicitud HTTP con los datos del traslado.
 * @param {import('express').Response} res - Respuesta HTTP.
 * @returns {Promise<import('express').Response>} Retorna 201 al crear la solicitud o 400/403 ante validaciones.
 */
const createSolicitudTraslado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;
    const { id_cuenta_origen, id_cuenta_destino, id_tipo_cuenta_destino, monto, tipo_operacion } = req.body;

    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese un monto de traslado válido mayor a cero.',
      });
    }

    if (!['TRASLADO_DIRECTO', 'APERTURA_Y_TRASLADO'].includes(tipo_operacion)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de operación de traslado no válido.',
      });
    }

    // 1. Validar que la cuenta de origen (planilla) pertenece al asociado y está activa
    const originQuery = `
      SELECT c.id_cuenta, c.saldo_disponible, a.id_asociado
      FROM cuentas c
      JOIN asociados a ON c.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
      WHERE c.id_cuenta = $1 AND a.id_persona = $2 AND tc.nombre = $3 AND c.estado = 'ACTIVA'
    `;
    const originRes = await db.query(originQuery, [id_cuenta_origen, idPersona, CONSTANTS.TIPO_CUENTA_PLANILLA]);
    if (originRes.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Cuenta de planilla no válida o inactiva.',
      });
    }

    const { saldo_disponible, id_asociado } = originRes.rows[0];

    // 2. Validar que posee saldo disponible suficiente
    if (parsedMonto > parseFloat(saldo_disponible)) {
      return res.status(400).json({
        success: false,
        message: `Saldo insuficiente. Su cuenta de planilla dispone de Q${parseFloat(saldo_disponible).toFixed(2)}.`,
      });
    }

    // 3. Validaciones adicionales del destino
    if (tipo_operacion === 'TRASLADO_DIRECTO') {
      if (!id_cuenta_destino) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar la cuenta de destino para traslados directos.',
        });
      }
      // Verificar propiedad de la cuenta destino
      const destQuery = `
        SELECT id_cuenta FROM cuentas c
        JOIN asociados a ON c.id_asociado = a.id_asociado
        WHERE c.id_cuenta = $1 AND a.id_persona = $2 AND c.estado = 'ACTIVA'
      `;
      const destRes = await db.query(destQuery, [id_cuenta_destino, idPersona]);
      if (destRes.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: La cuenta de destino no le pertenece o está inactiva.',
        });
      }
    } else {
      // APERTURA_Y_TRASLADO
      if (!id_tipo_cuenta_destino) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar el tipo de cuenta a abrir.',
        });
      }
      // Validar monto mínimo de apertura
      const typeQuery = 'SELECT nombre, monto_minimo_apertura FROM tipos_cuenta WHERE id_tipo_cuenta = $1';
      const typeRes = await db.query(typeQuery, [id_tipo_cuenta_destino]);
      if (typeRes.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'El tipo de cuenta destino especificado no existe.',
        });
      }
      const { monto_minimo_apertura, nombre: tipoNombre } = typeRes.rows[0];
      if (parsedMonto < parseFloat(monto_minimo_apertura)) {
        return res.status(400).json({
          success: false,
          message: `El monto solicitado de Q${parsedMonto.toFixed(2)} es inferior al mínimo de apertura para la cuenta ${tipoNombre} (Mínimo: Q${parseFloat(monto_minimo_apertura).toFixed(2)}).`,
        });
      }
    }

    // 4. Insertar la solicitud (el numero_caso correlativo se genera atómicamente por trigger/secuencia)
    const insertQuery = `
      INSERT INTO solicitudes_traslado_apertura (
        id_asociado,
        id_cuenta_origen,
        id_cuenta_destino,
        id_tipo_cuenta_destino,
        monto,
        tipo_operacion,
        estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE')
      RETURNING id_solicitud, numero_caso, monto, tipo_operacion, estado, fecha_solicitud
    `;
    const result = await db.query(insertQuery, [
      id_asociado,
      id_cuenta_origen,
      id_cuenta_destino || null,
      id_tipo_cuenta_destino,
      parsedMonto,
      tipo_operacion
    ]);

    return res.status(201).json({
      success: true,
      message: 'Solicitud de traslado de planilla registrada para revisión.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en asociadoController.createSolicitudTraslado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud de traslado.',
    });
  }
};

/**
 * Listar solicitudes del asociado
 * GET /api/asociado/mis-solicitudes
 */
const getMisSolicitudesTraslado = async (req, res) => {
  try {
    const idPersona = req.user.id_persona;

    const query = `
      SELECT 
        s.id_solicitud,
        s.numero_caso,
        s.monto,
        s.tipo_operacion,
        s.estado,
        s.observaciones_operador,
        s.fecha_solicitud,
        s.fecha_resolucion,
        tc.nombre AS tipo_cuenta_destino,
        co.numero_cuenta AS cuenta_origen_numero,
        cd.numero_cuenta AS cuenta_destino_numero
      FROM solicitudes_traslado_apertura s
      JOIN asociados a ON s.id_asociado = a.id_asociado
      JOIN tipos_cuenta tc ON s.id_tipo_cuenta_destino = tc.id_tipo_cuenta
      JOIN cuentas co ON s.id_cuenta_origen = co.id_cuenta
      LEFT JOIN cuentas cd ON s.id_cuenta_destino = cd.id_cuenta
      WHERE a.id_persona = $1
      ORDER BY s.fecha_solicitud DESC
    `;
    const result = await db.query(query, [idPersona]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en asociadoController.getMisSolicitudesTraslado:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener sus solicitudes de traslado.',
    });
  }
};

module.exports = {
  getPerfil,
  getCuentas,
  getTransacciones,
  getCreditos,
  createCredito,
  getCuentaPlanilla,
  getMisCuentasDestino,
  createSolicitudTraslado,
  getMisSolicitudesTraslado,
};

