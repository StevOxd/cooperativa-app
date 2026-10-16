const { pool } = require('../config/db');
const mailerService = require('../services/mailerService');
const { verificarDominioCorreo } = require('../utils/correoDominio');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Afiliación del personal desde su propia sesión (issue #32).
 *
 * Quien trabaja en la cooperativa (administrador, operador o ejecutivo) pide su afiliación con los datos que
 * la cooperativa ya tiene. Solo elige el correo de su futuro usuario de asociado (distinto al del personal)
 * y puede actualizar su teléfono. Se registra una solicitud en agencia que formaliza un colega: nadie
 * atiende su propio trámite.
 */

/**
 * Datos de una persona y situación de su afiliación.
 *
 * @async
 * @param {import('pg').Pool|import('pg').PoolClient} db - Pool o cliente de una transacción.
 * @param {number} idPersona
 * @param {boolean} [bloquear=false] - Bloquea la fila de la persona hasta el fin de la transacción, para
 *   que dos solicitudes simultáneas no se registren las dos.
 * @returns {Promise<object|null>}
 */
const situacionDePersona = async (db, idPersona, bloquear = false) => {
  const resultado = await db.query(
    `SELECT p.cui_dpi, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.nombre_completo,
            p.telefono, p.direccion, TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            EXISTS (SELECT 1 FROM asociados a WHERE a.id_persona = p.id_persona) AS es_asociado,
            (SELECT s.numero_caso FROM solicitudes_afiliacion_agencia s
             WHERE s.cui_dpi = p.cui_dpi AND s.estado = 'PENDIENTE_AGENCIA'
             ORDER BY s.id_solicitud DESC LIMIT 1) AS solicitud_pendiente
     FROM personas p
     WHERE p.id_persona = $1
     ${bloquear ? 'FOR UPDATE' : ''}`,
    [idPersona]
  );
  return resultado.rows[0] || null;
};

/**
 * Por qué la persona no puede pedir su afiliación ahora, o null si puede.
 *
 * @param {object} situacion - Resultado de `situacionDePersona`.
 * @returns {{status: number, body: object}|null}
 */
const impedimento = (situacion) => {
  if (situacion.es_asociado) {
    return { status: 409, body: { success: false, message: 'Usted ya es asociado de la cooperativa.' } };
  }
  if (situacion.solicitud_pendiente) {
    return {
      status: 409,
      body: {
        success: false,
        numero_caso: situacion.solicitud_pendiente,
        message: `Ya tiene una solicitud en trámite (caso ${situacion.solicitud_pendiente}). Pídale a un colega que la formalice.`,
      },
    };
  }
  return null;
};

/**
 * Muestra al personal sus datos para afiliarse y si ya es asociado o tiene una solicitud en trámite.
 *
 * @async
 * @route GET /api/afiliacion/personal
 * @param {import('express').Request} req - Con `req.user.id_persona` (sesión del personal).
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con los datos, 404 si la persona no existe o 500.
 */
const obtenerMiAfiliacion = async (req, res) => {
  try {
    const situacion = await situacionDePersona(pool, req.user.id_persona);
    if (!situacion) return res.status(404).json({ success: false, message: 'No encontramos sus datos.' });
    return res.status(200).json({ success: true, data: situacion });
  } catch (error) {
    console.error('[ERROR] afiliacionPersonalController.obtenerMiAfiliacion:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar sus datos. Intente de nuevo.' });
  }
};

/**
 * Registra la solicitud de afiliación del personal de la sesión. Actualiza su teléfono si lo cambió y
 * envía el número de caso al correo elegido (después del COMMIT).
 *
 * @async
 * @route POST /api/afiliacion/personal/solicitud
 * @param {import('express').Request} req - `req.body`: `{ email: string, telefono?: string }`.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 201 con el número de caso; 400 por datos inválidos; 409 si
 *   ya es asociado, ya tiene una solicitud en trámite o el correo está en uso; 500.
 */
