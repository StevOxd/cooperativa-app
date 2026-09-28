/**
 * Adjunta el token JWT de autenticación a la URL del documento estático si es necesario,
 * permitiendo la carga segura en elementos <iframe> o enlaces <a href> (SEC-02).
 * 
 * @param {string} url - URL del documento (ej. /api/uploads/creditos/...)
 * @returns {string} URL con parámetro ?token=<jwt> anexado si existe sesión activa.
 */
export const getSecureDocumentUrl = (url) => {
  if (!url) return '';
  const token = localStorage.getItem('coop_token');
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

export default getSecureDocumentUrl;
