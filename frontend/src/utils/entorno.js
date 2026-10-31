/**
 * La aplicación corre en el propio equipo (desarrollo), no en el servidor de producción: con `npm run dev` o abierta
 * desde localhost (el Docker local). La imagen de producción se compila con `VITE_ENTORNO=produccion`, que manda sobre
 * el nombre del equipo: abierta por un túnel a localhost, producción no se marca como desarrollo.
 */
export const ES_DESARROLLO =
  import.meta.env.VITE_ENTORNO !== 'produccion'
  && (import.meta.env.DEV || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname));
