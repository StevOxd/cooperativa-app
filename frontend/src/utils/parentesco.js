import { humanize } from './format';

/**
 * Valores de parentesco que se guardan (issue #10): los mismos para el operador y el asociado, y los
 * únicos que acepta el servidor. Se muestran con `parentescoLabel`.
 */
export const PARENTESCOS = ['CONYUGE', 'HIJO/A', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO'];

/**
 * Texto en pantalla para el parentesco de un beneficiario. Además de `PARENTESCOS`, cubre las variantes
 * que se guardaban antes ('CÓNYUGE', 'PADRE', 'MADRE'…) por si llega alguna sin convertir.
 */
const LABELS = {
  'HIJO/A': 'Hijo o hija',
  CONYUGE: 'Cónyuge',
  'CÓNYUGE': 'Cónyuge',
  'PADRE/MADRE': 'Padre o madre',
  PADRE: 'Padre',
  MADRE: 'Madre',
  'HERMANO/A': 'Hermano o hermana',
  'SOBRINO/A': 'Sobrino o sobrina',
  OTRO: 'Otro',
};

export const parentescoLabel = (value) => LABELS[value] || humanize(value);
