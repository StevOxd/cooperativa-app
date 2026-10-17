import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, RotateCcw, SearchCheck } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  Alert,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatGroup,
  TabPanel,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui';
import { formatDateTime, formatQ, humanize } from '../utils/format';

const TABS_ID = 'conciliacion';
const SIN_FILTROS = { estado: '', texto: '', desde: '', hasta: '' };

const ESTADO_DEPOSITO = {
  PENDIENTE: { label: 'Pendiente', tone: 'warning' },
  SIN_CONFIRMAR: { label: 'Sin confirmar', tone: 'warning' },
  ACREDITADO: { label: 'Acreditado', tone: 'success' },
  RECHAZADO: { label: 'Rechazado', tone: 'neutral' },
  REVERTIDO: { label: 'Revertido', tone: 'neutral' },
};

const ORIGEN_REVERSION = {
  TRASLADO: 'Traslado',
  APERTURA_CUENTA: 'Apertura de cuenta',
  AFILIACION_EN_LINEA: 'Afiliación en línea',
  AFILIACION_PRESENCIAL: 'Afiliación en ventanilla',
  FORMALIZACION_AGENCIA: 'Formalización en agencia',
  DESEMBOLSO_CREDITO: 'Desembolso de crédito',
};

/** Lo que la reversión hace en la cuenta: lo que falta, lo que se hizo o que no hacía falta. */
const accionReversion = (r) => {
  if (r.estado === 'DESCARTADA') return 'No hacía falta revertir';
  if (r.tipo_movimiento === 'DEBITO') return r.estado === 'RESUELTA' ? 'Se retiró de la cuenta' : 'Retirar de la cuenta';
  return r.estado === 'RESUELTA' ? 'Se devolvió a la cuenta' : 'Devolver a la cuenta';
};

/**
 * Conciliación con el banco (issues #64 y #66), solo para el administrador.
 *
 * - Depósitos en ventanilla a cuentas del banco: los Pendiente o Sin confirmar se verifican contra el banco por su
 *   referencia y quedan Acreditado o Rechazado a nombre de quien concilia.
 * - Reversiones con el banco: las pendientes se hacen con confirmación; antes, el servidor comprueba que la
 *   operación no quedó registrada y que el banco tiene el movimiento original (si no, queda descartada). Las
 *   cerradas dicen quién las cerró, o «Automática» si las cerró el sistema.
 */
