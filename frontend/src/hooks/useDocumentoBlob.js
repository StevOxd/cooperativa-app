import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

const SIN_DOCUMENTO = { cargando: false, objectUrl: null, tipo: null, error: '', noEncontrado: false };

// Solo rutas de documentos del propio servidor: a otra URL la petición llevaría el token en la cabecera
const RUTA_DOCUMENTO = /^\/api\/uploads\/[^?#]+$/;

/**
 * Pide un documento protegido con el token en la cabecera (nunca en la URL) y lo devuelve como blob.
 *
 * @param {string} url - URL del servidor, p. ej. `/api/uploads/creditos/solicitud_….pdf`.
 * @returns {Promise<import('axios').AxiosResponse<Blob>>}
 * @throws {Error} si la URL no es la de un documento del servidor, o el error de la petición.
 */
export const pedirDocumentoProtegido = (url) => {
  if (!RUTA_DOCUMENTO.test(url || '')) return Promise.reject(new Error('La dirección del documento no es válida.'));
  // `api` ya antepone /api
  return api.get(url.replace(/^\/api(?=\/)/, ''), { responseType: 'blob' });
};

/**
 * Mensaje para el usuario según el estado HTTP con que falló la descarga.
 *
 * @param {number} [status]
 * @returns {string}
 */
export const mensajeDeErrorDeDocumento = (status) => {
  if (status === 404) return 'No encontramos el documento.';
  if (status === 403) return 'No tiene permiso para ver este documento.';
  return 'No se pudo abrir el documento.';
};

/**
 * Descarga un documento protegido con el token en la cabecera (nunca en la URL) y lo deja en una URL local del
 * navegador (`blob:`) para mostrarlo en una imagen o un iframe. La URL local se libera al cambiar o desmontar.
 *
 * @param {string|null} url - URL del servidor, p. ej. `/api/uploads/afiliaciones/doc_….pdf`.
 * @returns {{ cargando: boolean, objectUrl: string|null, tipo: string|null, error: string, noEncontrado: boolean,
 *   reintentar: Function }} `noEncontrado`: el servidor respondió 404 (reintentar no sirve).
 */
export const useDocumentoBlob = (url) => {
  const [estado, setEstado] = useState(SIN_DOCUMENTO);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!url) {
      setEstado(SIN_DOCUMENTO);
      return undefined;
    }
    let cancelado = false;
    let objectUrl = null;
    setEstado({ ...SIN_DOCUMENTO, cargando: true });
    pedirDocumentoProtegido(url)
      .then((respuesta) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(respuesta.data);
        setEstado({ cargando: false, objectUrl, tipo: respuesta.data.type, error: '' });
      })
      .catch((error) => {
        if (cancelado) return;
        const status = error.response?.status;
        setEstado({ ...SIN_DOCUMENTO, error: mensajeDeErrorDeDocumento(status), noEncontrado: status === 404 });
      });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
};

export default useDocumentoBlob;
