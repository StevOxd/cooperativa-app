const crypto = require('crypto');
const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');
const { SEGURIDAD } = require('../config/constants');
const {
  TOPE_DIARIO: TOPE_EFECTIVO_DIARIO,
  leerMontoEfectivo,
  bloquearEfectivoDePersona,
  excesoDelDia,
} = require('../services/efectivoVentanillaService');
const { formatoQ } = require('../utils/montos');
const { ipDelCliente } = require('../utils/ipCliente');
const { respuestaDeError } = require('../utils/errores');
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
      // Tope del efectivo en ventanilla por persona al día, para que la pantalla use el mismo que el servidor
      tope_deposito_ventanilla: TOPE_EFECTIVO_DIARIO,
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
 * El depósito y la apertura en el banco desde ventanilla son solo para un colaborador del banco (empleado de
 * planilla) que todavía no es asociado: es el único caso de la afiliación en ventanilla que los usa.
 *
 * @param {string} cui - DPI de 13 dígitos.
 * @returns {Promise<{status: number, message: string}|null>} El motivo para rechazar, o null si procede.
 */
const motivoParaNoOperar = async (cui) => {
  const dpiCheck = await bancoApiService.verificarDpi(cui);
  if (!dpiCheck.success && (dpiCheck.status >= 500 || !dpiCheck.status)) {
    return { status: 502, message: 'No se pudo consultar el DPI en el banco. Intente de nuevo.' };
  }
  if (!dpiCheck.existe_en_banco || dpiCheck.cliente?.tipo_cliente !== 'EMPLEADO_PLANILLA') {
    return { status: 403, message: 'Esta operación es solo para un colaborador del banco que se está afiliando.' };
  }
  const asociado = await db.query(
    'SELECT 1 FROM asociados a JOIN personas p ON p.id_persona = a.id_persona WHERE p.cui_dpi = $1',
    [cui]
  );
  if (asociado.rowCount > 0) {
    return { status: 409, message: 'Esa persona ya es asociada: esta operación es solo para quien se está afiliando.' };
  }
  return null;
};

/**
 * Registra el depósito como PENDIENTE si, con el resto del efectivo de ventanilla de la persona en el día, no pasa
 * el tope. El efectivo de la persona queda bloqueado mientras tanto: dos entradas simultáneas no pasan juntas.
 *
 * @param {Object} d - `{ idOperador, numeroCuenta, cui, monto, referencia, ip, userAgent }`.
 * @returns {Promise<string|null>} El mensaje si se pasa el tope del día, o null si quedó registrado.
 */
