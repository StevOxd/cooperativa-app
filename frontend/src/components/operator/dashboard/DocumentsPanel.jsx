import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileSearch, RefreshCw, SearchCheck } from 'lucide-react';
import api from '../../../services/api';
import {
  Alert, Badge, Button, EmptyState, LoadingState, SearchInput, Table, TBody, TD, TH, THead, TR, cn,
} from '../../ui';
import { DocumentViewerModal } from '../../documents';
import { formatDateTime, formatRelative } from '../../../utils/format';
import { CANAL_CARGA, ESTADO_DOCUMENTO, etiquetaDocumento, formatoTamano } from '../../../utils/documentos';

const POR_PAGINA = 50;

const FILTROS = [
  { id: 'PENDIENTE', label: 'Por revisar' },
  { id: 'RECHAZADO', label: 'Rechazados' },
  { id: 'ACEPTADO', label: 'Aceptados' },
  { id: 'TODOS', label: 'Todos' },
];

// En la bandeja, un pendiente se lee «Por revisar», igual que su filtro
const ESTADOS_BANDEJA = { ...ESTADO_DOCUMENTO, PENDIENTE: { ...ESTADO_DOCUMENTO.PENDIENTE, label: 'Por revisar' } };

const VACIO = {
  PENDIENTE: {
    title: 'No hay documentos por revisar',
    description: 'Aquí llegan los que suben los asociados desde su portal y los que se escanean en ventanilla.',
  },
  RECHAZADO: { title: 'No hay documentos rechazados', description: 'Los rechazados esperan a que el asociado suba otra copia.' },
  ACEPTADO: { title: 'Todavía no hay documentos aceptados' },
  TODOS: {
    title: 'Todavía no hay documentos',
    description: 'Para escanear los de un asociado, ábralo desde Asociados y use la sección Documentos de su expediente.',
  },
};

/**
 * Por qué este operador no puede revisar un documento: es suyo o lo subió él (lo revisa un colega).
 *
 * @param {Object} d - Fila de la bandeja.
 * @returns {string|null}
 */
const porQueNoRevisa = (d) => {
  if (d.es_propio) return 'Es un documento suyo: lo revisa un colega.';
  if (d.cargado_por_mi) return 'Usted lo subió: lo revisa un colega.';
  return null;
};

/**
 * Pestaña «Documentos» del operador: documentos de afiliación para aceptar o rechazar. Nadie revisa los suyos ni los
 * que subió.
 *
 * @param {Object} props
 * @param {number} props.recarga - Cambia para volver a cargar (botón «Actualizar» de la bandeja).
 * @param {Function} [props.onCambio] - Después de una revisión, para actualizar el contador de la pestaña.
 */
