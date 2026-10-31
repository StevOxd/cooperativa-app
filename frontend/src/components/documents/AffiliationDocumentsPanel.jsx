import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert, Button } from '../ui';
import { DocumentChecklist } from './DocumentChecklist';
import { DocumentViewerModal } from './DocumentViewerModal';

/**
 * Documentos de una afiliación en curso (Fase 6): los carga, los sube y avisa cuántos obligatorios faltan. Sirve a
 * cada canal con sus propias llamadas: en línea (con el comprobante del banco o el permiso de la solicitud), el
 * personal que se afilia y ventanilla (presencial o formalización).
 *
 * @param {Object} props
 * @param {() => Promise<{documentos: Object[], resumen: Object}>} props.cargar - Lista inicial.
 * @param {(tipo: string, dataUrl: string) => Promise<{documentos: Object[], resumen: Object}|null>} props.subir - Lanza
 *   un error con `message` si falla; null si se guardó pero no se pudo volver a listar.
 * @param {(resumen: Object|null) => void} [props.onCambio] - Recibe el resumen cada vez que cambia (para habilitar
 *   el envío del formulario).
 * @param {boolean} [props.conAyuda=true] - Cómo debe ser cada documento (le habla al interesado).
 * @param {string} [props.titulo]
 * @param {string} [props.nota] - Texto bajo la lista.
 */
export const AffiliationDocumentsPanel = ({ cargar, subir, onCambio, conAyuda = true, titulo, nota }) => {
  const [estado, setEstado] = useState({ cargando: true, error: '', documentos: [], resumen: null });
  const [abierto, setAbierto] = useState(null);

  const aplicar = useCallback((data) => {
    setEstado({ cargando: false, error: '', documentos: data?.documentos || [], resumen: data?.resumen || null });
    onCambio?.(data?.resumen || null);
  }, [onCambio]);

  const leer = useCallback(async () => {
    // Al cambiar de trámite (otro `cargar`) no se muestran los documentos del anterior mientras llegan los nuevos
    setEstado({ cargando: true, error: '', documentos: [], resumen: null });
    onCambio?.(null);
    try {
      aplicar(await cargar());
    } catch (error) {
      setEstado((e) => ({ ...e, cargando: false, error: error.response?.data?.message || 'No se pudieron cargar los documentos.' }));
      onCambio?.(null);
    }
  }, [cargar, aplicar, onCambio]);

  useEffect(() => { leer(); }, [leer]);

  const onSubir = async (tipo, dataUrl) => {
    const data = await subir(tipo, dataUrl);
    if (data) aplicar(data);
    else await leer();
  };

  if (estado.cargando && estado.documentos.length === 0) {
    return (
      <div role="status" className="flex items-center gap-2 py-4 text-sm text-ink-muted">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Cargando documentos…
      </div>
    );
  }
  if (estado.error) {
    return (
      <Alert tone="danger" title="No se pudieron cargar los documentos">
        <p>{estado.error}</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={leer} aria-label="Reintentar cargar los documentos">
          Reintentar
        </Button>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <DocumentChecklist
        titulo={titulo}
        documentos={estado.documentos}
        onSubir={onSubir}
        puedeSubir={(d) => !d || d.estado !== 'ACEPTADO' || !conAyuda}
        onVer={setAbierto}
        conAyuda={conAyuda}
      />
      {nota && <p className="text-xs text-ink-muted">{nota}</p>}
      <DocumentViewerModal documento={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
};

export default AffiliationDocumentsPanel;
