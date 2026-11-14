const dns = require('dns').promises;
const net = require('net');
const redesEspeciales = require('../config/redesEspeciales.json');

/**
 * Lista de redes a partir de su notación CIDR («red/prefijo»).
 *
 * @param {string[]} redes
 * @param {'ipv4'|'ipv6'} familia
 * @param {import('net').BlockList} [lista] - Lista a la que se agregan; si falta, se crea una nueva.
 * @returns {import('net').BlockList}
 */
const listaDeRedes = (redes, familia, lista = new net.BlockList()) => {
  redes.forEach((cidr) => {
    const [red, prefijo] = cidr.split('/');
    lista.addSubnet(red, Number(prefijo), familia);
  });
  return lista;
};

/*
 * Las redes salen de `config/redesEspeciales.json`, tomadas del registro de direcciones de uso especial de la IANA
 * (RFC 6890).
 *
 * Internas: direcciones que no son de Internet (la propia máquina, la red local, los contenedores de Docker, link-local
 * y el servicio de metadatos de la nube, 169.254.169.254). Un servidor configurado desde la pantalla no debe llegar ahí.
 *
 * IPv6: solo las direcciones globales (2000::/3) son de Internet. Dentro de ellas se excluyen las de documentación y las
 * que llevan a una IPv4 por traducción (NAT64 y 6to4), que podría ser interna.
 */
const internas = listaDeRedes(redesEspeciales.ipv4Internas, 'ipv4');
listaDeRedes(redesEspeciales.ipv6Internas, 'ipv6', internas);
const ipv6Globales = listaDeRedes(redesEspeciales.ipv6Globales, 'ipv6');
const ipv6Traducidas = listaDeRedes(redesEspeciales.ipv6Traducidas, 'ipv6');

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