export const ConciliacionPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('depositos');
  const regionDepositos = useRef(null);
  const regionReversiones = useRef(null);

  // Depósitos: `filtros` es lo que hay en los campos; `aplicados`, lo que se buscó (las recargas usan estos)
  const [depositos, setDepositos] = useState(null);
  const [limitadoDepositos, setLimitadoDepositos] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [cargandoDepositos, setCargandoDepositos] = useState(false);
  const [errorDepositos, setErrorDepositos] = useState('');
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [aplicados, setAplicados] = useState(SIN_FILTROS);
  const [verificando, setVerificando] = useState(null);

  const [reversiones, setReversiones] = useState(null);
  const [limitadoReversiones, setLimitadoReversiones] = useState(false);
  const [estadoReversiones, setEstadoReversiones] = useState('PENDIENTE');
  const [cargandoReversiones, setCargandoReversiones] = useState(false);
  const [errorReversiones, setErrorReversiones] = useState('');
  const [totalPendientes, setTotalPendientes] = useState(null);
  const [porReintentar, setPorReintentar] = useState(null);
  const [reintentando, setReintentando] = useState(false);

  const cargarDepositos = useCallback(async (f) => {
    setCargandoDepositos(true);
    setErrorDepositos('');
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const res = await api.get('/conciliacion/depositos', { params });
      setDepositos(res.data.data || []);
      setLimitadoDepositos(Boolean(res.data.limitado));
      setResumen(res.data.resumen || []);
    } catch (err) {
      setErrorDepositos(err.response?.data?.message || 'No se pudieron cargar los depósitos.');
    } finally {
      setCargandoDepositos(false);
    }
  }, []);

  const cargarReversiones = useCallback(async (estado) => {
    setCargandoReversiones(true);
    setErrorReversiones('');
    try {
      const res = await api.get('/conciliacion/reversiones', { params: { estado } });
      setReversiones(res.data.data || []);
      setLimitadoReversiones(Boolean(res.data.limitado));
      setTotalPendientes(res.data.total_pendientes ?? null);
    } catch (err) {
      setErrorReversiones(err.response?.data?.message || 'No se pudieron cargar las reversiones.');
    } finally {
      setCargandoReversiones(false);
    }
  }, []);

  useEffect(() => {
    cargarDepositos(aplicados);
  }, [cargarDepositos, aplicados]);
  useEffect(() => {
    cargarReversiones(estadoReversiones);
  }, [cargarReversiones, estadoReversiones]);

  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const hayFiltros = Object.values(aplicados).some(Boolean);
  const porConciliar = resumen
    ? resumen.filter((r) => ['PENDIENTE', 'SIN_CONFIRMAR'].includes(r.estado)).reduce((total, r) => total + r.cantidad, 0)
    : null;
  const acreditados = resumen?.find((r) => r.estado === 'ACREDITADO');
  const recargando = cargandoDepositos || cargandoReversiones;

  const buscar = (e) => {
    e.preventDefault();
    if (rangoInvalido) return;
    setAplicados({ ...filtros });
  };
  const limpiarFiltros = () => {
    setFiltros(SIN_FILTROS);
    setAplicados(SIN_FILTROS);
  };

  // Tras una acción la tabla se recarga sin desaparecer y el foco vuelve a ella (el botón de la fila se va)
  const verificar = async (referencia) => {
    setVerificando(referencia);
    try {
      const res = await api.post(`/conciliacion/depositos/${encodeURIComponent(referencia)}/verificar`);
      toast.success(res.data.message, 'Depósito conciliado', 8000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo conciliar el depósito. Intente de nuevo.', 'No se pudo conciliar', 10000);
    } finally {
      setVerificando(null);
      await cargarDepositos(aplicados);
      regionDepositos.current?.focus();
    }
  };

  const reintentar = async () => {
    if (!porReintentar) return;
    setReintentando(true);
    try {
      const res = await api.post(`/conciliacion/reversiones/${porReintentar.id_reversion}/reintentar`);
      toast.success(res.data.message, res.data.data?.estado === 'DESCARTADA' ? 'Reversión descartada' : 'Reversión hecha', 8000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo hacer la reversión. Intente de nuevo.', 'No se pudo revertir', 10000);
    } finally {
      setReintentando(false);
      setPorReintentar(null);
      await cargarReversiones(estadoReversiones);
      regionReversiones.current?.focus();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Conciliación con el banco"
        description="Depósitos en ventanilla a cuentas del banco y reversiones que quedaron por hacer."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={recargando}
            loadingText="Actualizando…"
            onClick={() => {
              cargarDepositos(aplicados);
              cargarReversiones(estadoReversiones);
            }}
          >
            Actualizar
          </Button>
        }
      />

      <StatGroup columns={3}>
        <StatCard
          label="Depósitos por conciliar"
          value={porConciliar ?? '—'}
          hint="Pendientes o sin confirmar, desde el inicio"
          hintTone={porConciliar ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Reversiones pendientes"
          value={totalPendientes ?? '—'}
          hint="Dinero movido en el banco sin registro"
          hintTone={totalPendientes ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Depósitos acreditados"
          value={resumen ? formatQ(acreditados?.monto || 0) : '—'}
          hint={resumen ? `${acreditados?.cantidad || 0} depósitos desde el inicio` : undefined}
        />
      </StatGroup>

      <Card>
        <div className="px-5 pt-4">
          <Tabs
            label="Qué conciliar"
            idPrefix={TABS_ID}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'depositos', label: 'Depósitos en ventanilla', count: porConciliar ?? undefined, attention: Boolean(porConciliar) },
              { id: 'reversiones', label: 'Reversiones', count: totalPendientes ?? undefined, attention: Boolean(totalPendientes) },
            ]}
          />
        </div>

        <TabPanel id={tab} idPrefix={TABS_ID} className="space-y-4 p-5">
          {tab === 'depositos' && (
            <>
              <p className="text-sm text-ink-muted">
                «Pendiente» es un depósito que se registró y todavía no tiene respuesta del banco; «Sin confirmar», uno al
                que el banco no respondió a tiempo. «Verificar y cerrar» consulta el banco por la referencia y lo deja
                acreditado o rechazado a su nombre.
              </p>

              <form onSubmit={buscar} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_11rem_10rem_10rem_auto] xl:items-end" role="search">
                <div className="sm:col-span-2 xl:col-span-1">
                  <SearchInput
                    value={filtros.texto}
                    onChange={(texto) => setFiltros((f) => ({ ...f, texto }))}
                    label="Buscar depósitos"
                    placeholder="DPI, cuenta, referencia u operador (código o nombre)"
                    className="w-full"
                  />
                </div>
                <Select
                  value={filtros.estado}
                  onChange={(e) => {
                    const estado = e.target.value;
                    setFiltros((f) => ({ ...f, estado }));
                    setAplicados((a) => ({ ...a, estado }));
                  }}
                  aria-label="Filtrar por estado"
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(ESTADO_DEPOSITO).map(([valor, { label }]) => (
                    <option key={valor} value={valor}>{label}</option>
                  ))}
                </Select>
                <Field label="Desde">
                  <Input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
                </Field>
                <Field label="Hasta" error={rangoInvalido ? 'Es anterior a «Desde».' : undefined}>
                  <Input
                    type="date"
                    min={filtros.desde || undefined}
                    value={filtros.hasta}
                    onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" disabled={rangoInvalido}>Buscar</Button>
                  {hayFiltros && <Button variant="ghost" onClick={limpiarFiltros}>Limpiar filtros</Button>}
                </div>
              </form>

              <div ref={regionDepositos} tabIndex={-1} className="focus:outline-none">
                {errorDepositos ? (
                  <Alert tone="danger" title="No se pudieron cargar los depósitos">
                    <p>Revise su conexión e intente de nuevo.</p>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => cargarDepositos(aplicados)}>Reintentar</Button>
                  </Alert>
                ) : depositos === null ? (
                  <LoadingState label="Cargando depósitos…" />
                ) : depositos.length === 0 ? (
                  <EmptyState
                    icon={SearchCheck}
                    title={hayFiltros ? 'Sin resultados' : 'No hay depósitos'}
                    description={hayFiltros
                      ? 'Revise el DPI, la cuenta o la referencia, o cambie el estado o las fechas.'
                      : 'Los depósitos en ventanilla a cuentas del banco aparecerán aquí.'}
                  />
                ) : (
                  <>
                    <Table caption="Depósitos en ventanilla a cuentas del banco">
                      <THead>
                        <TR>
                          <TH>Fecha y referencia</TH>
                          <TH>Operador</TH>
                          <TH>Colaborador y cuenta</TH>
                          <TH numeric>Monto</TH>
                          <TH>Estado</TH>
                          <TH sticky><span className="sr-only">Acciones</span></TH>
                        </TR>
                      </THead>
                      <TBody>
                        {depositos.map((d) => {
                          const estado = ESTADO_DEPOSITO[d.estado] || { label: humanize(d.estado), tone: 'neutral' };
                          const abierto = ['PENDIENTE', 'SIN_CONFIRMAR'].includes(d.estado);
                          return (
                            <TR key={d.referencia}>
                              <TD className="whitespace-nowrap">
                                <div className="text-ink">{formatDateTime(d.fecha_deposito)}</div>
                                <div className="font-mono text-xs text-ink-soft">{d.referencia}</div>
                              </TD>
                              <TD className="whitespace-nowrap">
                                <div className="text-ink">{d.operador_nombre}</div>
                                <div className="font-mono text-xs text-ink-subtle">{d.operador_codigo}</div>
                              </TD>
                              <TD className="whitespace-nowrap">
                                <div className="font-mono text-ink">{d.titular_cui}</div>
                                <div className="font-mono text-xs text-ink-subtle">{d.numero_cuenta_bancaria}</div>
                              </TD>
                              <TD numeric className="font-medium text-ink">{formatQ(d.monto)}</TD>
                              <TD className="whitespace-nowrap">
                                <Badge tone={estado.tone}>{estado.label}</Badge>
                                {d.concilia_codigo && (
                                  <div className="mt-1 text-xs text-ink-subtle">
                                    Concilió {d.concilia_codigo}{d.fecha_conciliacion ? ` · ${formatDateTime(d.fecha_conciliacion)}` : ''}
                                  </div>
                                )}
                              </TD>
                              <TD sticky className="whitespace-nowrap text-right">
                                {abierto && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={SearchCheck}
                                    loading={verificando === d.referencia}
                                    loadingText="Consultando…"
                                    disabled={Boolean(verificando)}
                                    onClick={() => verificar(d.referencia)}
                                    aria-label={`Verificar y cerrar el depósito ${d.referencia}`}
                                  >
                                    <span className="hidden sm:inline">Verificar y cerrar</span>
                                  </Button>
                                )}
                              </TD>
                            </TR>
                          );
                        })}
                      </TBody>
                    </Table>
                    {limitadoDepositos && (
                      <p className="mt-3 text-sm text-ink-muted">Se muestran los 200 más recientes. Use los filtros para ver otros.</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'reversiones' && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-muted">
                  Movimientos del banco cuya operación no quedó registrada en la cooperativa. Antes de revertir se confirma que
                  la operación no quedó hecha y que el banco tiene el movimiento; el banco no repite una reversión ya hecha.
                </p>
                <Select
                  value={estadoReversiones}
                  onChange={(e) => setEstadoReversiones(e.target.value)}
                  aria-label="Filtrar reversiones por estado"
                  className="sm:w-44"
                >
                  <option value="PENDIENTE">Pendientes</option>
                  <option value="CERRADA">Cerradas</option>
                </Select>
              </div>

              <div ref={regionReversiones} tabIndex={-1} className="focus:outline-none">
                {errorReversiones ? (
                  <Alert tone="danger" title="No se pudieron cargar las reversiones">
                    <p>Revise su conexión e intente de nuevo.</p>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => cargarReversiones(estadoReversiones)}>Reintentar</Button>
                  </Alert>
                ) : reversiones === null ? (
                  <LoadingState label="Cargando reversiones…" />
                ) : reversiones.length === 0 ? (
                  <EmptyState
                    icon={RotateCcw}
                    title={estadoReversiones === 'PENDIENTE' ? 'No hay reversiones pendientes' : 'No hay reversiones cerradas'}
                    description="Si una operación con el banco no se completa y no se puede revertir, aparecerá aquí."
                  />
                ) : (
                  <>
                    <Table caption="Reversiones con el banco">
                      <THead>
                        <TR>
                          <TH>Fecha</TH>
                          <TH>Operación</TH>
                          <TH>{estadoReversiones === 'PENDIENTE' ? 'Qué hay que hacer' : 'Qué se hizo'}</TH>
                          <TH numeric>Monto</TH>
                          <TH>Referencia</TH>
                          <TH sticky><span className="sr-only">Acciones</span></TH>
                        </TR>
                      </THead>
                      <TBody>
                        {reversiones.map((r) => (
                          <TR key={r.id_reversion}>
                            <TD className="whitespace-nowrap">{formatDateTime(r.fecha_registro)}</TD>
                            <TD className="min-w-[12rem]">
                              <div className="text-ink">{ORIGEN_REVERSION[r.origen] || humanize(r.origen)}</div>
                              {r.detalle && <div className="text-xs text-ink-subtle">{r.detalle}</div>}
                            </TD>
                            <TD className="whitespace-nowrap">
                              <div className="text-ink">{accionReversion(r)}</div>
                              {/* Sin cuenta: una apertura que el banco no confirmó; se toma del movimiento al hacerla */}
                              <div className={cn('text-xs text-ink-subtle', r.numero_cuenta_bancaria && 'font-mono')}>
                                {r.numero_cuenta_bancaria || 'Cuenta por confirmar con el banco'}
                              </div>
                            </TD>
                            <TD numeric className="font-medium text-ink">{formatQ(r.monto)}</TD>
                            <TD className="whitespace-nowrap font-mono text-xs text-ink-soft">{r.referencia_reversion}</TD>
                            <TD sticky className="whitespace-nowrap text-right">
                              {r.estado === 'PENDIENTE' ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={RotateCcw}
                                  disabled={reintentando}
                                  onClick={() => setPorReintentar(r)}
                                  aria-label={`Hacer la reversión ${r.referencia_reversion}`}
                                >
                                  <span className="hidden sm:inline">Hacer la reversión</span>
                                </Button>
                              ) : (
                                <span className="text-xs text-ink-subtle">
                                  {r.fecha_resolucion ? formatDateTime(r.fecha_resolucion) : 'Cerrada'}
                                  {` · ${r.resuelve_codigo || 'Automática'}`}
                                </span>
                              )}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                    {limitadoReversiones && (
                      <p className="mt-3 text-sm text-ink-muted">Se muestran las 200 más recientes.</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </TabPanel>
      </Card>

      <ConfirmModal
        isOpen={Boolean(porReintentar)}
        onClose={() => !reintentando && setPorReintentar(null)}
        onConfirm={reintentar}
        title="Hacer la reversión en el banco"
        subtitle={porReintentar?.referencia_reversion}
        message={porReintentar
          ? `Se pedirá al banco ${porReintentar.tipo_movimiento === 'DEBITO' ? 'retirar' : 'devolver'} ${formatQ(porReintentar.monto)} ${porReintentar.tipo_movimiento === 'DEBITO' ? 'de' : 'a'} ${porReintentar.numero_cuenta_bancaria ? `la cuenta ${porReintentar.numero_cuenta_bancaria}` : 'la cuenta del movimiento original'}.`
          : ''}
        details={porReintentar ? [
          { label: 'Operación', value: ORIGEN_REVERSION[porReintentar.origen] || humanize(porReintentar.origen) },
          { label: 'Monto', value: formatQ(porReintentar.monto), highlight: true },
        ] : []}
        note="Antes se confirma que la operación no quedó registrada y que el banco tiene el movimiento; si no, se descarta sin mover dinero. Si el banco ya la había hecho, no se repite."
        confirmText="Hacer la reversión"
        variant="warning"
        loading={reintentando}
      />
    </div>
  );
};

export default ConciliacionPage;
