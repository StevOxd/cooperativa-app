import React from 'react';
import { Calculator, FileCheck } from 'lucide-react';
import {
  Badge, Button, EmptyState, LoadingState, SearchInput, StatCard, StatGroup, StepProgress, Table, TBody, TD, TH, THead, TR,
} from '../../ui';
import { ProtectedDocumentLink } from '../../documents';
import { formatDate, formatDateTime, formatQ } from '../../../utils/format';
import { PASOS_CREDITO, avanceCredito } from '../../credit/creditProgress';
import { creditStatus } from './status';

const PENDING_STATES = ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'];

const enEstado = (creditos, estados) => creditos.filter((c) => estados.includes(c.estado));

/**
 * Número de la cuenta donde se acredita el desembolso. La bandeja lo trae dentro de la descripción
 * («Cuenta Bancaria de AHORRO (CTA-BCO-…)»); si no hay paréntesis, se muestra la descripción entera.
 */
const cuentaDeAcreditacion = (c) => {
  const texto = c.cuenta_bancaria_destino_numero || c.cuenta_destino_info || '';
  return texto.match(/\(([^)]+)\)/)?.[1] || texto || 'Cuenta principal';
};

/** Resumen por etapa: lo que le toca analizar, lo que le devolvieron y lo que está en manos de otros. */
const CreditsSummary = ({ todos }) => {
  const porAnalizar = enEstado(todos, ['PENDIENTE', 'EN_REVISION_OPERADOR']);
  const devueltas = enEstado(todos, ['DEVUELTA_OPERADOR']).length;
  const conEjecutivo = enEstado(todos, ['EN_AUTORIZACION_EJECUTIVO']).length;
  const porFirmar = enEstado(todos, ['PENDIENTE_FIRMA']).length;
  return (
    <StatGroup columns={4}>
      <StatCard
        label="Por analizar"
        value={porAnalizar.length}
        hint={`${formatQ(porAnalizar.reduce((sum, c) => sum + (parseFloat(c.monto_solicitado) || 0), 0))} solicitados`}
      />
      <StatCard
        label="Devueltas por el ejecutivo"
        value={devueltas}
        hint={devueltas > 0 ? 'Revise el comentario y reevalúe' : 'Ninguna'}
        hintTone={devueltas > 0 ? 'warning' : 'neutral'}
      />
      <StatCard label="Con el ejecutivo" value={conEjecutivo} hint="Esperan su autorización" />
      <StatCard label="Esperan la firma" value={porFirmar} hint="El asociado debe subir el formulario" />
    </StatGroup>
  );
};

/**
 * Pestaña de solicitudes de crédito enviadas por los asociados.
 *
 * @param {Object} props
 * @param {Object[]} props.creditos - Las solicitudes que se muestran (con búsqueda).
 * @param {Object[]} props.todos - Todas las solicitudes, para el resumen.
 */
export const CreditsPanel = ({ creditos, todos, loading, search, onSearchChange, onOpen }) => (
  <div className="space-y-4">
    {!loading && todos.length > 0 && <CreditsSummary todos={todos} />}

    <SearchInput
      value={search}
      onChange={onSearchChange}
      label="Buscar solicitudes de crédito"
      placeholder="Número, DPI, nombre o código"
      className="w-full sm:max-w-sm"
    />

    {loading ? (
      <LoadingState label="Cargando solicitudes de crédito…" />
    ) : creditos.length === 0 ? (
      <EmptyState
        icon={Calculator}
        title={search ? 'Sin resultados' : 'No hay solicitudes de crédito'}
        description={
          search
            ? 'Revise el número de solicitud, DPI, nombre o código.'
            : 'Llegan cuando un asociado envía su solicitud firmada desde el simulador de su portal.'
        }
        action={search && <Button variant="secondary" onClick={() => onSearchChange('')}>Limpiar búsqueda</Button>}
      />
    ) : (
      <Table caption="Solicitudes de crédito">
        <THead>
          <TR>
            <TH>Solicitud</TH>
            <TH>Asociado</TH>
            <TH>Estado</TH>
            <TH numeric>Monto</TH>
            <TH>Plazo y cuota</TH>
            <TH>Observaciones</TH>
            <TH sticky><span className="sr-only">Acciones</span></TH>
          </TR>
        </THead>
        <TBody>
          {creditos.map((c) => {
            const status = creditStatus(c.estado);
            const avance = avanceCredito(c.estado);
            const isPending = PENDING_STATES.includes(c.estado);
            const note = c.observaciones_ejecutivo || c.dictamen_operador || c.observaciones;
            return (
              <TR key={c.id_solicitud_credito} interactive>
                <TD className="whitespace-nowrap">
                  <div className="font-mono text-ink">#{c.id_solicitud_credito}</div>
                  <div className="text-xs text-ink-subtle">{formatDateTime(c.fecha_solicitud)}</div>
                </TD>
                <TD className="min-w-[11rem]">
                  <div className="font-medium text-ink">
                    {c.primer_nombre} {c.segundo_nombre || ''} {c.primer_apellido} {c.segundo_apellido || ''}
                  </div>
                  <div className="font-mono text-xs text-ink-subtle">
                    {c.cui_dpi}
                    {c.codigo_corporativo && ` · ${c.codigo_corporativo}`}
                  </div>
                </TD>
                <TD className="whitespace-nowrap">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {!(avance.terminado && avance.tono === 'neutral') && (
                    <StepProgress
                      compact
                      steps={PASOS_CREDITO}
                      current={avance.paso}
                      tone={avance.tono}
                      label={`Avance de la solicitud #${c.id_solicitud_credito}`}
                      className="mt-1.5"
                    />
                  )}
                  {c.documento_firmado_url && (
                    <div className="mt-1">
                      <ProtectedDocumentLink
                        url={c.documento_firmado_url}
                        title="Abrir el documento firmado en una pestaña nueva"
                        etiquetaOculta={` de la solicitud #${c.id_solicitud_credito}`}
                        className="text-xs"
                      >
                        <FileCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        PDF firmado
                      </ProtectedDocumentLink>
                    </div>
                  )}
                </TD>
                <TD numeric className="font-medium text-ink">{formatQ(c.monto_solicitado)}</TD>
                <TD className="whitespace-nowrap">
                  <div>{c.plazo_meses} meses · {parseFloat(c.tasa_interes).toFixed(2)}%</div>
                  <div className="text-xs text-ink-subtle tabular-nums">{formatQ(c.cuota_mensual_estimada)}/mes</div>
                  {/* Dónde se acredita el desembolso, para compararlo con el PDF firmado */}
                  <div className="max-w-[12rem] truncate text-xs text-ink-subtle" title={c.cuenta_destino_info || undefined}>
                    A <span className="font-mono">{cuentaDeAcreditacion(c)}</span>
                  </div>
                </TD>
                <TD className="min-w-[10rem] max-w-[14rem] text-xs" title={note}>
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
                        {c.analista_nombre
                          ? `Por ${c.analista_nombre}`
                          : c.estado === 'PENDIENTE_FIRMA'
                          ? 'Espera la firma'
                          : c.estado === 'EN_AUTORIZACION_EJECUTIVO'
                          ? 'Con el ejecutivo'
                          : 'Procesada'}
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
