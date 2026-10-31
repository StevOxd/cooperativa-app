/**
 * Servicio de Dominio: Afiliaciones Operativas en Agencia (ARQ-03)
 * Contiene la lógica de negocio y transaccional para la atención y formalización de casos de afiliación.
 */

const crypto = require('crypto');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getNextCorporateCode, generateSecureRandomPassword } = require('../utils/codeGenerator');
const mailerService = require('./mailerService');
const { decidirAccesoPortal } = require('../utils/accesoPortal');
const bancoApiService = require('./bancoApiService');
const documentosAfiliacion = require('./documentosAfiliacionService');
const { leerMontoEfectivo, registrarEfectivo } = require('./efectivoVentanillaService');
const {
  revertirOAnotar,
  errorTrasCommitFallido,
  hayReversionPendiente,
  hayAperturaPorRevertirDelDpi,
  movimientoSinRegistrar,
  revertirMovimientoSinRegistrar,
  avisoDeReversion,
} = require('./reversionesService');
const { validateCui, validateAge18 } = require('../middlewares/validationMiddleware');
const { estadoPorFalloDelBanco } = require('../utils/errores');

/**
 * Bloquea un caso de afiliación en agencia para atención exclusiva por un operador
 */
const bloquearCaso = async ({ idSolicitud, idOperador }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Limpiar bloqueos expirados (> 15 minutos)
    await client.query(`
      UPDATE solicitudes_afiliacion_agencia 
      SET id_operador_bloqueo = NULL, fecha_bloqueo = NULL 
      WHERE id_operador_bloqueo IS NOT NULL AND fecha_bloqueo <= NOW() - INTERVAL '15 minutes'
    `);

    const checkRes = await client.query(`
      SELECT id_solicitud, numero_caso, estado, id_operador_bloqueo, fecha_bloqueo
      FROM solicitudes_afiliacion_agencia
      WHERE id_solicitud = $1
      FOR UPDATE
    `, [idSolicitud]);

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 404, success: false, message: 'Solicitud no encontrada.' };
    }

    const sol = checkRes.rows[0];

    if (sol.estado !== 'PENDIENTE_AGENCIA') {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: `Esa solicitud ya no está pendiente.`,
      };
    }

    // Si está bloqueada por otro operador activo
    if (sol.id_operador_bloqueo && sol.id_operador_bloqueo !== idOperador) {
      const opInfoRes = await client.query(`
        SELECT p.primer_nombre || ' ' || p.primer_apellido AS operador_nombre, u.codigo_corporativo AS operador_codigo
        FROM usuarios u
        JOIN personas p ON u.id_persona = p.id_persona
        WHERE u.id_usuario = $1
      `, [sol.id_operador_bloqueo]);

      const opInfo = opInfoRes.rows[0] || {};
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: `El caso ${sol.numero_caso} está siendo atendido actualmente por el operador ${opInfo.operador_nombre || 'otro operador'} (${opInfo.operador_codigo || 'Cód'}). Queda bloqueado para otros operadores.`,
        bloqueado_por: {
          id: sol.id_operador_bloqueo,
          nombre: opInfo.operador_nombre,
          codigo: opInfo.operador_codigo,
        },
      };
    }

    // Bloquear para el operador actual
    await client.query(`
      UPDATE solicitudes_afiliacion_agencia 
      SET id_operador_bloqueo = $1, fecha_bloqueo = CURRENT_TIMESTAMP 
      WHERE id_solicitud = $2
    `, [idOperador, idSolicitud]);

    await client.query('COMMIT');

    return {
      status: 200,
      success: true,
      message: `Tomó el caso ${sol.numero_caso}. Nadie más puede atenderlo mientras usted lo tenga.`,
      data: {
        id_solicitud: sol.id_solicitud,
        numero_caso: sol.numero_caso,
        id_operador_bloqueo: idOperador,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Libera el bloqueo de un caso de afiliación
 */
const liberarCaso = async ({ idSolicitud, idOperador, esAdmin }) => {
  const updateQuery = esAdmin
    ? `UPDATE solicitudes_afiliacion_agencia 
       SET id_operador_bloqueo = NULL, fecha_bloqueo = NULL 
       WHERE id_solicitud = $1`
    : `UPDATE solicitudes_afiliacion_agencia 
       SET id_operador_bloqueo = NULL, fecha_bloqueo = NULL 
       WHERE id_solicitud = $1 AND id_operador_bloqueo = $2`;

  const params = esAdmin ? [idSolicitud] : [idSolicitud, idOperador];
  await db.query(updateQuery, params);

  return {
    status: 200,
    success: true,
    message: 'Caso liberado.',
  };
};

/**
 * Rechaza o cancela un caso de afiliación en agencia. Si un intento anterior de formalizarlo dejó el aporte en el banco
 * (un tiempo agotado), se revierte: se retira el depósito o se devuelve el débito.
 *
 * @throws {Error} `errorDeNegocio(502)` si no se puede consultar el banco: sin saberlo, el caso no se cancela.
 */
const rechazarCaso = async ({ idSolicitud, idOperador, motivo }) => {
  if (!motivo || !motivo.trim()) {
    return {
      status: 400,
      success: false,
      message: 'Escriba el motivo del rechazo.',
    };
  }

  const caso = (await db.query(
    "SELECT numero_caso, fecha_solicitud FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1 AND estado = 'PENDIENTE_AGENCIA'",
    [idSolicitud]
  )).rows[0];
  // El aporte pudo quedar en el banco como depósito (efectivo) o como débito de su cuenta, según cómo se intentó cobrar
  const referenciaCaso = caso ? bancoApiService.referenciaDeOperacion(caso.numero_caso, caso.fecha_solicitud) : null;
  const sinRegistrar = caso
    ? (await movimientoSinRegistrar(referenciaCaso, 'CREDITO')) || (await movimientoSinRegistrar(referenciaCaso, 'DEBITO'))
    : null;

  const updateRes = await db.query(`
    UPDATE solicitudes_afiliacion_agencia 
    SET estado = 'CANCELADA',
        id_operador_resuelve = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        id_operador_bloqueo = NULL,
        fecha_bloqueo = NULL,
        observaciones = $2
    WHERE id_solicitud = $3 AND estado = 'PENDIENTE_AGENCIA'
    RETURNING id_solicitud, numero_caso, estado
  `, [idOperador, motivo.trim(), idSolicitud]);

  if (updateRes.rows.length === 0) {
    return {
      status: 404,
      success: false,
      message: 'Esa solicitud no existe o ya no está pendiente.',
    };
  }

  const reversion = await revertirMovimientoSinRegistrar(sinRegistrar, {
    origen: 'FORMALIZACION_AGENCIA',
    concepto: `Reversión de aporte: el caso ${updateRes.rows[0].numero_caso} se canceló`,
    detalle: `Caso ${updateRes.rows[0].numero_caso} (cancelado)`,
    clave: updateRes.rows[0].id_solicitud,
  });
  return {
    status: 200,
    success: true,
    message: `Se canceló el caso ${updateRes.rows[0].numero_caso}.${avisoDeReversion(reversion)}`,
    data: updateRes.rows[0],
  };
};

/** Tipos de cuenta del banco que reciben el aporte o de los que se debita. */
const CUENTAS_DEL_COBRO = ['AHORRO', 'MONETARIA'];

/**
 * Forma de cobro del aporte y la cuenta del banco que se usa, validada contra el banco (nunca se confía en el cuerpo):
 * tiene que ser del DPI de la persona, estar activa y ser de ahorro o monetaria.
 *
 * @param {{ metodoPago?: string, numeroCuenta?: string, cui: string }} datos
 * @returns {Promise<{ metodo: 'EFECTIVO_VENTANILLA'|'DEBITO_CUENTA', numeroCuenta: string|null, error?: Object }>}
 *   `numeroCuenta` null: efectivo a una cuenta nueva. `error`: la respuesta para el operador.
 */
const cuentaDelCobro = async ({ metodoPago, numeroCuenta, cui }) => {
  const metodo = metodoPago === 'DEBITO_CUENTA' ? 'DEBITO_CUENTA' : 'EFECTIVO_VENTANILLA';
  const numero = typeof numeroCuenta === 'string' ? numeroCuenta.trim() : '';
  if (!numero) {
    return metodo === 'DEBITO_CUENTA'
      ? { metodo, numeroCuenta: null, error: { status: 400, success: false, message: 'Elija la cuenta del banco de la que se debitará el aporte.' } }
      : { metodo, numeroCuenta: null };
  }
  const cuenta = await bancoApiService.consultarCuenta(numero);
  if (cuenta.status >= 500 || (!cuenta.success && cuenta.status !== 404 && cuenta.status !== 400)) {
    return { metodo, numeroCuenta: null, error: { status: 502, success: false, message: 'No pudimos consultar la cuenta en el banco. Intente de nuevo en unos minutos.' } };
  }
  if (!cuenta.success || !cuenta.data?.numero_cuenta_bancaria || cuenta.data.titular_cui !== cui || cuenta.data.estado !== 'ACTIVA'
    || !CUENTAS_DEL_COBRO.includes(cuenta.data.tipo_cuenta)) {
    return { metodo, numeroCuenta: null, error: { status: 403, success: false, message: 'Esa cuenta del banco no es de esta persona o no está activa.' } };
  }
  return { metodo, numeroCuenta: cuenta.data.numero_cuenta_bancaria };
};

/**
 * Formaliza la afiliación en ventanilla y genera cuentas/credenciales de manera transaccional
 */
const MENSAJE_YA_ASOCIADO =
  'Esta persona ya es asociada de la cooperativa. Si necesita acceso al portal, se activa desde su expediente.';

const formalizarAfiliacion = async ({ idSolicitud, idOperador, rolUsuario, datos, nombreOperador }) => {
  const {
    monto_aportacion,
    metodo_pago = 'EFECTIVO_VENTANILLA',
    numero_cuenta_bancaria,
    observaciones = '',
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido,
    cui_dpi,
    telefono,
    direccion,
    fecha_nacimiento,
    email,
    crear_acceso_portal,
  } = datos;

  // Efectivo recibido en ventanilla: número válido, mínimo Q100.00 y dentro del tope del día por persona
  let montoAporte;
  try {
    montoAporte = leerMontoEfectivo(monto_aportacion);
  } catch (montoError) {
    return { status: montoError.statusCode || 400, success: false, message: montoError.message };
  }
  if (montoAporte < 100.00) {
    return {
      status: 400,
      success: false,
      message: 'El depósito inicial mínimo es de Q100.00.',
    };
  }

  // Antes de bloquear nada: identificar a la persona y decidir el acceso al portal (issue #26).
  // La consulta DNS del dominio del correo puede tardar, así que no se hace con la solicitud bloqueada.
  const previaRes = await db.pool.query(
    'SELECT cui_dpi, email FROM solicitudes_afiliacion_agencia WHERE id_solicitud = $1',
    [idSolicitud]
  );
  if (previaRes.rows.length === 0) {
    return { status: 404, success: false, message: 'Solicitud no encontrada.' };
  }
  const cuiPrevio = (cui_dpi && cui_dpi.trim()) ? cui_dpi.trim().replace(/\s+/g, '') : previaRes.rows[0].cui_dpi;
  const emailPrevio = (email && email.trim()) ? email.trim().toLowerCase() : (previaRes.rows[0].email ? previaRes.rows[0].email.trim().toLowerCase() : null);

  const personaPreviaRes = await db.pool.query(
    `SELECT (a.id_asociado IS NOT NULL) AS es_asociado,
            EXISTS (SELECT 1 FROM usuarios u WHERE u.id_persona = p.id_persona AND u.id_rol = 3) AS tiene_usuario_asociado
     FROM personas p
     LEFT JOIN asociados a ON a.id_persona = p.id_persona
     WHERE p.cui_dpi = $1`,
    [cuiPrevio]
  );
  const personaPrevia = personaPreviaRes.rows[0] || null;
  // Una solicitud pública puede traer el DPI de alguien que ya es asociado: formalizarla le daría su
  // cuenta a quien escribió el correo de la solicitud. Su acceso se activa desde su expediente (issue #27).
  if (personaPrevia?.es_asociado) {
    return { status: 409, success: false, message: MENSAJE_YA_ASOCIADO };
  }

  let acceso = { crear: false, email: emailPrevio };
  if (!personaPrevia?.tiene_usuario_asociado) {
    try {
      acceso = await decidirAccesoPortal(crear_acceso_portal, emailPrevio);
    } catch (accesoError) {
      return { status: accesoError.statusCode || 400, success: false, error: accesoError.code, message: accesoError.message };
    }
  }

  // El tipo de asociado (EB o EX) lo decide el banco, no la solicitud (regla 4.6, issue #79). Se consulta
  // antes de bloquear la solicitud; sin respuesta del banco no se formaliza.
  const tipoBanco = await bancoApiService.verificarDpi(cuiPrevio);
  if (!tipoBanco.success) {
    return {
      status: 502,
      success: false,
      message: 'No pudimos consultar al banco para confirmar el tipo de asociado. Intente de nuevo en unos minutos.',
    };
  }
  const tipoAsociado = tipoBanco.existe_en_banco && tipoBanco.cliente?.tipo_cliente === 'EMPLEADO_PLANILLA' ? 'EB' : 'EX';

  // Cobro (Fase 6, #81): en efectivo, a una cuenta nueva del banco o a una que ya tiene; o con un débito de su cuenta
  // del banco hacia una cuenta de la cooperativa. La cuenta elegida tiene que ser suya y estar activa.
  const cobro = await cuentaDelCobro({ metodoPago: metodo_pago, numeroCuenta: numero_cuenta_bancaria, cui: cuiPrevio });
  if (cobro.error) return cobro.error;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const solRes = await client.query(`
      SELECT * FROM solicitudes_afiliacion_agencia 
      WHERE id_solicitud = $1 
      FOR UPDATE
    `, [idSolicitud]);

    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 404, success: false, message: 'Solicitud no encontrada.' };
    }

    const sol = solRes.rows[0];

    if (sol.estado !== 'PENDIENTE_AGENCIA') {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: `Esa solicitud ya fue procesada.`,
      };
    }

    // Validar bloqueo si está asignado a otro
    if (sol.id_operador_bloqueo && sol.id_operador_bloqueo !== idOperador && rolUsuario !== 'ADMINISTRADOR') {
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: 'Otro operador está atendiendo este caso.',
      };
    }

    // Resolver valores finales permitiendo correcciones realizadas por el operador
    const cuiFinal = (cui_dpi && cui_dpi.trim()) ? cui_dpi.trim().replace(/\s+/g, '') : sol.cui_dpi;
    let pNombreFinal = (primer_nombre && primer_nombre.trim()) ? primer_nombre.trim() : sol.primer_nombre;
    let sNombreFinal = segundo_nombre !== undefined ? (segundo_nombre ? segundo_nombre.trim() : null) : sol.segundo_nombre;
    let pApellidoFinal = (primer_apellido && primer_apellido.trim()) ? primer_apellido.trim() : sol.primer_apellido;
    let sApellidoFinal = segundo_apellido !== undefined ? (segundo_apellido ? segundo_apellido.trim() : null) : sol.segundo_apellido;
    let telFinal = telefono !== undefined ? (telefono ? telefono.trim() : null) : sol.telefono;
    let dirFinal = direccion !== undefined ? (direccion ? direccion.trim() : null) : sol.direccion;
    let fNacFinal = fecha_nacimiento ? String(fecha_nacimiento).split('T')[0] : sol.fecha_nacimiento;
    const emailFinal = (email && email.trim()) ? email.trim().toLowerCase() : (sol.email ? sol.email.trim().toLowerCase() : null);

    // Validaciones de formato
    const cuiVal = validateCui(cuiFinal);
    if (!cuiVal.valid) {
      await client.query('ROLLBACK');
      return { status: 400, success: false, message: cuiVal.message };
    }

    if (fNacFinal) {
      const ageVal = validateAge18(fNacFinal);
      if (!ageVal.valid) {
        await client.query('ROLLBACK');
        return { status: 400, success: false, message: ageVal.message };
      }
    }

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!nameRegex.test(pNombreFinal) || !nameRegex.test(pApellidoFinal)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'Los nombres y apellidos solo pueden llevar letras.',
      };
    }
    if (sNombreFinal && !nameRegex.test(sNombreFinal)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'El segundo nombre solo puede llevar letras.',
      };
    }
    if (sApellidoFinal && !nameRegex.test(sApellidoFinal)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'El segundo apellido solo puede llevar letras.',
      };
    }

    if (telFinal) {
      const cleanTel = telFinal.replace(/\D/g, '');
      if (cleanTel.length !== 8) {
        await client.query('ROLLBACK');
        return {
          status: 400,
          success: false,
          message: `El teléfono debe tener 8 dígitos (tiene ${cleanTel.length}).`,
        };
      }
    }

    // Actualizar la solicitud con los datos corregidos
    await client.query(`
      UPDATE solicitudes_afiliacion_agencia 
      SET cui_dpi = $1, primer_nombre = $2, segundo_nombre = $3, primer_apellido = $4, segundo_apellido = $5,
          telefono = $6, direccion = $7, fecha_nacimiento = $8, email = $9
      WHERE id_solicitud = $10
    `, [cuiFinal, pNombreFinal, sNombreFinal, pApellidoFinal, sApellidoFinal, telFinal, dirFinal, fNacFinal, emailFinal, idSolicitud]);

    // 1. Persona. Si ya existe (por ejemplo, alguien del personal, issue #32), se conservan sus datos: una
    //    solicitud pública no cambia la identidad de nadie. Solo se completan el teléfono y la dirección
    //    si no los tenía, y la cuenta del banco se abre con los datos registrados.
    let idPersona;
    let personaNombreCompleto;
    const checkPersona = await client.query(
      `SELECT id_persona, nombre_completo, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
              telefono, direccion, TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento
       FROM personas WHERE cui_dpi = $1`,
      [cuiFinal]
    );
    
    if (checkPersona.rows.length > 0) {
      const registrada = checkPersona.rows[0];
      idPersona = registrada.id_persona;
      personaNombreCompleto = registrada.nombre_completo;
      await client.query(
        'UPDATE personas SET telefono = COALESCE(telefono, $1), direccion = COALESCE(direccion, $2) WHERE id_persona = $3',
        [telFinal, dirFinal, idPersona]
      );
      pNombreFinal = registrada.primer_nombre;
      sNombreFinal = registrada.segundo_nombre;
      pApellidoFinal = registrada.primer_apellido;
      sApellidoFinal = registrada.segundo_apellido;
      telFinal = registrada.telefono || telFinal;
      dirFinal = registrada.direccion || dirFinal;
      fNacFinal = registrada.fecha_nacimiento;
      // La mayoría de edad se revisa con la fecha registrada, no con la de la solicitud
      const edadRegistrada = validateAge18(fNacFinal);
      if (!edadRegistrada.valid) {
        await client.query('ROLLBACK');
        return { status: 400, success: false, message: edadRegistrada.message };
      }
    } else {
      const insPersona = await client.query(`
        INSERT INTO personas (
          cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          telefono, direccion, fecha_nacimiento
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id_persona, nombre_completo
      `, [
        cuiFinal, pNombreFinal, sNombreFinal, pApellidoFinal, sApellidoFinal,
        telFinal, dirFinal, fNacFinal
      ]);
      idPersona = insPersona.rows[0].id_persona;
      personaNombreCompleto = insPersona.rows[0].nombre_completo;
    }

    // 2. Inserción o verificación en asociados
    const checkSocio = await client.query('SELECT id_asociado FROM asociados WHERE id_persona = $1', [idPersona]);
    let idAsociado;
    if (checkSocio.rows.length > 0) {
      // Ya era asociado (se comprobó antes; esto cubre una afiliación simultánea)
      await client.query('ROLLBACK');
      return { status: 409, success: false, message: MENSAJE_YA_ASOCIADO };
    } else {
      const insSocio = await client.query(`
        INSERT INTO asociados (id_persona, fecha_ingreso, estado_asociado, tipo_asociado, canal_afiliacion)
        VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date, 'ACTIVO', $2, 'AGENCIA')
        RETURNING id_asociado
      `, [idPersona, tipoAsociado]);
      idAsociado = insSocio.rows[0].id_asociado;
    }

    // 2.1 Documentos obligatorios (Fase 6): los que subió el solicitante o se escanearon en ventanilla. El expediente
    //     pasa a la persona y, con él bloqueado, se confirma que están completos.
    const idExpedienteDocs = await documentosAfiliacion.expedienteDeAfiliacion(client, sol.cui_dpi, { idSolicitud: sol.id_solicitud });
    await documentosAfiliacion.vincularExpedienteAPersona(client, idExpedienteDocs, idPersona);
    try {
      await documentosAfiliacion.exigirDocumentosObligatorios(client, idExpedienteDocs);
    } catch (faltan) {
      if (!Number.isInteger(faltan.statusCode)) throw faltan;
      await client.query('ROLLBACK');
      return { status: faltan.statusCode, success: false, error: faltan.codigo, message: faltan.message };
    }

    // 3. Acceso al portal.
    //    - Si la persona ya tiene usuario de asociado (sin membresía), lo conserva tal cual.
    //    - Si no: se crea solo cuando se pidió el acceso y el correo funciona. Si la persona es del
    //      personal, su usuario de asociado es otro, con otro correo (issue #32).
    const checkUser = await client.query(
      'SELECT codigo_corporativo, id_rol, estado FROM usuarios WHERE id_persona = $1 AND id_rol = 3',
      [idPersona]
    );
    const usuarioPrevio = checkUser.rows[0] || null;

    let codigoUsuarioFinal = usuarioPrevio ? usuarioPrevio.codigo_corporativo : null;
    let rawPass = null;
    const crearUsuario = !usuarioPrevio && acceso.crear;
    const emailUsuario = acceso.email;

    if (crearUsuario) {
      // Ningún otro usuario puede tener ese correo, tampoco el del personal de la misma persona.
      const checkDupEmail = await client.query(
        'SELECT id_persona FROM usuarios WHERE LOWER(email) = LOWER($1)',
        [emailUsuario]
      );
      if (checkDupEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        const esDelPersonal = Number(checkDupEmail.rows[0].id_persona) === Number(idPersona);
        return esDelPersonal
          ? {
              status: 409,
              success: false,
              error: 'CORREO_DEL_PERSONAL',
              message: `${emailUsuario} es el correo del usuario del personal de esta persona. Su usuario de asociado lleva un correo distinto: cámbielo en la ficha.`,
            }
          : {
              status: 400,
              success: false,
              message: `El correo ${emailUsuario} ya lo usa otra persona. Cámbielo en la ficha para continuar.`,
            };
      }

      codigoUsuarioFinal = await getNextCorporateCode(client, tipoAsociado);

      // Generar contraseña criptográfica segura de forma automática para el nuevo asociado
      rawPass = generateSecureRandomPassword(12);
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(rawPass, salt);

      await client.query(`
        INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, mfa_enabled, debe_cambiar_password)
        VALUES ($1, 3, $2, $3, $4, 'ACTIVO', FALSE, TRUE)
      `, [idPersona, codigoUsuarioFinal, emailUsuario, passwordHash]);
    }

    // 3.8 La referencia del banco es la del caso: si un intento anterior agotó el tiempo pero el banco sí hizo la
    //     operación, el banco la devuelve en lugar de repetirla. Si un intento anterior (de este caso o de esta
    //     persona) quedó por revertir, no se cobra hasta conciliarlo. El banco reconoce la referencia por tipo de
    //     movimiento: un intento anterior con el otro método de pago que quedó en el banco detiene este.
    const referenciaBanco = bancoApiService.referenciaDeOperacion(sol.numero_caso, sol.fecha_solicitud);
    const tipoMovimiento = cobro.metodo === 'DEBITO_CUENTA' ? 'DEBITO' : 'CREDITO';
    if (await hayReversionPendiente(client, referenciaBanco)
      || (!cobro.numeroCuenta && await hayAperturaPorRevertirDelDpi(client, cuiFinal))) {
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: 'Un intento anterior de esta afiliación quedó pendiente de conciliar con el banco. Pida al administrador que lo concilie en «Conciliación» antes de formalizarla.',
      };
    }
    if (await movimientoSinRegistrar(referenciaBanco, tipoMovimiento === 'DEBITO' ? 'CREDITO' : 'DEBITO')) {
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: 'Un intento anterior de esta afiliación con otra forma de pago quedó en el banco. Repita la forma de pago anterior o pida al administrador que lo revise.',
      };
    }

    // 3.9 El efectivo queda registrado (y cuenta para el tope del día de la persona) dentro de la transacción; un
    //     débito de su cuenta no es efectivo
    if (cobro.metodo === 'EFECTIVO_VENTANILLA') {
      await registrarEfectivo(client, {
        idOperador,
        cui: cuiFinal,
        monto: montoAporte,
        origen: 'FORMALIZACION_AGENCIA',
        referencia: sol.numero_caso,
      });
    }

    // 3.10 Con débito, el aporte entra a una cuenta de ahorro de la cooperativa (se registra antes de pedirlo al banco,
    //      para que después de la operación con el banco solo falte cerrar la solicitud)
    let cuentaCooperativa = null;
    if (cobro.metodo === 'DEBITO_CUENTA') {
      // Con guion: no coincide con el formato de la presencial (CTA-AHORR-<id><3 dígitos>)
      const numeroCuentaCoop = `CTA-AHORR-${idAsociado}-${crypto.randomInt(100000, 1000000)}`;
      cuentaCooperativa = (await client.query(
        `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
         VALUES ($1, $2, 2, $3, 0.00, 'ACTIVA')
         RETURNING id_cuenta, numero_cuenta`,
        [numeroCuentaCoop, idAsociado, montoAporte]
      )).rows[0];
      await client.query(
        `INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
         VALUES ($1, 'DEPOSITO', $2, 0.00, $2, $3, $4)`,
        [cuentaCooperativa.id_cuenta, montoAporte, `Aporte de afiliación debitado de la cuenta bancaria ${cobro.numeroCuenta} (caso ${sol.numero_caso})`, idOperador]
      );
    }

    // 4. Operación con el banco, justo antes del COMMIT:
    //    - Efectivo a una cuenta nueva: se abre una cuenta de ahorro con el depósito (el asociado traslada después
    //      desde ella hacia la cooperativa).
    //    - Efectivo a una cuenta que ya tiene: se le acredita ahí; no se abre otra (#81).
    //    - Débito: sale de su cuenta y entra a una cuenta de ahorro de la cooperativa.
    const concepto = `Aporte de afiliación, caso ${sol.numero_caso}`;
    let bancoRes;
    if (cobro.metodo === 'DEBITO_CUENTA') {
      bancoRes = await bancoApiService.debitarConReferenciaDeOperacion({
        numero_cuenta: cobro.numeroCuenta, cui_dpi: cuiFinal, monto: montoAporte, concepto, referencia: referenciaBanco,
      });
    } else if (cobro.numeroCuenta) {
      bancoRes = await bancoApiService.acreditarConReferenciaDeOperacion({
        numero_cuenta: cobro.numeroCuenta, monto: montoAporte, concepto, referencia: referenciaBanco,
      });
    } else {
      bancoRes = await bancoApiService.aperturarConReferenciaDeOperacion({
        cui_dpi: cuiFinal,
        primer_nombre: pNombreFinal,
        segundo_nombre: sNombreFinal,
        primer_apellido: pApellidoFinal,
        segundo_apellido: sApellidoFinal,
        telefono: telFinal,
        direccion: dirFinal,
        email: emailUsuario,
        fecha_nacimiento: fNacFinal,
        monto_inicial: montoAporte,
        tipo_cuenta: 'AHORRO',
        referencia: referenciaBanco,
      });
    }

    if (!bancoRes.success || (!cobro.numeroCuenta && !bancoRes.data)) {
      await client.query('ROLLBACK');
      const porReferencia = bancoApiService.mensajePorReferencia(bancoRes);
      if (porReferencia) return { status: 409, success: false, message: porReferencia };
      if (bancoRes.status === 504) {
        return {
          status: 502,
          success: false,
          message: 'El banco no confirmó a tiempo. Puede intentarlo de nuevo con la misma forma de pago: si ya la había hecho, no la repite.',
        };
      }
      return {
        status: estadoPorFalloDelBanco(bancoRes.status),
        success: false,
        message: bancoRes.message || 'El banco no pudo completar el cobro del aporte.',
      };
    }
    const referenciaUsada = bancoRes.referencia_usada;
    // El banco devolvió la operación de un intento anterior: si ese intento se está revirtiendo, no se registra
    if (bancoRes.idempotente && await hayReversionPendiente(client, referenciaUsada)) {
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: 'Un intento anterior de esta afiliación se está revirtiendo en el banco. Espere a que termine y vuelva a intentarlo.',
      };
    }

    const cuentaBancaria = { numero_cuenta: cobro.numeroCuenta || bancoRes.data.numero_cuenta };


    // 5. Actualizar solicitud a ATENDIDA y registrar el número de cuenta bancaria y monto acreditado
    const obsFinal = observaciones
      ? `${sol.observaciones ? sol.observaciones + ' | ' : ''}Formalizado por operador en ventanilla: ${observaciones} (Cuenta Bancaria: ${cuentaBancaria.numero_cuenta})`
      : `${sol.observaciones ? sol.observaciones + ' | ' : ''}Cuenta Bancaria: ${cuentaBancaria.numero_cuenta}`;

    await client.query(`
      UPDATE solicitudes_afiliacion_agencia 
      SET estado = 'ATENDIDA',
          id_operador_resuelve = $1,
          fecha_resolucion = CURRENT_TIMESTAMP,
          id_operador_bloqueo = NULL,
          fecha_bloqueo = NULL,
          monto_estimado = $2,
          numero_cuenta_bancaria = $3,
          observaciones = $4
      WHERE id_solicitud = $5
    `, [idOperador, montoAporte, cuentaBancaria.numero_cuenta, obsFinal, idSolicitud]);

    try {
      await client.query('COMMIT');
    } catch (commitError) {
      // El banco ya movió el aporte: se revierte, o queda en «Conciliación» si no se puede. Si el
      // COMMIT sí se aplicó (se confirma con otra conexión), la afiliación quedó hecha y se sigue.
      const reversion = await revertirOAnotar({
        origen: 'FORMALIZACION_AGENCIA',
        tipo: tipoMovimiento === 'DEBITO' ? 'CREDITO' : 'DEBITO',
        numeroCuenta: cuentaBancaria.numero_cuenta,
        cui: cuiFinal,
        monto: montoAporte,
        referencia: referenciaUsada,
        concepto: `Reversión de aporte: la formalización del caso ${sol.numero_caso} no se completó`,
        detalle: `Caso ${sol.numero_caso}`,
        clave: sol.id_solicitud,
        pid: client.processID,
      });
      if (!reversion.aplicada) throw errorTrasCommitFallido(reversion, commitError, referenciaUsada);
    }

    // Las credenciales se envían después del COMMIT: así nunca llega un correo de una afiliación que se deshizo.
    // Si el correo no sale, la afiliación queda hecha y se avisa al operador.
    let emailStatus = { sent: false, simulado: true, provider: 'demo' };
    if (crearUsuario) try {
      const mailRes = await mailerService.sendAccountCredentialsEmail({
        to: emailUsuario,
        nombre: personaNombreCompleto,
        codigoCorporativo: codigoUsuarioFinal,
        password: rawPass,
        rolNombre: 'ASOCIADO COOPERATIVISTA',
      });
      emailStatus = {
        sent: mailerService.wasSent(mailRes),
        simulado: !!mailRes.simulado,
        provider: mailRes.provider || 'demo',
      };
    } catch (mailErr) {
      console.warn('Aviso: No se pudo enviar el correo de credenciales:', mailErr.message);
    }
    const correoEnviado = emailStatus.sent;
    // Un usuario previo inactivo no puede entrar: no se informa como acceso.
    const accesoPortal = crearUsuario || Boolean(usuarioPrevio && usuarioPrevio.estado === 'ACTIVO');

    return {
      status: 200,
      success: true,
      message: !accesoPortal
        ? `Afiliación del caso ${sol.numero_caso} completada, sin acceso al portal. Se puede activar después desde el expediente.`
        : !crearUsuario
          ? `Afiliación del caso ${sol.numero_caso} completada. El asociado conserva su acceso al portal.`
          : correoEnviado
            ? `Afiliación del caso ${sol.numero_caso} completada. Se registró el aporte y se envió el acceso al portal por correo.`
            : `Afiliación del caso ${sol.numero_caso} completada, pero el correo con el usuario y la contraseña no se pudo enviar.`,
      data: {
        id_asociado: idAsociado,
        nombre_completo: personaNombreCompleto,
        usuario: codigoUsuarioFinal,
        numero_cuenta: cuentaCooperativa ? cuentaCooperativa.numero_cuenta : cuentaBancaria.numero_cuenta,
        tipo_cuenta: cuentaCooperativa ? 'Ahorro a la Vista (cooperativa)' : 'Cuenta de Ahorro Bancaria',
        origen_cuenta: cuentaCooperativa ? 'COOPERATIVA' : 'BANCO',
        metodo_pago: cobro.metodo,
        cuenta_bancaria: cuentaBancaria.numero_cuenta,
        cuenta_bancaria_nueva: cobro.metodo === 'EFECTIVO_VENTANILLA' && !cobro.numeroCuenta,
        saldo_inicial: montoAporte,
        email: crearUsuario ? emailUsuario : emailFinal,
        cui_dpi: sol.cui_dpi,
        telefono: sol.telefono,
        numero_caso: sol.numero_caso,
        operador_nombre: nombreOperador || (sol.id_operador_resuelve ? `Operador #${sol.id_operador_resuelve}` : 'Operador en Ventanilla'),
        email_status: emailStatus,
        acceso_portal: accesoPortal,
        acceso_existente: Boolean(usuarioPrevio),
        correo_enviado: correoEnviado,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505' && (['usuarios_email_key', 'uq_usuarios_email_lower'].includes(error.constraint) || (error.message && error.message.includes('usuarios_email_key')))) {
      return {
        status: 400,
        success: false,
        message: 'Ese correo ya lo usa otra persona. Cámbielo en la ficha para continuar.',
      };
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  bloquearCaso,
  liberarCaso,
  rechazarCaso,
  formalizarAfiliacion,
};
