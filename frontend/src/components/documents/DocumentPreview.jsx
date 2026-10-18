import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, Button, LoadingState, cn } from '../ui';
import { useDocumentoBlob } from '../../hooks/useDocumentoBlob';

/**
 * Vista previa de un documento protegido: imagen o PDF, cargado con el token en la cabecera.
 *
 * @param {Object} props
 * @param {string|null} props.url - URL del servidor del documento.
 * @param {string} props.titulo - Nombre accesible (p. ej. «DPI (frente) de Ana Pérez»).
 */
export const DocumentPreview = ({ url, titulo, className }) => {
  const { cargando, objectUrl, tipo, error, reintentar } = useDocumentoBlob(url);

  // El espacio de carga se parece al de la vista final para que la página no salte
  if (cargando) return <LoadingState label="Abriendo documento…" className="min-h-[40vh]" />;
  if (error) {
    return (
      <Alert tone="danger">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {error}
          <Button size="sm" variant="link" icon={RefreshCw} className="px-0" onClick={reintentar}>Intentar de nuevo</Button>
        </span>
      </Alert>
    );
  }
  if (!objectUrl) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {tipo === 'application/pdf' ? (
        <iframe src={objectUrl} title={titulo} className="h-[60vh] w-full rounded-md border border-line bg-surface-sunken" />
      ) : (
        <div className="flex justify-center rounded-md border border-line bg-surface-sunken p-2">
          <img src={objectUrl} alt={titulo} className="max-h-[60vh] w-auto max-w-full object-contain" />
        </div>
      )}
      <a
        href={objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <ExternalLink className="w-4 h-4" aria-hidden="true" />
        Abrir en otra pestaña
      </a>
    </div>
  );
};

export default DocumentPreview;
