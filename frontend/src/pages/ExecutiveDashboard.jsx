import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Button, Card, PageHeader, SearchInput, TabPanel, Tabs } from '../components/ui';
import { ExecutiveCreditsTable } from '../components/executive/ExecutiveCreditsTable';
import { ExecutiveResolutionModal } from '../components/executive/ExecutiveResolutionModal';
import { formatQ } from '../utils/format';

const TABS_ID = 'ejecutivo';

export const ExecutiveDashboard = () => {
  const { user } = useAuth();
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
      setFileError('Solo se admiten documentos en formato PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError('El tamaño del PDF no debe exceder 10 MB.');
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
      setFileError('Error al leer el archivo PDF seleccionado.');
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

  const fetchCreditos = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ejecutivo/creditos');
      if (res.data?.success) {
        setCreditos(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar créditos ejecutivos:', err);
      toast.error('No se pudieron obtener las solicitudes de crédito.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditos();
  }, []);

  // Contadores de métricas
  const pendientesCount = useMemo(
    () => creditos.filter((c) => c.estado === 'EN_AUTORIZACION_EJECUTIVO').length,
    [creditos]
  );
  const aprobadasCount = useMemo(
    () => creditos.filter((c) => c.estado === 'APROBADA' || c.estado === 'APROBADO' || c.estado === 'DESEMBOLSADA').length,
    [creditos]
  );
  const devueltasCount = useMemo(
    () => creditos.filter((c) => c.estado === 'DEVUELTA_OPERADOR').length,
    [creditos]
  );
  const denegadasCount = useMemo(
    () => creditos.filter((c) => c.estado === 'DENEGADA' || c.estado === 'RECHAZADA').length,
    [creditos]
  );

  // Filtrado de la lista
  const filteredCreditos = useMemo(() => {
    return creditos.filter((c) => {
      // Filtro por pestaña
      if (activeFilterTab === 'PENDIENTES' && c.estado !== 'EN_AUTORIZACION_EJECUTIVO') return false;
      if (activeFilterTab === 'APROBADAS' && !['APROBADA', 'APROBADO', 'DESEMBOLSADA'].includes(c.estado)) return false;
      if (activeFilterTab === 'DEVUELTAS' && c.estado !== 'DEVUELTA_OPERADOR') return false;
      if (activeFilterTab === 'DENEGADAS' && !['DENEGADA', 'RECHAZADA'].includes(c.estado)) return false;

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
      toast.error('Es obligatorio subir el documento PDF firmado por la Gerencia Ejecutiva para autorizar y desembolsar la solicitud.');
      return;
    }

    if (accion === 'DEVOLVER' && !observaciones.trim()) {
      toast.error('Para devolver la solicitud al Operador, debe ingresar obligatoriamente las observaciones o motivo de devolución.');
      return;
    }

    if (accion === 'DENEGAR' && !observaciones.trim()) {
      toast.error('Para denegar formalmente la solicitud, debe ingresar obligatoriamente la justificación del rechazo.');
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
        toast.success(res.data.message || 'Resolución ejecutiva registrada correctamente.');
        closeResolverModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al resolver crédito:', err);
      toast.error(err.response?.data?.message || 'Error al procesar la resolución de la solicitud.');
    } finally {
      setResolving(false);
    }
  };

  const getStatusBadge = (estado) => {
    switch (estado) {
      case 'EN_AUTORIZACION_EJECUTIVO':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
            Pendiente Autorización
          </span>
        );
      case 'DEVUELTA_OPERADOR':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning-50 text-warning-700 border border-warning-200">
            Devuelta a Operador
          </span>
        );
      case 'APROBADA':
      case 'APROBADO':
      case 'DESEMBOLSADA':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
            Aprobada y Desembolsada
          </span>
        );
      case 'DENEGADA':
      case 'RECHAZADA':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-50 text-danger-700 border border-danger-200">
            Denegada
          </span>
        );
      case 'EN_REVISION_OPERADOR':
      case 'PENDIENTE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            En Revisión Operador
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {estado}
          </span>
        );
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

  const resumen = loading
    ? 'Cargando solicitudes…'
    : pendientesCount === 0
    ? 'No hay solicitudes esperando su autorización.'
    : `${pendientesCount} ${pendientesCount === 1 ? 'solicitud espera' : 'solicitudes esperan'} su autorización, por ${formatQ(montoPendiente)} en total.`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Autorización de créditos"
        description={resumen}
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
            hasFilters={Boolean(searchQuery.trim()) || activeFilterTab !== 'PENDIENTES'}
            onOpen={openResolverModal}
          />
        </TabPanel>
      </Card>

      <ExecutiveResolutionModal
        selectedCredito={selectedCredito}
        getStatusBadge={getStatusBadge}
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
