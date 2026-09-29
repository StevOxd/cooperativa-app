import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Ban, CreditCard, Eye, FileSpreadsheet, HeartHandshake, UserCheck, UserPlus, Users } from 'lucide-react';
import NewAssociateModal from '../components/associates/NewAssociateModal';
import OpenAccountModal from '../components/associates/OpenAccountModal';
import BeneficiariesModal from '../components/associates/BeneficiariesModal';
import AssociateExpedienteModal from '../components/associates/AssociateExpedienteModal';
import ConfirmModal from '../components/common/ConfirmModal';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatGroup,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatQ, humanize } from '../utils/format';

/** Estado del asociado → etiqueta y tono. Los valores de la base no cambian. */
const ESTADOS = {
  ACTIVO: { label: 'Activo', tone: 'success' },
  SUSPENDIDO: { label: 'Suspendido', tone: 'danger' },
  INACTIVO: { label: 'Inactivo', tone: 'neutral' },
};
const estadoAsociado = (estado) => ESTADOS[estado] || { label: humanize(estado), tone: 'neutral' };

/** Botón de ícono de la columna de acciones: el texto va en `title` y `aria-label`. */
const RowAction = ({ icon: Icon, label, onClick, className }) => (
  <Button size="icon" variant="ghost" onClick={onClick} title={label} aria-label={label} className={className}>
    <Icon className="w-4 h-4" aria-hidden="true" />
  </Button>
);

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

  const hasFilters = Boolean(search || estadoFilter);
  const nuevoEstadoLabel = estadoAsociado(confirmModalData.nuevoEstado).label.toLowerCase();
  const suspendiendo = confirmModalData.nuevoEstado === 'SUSPENDIDO';

  return (
    <div>
      <PageHeader
        title="Asociados"
        description="Padrón de asociados: expediente, apertura de cuentas y beneficiarios."
        actions={
          <>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              onClick={handleExportCSV}
              disabled={asociados.length === 0}
              title="Descarga los asociados de esta página en un archivo CSV que abre en Excel"
            >
              Exportar CSV
            </Button>
            {canCreateAssociate && (
              <Button icon={UserPlus} onClick={() => setIsNewModalOpen(true)}>
                Nuevo asociado
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <StatGroup columns={2}>
          <StatCard label="Asociados en el padrón" value={pagination.total} hint={hasFilters ? 'Con los filtros aplicados' : 'Todos los registros'} />
          <StatCard label="Activos" value={totalActivos} hint={`De ${asociados.length} en esta página`} />
        </StatGroup>

        <Card>
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center"
            role="search"
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Buscar asociados"
              placeholder="DPI, nombre, usuario o correo"
              className="w-full sm:max-w-sm"
            />
            <Select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              aria-label="Filtrar por estado"
              className="sm:w-44"
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
              <option value="SUSPENDIDO">Suspendidos</option>
            </Select>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">Buscar</Button>
              {hasFilters && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setEstadoFilter('');
                    fetchAsociados(1);
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          </form>

          {loading ? (
            <LoadingState label="Cargando asociados…" />
          ) : asociados.length === 0 ? (
            <EmptyState
              icon={Users}
              title={hasFilters ? 'Sin resultados' : 'Aún no hay asociados'}
              description={
                hasFilters
                  ? 'Revise el DPI, nombre, usuario o correo, o cambie el estado.'
                  : 'Los asociados registrados en ventanilla o por afiliación en línea aparecerán aquí.'
              }
            />
          ) : (
            <Table bordered={false} caption="Padrón de asociados">
              <THead>
                <TR>
                  <TH>Asociado</TH>
                  <TH>DPI y usuario</TH>
                  <TH numeric>Cuentas</TH>
                  <TH numeric>Saldo disponible</TH>
                  <TH numeric>Aportaciones</TH>
                  <TH>Estado</TH>
                  <TH sticky><span className="sr-only">Acciones</span></TH>
                </TR>
              </THead>
              <TBody>
                {asociados.map((a) => {
                  const st = estadoAsociado(a.estado_asociado);
                  const activo = a.estado_asociado === 'ACTIVO';
                  return (
                    <TR key={a.id_asociado} interactive>
                      <TD className="min-w-[13rem]">
                        <div className="font-medium text-ink">{a.nombre_completo}</div>
                        <div className="text-xs text-ink-subtle">
                          {a.email || 'Sin correo'}
                          {a.telefono && <span className="tabular-nums"> · {a.telefono}</span>}
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <div className="font-mono text-ink">{a.cui_dpi}</div>
                        <div className="text-xs text-ink-subtle">
                          {a.codigo_corporativo ? <span className="font-mono">{a.codigo_corporativo}</span> : 'Sin usuario'}
                        </div>
                      </TD>
                      <TD numeric>{a.total_cuentas}</TD>
                      <TD numeric className="font-medium text-ink">{formatQ(a.saldo_total_disponible)}</TD>
                      <TD numeric>{formatQ(a.saldo_aportaciones)}</TD>
                      <TD className="whitespace-nowrap"><Badge tone={st.tone}>{st.label}</Badge></TD>
                      <TD sticky className="whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <RowAction
                            icon={Eye}
                            label={`Ver expediente de ${a.nombre_completo}`}
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsExpedienteModalOpen(true);
                            }}
                          />
                          <RowAction
                            icon={CreditCard}
                            label={`Abrir cuenta para ${a.nombre_completo}`}
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsOpenAccountModalOpen(true);
                            }}
                          />
                          <RowAction
                            icon={HeartHandshake}
                            label={`Beneficiarios de ${a.nombre_completo}`}
                            onClick={() => {
                              setSelectedAsociado(a);
                              setIsBeneficiariesModalOpen(true);
                            }}
                          />
                          <RowAction
                            icon={activo ? Ban : UserCheck}
                            label={activo ? `Suspender a ${a.nombre_completo}` : `Activar a ${a.nombre_completo}`}
                            onClick={() => promptToggleEstado(a)}
                            className={activo ? 'text-danger-700 hover:bg-danger-50' : 'text-success-700 hover:bg-success-50'}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}

          {pagination.totalPages > 1 && (
            <nav
              aria-label="Paginación del padrón"
              className="flex flex-col gap-3 border-t border-line px-5 py-3 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="tabular-nums">
                Página {pagination.page} de {pagination.totalPages} · {pagination.total} asociados
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => fetchAsociados(pagination.page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => fetchAsociados(pagination.page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </nav>
          )}
        </Card>
      </div>

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

      <ConfirmModal
        isOpen={confirmModalData.isOpen}
        onClose={() => setConfirmModalData({ isOpen: false, asociado: null, nuevoEstado: '', loading: false })}
        onConfirm={handleConfirmToggleEstado}
        title={suspendiendo ? '¿Suspender al asociado?' : '¿Activar al asociado?'}
        subtitle={confirmModalData.asociado?.nombre_completo || ''}
        message={
          suspendiendo
            ? 'Mientras esté suspendido no podrá operar en sus cuentas. Puede activarlo de nuevo cuando lo necesite.'
            : `El asociado quedará ${nuevoEstadoLabel} y podrá operar en sus cuentas.`
        }
        variant={suspendiendo ? 'danger' : 'primary'}
        confirmText={suspendiendo ? 'Suspender' : 'Activar'}
        loading={confirmModalData.loading}
      />
    </div>
  );
};

export default AssociatesManagementPage;
