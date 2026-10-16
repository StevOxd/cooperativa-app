/**
 * Usuario (usuarios.id_usuario) de la carga de un JWT de sesión.
 *
 * Los tokens emitidos antes del issue #32 no traen `id_usuario`; entonces `id` e `id_persona` valían lo
 * mismo que el id_usuario actual, porque la migración conservó ese número para cada usuario existente.
 *
 * @param {object} decoded - Carga del JWT ya verificado.
 * @returns {number|null} null si el token no identifica a ningún usuario.
 */
const idUsuarioDelToken = (decoded) => {
  const id = Number(decoded?.id_usuario ?? decoded?.id ?? decoded?.id_persona);
  return Number.isInteger(id) && id > 0 ? id : null;
};

module.exports = { idUsuarioDelToken };
