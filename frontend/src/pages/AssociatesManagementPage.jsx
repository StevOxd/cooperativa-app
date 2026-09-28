import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Download,
  Eye,
  CreditCard,
  HeartHandshake,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  RefreshCw,
  Loader2,
  UserCheck,
  Ban,
  MoreVertical,
} from 'lucide-react';
import NewAssociateModal from '../components/associates/NewAssociateModal';
import OpenAccountModal from '../components/associates/OpenAccountModal';
import BeneficiariesModal from '../components/associates/BeneficiariesModal';
import AssociateExpedienteModal from '../components/associates/AssociateExpedienteModal';
import ConfirmModal from '../components/common/ConfirmModal';
import TableSkeleton from '../components/common/TableSkeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const AssociatesManagementPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const canCreateAssociate = user?.rol === 'OPERADOR';
  const [asociados, setAsociados] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados para Modales
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isOpenAccountModalOpen, setIsOpenAccountModalOpen] = useState(false);
  const [isBeneficiariesModalOpen, setIsBeneficiariesModalOpen] = useState(false);
  const [isExpedienteModalOpen, setIsExpedienteModalOpen] = useState(false);
  const [selectedAsociado, setSelectedAsociado] = useState(null);

  // Modal de Confirmación Estilizado (H-02)
  const [confirmModalData, setConfirmModalData] = useState({
    isOpen: false,
    asociado: null,
    nuevoEstado: '',
    loading: false,
  });

  const fetchAsociados = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/asociados', {
        params: {
          search,
          estado: estadoFilter,
          page,
          limit: 10,
        },
      });

      if (res.data?.success) {
        setAsociados(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Error al obtener padrón de asociados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAsociados(1);
  }, [estadoFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAsociados(1);
  };

  // Cambio de estado institucional mediante ConfirmModal (H-02)
  const promptToggleEstado = (asociado) => {
    const nuevoEstado = asociado.estado_asociado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    setConfirmModalData({
      isOpen: true,
      asociado,
      nuevoEstado,
      loading: false,
    });
  };

  const handleConfirmToggleEstado = async () => {
    const { asociado, nuevoEstado } = confirmModalData;
    if (!asociado) return;

    setConfirmModalData((prev) => ({ ...prev, loading: true }));
    try {
      const res = await api.patch(`/admin/asociados/${asociado.id_asociado}/estado`, {
        estado: nuevoEstado,
      });
      if (res.data?.success) {
        toast.success(`Estado de ${asociado.nombre_completo} actualizado a ${nuevoEstado}.`);
        fetchAsociados(pagination.page);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cambiar estado del asociado.');
    } finally {
      setConfirmModalData({
        isOpen: false,
        asociado: null,
        nuevoEstado: '',
        loading: false,
      });
    }
  };

  // Reporte 1.2: Exportación del Padrón General a CSV/Excel
  const handleExportCSV = () => {
    if (asociados.length === 0) return;

    const headers = [
      'ID Asociado',
      'CUI / DPI',
      'Nombre Completo',
      'Usuario',
      'Correo Electrónico',
      'Teléfono',
      'Cuentas Activas',
      'Saldo Total Disponible (Q)',
      'Aportaciones (Q)',
      'Estado',
      'Fecha Ingreso',
    ];

    const rows = asociados.map((a) => [
      a.id_asociado,
      `"${a.cui_dpi}"`,
      `"${a.nombre_completo}"`,
      a.codigo_corporativo || 'N/A',
      a.email || 'N/A',
      a.telefono || 'N/A',
      a.total_cuentas,
      a.saldo_total_disponible.toFixed(2),
      a.saldo_aportaciones.toFixed(2),
      a.estado_asociado,
      new Date(a.fecha_ingreso).toLocaleDateString('es-GT'),
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Padron_General_Asociados_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Métricas rápidas del padrón
  const totalActivos = asociados.filter((a) => a.estado_asociado === 'ACTIVO').length;

  return (
    <div className="space-y-6">
      {/* Header Institucional */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <span>Gestión de Asociados y Cuentas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Módulo 1: Padrón General de Asociados, Ficha de Afiliación, Aperturas y Beneficiarios
          </p>
        </div>

        {/* Acciones Superiores */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-2xs flex items-center space-x-2 transition-all cursor-pointer"
            title="Exportar Reporte 1.2 en CSV compatible con Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-brand-600" />
            <span>Exportar Padrón (CSV)</span>
          </button>

          {canCreateAssociate && (
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-2 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Nuevo Asociado (Ventanilla)</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Métricas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 block">Total en Padrón</span>
          <span className="text-2xl font-black text-slate-800 font-mono mt-1 block">
            {pagination.total}
          </span>
          <span className="text-xs text-brand-600 font-medium">Asociados registrados</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 block">Asociados Activos</span>
          <span className="text-2xl font-black text-brand-600 font-mono mt-1 block">
            {totalActivos}
          </span>
          <span className="text-xs text-slate-400 font-medium">En esta vista</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por DPI, Nombre, Usuario o Correo..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-brand-600"
            >
              <option value="">Todos los Estados</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
              <option value="SUSPENDIDO">Suspendidos</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Filtrar
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setEstadoFilter('');
                fetchAsociados(1);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="Restablecer filtros"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Tabla del Padrón General de Asociados */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Asociado / Titular</th>
                <th className="py-3.5 px-4">CUI / DPI</th>
                <th className="py-3.5 px-4">Usuario</th>
                <th className="py-3.5 px-4 text-center">Cuentas</th>
                <th className="py-3.5 px-4 text-right">Saldo Total</th>
                <th className="py-3.5 px-4 text-right">Aportaciones</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton rows={5} columns={8} />
            ) : (
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {asociados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No se encontraron asociados con los filtros especificados.
                    </td>
                  </tr>
                ) : (
                  asociados.map((a) => (
                    <tr key={a.id_asociado} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{a.nombre_completo}</div>
                        <div className="text-xs text-slate-400">
                          {a.email || 'Sin correo'} • Tel: {a.telefono || 'N/A'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                        {a.cui_dpi}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-700">
                        {a.codigo_corporativo || (
                          <span className="text-slate-400 font-normal">Sin cuenta</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {a.total_cuentas}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        Q{a.saldo_total_disponible.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-brand-600">
                        Q{a.saldo_aportaciones.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            a.estado_asociado === 'ACTIVO'
                              ? 'bg-brand-100 text-brand-800'
                              : a.estado_asociado === 'SUSPENDIDO'
                              ? 'bg-danger-100 text-danger-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {a.estado_asociado}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* Ver Expediente 360° / Ficha */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsExpedienteModalOpen(true);
                            }}
                            className="p-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg transition-colors cursor-pointer"
                            title="Ver Expediente 360° (Reporte 1.1)"
                            aria-label={`Ver Expediente 360° de ${a.nombre_completo}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Aperturar Nueva Cuenta (Formulario 2) */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsOpenAccountModalOpen(true);
                            }}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors cursor-pointer"
                            title="Aperturar Cuenta Financiera (Formulario 2)"
                            aria-label={`Aperturar Cuenta Financiera para ${a.nombre_completo}`}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>

                          {/* Gestionar Beneficiarios (Formulario 3) */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsBeneficiariesModalOpen(true);
                            }}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors cursor-pointer"
                            title="Declarar / Distribuir Beneficiarios (Formulario 3)"
                            aria-label={`Declarar o Distribuir Beneficiarios de ${a.nombre_completo}`}
                          >
                            <HeartHandshake className="w-4 h-4" />
                          </button>

                          {/* Suspender / Activar */}
                          <button
                            type="button"
                            onClick={() => promptToggleEstado(a)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              a.estado_asociado === 'ACTIVO'
                                ? 'bg-warning-50 hover:bg-warning-100 text-warning-700'
                                : 'bg-brand-50 hover:bg-brand-100 text-brand-700'
                            }`}
                            title={a.estado_asociado === 'ACTIVO' ? 'Suspender Asociado' : 'Activar Asociado'}
                            aria-label={a.estado_asociado === 'ACTIVO' ? `Suspender Asociado ${a.nombre_completo}` : `Activar Asociado ${a.nombre_completo}`}
                          >
                            {a.estado_asociado === 'ACTIVO' ? (
                              <Ban className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </div>

        {/* Paginador */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Mostrando página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
            </span>
            <div className="flex space-x-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchAsociados(pagination.page - 1)}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Anterior
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchAsociados(pagination.page + 1)}
                className="px-3 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modales de Formularios y Reportes */}
      <NewAssociateModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => fetchAsociados(1)}
      />

      <OpenAccountModal
        isOpen={isOpenAccountModalOpen}
        onClose={() => {
          setIsOpenAccountModalOpen(false);
          setSelectedAsociado(null);
        }}
        asociado={selectedAsociado}
        onSuccess={() => fetchAsociados(pagination.page)}
      />

      <BeneficiariesModal
        isOpen={isBeneficiariesModalOpen}
        onClose={() => {
          setIsBeneficiariesModalOpen(false);
          setSelectedAsociado(null);
        }}
        asociado={selectedAsociado}
        onSuccess={() => fetchAsociados(pagination.page)}
      />

      <AssociateExpedienteModal
        isOpen={isExpedienteModalOpen}
        onClose={() => {
          setIsExpedienteModalOpen(false);
          setSelectedAsociado(null);
        }}
        idAsociado={selectedAsociado?.id_asociado}
        onOpenNewAccount={(asc) => {
          setIsExpedienteModalOpen(false);
          setSelectedAsociado(asc);
          setIsOpenAccountModalOpen(true);
        }}
        onOpenBeneficiarios={(asc) => {
          setIsExpedienteModalOpen(false);
          setSelectedAsociado(asc);
          setIsBeneficiariesModalOpen(true);
        }}
      />

      {/* Modal de Confirmación Estilizado (H-02) */}
      <ConfirmModal
        isOpen={confirmModalData.isOpen}
        onClose={() => setConfirmModalData({ isOpen: false, asociado: null, nuevoEstado: '', loading: false })}
        onConfirm={handleConfirmToggleEstado}
        title="Confirmación de Cambio de Estado"
        subtitle={`Asociado: ${confirmModalData.asociado?.nombre_completo || ''}`}
        message={`¿Está seguro de cambiar el estado operativo del asociado a ${confirmModalData.nuevoEstado}?`}
        variant={confirmModalData.nuevoEstado === 'SUSPENDIDO' ? 'danger' : 'primary'}
        confirmText={`Cambiar a ${confirmModalData.nuevoEstado}`}
        loading={confirmModalData.loading}
      />
    </div>
  );
};

export default AssociatesManagementPage;
