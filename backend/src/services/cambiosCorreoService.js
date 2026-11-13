const { pool } = require('../config/db');
const { confirmarIdentidad } = require('./confirmacionIdentidadService');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');

/**
 * Protección de los cambios del correo del sistema: por ese correo salen las contraseñas temporales y los códigos de
 * verificación, así que cambiarlo exige confirmar la identidad del administrador y cada intento queda registrado en
 * `cambios_correo_sistema` (de solo agregar, nunca con la contraseña).
 */

const PROVEEDORES = ['google', 'smtp'];
const LARGO_MAXIMO_SERVIDOR = 253;
const LARGO_MAXIMO_USUARIO = 256;
const PUERTO_MAXIMO = 65535;

/** El puerto como entero entre 1 y 65535, o null (cabe en la columna INT). */
const puertoValido = (valor) => {
  const puerto = Number(valor);
  return Number.isInteger(puerto) && puerto > 0 && puerto <= PUERTO_MAXIMO ? puerto : null;
};

/** Texto recortado o null, para no guardar valores enormes ni de otro tipo. */
const texto = (valor, largo) => (typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, largo) : null);

/**
 * Datos del intento que se guardan en la auditoría (nunca la contraseña).
 *
 * @param {string} proveedor - 'google' o 'smtp'.
 * @param {Object} cuerpo - req.body.
 * @returns {{proveedor: string, servidor: string|null, puerto: number|null, usuario_correo: string|null}}
 */
const datosDelIntento = (proveedor, cuerpo) =>
  proveedor === 'smtp'
    ? {
        proveedor,
        servidor: texto(cuerpo.smtp_host, LARGO_MAXIMO_SERVIDOR),
        puerto: puertoValido(cuerpo.smtp_port),
        usuario_correo: texto(cuerpo.smtp_user, LARGO_MAXIMO_USUARIO),
      }
    : {
        proveedor,
        servidor: 'smtp.gmail.com',
        puerto: null,
        usuario_correo: texto(cuerpo.gmail_user, LARGO_MAXIMO_USUARIO),
      };

/**
 * Registra un intento de cambiar el correo del sistema.
 *
 * `SOLICITADO` se registra antes de aplicar el cambio y, si no se puede registrar, lanza el error: sin rastro no se
 * cambia el correo. Los demás resultados se registran después; si fallan, solo se avisa en consola.
 *
 * @param {import('express').Request} req
 * @param {ReturnType<typeof datosDelIntento>} datos
 * @param {'SOLICITADO'|'APLICADO'|'CONFIRMACION_FALLIDA'|'DATOS_INVALIDOS'|'VERIFICACION_FALLIDA'|'ERROR'} resultado
 */
const registrarCambioCorreo = async (req, datos, resultado) => {
  try {
    await pool.query(
      `INSERT INTO cambios_correo_sistema
         (id_usuario, proveedor, servidor, puerto, usuario_correo, resultado, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.id_usuario,
        datos.proveedor,
        datos.servidor,
        datos.puerto,
        datos.usuario_correo,
        resultado,
        ipDelCliente(req),
        userAgentDe(req),
      ]
    );
  } catch (error) {
    if (resultado === 'SOLICITADO') throw error;
    console.error(
      `[SECURITY WARN] No se pudo registrar el cambio del correo del sistema (${resultado}):`,
      error.message
    );
  }
};

module.exports = { PROVEEDORES, confirmarIdentidad, datosDelIntento, registrarCambioCorreo };
