const bcrypt = require('bcryptjs');
const db = require('../config/db');
const socketService = require('../services/socketService');
const mailerService = require('../services/mailerService');
const { getNextCorporateCode, resolvePrefix, generateSecureRandomPassword } = require('../utils/codeGenerator');
const { filtroUsuario } = require('../utils/identificadores');
const { respuestaDeError } = require('../utils/errores');
const { ipDelCliente } = require('../utils/ipCliente');
const { SEGURIDAD } = require('../config/constants');

// Motivo con que queda en la auditoría el cambio de correo; el reinicio de contraseña lo busca
const MOTIVO_CAMBIO_CORREO = 'Correo cambiado';

const ROLES_PERMITIDOS = ['ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO', 'ASOCIADO'];
const ESTADOS_PERMITIDOS = ['ACTIVO', 'INACTIVO'];
const ID_ROL_ASOCIADO = 3;

const getClientIp = ipDelCliente;
const getUserAgent = (req) => req.headers['user-agent'] || 'Desconocido';

/**
 * Obtener la lista detallada de usuarios con id_usuario y Código Corporativo
 * GET /api/usuarios?estado=ACTIVO&search=1001
 */
const getUsers = async (req, res) => {
  try {
    const { estado, search, rol } = req.query;
    const conditions = [];
    const values = [];

    // Filtro opcional por estado (ACTIVO / INACTIVO)
    if (estado) {
      const estadoUpper = estado.toUpperCase();
      if (!ESTADOS_PERMITIDOS.includes(estadoUpper)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Los valores permitidos son: ${ESTADOS_PERMITIDOS.join(', ')}`,
        });
      }
      values.push(estadoUpper);
      conditions.push(`u.estado = $${values.length}`);
    }

    // Filtro opcional por rol / tipo de usuario
    if (rol && rol.trim() !== '') {
      const rolUpper = rol.trim().toUpperCase();
      if (!ROLES_PERMITIDOS.includes(rolUpper)) {
        return res.status(400).json({
          success: false,
          message: `Rol inválido. Los valores permitidos son: ${ROLES_PERMITIDOS.join(', ')}`,
        });
      }
      values.push(rolUpper);
      conditions.push(`r.codigo = $${values.length}`);
    }

    // Filtro opcional por búsqueda de texto (exclusivamente por Código de Usuario)
    if (search && search.trim() !== '') {
      values.push(`%${search.trim()}%`);
      const paramIndex = values.length;
      conditions.push(`u.codigo_corporativo ILIKE $${paramIndex}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const queryText = `
      SELECT 
        u.id_usuario,
        u.id_usuario AS id,
        u.id_persona,
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.email, 
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.intentos_fallidos,
        u.bloqueado_hasta,
        u.sesion_activa_id,
        u.ultimo_ping,
        u.ultimo_acceso,
        u.debe_cambiar_password,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      ${whereClause}
      ORDER BY u.codigo_corporativo ASC
    `;

    const result = await db.query(queryText, values);

    // Calcular estado de presencia y bloqueo por intentos en tiempo real
    const now = new Date();
    const dosMinutosEnMs = 2 * 60 * 1000;

    const mappedUsers = result.rows.map((u) => {
      const tieneSesion = Boolean(u.sesion_activa_id);
      const socketActivo = socketService.isUserConnected(u.id_usuario, u.sesion_activa_id);
      const pingReciente = Boolean(u.ultimo_ping && (now - new Date(u.ultimo_ping)) < dosMinutosEnMs);
      const en_linea = Boolean(tieneSesion && (socketActivo || pingReciente));

      const bloqueadoPorTiempo = u.bloqueado_hasta && new Date(u.bloqueado_hasta) > now;
      const bloqueadoPorIntentos = Boolean(bloqueadoPorTiempo || (u.intentos_fallidos >= 3));

      return {
        ...u,
        en_linea,
        bloqueado_por_intentos: bloqueadoPorIntentos,
      };
    });

    return res.status(200).json({
      success: true,
      total: mappedUsers.length,
      data: mappedUsers,
    });
  } catch (error) {
    console.error('Error en userController.getUsers:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar la lista de usuarios. Intente de nuevo.',
    });
  }
};

/**
 * Obtener un usuario por su id_usuario o Código Corporativo
 * GET /api/usuarios/:id
 */
const getUserById = async (req, res) => {
  try {
    const filtro = filtroUsuario(req.params.id);

    const queryText = `
      SELECT 
        u.id_usuario,
        u.id_usuario AS id,
        u.id_persona,
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.email, 
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.debe_cambiar_password,
        u.ultimo_acceso,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE ${filtro.condicion}
      LIMIT 1
    `;
    const result = await db.query(queryText, [filtro.valor]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error en userController.getUserById:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cargar el usuario. Intente de nuevo.',
    });
  }
};

/**
 * Función auxiliar para generar un código de usuario / corporativo según estándar:
 * AD-X (Admin), OP-X (Operador), EB-X (Empleado Bancario), EX-X (Ajeno/Externo)
 */
const generateNextCorporateCode = async (client, rolUpper, tipoAsociado = 'EX') => {
  const prefix = resolvePrefix(rolUpper, tipoAsociado);
  return await getNextCorporateCode(client, prefix);
};

/**
 * Obtener el siguiente código correlativo disponible para un rol específico (EJ-X, OP-X)
 * GET /api/usuarios/next-code?rol=EJECUTIVO
 */
const getNextCode = async (req, res) => {
  try {
    const { rol, tipo_asociado } = req.query;
    const rolUpper = (rol || 'EJECUTIVO').trim().toUpperCase();
    const prefix = resolvePrefix(rolUpper, tipo_asociado);
    const nextCode = await getNextCorporateCode(db, prefix);

    return res.status(200).json({
      success: true,
      rol: rolUpper,
      prefix,
      next_code: nextCode,
    });
  } catch (error) {
    console.error('Error en userController.getNextCode:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo calcular el siguiente código de usuario.',
    });
  }
};

