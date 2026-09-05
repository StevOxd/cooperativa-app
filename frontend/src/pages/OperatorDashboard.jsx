import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Inbox,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  X,
  FileText,
  Clock,
  RefreshCw,
  Send,
  Building2,
  ShieldAlert,
} from 'lucide-react';

export const OperatorDashboard = () => {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estados del modal resolutivo
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [actionType, setActionType] = useState(''); // 'APROBAR' o 'RECHAZAR'
  const [observaciones, setObservaciones] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await api.get('/operador/bandeja-solicitudes');
      if (response.data?.success) {
        setSolicitudes(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar bandeja de operador:', err);
      setErrorMessage('No se pudo conectar con el servidor para obtener los casos pendientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const openResolverModal = (sol, type) => {
    setSelectedSolicitud(sol);
    setActionType(type);
    setObservaciones(type === 'APROBAR' ? 'Traslado de fondos aprobado y procesado.' : '');
  };

  const closeResolverModal = () => {
    setSelectedSolicitud(null);
    setActionType('');
    setObservaciones('');
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setResolving(true);

    try {
      const response = await api.post(`/operador/solicitudes/${selectedSolicitud.id_solicitud}/resolver`, {
        accion: actionType,
        observaciones: observaciones,
      });

      if (response.data?.success) {
        setSuccessMessage(`El caso ${selectedSolicitud.numero_caso} ha sido ${actionType === 'APROBAR' ? 'aprobado y procesado' : 'rechazado'} correctamente.`);
        closeResolverModal();
        fetchSolicitudes();
      }
    } catch (err) {
      console.error('Error al resolver caso:', err);
      setErrorMessage(err.response?.data?.message || 'Ocurrió un error al intentar resolver el caso.');
      closeResolverModal();
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado del Operador */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest block mb-1">
            Bandeja de Operaciones
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Gestión de Casos de Traslado y Aperturas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Operador de sesión: <span className="font-semibold text-slate-800">{user?.nombre_completo || user?.nombre}</span>
          </p>
        </div>
        <button
          onClick={fetchSolicitudes}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refrescar Bandeja</span>
        </button>
      </div>

      {/* Alertas */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-red-600 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Listado de Casos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
          <Inbox className="w-5 h-5 text-slate-500" />
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
            Casos Pendientes de Aprobación ({solicitudes.length})
          </h2>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
            <p className="text-xs font-semibold">Cargando bandeja operativa...</p>
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="py-24 text-center text-slate-400">
            <CheckCircle className="w-16 h-16 text-slate-200 mx-auto mb-2" />
            <p className="font-semibold text-slate-600">¡Bandeja vacía!</p>
            <p className="text-xs text-slate-400">No hay traslados de planilla o aperturas pendientes de revisión.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Número de Caso</th>
                  <th className="px-6 py-3 font-semibold">Asociado</th>
                  <th className="px-6 py-3 font-semibold text-right">Monto</th>
                  <th className="px-6 py-3 font-semibold">Operación / Destino</th>
                  <th className="px-6 py-3 font-semibold">Origen / Saldo</th>
                  <th className="px-6 py-3 font-semibold">Fecha Recepción</th>
                  <th className="px-6 py-3 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {solicitudes.map((s) => (
                  <tr key={s.id_solicitud} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-mono font-bold text-slate-850">
                      {s.numero_caso}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold block text-slate-900">
                        {s.primer_nombre} {s.primer_apellido}
                      </span>
                      <span className="text-xs text-slate-500">ID Asociado: {s.id_asociado}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                      Q{parseFloat(s.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="font-semibold block text-slate-700">
                        {s.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado Directo' : 'Apertura y Traslado'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        Tipo Destino: {s.tipo_cuenta_destino_nombre}
                      </span>
                      {s.cuenta_destino_numero && (
                        <span className="text-[10px] text-emerald-700 font-mono">
                          Cta Destino: {s.cuenta_destino_numero}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      <span className="font-mono block">{s.cuenta_origen_numero}</span>
                      <span className="block mt-0.5">Saldo Planilla: Q{parseFloat(s.cuenta_origen_saldo).toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(s.fecha_solicitud).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => openResolverModal(s, 'APROBAR')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => openResolverModal(s, 'RECHAZAR')}
                          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition-colors cursor-pointer"
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Confirmación Resolutiva */}
      {selectedSolicitud && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <ShieldAlert className={`w-5 h-5 ${actionType === 'APROBAR' ? 'text-emerald-600' : 'text-red-650'}`} />
                <span>Confirmar Acción de Operador</span>
              </h3>
              <button
                onClick={closeResolverModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-600 mb-6">
              <p>
                ¿Está seguro de que desea <strong className={actionType === 'APROBAR' ? 'text-emerald-700' : 'text-red-700'}>
                  {actionType === 'APROBAR' ? 'APROBAR' : 'RECHAZAR'}
                </strong> la solicitud de traslado del asociado <strong>{selectedSolicitud.primer_nombre} {selectedSolicitud.primer_apellido}</strong>?
              </p>

              <div className="p-3.5 bg-slate-50 border rounded-xl space-y-1.5 text-xs text-slate-700 font-mono">
                <div>Caso: <strong>{selectedSolicitud.numero_caso}</strong></div>
                <div>Monto: <strong>Q{parseFloat(selectedSolicitud.monto).toFixed(2)}</strong></div>
                <div>Operación: <strong>{selectedSolicitud.tipo_operacion}</strong></div>
                {selectedSolicitud.cuenta_destino_numero && (
                  <div>Cuenta Destino: <strong>{selectedSolicitud.cuenta_destino_numero}</strong></div>
                )}
              </div>

              <form onSubmit={handleResolveSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-750 uppercase tracking-wider mb-2">
                    Observaciones / Comentario de la Resolución
                  </label>
                  <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder={actionType === 'APROBAR' ? 'Comentario de aprobación...' : 'Escriba el motivo detallado del rechazo...'}
                    required={actionType === 'RECHAZAR'}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeResolverModal}
                    className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={resolving}
                    className={`px-5 py-2 text-white rounded-xl text-sm font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer ${
                      actionType === 'APROBAR' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'
                    }`}
                  >
                    {resolving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>{actionType === 'APROBAR' ? 'Aprobar Caso' : 'Rechazar Caso'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;