export const DocumentsPanel = ({ recarga, onCambio }) => {
  const [filtro, setFiltro] = useState('PENDIENTE');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);
  // Solo la respuesta de la última consulta se muestra (una lenta de un filtro anterior se descarta)
  const ultimaConsulta = useRef(0);
  const consultaAnterior = useRef(null);

  // La búsqueda va al servidor después de una pausa al escribir
  useEffect(() => {
    const espera = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(espera);
  }, [busqueda]);

  const consultar = useCallback(
    (desde) => {
      const params = new URLSearchParams({ limit: String(POR_PAGINA), offset: String(desde) });
      if (filtro !== 'TODOS') params.set('estado', filtro);
      if (busquedaAplicada) params.set('search', busquedaAplicada);
      return api.get(`/operador/documentos?${params}`);
    },
    [filtro, busquedaAplicada]
  );

  const cargar = useCallback(async () => {
    const consulta = ++ultimaConsulta.current;
    setCargando(true);
    setError('');
    try {
      const res = await consultar(0);
      if (consulta !== ultimaConsulta.current) return;
      setDatos({ total: res.data.total, conteos: res.data.conteos, data: res.data.data });
    } catch (err) {
      if (consulta !== ultimaConsulta.current) return;
      setError(err.response?.data?.message || 'No se pudo cargar la bandeja de documentos.');
    } finally {
      if (consulta === ultimaConsulta.current) setCargando(false);
    }
  }, [consultar]);

  // Con otro filtro o búsqueda, la lista anterior ya no corresponde; al recargar la misma, se conserva mientras carga
  useEffect(() => {
    if (consultaAnterior.current !== consultar) {
      consultaAnterior.current = consultar;
      setDatos(null);
    }
    cargar();
  }, [cargar, consultar, recarga]);

  const cargarMas = async () => {
    const consulta = ultimaConsulta.current;
    setCargandoMas(true);
    try {
      const res = await consultar(datos.data.length);
      if (consulta !== ultimaConsulta.current) return;
      setDatos((d) => ({ ...d, total: res.data.total, data: [...d.data, ...res.data.data] }));
    } catch (err) {
      if (consulta === ultimaConsulta.current) setError(err.response?.data?.message || 'No se pudieron cargar más documentos.');
    } finally {
      setCargandoMas(false);
    }
  };

  const alRevisar = () => {
    cargar();
    onCambio?.();
  };

  const conteo = (id) => {
    if (!datos) return 0;
    if (id === 'TODOS') return Object.values(datos.conteos || {}).reduce((suma, n) => suma + n, 0);
    return datos.conteos?.[id] ?? 0;
  };

  const vacio = busquedaAplicada
    ? {
        title: 'Sin resultados',
        description: 'Revise el nombre, el DPI, el código del asociado o el número de caso.',
        action: <Button variant="secondary" onClick={() => setBusqueda('')}>Limpiar búsqueda</Button>,
      }
    : VACIO[filtro];

  const filas = datos?.data || [];
  // El indicador grande solo la primera vez (o tras un error): al recargar, la tabla se queda y se marca ocupada
  const primeraCarga = cargando && !datos;

  let contenido;
  if (primeraCarga) {
    contenido = <LoadingState label="Cargando documentos…" />;
  } else if (error && (!datos || filas.length === 0)) {
    contenido = (
      <Alert tone="danger" title="No se pudo cargar la bandeja">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {error}
          <Button size="sm" variant="link" icon={RefreshCw} className="px-0" onClick={cargar}>Intentar de nuevo</Button>
        </span>
      </Alert>
    );
  } else if (filas.length === 0) {
    contenido = (
      <EmptyState
        icon={filtro === 'PENDIENTE' && !busquedaAplicada ? SearchCheck : FileSearch}
        title={vacio.title}
        description={vacio.description}
        action={vacio.action || (filtro === 'TODOS' && <Button as={Link} to="/asociados" variant="secondary">Ir a Asociados</Button>)}
      />
    );
  } else {
    contenido = (
      <div aria-busy={cargando || undefined} className={cn('space-y-3 transition-opacity', cargando && 'opacity-60')}>
        <Table caption="Documentos de afiliación">
          <THead>
            <TR>
              <TH>Documento</TH>
              <TH>Titular</TH>
              <TH>Recibido</TH>
              <TH>Estado</TH>
              <TH sticky><span className="sr-only">Acciones</span></TH>
            </TR>
          </THead>
          <TBody>
            {filas.map((d) => {
              const estado = ESTADOS_BANDEJA[d.estado] || ESTADOS_BANDEJA.PENDIENTE;
              const revisable = d.estado === 'PENDIENTE' && !porQueNoRevisa(d);
              return (
                <TR key={d.id_documento} interactive>
                  <TD className="min-w-[11rem]">
                    <div className="font-medium text-ink">{etiquetaDocumento(d.tipo_documento)}</div>
                    <div className="text-xs text-ink-subtle">
                      {CANAL_CARGA[d.canal_carga] || d.canal_carga} · {formatoTamano(d.tamano_bytes)}
                      {d.cargado_por_mi && ' · lo subió usted'}
                    </div>
                  </TD>
                  <TD className="min-w-[12rem]">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {d.nombre}
                      {d.es_propio && <Badge>Suyo</Badge>}
                    </div>
                    <div className="font-mono text-xs text-ink-subtle">
                      {d.codigo_corporativo || (d.numero_caso ? `Caso ${d.numero_caso}` : `DPI ${d.cui_dpi}`)}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-sm" title={formatDateTime(d.fecha_carga)}>
                    {formatRelative(d.fecha_carga)}
                  </TD>
                  <TD className="max-w-[16rem]">
                    <Badge tone={estado.tone}>{estado.label}</Badge>
                    {d.revisado_por && (
                      <div className="mt-1 text-xs text-ink-subtle">por <span className="font-mono">{d.revisado_por}</span></div>
                    )}
                    {d.motivo_rechazo && (
                      <div className="mt-0.5 truncate text-xs text-ink-subtle" title={d.motivo_rechazo}>{d.motivo_rechazo}</div>
                    )}
                  </TD>
                  <TD sticky className="whitespace-nowrap text-right">
                    <Button
                      size="sm"
                      variant={revisable ? 'primary' : 'secondary'}
                      icon={revisable ? undefined : Eye}
                      onClick={() => setAbierto(d)}
                    >
                      {revisable ? 'Revisar' : 'Ver'}
                      <span className="sr-only"> {etiquetaDocumento(d.tipo_documento)} de {d.nombre}</span>
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {error && (
          <Alert tone="danger">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {error}
              <Button size="sm" variant="link" icon={RefreshCw} className="px-0" onClick={cargar}>Intentar de nuevo</Button>
            </span>
          </Alert>
        )}
        {filas.length < datos.total && (
          <div className="flex items-center justify-between gap-3 text-sm text-ink-muted">
            <span>Mostrando {filas.length} de {datos.total}</span>
            <Button size="sm" variant="secondary" onClick={cargarMas} loading={cargandoMas}>Cargar más</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar documentos por estado">
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={activo}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  activo
                    ? 'border-brand-700 bg-brand-50 font-medium text-brand-800'
                    : 'border-line-strong bg-white text-ink-soft hover:bg-surface-muted'
                )}
              >
                {f.label}
                <span className={cn('text-xs tabular-nums', activo ? 'text-brand-800' : 'text-ink-subtle')}>{conteo(f.id)}</span>
              </button>
            );
          })}
        </div>
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          label="Buscar documentos"
          placeholder="Nombre, DPI, código o caso"
          className="w-full lg:max-w-sm"
        />
      </div>

      {contenido}

      <DocumentViewerModal
        documento={abierto}
        titular={abierto?.nombre}
        puedeRevisar={Boolean(abierto && !porQueNoRevisa(abierto))}
        porQueNoRevisa={abierto ? porQueNoRevisa(abierto) : undefined}
        conHistorial
        onClose={() => setAbierto(null)}
        onRevisado={alRevisar}
      />
    </div>
  );
};

export default DocumentsPanel;
