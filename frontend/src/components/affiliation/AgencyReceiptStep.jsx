import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Badge, Button } from '../ui';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatQ } from '../../utils/format';
import { generateAffiliationCasePdf } from '../../utils/pdfs';
import api from '../../services/api';
import { AffiliationDocumentsPanel } from '../documents';

/**
 * Constancia con el número de caso para terminar la afiliación en agencia.
 * Se puede descargar en PDF y también imprime bien desde el navegador.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.casoGenerado - Respuesta de `/afiliacion/solicitar-nuevo` (o de `terminar-en-ventanilla`), con
 *   `carga_token` para subir los documentos desde aquí.
 */
export const AgencyReceiptStep = ({ casoGenerado }) => {
  const { toast } = useToast();
  const cargaToken = casoGenerado?.carga_token;
  const cargarDocumentos = useCallback(
    () => api.post('/afiliacion/documentos/consultar', { carga_token: cargaToken }).then((r) => r.data.data),
    [cargaToken]
  );
  const subirDocumento = useCallback(
    (tipo, archivo) => api.post('/afiliacion/documentos', { carga_token: cargaToken, tipo_documento: tipo, archivo }).then((r) => r.data.data),
    [cargaToken]
  );

  const handleDownloadPdf = async () => {
    try {
      await generateAffiliationCasePdf({ caso: casoGenerado });
    } catch (err) {
      console.error('Error al generar la constancia de afiliación:', err);
      toast.error('No se pudo generar la constancia. Intente de nuevo.');
    }
  };

  if (!casoGenerado) return null;

  const tieneMonto = casoGenerado.monto_estimado !== undefined && casoGenerado.monto_estimado !== null;

  return (
    <div className="print-avoid-break">
      {/* Membrete: solo al imprimir */}
      <div className="mb-6 hidden items-start justify-between border-b border-line-strong pb-3 print:flex">
        <div>
          <p className="text-base font-semibold text-ink">Cooperativa Integral de Ahorro y Crédito, R.L.</p>
          <p className="text-sm text-ink-muted">Constancia de solicitud de afiliación</p>
        </div>
        <p className="text-xs text-ink-muted">Impresa el {formatDate(new Date())}</p>
      </div>

      <div className="print:hidden">
        <h2 className="text-lg font-semibold text-ink">Su solicitud quedó registrada</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Guarde este número: lo necesitará en la agencia.
          {casoGenerado.correo_enviado && ' También se lo enviamos por correo.'}
        </p>
      </div>

      <div className="mt-6 rounded-md border border-line-strong px-4 py-5 text-center">
        <p className="text-sm text-ink-muted">Número de caso</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-ink sm:text-3xl">{casoGenerado.numero_caso}</p>
        <p className="mt-1 text-xs text-ink-subtle">Emitido el {formatDate(casoGenerado.fecha_solicitud)}</p>
      </div>

      <section aria-labelledby="caso-pasos" className="mt-6">
        <h3 id="caso-pasos" className="text-sm font-medium text-ink">Para terminar su afiliación</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Vaya a cualquier agencia del banco.</li>
          <li>Lleve su DPI original, este número de caso y los documentos que no haya subido.</li>
          <li>Pague su aporte inicial para abrir su cuenta de ahorro.</li>
        </ol>
      </section>

      <dl className="mt-6 divide-y divide-line rounded-md border border-line text-sm">
        <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2.5">
          <dt className="text-ink-muted">Solicitante</dt>
          <dd className="text-ink">{casoGenerado.nombre_completo}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2.5">
          <dt className="text-ink-muted">DPI</dt>
          <dd className="font-mono text-ink">{casoGenerado.cui_dpi}</dd>
        </div>
        {tieneMonto && (
          <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2.5">
            <dt className="text-ink-muted">Depósito estimado</dt>
            <dd className="text-ink tabular-nums">{formatQ(casoGenerado.monto_estimado)}</dd>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-2.5">
          <dt className="text-ink-muted">Estado</dt>
          <dd><Badge tone="warning">Pendiente en agencia</Badge></dd>
        </div>
      </dl>

      {/* Documentos: opcionales aquí (Fase 6). Si no los sube ahora, los escanean en la agencia. */}
      {cargaToken && (
        <section aria-labelledby="caso-documentos" className="mt-6 space-y-2 print:hidden">
          <h3 id="caso-documentos" className="text-sm font-medium text-ink">Adelante sus documentos (opcional)</h3>
          <p className="text-sm text-ink-muted">
            Puede subirlos ahora, durante los próximos 30 minutos, o llevarlos a la agencia. Así su trámite en la agencia
            es más rápido.
          </p>
          <AffiliationDocumentsPanel
            titulo="Documentos de afiliación"
            cargar={cargarDocumentos}
            subir={subirDocumento}
            nota="PDF, JPG o PNG de hasta 5 MB. Las fotos se reducen y se les quita la ubicación antes de enviarlas."
          />
        </section>
      )}

      {/* Firmas: solo al imprimir. Se usan <footer>/<span> porque la regla de impresión
          de index.css quita márgenes y rellenos a todos los <div>. */}
      <footer className="hidden grid-cols-2 gap-10 pt-20 text-center text-xs text-ink-muted print:grid">
        <span className="block border-t border-line-strong pt-1.5">
          <span className="block font-medium text-ink">Firma del solicitante</span>
          <span className="block">DPI <span className="font-mono">{casoGenerado.cui_dpi}</span></span>
        </span>
        <span className="block border-t border-line-strong pt-1.5">
          <span className="block font-medium text-ink">Firma y sello de la agencia</span>
        </span>
      </footer>

      <div className="mt-8 flex flex-col items-center gap-4 print:hidden">
        <Button
          icon={Download}
          size="lg"
          fullWidth
          onClick={handleDownloadPdf}
        >
          Descargar constancia en PDF
        </Button>
        <Link
          to="/login"
          className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
};

export default AgencyReceiptStep;
