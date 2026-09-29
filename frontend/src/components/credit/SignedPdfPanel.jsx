import React from 'react';
import { Download, ExternalLink, FileCheck, FileText, Trash2, UploadCloud } from 'lucide-react';
import { Alert, Button, EmptyState } from '../ui';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Documento firmado de una solicitud de crédito: descarga del expediente
 * recibido, carga del PDF firmado por quien resuelve y vista previa.
 *
 * @param {Object} props
 * @param {string} [props.existingUrl] - URL segura del documento que ya tiene la solicitud.
 * @param {string} [props.existingName]
 * @param {number} [props.existingSize] - En bytes.
 * @param {string} [props.downloadName] - Nombre sugerido al descargar.
 * @param {{name: string, size: number, base64: string}|null} props.newFile - PDF recién cargado.
 * @param {Function} props.onFileChange - Manejador del `<input type="file">`.
 * @param {Function} props.onDiscard - Descarta el PDF recién cargado.
 * @param {string} [props.fileError]
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.uploadLabel
 * @param {string} props.emptyText - Mensaje cuando no hay ningún documento.
 */
export const SignedPdfPanel = ({
  existingUrl,
  existingName,
  existingSize,
  downloadName,
  newFile,
  onFileChange,
  onDiscard,
  fileError,
  title,
  description,
  uploadLabel,
  emptyText,
}) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-md border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {existingUrl && (
          <Button
            as="a"
            href={existingUrl}
            download={downloadName}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="secondary"
            icon={Download}
          >
            Descargar
          </Button>
        )}
        {/* El input queda accesible con teclado (sr-only), no oculto con `hidden`. */}
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-800 focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2">
          <UploadCloud className="w-4 h-4" aria-hidden="true" />
          {newFile ? 'Reemplazar PDF' : uploadLabel}
          <input type="file" accept="application/pdf" onChange={onFileChange} className="sr-only" />
        </label>
      </div>
    </div>

    {fileError && <Alert tone="danger">{fileError}</Alert>}

    {newFile && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success-200 bg-success-50 px-4 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-success-900">
          <FileCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate font-medium">{newFile.name}</span>
          <span className="shrink-0 text-success-800">{kb(newFile.size)} · listo para adjuntar</span>
        </span>
        <Button size="sm" variant="ghostDanger" icon={Trash2} onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    )}

    {newFile ? (
      <iframe
        src={newFile.base64}
        title="Vista previa del PDF cargado"
        className="h-96 w-full rounded-md border border-line bg-surface-sunken"
      />
    ) : existingUrl ? (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 text-ink-soft">
            <FileText className="w-4 h-4 text-ink-subtle" aria-hidden="true" />
            {existingName || 'formulario_firmado.pdf'}
            {existingSize && <span className="text-ink-subtle">({kb(existingSize)})</span>}
          </span>
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Abrir en otra pestaña
          </a>
        </div>
        <iframe
          src={existingUrl}
          title="Documento firmado de la solicitud"
          className="h-96 w-full rounded-md border border-line bg-surface-sunken"
        />
      </div>
    ) : (
      <div className="rounded-md border border-dashed border-line-strong">
        <EmptyState icon={FileText} title="Sin documento" description={emptyText} />
      </div>
    )}
  </div>
);

export default SignedPdfPanel;
