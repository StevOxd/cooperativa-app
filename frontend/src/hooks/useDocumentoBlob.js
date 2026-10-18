import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

const SIN_DOCUMENTO = { cargando: false, objectUrl: null, tipo: null, error: '' };

/**
 * Descarga un documento protegido con el token en la cabecera (nunca en la URL) y lo deja en una URL local del
 * navegador (`blob:`) para mostrarlo en una imagen o un iframe. La URL local se libera al cambiar o desmontar.
 *
 * @param {string|null} url - URL del servidor, p. ej. `/api/uploads/afiliaciones/doc_….pdf`.
 * @returns {{ cargando: boolean, objectUrl: string|null, tipo: string|null, error: string, reintentar: Function }}
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
    // `api` ya antepone /api
    api
      .get(url.replace(/^\/api(?=\/)/, ''), { responseType: 'blob' })
      .then((respuesta) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(respuesta.data);
        setEstado({ cargando: false, objectUrl, tipo: respuesta.data.type, error: '' });
      })
      .catch((error) => {
        if (cancelado) return;
        const status = error.response?.status;
        setEstado({
          ...SIN_DOCUMENTO,
          error: status === 403 ? 'No tiene permiso para ver este documento.' : 'No se pudo abrir el documento.',
        });
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
