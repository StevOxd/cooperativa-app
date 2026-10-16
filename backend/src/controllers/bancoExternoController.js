const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');
const { esAutoatencion } = require('../services/segregacionService');
const { RESPUESTA_AUTOATENCION } = require('../middlewares/segregacion');

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
 * Indica además la situación del DPI en la cooperativa: `ya_registrado_cooperativa` si ya es asociado y
 * `persona_cooperativa` si la persona está registrada sin serlo (issue #32: si es del personal, trae sus
 * nombres y teléfono para llenar la afiliación; `es_propia` si es quien atiende).
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
    // Situación del DPI en la cooperativa: si ya es asociado no se vuelve a afiliar; si es del personal,
    // se afilia con sus datos ya registrados (issue #32), salvo que sea quien atiende.
    const personaRes = await db.query(
      `SELECT p.id_persona, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.telefono,
              a.id_asociado, a.estado_asociado,
              (SELECT u.codigo_corporativo FROM usuarios u WHERE u.id_persona = p.id_persona AND u.id_rol = 3) AS codigo_asociado,
              EXISTS (SELECT 1 FROM usuarios u WHERE u.id_persona = p.id_persona AND u.id_rol <> 3) AS es_personal
       FROM personas p
       LEFT JOIN asociados a ON a.id_persona = p.id_persona
       WHERE p.cui_dpi = $1`,
      [cleanCui]
    );
    const persona = personaRes.rows[0] || null;
    const yaRegistradoCoop = Boolean(persona?.id_asociado);
    const asociadoExistente = yaRegistradoCoop
      ? { id_asociado: persona.id_asociado, estado_asociado: persona.estado_asociado, codigo_asociado: persona.codigo_asociado }
      : null;
    let personaCooperativa = null;
    if (persona && !yaRegistradoCoop) {
      const esPropia = Number(persona.id_persona) === Number(req.user?.id_persona);
      personaCooperativa = {
        registrada: true,
        es_personal: persona.es_personal,
        es_propia: esPropia,
        // Solo para el personal: se afilia con los datos que ya tiene la cooperativa. Se envía lo que el
        // operador necesita ver (nombres y el teléfono, que puede cambiar); la fecha de nacimiento y la
        // dirección no se muestran: el servidor usa las registradas.
        datos: persona.es_personal && !esPropia
          ? {
              primer_nombre: persona.primer_nombre,
              segundo_nombre: persona.segundo_nombre,
              primer_apellido: persona.primer_apellido,
              segundo_apellido: persona.segundo_apellido,
              telefono: persona.telefono,
            }
          : null,
      };
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
      persona_cooperativa: personaCooperativa,
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
        message: 'El monto debe ser mayor que cero.',
      });
    }

    // Segregación de funciones (issue #32): nadie deposita en ventanilla a una cuenta propia. Si no se puede
    // saber de quién es la cuenta, no se deposita; y se deposita en la cuenta consultada, no en lo que llegó.
    const cuentaBanco = await bancoApiService.consultarCuenta(numero_cuenta);
    if (!cuentaBanco.success || !cuentaBanco.data?.numero_cuenta_bancaria) {
      return res.status(cuentaBanco.status === 404 ? 404 : 502).json({
        success: false,
        message: cuentaBanco.status === 404
          ? 'No encontramos esa cuenta en el banco.'
          : 'No se pudo consultar la cuenta en el banco. Intente de nuevo.',
      });
    }
    if (await esAutoatencion(req.user, 'dpi', cuentaBanco.data.titular_cui)) {
      return res.status(403).json(RESPUESTA_AUTOATENCION);
    }

    const bcoRes = await bancoApiService.acreditarCuenta({
      numero_cuenta: cuentaBanco.data.numero_cuenta_bancaria,
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
      message: 'No se pudieron acreditar los fondos. Intente de nuevo.',
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
        message: 'Cuenta abierta en el banco.',
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
      message: 'No se pudo abrir la cuenta en el banco. Intente de nuevo.',
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
