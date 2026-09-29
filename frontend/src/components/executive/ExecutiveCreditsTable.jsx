import React from 'react';
import { FileCheck, FileText } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingState, Table, TBody, TD, TH, THead, TR } from '../ui';
import { getSecureDocumentUrl } from '../../utils/documentUrl';
import { formatDate, formatQ, humanize } from '../../utils/format';

/** Estados vistos desde el ejecutivo. */
const STATES = {
  EN_AUTORIZACION_EJECUTIVO: { label: 'Por autorizar', tone: 'warning' },
  DEVUELTA_OPERADOR: { label: 'Devuelta', tone: 'neutral' },
  APROBADA: { label: 'Aprobada', tone: 'success' },
  APROBADO: { label: 'Aprobada', tone: 'success' },
  DESEMBOLSADA: { label: 'Desembolsada', tone: 'success' },
  DENEGADA: { label: 'Denegada', tone: 'danger' },
  RECHAZADA: { label: 'Denegada', tone: 'danger' },
  EN_REVISION_OPERADOR: { label: 'Con el operador', tone: 'brand' },
  PENDIENTE: { label: 'Con el operador', tone: 'brand' },
};

export const executiveCreditStatus = (estado) => STATES[estado] || { label: humanize(estado), tone: 'neutral' };
const status = executiveCreditStatus;

/**
 * Tabla de solicitudes de crédito para el ejecutivo.
 *
 * @param {Object} props
 * @param {Array} props.creditos - Lista ya filtrada.
 * @param {boolean} props.loading
 * @param {boolean} props.hasFilters - Hay búsqueda o una pestaña distinta de "Por autorizar".
 * @param {Function} props.onOpen - Abre el expediente / resolución.
 */
export const ExecutiveCreditsTable = ({ creditos, loading, hasFilters, onOpen }) => {
  if (loading) return <LoadingState label="Cargando solicitudes…" />;

  if (creditos.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={hasFilters ? 'No hay solicitudes con este criterio' : 'No hay créditos por autorizar'}
        description={
          hasFilters
            ? 'Pruebe con otra pestaña o revise la búsqueda.'
            : 'Cuando un operador eleve una solicitud, aparecerá aquí para su resolución.'
        }
      />
    );
  }

  return (
    <Table bordered={false} caption="Solicitudes de crédito">
      <THead>
        <TR>
          <TH>Solicitud</TH>
          <TH>Asociado</TH>
          <TH>Estado</TH>
          <TH numeric>Monto</TH>
          <TH>Plazo y cuota</TH>
          <TH>Dictamen del operador</TH>
          <TH>Expediente</TH>
          <TH sticky><span className="sr-only">Acciones</span></TH>
        </TR>
      </THead>
      <TBody>
        {creditos.map((c) => {
          const nombre = `${c.primer_nombre || ''} ${c.primer_apellido || ''}`.trim() || 'Asociado';
          const isPendiente = c.estado === 'EN_AUTORIZACION_EJECUTIVO';
          const st = status(c.estado);
          return (
            <TR key={c.id_solicitud_credito} interactive>
              <TD className="whitespace-nowrap">
                <div className="font-mono text-ink">#{c.id_solicitud_credito}</div>
                <div className="text-xs text-ink-subtle">{formatDate(c.fecha_solicitud)}</div>
              </TD>
              <TD className="whitespace-nowrap">
                <div className="font-medium text-ink">{nombre}</div>
                <div className="font-mono text-xs text-ink-subtle">
                  {c.cui_dpi || 'Sin DPI'}
                  {c.codigo_corporativo && ` · ${c.codigo_corporativo}`}
                </div>
              </TD>
              <TD className="whitespace-nowrap"><Badge tone={st.tone}>{st.label}</Badge></TD>
              <TD numeric className="font-medium text-ink">{formatQ(c.monto_solicitado)}</TD>
              <TD className="whitespace-nowrap">
                <div>{c.plazo_meses} meses</div>
                <div className="text-xs text-ink-subtle tabular-nums">{formatQ(c.cuota_mensual_estimada)}/mes</div>
              </TD>
              <TD className="min-w-[12rem] max-w-xs">
                {c.dictamen_operador ? (
                  <>
                    <div className="line-clamp-2 text-ink" title={c.dictamen_operador}>{c.dictamen_operador}</div>
                    <div className="text-xs text-ink-subtle">
                      {c.operador_revisa_nombre
                        ? `${c.operador_revisa_nombre} ${c.operador_revisa_apellido || ''}`.trim()
                        : 'Operador'}
                    </div>
                  </>
                ) : (
                  <span className="text-ink-subtle">Sin dictamen</span>
                )}
              </TD>
              <TD className="whitespace-nowrap">
                {c.documento_firmado_url ? (
                  <a
                    href={getSecureDocumentUrl(c.documento_firmado_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir el documento firmado en una pestaña nueva"
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <FileCheck className="w-4 h-4" aria-hidden="true" />
                    PDF firmado
                  </a>
                ) : (
                  <span className="text-ink-subtle">—</span>
                )}
              </TD>
              <TD sticky className="whitespace-nowrap text-center">
                {isPendiente ? (
                  <Button size="sm" onClick={() => onOpen(c)}>Resolver</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => onOpen(c)}>Expediente</Button>
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
};

export default ExecutiveCreditsTable;