/**
 * Crear un nuevo usuario mediante Transacción SQL (personas + usuarios + auditoría)
 * POST /api/usuarios
 *
 * La contraseña temporal se genera al azar y solo se envía por correo, después del COMMIT; el usuario debe
 * cambiarla al entrar. Si la petición trae `password`, se rechaza.
 *
 * @async
 * @param {import('express').Request} req - `req.body`: datos de la persona, `email`, `rol` y `estado`.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 201 con el usuario (sin contraseña) y `correo_enviado`; 400 por
 *   datos inválidos o si trae contraseña; 403 si el rol no se crea desde aquí; 409 si el correo, el código o el
 *   DPI ya están en uso; 500.
 */
const createUser = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const {
      codigo_corporativo,
      nombre,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      cui_dpi,
      telefono,
      direccion,
      fecha_nacimiento,
      email,
      password,
      rol,
      estado,
      tipo_asociado,
    } = req.body;

    // 1. Validar campos obligatorios
    if (!email || !rol || (!nombre && !primer_nombre)) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos: nombre, correo o rol.',
      });
    }

    // 1.05 Validaciones rigurosas de integridad y formato
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Revise el correo. Debe verse así: nombre@correo.com.',
      });
    }

    // El DPI es obligatorio: identifica a la persona en la segregación de funciones y en el banco
    if (typeof cui_dpi !== 'string' || !/^\d{13}$/.test(cui_dpi.trim().replace(/\s+/g, ''))) {
      return res.status(400).json({
        success: false,
        message: 'El DPI debe tener 13 dígitos.',
      });
    }

    if (telefono) {
      const cleanTel = telefono.trim().replace(/\D/g, '');
      if (cleanTel.length !== 8) {
        return res.status(400).json({
          success: false,
          message: 'El teléfono debe tener 8 dígitos.',
        });
      }
    }

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (primer_nombre && (!nameRegex.test(primer_nombre.trim()) || primer_nombre.trim().length < 2)) {
      return res.status(400).json({
        success: false,
        message: 'Escriba el primer nombre (al menos 2 letras, solo letras).',
      });
    }
    if (segundo_nombre && !nameRegex.test(segundo_nombre.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El segundo nombre solo puede llevar letras.',
      });
    }
    if (primer_apellido && (!nameRegex.test(primer_apellido.trim()) || primer_apellido.trim().length < 2)) {
      return res.status(400).json({
        success: false,
        message: 'Escriba el primer apellido (al menos 2 letras, solo letras).',
      });
    }
    if (segundo_apellido && !nameRegex.test(segundo_apellido.trim())) {
      return res.status(400).json({
        success: false,
        message: 'El segundo apellido solo puede llevar letras.',
      });
    }

    // personas.fecha_nacimiento es obligatoria: sin ella el registro fallaba con un error interno
    if (!fecha_nacimiento) {
      return res.status(400).json({
        success: false,
        message: 'Escriba la fecha de nacimiento.',
      });
    }
    const birth = new Date(fecha_nacimiento);
    if (isNaN(birth.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de nacimiento no es válida.',
      });
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    if (age < 18) {
      return res.status(400).json({
        success: false,
        message: `La persona debe ser mayor de edad (18 años cumplidos). Tiene ${age >= 0 ? age : 0} años.`,
      });
    }

    // 1.1 La contraseña temporal siempre se genera al azar y solo viaja por correo: nadie la elige ni la conoce,
    //     tampoco el administrador (igual que al editar o al reiniciarla)
    if (typeof password === 'string' ? password.trim() !== '' : password != null) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña no se elige al crear un usuario: se genera al azar y se envía a su correo.',
        error: 'PASSWORD_CHANGE_NOT_ALLOWED',
      });
    }
    const rawPassword = generateSecureRandomPassword(12);

    // 2. Normalizar y validar rol
    const rolUpper = rol.toUpperCase();
    if (!ROLES_PERMITIDOS.includes(rolUpper)) {
      return res.status(400).json({
        success: false,
        message: `Rol no válido. Roles permitidos: ${ROLES_PERMITIDOS.join(', ')}`,
      });
    }

    // Regla de segregación de funciones y auditoría:
    // El Administrador únicamente puede crear usuarios con rol EJECUTIVO u OPERADOR.
    // Los asociados deben ser creados/afiliados mediante el Operador.
    if (req.user && req.user.rol === 'ADMINISTRADOR') {
      if (rolUpper !== 'EJECUTIVO' && rolUpper !== 'OPERADOR') {
        return res.status(403).json({
          success: false,
          message: 'Desde aquí solo se crean operadores y ejecutivos. Los asociados se registran desde Asociados.',
        });
      }
    }

    const estadoUpper = estado ? estado.toUpperCase() : 'ACTIVO';
    if (!ESTADOS_PERMITIDOS.includes(estadoUpper)) {
      return res.status(400).json({
        success: false,
        message: `Estado no válido. Estados permitidos: ${ESTADOS_PERMITIDOS.join(', ')}`,
      });
    }

    // 3. Obtener id_rol correspondiente
    const roleResult = await client.query('SELECT id_rol, codigo, nombre FROM roles WHERE codigo = $1', [rolUpper]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Ese rol no existe.' });
    }
    const roleData = roleResult.rows[0];
    const rolId = roleData.id_rol;

    // 4. Determinar código de usuario estrictamente según el correlativo del rol (EJ-X, OP-X)
    let finalCodigoCorp = '';
    if (rolUpper === 'EJECUTIVO' || rolUpper === 'OPERADOR' || rolUpper === 'ADMINISTRADOR') {
      const prefix = resolvePrefix(rolUpper, tipo_asociado);
      finalCodigoCorp = await getNextCorporateCode(client, prefix);
    } else if (codigo_corporativo && /^[A-Za-z0-9_.-]{3,30}$/.test(codigo_corporativo.trim())) {
      finalCodigoCorp = codigo_corporativo.trim();
    } else {
      const prefix = resolvePrefix(rolUpper, tipo_asociado);
      finalCodigoCorp = await getNextCorporateCode(client, prefix);
    }

    // 5. Validar unicidad de email, código corporativo y DPI
    const existsQuery = `
      SELECT u.id_persona, u.email, u.codigo_corporativo, p.cui_dpi
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      WHERE LOWER(u.email) = LOWER($1) 
         OR u.codigo_corporativo = $2
         OR ($3::text IS NOT NULL AND p.cui_dpi = $3)
      LIMIT 1
    `;
    const cleanDpi = cui_dpi.trim().replace(/\s+/g, '');
    const existsResult = await client.query(existsQuery, [email.trim(), finalCodigoCorp, cleanDpi]);

    if (existsResult.rows.length > 0) {
      const existing = existsResult.rows[0];
      let field = 'campo';
      if (existing.email.toLowerCase() === email.trim().toLowerCase()) field = 'correo electrónico';
      else if (existing.codigo_corporativo === finalCodigoCorp) field = 'código corporativo';
      else if (existing.cui_dpi === cleanDpi) field = 'DPI / CUI';

      return res.status(409).json({
        success: false,
        message: `Ya hay un usuario con ese ${field}.`,
      });
    }

    // 6. Normalizar nombres y apellidos para la tabla personas
    let pNombre = primer_nombre;
    let sNombre = segundo_nombre || '';
    let pApellido = primer_apellido;
    let sApellido = segundo_apellido || '';

    if (!pNombre && nombre) {
      const parts = nombre.trim().split(/\s+/);
      if (parts.length === 1) {
        pNombre = parts[0];
        pApellido = parts[0];
      } else if (parts.length === 2) {
        pNombre = parts[0];
        pApellido = parts[1];
      } else if (parts.length === 3) {
        pNombre = parts[0];
        sNombre = parts[1];
        pApellido = parts[2];
      } else {
        pNombre = parts[0];
        sNombre = parts[1];
        pApellido = parts[2];
        sApellido = parts.slice(3).join(' ');
      }
    }

    const cui = cleanDpi;

    // INICIAR TRANSACCIÓN SQL
    await client.query('BEGIN');

    // 7. Insertar en tabla personas (genera id_persona)
    const personaInsert = `
      INSERT INTO personas (cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion, fecha_nacimiento)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id_persona, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion
    `;
    const personaResult = await client.query(personaInsert, [
      cui,
      pNombre || 'Usuario',
      sNombre || null,
      pApellido || 'Cooperativa',
      sApellido || null,
      telefono || null,
      direccion || null,
      fecha_nacimiento || null,
    ]);
    const personaId = personaResult.rows[0].id_persona;

    // 8. Encriptar contraseña con bcryptjs
    const password_hash = await bcrypt.hash(rawPassword, 10);

    // 9. Insertar en tabla usuarios (id_usuario es su propia llave; id_persona la une con personas)
    const usuarioInsert = `
      INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING id_usuario, id_persona, codigo_corporativo, email, estado, debe_cambiar_password, fecha_creacion
    `;
    const userResult = await client.query(usuarioInsert, [
      personaId,
      rolId,
      finalCodigoCorp,
      email.trim().toLowerCase(),
      password_hash,
      estadoUpper,
    ]);
    const createdUser = userResult.rows[0];

    // 10. Si es asociado, registrar en tabla asociados
    if (rolUpper === 'ASOCIADO') {
      await client.query(
        `INSERT INTO asociados (id_persona, estado_asociado) VALUES ($1, 'ACTIVO') ON CONFLICT DO NOTHING`,
        [personaId]
      );
    }

    // 11. Registrar en historial_estados_usuario para auditoría
    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);
    const auditoriaInsert = `
      INSERT INTO historial_estados_usuario (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
      VALUES ($1, NULL, $2, NULL, $3, $4, 'Creación de usuario', $5, $6)
    `;
    await client.query(auditoriaInsert, [
      createdUser.id_usuario,
      estadoUpper,
      rolId,
      req.user?.id_usuario || null,
      clientIp,
      userAgent,
    ]);

    // La verificación en dos pasos la activa el propio usuario desde «Seguridad» (menú del usuario).
    const fullName = TRIM_NAME(pNombre, sNombre, pApellido, sApellido);

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');

    // Despachar correo electrónico institucional con las credenciales de acceso (Usuario, Password) y Código QR,
    // después del COMMIT. Si no sale, el usuario queda creado y se avisa al administrador.
    let correoEnviado = false;
    try {
      const mailRes = await mailerService.sendAccountCredentialsEmail({
        to: createdUser.email,
        nombre: fullName,
        codigoCorporativo: createdUser.codigo_corporativo,
        password: rawPassword,
        rolNombre: roleData.nombre,
      });
      correoEnviado = mailerService.wasSent(mailRes);
    } catch (mailErr) {
      console.warn('Aviso: No se pudo enviar el correo de credenciales:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: correoEnviado
        ? `Se creó el usuario ${createdUser.codigo_corporativo}. Enviamos su contraseña temporal a ${createdUser.email}.`
        : `Se creó el usuario ${createdUser.codigo_corporativo}, pero el correo con su contraseña temporal no se pudo enviar.`,
      correo_enviado: correoEnviado,
      // La contraseña temporal y el secreto 2FA solo viajan por correo al usuario: nunca en la respuesta.
      data: {
        id: createdUser.id_usuario,
        id_usuario: createdUser.id_usuario,
        id_persona: createdUser.id_persona,
        codigo_corporativo: createdUser.codigo_corporativo,
        cui_dpi: cui,
        nombre_completo: fullName,
        nombre: fullName,
        primer_nombre: pNombre,
        segundo_nombre: sNombre,
        primer_apellido: pApellido,
        segundo_apellido: sApellido,
        telefono: telefono || null,
        direccion: direccion || null,
        email: createdUser.email,
        id_rol: rolId,
        rol: rolUpper,
        rol_nombre: roleData.nombre,
        estado: createdUser.estado,
        fecha_creacion: createdUser.fecha_creacion,
        debe_cambiar_password: Boolean(createdUser.debe_cambiar_password),
        mfa: {
          enabled: false,
        },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en userController.createUser:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo crear el usuario. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};

/**
 * Actualizar datos de un usuario (Actualiza personas + usuarios por id_usuario y registra auditoría)
 * PUT /api/usuarios/:id
 *
 * El DPI no se cambia desde aquí. Los cambios de datos personales quedan en la auditoría con su valor anterior,
 * y los campos que no vienen en la petición se quedan como están. Cambiar el rol o el estado cierra la sesión
 * del usuario y sus conexiones en tiempo real.
 *
 * @returns {Promise<import('express').Response>} 200 con el usuario actualizado, 400 por datos inválidos o
 *   si se intenta cambiar el DPI, 404 si no existe, 409 si el correo o el código ya los usa otro usuario o si el cambio de rol le daría a la
 *   persona un segundo usuario del mismo tipo, o 500.
 */
const updateUser = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const filtro = filtroUsuario(id);
    const {
      codigo_corporativo,
      nombre,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      cui_dpi,
      telefono,
      direccion,
      fecha_nacimiento,
      email,
      password,
      rol,
      estado,
    } = req.body;

    // 1. Verificar si el usuario existe
    const checkUser = await client.query(
      `SELECT u.*, r.codigo AS rol_codigo, p.id_persona AS persona_id_ref
       FROM usuarios u
       JOIN roles r ON u.id_rol = r.id_rol
       JOIN personas p ON u.id_persona = p.id_persona
       WHERE ${filtro.condicion}`,
      [filtro.valor]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const currentUser = checkUser.rows[0];
    const targetUserId = currentUser.id_usuario;
    const targetPersonaId = currentUser.id_persona;

    // 2. Validar rol si se proporciona
    let rolId = currentUser.id_rol;
    let rolUpper = currentUser.rol_codigo;
    if (rol) {
      rolUpper = rol.toUpperCase();
      if (!ROLES_PERMITIDOS.includes(rolUpper)) {
        return res.status(400).json({
          success: false,
          message: `Rol no válido. Roles permitidos: ${ROLES_PERMITIDOS.join(', ')}`,
        });
      }
      const rRes = await client.query('SELECT id_rol FROM roles WHERE codigo = $1', [rolUpper]);
      if (rRes.rows.length > 0) {
        rolId = rRes.rows[0].id_rol;
      }
    }

    // 3. Validar estado si se proporciona
    let estadoUpper = currentUser.estado;
    if (estado) {
      estadoUpper = estado.toUpperCase();
      if (!ESTADOS_PERMITIDOS.includes(estadoUpper)) {
        return res.status(400).json({
          success: false,
          message: `Estado no válido. Estados permitidos: ${ESTADOS_PERMITIDOS.join(', ')}`,
        });
      }
    }

    const updatedEmail = email ? email.trim().toLowerCase() : currentUser.email;
    if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(updatedEmail)) {
      return res.status(400).json({ success: false, message: 'Revise el correo. Debe verse así: nombre@correo.com.' });
    }
    const updatedCodigoCorp = codigo_corporativo ? codigo_corporativo.trim() : currentUser.codigo_corporativo;

    if (codigo_corporativo && !/^(AD|OP|EJ|EX|EB)-[0-9]+$/i.test(updatedCodigoCorp) && !/^[0-9]{4}$/.test(updatedCodigoCorp)) {
      return res.status(400).json({
        success: false,
        message: 'El código de usuario no es válido (por ejemplo: OP-1, EJ-1).',
      });
    }

    // 4. Verificar colisión de duplicados
    const duplicateQuery = `
      SELECT id_usuario, email, codigo_corporativo
      FROM usuarios 
      WHERE (LOWER(email) = LOWER($1) OR codigo_corporativo = $2) AND id_usuario <> $3
      LIMIT 1
    `;
    const duplicateResult = await client.query(duplicateQuery, [
      updatedEmail,
      updatedCodigoCorp,
      targetUserId,
    ]);

    if (duplicateResult.rows.length > 0) {
      const existing = duplicateResult.rows[0];
      let field = 'campo';
      if (existing.email.toLowerCase() === updatedEmail.toLowerCase()) field = 'correo electrónico';
      else if (existing.codigo_corporativo === updatedCodigoCorp) field = 'código corporativo';

      return res.status(409).json({
        success: false,
        message: `Ese ${field} ya lo usa otro usuario.`,
      });
    }

    // 5. La contraseña no se cambia al editar: el administrador no debe conocer la de otra
    //    persona. Se usa POST /:id/reset-password, que genera una temporal, la envía por correo
    //    y obliga a cambiarla en el siguiente ingreso.
    const password_hash = currentUser.password_hash;
    if (password && password.trim() !== '') {
      return res.status(400).json({
        success: false,
        message: 'La contraseña no se cambia al editar un usuario. Use «Reiniciar contraseña».',
        error: 'PASSWORD_CHANGE_NOT_ALLOWED',
      });
    }

    // 5.1 El DPI no se cambia desde aquí: identifica a la persona en el banco y en sus cuentas
    const personaActualRes = await client.query(
      `SELECT cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion,
              TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento
       FROM personas WHERE id_persona = $1`,
      [targetPersonaId]
    );
    const personaActual = personaActualRes.rows[0] || {};
    if (cui_dpi && String(cui_dpi).replace(/\D/g, '') !== personaActual.cui_dpi) {
      return res.status(400).json({
        success: false,
        message: 'El DPI no se cambia desde Usuarios: identifica a la persona en el banco y en sus cuentas.',
      });
    }

    // INICIAR TRANSACCIÓN SQL
    await client.query('BEGIN');

    // 6. Actualizar datos en tabla personas (sin el DPI) y dejar constancia de lo que cambió
    if (nombre || primer_nombre || telefono || direccion || fecha_nacimiento) {
      // Un campo que no viene en la petición se queda como está; uno que viene vacío se borra
      let pNom = primer_nombre;
      let sNom = segundo_nombre === undefined ? personaActual.segundo_nombre ?? null : segundo_nombre || null;
      let pApe = primer_apellido;
      let sApe = segundo_apellido === undefined ? personaActual.segundo_apellido ?? null : segundo_apellido || null;

      if (!pNom && nombre) {
        const parts = nombre.trim().split(/\s+/);
        if (parts.length === 1) {
          pNom = parts[0];
          sNom = null;
          pApe = parts[0];
          sApe = null;
        } else if (parts.length === 2) {
          pNom = parts[0];
          sNom = null;
          pApe = parts[1];
          sApe = null;
        } else if (parts.length === 3) {
          pNom = parts[0];
          sNom = parts[1];
          pApe = parts[2];
          sApe = null;
        } else {
          pNom = parts[0];
          sNom = parts[1];
          pApe = parts[2];
          sApe = parts.slice(3).join(' ');
        }
      }

      const personaNuevaRes = await client.query(
        `UPDATE personas 
         SET primer_nombre = COALESCE($1, primer_nombre),
             segundo_nombre = $2,
             primer_apellido = COALESCE($3, primer_apellido),
             segundo_apellido = $4,
             telefono = COALESCE($5, telefono),
             direccion = COALESCE($6, direccion),
             fecha_nacimiento = COALESCE($7, fecha_nacimiento)
         WHERE id_persona = $8
         RETURNING primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, telefono, direccion,
                   TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento`,
        [pNom, sNom, pApe, sApe, telefono || null, direccion || null, fecha_nacimiento || null, targetPersonaId]
      );

      // Auditoría de los datos personales que cambiaron, con su valor anterior
      const personaNueva = personaNuevaRes.rows[0] || {};
      const cambios = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido', 'telefono', 'direccion', 'fecha_nacimiento']
        .filter((campo) => (personaActual[campo] || '') !== (personaNueva[campo] || ''))
        .map((campo) => `${campo}: «${personaActual[campo] || ''}» → «${personaNueva[campo] || ''}»`);
      if (cambios.length > 0) {
        await client.query(
          `INSERT INTO historial_estados_usuario
            (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
           VALUES ($1, $2, $2, $3, $3, $4, $5, $6, $7)`,
          [
            targetUserId,
            currentUser.estado,
            currentUser.id_rol,
            req.user?.id_usuario || null,
            `Datos personales actualizados. ${cambios.join('; ')}`,
            getClientIp(req),
            getUserAgent(req),
          ]
        );
      }
    }

    // 7. Actualizar datos en tabla usuarios
    await client.query(
      `UPDATE usuarios
       SET codigo_corporativo = $1,
           email = $2,
           password_hash = $3,
           id_rol = $4,
           estado = $5
       WHERE id_usuario = $6`,
      [updatedCodigoCorp, updatedEmail, password_hash, rolId, estadoUpper, targetUserId]
    );

    // 7.1 Cambio de correo: queda en la auditoría con el valor anterior y, después del COMMIT, se avisa al correo
    //     anterior. El reinicio de contraseña espera un tiempo tras el cambio (ver resetPasswordUsuario).
    const cambiaCorreo = String(currentUser.email || '').toLowerCase() !== String(updatedEmail || '').toLowerCase();
    if (cambiaCorreo) {
      await client.query(
        `INSERT INTO historial_estados_usuario
          (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
         VALUES ($1, $2, $2, $3, $3, $4, $5, $6, $7)`,
        [
          targetUserId,
          currentUser.estado,
          currentUser.id_rol,
          req.user?.id_usuario || null,
          `${MOTIVO_CAMBIO_CORREO}: «${currentUser.email}» → «${updatedEmail}»`,
          getClientIp(req),
          getUserAgent(req),
        ]
      );
    }

    // 8. Registrar en historial de auditoría si cambió rol o estado
    const cambiaAcceso = currentUser.estado !== estadoUpper || currentUser.id_rol !== rolId;
    if (cambiaAcceso) {
      const clientIp = getClientIp(req);
      const userAgent = getUserAgent(req);
      // Con otro rol u otro estado, la sesión abierta ya no vale: tiene que volver a entrar
      await client.query('UPDATE usuarios SET sesion_activa_id = NULL, ultimo_ping = NULL WHERE id_usuario = $1', [targetUserId]);
      await client.query(
        `INSERT INTO historial_estados_usuario 
          (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, 'Modificación de estado/rol de usuario', $7, $8)`,
        [
          targetUserId,
          currentUser.estado,
          estadoUpper,
          currentUser.id_rol,
          rolId,
          req.user?.id_usuario || null,
          clientIp,
          userAgent,
        ]
      );
    }

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');
    if (cambiaAcceso) {
      socketService.disconnectUser(targetUserId);
      socketService.broadcastPresence(targetUserId, false);
    }
    // El aviso es lo que permite reclamar a tiempo: si no sale, se le dice al administrador
    let avisoEnviado = null;
    if (cambiaCorreo && currentUser.email) {
      avisoEnviado = false;
      try {
        const aviso = await mailerService.sendUserEmailChangedNotice({
          to: currentUser.email,
          nombre: personaActual.primer_nombre,
          codigoCorporativo: updatedCodigoCorp,
          correoNuevo: updatedEmail,
          horasEspera: SEGURIDAD.HORAS_ESPERA_REINICIO_TRAS_CAMBIO_CORREO,
        });
        avisoEnviado = mailerService.wasSent(aviso);
      } catch (avisoError) {
        console.warn('[WARN] No se pudo avisar al correo anterior del usuario:', avisoError.message);
      }
      if (!avisoEnviado) console.warn(`[WARN] El aviso de cambio de correo del usuario ${updatedCodigoCorp} no se envió.`);
    }

    // 9. Consultar datos consolidados
    const updatedUserRes = await db.query(
      `SELECT 
        u.id_usuario,
        u.id_usuario AS id,
        u.id_persona,
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        u.email, 
        r.id_rol,
        r.codigo AS rol, 
        r.nombre AS rol_nombre,
        u.estado, 
        u.ultimo_acceso,
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1`,
      [targetUserId]
    );

    return res.status(200).json({
      success: true,
      message: avisoEnviado === false
        ? 'Cambios guardados, pero no se pudo avisar del cambio al correo anterior. Avísele a la persona por otro medio.'
        : 'Cambios guardados.',
      data: updatedUserRes.rows[0],
      // null si no cambió el correo
      aviso_enviado: avisoEnviado,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Índice uq_usuarios_persona_tipo: la persona ya tiene otro usuario de ese tipo (personal o asociado).
    if (error.code === '23505' && error.constraint === 'uq_usuarios_persona_tipo') {
      return res.status(409).json({
        success: false,
        message: 'Esta persona ya tiene otro usuario de ese tipo. Una persona puede tener un usuario del personal y uno de asociado.',
      });
    }
    console.error('Error en userController.updateUser:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron guardar los cambios. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};

/**
 * Realiza el borrado lógico auditado de un usuario del sistema.
 * Actualiza el estado del registro a 'INACTIVO' e inserta una traza inmutable
 * en la tabla `historial_estados_usuario`. No elimina datos físicos.
 *
 * @async
 * @function deleteUser
 * @param {import('express').Request} req - Objeto de solicitud HTTP de Express.
 * @param {string} req.params.id - Identificador (id_usuario o codigo_corporativo) del usuario.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 con el usuario desactivado, 404 si no existe, o 500 en error interno.
 */
const deleteUser = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const filtro = filtroUsuario(id, '');

    // Verificar existencia del usuario
    const checkUser = await client.query(
      `SELECT id_usuario, id_persona, estado, id_rol FROM usuarios WHERE ${filtro.condicion}`,
      [filtro.valor]
    );
    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const current = checkUser.rows[0];
    const targetUserId = current.id_usuario;
    const targetPersonaId = current.id_persona;

    // INICIAR TRANSACCIÓN SQL
    await client.query('BEGIN');

    // 1. Actualizar estado a 'INACTIVO' (Borrado Lógico)
    await client.query('UPDATE usuarios SET estado = $1 WHERE id_usuario = $2', ['INACTIVO', targetUserId]);

    // 1b. Si es el usuario de asociado, la membresía también se da de baja. El usuario del personal de
    //     la misma persona no toca su afiliación (issue #32).
    if (current.id_rol === ID_ROL_ASOCIADO) {
      await client.query("UPDATE asociados SET estado_asociado = 'INACTIVO' WHERE id_persona = $1", [targetPersonaId]);
    }

    // 2. Registrar en historial_estados_usuario con id_modificado_por
    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);
    await client.query(
      `INSERT INTO historial_estados_usuario 
        (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
       VALUES ($1, $2, 'INACTIVO', $3, $3, $4, 'Borrado lógico de usuario', $5, $6)`,
      [targetUserId, current.estado, current.id_rol, req.user?.id_usuario || null, clientIp, userAgent]
    );

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');
    // Sus conexiones en tiempo real se cierran junto con el usuario
    socketService.disconnectUser(targetUserId);

    const result = await db.query(
      `SELECT 
        u.id_usuario,
        u.id_usuario AS id,
        u.id_persona,
        u.codigo_corporativo,
        p.cui_dpi,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre_completo,
        TRIM(CONCAT(p.primer_nombre, ' ', COALESCE(p.segundo_nombre, ''), ' ', p.primer_apellido, ' ', COALESCE(p.segundo_apellido, ''))) AS nombre,
        u.email, 
        r.codigo AS rol, 
        u.estado, 
        u.fecha_creacion
      FROM usuarios u
      JOIN personas p ON u.id_persona = p.id_persona
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = $1`,
      [targetUserId]
    );

    return res.status(200).json({
      success: true,
      message: 'Usuario desactivado.',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en userController.deleteUser:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo desactivar el usuario. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};

/**
 * Desbloqueo administrativo de cuenta tras intentos fallidos (1 clic)
 * PATCH /api/usuarios/:id/desbloquear
 * Solo accesible por rol ADMINISTRADOR
 */
const desbloquearUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const filtro = filtroUsuario(id, '');
    const adminId = req.user.id_usuario;

    // Verificar que el usuario exista
    const userCheck = await db.query(
      `SELECT id_usuario, estado, id_rol, codigo_corporativo FROM usuarios WHERE ${filtro.condicion}`,
      [filtro.valor]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const targetUser = userCheck.rows[0];

    // Desbloquear al usuario: intentos_fallidos = 0 y bloqueado_hasta = NULL
    await db.query(
      `UPDATE usuarios 
       SET intentos_fallidos = 0, bloqueado_hasta = NULL 
       WHERE id_usuario = $1`,
      [targetUser.id_usuario]
    );

    // Registrar en historial_estados_usuario para auditoría
    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);
    await db.query(
      `INSERT INTO historial_estados_usuario 
       (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
       VALUES ($1, 'BLOQUEADO_TEMPORAL', $2, $3, $3, $4, 'Desbloqueo administrativo inmediato de cuenta por Administrador', $5, $6)`,
      [targetUser.id_usuario, targetUser.estado, targetUser.id_rol, adminId, clientIp, userAgent]
    );

    return res.status(200).json({
      success: true,
      message: `Se desbloqueó a ${targetUser.codigo_corporativo}.`,
    });
  } catch (error) {
    console.error('Error en userController.desbloquearUsuario:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo desbloquear al usuario. Intente de nuevo.',
    });
  }
};

/**
 * Obtiene los últimos eventos de seguridad y cambios de estado registrados en auditoría.
 *
 * @async
 * @function getRecentSecurityEvents
 * @param {import('express').Request} req - Solicitud HTTP de Express con query opcional `limit`.
 * @param {import('express').Response} res - Respuesta HTTP con el arreglo de eventos.
 * @returns {Promise<import('express').Response>} Retorna 200 con el listado de eventos o 500 si falla.
 */
const getRecentSecurityEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const queryText = `
      SELECT 
        h.id_historial_estado,
        h.estado_anterior,
        h.estado_nuevo,
        h.motivo,
        h.ip_origen,
        h.user_agent,
        h.fecha_cambio,
        u_mod.id_usuario AS id_usuario_modificado,
        u_mod.codigo_corporativo AS usuario_codigo,
        u_mod.email AS usuario_email,
        TRIM(CONCAT(p_mod.primer_nombre, ' ', p_mod.primer_apellido)) AS usuario_nombre,
        u_actor.codigo_corporativo AS actor_codigo,
        COALESCE(TRIM(CONCAT(p_actor.primer_nombre, ' ', p_actor.primer_apellido)), 'Sistema / Automático') AS actor_nombre
      FROM historial_estados_usuario h
      JOIN usuarios u_mod ON h.id_usuario_modificado = u_mod.id_usuario
      JOIN personas p_mod ON u_mod.id_persona = p_mod.id_persona
      LEFT JOIN usuarios u_actor ON h.id_modificado_por = u_actor.id_usuario
      LEFT JOIN personas p_actor ON u_actor.id_persona = p_actor.id_persona
      ORDER BY h.id_historial_estado DESC
      LIMIT $1
    `;

    const result = await db.query(queryText, [limit]);

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en userController.getRecentSecurityEvents:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron cargar los eventos de seguridad.',
    });
  }
};

