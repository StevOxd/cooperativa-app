const bcrypt = require('bcryptjs');
const db = require('../config/db');
const socketService = require('../services/socketService');

const ROLES_PERMITIDOS = ['ADMINISTRADOR', 'OPERADOR', 'ASOCIADO'];
const ESTADOS_PERMITIDOS = ['ACTIVO', 'INACTIVO'];

/**
 * Obtener la lista detallada de usuarios con id_persona y Código Corporativo
 * GET /api/usuarios?estado=ACTIVO&search=1001
 */
const getUsers = async (req, res) => {
  try {
    const { estado, search } = req.query;
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

    // Filtro opcional por búsqueda de texto
    if (search && search.trim() !== '') {
      values.push(`%${search.trim()}%`);
      const paramIndex = values.length;
      conditions.push(`(
        u.codigo_corporativo ILIKE $${paramIndex} OR
        p.cui_dpi ILIKE $${paramIndex} OR
        p.primer_nombre ILIKE $${paramIndex} OR 
        p.primer_apellido ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const queryText = `
      SELECT 
        u.id_persona,
        u.id_persona AS id, 
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
      const socketActivo = socketService.isUserConnected(u.id_persona);
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
      message: 'Error al obtener la lista de usuarios.',
    });
  }
};

/**
 * Obtener un usuario por su id_persona o Código Corporativo
 * GET /api/usuarios/:id
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const queryText = `
      SELECT 
        u.id_persona,
        u.id_persona AS id, 
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
      WHERE u.id_persona::text = $1 OR u.codigo_corporativo = $1
      LIMIT 1
    `;
    const result = await db.query(queryText, [id]);

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
      message: 'Error al obtener el usuario.',
    });
  }
};

/**
 * Función auxiliar para generar un código corporativo de 4 dígitos disponible
 */
const generateNextCorporateCode = async (client, rolUpper) => {
  let basePrefix = 3000;
  if (rolUpper === 'ADMINISTRADOR') basePrefix = 1000;
  if (rolUpper === 'OPERADOR') basePrefix = 2000;

  const existingCodesRes = await client.query(
    `SELECT codigo_corporativo FROM usuarios 
     WHERE codigo_corporativo ~ '^[0-9]{4}$' 
     ORDER BY codigo_corporativo ASC`
  );

  const existingNums = new Set(
    existingCodesRes.rows.map((r) => parseInt(r.codigo_corporativo, 10)).filter((n) => !isNaN(n))
  );

  let candidate = basePrefix + 1;
  while (existingNums.has(candidate)) {
    candidate++;
  }
  return candidate.toString();
};

/**
 * Crear un nuevo usuario mediante Transacción SQL (personas + usuarios con id_persona + auditoría)
 * POST /api/usuarios
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
    } = req.body;

    // 1. Validar campos obligatorios
    if (!email || !password || !rol || (!nombre && !primer_nombre)) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios deben ser proporcionados: nombre/primer_nombre, email, password, rol.',
      });
    }

    // 2. Normalizar y validar rol
    const rolUpper = rol.toUpperCase();
    if (!ROLES_PERMITIDOS.includes(rolUpper)) {
      return res.status(400).json({
        success: false,
        message: `Rol no válido. Roles permitidos: ${ROLES_PERMITIDOS.join(', ')}`,
      });
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
      return res.status(400).json({ success: false, message: 'Rol especificado no existe.' });
    }
    const roleData = roleResult.rows[0];
    const rolId = roleData.id_rol;

    // 4. Determinar y validar código corporativo (4 dígitos)
    let finalCodigoCorp = codigo_corporativo ? codigo_corporativo.trim() : '';
    if (!finalCodigoCorp) {
      finalCodigoCorp = await generateNextCorporateCode(client, rolUpper);
    } else {
      if (!/^[0-9]{4}$/.test(finalCodigoCorp)) {
        return res.status(400).json({
          success: false,
          message: 'El código corporativo debe ser un número exacto de 4 dígitos (ej. 1006, 2006, 3006).',
        });
      }
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
    const cleanDpi = cui_dpi ? cui_dpi.trim() : null;
    const existsResult = await client.query(existsQuery, [email.trim(), finalCodigoCorp, cleanDpi]);

    if (existsResult.rows.length > 0) {
      const existing = existsResult.rows[0];
      let field = 'campo';
      if (existing.email.toLowerCase() === email.trim().toLowerCase()) field = 'correo electrónico';
      else if (existing.codigo_corporativo === finalCodigoCorp) field = 'código corporativo';
      else if (cleanDpi && existing.cui_dpi === cleanDpi) field = 'DPI / CUI';

      return res.status(409).json({
        success: false,
        message: `Ya existe un usuario registrado con ese ${field}.`,
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

    const cui = cleanDpi || `DPI-${Date.now()}`;

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
    const password_hash = await bcrypt.hash(password, 10);

    // 9. Insertar en tabla usuarios (id_persona como PK y FK)
    const usuarioInsert = `
      INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_persona, codigo_corporativo, email, estado, fecha_creacion
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
    const auditoriaInsert = `
      INSERT INTO historial_estados_usuario (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo)
      VALUES ($1, NULL, $2, NULL, $3, $4, 'Creación de usuario con id_persona')
    `;
    await client.query(auditoriaInsert, [
      createdUser.id_persona,
      estadoUpper,
      rolId,
      req.user?.id_persona || req.user?.id || null,
    ]);

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');

    const fullName = TRIM_NAME(pNombre, sNombre, pApellido, sApellido);

    return res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente con id_persona.',
      data: {
        id: createdUser.id_persona,
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
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en userController.createUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al crear el usuario.',
    });
  } finally {
    client.release();
  }
};

/**
 * Actualizar datos de un usuario (Actualiza personas + usuarios por id_persona y registra auditoría)
 * PUT /api/usuarios/:id
 */
