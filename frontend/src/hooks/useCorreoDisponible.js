import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Consulta si el correo de la cooperativa funciona cada vez que se abre un formulario de
 * afiliación o de acceso al portal (issues #26 y #27).
 *
 * @param {boolean} activo - Consultar solo mientras el formulario está abierto.
 * @returns {{disponible: boolean|null, consultando: boolean, error: boolean}}
 */
export const useEstadoCorreo = (activo) => {
  const [estado, setEstado] = useState({ disponible: null, consultando: false, error: false });

  useEffect(() => {
    if (!activo) return undefined;
    let cancelado = false;
    setEstado({ disponible: null, consultando: true, error: false });
    api
      .get('/operador/correo-estado')
      .then((res) => {
        if (!cancelado) setEstado({ disponible: Boolean(res.data?.disponible), consultando: false, error: false });
      })
      .catch(() => {
        if (!cancelado) setEstado({ disponible: null, consultando: false, error: true });
      });
    return () => {
      cancelado = true;
    };
  }, [activo]);

  return estado;
};

/**
 * Versión corta: `true` o `false`, o `null` mientras consulta o si no se pudo consultar.
 *
 * @param {boolean} activo
 * @returns {boolean|null}
 */
export const useCorreoDisponible = (activo) => useEstadoCorreo(activo).disponible;

export default useCorreoDisponible;
