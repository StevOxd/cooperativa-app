import React, { useId, useState } from 'react';
import { Eye, Loader2, UploadCloud } from 'lucide-react';
import { Alert, Badge, Button, ProgressBar, cn } from '../ui';
import { formatRelative } from '../../utils/format';
import {
  ACCEPT_DOCUMENTO, ESTADO_DOCUMENTO, OBLIGATORIOS, TIPOS_DOCUMENTO, formatoTamano, prepararDocumento,
} from '../../utils/documentos';

/**
 * Botón para elegir el archivo. Es un `<label>` con el input accesible por teclado (sr-only), no oculto. Mientras
 * sube, su input sigue habilitado (si se deshabilitara, el foco se perdería) y el clic no abre el selector.
 */
const BotonSubir = ({ tipo, texto, subiendo, disabled, onArchivo }) => (
  <label
    className={cn(
      'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
      'focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2',
      disabled || subiendo
        ? 'cursor-not-allowed bg-surface-sunken text-ink-subtle'
        : 'cursor-pointer bg-brand-700 text-white hover:bg-brand-800'
    )}
  >
    {subiendo ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="w-4 h-4" aria-hidden="true" />}
    {subiendo ? 'Subiendo…' : texto}
    <span className="sr-only"> {tipo.label}</span>
    <input
      type="file"
      accept={ACCEPT_DOCUMENTO}
      disabled={disabled}
      aria-disabled={subiendo || undefined}
      onClick={(e) => { if (subiendo) e.preventDefault(); }}
      onChange={(e) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (archivo) onArchivo(archivo);
      }}
      className="sr-only"
    />
  </label>
);

/**
 * Lista de documentos de afiliación por tipo: estado, motivo del rechazo, ver y subir o reemplazar.
 *
 * @param {Object} props
 * @param {Object[]} props.documentos - Vigentes (uno por tipo), como los devuelve la API.
 * @param {(tipo: string, dataUrl: string) => Promise<void>} props.onSubir - Lanza un error con `message` si falla.
 * @param {(documento: Object|undefined) => boolean} props.puedeSubir - Si ese tipo admite una carga nueva.
 * @param {(documento: Object) => void} props.onVer - Solo para documentos con `url` (los de una afiliación que todavía
 *   no se completa no se abren).
 * @param {(documento: Object) => string} [props.textoVer] - Texto del botón para abrir (p. ej. «Revisar»).
 * @param {boolean} [props.conAyuda=true] - Muestra cómo debe ser cada documento (le habla al interesado; el
 *   expediente del operador la oculta).
 * @param {string} [props.titulo='Documentos de afiliación']
 * @param {'h2'|'h3'} [props.as='h3']
 */
export const DocumentChecklist = ({
  documentos,
  onSubir,
  puedeSubir,
  onVer,
  textoVer = () => 'Ver',
  conAyuda = true,
  titulo = 'Documentos de afiliación',
  as: Heading = 'h3',
  className,
}) => {
  const tituloId = useId();
  const [subiendo, setSubiendo] = useState(null);
  const [errores, setErrores] = useState({});

  const porTipo = Object.fromEntries(documentos.map((d) => [d.tipo_documento, d]));
  const entregados = OBLIGATORIOS.filter((t) => ['PENDIENTE', 'ACEPTADO'].includes(porTipo[t]?.estado)).length;
  const aceptados = OBLIGATORIOS.filter((t) => porTipo[t]?.estado === 'ACEPTADO').length;
  const etiquetaSubiendo = TIPOS_DOCUMENTO.find((t) => t.id === subiendo)?.label;

  const subir = async (tipo, archivo) => {
    setErrores((e) => ({ ...e, [tipo]: '' }));
    setSubiendo(tipo);
    try {
      await onSubir(tipo, await prepararDocumento(archivo));
    } catch (error) {
      // Un error de red o una página de error de nginx no traen un mensaje para el usuario
      const mensaje = error.isAxiosError
        ? error.response?.data?.message || 'No se pudo subir el documento. Intente de nuevo.'
        : error.message;
      setErrores((e) => ({ ...e, [tipo]: mensaje }));
    } finally {
      setSubiendo(null);
    }
  };

  return (
    <section className={cn('space-y-3', className)} aria-labelledby={tituloId}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Heading id={tituloId} className="text-sm font-semibold text-ink">{titulo}</Heading>
          <p className="text-sm text-ink-muted">
            <span className="font-medium tabular-nums text-ink">{entregados} de {OBLIGATORIOS.length}</span> obligatorios entregados
            {aceptados > 0 && <> · <span className="tabular-nums">{aceptados}</span> aceptados</>}
          </p>
        </div>
        <ProgressBar
          value={entregados}
          max={OBLIGATORIOS.length}
          tone={aceptados === OBLIGATORIOS.length ? 'success' : 'brand'}
          label="Documentos obligatorios entregados"
          valueText={`${entregados} de ${OBLIGATORIOS.length}`}
        />
      </div>
      <p className="sr-only" role="status">{etiquetaSubiendo ? `Subiendo ${etiquetaSubiendo}…` : ''}</p>

      <ul className="divide-y divide-line rounded-md border border-line">
        {TIPOS_DOCUMENTO.map((tipo) => {
          const documento = porTipo[tipo.id];
          const estado = ESTADO_DOCUMENTO[documento?.estado || 'FALTA'];
          const habilitado = puedeSubir(documento);
          let textoSubir = 'Subir';
          if (documento?.estado === 'RECHAZADO') textoSubir = 'Subir de nuevo';
          else if (documento) textoSubir = 'Reemplazar';
          let detalle = conAyuda ? tipo.hint : 'No entregado.';
          if (documento) detalle = `Subido ${formatRelative(documento.fecha_carga)} · ${formatoTamano(documento.tamano_bytes)}`;
          return (
            <li key={tipo.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {tipo.label}
                    {!tipo.obligatorio && <span className="text-xs font-normal text-ink-muted">(opcional)</span>}
                    {(documento || tipo.obligatorio) && (
                      <Badge tone={estado.tone} dot={!documento}>{estado.label}</Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">{detalle}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {documento?.url && (
                    <Button size="sm" variant="secondary" icon={Eye} onClick={() => onVer(documento)}>
                      {textoVer(documento)}
                      <span className="sr-only"> {tipo.label}</span>
                    </Button>
                  )}
                  {habilitado && (
                    <BotonSubir
                      tipo={tipo}
                      texto={textoSubir}
                      subiendo={subiendo === tipo.id}
                      disabled={Boolean(subiendo) && subiendo !== tipo.id}
                      onArchivo={(archivo) => subir(tipo.id, archivo)}
                    />
                  )}
                </div>
              </div>
              {documento?.estado === 'RECHAZADO' && documento.motivo_rechazo && (
                <Alert tone="danger" title="Motivo del rechazo">{documento.motivo_rechazo}</Alert>
              )}
              {errores[tipo.id] && <Alert tone="danger">{errores[tipo.id]}</Alert>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default DocumentChecklist;
