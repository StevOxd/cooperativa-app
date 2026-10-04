const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const mfaService = require('../services/mfaService');
const mailerService = require('../services/mailerService');
const bancoApiService = require('../services/bancoApiService');
const { getNextCorporateCode, resolvePrefix } = require('../utils/codeGenerator');
const { validatePassword } = require('../utils/passwordPolicy');

/**
 * 1. Valida el DPI del solicitante consultando al Core Banking API (banco-backend).
 * Identifica si es cliente/colaborador de la entidad bancaria o persona sin relación previa.
 */
const validarDpi = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi } = req.body;

    if (!cui_dpi) {
      return res.status(400).json({
        success: false,
        message: 'Escriba su número de DPI.',
      });
    }

    const cuiLimpio = cui_dpi.trim().replace(/\s+/g, '');
    if (!/^\d{13}$/.test(cuiLimpio)) {
      return res.status(400).json({
        success: false,
        message: 'El DPI debe tener 13 dígitos, sin espacios ni guiones.',
      });
    }

    // Regla especial: El Administrador (steven08) es administrativo global, no requiere cuenta de planilla
    if (cuiLimpio === '1000000000008') {
      return res.status(400).json({
        success: false,
        message: 'No es posible afiliar este DPI en línea. Comuníquese con la cooperativa.',
      });
    }

    // Comprobar si ya es asociado activo de la cooperativa
    const asocCheck = await client.query(
      `SELECT a.id_asociado, a.estado_asociado
       FROM asociados a
       JOIN personas p ON a.id_persona = p.id_persona
       WHERE p.cui_dpi = $1 AND a.estado_asociado = 'ACTIVO'`,
      [cuiLimpio]
    );

    if (asocCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        ya_es_asociado: true,
        message: 'Usted ya es asociado de la cooperativa. Inicie sesión en el portal.',
      });
    }

    // Consultar al Microservicio Core Banking (Banco API)
    const bancoRes = await bancoApiService.verificarDpi(cuiLimpio);

    if (!bancoRes.success || !bancoRes.existe_en_banco) {
      // ESCENARIO 2: No pertenece a la entidad bancaria
      return res.status(200).json({
        success: true,
        pertenece_banco: false,
        cui_dpi: cuiLimpio,
        message: 'No encontramos una cuenta del banco con este DPI. Complete sus datos y le daremos un número de caso para terminar la afiliación en una agencia.',
      });
    }

    // Pertenece a la entidad bancaria: Verificar si tiene cuentas activas
    if (!bancoRes.tiene_cuentas_activas) {
      return res.status(400).json({
        success: false,
        pertenece_banco: true,
        falta_requisitos: true,
        message: 'Su DPI está registrado en el banco, pero no tiene una cuenta monetaria o de ahorro activa. Acérquese a una agencia del banco.',
      });
    }

    // ESCENARIO 1: Cliente bancario detectado -> Solicitar autenticación con credenciales de la Banca en Línea
    return res.status(200).json({
      success: true,
      pertenece_banco: true,
      requiere_autenticacion_banco: true,
      cui_dpi: cuiLimpio,
      cliente: bancoRes.cliente,
      message: 'Es cliente del banco. Para continuar, confirme sus datos de la Banca en Línea.',
    });
  } catch (error) {
    console.error('[VALIDAR DPI ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'No pudimos consultar su DPI. Intente de nuevo en unos minutos.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 1.1 Valida las credenciales de la Banca en Línea (Usuario, Código, Contraseña) contra la API del Banco
 */
const validarCredencialesBanco = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi, nombre_usuario, codigo, password } = req.body;

    if (!cui_dpi || !nombre_usuario || !codigo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Escriba su usuario, su código de cliente y su contraseña de la Banca en Línea.',
      });
    }

    const cuiLimpio = cui_dpi.trim().replace(/\s+/g, '');

    // Comprobar si ya es asociado activo de la cooperativa
    const asocCheck = await client.query(
      `SELECT a.id_asociado FROM asociados a JOIN personas p ON a.id_persona = p.id_persona WHERE p.cui_dpi = $1 AND a.estado_asociado = 'ACTIVO'`,
      [cuiLimpio]
    );
    if (asocCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        ya_es_asociado: true,
        message: 'Usted ya es asociado de la cooperativa. Inicie sesión en el portal.',
      });
    }

    // Consultar al microservicio Core Banking
    const bancoAuthRes = await bancoApiService.validarCredenciales({
      cui_dpi: cuiLimpio,
      nombre_usuario,
      codigo,
      password,
    });

    if (!bancoAuthRes.success || bancoAuthRes.status !== 200) {
      // Credenciales bancarias incorrectas: 400, no 401. Esta ruta es pública y el
      // interceptor del frontend trata cualquier 401 como sesión vencida y redirige a /login.
      const status = !bancoAuthRes.status || bancoAuthRes.status === 401 ? 400 : bancoAuthRes.status;
      return res.status(status).json({
        success: false,
        message: bancoAuthRes.message || 'Credenciales de la Banca en Línea inválidas.',
      });
    }

    const cliente = bancoAuthRes.cliente;
    const cuentas = bancoAuthRes.cuentas || [];

    const tipoSujeto = cliente.tipo_cliente === 'EMPLEADO_PLANILLA' ? 'EMPLEADO_BANCO' : 'CLIENTE_BANCO';
    const tipoSujetoDescripcion = cliente.tipo_cliente === 'EMPLEADO_PLANILLA'
      ? 'Colaborador / Empleado de la Corporación Bancaria'
      : 'Cliente de la Entidad Bancaria Corporativa';

    return res.status(200).json({
      success: true,
      pertenece_banco: true,
      tipo_sujeto: tipoSujeto,
      tipo_sujeto_descripcion: tipoSujetoDescripcion,
      persona: {
        cui_dpi: cliente.cui_dpi,
        primer_nombre: cliente.primer_nombre,
        primer_apellido: cliente.primer_apellido,
        nombre_completo: cliente.nombre_completo,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        fecha_nacimiento: cliente.fecha_nacimiento,
        email: cliente.email,
        codigo_corporativo: cliente.codigo_bancario,
        nombre_usuario: cliente.nombre_usuario,
      },
      cuentas_bancarias: cuentas,
    });
  } catch (error) {
    console.error('[VALIDAR CREDENCIALES BANCO ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'No pudimos comunicarnos con el banco. Intente de nuevo en unos minutos.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 2. Procesa la afiliación para usuarios que YA pertenecen al banco (Escenario 1)
 * Debita directamente de su cuenta_bancaria de ahorro, genera cuenta de aportaciones y acceso.
 */
const procesarAfiliacionExistente = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      cui_dpi,
      id_cuenta_bancaria,
      numero_cuenta_bancaria,
      monto_aportacion,
      email,
      password,
    } = req.body;

    if (!cui_dpi || (!id_cuenta_bancaria && !numero_cuenta_bancaria) || !monto_aportacion) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos: DPI, cuenta del banco o monto del aporte.',
      });
    }

    const monto = parseFloat(monto_aportacion);
    if (isNaN(monto) || monto < 100.00) {
      return res.status(400).json({
        success: false,
        message: 'El aporte inicial mínimo es de Q100.00.',
      });
    }

    // La contraseña la elige el solicitante en el portal: se valida antes de debitar.
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
      });
    }

    await client.query('BEGIN');

    // 1. Buscar o registrar a la persona en la base de datos de la cooperativa
    const cuiLimpio = cui_dpi.trim().replace(/\s+/g, '');
    let personaRes = await client.query(
      `SELECT id_persona, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, fecha_nacimiento
       FROM personas WHERE cui_dpi = $1`,
      [cuiLimpio]
    );

    if (personaRes.rows.length === 0) {
      // Si la persona aún no estaba en la cooperativa (ej. cliente externo del banco), la traemos del Banco API
      const bcoCheck = await bancoApiService.verificarDpi(cuiLimpio);
      if (!bcoCheck.success || !bcoCheck.existe_en_banco) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'No encontramos este DPI en el banco.',
        });
      }

      const cli = bcoCheck.cliente || {};
      const pNom = cli.primer_nombre || 'Cliente';
      const sNom = cli.segundo_nombre || null;
      const pApe = cli.primer_apellido || 'Bancario';
      const sApe = cli.segundo_apellido || null;
      const tel = cli.telefono || '55550000';
      const dir = cli.direccion || 'Ciudad de Guatemala';
      const fNac = cli.fecha_nacimiento || '1990-01-01';

      personaRes = await client.query(
        `INSERT INTO personas (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, fecha_nacimiento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_persona, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, fecha_nacimiento`,
        [cuiLimpio, pNom, sNom, pApe, sApe, tel, dir, fNac]
      );
    }

    const persona = personaRes.rows[0];

    // Verificar si ya es asociado
    const checkAsoc = await client.query(
      'SELECT id_asociado FROM asociados WHERE id_persona = $1',
      [persona.id_persona]
    );
    if (checkAsoc.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Usted ya es asociado de la cooperativa. Inicie sesión en el portal.',
      });
    }

    // Verificar que el correo electrónico no esté registrado por otro usuario
    if (email && email.trim()) {
      const emailLimpio = email.trim().toLowerCase();
      const checkEmail = await client.query(
        'SELECT id_persona FROM usuarios WHERE LOWER(email) = $1 AND id_persona != $2',
        [emailLimpio, persona.id_persona]
      );
      if (checkEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Ese correo ya lo usa otra persona. Escriba otro.',
        });
      }
    }

    // 2. Ejecutar débito atómico en la Entidad Bancaria vía Banco API
    const targetNumeroCuenta = numero_cuenta_bancaria || (id_cuenta_bancaria ? String(id_cuenta_bancaria) : '');
    const refMovimiento = 'AFIL-COOP-' + Date.now();
    
    const debitRes = await bancoApiService.debitarCuenta({
      numero_cuenta: targetNumeroCuenta,
      monto: monto,
      concepto: 'Débito por aportación inicial de membresía cooperativa',
      referencia: refMovimiento,
    });

    if (!debitRes.success || debitRes.status !== 200) {
      await client.query('ROLLBACK');
      return res.status(debitRes.status || 400).json({
        success: false,
        message: debitRes.message || 'No fue posible debitar los fondos de la cuenta bancaria en la Entidad Bancaria.',
      });
    }

    const transaccionBanco = debitRes.data || {};
    const nuevoSaldoBco = transaccionBanco.saldo_nuevo !== undefined ? transaccionBanco.saldo_nuevo : 0;
    const numCtaFinal = transaccionBanco.numero_cuenta || targetNumeroCuenta;
    // 3. Registrar en asociados de la cooperativa
    const asocInsert = await client.query(
      `INSERT INTO asociados (id_persona, fecha_ingreso, estado_asociado)
       VALUES ($1, CURRENT_DATE, 'ACTIVO')
       RETURNING id_asociado`,
      [persona.id_persona]
    );
    const idAsociado = asocInsert.rows[0].id_asociado;

    // 4. Aperturar cuenta de Ahorro a la Vista cooperativa (id_tipo_cuenta = 2)
    const numeroCuentaCooperativa = 'CTA-AHORR-' + String(Math.floor(100000 + Math.random() * 900000));
    const cuentaCoopRes = await client.query(
      `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
       VALUES ($1, $2, 2, $3, 0.00, 'ACTIVA')
       RETURNING id_cuenta, numero_cuenta, saldo_disponible`,
      [numeroCuentaCooperativa, idAsociado, monto]
    );
    const cuentaCoop = cuentaCoopRes.rows[0];

    // 5. Registrar transacción en la cooperativa
    await client.query(
      `INSERT INTO transacciones (id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo, referencia, id_usuario_registra)
       VALUES ($1, 'DEPOSITO', $2, 0.00, $3, $4, NULL)`,
      [cuentaCoop.id_cuenta, monto, monto, `Depósito inicial de membresía debitada de cuenta bancaria ${numCtaFinal}`]
    );

    // 8. Crear o actualizar usuario en el portal web
    let usuarioFinal = null;
    const userExistRes = await client.query(
      'SELECT id_persona, codigo_corporativo, email, id_rol FROM usuarios WHERE id_persona = $1',
      [persona.id_persona]
    );

    // La contraseña es la que eligió el solicitante, así que no se le obliga a cambiarla al entrar.
    const hash = await bcrypt.hash(password, 10);
    if (userExistRes.rows.length > 0) {
      usuarioFinal = userExistRes.rows[0];
      await client.query(
        'UPDATE usuarios SET password_hash = $1, debe_cambiar_password = FALSE WHERE id_persona = $2',
        [hash, persona.id_persona]
      );
    } else {
      // Cliente o colaborador que no tenía usuario: crear rol ASOCIADO (3) con código EB-X o EX-X
      const prefix = resolvePrefix('ASOCIADO', req.body.tipo_asociado || (persona.cui_dpi?.startsWith('1000') ? 'EB' : 'EX'));
      const nextCod = await getNextCorporateCode(client, prefix);
      const userEmail = (email && email.trim()) ? email.trim().toLowerCase() : `socio.${nextCod.toLowerCase()}@cooperativa.com`;

      const userInsert = await client.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
         VALUES ($1, 3, $2, $3, $4, 'ACTIVO', FALSE)
         RETURNING id_persona, codigo_corporativo, email`,
        [persona.id_persona, nextCod, userEmail, hash]
      );
      usuarioFinal = userInsert.rows[0];
    }

    // 8.1 Generar secreto y Código QR para Doble Factor de Autenticación (MFA / 2FA TOTP RFC 6238)
    const mfaData = await mfaService.generateMfaSecret(usuarioFinal.codigo_corporativo);
    await client.query(
      `UPDATE usuarios 
       SET mfa_secret = $1, mfa_enabled = FALSE, mfa_qr_url = $2 
       WHERE id_persona = $3`,
      [mfaData.base32, mfaData.qr_code_url, persona.id_persona]
    );

    // 8.2 Despachar correo electrónico institucional con credenciales de acceso y Código QR
    await mailerService.sendAccountCredentialsEmail({
      to: usuarioFinal.email,
      nombre: persona.nombre_completo,
      codigoCorporativo: usuarioFinal.codigo_corporativo,
      // Sin contraseña: el correo no repite la que eligió el solicitante.
      password: null,
      rolNombre: 'ASOCIADO COOPERATIVISTA',
      qrDataUrl: mfaData.qr_code_url,
      secretBase32: mfaData.base32,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Afiliación completada. Su cuenta de ahorro ya está abierta y con su aporte inicial.',
      data: {
        asociado: {
          id_asociado: idAsociado,
          id_persona: persona.id_persona,
          nombre_completo: persona.nombre_completo,
        },
        usuario: {
          id_persona: usuarioFinal.id_persona,
          codigo_corporativo: usuarioFinal.codigo_corporativo,
          email: usuarioFinal.email,
        },
        cuenta_bancaria_origen: {
          numero_cuenta_bancaria: numCtaFinal,
          monto_debitado: monto,
          saldo_restante: nuevoSaldoBco,
          nuevo_saldo: nuevoSaldoBco,
        },
        cuenta_ahorro: {
          id_cuenta: cuentaCoop.id_cuenta,
          numero_cuenta: cuentaCoop.numero_cuenta,
          saldo_disponible: cuentaCoop.saldo_disponible,
        },
        cuenta_aportaciones: {
          id_cuenta: cuentaCoop.id_cuenta,
          numero_cuenta: cuentaCoop.numero_cuenta,
          saldo_disponible: cuentaCoop.saldo_disponible,
        },
        mfa: {
          secret: mfaData.base32,
          qr_code_url: mfaData.qr_code_url,
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[AFILIACION EXISTENTE ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo completar la afiliación. Intente de nuevo.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 3. Registra una solicitud para personas que NO pertenecen a la entidad bancaria (Escenario 2).
 * Emite un número de caso oficial para que el solicitante acuda a una agencia bancaria a formalizar.
 */
const registrarSolicitudAgencia = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      cui_dpi,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      telefono,
      direccion,
      fecha_nacimiento,
      email,
      monto_estimado,
    } = req.body;

    if (!cui_dpi || !primer_nombre || !primer_apellido || !fecha_nacimiento) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos: DPI, primer nombre, primer apellido o fecha de nacimiento.',
      });
    }

    // Validación de nombres y apellidos: SOLO LETRAS Y ESPACIOS
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!nameRegex.test(primer_nombre.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El primer nombre solo puede llevar letras.',
      });
    }
    if (!nameRegex.test(primer_apellido.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El primer apellido solo puede llevar letras.',
      });
    }
    if (segundo_nombre && segundo_nombre.trim() && !nameRegex.test(segundo_nombre.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El segundo nombre solo puede llevar letras.',
      });
    }
    if (segundo_apellido && segundo_apellido.trim() && !nameRegex.test(segundo_apellido.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El segundo apellido solo puede llevar letras.',
      });
    }

    // Validación de teléfono: exactamente 8 dígitos numéricos
    if (!telefono || !telefono.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Escriba su número de teléfono.',
      });
    }
    const telLimpio = telefono.trim().replace(/\D/g, '');
    if (telLimpio.length !== 8) {
      return res.status(400).json({
        success: false,
        message: `El teléfono debe tener 8 dígitos (tiene ${telLimpio.length}).`,
      });
    }

    const cuiLimpio = cui_dpi.trim().replace(/\s+/g, '');
    if (!/^\d{13}$/.test(cuiLimpio)) {
      return res.status(400).json({
        success: false,
        message: 'El DPI debe tener 13 dígitos, sin espacios ni guiones.',
      });
    }

    // Validación estricta y detallada de fecha de nacimiento
    const birthParts = String(fecha_nacimiento).split('-').map(Number);
    if (birthParts.length !== 3 || birthParts.some(isNaN)) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de nacimiento no es válida.',
      });
    }

    const [bYear, bMonth, bDay] = birthParts;
    const today = new Date();
    const birthDate = new Date(bYear, bMonth - 1, bDay);
    if (birthDate > today) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de nacimiento no puede ser futura.',
      });
    }

    let age = today.getFullYear() - bYear;
    const mDiff = (today.getMonth() + 1) - bMonth;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < bDay)) {
      age--;
    }

    if (isNaN(age) || age < 18) {
      return res.status(400).json({
        success: false,
        message: `Tiene ${age >= 0 ? age : 0} años. Para afiliarse debe ser mayor de edad (18 años cumplidos).`,
      });
    }

    if (age > 105) {
      return res.status(400).json({
        success: false,
        message: `La fecha da ${age} años. Revise el año de nacimiento.`,
      });
    }

    // Validación estricta de correo electrónico único
    if (email && email.trim()) {
      const emailLimpio = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLimpio)) {
        return res.status(400).json({
          success: false,
          message: 'Revise el correo. Debe verse así: nombre@correo.com.',
        });
      }

      const checkUserEmail = await client.query(
        'SELECT id_persona FROM usuarios WHERE LOWER(email) = $1',
        [emailLimpio]
      );
      if (checkUserEmail.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ese correo ya lo usa otra persona. Escriba otro.',
        });
      }

      const checkSolEmail = await client.query(
        "SELECT numero_caso FROM solicitudes_afiliacion_agencia WHERE LOWER(email) = $1 AND estado IN ('PENDIENTE_AGENCIA', 'EN_PROCESO')",
        [emailLimpio]
      );
      if (checkSolEmail.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Ya hay una solicitud en trámite con este correo (caso ${checkSolEmail.rows[0].numero_caso}).`,
        });
      }
    }

    // Comprobar si ya existe un caso pendiente para este DPI
    const existingCase = await client.query(
      `SELECT numero_caso, fecha_solicitud, estado
       FROM solicitudes_afiliacion_agencia
       WHERE cui_dpi = $1 AND estado = 'PENDIENTE_AGENCIA'
       ORDER BY id_solicitud DESC LIMIT 1`,
      [cuiLimpio]
    );

    if (existingCase.rows.length > 0) {
      const caso = existingCase.rows[0];
      return res.status(200).json({
        success: true,
        reincidente: true,
        numero_caso: caso.numero_caso,
        fecha_solicitud: caso.fecha_solicitud,
        message: `Ya tiene una solicitud en trámite (caso ${caso.numero_caso}). Preséntese en cualquier agencia con ese número.`,
        data: {
          numero_caso: caso.numero_caso,
          cui_dpi: cuiLimpio,
          nombre_completo: `${primer_nombre} ${primer_apellido}`,
          fecha_solicitud: caso.fecha_solicitud,
        },
      });
    }

    // Generar correlativo atómico CASO-AFIL-YYYY-XXXX
    const nextValRes = await client.query("SELECT nextval('seq_numero_caso_afiliacion') AS val");
    const year = today.getFullYear();
    const correlativo = String(nextValRes.rows[0].val).padStart(4, '0');
    const numeroCaso = `CASO-AFIL-${year}-${correlativo}`;

    const montoEst = parseFloat(monto_estimado) || 100.00;

    const insertCaseRes = await client.query(
      `INSERT INTO solicitudes_afiliacion_agencia (
        numero_caso, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        telefono, direccion, fecha_nacimiento, email, monto_estimado, estado, observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDIENTE_AGENCIA', $12)
      RETURNING *`,
      [
        numeroCaso,
        cuiLimpio,
        primer_nombre.trim(),
        segundo_nombre ? segundo_nombre.trim() : null,
        primer_apellido.trim(),
        segundo_apellido ? segundo_apellido.trim() : null,
        telefono ? telefono.trim() : null,
        direccion ? direccion.trim() : null,
        fecha_nacimiento,
        email ? email.trim().toLowerCase() : null,
        montoEst,
        'Registro digital previo. Pendiente depósito y formalización en agencia bancaria.',
      ]
    );

    const solicitud = insertCaseRes.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Solicitud registrada. Preséntese en una agencia del banco para terminar la afiliación.',
      data: {
        id_solicitud: solicitud.id_solicitud,
        numero_caso: solicitud.numero_caso,
        cui_dpi: solicitud.cui_dpi,
        nombre_completo: `${solicitud.primer_nombre} ${solicitud.primer_apellido}`,
        fecha_solicitud: solicitud.fecha_solicitud,
        monto_estimado: solicitud.monto_estimado,
        estado: solicitud.estado,
        instrucciones:
          'Debe avocarse a cualquier agencia de la Corporación Bancaria con su DPI original y su Número de Caso para depositar sus fondos iniciales y formalizar su cuenta de ahorro y membresía.',
      },
    });
  } catch (error) {
    console.error('[REGISTRAR SOLICITUD AGENCIA ERROR]:', error);
    let errorMsg = 'Error al registrar solicitud de afiliación para agencia.';
    if (error.code === '22001') {
      errorMsg = 'Uno de los campos ingresados excede la longitud máxima permitida (ej: número de teléfono o nombres demasiado extensos).';
    } else if (error.code === '23505') {
      errorMsg = 'Ya existe un registro con los datos ingresados.';
    } else if (error.message) {
      errorMsg = error.message;
    }
    return res.status(400).json({
      success: false,
      message: errorMsg,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
 finally {
    client.release();
  }
};

/**
 * 4. Valida en tiempo real si un correo electrónico está disponible o ya pertenece a otro usuario/solicitud.
 * GET/POST /api/afiliacion/verificar-email
 */
const verificarEmail = async (req, res) => {
  const client = await pool.connect();
  try {
    const rawEmail = req.body.email || req.query.email;
    const excluirIdPersona = req.body.excluir_id_persona || req.query.excluir_id_persona;
    const excluirIdSolicitud = req.body.excluir_id_solicitud || req.query.excluir_id_solicitud;

    if (!rawEmail || !rawEmail.trim()) {
      return res.status(400).json({
        success: false,
        disponible: false,
        message: 'Escriba su correo electrónico.',
      });
    }

    const email = rawEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(200).json({
        success: true,
        disponible: false,
        formato_invalido: true,
        message: 'Revise el formato del correo.',
      });
    }

    // 1. Verificar en usuarios (asociados, operadores, administradores)
    let userQuery = 'SELECT id_persona, codigo_corporativo FROM usuarios WHERE LOWER(email) = $1';
    const userParams = [email];
    if (excluirIdPersona) {
      userQuery += ' AND id_persona != $2';
      userParams.push(excluirIdPersona);
    }
    const userCheck = await client.query(userQuery, userParams);

    if (userCheck.rows.length > 0) {
      return res.status(200).json({
        success: true,
        disponible: false,
        motivo: 'USUARIO_EXISTENTE',
        message: 'Ese correo ya está registrado.',
      });
    }

    // 2. Verificar en solicitudes de afiliación en trámite en agencia
    let solQuery = `
      SELECT id_solicitud, numero_caso 
      FROM solicitudes_afiliacion_agencia 
      WHERE LOWER(email) = $1 AND estado IN ('PENDIENTE_AGENCIA', 'EN_PROCESO')
    `;
    const solParams = [email];
    if (excluirIdSolicitud) {
      solQuery += ' AND id_solicitud != $2';
      solParams.push(excluirIdSolicitud);
    }
    const solCheck = await client.query(solQuery, solParams);

    if (solCheck.rows.length > 0) {
      return res.status(200).json({
        success: true,
        disponible: false,
        motivo: 'SOLICITUD_PENDIENTE',
        message: `Ya hay una solicitud en trámite con este correo (caso ${solCheck.rows[0].numero_caso}).`,
      });
    }

    return res.status(200).json({
      success: true,
      disponible: true,
      message: 'Correo electrónico disponible.',
    });
  } catch (error) {
    console.error('[VERIFICAR EMAIL ERROR]:', error);
    return res.status(500).json({
      success: false,
      disponible: false,
      message: 'No se pudo revisar el correo. Intente de nuevo.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  validarDpi,
  validarCredencialesBanco,
  procesarAfiliacionExistente,
  registrarSolicitudAgencia,
  verificarEmail,
};
