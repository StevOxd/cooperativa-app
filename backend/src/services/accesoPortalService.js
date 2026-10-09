const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const mailerService = require('./mailerService');
const bancoApiService = require('./bancoApiService');
const { decidirAccesoPortal } = require('../utils/accesoPortal');
const { getNextCorporateCode, resolvePrefix, generateSecureRandomPassword } = require('../utils/codeGenerator');

const ID_ROL_ASOCIADO = 3;

/** Error con estado HTTP y código para el frontend. */
const fallar = (statusCode, code, message) => {
  throw Object.assign(new Error(message), { statusCode, code });
};

/**
 * Estado del acceso al portal de un asociado, para el expediente (issue #27).
 *
 * - `SIN_ACCESO`: no tiene usuario; se puede activar.
 * - `PENDIENTE`: tiene usuario pero nunca entró; se puede reenviar (y corregir el correo).
 * - `ACTIVO`: ya entró al portal; si olvidó la contraseña, la reinicia el administrador.
 * - `INACTIVO`: su usuario está desactivado; lo reactiva el administrador.
 * - `PERSONAL`: su usuario es del personal (un usuario tiene un solo rol, issue #32).
 *
 * @param {{id_rol?: number, estado_usuario?: string, ultimo_acceso?: Date|null, codigo_corporativo?: string}} fila
 * @returns {string}
 */
const estadoAccesoPortal = (fila) => {
  if (!fila.codigo_corporativo) return 'SIN_ACCESO';
  if (fila.id_rol !== ID_ROL_ASOCIADO) return 'PERSONAL';
  if (fila.estado_usuario !== 'ACTIVO') return 'INACTIVO';
  return fila.ultimo_acceso ? 'ACTIVO' : 'PENDIENTE';
};

/**
 * Activa el acceso al portal de un asociado que no lo tiene, o se lo reenvía si nunca entró
 * (issue #27). Crea o actualiza su usuario con una contraseña temporal y la envía por correo.
 * Si el correo no sale, no se guarda nada: nadie queda con una contraseña que nadie recibió.
 *
 * @param {Object} params
 * @param {number|string} params.idAsociado
 * @param {string} params.email - Correo al que se envía el acceso (permite corregirlo).
 * @param {{id: number, ip: string|null, userAgent: string}} params.operador - Para la auditoría.
 * @returns {Promise<{accion: 'ACTIVADO'|'REENVIADO', codigo_corporativo: string, email: string}>}
 * @throws {Error} con `statusCode` y `code`.
 */
