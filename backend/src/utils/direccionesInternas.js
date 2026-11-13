const dns = require('dns').promises;
const net = require('net');

/**
 * Direcciones que no son de Internet: la propia máquina, la red local, los contenedores de Docker, link-local y el
 * servicio de metadatos de la nube (169.254.169.254). Un servidor configurado desde la pantalla no debe llegar ahí.
 */
const internas = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([red, prefijo]) => internas.addSubnet(red, prefijo, 'ipv4'));
// IPv6: solo las direcciones globales (2000::/3) son de Internet. Dentro de ellas se excluyen las que llevan a una
// IPv4 por traducción (NAT64 y 6to4), que podría ser interna.
const ipv6Globales = new net.BlockList();
ipv6Globales.addSubnet('2000::', 3, 'ipv6');
[
  ['2002::', 16],
  ['2001:db8::', 32],
].forEach(([red, prefijo]) => internas.addSubnet(red, prefijo, 'ipv6'));
const ipv6Traducidas = new net.BlockList();
[
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
].forEach(([red, prefijo]) => ipv6Traducidas.addSubnet(red, prefijo, 'ipv6'));

/**
 * @param {string} ip
 * @returns {boolean} true si la IP es interna. Las IPv4 escritas como IPv6 (::ffff:10.0.0.1) se revisan como IPv4; en
 *   IPv6 solo se aceptan las globales (2000::/3) que no traducen a IPv4.
 */
const esDireccionInterna = (ip) => {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapeada) return internas.check(mapeada[1], 'ipv4');
  const familia = net.isIP(ip);
  if (!familia) return true;
  if (familia === 4) return internas.check(ip, 'ipv4');
  return !ipv6Globales.check(ip, 'ipv6') || ipv6Traducidas.check(ip, 'ipv6') || internas.check(ip, 'ipv6');
};

/**
 * Resuelve un nombre de servidor y devuelve la primera dirección, si ninguna de sus direcciones es interna. Conectarse
 * a la dirección devuelta (y no otra vez al nombre) evita que una segunda consulta DNS lleve a otra IP.
 *
 * @param {string} servidor - Nombre o IP.
 * @returns {Promise<string|null>} La IP, o null si no se resuelve o alguna dirección es interna.
 */
const resolverDireccionPublica = async (servidor) => {
  let direcciones;
  try {
    direcciones = await dns.lookup(servidor, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (direcciones.length === 0 || direcciones.some(({ address }) => esDireccionInterna(address))) return null;
  return direcciones[0].address;
};

module.exports = { esDireccionInterna, resolverDireccionPublica };
