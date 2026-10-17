/**
 * Helper unificado para la generación correlativa de Códigos de Usuario / Corporativos
 * Estándar institucional:
 * - AD-X: Administrador (AD-1, AD-2...)
 * - OP-X: Operador (OP-1, OP-2...)
 * - EB-X: Empleado Bancario (EB-1, EB-2...)
 * - EX-X: Asociado Ajeno / Externo (EX-1, EX-2...)
 */

const { errorDeNegocio } = require('./errores');

// Espacio de los candados de códigos de usuario (el efectivo por persona usa el 2: efectivoVentanillaService)
const CANDADO_CODIGOS = 1;

/**
 * Calcula el siguiente código libre de un prefijo (el número más alto de `PREFIJO-número` más uno), sin bloquear.
 *
 * @param {{ query: Function }} client - Conexión, pool o el módulo `config/db`.
 * @param {string} cleanPrefix - Prefijo ya normalizado.
 * @returns {Promise<string>}
 */
const calcularSiguienteCodigo = async (client, cleanPrefix) => {
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

const normalizarPrefijo = (prefix) => (prefix || 'EX').trim().toUpperCase();

/**
 * Obtiene el siguiente código corporativo para un alta, dentro de la transacción que inserta el usuario.
 *
 * Toma un candado por prefijo que dura hasta el COMMIT o el ROLLBACK, así dos altas simultáneas del mismo tipo
 * no calculan el mismo código. Si otra alta del mismo tipo lo tiene más de 15 s (algunas llaman al banco o
 * envían el correo antes de confirmar), responde 409 en lugar de esperar sin límite.
 *
 * @param {import('pg').PoolClient} client - Dentro de una transacción.
 * @param {'AD' | 'OP' | 'EB' | 'EX' | string} prefix 
 * @returns {Promise<string>}
 * @throws {Error} `errorDeNegocio(409)` si no se obtiene el candado a tiempo.
 */
const getNextCorporateCode = async (client, prefix = 'EX') => {
  const cleanPrefix = normalizarPrefijo(prefix);

  // El candado va en su propia consulta: el cálculo toma su lectura después de obtenerlo y ve el código que
  // guardó el alta que lo tenía
  await client.query("SET LOCAL lock_timeout = '15s'");
  try {
    await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [CANDADO_CODIGOS, `codigo-corporativo:${cleanPrefix}`]);
  } catch (error) {
    if (error.code === '55P03') {
      throw errorDeNegocio(409, 'Hay otra alta del mismo tipo de usuario en curso. Espere un momento y vuelva a intentarlo.');
    }
    throw error;
  }
  await client.query('SET LOCAL lock_timeout TO DEFAULT');

  return calcularSiguienteCodigo(client, cleanPrefix);
};

/**
 * Muestra el código que recibiría la próxima alta de un prefijo, sin bloquear ni reservarlo (el alta lo vuelve a
 * calcular con el candado).
 *
 * @param {{ query: Function }} db - Pool o el módulo `config/db`.
 * @param {string} prefix
 * @returns {Promise<string>}
 */
const previewNextCorporateCode = (db, prefix = 'EX') => calcularSiguienteCodigo(db, normalizarPrefijo(prefix));

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
  previewNextCorporateCode,
  resolvePrefix,
  generateSecureRandomPassword,
};
