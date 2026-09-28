/**
 * Helper unificado para la generación correlativa de Códigos de Usuario / Corporativos
 * Estándar institucional:
 * - AD-X: Administrador (AD-1, AD-2...)
 * - OP-X: Operador (OP-1, OP-2...)
 * - EB-X: Empleado Bancario (EB-1, EB-2...)
 * - EX-X: Asociado Ajeno / Externo (EX-1, EX-2...)
 */

/**
 * Obtiene el siguiente código corporativo disponible para un prefijo dado
 * @param {import('pg').PoolClient | import('pg').Pool} client 
 * @param {'AD' | 'OP' | 'EB' | 'EX' | string} prefix 
 * @returns {Promise<string>}
 */
const getNextCorporateCode = async (client, prefix = 'EX') => {
  const cleanPrefix = (prefix || 'EX').trim().toUpperCase();

  const query = `
    SELECT codigo_corporativo 
    FROM usuarios 
    WHERE codigo_corporativo ~ ('^' || $1 || '-[0-9]+$')
  `;

  const res = await client.query(query, [cleanPrefix]);

  let maxNum = 0;
  for (const row of res.rows) {
    const parts = row.codigo_corporativo.split('-');
    if (parts.length === 2) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `${cleanPrefix}-${maxNum + 1}`;
};

const crypto = require('crypto');

/**
 * Determina el prefijo según el rol y tipo de asociado
 * @param {string} rolUpper - Código del rol ('ADMINISTRADOR', 'OPERADOR', 'ASOCIADO', 'EJECUTIVO')
 * @param {string} tipoAsociado - 'EB' (Empleado Bancario) o 'EX' (Ajeno / Externo)
 * @returns {string} Prefijo institucional
 */
const resolvePrefix = (rolUpper, tipoAsociado = 'EX') => {
  if (rolUpper === 'ADMINISTRADOR') return 'AD';
  if (rolUpper === 'OPERADOR') return 'OP';
  if (rolUpper === 'EJECUTIVO') return 'EJ';
  
  const cleanTipo = (tipoAsociado || '').toUpperCase();
  if (cleanTipo === 'EB' || cleanTipo === 'EMPLEADO_BANCO' || cleanTipo === 'EMPLEADO') {
    return 'EB';
  }
  return 'EX';
};

/**
 * Genera una contraseña criptográficamente segura y aleatoria (12 caracteres).
 * Cumple con los requerimientos bancarios de ASVS (mayúsculas, minúsculas, números y símbolos).
 * Evita caracteres ambiguos (0, O, 1, l) para facilitar su lectura en el correo.
 *
 * @param {number} [length=12] Longitud de la contraseña
 * @returns {string} Contraseña generada
 */
const generateSecureRandomPassword = (length = 12) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin I, O
  const lower = 'abcdefghijkmnpqrstuvwxyz'; // Sin l, o
  const digits = '23456789';               // Sin 0, 1
  const symbols = '!@#$%&*';

  const getRandomChar = (set) => set[crypto.randomInt(0, set.length)];

  // Garantizar al menos dos de cada categoría obligatoria
  const passwordChars = [
    getRandomChar(upper),
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(digits),
    getRandomChar(symbols),
    getRandomChar(symbols),
  ];

  const allChars = upper + lower + digits + symbols;
  while (passwordChars.length < length) {
    passwordChars.push(getRandomChar(allChars));
  }

  // Mezclar con algoritmo Fisher-Yates y crypto.randomInt
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
};

module.exports = {
  getNextCorporateCode,
  resolvePrefix,
  generateSecureRandomPassword,
};
