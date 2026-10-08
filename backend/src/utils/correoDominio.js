const dns = require('dns').promises;

/**
 * Comprueba que el dominio de un correo exista y reciba correo (registros MX), para no crear
 * accesos al portal con correos que nunca recibirán la contraseña (issue #26).
 *
 * Si la consulta DNS no se puede hacer (sin red, tiempo agotado), no bloquea: devuelve válido y
 * `comprobado: false`. Solo rechaza cuando el dominio no existe o declara que no recibe correo.
 */
const TIEMPO_MAXIMO_MS = 3000;

/**
 * @param {string} email - Correo ya validado en su formato.
 * @returns {Promise<{valido: boolean, comprobado: boolean, message?: string}>}
 */
const verificarDominioCorreo = async (email) => {
  const dominio = String(email || '').split('@')[1];
  if (!dominio) return { valido: false, comprobado: true, message: 'Revise el formato del correo.' };

  const noRecibe = {
    valido: false,
    comprobado: true,
    message: `El dominio «${dominio}» no existe o no recibe correos. Revise que el correo esté bien escrito.`,
  };

  // Toda la consulta (MX y, si hace falta, direcciones IP) comparte un solo límite de tiempo.
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIEMPO_MAXIMO_MS);
  });

  const consultar = async () => {
    try {
      const registros = await dns.resolveMx(dominio);
      // «MX nulo» (RFC 7505): un único registro con destino vacío o «.» declara que no recibe correo.
      const conDestino = registros.filter((r) => r.exchange && r.exchange !== '.');
      return conDestino.length > 0 ? { valido: true, comprobado: true } : noRecibe;
    } catch (error) {
      if (error.code === 'ENOTFOUND') return noRecibe;
      if (error.code !== 'ENODATA') throw error;
      // Sin MX pero con dirección IP (v4 o v6): el correo se entrega al propio dominio (RFC 5321, «MX implícito»).
      const tieneIp = async (resolver) => resolver(dominio).then((ips) => ips.length > 0, () => false);
      return (await tieneIp(dns.resolve4)) || (await tieneIp(dns.resolve6)) ? { valido: true, comprobado: true } : noRecibe;
    }
  };

  try {
    return await Promise.race([consultar(), limite]);
  } catch {
    return { valido: true, comprobado: false };
  } finally {
    clearTimeout(temporizador);
  }
};

module.exports = { verificarDominioCorreo };
