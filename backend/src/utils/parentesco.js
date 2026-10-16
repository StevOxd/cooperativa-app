/**
 * Parentesco de un beneficiario: una sola lista para el operador y el asociado (issue #10).
 *
 * Se aceptan las variantes que guardaban antes las dos pantallas («CÓNYUGE», «HIJO», «PADRE»…) y se
 * convierten al valor de la lista. Cualquier otro valor no es válido.
 */
const PARENTESCOS = ['CONYUGE', 'HIJO/A', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO'];

const EQUIVALENCIAS = {
  CONYUGE: 'CONYUGE',
  'HIJO/A': 'HIJO/A',
  HIJO: 'HIJO/A',
  HIJA: 'HIJO/A',
  'PADRE/MADRE': 'PADRE/MADRE',
  PADRE: 'PADRE/MADRE',
  MADRE: 'PADRE/MADRE',
  'HERMANO/A': 'HERMANO/A',
  HERMANO: 'HERMANO/A',
  HERMANA: 'HERMANO/A',
  'SOBRINO/A': 'SOBRINO/A',
  SOBRINO: 'SOBRINO/A',
  SOBRINA: 'SOBRINO/A',
  OTRO: 'OTRO',
};

/**
 * @param {unknown} valor - Parentesco recibido (mayúsculas o minúsculas, con o sin tilde).
 * @returns {string|null} El valor de la lista, o null si no corresponde a ninguno.
 */
const normalizarParentesco = (valor) => {
  const texto = String(valor ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return EQUIVALENCIAS[texto] || null;
};

module.exports = { PARENTESCOS, normalizarParentesco };
