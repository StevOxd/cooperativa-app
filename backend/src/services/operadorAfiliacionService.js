/**
 * Servicio de Dominio: Afiliaciones Operativas en Agencia (ARQ-03)
 * Contiene la lógica de negocio y transaccional para la atención y formalización de casos de afiliación.
 */

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { getNextCorporateCode, generateSecureRandomPassword } = require('../utils/codeGenerator');
const mfaService = require('./mfaService');
const mailerService = require('./mailerService');
const bancoApiService = require('./bancoApiService');
const { validateCui, validateAge18 } = require('../middlewares/validationMiddleware');

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
        message: `La solicitud ya no está pendiente (Estado: ${sol.estado}).`,
      };
    }

    // Si está bloqueada por otro operador activo
    if (sol.id_operador_bloqueo && sol.id_operador_bloqueo !== idOperador) {
      const opInfoRes = await client.query(`
        SELECT p.primer_nombre || ' ' || p.primer_apellido AS operador_nombre, u.codigo_corporativo AS operador_codigo
        FROM usuarios u
        JOIN personas p ON u.id_persona = p.id_persona
        WHERE u.id_persona = $1
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
      message: `Caso ${sol.numero_caso} tomado y bloqueado exitosamente para tu atención.`,
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
    message: 'Caso liberado exitosamente.',
  };
};

/**
 * Rechaza o cancela un caso de afiliación en agencia
 */
const rechazarCaso = async ({ idSolicitud, idOperador, motivo }) => {
  if (!motivo || !motivo.trim()) {
    return {
      status: 400,
      success: false,
      message: 'Debe especificar el motivo del rechazo o cancelación del caso.',
    };
  }

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
      message: 'Solicitud no encontrada o ya no está pendiente.',
    };
  }

  return {
    status: 200,
    success: true,
    message: `Caso ${updateRes.rows[0].numero_caso} cancelado correctamente.`,
    data: updateRes.rows[0],
  };
};

/**
 * Formaliza la afiliación en ventanilla y genera cuentas/credenciales de manera transaccional
 */
const formalizarAfiliacion = async ({ idSolicitud, idOperador, rolUsuario, datos, nombreOperador }) => {
  const {
    monto_aportacion,
    metodo_pago = 'EFECTIVO_VENTANILLA',
    tipo_asociado = 'EX',
    password_inicial = 'admin123',
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
  } = datos;

  const montoAporte = parseFloat(monto_aportacion);
  if (isNaN(montoAporte) || montoAporte < 100.00) {
    return {
      status: 400,
      success: false,
      message: 'La aportación inicial de membresía no puede ser inferior a Q100.00.',
    };
  }

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
        message: `Esta solicitud ya fue procesada anteriormente (Estado: ${sol.estado}).`,
      };
    }

    // Validar bloqueo si está asignado a otro
    if (sol.id_operador_bloqueo && sol.id_operador_bloqueo !== idOperador && rolUsuario !== 'ADMINISTRADOR') {
      await client.query('ROLLBACK');
      return {
        status: 409,
        success: false,
        message: 'El caso está siendo atendido por otro operador.',
      };
    }

    // Resolver valores finales permitiendo correcciones realizadas por el operador
    const cuiFinal = (cui_dpi && cui_dpi.trim()) ? cui_dpi.trim().replace(/\s+/g, '') : sol.cui_dpi;
    const pNombreFinal = (primer_nombre && primer_nombre.trim()) ? primer_nombre.trim() : sol.primer_nombre;
    const sNombreFinal = segundo_nombre !== undefined ? (segundo_nombre ? segundo_nombre.trim() : null) : sol.segundo_nombre;
    const pApellidoFinal = (primer_apellido && primer_apellido.trim()) ? primer_apellido.trim() : sol.primer_apellido;
    const sApellidoFinal = segundo_apellido !== undefined ? (segundo_apellido ? segundo_apellido.trim() : null) : sol.segundo_apellido;
    const telFinal = telefono !== undefined ? (telefono ? telefono.trim() : null) : sol.telefono;
    const dirFinal = direccion !== undefined ? (direccion ? direccion.trim() : null) : sol.direccion;
    const fNacFinal = fecha_nacimiento ? String(fecha_nacimiento).split('T')[0] : sol.fecha_nacimiento;
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
        message: 'Los nombres y apellidos únicamente pueden contener letras, sin números ni caracteres especiales.',
      };
    }
    if (sNombreFinal && !nameRegex.test(sNombreFinal)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'El segundo nombre únicamente puede contener letras.',
      };
    }
    if (sApellidoFinal && !nameRegex.test(sApellidoFinal)) {
      await client.query('ROLLBACK');
      return {
        status: 400,
        success: false,
        message: 'El segundo apellido únicamente puede contener letras.',
      };
    }

    if (telFinal) {
      const cleanTel = telFinal.replace(/\D/g, '');
      if (cleanTel.length !== 8) {
        await client.query('ROLLBACK');
        return {
          status: 400,
          success: false,
          message: `El número de teléfono debe contener exactamente 8 dígitos numéricos (ingresó ${cleanTel.length} dígitos).`,
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

    // 1. Inserción o actualización en personas con datos normalizados
    let idPersona;
    let personaNombreCompleto;
    const checkPersona = await client.query('SELECT id_persona, nombre_completo FROM personas WHERE cui_dpi = $1', [cuiFinal]);
    
    if (checkPersona.rows.length > 0) {
      idPersona = checkPersona.rows[0].id_persona;
      personaNombreCompleto = checkPersona.rows[0].nombre_completo;
      await client.query(`
        UPDATE personas 
        SET primer_nombre = $1, segundo_nombre = $2, primer_apellido = $3, segundo_apellido = $4,
            telefono = COALESCE($5, telefono), direccion = COALESCE($6, direccion), fecha_nacimiento = COALESCE($7, fecha_nacimiento)
        WHERE id_persona = $8
      `, [
        pNombreFinal, sNombreFinal, pApellidoFinal, sApellidoFinal,
        telFinal, dirFinal, fNacFinal, idPersona
      ]);
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
      idAsociado = checkSocio.rows[0].id_asociado;
    } else {
      const insSocio = await client.query(`
        INSERT INTO asociados (id_persona, fecha_ingreso, estado_asociado)
        VALUES ($1, CURRENT_DATE, 'ACTIVO')
        RETURNING id_asociado
      `, [idPersona]);
      idAsociado = insSocio.rows[0].id_asociado;
    }

    // 3. Generar usuario con código institucional EX
    const emailUsuario = emailFinal || `socio.${idAsociado}@cooperativa.com`;

    if (emailUsuario) {
      const checkDupEmail = await client.query(
        'SELECT id_persona FROM usuarios WHERE LOWER(email) = LOWER($1) AND id_persona != $2',
        [emailUsuario, idPersona]
      );
      if (checkDupEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          status: 400,
          success: false,
          message: `El correo electrónico "${emailUsuario}" ya se encuentra registrado por otro usuario en la cooperativa. Por favor modifique el correo en la ficha antes de formalizar.`,
        };
      }
    }

    const prefix = 'EX';
    const nextCode = await getNextCorporateCode(client, prefix);

    // Generar contraseña criptográfica segura de forma automática para el nuevo asociado
    const rawPass = generateSecureRandomPassword(12);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPass, salt);

    const checkUser = await client.query('SELECT id_persona, codigo_corporativo FROM usuarios WHERE id_persona = $1', [idPersona]);
    let codigoUsuarioFinal = nextCode;

    if (checkUser.rows.length > 0) {
      codigoUsuarioFinal = checkUser.rows[0].codigo_corporativo;
      await client.query(`
        UPDATE usuarios 
        SET id_rol = 3, estado = 'ACTIVO', email = $1, password_hash = $2, debe_cambiar_password = TRUE, mfa_enabled = FALSE
        WHERE id_persona = $3
      `, [emailUsuario, passwordHash, idPersona]);
    } else {
      await client.query(`
        INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, mfa_enabled, debe_cambiar_password)
        VALUES ($1, 3, $2, $3, $4, 'ACTIVO', FALSE, TRUE)
      `, [idPersona, nextCode, emailUsuario, passwordHash]);

      const mfaData = await mfaService.generateMfaSecret(nextCode);
      await client.query(`
        UPDATE usuarios 
        SET mfa_secret = $1, mfa_enabled = FALSE, mfa_qr_url = $2 
        WHERE id_persona = $3
      `, [mfaData.base32, mfaData.qr_code_url, idPersona]);
    }

    // Despacho de credenciales por correo electrónico institucional
    let emailStatus = { sent: false, simulado: true, provider: 'demo' };
    try {
      const userMfa = await client.query('SELECT mfa_secret, mfa_qr_url FROM usuarios WHERE id_persona = $1', [idPersona]);
      const mfaRow = userMfa.rows[0] || {};
      const mailRes = await mailerService.sendAccountCredentialsEmail({
        to: emailUsuario,
        nombre: personaNombreCompleto,
        codigoCorporativo: codigoUsuarioFinal,
        password: rawPass,
        rolNombre: 'ASOCIADO COOPERATIVISTA',
        qrDataUrl: mfaRow.mfa_qr_url || null,
        secretBase32: mfaRow.mfa_secret || null,
      });
      emailStatus = {
        sent: !!mailRes.success,
        simulado: !!mailRes.simulado,
        provider: mailRes.provider || 'demo',
      };
    } catch (mailErr) {
      console.warn('Aviso: No se pudo enviar el correo de credenciales (despacho no crítico):', mailErr.message);
      emailStatus = { sent: false, error: mailErr.message, simulado: true, provider: 'demo' };
    }

    // 4. Apertura de Cuenta Bancaria de Ahorro en la Entidad Bancaria (Core Banking)
    // El nuevo asociado formaliza su membresía en la cooperativa, y su aportación/depósito inicial
    // se apertura y acredita en una cuenta de ahorro en la Entidad Bancaria.
    // Posteriormente, el asociado traslada desde esta cuenta hacia las cuentas de la cooperativa.
    const bancoRes = await bancoApiService.aperturarCuentaBancaria({
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
      referencia: `CASO-${sol.numero_caso}`,
    });

    if (!bancoRes.success || !bancoRes.data) {
      await client.query('ROLLBACK');
      return {
        status: 502,
        success: false,
        message: bancoRes.message || 'Error al aperturar la cuenta de ahorro en la Entidad Bancaria.',
      };
    }

    const cuentaBancaria = bancoRes.data;

    // 5. Actualizar solicitud a ATENDIDA y registrar el número de cuenta bancaria y monto acreditado
    const obsFinal = observaciones
      ? `${sol.observaciones ? sol.observaciones + ' | ' : ''}Formalizado por operador en ventanilla: ${observaciones} (Cuenta Bancaria: ${cuentaBancaria.numero_cuenta})`
      : `${sol.observaciones ? sol.observaciones + ' | ' : ''}Cuenta Bancaria: ${cuentaBancaria.numero_cuenta}`;

    await client.query(`
      ALTER TABLE solicitudes_afiliacion_agencia 
      ADD COLUMN IF NOT EXISTS numero_cuenta_bancaria VARCHAR(50)
    `);

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

    await client.query('COMMIT');

    return {
      status: 200,
      success: true,
      message: `Afiliación del caso ${sol.numero_caso} formalizada con éxito. Se ha aperturado su cuenta de ahorro en la Entidad Bancaria y generado su acceso a la cooperativa.`,
      data: {
        id_asociado: idAsociado,
        nombre_completo: personaNombreCompleto,
        usuario: codigoUsuarioFinal,
        numero_cuenta: cuentaBancaria.numero_cuenta,
        tipo_cuenta: 'Cuenta de Ahorro Bancaria',
        origen_cuenta: 'BANCO',
        saldo_inicial: montoAporte,
        email: emailFinal,
        cui_dpi: sol.cui_dpi,
        telefono: sol.telefono,
        numero_caso: sol.numero_caso,
        operador_nombre: nombreOperador || (sol.id_operador_resuelve ? `Operador #${sol.id_operador_resuelve}` : 'Operador en Ventanilla'),
        email_status: emailStatus,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && (error.constraint === 'usuarios_email_key' || (error.message && error.message.includes('usuarios_email_key')))) {
      return {
        status: 400,
        success: false,
        message: 'El correo electrónico ya se encuentra registrado por otro usuario en la cooperativa. Ingrese un correo diferente en la ficha.',
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