const solicitarMiAfiliacion = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const telefonoRaw = typeof req.body.telefono === 'string' ? req.body.telefono.trim() : '';

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'CORREO_INVALIDO', message: 'Revise el correo. Debe verse así: nombre@correo.com.' });
    }
    const telefono = telefonoRaw.replace(/\D/g, '');
    if (telefonoRaw && telefono.length !== 8) {
      return res.status(400).json({ success: false, message: 'El teléfono debe tener 8 dígitos.' });
    }

    const situacionPrevia = await situacionDePersona(pool, req.user.id_persona);
    if (!situacionPrevia) return res.status(404).json({ success: false, message: 'No encontramos sus datos.' });
    const previo = impedimento(situacionPrevia);
    if (previo) return res.status(previo.status).json(previo.body);

    // El correo del usuario de asociado no puede ser de ningún usuario (tampoco el suyo del personal) ni de
    // otra solicitud en trámite.
    const enUso = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = $1', [email]);
    if (enUso.rows.length > 0) {
      const esSuyo = Number(enUso.rows[0].id_usuario) === Number(req.user.id_usuario);
      return res.status(409).json({
        success: false,
        error: esSuyo ? 'CORREO_DEL_PERSONAL' : 'CORREO_EN_USO',
        message: esSuyo
          ? 'Ese es el correo de su usuario del personal. Su usuario de asociado lleva un correo distinto.'
          : 'Ese correo ya lo usa otra persona. Escriba otro.',
      });
    }
    const enSolicitud = await pool.query(
      "SELECT 1 FROM solicitudes_afiliacion_agencia WHERE LOWER(email) = $1 AND estado = 'PENDIENTE_AGENCIA'",
      [email]
    );
    if (enSolicitud.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'CORREO_EN_USO', message: 'Ese correo ya lo usa otra persona. Escriba otro.' });
    }
    const dominio = await verificarDominioCorreo(email);
    if (!dominio.valido) {
      return res.status(400).json({ success: false, error: 'CORREO_DOMINIO_INVALIDO', message: dominio.message });
    }

    const client = await pool.connect();
    let solicitud;
    let situacion;
    try {
      await client.query('BEGIN');
      // Se vuelve a comprobar con la persona bloqueada: dos envíos al mismo tiempo no registran dos solicitudes
      situacion = await situacionDePersona(client, req.user.id_persona, true);
      const actual = impedimento(situacion);
      if (actual) {
        await client.query('ROLLBACK');
        return res.status(actual.status).json(actual.body);
      }
      if (telefono && telefono !== situacion.telefono) {
        await client.query('UPDATE personas SET telefono = $1 WHERE id_persona = $2', [telefono, req.user.id_persona]);
      }
      // El número de caso CASO-AFIL-YYYY-XXXX lo pone el trigger trg_set_numero_caso_afiliacion
      solicitud = (await client.query(
        `INSERT INTO solicitudes_afiliacion_agencia (
           numero_caso, cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
           telefono, direccion, fecha_nacimiento, email, estado, observaciones
         ) VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDIENTE_AGENCIA', $10)
         RETURNING id_solicitud, numero_caso, fecha_solicitud`,
        [
          situacion.cui_dpi,
          situacion.primer_nombre,
          situacion.segundo_nombre,
          situacion.primer_apellido,
          situacion.segundo_apellido,
          telefono || situacion.telefono,
          situacion.direccion,
          situacion.fecha_nacimiento,
          email,
          `Solicitud del personal (${req.user.codigo_corporativo}) desde su sesión. La formaliza un colega.`,
        ]
      )).rows[0];
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    // El número de caso también va por correo; si no sale, la solicitud queda registrada igual.
    let correoEnviado = false;
    try {
      const mailRes = await mailerService.sendCaseNumberEmail({
        to: email,
        nombre: `${situacion.primer_nombre} ${situacion.primer_apellido}`,
        numeroCaso: solicitud.numero_caso,
      });
      correoEnviado = mailerService.wasSent(mailRes);
    } catch (mailErr) {
      console.warn('[WARN] No se pudo enviar el correo con el número de caso:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Solicitud registrada (caso ${solicitud.numero_caso}). Pídale a un colega que la formalice en «Afiliaciones».`,
      data: {
        numero_caso: solicitud.numero_caso,
        fecha_solicitud: solicitud.fecha_solicitud,
        email,
        correo_enviado: correoEnviado,
      },
    });
  } catch (error) {
    console.error('[ERROR] afiliacionPersonalController.solicitarMiAfiliacion:', error);
    return res.status(500).json({ success: false, message: 'No se pudo registrar su solicitud. Intente de nuevo.' });
  }
};

module.exports = { obtenerMiAfiliacion, solicitarMiAfiliacion };
