import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Consulta si el correo de la cooperativa funciona cada vez que se abre un formulario de afiliación
 * (issue #26). Sin correo no se puede crear el acceso al portal.
 *
 * @param {boolean} activo - Consultar solo mientras el formulario está abierto.
 * @returns {boolean|null} `true` o `false`; `null` mientras consulta o si no se pudo consultar.
 */
export const useCorreoDisponible = (activo) => {
  const [disponible, setDisponible] = useState(null);

  useEffect(() => {
    if (!activo) return undefined;
    let cancelado = false;
    setDisponible(null);
    api
      .get('/operador/correo-estado')
      .then((res) => {
        if (!cancelado) setDisponible(Boolean(res.data?.disponible));
      })
      .catch(() => {
        if (!cancelado) setDisponible(null);
      });
    return () => {
      cancelado = true;
    };
  }, [activo]);

  return disponible;
};

export default useCorreoDisponible;
