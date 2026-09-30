import { humanize } from './format';

/**
 * Texto en pantalla para el parentesco de un beneficiario. Cubre los valores
 * que guarda el operador ('CONYUGE', 'PADRE/MADRE'…) y los del portal del
 * asociado ('CÓNYUGE', 'PADRE', 'MADRE'…); los valores guardados no cambian.
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
