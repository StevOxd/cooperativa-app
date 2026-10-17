const net = require('net');

/**
 * IP del cliente para los registros de auditoría (`ip_origen VARCHAR(45)`).
 *
 * nginx agrega la IP real al final de `X-Forwarded-For` (`$proxy_add_x_forwarded_for`); los valores anteriores
 * los escribe el cliente y no se usan. Si el último no es una IP válida (o no hay encabezado), se usa la de la
 * conexión. Una IP válida no pasa de 45 caracteres, así que el registro nunca falla por su longitud.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const ipDelCliente = (req) => {
  const ultima = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  if (net.isIP(ultima)) return ultima;
  const conexion = req.socket?.remoteAddress || null;
  return conexion && conexion.length <= 45 ? conexion : null;
};

module.exports = { ipDelCliente };
