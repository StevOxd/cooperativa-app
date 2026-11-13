const { limitePorUsuario } = require('./limitePorUsuario');

// Intentos por usuario cada 15 minutos de las acciones que piden la contraseña con la sesión abierta
const MAX_CONFIRMACIONES_IDENTIDAD = 5;
const MAX_CONFIRMACIONES_PRUEBAS = 100;

/**
 * Un solo límite, con un solo contador por usuario, para todas las rutas que confirman la contraseña con la sesión
 * abierta (cambiar la contraseña, desactivar el 2FA, cambiar el correo del sistema). Si cada ruta tuviera su propio
 * contador, con una sesión robada se podría adivinar la contraseña repartiendo los intentos entre ellas.
 */
const limiteConfirmacionIdentidad = limitePorUsuario({
  max: MAX_CONFIRMACIONES_IDENTIDAD,
  maxPruebas: MAX_CONFIRMACIONES_PRUEBAS,
  mensaje: 'Hizo demasiados intentos de confirmar su contraseña. Espere 15 minutos y vuelva a intentarlo.',
});

module.exports = { limiteConfirmacionIdentidad };
