import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { mensajeDeErrorDeDocumento, pedirDocumentoProtegido } from '../../hooks/useDocumentoBlob';
import { cn } from '../ui';

// La URL local del documento se libera pasado este tiempo: la pestaña ya lo cargó
const VIDA_URL_LOCAL_MS = 5 * 60 * 1000;

/**
 * Enlace que abre un documento protegido en una pestaña nueva. El documento se pide con el token en la cabecera
 * (nunca en la URL, donde quedaría en los registros del servidor y en el historial) y se muestra desde una URL local
 * del navegador (`blob:`).
 *
 * @param {Object} props
 * @param {string} props.url - URL del servidor, p. ej. `/api/uploads/creditos/solicitud_….pdf`.
 * @param {string} [props.title]
 * @param {string} [props.etiquetaOculta] - Lo que completa el nombre para lectores de pantalla (p. ej. « de la
 *   solicitud #12»); siempre se anuncia que se abre en una pestaña nueva.
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export const ProtectedDocumentLink = ({ url, title, etiquetaOculta = '', className, children }) => {
  const { toast } = useToast();
  const [abriendo, setAbriendo] = useState(false);
  // Un segundo clic mientras se descarga no abre otra pestaña (el estado puede no haberse actualizado aún)
  const enCurso = useRef(false);

  const abrir = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    // La pestaña se abre con el clic: abierta después de la descarga, el navegador la bloquearía como emergente
    const pestana = window.open('', '_blank');
    if (pestana) pestana.opener = null;
    setAbriendo(true);
    try {
      const respuesta = await pedirDocumentoProtegido(url);
      const objectUrl = URL.createObjectURL(respuesta.data);
      if (pestana && !pestana.closed) {
        pestana.location.href = objectUrl;
      } else {
        // Si el navegador bloqueó la pestaña (o se cerró mientras descargaba), el documento se descarga
        const enlace = document.createElement('a');
        enlace.href = objectUrl;
        enlace.download = url.split('/').pop();
        enlace.click();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), VIDA_URL_LOCAL_MS);
    } catch (error) {
      pestana?.close();
      toast.error(mensajeDeErrorDeDocumento(error.response?.status));
    } finally {
      enCurso.current = false;
      setAbriendo(false);
    }
  };

  return (
    <button
      type="button"
      onClick={abrir}
      aria-busy={abriendo || undefined}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 hover:text-brand-800 hover:underline cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
        className
      )}
    >
      {abriendo && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
      {children}
      <span className="sr-only">{etiquetaOculta} (se abre en una pestaña nueva)</span>
    </button>
  );
};

export default ProtectedDocumentLink;
