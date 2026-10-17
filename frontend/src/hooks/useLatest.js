import { useLayoutEffect, useRef } from 'react';

/**
 * Referencia que siempre apunta al último valor recibido.
 *
 * Sirve para que un efecto use la versión actual de una función o de un dato sin volver a ejecutarse
 * cada vez que cambian (por ejemplo, la búsqueda se aplica con su propio retardo, no con los filtros).
 * Se actualiza en `useLayoutEffect`, que corre antes que los `useEffect` del mismo render.
 *
 * @template T
 * @param {T} value
 * @returns {{current: T}}
 */
export const useLatest = (value) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

export default useLatest;