const activarAccesoPortal = async ({ idAsociado, email, operador }) => {
  const filaRes = await pool.query(
    `SELECT a.id_asociado, a.estado_asociado, p.id_persona, p.cui_dpi, p.nombre_completo,
            u.codigo_corporativo, u.id_rol, u.estado AS estado_usuario, u.ultimo_acceso, u.email
     FROM asociados a
     JOIN personas p ON p.id_persona = a.id_persona
     LEFT JOIN usuarios u ON u.id_persona = a.id_persona
     WHERE a.id_asociado = $1`,
    [idAsociado]
  );
  const fila = filaRes.rows[0];
  if (!fila) fallar(404, 'ASOCIADO_NO_ENCONTRADO', 'Asociado no encontrado.');
  if (fila.estado_asociado !== 'ACTIVO') fallar(409, 'ASOCIADO_INACTIVO', 'El asociado no está activo.');

  const estado = estadoAccesoPortal(fila);
  if (estado === 'ACTIVO') {
    fallar(409, 'ACCESO_YA_ACTIVO', 'El asociado ya entró al portal. Si olvidó su contraseña, el administrador la reinicia desde Usuarios.');
  }
  if (estado === 'INACTIVO') {
    fallar(409, 'ACCESO_DESACTIVADO', 'El usuario de este asociado está desactivado. Lo reactiva el administrador desde Usuarios.');
  }
  if (estado === 'PERSONAL') {
    fallar(409, 'USUARIO_PERSONAL', 'Esta persona tiene un usuario del personal de la cooperativa.');
  }

  // Correo funcionando, formato y dominio que recibe correo (mismas reglas que al afiliar, issue #26)
  const acceso = await decidirAccesoPortal(true, email);
  const emailFinal = acceso.email;

  const dup = await pool.query(
    'SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1) AND id_persona <> $2',
    [emailFinal, fila.id_persona]
  );
  if (dup.rows.length > 0) fallar(409, 'CORREO_EN_USO', 'Ese correo ya lo usa otra persona. Escriba otro.');

  const reenvio = estado === 'PENDIENTE';
  let codigo = fila.codigo_corporativo;
  if (!reenvio) {
    // Mismo prefijo que en la afiliación en ventanilla: EB si es empleado del banco, EX si no.
    let tipo = 'EX';
    const banco = await bancoApiService.verificarDpi(fila.cui_dpi);
    if (banco.success && banco.existe_en_banco && banco.cliente?.tipo_cliente === 'EMPLEADO_PLANILLA') tipo = 'EB';
    codigo = resolvePrefix('ASOCIADO', tipo);
  }

  const passwordTemporal = generateSecureRandomPassword(12);
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // El estado se leyó antes de la consulta DNS y del hash: se vuelve a comprobar con la fila bloqueada,
    // por si el asociado entró al portal o cambió su rol mientras tanto.
    const actualRes = await client.query(
      'SELECT id_rol, estado, ultimo_acceso FROM usuarios WHERE id_persona = $1 FOR UPDATE',
      [fila.id_persona]
    );
    const actual = actualRes.rows[0];
    const sigueIgual = reenvio
      ? actual && actual.id_rol === ID_ROL_ASOCIADO && actual.estado === 'ACTIVO' && !actual.ultimo_acceso
      : !actual;
    if (!sigueIgual) {
      fallar(409, 'ACCESO_CAMBIO', 'El acceso de este asociado cambió mientras se procesaba. Vuelva a abrir el expediente.');
    }

    if (reenvio) {
      await client.query(
        `UPDATE usuarios
         SET email = $1, password_hash = $2, debe_cambiar_password = TRUE, intentos_fallidos = 0, bloqueado_hasta = NULL
         WHERE id_persona = $3 AND id_rol = $4 AND estado = 'ACTIVO' AND ultimo_acceso IS NULL`,
        [emailFinal, passwordHash, fila.id_persona, ID_ROL_ASOCIADO]
      );
    } else {
      codigo = await getNextCorporateCode(client, codigo);
      await client.query(
        `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVO', TRUE)`,
        [fila.id_persona, ID_ROL_ASOCIADO, codigo, emailFinal, passwordHash]
      );
    }

    // Auditoría: quién lo activó o reenvió, cuándo (fecha_cambio) y a qué correo, incluido el anterior si cambió
    const correoCambio = reenvio && fila.email && fila.email.toLowerCase() !== emailFinal;
    const motivoAuditoria = reenvio
      ? `Acceso al portal reenviado desde el expediente a ${emailFinal}${correoCambio ? ` (correo anterior: ${fila.email})` : ''}`
      : `Acceso al portal activado desde el expediente a ${emailFinal}`;
    await client.query(
      `INSERT INTO historial_estados_usuario
        (id_usuario_modificado, estado_anterior, estado_nuevo, id_rol_anterior, id_rol_nuevo, id_modificado_por, motivo, ip_origen, user_agent)
       VALUES ($1, $2, 'ACTIVO', $3, $4, $5, $6, $7, $8)`,
      [
        fila.id_persona,
        reenvio ? fila.estado_usuario : null,
        reenvio ? fila.id_rol : null,
        ID_ROL_ASOCIADO,
        operador.id || null,
        motivoAuditoria,
        operador.ip,
        operador.userAgent,
      ]
    );

    // El correo sale antes del COMMIT: si no sale, se deshace todo (issue #27).
    const mailRes = await mailerService.sendAccountCredentialsEmail({
      to: emailFinal,
      nombre: fila.nombre_completo,
      codigoCorporativo: codigo,
      password: passwordTemporal,
      rolNombre: 'ASOCIADO COOPERATIVISTA',
    });
    if (!mailerService.wasSent(mailRes)) {
      // El catch hace el ROLLBACK
      fallar(502, 'CORREO_NO_ENVIADO', `No se pudo enviar el correo a ${emailFinal}. El acceso no se activó; intente de nuevo en unos minutos.`);
    }

    await client.query('COMMIT');

    // Si el correo cambió, se avisa al anterior (el titular se entera si no lo pidió).
    if (correoCambio) {
      try {
        await mailerService.sendAccessEmailChangedNotice({
          to: fila.email,
          nombre: fila.nombre_completo,
          codigoCorporativo: codigo,
          correoNuevo: emailFinal,
        });
      } catch (avisoError) {
        console.warn('Aviso: No se pudo avisar al correo anterior:', avisoError.message);
      }
    }

    return { accion: reenvio ? 'REENVIADO' : 'ACTIVADO', codigo_corporativo: codigo, email: emailFinal };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // Dos solicitudes simultáneas pueden chocar en el correo o en el código de usuario
    if (error.code === '23505') {
      if (String(error.constraint || error.message).includes('email')) {
        fallar(409, 'CORREO_EN_USO', 'Ese correo ya lo usa otra persona. Escriba otro.');
      }
      fallar(409, 'ACCESO_CAMBIO', 'Otra operación sobre este acceso terminó al mismo tiempo. Vuelva a abrir el expediente e intente de nuevo.');
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { activarAccesoPortal, estadoAccesoPortal };
