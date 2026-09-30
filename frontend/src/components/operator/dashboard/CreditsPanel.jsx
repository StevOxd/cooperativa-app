import React from 'react';
import { Calculator, FileCheck } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, Table, TBody, TD, TH, THead, TR,
} from '../../ui';
import { getSecureDocumentUrl } from '../../../utils/documentUrl';
import { formatDate, formatDateTime, formatQ } from '../../../utils/format';
import { creditStatus } from './status';

const PENDING_STATES = ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'];

/**
 * Pestaña de solicitudes de crédito enviadas por los asociados.
 */
export const CreditsPanel = ({ creditos, total, pendientes, loading, search, onSearchChange, onOpen }) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        label="Buscar solicitudes de crédito"
        placeholder="Número, DPI, nombre o código"
        className="w-full sm:max-w-sm"
      />
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink tabular-nums">{pendientes}</span> por analizar de{' '}
        <span className="tabular-nums">{total}</span>
      </p>
    </div>

    {loading ? (
      <LoadingState label="Cargando solicitudes de crédito…" />
    ) : creditos.length === 0 ? (
      <EmptyState
        icon={Calculator}
        title={search ? 'Sin resultados' : 'No hay solicitudes de crédito'}
        description={
          search
            ? 'Revise el número de solicitud, DPI, nombre o código.'
            : 'Las solicitudes que los asociados envíen desde el simulador aparecerán aquí.'
        }
      />
    ) : (
      <Table caption="Solicitudes de crédito">
        <THead>
          <TR>
            <TH>Solicitud</TH>
            <TH>Asociado</TH>
            <TH numeric>Monto</TH>
            <TH>Plazo y cuota</TH>
            <TH>Acreditación</TH>
            <TH>Estado</TH>
            <TH>Observaciones</TH>
            <TH sticky><span className="sr-only">Acciones</span></TH>
          </TR>
        </THead>
        <TBody>
          {creditos.map((c) => {
            const status = creditStatus(c.estado);
            const isPending = PENDING_STATES.includes(c.estado);
            const note = c.observaciones_ejecutivo || c.dictamen_operador || c.observaciones;
            return (
              <TR key={c.id_solicitud_credito} interactive>
                <TD className="whitespace-nowrap">
                  <div className="font-mono text-ink">#{c.id_solicitud_credito}</div>
                  <div className="text-xs text-ink-subtle">{formatDateTime(c.fecha_solicitud)}</div>
                </TD>
                <TD className="whitespace-nowrap">
                  <div className="font-medium text-ink">
                    {c.primer_nombre} {c.segundo_nombre || ''} {c.primer_apellido} {c.segundo_apellido || ''}
                  </div>
                  <div className="font-mono text-xs text-ink-subtle">
                    {c.cui_dpi}
                    {c.codigo_corporativo && ` · ${c.codigo_corporativo}`}
                  </div>
                </TD>
                <TD numeric className="font-medium text-ink">{formatQ(c.monto_solicitado)}</TD>
                <TD className="whitespace-nowrap">
                  <div>{c.plazo_meses} meses</div>
                  <div className="text-xs text-ink-subtle tabular-nums">
                    {formatQ(c.cuota_mensual_estimada)}/mes · {parseFloat(c.tasa_interes).toFixed(2)}% anual
                  </div>
                </TD>
                <TD className="min-w-[13rem]">
                  <div>
                    {c.cuenta_destino_info ||
                      (c.cuenta_bancaria_destino_numero ? `Cuenta bancaria ${c.cuenta_bancaria_destino_numero}` : 'Cuenta principal')}
                  </div>
                  {c.cuenta_bancaria_destino_tipo && (
                    <div className="text-xs text-ink-subtle">{c.cuenta_bancaria_destino_tipo}</div>
                  )}
                </TD>
                <TD className="whitespace-nowrap">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {c.documento_firmado_url && (
                    <a
                      href={getSecureDocumentUrl(c.documento_firmado_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline"
                    >
                      <FileCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      PDF firmado
                    </a>
                  )}
                </TD>
                <TD className="max-w-xs text-xs" title={note}>
                  {c.observaciones_ejecutivo ? (
                    c.estado === 'DEVUELTA_OPERADOR' ? (
                      <div className="line-clamp-2 text-warning-800">Devuelta: {c.observaciones_ejecutivo}</div>
                    ) : (
                      <div className="line-clamp-2">Ejecutivo: {c.observaciones_ejecutivo}</div>
                    )
                  ) : c.dictamen_operador ? (
                    <div className="line-clamp-2">Dictamen: {c.dictamen_operador}</div>
                  ) : (
                    <div className="line-clamp-2 text-ink-subtle">{c.observaciones || '—'}</div>
                  )}
                </TD>
                <TD sticky className="whitespace-nowrap text-center">
                  {isPending ? (
                    <Button size="sm" onClick={() => onOpen(c, '')} title="Evaluar solvencia y emitir dictamen">
                      {c.estado === 'DEVUELTA_OPERADOR' ? 'Reevaluar' : 'Evaluar'}
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => onOpen(c, '')}>Expediente</Button>
                      <span className="text-xs text-ink-subtle">
                        {c.analista_nombre ? `Por ${c.analista_nombre}` : 'Procesada'}
                        {c.fecha_resolucion && ` · ${formatDate(c.fecha_resolucion)}`}
                      </span>
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    )}
  </div>
);

export default CreditsPanel;