/**
 * Concatena y sanitiza de manera uniforme los componentes del nombre de una persona.
 *
 * @function TRIM_NAME
 * @param {string|null} pNom - Primer nombre.
 * @param {string|null} sNom - Segundo nombre.
 * @param {string|null} pApe - Primer apellido.
 * @param {string|null} sApe - Segundo apellido.
 * @returns {string} Nombre completo consolidado sin espacios sobrantes.
 */
const TRIM_NAME = (pNom, sNom, pApe, sApe) => {
  return [pNom, sNom, pApe, sApe].filter(Boolean).join(' ').trim();
};

/**
 * Obtener todos los roles y el catálogo completo de permisos del sistema
 * GET /api/usuarios/roles/permisos
 */
const getRolesAndPermissions = async (req, res) => {
  try {
    const rolesRes = await db.query(
      `SELECT id_rol, codigo, nombre, descripcion, estado FROM roles ORDER BY id_rol ASC`
    );
    const permisosRes = await db.query(
      `SELECT id_permiso, codigo, modulo, descripcion FROM permisos ORDER BY modulo, codigo ASC`
    );
    const asignacionesRes = await db.query(
      `SELECT id_rol, id_permiso FROM roles_permisos`
    );

    const rolesConPermisos = rolesRes.rows.map((r) => ({
      ...r,
      permisos: asignacionesRes.rows
        .filter((a) => a.id_rol === r.id_rol)
        .map((a) => a.id_permiso),
    }));

    return res.status(200).json({
      success: true,
      roles: rolesConPermisos,
      permisos: permisosRes.rows,
    });
  } catch (error) {
    console.error('Error en getRolesAndPermissions:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron cargar los roles.',
    });
  }
};

