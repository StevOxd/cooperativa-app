import React, { useEffect, useRef, useState } from 'react';
import { Check, History, X } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Field, Modal, Textarea, cn } from '../ui';
import { formatDateTime, formatRelative } from '../../utils/format';
import { CANAL_CARGA, ESTADO_DOCUMENTO, etiquetaDocumento, formatoTamano } from '../../utils/documentos';
import { DocumentPreview } from './DocumentPreview';

const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;

/**
 * Versiones anteriores del documento (solo el operador): fecha, cómo se revisó y opción de verla.
 */
const HistorialVersiones = ({ idDocumento, viendo, onVer }) => {
  const [versiones, setVersiones] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    api.get(`/operador/documentos/${idDocumento}/historial`)
      .then((res) => { if (!cancelado) setVersiones(res.data.data || []); })
      .catch(() => { if (!cancelado) setError('No se pudo cargar el historial.'); });
    return () => { cancelado = true; };
  }, [idDocumento]);

  if (error) return <p className="text-sm text-danger-700">{error}</p>;
  if (!versiones) return <p className="text-sm text-ink-muted">Cargando versiones…</p>;
  if (versiones.length <= 1) return <p className="text-sm text-ink-muted">Es la primera versión de este documento.</p>;

  return (
    <ol className="divide-y divide-line rounded-md border border-line">
      {versiones.map((v, i) => {
        const estado = ESTADO_DOCUMENTO[v.estado] || ESTADO_DOCUMENTO.PENDIENTE;
        const enPantalla = v.url === viendo;
        const nombre = i === 0 ? 'Versión actual' : `Versión ${versiones.length - i}`;
        return (
          <li
            key={v.id_documento}
            aria-current={enPantalla ? 'true' : undefined}
            className={cn('flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm', enPantalla && 'bg-brand-50')}
          >
            <div className="min-w-0">
              <p className="text-ink">
                {nombre}
                {enPantalla && <span className="font-medium text-brand-800"> (en pantalla)</span>}
                <span className="text-ink-muted"> · {formatDateTime(v.fecha_carga)} · {CANAL_CARGA[v.canal_carga] || v.canal_carga}</span>
                {v.cargado_por && <span className="font-mono text-xs text-ink-muted"> · {v.cargado_por}</span>}
              </p>
              {v.resultado && (
                <p className="text-xs text-ink-muted">
                  {v.resultado === 'ACEPTADO' ? 'Aceptada' : 'Rechazada'}
                  {v.revisado_por && <> por <span className="font-mono">{v.revisado_por}</span></>}
                  {v.motivo && <>: «{v.motivo}»</>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={estado.tone}>{estado.label}</Badge>
              {!enPantalla && (
                <Button size="sm" variant="link" className="px-0" onClick={() => onVer(v.url)}>
                  Ver<span className="sr-only"> {nombre.toLowerCase()}</span>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * Muestra un documento de afiliación y, si se puede, lo acepta o rechaza con motivo.
 *
 * @param {Object} props
 * @param {Object|null} props.documento - Documento vigente (con `url`); null cierra el modal.
 * @param {string} [props.titular] - Nombre del asociado o solicitante.
 * @param {boolean} [props.puedeRevisar=false] - Operador que no es el dueño ni lo subió.
 * @param {string} [props.porQueNoRevisa] - Por qué este operador no puede revisarlo (se muestra si está pendiente).
 * @param {boolean} [props.conHistorial=false] - Muestra las versiones anteriores (solo el operador).
 * @param {Function} props.onClose
 * @param {Function} [props.onRevisado] - Recibe el documento revisado.
 */
export const DocumentViewerModal = ({
  documento,
  titular,
  puedeRevisar = false,
  porQueNoRevisa,
  conHistorial = false,
  onClose,
  onRevisado,
}) => {
  const { toast } = useToast();
  const encabezadoRef = useRef(null);
  const [viendo, setViendo] = useState(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  // null es la versión actual: así el primer render ya muestra el documento (y el foco no cae en un botón que se va)
  useEffect(() => {
    setViendo(null);
    setRechazando(false);
    setMotivo('');
    setVerHistorial(false);
  }, [documento]);

  if (!documento) return null;

  const estado = ESTADO_DOCUMENTO[documento.estado] || ESTADO_DOCUMENTO.PENDIENTE;
  const etiqueta = etiquetaDocumento(documento.tipo_documento);
  const pendiente = documento.estado === 'PENDIENTE';
  const revisable = puedeRevisar && pendiente;
  const urlVista = viendo ?? documento.url;
  const viendoAnterior = urlVista !== documento.url;
  const motivoLimpio = motivo.trim();
  // Caracteres, como los cuenta el servidor (un emoji es uno)
  const largoMotivo = [...motivoLimpio].length;
  const motivoInvalido = largoMotivo < MOTIVO_MIN;
  // Con un motivo escrito, ni Escape ni un clic fuera cierran (se perdería)
  const conMotivoEscrito = rechazando && largoMotivo > 0;

  const revisar = async (resultado) => {
    setGuardando(true);
    try {
      const res = await api.patch(`/operador/documentos/${documento.id_documento}/revision`, {
        resultado,
        ...(resultado === 'RECHAZADO' && { motivo: motivoLimpio }),
      });
      if (res.data.correo_enviado === false) toast.warning(res.data.message);
      else toast.success(res.data.message);
      onRevisado?.(res.data.documento);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo guardar la revisión. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  let footer = <Button variant="secondary" onClick={onClose}>Cerrar</Button>;
  if (revisable && !rechazando) {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cerrar</Button>
        <Button variant="secondaryDanger" icon={X} onClick={() => setRechazando(true)} disabled={guardando || viendoAnterior}>
          Rechazar
        </Button>
        <Button icon={Check} onClick={() => revisar('ACEPTADO')} loading={guardando} disabled={viendoAnterior}>
          Aceptar
        </Button>
      </>
    );
  } else if (revisable) {
    footer = (
      <>
        <Button variant="secondary" onClick={() => setRechazando(false)} disabled={guardando}>Volver</Button>
        <Button variant="danger" onClick={() => revisar('RECHAZADO')} loading={guardando} disabled={motivoInvalido || viendoAnterior}>
          Confirmar rechazo
        </Button>
      </>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      dismissible={!conMotivoEscrito}
      closeOnOverlay={!rechazando}
      initialFocusRef={encabezadoRef}
      title={titular ? `${etiqueta} · ${titular}` : etiqueta}
      description={
        <>
          Subido {formatRelative(documento.fecha_carga)} · {CANAL_CARGA[documento.canal_carga] || documento.canal_carga}
          {documento.tamano_bytes ? ` · ${formatoTamano(documento.tamano_bytes)}` : ''}
        </>
      }
      footer={footer}
    >
      <div className="space-y-4">
        <div ref={encabezadoRef} tabIndex={-1} className="flex flex-wrap items-center gap-2 focus:outline-none">
          <Badge tone={estado.tone}>{estado.label}</Badge>
          {viendoAnterior && (
            <Button size="sm" variant="link" className="px-0" onClick={() => setViendo(null)}>
              Volver a la versión actual
            </Button>
          )}
        </div>
        {viendoAnterior && pendiente && puedeRevisar && (
          <Alert tone="info">Está viendo una versión anterior. Para revisar, vuelva a la versión actual.</Alert>
        )}
        {pendiente && !puedeRevisar && porQueNoRevisa && <Alert tone="info">{porQueNoRevisa}</Alert>}
        {documento.estado === 'RECHAZADO' && documento.motivo_rechazo && (
          <Alert tone="danger" title="Motivo del rechazo">{documento.motivo_rechazo}</Alert>
        )}

        <DocumentPreview url={urlVista} titulo={titular ? `${etiqueta} de ${titular}` : etiqueta} />

        {rechazando && (
          <Field
            label="Motivo del rechazo"
            hint={`Lo verá el asociado para volver a subirlo. ${largoMotivo}/${MOTIVO_MAX}`}
            error={largoMotivo > 0 && motivoInvalido ? `Escriba al menos ${MOTIVO_MIN} caracteres.` : undefined}
            required
          >
            <Textarea
              rows={3}
              value={motivo}
              maxLength={MOTIVO_MAX}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por ejemplo: la foto está borrosa y no se lee el número del DPI."
              autoFocus
            />
          </Field>
        )}

        {conHistorial && (
          <div className="space-y-2">
            <Button size="sm" variant="ghost" icon={History} onClick={() => setVerHistorial((v) => !v)} aria-expanded={verHistorial}>
              {verHistorial ? 'Ocultar versiones' : 'Ver versiones anteriores'}
            </Button>
            {verHistorial && <HistorialVersiones idDocumento={documento.id_documento} viendo={urlVista} onVer={setViendo} />}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default DocumentViewerModal;
