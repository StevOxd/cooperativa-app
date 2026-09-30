/**
 * Une clases de Tailwind ignorando valores vacíos, `false`, `null` o `undefined`.
 *
 * @param {...(string|false|null|undefined)} classes
 * @returns {string}
 */
export const cn = (...classes) => classes.filter(Boolean).join(' ');

export default cn;
