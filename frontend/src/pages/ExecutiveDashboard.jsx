import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { Button, Card, PageHeader, SearchInput, StatCard, StatGroup, TabPanel, Tabs } from '../components/ui';
import { ExecutiveCreditsTable } from '../components/executive/ExecutiveCreditsTable';
import { ExecutiveResolutionModal } from '../components/executive/ExecutiveResolutionModal';
import { formatQ, formatRelative, horasDesde, megas } from '../utils/format';
import { ESTADOS_CREDITO_VIGENTES } from '../components/credit/creditProgress';
import { CONSTANTS } from '../config/constants';

// La pestaña «Denegadas» muestra también las que rechazó el operador; en lo resuelto por el ejecutivo solo cuenta DENEGADA
const DENEGADAS = ['DENEGADA', 'RECHAZADA'];

const esDeEsteMes = (fecha) => {
  if (!fecha) return false;
  const f = new Date(fecha);
  const hoy = new Date();
  return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
};

const TABS_ID = 'ejecutivo';

export const ExecutiveDashboard = () => {
  const { toast } = useToast();

  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState('PENDIENTES'); // 'PENDIENTES', 'APROBADAS', 'DEVUELTAS', 'DENEGADAS', 'TODAS'

  // Modal de Dictamen y Resolución
  const [selectedCredito, setSelectedCredito] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('documento'); // 'documento', 'scoring', 'transacciones'
  const [observaciones, setObservaciones] = useState('');
  const [loadingEvaluacion, setLoadingEvaluacion] = useState(false);
  const [evaluacionData, setEvaluacionData] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [archivoFirmado, setArchivoFirmado] = useState(null);
  const [fileError, setFileError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFileError('El archivo debe ser un PDF.');
      return;
    }

    if (file.size > CONSTANTS.ARCHIVOS.PDF_CREDITO_MAX_BYTES) {
      setFileError(`El PDF pesa ${megas(file.size)} MB; el máximo es 10 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setArchivoFirmado({
        file,
        name: file.name,
        size: file.size,
        base64: event.target.result,
      });
      setActiveModalTab('documento');
    };
    reader.onerror = () => {
      setFileError('No se pudo leer el PDF. Intente con otro archivo.');
    };
    reader.readAsDataURL(file);
  };

  // Bloqueo de scroll del body cuando el modal está abierto
  useEffect(() => {
    if (selectedCredito) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedCredito]);

  const fetchCreditos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/ejecutivo/creditos');
      if (res.data?.success) {
        setCreditos(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar créditos ejecutivos:', err);
      toast.error('No se pudieron cargar las solicitudes. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCreditos();
  }, [fetchCreditos]);

  // Contadores de métricas
  const pendientesCount = useMemo(
    () => creditos.filter((c) => c.estado === 'EN_AUTORIZACION_EJECUTIVO').length,
    [creditos]
  );
  const aprobadasCount = useMemo(
    () => creditos.filter((c) => ESTADOS_CREDITO_VIGENTES.includes(c.estado)).length,
    [creditos]
  );
  const devueltasCount = useMemo(
    () => creditos.filter((c) => c.estado === 'DEVUELTA_OPERADOR').length,
    [creditos]
  );
  const denegadasCount = useMemo(
    () => creditos.filter((c) => DENEGADAS.includes(c.estado)).length,
    [creditos]
  );

  // Filtrado de la lista
  const filteredCreditos = useMemo(() => {
    return creditos.filter((c) => {
      // Filtro por pestaña
      if (activeFilterTab === 'PENDIENTES' && c.estado !== 'EN_AUTORIZACION_EJECUTIVO') return false;
      if (activeFilterTab === 'APROBADAS' && !ESTADOS_CREDITO_VIGENTES.includes(c.estado)) return false;
      if (activeFilterTab === 'DEVUELTAS' && c.estado !== 'DEVUELTA_OPERADOR') return false;
      if (activeFilterTab === 'DENEGADAS' && !DENEGADAS.includes(c.estado)) return false;

      // Filtro por búsqueda
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nombreCompleto = `${c.primer_nombre || ''} ${c.segundo_nombre || ''} ${c.primer_apellido || ''} ${c.segundo_apellido || ''}`.toLowerCase();
      const dpi = (c.cui_dpi || '').toLowerCase();
      const codigo = (c.codigo_corporativo || '').toLowerCase();
      const id = String(c.id_solicitud_credito);

      return nombreCompleto.includes(q) || dpi.includes(q) || codigo.includes(q) || id.includes(q);
    });
  }, [creditos, activeFilterTab, searchQuery]);

  const openResolverModal = async (credito) => {
    setSelectedCredito(credito);
    setActiveModalTab(credito.documento_firmado_url ? 'documento' : 'scoring');
    setObservaciones('');
    setEvaluacionData(null);
    setArchivoFirmado(null);
    setFileError('');

    // Cargar evaluación crediticia en paralelo
    try {
      setLoadingEvaluacion(true);
      const res = await api.get(`/ejecutivo/creditos/${credito.id_solicitud_credito}/evaluacion`);
      if (res.data?.success) {
        setEvaluacionData(res.data.data.evaluacion);
      }
    } catch (err) {
      console.warn('Error cargando evaluación crediticia para ejecutivo:', err.message);
    } finally {
      setLoadingEvaluacion(false);
    }
  };

  const closeResolverModal = () => {
    setSelectedCredito(null);
    setObservaciones('');
    setEvaluacionData(null);
    setArchivoFirmado(null);
    setFileError('');
  };

  const handleResolver = async (accion) => {
    if (!selectedCredito) return;

    if (accion === 'ACEPTAR' && !archivoFirmado) {
      toast.error('Adjunte el PDF firmado por usted para aprobar la solicitud.');
      return;
    }

    if (accion === 'DEVOLVER' && !observaciones.trim()) {
      toast.error('Escriba qué debe corregir el operador para devolverle la solicitud.');
      return;
    }

    if (accion === 'DENEGAR' && !observaciones.trim()) {
      toast.error('Escriba el motivo para denegar la solicitud.');
      return;
    }

    setResolving(true);
    try {
      const payload = {
        accion,
        observaciones: observaciones.trim(),
      };
      if (archivoFirmado?.base64) {
        payload.documento_firmado = archivoFirmado.base64;
        payload.nombre_archivo_firmado = archivoFirmado.name;
      }

      const res = await api.post(`/ejecutivo/creditos/${selectedCredito.id_solicitud_credito}/resolver`, payload);

      if (res.data?.success) {
        toast.success(res.data.message || 'Resolución guardada.');
        closeResolverModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al resolver crédito:', err);
      toast.error(err.response?.data?.message || 'No se pudo guardar la resolución. Intente de nuevo.');
    } finally {
      setResolving(false);
    }
  };

  // Resumen para el encabezado: cuántas solicitudes esperan firma y por cuánto dinero.
  const montoPendiente = useMemo(
    () =>
      creditos
        .filter((c) => c.estado === 'EN_AUTORIZACION_EJECUTIVO')
        .reduce((sum, c) => sum + (parseFloat(c.monto_solicitado) || 0), 0),
    [creditos]
  );

  // La elevada hace más tiempo y lo resuelto en el mes (por la fecha de resolución del ejecutivo)
  const masAntigua = useMemo(
    () =>
      creditos
        .filter((c) => c.estado === 'EN_AUTORIZACION_EJECUTIVO')
        .reduce((min, c) => {
          const fecha = c.fecha_revision_operador || c.fecha_solicitud;
          return !min || new Date(fecha) < new Date(min.fecha) ? { fecha, id: c.id_solicitud_credito } : min;
        }, null),
    [creditos]
  );
  const resueltasMes = useMemo(() => {
    const delMes = creditos.filter((c) => esDeEsteMes(c.fecha_resolucion_ejecutivo));
    return {
      total: delMes.filter((c) => [...ESTADOS_CREDITO_VIGENTES, 'DENEGADA', 'DEVUELTA_OPERADOR'].includes(c.estado)).length,
      aprobadas: delMes.filter((c) => ESTADOS_CREDITO_VIGENTES.includes(c.estado)).length,
      devueltas: delMes.filter((c) => c.estado === 'DEVUELTA_OPERADOR').length,
      denegadas: delMes.filter((c) => c.estado === 'DENEGADA').length,
    };
  }, [creditos]);
  const esperaLarga = masAntigua && horasDesde(masAntigua.fecha) > 48;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Autorización de créditos"
        description="Solicitudes que los operadores elevaron, con su dictamen, para que usted las resuelva."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={fetchCreditos}
            disabled={loading}
            className={loading ? '[&>svg]:animate-spin' : undefined}
          >
            Actualizar
          </Button>
        }
      />

      <StatGroup columns={3}>
        <StatCard
          label="Por autorizar"
          value={loading ? '—' : pendientesCount}
          hint={!loading && (pendientesCount > 0 ? `${formatQ(montoPendiente)} en total` : 'Nada pendiente')}
        />
        <StatCard
          label="En espera desde"
          value={loading || !masAntigua ? '—' : formatRelative(masAntigua.fecha)}
          hint={!loading && (masAntigua ? `Solicitud #${masAntigua.id}${esperaLarga ? ' · más de dos días' : ''}` : 'No hay pendientes')}
          hintTone={esperaLarga ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Resueltas este mes"
          value={loading ? '—' : resueltasMes.total}
          hint={
            !loading &&
            [
              [resueltasMes.aprobadas, 'aprobada', 'aprobadas'],
              [resueltasMes.devueltas, 'devuelta', 'devueltas'],
              [resueltasMes.denegadas, 'denegada', 'denegadas'],
            ]
              .map(([n, una, varias]) => `${n} ${n === 1 ? una : varias}`)
              .join(' · ')
          }
        />
      </StatGroup>

      <Card>
        <div className="px-5 pt-4">
          <Tabs
            label="Filtrar solicitudes por estado"
            idPrefix={TABS_ID}
            value={activeFilterTab}
            onChange={setActiveFilterTab}
            items={[
              { id: 'PENDIENTES', label: 'Por autorizar', count: pendientesCount, attention: pendientesCount > 0 },
              { id: 'APROBADAS', label: 'Aprobadas', count: aprobadasCount },
              { id: 'DEVUELTAS', label: 'Devueltas', count: devueltasCount },
              { id: 'DENEGADAS', label: 'Denegadas', count: denegadasCount },
              { id: 'TODAS', label: 'Todas', count: creditos.length },
            ]}
          />
        </div>
        <div className="border-b border-line px-5 py-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            label="Buscar solicitudes"
            placeholder="Asociado, DPI o número"
            className="w-full sm:max-w-sm"
          />
        </div>

        <TabPanel id={activeFilterTab} idPrefix={TABS_ID}>
          <ExecutiveCreditsTable
            creditos={filteredCreditos}
            loading={loading}
            tab={activeFilterTab}
            search={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            onOpen={openResolverModal}
          />
        </TabPanel>
      </Card>

      <ExecutiveResolutionModal
        selectedCredito={selectedCredito}
        closeResolverModal={closeResolverModal}
        activeModalTab={activeModalTab}
        setActiveModalTab={setActiveModalTab}
        archivoFirmado={archivoFirmado}
        setArchivoFirmado={setArchivoFirmado}
        handleFileChange={handleFileChange}
        fileError={fileError}
        loadingEvaluacion={loadingEvaluacion}
        evaluacionData={evaluacionData}
        observaciones={observaciones}
        setObservaciones={setObservaciones}
        resolving={resolving}
        handleResolver={handleResolver}
      />
    </div>
  );
};

export default ExecutiveDashboard;
