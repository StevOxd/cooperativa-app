const db = require('../config/db');
const { idUsuarioDelToken } = require('../utils/tokenUsuario');

const MENSAJE_SESION_INVALIDA = 'Su sesión no es válida. Inicie sesión de nuevo.';

/**
 * Comprueba que la carga de un JWT ya verificado sea una sesión vigente. La usan las rutas HTTP
 * (`verifyToken`) y los WebSockets, para que los dos apliquen las mismas reglas:
 *
 * - Solo sirven los tokens de sesión. Los emitidos para un paso concreto (llevan `purpose`, como el del
 *   segundo paso del 2FA) no abren una sesión.
 * - El token identifica a un usuario que existe y está ACTIVO.
 * - El token trae `sesion_activa_id` y es la sesión vigente del usuario en la base de datos: un logout,
 *   un nuevo inicio de sesión o una desactivación la invalidan.
 *
 * @async
 * @param {object} decoded - Carga del JWT, ya verificada con la firma.
 * @returns {Promise<
 *   {valida: true, idUsuario: number, usuario: {id_persona: number, estado: string, sesion_activa_id: string, debe_cambiar_password: boolean, rol: string}}
 *   | {valida: false, status: number, message: string, sesionRevocada?: boolean}
 * >}
 */
const validarSesion = async (decoded) => {
  const invalida = { valida: false, status: 401, message: MENSAJE_SESION_INVALIDA };

  const idUsuario = idUsuarioDelToken(decoded);
  if (!decoded || decoded.purpose || !idUsuario || !decoded.sesion_activa_id) return invalida;

  const resultado = await db.query(
    `SELECT u.id_persona, u.estado, u.sesion_activa_id, u.debe_cambiar_password, r.codigo AS rol
     FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = $1`,
    [idUsuario]
  );
  const usuario = resultado.rows[0];
  if (!usuario) return invalida;

  if (usuario.estado !== 'ACTIVO') {
    return { valida: false, status: 403, message: 'Su cuenta está inactiva. Comuníquese con el administrador.' };
  }

  if (usuario.sesion_activa_id !== decoded.sesion_activa_id) {
    return {
      valida: false,
      status: 401,
      message: 'Su sesión terminó o se abrió en otro dispositivo. Inicie sesión de nuevo.',
      sesionRevocada: true,
    };
  }

  return { valida: true, idUsuario, usuario };
};

module.exports = { validarSesion };
