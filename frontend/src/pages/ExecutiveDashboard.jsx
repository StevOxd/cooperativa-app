import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getSecureDocumentUrl } from '../utils/documentUrl';
import {
  ShieldCheck,
  FileText,
  CheckCircle,
  XCircle,
  RotateCcw,
  AlertCircle,
  Eye,
  Download,
  ExternalLink,
  Calendar,
  User,
  DollarSign,
  Building2,
  Loader2,
  RefreshCw,
  Search,
  Activity,
  X,
  FileCheck,
  AlertTriangle,
  Wallet,
  Check,
  UploadCloud,
  Paperclip,
  Trash2,
} from 'lucide-react';

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

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200">
        <div>
          <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block mb-1">
            Comité de Aprobaciones • Nivel Ejecutivo
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Building2 className="w-7 h-7 text-brand-600" />
            <span>Bandeja de Autorización Ejecutiva</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ejecutivo responsable: <span className="font-semibold text-slate-800">{user?.nombre_completo || user?.nombre}</span> • Acceso resolutivo de créditos
          </p>
        </div>

        <button
          onClick={fetchCreditos}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold border border-slate-200 transition-colors flex items-center space-x-2 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
          <span>Actualizar Casos</span>
        </button>
      </div>

      {/* Tarjetas de Métricas Ejecutivas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-brand-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pendientes Autorización</span>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{pendientesCount}</div>
          <p className="text-xs text-brand-700 mt-1 font-medium">Requieren resolución ejecutiva</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-brand-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Aprobados / Fondos</span>
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{aprobadasCount}</div>
          <p className="text-xs text-brand-700 mt-1 font-medium">Acreditados exitosamente</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-warning-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Devueltos a Operador</span>
            <RotateCcw className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{devueltasCount}</div>
          <p className="text-xs text-warning-700 mt-1 font-medium">En subsanación operativa</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-danger-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Denegados</span>
            <XCircle className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{denegadasCount}</div>
          <p className="text-xs text-danger-700 mt-1 font-medium">Rechazados formalmente</p>
        </div>
      </div>

      {/* Controles de Búsqueda y Pestañas */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Pestañas de Estado */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveFilterTab('PENDIENTES')}
              className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeFilterTab === 'PENDIENTES'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span>Pendientes</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs ${activeFilterTab === 'PENDIENTES' ? 'bg-brand-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {pendientesCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('APROBADAS')}
              className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeFilterTab === 'APROBADAS'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span>Aprobadas</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs ${activeFilterTab === 'APROBADAS' ? 'bg-brand-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {aprobadasCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('DEVUELTAS')}
              className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeFilterTab === 'DEVUELTAS'
                  ? 'bg-warning-600 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span>Devueltas</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs ${activeFilterTab === 'DEVUELTAS' ? 'bg-warning-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {devueltasCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('DENEGADAS')}
              className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                activeFilterTab === 'DENEGADAS'
                  ? 'bg-danger-600 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span>Denegadas</span>
              <span className={`px-1.5 py-0.2 rounded-full text-xs ${activeFilterTab === 'DENEGADAS' ? 'bg-danger-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {denegadasCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilterTab('TODAS')}
              className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeFilterTab === 'TODAS'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span>Todas ({creditos.length})</span>
            </button>
          </div>

          {/* Buscador */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por asociado, DPI o #..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Tabla de Solicitudes */}
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-2" />
            <p className="text-xs">Cargando solicitudes crediticias...</p>
          </div>
        ) : filteredCreditos.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No se encontraron solicitudes</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeFilterTab === 'PENDIENTES'
                ? 'No hay solicitudes pendientes de autorización ejecutiva en este momento.'
                : 'No hay registros que coincidan con los criterios seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Folio / Fecha</th>
                  <th className="px-4 py-3 font-semibold">Asociado Solicitante</th>
                  <th className="px-4 py-3 font-semibold text-right">Monto</th>
                  <th className="px-4 py-3 font-semibold text-center">Plazo</th>
                  <th className="px-4 py-3 font-semibold text-right">Cuota Mensual</th>
                  <th className="px-4 py-3 font-semibold">Dictamen Operativo</th>
                  <th className="px-4 py-3 font-semibold text-center">Expediente</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCreditos.map((c) => {
                  const nombre = `${c.primer_nombre || ''} ${c.primer_apellido || ''}`.trim() || 'Asociado';
                  const isPendiente = c.estado === 'EN_AUTORIZACION_EJECUTIVO';

                  return (
                    <tr key={c.id_solicitud_credito} className={`hover:bg-slate-50/70 transition-colors ${isPendiente ? 'bg-brand-50/30' : ''}`}>
                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-mono font-bold text-slate-900 block">
                          #{c.id_solicitud_credito}
                        </span>
                        <span className="text-slate-400 text-xs">
                          {new Date(c.fecha_solicitud).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs">
                        <span className="font-bold text-slate-900 block">{nombre}</span>
                        <div className="text-xs text-slate-500 font-mono flex items-center space-x-2">
                          <span>DPI: {c.cui_dpi || 'N/A'}</span>
                          <span>•</span>
                          <span>{c.codigo_corporativo}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right font-extrabold text-slate-900 text-xs">
                        Q{parseFloat(c.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs text-slate-700">
                        {c.plazo_meses} meses
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs font-bold text-brand-800">
                        Q{parseFloat(c.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3.5 text-xs max-w-xs">
                        {c.dictamen_operador ? (
                          <div>
                            <span className="text-slate-800 font-medium block truncate" title={c.dictamen_operador}>
                              "{c.dictamen_operador}"
                            </span>
                            <span className="text-xs text-slate-400">
                              Por {c.operador_revisa_nombre ? `${c.operador_revisa_nombre} ${c.operador_revisa_apellido || ''}` : 'Operador'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Sin dictamen registrado</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {c.documento_firmado_url ? (
                          <a
                            href={getSecureDocumentUrl(c.documento_firmado_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-2 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold border border-brand-200 transition-colors"
                            title="Ver documento firmado en pestaña nueva"
                          >
                            <FileCheck className="w-3.5 h-3.5 mr-1 text-brand-600" />
                            <span>PDF Firmado</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sin adjunto</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {getStatusBadge(c.estado)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {isPendiente ? (
                          <button
                            onClick={() => openResolverModal(c)}
                            className="px-3.5 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 mx-auto cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Dictaminar</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => openResolverModal(c)}
                            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition-colors mx-auto cursor-pointer"
                          >
                            <Eye className="w-3 h-3 inline mr-1 text-slate-500" />
                            <span>Expediente</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL DE DICTAMEN Y RESOLUCIÓN EJECUTIVA (3 BOTONES EXCLUSIVOS)   */}
      {/* ================================================================= */}
      {selectedCredito && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 overflow-y-auto">
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[92vh] flex flex-col shadow-lg border border-slate-200 relative my-auto animate-scaleUp overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolucion-ejecutiva-modal-title"
          >
            {/* Header del Modal */}
            <div className="flex justify-between items-start p-5 sm:p-6 pb-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 bg-brand-100 text-brand-800 rounded-lg">
                  <Building2 className="w-6 h-6" />
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 id="resolucion-ejecutiva-modal-title" className="text-lg font-bold text-slate-900">
                      Resolución Ejecutiva de Crédito #{selectedCredito.id_solicitud_credito}
                    </h3>
                    {getStatusBadge(selectedCredito.estado)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Solicitante: <span className="font-semibold text-slate-800">{selectedCredito.primer_nombre} {selectedCredito.primer_apellido}</span> (DPI: {selectedCredito.cui_dpi} • {selectedCredito.codigo_corporativo})
                  </p>
                </div>
              </div>

              <button
                onClick={closeResolverModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                title="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-banner con resumen financiero */}
            <div className="bg-brand-50/70 border-b border-brand-100 p-4 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Monto Solicitado:</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  Q{parseFloat(selectedCredito.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Plazo Amortización:</span>
                <span className="font-bold text-slate-900">{selectedCredito.plazo_meses} meses</span>
              </div>
              <div>
                <span className="text-slate-500 block">Cuota Mensual Estimada:</span>
                <span className="font-bold text-brand-900">
                  Q{parseFloat(selectedCredito.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Destino Desembolso:</span>
                <span className="font-semibold text-slate-800 truncate block" title={selectedCredito.cuenta_destino_info}>
                  {selectedCredito.cuenta_destino_info || 'Cuenta del Asociado'}
                </span>
              </div>
            </div>

            {/* Dictamen del Operador (Callout Destacado) */}
            {selectedCredito.dictamen_operador && (
              <div className="p-3.5 bg-warning-50/80 border-b border-warning-200/80 flex items-start space-x-3 text-xs text-warning-950 shrink-0">
                <AlertCircle className="w-4 h-4 text-warning-700 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-warning-900">
                    Dictamen Operativo Previo (Revisado por {selectedCredito.operador_revisa_nombre || 'Operador'}):
                  </span>
                  <p className="italic text-warning-900 mt-0.5">"{selectedCredito.dictamen_operador}"</p>
                </div>
              </div>
            )}

            {/* Pestañas de Navegación del Modal */}
            <div className="flex border-b border-slate-200 px-6 pt-3 bg-white shrink-0 space-x-6 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveModalTab('documento')}
                className={`pb-3 transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                  activeModalTab === 'documento'
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span>Formulario Firmado (PDF)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('scoring')}
                className={`pb-3 transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                  activeModalTab === 'scoring'
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Capacidad y Scoring Crediticio</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('transacciones')}
                className={`pb-3 transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                  activeModalTab === 'transacciones'
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Historial de Transacciones</span>
              </button>
            </div>

            {/* Contenido con Scroll del Modal */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* TAB 1: FORMULARIO FIRMADO POR EL ASOCIADO */}
              {activeModalTab === 'documento' && (
                <div className="space-y-4">
                  {/* Barra de Carga / Subida de PDF por Ejecutivo */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Subir Documento Firmado por Gerencia Ejecutiva (PDF) *
                      </span>
                      <span className="text-xs text-slate-500">
                        Descargue el documento remitido por el operador, aplique la firma ejecutiva y suba el archivo firmado aquí para poder Aceptar y Desembolsar.
                      </span>
                    </div>

                    <label className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto shrink-0">
                      <UploadCloud className="w-4 h-4" />
                      <span>{archivoFirmado ? 'Cambiar PDF Firmado' : 'Subir PDF Firmado por Ejecutivo'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {fileError && (
                    <div className="p-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg text-xs font-semibold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{fileError}</span>
                    </div>
                  )}

                  {/* Estado del Archivo Nuevo Seleccionado por Ejecutivo */}
                  {archivoFirmado && (
                    <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-between text-xs text-brand-900">
                      <div className="flex items-center space-x-2">
                        <FileCheck className="w-4 h-4 text-brand-600" />
                        <span className="font-bold">{archivoFirmado.name}</span>
                        <span className="text-brand-700">
                          ({(archivoFirmado.size / 1024).toFixed(1)} KB) • PDF firmado listo para autorizar y desembolsar
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArchivoFirmado(null)}
                        className="text-danger-500 hover:text-danger-700 font-bold flex items-center space-x-1 cursor-pointer"
                        title="Descartar este archivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>
                    </div>
                  )}

                  {/* Visualizador del PDF nuevo subido por Ejecutivo */}
                  {archivoFirmado ? (
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-2">
                        Vista previa del PDF firmado por la Gerencia Ejecutiva:
                      </span>
                      <div className="w-full h-96 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                        <iframe
                          src={archivoFirmado.base64}
                          title="Vista Previa de Formulario Firmado por Ejecutivo"
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  ) : selectedCredito.documento_firmado_url ? (
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg mb-3">
                        <div className="flex items-center space-x-2 text-xs text-slate-700">
                          <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-800 block">
                              Expediente remitido por Operador: {selectedCredito.nombre_archivo_firmado || 'formulario_firmado.pdf'}
                            </span>
                            {selectedCredito.peso_archivo_bytes && (
                              <span className="text-slate-400 text-xs">
                                ({(selectedCredito.peso_archivo_bytes / 1024).toFixed(1)} KB)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <a
                            href={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                            download={`Solicitud_Credito_${selectedCredito.id_solicitud_credito}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Descargar PDF para Firmar</span>
                          </a>
                          <a
                            href={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir en Pantalla Completa</span>
                          </a>
                        </div>
                      </div>

                      {/* Visualizador incrustado del PDF */}
                      <div className="w-full h-96 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                        <iframe
                          src={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                          title="Formulario Firmado Remitido por Operador"
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">Sin Formulario Remitido</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Esta solicitud no contiene un formulario PDF remitido previamente por el operador.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SCORING Y CAPACIDAD */}
              {activeModalTab === 'scoring' && (
                <div className="space-y-4">
                  {loadingEvaluacion ? (
                    <div className="p-8 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 text-brand-600 animate-spin mx-auto mb-2" />
                      <p className="text-xs">Cargando diagnóstico financiero y scoring...</p>
                    </div>
                  ) : evaluacionData ? (
                    <>
                      {/* Estado General del Scoring */}
                      <div className={`p-4 rounded-lg border flex items-center justify-between ${
                        evaluacionData.evaluacion.dictamen === 'APTO'
                          ? 'bg-brand-50/70 border-brand-200 text-brand-950'
                          : 'bg-warning-50/70 border-warning-200 text-warning-950'
                      }`}>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider block opacity-75">
                            Dictamen Automático del Motor de Riesgo
                          </span>
                          <span className="text-base font-extrabold block">
                            {evaluacionData.evaluacion.diagnostico}
                          </span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                          evaluacionData.evaluacion.dictamen === 'APTO'
                            ? 'bg-brand-600 text-white'
                            : 'bg-warning-600 text-white'
                        }`}>
                          {evaluacionData.evaluacion.dictamen}
                        </span>
                      </div>

                      {/* Verificaciones */}
                      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <span className="font-bold text-slate-700 uppercase tracking-wider block text-xs">
                          Verificaciones Automáticas de Solvencia:
                        </span>
                        {evaluacionData.analisisSolicitud.diagnosticos?.map((d, i) => (
                          <div key={i} className="flex items-start space-x-2 text-slate-700">
                            <span className="text-brand-600 font-bold">•</span>
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>

                      {/* Cuentas Bancarias y Cooperativas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border border-slate-200 bg-white">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-2">
                            Total en Cuentas Bancarias: Q{(Number(evaluacionData.solicitante.totalBanco) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <div className="space-y-1.5">
                            {evaluacionData.solicitante.cuentasBancarias?.map((cb) => (
                              <div key={cb.id_cuenta_bancaria} className="p-2 rounded-lg bg-slate-50 flex justify-between text-xs">
                                <span className="text-slate-700">{cb.tipo_cuenta} ({cb.numero_cuenta_bancaria})</span>
                                <span className="font-bold text-brand-800">Q{(Number(cb.saldo_disponible) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="p-4 rounded-lg border border-slate-200 bg-white">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-2">
                            Total en Cooperativa: Q{(Number(evaluacionData.solicitante.totalCoop) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <div className="space-y-1.5">
                            {evaluacionData.solicitante.cuentas?.map((c) => (
                              <div key={c.id_cuenta} className="p-2 rounded-lg bg-slate-50 flex justify-between text-xs">
                                <span className="text-slate-700">{c.tipo || c.tipo_cuenta || 'Cuenta Cooperativa'} ({c.numero_cuenta})</span>
                                <span className="font-bold text-brand-800">
                                  Q{(Number(c.saldo_disponible !== undefined ? c.saldo_disponible : (c.saldo || 0)) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No se pudo cargar la evaluación de scoring.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: HISTORIAL DE TRANSACCIONES */}
              {activeModalTab === 'transacciones' && (
                <div>
                  {evaluacionData?.transaccionesRecientes?.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Fecha</th>
                            <th className="px-3 py-2 font-semibold">Origen</th>
                            <th className="px-3 py-2 font-semibold text-center">Tipo</th>
                            <th className="px-3 py-2 font-semibold text-right">Monto</th>
                            <th className="px-3 py-2 font-semibold">Concepto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {evaluacionData.transaccionesRecientes.map((tx, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-slate-600">{new Date(tx.fecha).toLocaleDateString()}</td>
                              <td className="px-3 py-2 font-semibold text-slate-700">{tx.origen}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                                  (tx.tipo_movimiento || tx.tipo) === 'CREDITO'
                                    ? 'bg-brand-50 text-brand-800 border-brand-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {(tx.tipo_movimiento || tx.tipo) === 'CREDITO' ? 'CRÉDITO' : 'DÉBITO'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold">Q{parseFloat(tx.monto).toFixed(2)}</td>
                              <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{tx.descripcion}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                      No se registraron transacciones recientes.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer / Resolución Exclusiva del Ejecutivo */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 shrink-0">
              {selectedCredito.estado === 'EN_AUTORIZACION_EJECUTIVO' ? (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Observaciones / Dictamen de Resolución Ejecutiva <span className="text-warning-600 font-normal lowercase">(obligatorio para devolver o denegar)</span>
                    </label>
                    <textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Ingrese los comentarios del dictamen ejecutivo (Obligatorio en caso de Devolver o Denegar)..."
                      rows={2}
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white resize-none"
                    />
                  </div>

                  {/* Alerta si falta subir el PDF firmado por el Ejecutivo */}
                  {!archivoFirmado && (
                    <div className="flex items-start space-x-2.5 text-xs text-warning-900 bg-warning-50 px-3.5 py-2.5 rounded-lg border border-warning-300">
                      <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="block text-warning-950 font-bold">Firma Ejecutiva Obligatoria:</strong>
                        Para poder <strong>Aceptar y Desembolsar</strong> el crédito, la Gerencia Ejecutiva debe descargar el documento, firmarlo y subirlo en la pestaña <strong>"Formulario Firmado (PDF)"</strong> arriba.
                      </div>
                    </div>
                  )}

                  {archivoFirmado && (
                    <div className="flex items-center space-x-2 text-xs text-brand-800 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200">
                      <Paperclip className="w-3.5 h-3.5 text-brand-600" />
                      <span>
                        Se adjuntará resolución firmada: <strong>{archivoFirmado.name}</strong> ({(archivoFirmado.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeResolverModal}
                      className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-md text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>

                    {/* LOS TRES BOTONES EXCLUSIVOS DEL EJECUTIVO */}
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                      {/* 1. DENEGAR */}
                      <button
                        type="button"
                        disabled={resolving}
                        onClick={() => handleResolver('DENEGAR')}
                        className="flex-1 sm:flex-initial px-4 py-2.5 bg-danger-600 hover:bg-danger-700 text-white rounded-md text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title="Rechazar formal y definitivamente la solicitud (requiere comentario)"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Denegar</span>
                      </button>

                      {/* 2. DEVOLVER AL OPERADOR */}
                      <button
                        type="button"
                        disabled={resolving}
                        onClick={() => handleResolver('DEVOLVER')}
                        className="flex-1 sm:flex-initial px-4 py-2.5 bg-warning-500 hover:bg-warning-600 text-white rounded-md text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        title="Devolver al Operador para que revise o complete la documentación (requiere comentario)"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Devolver al Operador</span>
                      </button>

                      {/* 3. ACEPTAR */}
                      <button
                        type="button"
                        disabled={resolving || !archivoFirmado}
                        onClick={() => handleResolver('ACEPTAR')}
                        className="flex-1 sm:flex-initial px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!archivoFirmado ? 'Debe subir el documento PDF firmado por el Ejecutivo para autorizar' : 'Aprobar el crédito y desembolsar los fondos inmediatamente'}
                      >
                        {resolving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Procesando desembolso...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Aceptar y Desembolsar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    <p>
                      Estado actual: <strong>{selectedCredito.estado}</strong>
                      {selectedCredito.fecha_resolucion_ejecutivo && (
                        <span> • Resuelto el {new Date(selectedCredito.fecha_resolucion_ejecutivo).toLocaleDateString()}</span>
                      )}
                    </p>
                    {selectedCredito.observaciones_ejecutivo && (
                      <p className="text-slate-500 italic mt-0.5">
                        Resolución Ejecutiva: "{selectedCredito.observaciones_ejecutivo}"
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={closeResolverModal}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md font-bold cursor-pointer transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ExecutiveDashboard;