const updateUser = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
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
       WHERE u.id_persona::text = $1 OR u.codigo_corporativo = $1`,
      [id]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const currentUser = checkUser.rows[0];
    const targetUserPersonaId = currentUser.id_persona;

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
    const updatedCodigoCorp = codigo_corporativo ? codigo_corporativo.trim() : currentUser.codigo_corporativo;

    if (codigo_corporativo && !/^[0-9]{4}$/.test(updatedCodigoCorp)) {
      return res.status(400).json({
        success: false,
        message: 'El código corporativo debe ser un número exacto de 4 dígitos (ej. 1006).',
      });
    }

    // 4. Verificar colisión de duplicados
    const duplicateQuery = `
      SELECT id_persona, email, codigo_corporativo
      FROM usuarios 
      WHERE (LOWER(email) = LOWER($1) OR codigo_corporativo = $2) AND id_persona != $3
      LIMIT 1
    `;
    const duplicateResult = await client.query(duplicateQuery, [
      updatedEmail,
      updatedCodigoCorp,
      targetUserPersonaId,
    ]);

    if (duplicateResult.rows.length > 0) {
      const existing = duplicateResult.rows[0];
      let field = 'campo';
      if (existing.email.toLowerCase() === updatedEmail.toLowerCase()) field = 'correo electrónico';
      else if (existing.codigo_corporativo === updatedCodigoCorp) field = 'código corporativo';

      return res.status(409).json({
        success: false,
        message: `El ${field} ya está en uso por otro usuario.`,
      });
    }

    // 5. Manejo de contraseña (actualizar solo si se envía una nueva)
    let password_hash = currentUser.password_hash;
    if (password && password.trim() !== '') {
      password_hash = await bcrypt.hash(password, 10);
    }

    // INICIAR TRANSACCIÓN SQL
    await client.query('BEGIN');

    // 6. Actualizar datos en tabla personas
    if (nombre || primer_nombre || cui_dpi || telefono || direccion) {
      let pNom = primer_nombre;
      let sNom = segundo_nombre || null;
      let pApe = primer_apellido;
      let sApe = segundo_apellido || null;

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

      await client.query(
        `UPDATE personas 
         SET primer_nombre = COALESCE($1, primer_nombre),
             segundo_nombre = $2,
             primer_apellido = COALESCE($3, primer_apellido),
             segundo_apellido = $4,
             cui_dpi = COALESCE($5, cui_dpi),
             telefono = COALESCE($6, telefono),
             direccion = COALESCE($7, direccion)
         WHERE id_persona = $8`,
        [pNom, sNom, pApe, sApe, cui_dpi || null, telefono || null, direccion || null, targetUserPersonaId]
      );
    }

    // 7. Actualizar datos en tabla usuarios
    await client.query(
      `UPDATE usuarios
       SET codigo_corporativo = $1,
           email = $2,
           password_hash = $3,
           id_rol = $4,
           estado = $5
       WHERE id_persona = $6`,
      [updatedCodigoCorp, updatedEmail, password_hash, rolId, estadoUpper, targetUserPersonaId]
    );

    // 8. Registrar en historial de auditoría si cambió rol o estado
    if (currentUser.estado !== estadoUpper || currentUser.id_rol !== rolId) {
      await client.query(
        `INSERT INTO historial_estados_usuario 
          (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo)
         VALUES ($1, $2, $3, $4, $5, $6, 'Modificación de estado/rol de usuario')`,
        [
          targetUserPersonaId,
          currentUser.estado,
          estadoUpper,
          currentUser.id_rol,
          rolId,
          req.user?.id_persona || req.user?.id || null,
        ]
      );
    }

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');

    // 9. Consultar datos consolidados
    const updatedUserRes = await db.query(
      `SELECT 
        u.id_persona,
        u.id_persona AS id, 
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
      WHERE u.id_persona = $1`,
      [targetUserPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Usuario actualizado exitosamente.',
      data: updatedUserRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en userController.updateUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar el usuario.',
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
 * @param {string} req.params.id - Identificador (id_persona o codigo_corporativo) del usuario.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<import('express').Response>} Retorna 200 con el usuario desactivado, 404 si no existe, o 500 en error interno.
 */
const deleteUser = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    // Verificar existencia del usuario
    const checkUser = await client.query(
      'SELECT id_persona, estado, id_rol FROM usuarios WHERE id_persona::text = $1 OR codigo_corporativo = $1',
      [id]
    );
    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const current = checkUser.rows[0];
    const targetUserPersonaId = current.id_persona;

    // INICIAR TRANSACCIÓN SQL
    await client.query('BEGIN');

    // 1. Actualizar estado a 'INACTIVO'
    await client.query('UPDATE usuarios SET estado = $1 WHERE id_persona = $2', ['INACTIVO', targetUserPersonaId]);

    // 1b. Sincronizar ciclo de vida financiero en asociados (prevenir membresías activas para usuarios dados de baja)
    await client.query("UPDATE asociados SET estado_asociado = 'INACTIVO' WHERE id_persona = $1", [targetUserPersonaId]);

    // 2. Registrar en historial_estados_usuario con id_modificado_por
    await client.query(
      `INSERT INTO historial_estados_usuario 
        (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo)
       VALUES ($1, $2, 'INACTIVO', $3, $3, $4, 'Borrado lógico de usuario')`,
      [targetUserPersonaId, current.estado, current.id_rol, req.user?.id_persona || req.user?.id || null]
    );

    // CONFIRMAR TRANSACCIÓN
    await client.query('COMMIT');

    const result = await db.query(
      `SELECT 
        u.id_persona,
        u.id_persona AS id, 
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
      WHERE u.id_persona = $1`,
      [targetUserPersonaId]
    );

    return res.status(200).json({
      success: true,
      message: 'Usuario desactivado exitosamente (borrado lógico auditado).',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en userController.deleteUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al desactivar el usuario.',
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
    const adminId = req.user.id_persona || req.user.id;

    // Verificar que el usuario exista
    const userCheck = await db.query(
      'SELECT id_persona, estado, id_rol, codigo_corporativo FROM usuarios WHERE id_persona = $1',
      [id]
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
       WHERE id_persona = $1`,
      [id]
    );

    // Registrar en historial_estados_usuario para auditoría
    await db.query(
      `INSERT INTO historial_estados_usuario 
       (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo)
       VALUES ($1, 'BLOQUEADO_TEMPORAL', $2, $3, $3, $4, 'Desbloqueo administrativo inmediato de cuenta por Administrador')`,
      [targetUser.id_persona, targetUser.estado, targetUser.id_rol, adminId]
    );

    return res.status(200).json({
      success: true,
      message: `Usuario ${targetUser.codigo_corporativo} desbloqueado exitosamente.`,
    });
  } catch (error) {
    console.error('Error en userController.desbloquearUsuario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al desbloquear el usuario.',
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
        h.fecha_cambio,
        u_mod.id_persona AS id_usuario_modificado,
        u_mod.codigo_corporativo AS usuario_codigo,
        u_mod.email AS usuario_email,
        TRIM(CONCAT(p_mod.primer_nombre, ' ', p_mod.primer_apellido)) AS usuario_nombre,
        u_actor.codigo_corporativo AS actor_codigo,
        COALESCE(TRIM(CONCAT(p_actor.primer_nombre, ' ', p_actor.primer_apellido)), 'Sistema / Automático') AS actor_nombre
      FROM historial_estados_usuario h
      JOIN usuarios u_mod ON h.id_usuario_modificado = u_mod.id_persona
      JOIN personas p_mod ON u_mod.id_persona = p_mod.id_persona
      LEFT JOIN usuarios u_actor ON h.id_modificado_por = u_actor.id_persona
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
      message: 'Error al obtener los eventos recientes de auditoría.',
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

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  desbloquearUsuario,
  getRecentSecurityEvents,
};
