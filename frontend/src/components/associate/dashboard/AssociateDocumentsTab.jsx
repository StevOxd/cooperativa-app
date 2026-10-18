import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader } from '../../ui';
import { DocumentChecklist, DocumentViewerModal } from '../../documents';

/**
 * Pestaña «Documentos»: el asociado sube los documentos de su afiliación y ve cómo se revisaron. Puede reemplazar
 * uno pendiente o rechazado; uno aceptado solo se cambia en la agencia.
 *
 * @param {Object} props
 * @param {Object[]} props.documentos - Vigentes, uno por tipo.
 * @param {{estado: string}|null} props.resumen
 * @param {boolean} [props.error=false] - No se pudieron cargar: no se muestra la lista (parecería que no entregó nada).
 * @param {Function} props.onReintentar
 * @param {(tipo: string, dataUrl: string) => Promise<void>} props.onSubir
 */
export const AssociateDocumentsTab = ({ documentos, resumen, error = false, onReintentar, onSubir }) => {
  const [abierto, setAbierto] = useState(null);

  return (
    <Card>
      <CardHeader
        title="Documentos de afiliación"
        description="La cooperativa los necesita para completar su expediente. Un operador los revisa y, si alguno no se puede aceptar, le dice por qué."
      />
      <CardBody className="space-y-4">
        {error ? (
          <Alert tone="danger" title="No se pudieron cargar sus documentos">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              Revise su conexión e intente de nuevo.
              <Button size="sm" variant="link" icon={RefreshCw} className="px-0" onClick={onReintentar}>
                Intentar de nuevo
              </Button>
            </span>
          </Alert>
        ) : (
          <>
            {resumen?.estado === 'COMPLETO' && (
              <Alert tone="success" title="Sus documentos están completos">Ya revisamos y aceptamos los obligatorios.</Alert>
            )}
            <DocumentChecklist
              titulo="Sus documentos"
              documentos={documentos}
              onSubir={onSubir}
              puedeSubir={(d) => !d || ['PENDIENTE', 'RECHAZADO'].includes(d.estado)}
              onVer={setAbierto}
            />
            <p className="text-xs text-ink-muted">
              PDF, JPG o PNG de hasta 5 MB. Las fotos se reducen y se les quita la ubicación antes de enviarlas. Para
              cambiar un documento ya aceptado, llévelo a cualquier agencia.
            </p>
          </>
        )}
      </CardBody>
      <DocumentViewerModal documento={abierto} onClose={() => setAbierto(null)} />
    </Card>
  );
};

export default AssociateDocumentsTab;
