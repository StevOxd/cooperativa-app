const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');

const BANCOS_DISPONIBLES = [
  { codigo: 'BCO-CORP', nombre: 'Banco de la Corporación', prefijo_cuenta: 'CTA-BCO' },
];

/**
 * Retorna el catálogo de bancos disponibles
 */
const getBancosDisponibles = (req, res) => {
  return res.status(200).json({
    success: true,
    data: BANCOS_DISPONIBLES,
  });
};

/**
 * Consulta y valida la existencia y saldo de una cuenta bancaria corporativa
 */
const consultarCuenta = async (req, res) => {
  try {
    const { numero_cuenta_bancaria } = req.query;

    if (!numero_cuenta_bancaria) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar el número de cuenta bancaria.',
      });
    }

    // Consultar en el Core Banking API (banco-backend)
    const bcoRes = await bancoApiService.consultarCuenta(numero_cuenta_bancaria);
    if (bcoRes.success && bcoRes.data) {
      return res.status(200).json({
        success: true,
        data: {
          id_banco_cuenta: bcoRes.data.id_cuenta_bancaria,
          banco_nombre: bcoRes.data.banco_nombre || 'Banco de la Corporación',
          numero_cuenta_bancaria: bcoRes.data.numero_cuenta_bancaria,
          titular_nombre: bcoRes.data.titular_nombre,
          titular_cui: bcoRes.data.titular_cui,
          saldo_disponible: parseFloat(bcoRes.data.saldo_disponible),
        },
      });
    }

    return res.status(bcoRes.status || 404).json({
      success: false,
      message: bcoRes.message || `No se encontró la cuenta ${numero_cuenta_bancaria} en la entidad bancaria.`,
    });
  } catch (error) {
    console.error('Error en bancoExternoController.consultarCuenta:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar cuenta bancaria.',
    });
  }
};

/**
 * Retorna las cuentas demo disponibles para facilitar pruebas y evaluación
 */
const getCuentasDemo = async (req, res) => {
  try {
    // Consultar vía Core Banking API
    const bcoRes = await bancoApiService.getCuentasDemo();
    if (bcoRes.success && Array.isArray(bcoRes.data)) {
      return res.status(200).json({
        success: true,
        data: bcoRes.data,
      });
    }

    return res.status(200).json({
      success: true,
      data: [],
    });
  } catch (error) {
    console.error('Error en bancoExternoController.getCuentasDemo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al listar cuentas demo bancarias.',
    });
  }
};

/**
 * Crea una cuenta de prueba al vuelo en cuenta_bancaria
 */
const crearCuentaDemo = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Las cuentas demo se gestionan directamente en la Entidad Bancaria (banco_db). Utilice las cuentas disponibles en /api/banco-externo/cuentas-demo.',
  });
};

/**
 * Consulta las cuentas bancarias de un cliente/empleado por su CUI/DPI
 * y determina automáticamente si es Colaborador Bancario (EB) o Externo (EX).
 * GET /api/banco-externo/cuentas-cliente/:cui_dpi
 */
const getCuentasCliente = async (req, res) => {
  try {
    const { cui_dpi } = req.params;
    if (!cui_dpi) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar el CUI / DPI a consultar.',
      });
    }

    const cleanCui = String(cui_dpi).trim().replace(/\D/g, '');
    // Comprobar si ya está registrado en la cooperativa
    let yaRegistradoCoop = false;
    let asociadoExistente = null;
    try {
      const checkCoop = await db.query(
        `SELECT p.id_persona, p.primer_nombre, p.primer_apellido, a.id_asociado, a.estado_asociado, a.codigo_asociado
         FROM personas p
         LEFT JOIN asociados a ON p.id_persona = a.id_persona
         WHERE p.cui_dpi = $1`,
        [cleanCui]
      );
      if (checkCoop.rows.length > 0) {
        yaRegistradoCoop = true;
        asociadoExistente = checkCoop.rows[0];
      }
    } catch (dbErr) {
      console.warn('Advertencia comprobando CUI en cooperativa:', dbErr.message);
    }

    const dpiCheck = await bancoApiService.verificarDpi(cleanCui);
    const bcoRes = await bancoApiService.obtenerCuentasCliente(cleanCui);

    const existeEnBanco = Boolean(dpiCheck.success && dpiCheck.existe_en_banco);
    const tipoCliente = existeEnBanco ? dpiCheck.cliente?.tipo_cliente : 'NO_REGISTRADO';
    const esEmpleado = tipoCliente === 'EMPLEADO_PLANILLA';
    const tipoAsociado = esEmpleado ? 'EB' : 'EX';

    return res.status(200).json({
      success: true,
      cui_dpi: cleanCui,
      ya_registrado_cooperativa: yaRegistradoCoop,
      asociado_existente: asociadoExistente,
      existe_en_banco: existeEnBanco,
      es_empleado: esEmpleado,
      tipo_cliente: tipoCliente,
      tipo_asociado: tipoAsociado,
      cliente: dpiCheck.cliente || null,
      data: bcoRes.success ? (bcoRes.data || []) : [],
    });
  } catch (error) {
    console.error('Error en bancoExternoController.getCuentasCliente:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar cuentas bancarias del cliente.',
      data: [],
    });
  }
};

/**
 * Acredita o deposita fondos en una cuenta bancaria del Core Bancario
 * POST /api/banco-externo/acreditar
 */
const acreditarCuenta = async (req, res) => {
  try {
    const { numero_cuenta, monto, concepto, referencia } = req.body;

    if (!numero_cuenta || !monto) {
      return res.status(400).json({
        success: false,
        message: 'El número de cuenta y el monto son obligatorios.',
      });
    }

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser un valor numérico mayor a cero.',
      });
    }

    const bcoRes = await bancoApiService.acreditarCuenta({
      numero_cuenta,
      monto: montoNum,
      concepto: concepto || 'Depósito en ventanilla a cuenta bancaria de colaborador',
      referencia: referencia || `DEP-VENT-${Date.now()}`,
    });

    if (bcoRes.success) {
      return res.status(200).json({
        success: true,
        message: bcoRes.message || 'Fondos acreditados exitosamente en la cuenta bancaria.',
        data: bcoRes.data,
      });
    }

    return res.status(bcoRes.status || 400).json({
      success: false,
      message: bcoRes.message || 'Error al acreditar fondos en la cuenta bancaria.',
    });
  } catch (error) {
    console.error('Error en bancoExternoController.acreditarCuenta:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al procesar acreditación en el banco.',
    });
  }
};

/**
 * Apertura una cuenta de ahorro en la Entidad Bancaria
 * POST /api/banco-externo/aperturar
 */
const aperturarCuentaBancaria = async (req, res) => {
  try {
    const bcoRes = await bancoApiService.aperturarCuentaBancaria(req.body);
    if (bcoRes.success) {
      return res.status(201).json({
        success: true,
        message: 'Cuenta bancaria aperturada exitosamente en la Entidad Bancaria.',
        data: bcoRes.data,
      });
    }

    return res.status(bcoRes.status || 400).json({
      success: false,
      message: bcoRes.message || 'Error al aperturar cuenta en la Entidad Bancaria.',
    });
  } catch (error) {
    console.error('Error en bancoExternoController.aperturarCuentaBancaria:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al aperturar cuenta bancaria.',
    });
  }
};

module.exports = {
  getBancosDisponibles,
  consultarCuenta,
  getCuentasDemo,
  crearCuentaDemo,
  getCuentasCliente,
  acreditarCuenta,
  aperturarCuentaBancaria,
};