const registrarDepositoPendiente = async ({ idOperador, numeroCuenta, cui, monto, referencia, ip, userAgent }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await bloquearEfectivoDePersona(client, cui);
    const exceso = await excesoDelDia(client, cui, monto);
    if (exceso) {
      await client.query('ROLLBACK');
      return exceso;
    }
    await client.query(
      `INSERT INTO depositos_ventanilla_banco
         (id_usuario_operador, numero_cuenta_bancaria, titular_cui, monto, referencia, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [idOperador, numeroCuenta, cui, monto, referencia, ip, userAgent]
    );
    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Depósito en ventanilla a la cuenta del banco del colaborador que se afilia (el efectivo que entrega en la
 * agencia). Solo para un empleado del banco que todavía no es asociado, a una cuenta activa suya y nunca a una
 * propia, dentro del tope de efectivo de ventanilla por persona al día (sin tope por operador).
 *
 * La referencia la genera el servidor y cada depósito queda registrado en `depositos_ventanilla_banco` (quién,
 * cuánto, a qué cuenta y desde dónde) antes de llamar al banco, como PENDIENTE; después se cierra su estado:
 * ACREDITADO, RECHAZADO o SIN_CONFIRMAR si el banco no confirmó a tiempo. Así ningún depósito que el banco pudo
 * haber hecho queda sin rastro en la cooperativa.
 *
 * @async
 * @route POST /api/banco-externo/acreditar
 * @param {import('express').Request} req - `req.body`: `{ cui_dpi, numero_cuenta, monto }`.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con la referencia; 400 por datos inválidos o si supera el
 *   tope del día por persona; 403 si no es un colaborador del banco, si la cuenta es de quien atiende o no es
 *   del DPI indicado; 404 si la cuenta no existe; 409 si ya es asociado, la cuenta no está activa o el banco
 *   rechaza el depósito; 502 o 504 si el banco no responde; 500.
 */
const acreditarCuenta = async (req, res) => {
  const cui = String(req.body?.cui_dpi ?? '').replace(/\D/g, '');
  const numeroCuenta = String(req.body?.numero_cuenta ?? '').trim();

  if (cui.length !== SEGURIDAD.LONGITUD_CUI_DPI || !numeroCuenta) {
    return res.status(400).json({ success: false, message: 'Indique el DPI del colaborador y la cuenta del banco.' });
  }
  let monto;
  try {
    monto = leerMontoEfectivo(req.body?.monto);
  } catch (montoError) {
    return res.status(montoError.statusCode || 400).json({ success: false, message: montoError.message });
  }

  try {
    // Se deposita en la cuenta que devuelve el banco, no en lo que llegó, y solo si es del DPI que se atiende
    const cuentaBanco = await bancoApiService.consultarCuenta(numeroCuenta);
    if (!cuentaBanco.success || !cuentaBanco.data?.numero_cuenta_bancaria) {
      // En el banco, 404 es que no existe y 403 que no está activa; lo demás es una falla al consultar
      if (cuentaBanco.status === 404) {
        return res.status(404).json({ success: false, message: 'No encontramos esa cuenta en el banco.' });
      }
      if (cuentaBanco.status === 403) {
        return res.status(409).json({ success: false, message: 'Esa cuenta del banco no está activa.' });
      }
      return res.status(502).json({ success: false, message: 'No se pudo consultar la cuenta en el banco. Intente de nuevo.' });
    }
    // Segregación de funciones (issue #32): nadie deposita en ventanilla a una cuenta propia
    if (await esAutoatencion(req.user, 'dpi', cuentaBanco.data.titular_cui)) {
      return res.status(403).json(RESPUESTA_AUTOATENCION);
    }
    if (cuentaBanco.data.titular_cui !== cui) {
      return res.status(403).json({ success: false, message: 'Esa cuenta del banco no es del colaborador que está atendiendo.' });
    }
    const motivo = await motivoParaNoOperar(cui);
    if (motivo) return res.status(motivo.status).json({ success: false, message: motivo.message });

    const numeroDestino = cuentaBanco.data.numero_cuenta_bancaria;
    const referencia = `DEP-VENT-${Date.now()}-${crypto.randomInt(1000, 10000)}`;

    // Primero el registro (con los acumulados del día) y después el banco, sin transacción abierta en la llamada
    const excedido = await registrarDepositoPendiente({
      idOperador: req.user.id_usuario,
      numeroCuenta: numeroDestino,
      cui,
      monto,
      referencia,
      ip: ipDelCliente(req),
      userAgent: req.headers['user-agent'] || null,
    });
    if (excedido) return res.status(400).json({ success: false, message: excedido });
    // Si ya no está PENDIENTE (alguien lo concilió mientras tanto) no se cambia, pero queda la discrepancia en el registro
    const cerrarRegistro = (estado) =>
      db
        .query("UPDATE depositos_ventanilla_banco SET estado = $2 WHERE referencia = $1 AND estado = 'PENDIENTE'", [referencia, estado])
        .then((r) => {
          if (r.rowCount === 0) console.error(`[ERROR] El depósito ${referencia} ya no estaba PENDIENTE al quedar ${estado}: revíselo en Conciliación.`);
        })
        .catch((cierreError) => console.error(`[ERROR] El depósito ${referencia} quedó PENDIENTE (debía quedar ${estado}):`, cierreError.message));

    const bcoRes = await bancoApiService.acreditarCuenta({
      numero_cuenta: numeroDestino,
      monto,
      concepto: `Depósito en ventanilla (${req.user.codigo_corporativo})`,
      referencia,
    });
    if (!bcoRes.success) {
      console.error(`[ERROR] El banco no acreditó el depósito ${referencia} (${bcoRes.status}):`, bcoRes.message);
      // Sin respuesta a tiempo no se sabe si el banco acreditó: queda por conciliar y no se invita a reintentar
      if (bcoRes.status === 504) {
        await cerrarRegistro('SIN_CONFIRMAR');
        return res.status(504).json({
          success: false,
          message: `El banco no confirmó a tiempo. No vuelva a depositar: el administrador lo verificará en «Conciliación» (referencia ${referencia}).`,
        });
      }
      await cerrarRegistro('RECHAZADO');
      const sinRespuesta = bcoRes.status >= 500 || !bcoRes.status;
      return res.status(sinRespuesta ? 502 : 409).json({
        success: false,
        message: sinRespuesta
          ? 'El banco no respondió. No se depositó nada: intente de nuevo en unos minutos.'
          : 'El banco rechazó el depósito en esa cuenta.',
      });
    }

    // El dinero ya entró: si no se puede cerrar el estado, el registro queda PENDIENTE para conciliarlo
    await cerrarRegistro('ACREDITADO');
    return res.status(200).json({
      success: true,
      message: `Se acreditaron ${formatoQ(monto)} a la cuenta ${numeroDestino}.`,
      data: { numero_cuenta: numeroDestino, monto, referencia },
    });
  } catch (error) {
    console.error('[ERROR] bancoExternoController.acreditarCuenta:', error);
    const { status, message } = respuestaDeError(error, 'No se pudieron acreditar los fondos. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Abre una cuenta en el banco para el colaborador que se afilia y no tiene una activa: solo un empleado del banco
 * que todavía no es asociado. Solo se envían al banco los datos de la persona y el tipo de cuenta: la cuenta nace
 * sin saldo (el dinero entra con un depósito registrado) y el banco no cambia los datos de un cliente que ya tiene.
 *
 * @async
 * @route POST /api/banco-externo/aperturar
 * @param {import('express').Request} req - `req.body`: DPI, nombres, apellidos, teléfono, dirección, correo,
 *   fecha de nacimiento y `tipo_cuenta` (`AHORRO` o `MONETARIA`).
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 201 con la cuenta; 400 por datos inválidos; 403 si es propia
 *   (middleware de segregación) o no es un colaborador del banco; 409 si ya es asociado; 502 si el banco no
 *   responde; el estado del banco si la rechaza; 500.
 */
const aperturarCuentaBancaria = async (req, res) => {
  try {
    const body = req.body || {};
    const texto = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
    const cui = String(body.cui_dpi ?? '').replace(/\D/g, '');
    const tipoCuenta = String(body.tipo_cuenta || 'AHORRO').toUpperCase();
    if (cui.length !== SEGURIDAD.LONGITUD_CUI_DPI || !texto(body.primer_nombre) || !texto(body.primer_apellido)) {
      return res.status(400).json({ success: false, message: 'Escriba el DPI (13 dígitos), el primer nombre y el primer apellido.' });
    }
    if (!['AHORRO', 'MONETARIA'].includes(tipoCuenta)) {
      return res.status(400).json({ success: false, message: 'El tipo de cuenta debe ser AHORRO o MONETARIA.' });
    }
    // Solo a un colaborador del banco que se está afiliando: no se crean clientes nuevos en el banco desde aquí
    const motivo = await motivoParaNoOperar(cui);
    if (motivo) return res.status(motivo.status).json({ success: false, message: motivo.message });

    const bcoRes = await bancoApiService.aperturarCuentaBancaria({
      cui_dpi: cui,
      primer_nombre: texto(body.primer_nombre),
      segundo_nombre: texto(body.segundo_nombre),
      primer_apellido: texto(body.primer_apellido),
      segundo_apellido: texto(body.segundo_apellido),
      telefono: texto(body.telefono),
      direccion: texto(body.direccion),
      email: texto(body.email),
      fecha_nacimiento: texto(body.fecha_nacimiento),
      tipo_cuenta: tipoCuenta,
      monto_inicial: 0,
    });
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
    console.error('[ERROR] bancoExternoController.aperturarCuentaBancaria:', error);
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