/**
 * Asignar permisos a un rol específico (ADMINISTRADOR con permiso)
 * POST /api/usuarios/roles/:idRol/permisos
 */
const assignPermissionsToRole = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { idRol } = req.params;
    const { permisosIds } = req.body;

    if (!Array.isArray(permisosIds)) {
      return res.status(400).json({
        success: false,
        message: 'permisosIds debe ser un arreglo de identificadores numéricos de permisos.',
      });
    }

    await client.query('BEGIN');

    // Limpiar permisos actuales del rol
    await client.query('DELETE FROM roles_permisos WHERE id_rol = $1', [idRol]);

    // Asignar los nuevos permisos
    for (const pId of permisosIds) {
      await client.query(
        'INSERT INTO roles_permisos (id_rol, id_permiso) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [idRol, pId]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Permisos guardados.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en assignPermissionsToRole:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudieron guardar los permisos. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};



/**
 * Cambia el estado de un usuario (ACTIVO / INACTIVO) registrando obligatoriamente
 * el motivo en historial_estados_usuario.
 */
const cambiarEstadoUsuario = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const filtro = filtroUsuario(id, '');
    const { estado, motivo } = req.body;

    if (!estado || !['ACTIVO', 'INACTIVO'].includes(estado.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Debe ser ACTIVO o INACTIVO.',
      });
    }

    const nuevoEstado = estado.toUpperCase();

    // Si se pasa a INACTIVO, el motivo es obligatorio
    if (nuevoEstado === 'INACTIVO' && (!motivo || motivo.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Escriba el motivo para desactivar al usuario.',
      });
    }

    const checkUser = await client.query(
      `SELECT id_usuario, id_persona, estado, id_rol, codigo_corporativo FROM usuarios WHERE ${filtro.condicion}`,
      [filtro.valor]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const current = checkUser.rows[0];
    const targetUserId = current.id_usuario;
    const targetPersonaId = current.id_persona;

    await client.query('BEGIN');

    if (nuevoEstado === 'INACTIVO') {
      await client.query(
        'UPDATE usuarios SET estado = $1, sesion_activa_id = NULL, ultimo_ping = NULL WHERE id_usuario = $2',
        [nuevoEstado, targetUserId]
      );
    } else {
      await client.query(
        'UPDATE usuarios SET estado = $1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $2',
        [nuevoEstado, targetUserId]
      );
    }
    // La membresía sigue al usuario de asociado; el del personal de la misma persona no la toca (issue #32).
    if (current.id_rol === ID_ROL_ASOCIADO) {
      await client.query(
        'UPDATE asociados SET estado_asociado = $1 WHERE id_persona = $2',
        [nuevoEstado, targetPersonaId]
      );
    }

    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);

    await client.query(
      `INSERT INTO historial_estados_usuario 
        (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
      [
        targetUserId,
        current.estado,
        nuevoEstado,
        current.id_rol,
        req.user?.id_usuario || null,
        motivo ? motivo.trim() : `Cambio de estado administrativo a ${nuevoEstado}`,
        clientIp,
        userAgent,
      ]
    );

    await client.query('COMMIT');
    if (nuevoEstado === 'INACTIVO') {
      // Sus conexiones en tiempo real se cierran junto con la sesión
      socketService.disconnectUser(targetUserId);
      socketService.broadcastPresence(targetUserId, false);
    }

    return res.status(200).json({
      success: true,
      message: `Estado actualizado.`,
      data: {
        id_usuario: targetUserId,
        estado: nuevoEstado,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en cambiarEstadoUsuario:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo cambiar el estado. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};

/**
 * Reinicia la contraseña de un usuario generando una clave temporal o asignando la proporcionada.
 * Resetea bloqueos, intentos fallidos y cierra sesiones previas.
 */
const resetPasswordUsuario = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const filtro = filtroUsuario(id);
    const { password, motivo } = req.body;

    const checkUser = await client.query(
      `SELECT u.id_usuario, u.id_persona, u.codigo_corporativo, u.email, u.estado, u.id_rol, r.nombre AS rol_nombre, p.primer_nombre, p.primer_apellido
       FROM usuarios u
       JOIN personas p ON u.id_persona = p.id_persona
       LEFT JOIN roles r ON u.id_rol = r.id_rol
       WHERE ${filtro.condicion}`,
      [filtro.valor]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const current = checkUser.rows[0];
    const targetUserId = current.id_usuario;

    // La temporal solo viaja por correo: sin correo funcionando, el usuario perdería su contraseña
    // actual sin recibir otra. En ese caso no se cambia nada.
    if (!mailerService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'CORREO_NO_DISPONIBLE',
        message: 'No se puede reiniciar la contraseña porque el correo de la cooperativa no está funcionando. Configúrelo en «Correo de notificaciones» y vuelva a intentarlo. La contraseña actual no se cambió.',
      });
    }

    // Si el correo cambió hace poco, la temporal no se envía todavía: el correo anterior recibió un aviso y la
    // persona tiene tiempo de reclamar si no lo pidió
    const horasEspera = SEGURIDAD.HORAS_ESPERA_REINICIO_TRAS_CAMBIO_CORREO;
    // El registro se reconoce por su forma completa («Correo cambiado: «anterior» → «actual»»), no solo por el
    // inicio: el motivo de otros cambios lo escribe el administrador y podría empezar igual
    const cambioReciente = await client.query(
      `SELECT 1 FROM historial_estados_usuario
       WHERE id_usuario_modificado = $1
         AND starts_with(motivo, $2) AND right(motivo, char_length($3)) = $3
         AND fecha_cambio > CURRENT_TIMESTAMP - make_interval(hours => $4)
       LIMIT 1`,
      [targetUserId, `${MOTIVO_CAMBIO_CORREO}: «`, `» → «${current.email}»`, horasEspera]
    );
    if (cambioReciente.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'CORREO_CAMBIADO_RECIENTEMENTE',
        message: `El correo de este usuario cambió hace menos de ${horasEspera} horas. Por seguridad, su contraseña se puede reiniciar cuando pase ese tiempo.`,
      });
    }

    // Generar contraseña temporal segura criptográficamente
    const plainPassword = generateSecureRandomPassword(12);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await client.query('BEGIN');

    // Actualizar usuario forzando cambio de contraseña en su próximo inicio de sesión
    await client.query(
      `UPDATE usuarios 
       SET password_hash = $1, 
           debe_cambiar_password = TRUE,
           intentos_fallidos = 0, 
           bloqueado_hasta = NULL, 
           sesion_activa_id = NULL 
       WHERE id_usuario = $2`,
      [passwordHash, targetUserId]
    );

    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);

    await client.query(
      `INSERT INTO historial_estados_usuario 
        (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
       VALUES ($1, $2, $2, $3, $3, $4, $5, $6, $7)`,
      [
        targetUserId,
        current.estado,
        current.id_rol,
        req.user?.id_usuario || null,
        motivo ? motivo.trim() : `Reinicio de contraseña administrativa por ${req.user?.codigo_corporativo || 'Administrador'}`,
        clientIp,
        userAgent,
      ]
    );

    // Despacho confidencial por correo electrónico institucional. Si no sale, se deshace el reinicio.
    let emailStatus = { sent: false, simulado: true, provider: 'demo' };
    try {
      const mailRes = await mailerService.sendPasswordResetEmail({
        to: current.email,
        nombre: `${current.primer_nombre} ${current.primer_apellido}`,
        codigoCorporativo: current.codigo_corporativo,
        password: plainPassword,
        rolNombre: current.rol_nombre || 'USUARIO',
      });
      emailStatus = {
        sent: mailerService.wasSent(mailRes),
        simulado: !!mailRes.simulado,
        provider: mailRes.provider || 'demo',
      };
    } catch (mailErr) {
      console.warn('Aviso: No se pudo enviar el correo de reinicio:', mailErr.message);
    }

    if (!emailStatus.sent) {
      await client.query('ROLLBACK');
      return res.status(502).json({
        success: false,
        error: 'CORREO_NO_ENVIADO',
        message: `No se pudo enviar el correo a ${current.email}. La contraseña actual no se cambió; intente de nuevo en unos minutos.`,
      });
    }

    await client.query('COMMIT');
    // La sesión anterior quedó cerrada: sus conexiones en tiempo real también se cierran
    socketService.disconnectUser(targetUserId);

    // Por protocolos de seguridad bancaria, la contraseña temporal NO se devuelve en la respuesta al Administrador
    return res.status(200).json({
      success: true,
      message: `Contraseña reiniciada. Enviamos una temporal a ${current.email}.`,
      data: {
        id_usuario: targetUserId,
        codigo_corporativo: current.codigo_corporativo,
        email: current.email,
        email_status: emailStatus,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en resetPasswordUsuario:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo reiniciar la contraseña. Intente de nuevo.',
    });
  } finally {
    client.release();
  }
};

/**
 * Consulta el estado actual del servicio de correo institucional (Google / SMTP / Demo)
 */
const getEmailServiceStatus = async (req, res) => {
  try {
    const status = mailerService.getStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error en getEmailServiceStatus:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo consultar el estado del correo.',
    });
  }
};

/**
 * Configura y valida en tiempo real las credenciales de Google Mail (Gmail SMTP)
 */
const updateEmailServiceConfig = async (req, res) => {
  try {
    const { gmail_user, gmail_app_password, email_from } = req.body;

    if (!gmail_user || !gmail_app_password) {
      return res.status(400).json({
        success: false,
        message: 'Escriba la cuenta de Gmail y la contraseña de aplicación de 16 caracteres.',
      });
    }

    const result = await mailerService.configureGoogleService({
      user: gmail_user.trim(),
      appPassword: gmail_app_password.trim(),
      from: email_from ? email_from.trim() : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || 'No se pudo conectar con el servicio de Google Mail.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Gmail quedó conectado y verificado.',
      data: result.status,
    });
  } catch (error) {
    console.error('Error en updateEmailServiceConfig:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo configurar el servicio de Google Mail. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

/**
 * Envía un correo de prueba institucional a través del servicio activo
 */
const sendTestEmail = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to || !to.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Escriba un correo válido.',
      });
    }

    const result = await mailerService.sendTestEmail({ to: to.trim() });
    return res.status(200).json({
      success: true,
      message: result.simulado
        ? 'Correo despachado en Modo Demostrativo (Servicio de Google no verificado aún).'
        : `Correo de prueba enviado exitosamente a ${to.trim()} a través del servicio de Google.`,
      // El detalle de un fallo del envío queda en la consola, no en la respuesta
      data: { simulado: result.simulado, messageId: result.messageId, provider: result.provider },
    });
  } catch (error) {
    console.error('Error en sendTestEmail:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo enviar el correo de prueba. Revise la cuenta de Google y la contraseña de aplicación.',
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  desbloquearUsuario,
  cambiarEstadoUsuario,
  resetPasswordUsuario,
  getRecentSecurityEvents,
  getRolesAndPermissions,
  assignPermissionsToRole,
  getNextCode,
  getEmailServiceStatus,
  updateEmailServiceConfig,
  sendTestEmail,
};
