import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import {
  Users,
  UserCheck,
  UserX,
  Wifi,
  ShieldAlert,
  Clock,
  Shield,
  Activity,
  Unlock,
  AlertTriangle,
  FileText,
  Building2,
  Calendar,
  Sparkles,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import GoogleEmailConfigModal from '../components/admin/GoogleEmailConfigModal';
import { AccountSettingsModal } from '../components/profile/AccountSettingsModal';

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

export const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailConfigModalOpen, setEmailConfigModalOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // Cargar lista de usuarios y últimos eventos de auditoría en paralelo
      const [usersRes, eventsRes] = await Promise.all([
        api.get('/usuarios'),
        api.get('/usuarios/auditoria/eventos-recientes').catch((err) => {
          console.warn('No se pudieron obtener eventos de auditoría:', err.message);
          return { data: { success: false, data: [] } };
        }),
      ]);

      if (usersRes.data?.success) {
        setUsers(usersRes.data.data || []);
      }
      if (eventsRes.data?.success) {
        setSecurityEvents(eventsRes.data.data || []);
      }
    } catch (error) {
      console.error('Error al cargar datos del Centro de Monitoreo:', error);
      setErrorMessage('No se pudieron cargar todas las métricas en tiempo real.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Escuchar eventos de presencia en tiempo real por WebSocket
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handlePresence = (data) => {
        if (data?.id_persona !== undefined) {
          setUsers((prevUsers) =>
            prevUsers.map((u) => {
              const uid = Number(u.id_persona || u.id);
              if (uid === Number(data.id_persona)) {
                return { ...u, en_linea: Boolean(data.en_linea) };
              }
              return u;
            })
          );
        }
      };

      socket.on('presence_update', handlePresence);
      return () => {
        socket.off('presence_update', handlePresence);
      };
    }
  }, []);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const total = users.length;
    const activos = users.filter((u) => u.estado === 'ACTIVO').length;
    const inactivos = users.filter((u) => u.estado === 'INACTIVO').length;
    const bloqueadosIntentos = users.filter((u) => u.bloqueado_por_intentos).length;
    const bloqueadosOInactivos = users.filter(
      (u) => u.estado === 'INACTIVO' || u.bloqueado_por_intentos
    ).length;
    const enLinea = users.filter((u) => u.en_linea).length;

    // Desglose por roles
    const asociadosCount = users.filter((u) => u.rol === 'ASOCIADO').length;
    const operadoresCount = users.filter((u) => u.rol === 'OPERADOR').length;
    const adminCount = users.filter((u) => u.rol === 'ADMINISTRADOR').length;

    return {
      total,
      activos,
      inactivos,
      bloqueadosIntentos,
      bloqueadosOInactivos,
      enLinea,
      asociadosCount,
      operadoresCount,
      adminCount,
    };
  }, [users]);

  // Datos para la Gráfica de Dona (Distribución de Usuarios por Rol)
  const doughnutData = useMemo(() => {
    return {
      labels: ['Asociados', 'Operadores', 'Administradores'],
      datasets: [
        {
          data: [kpis.asociadosCount, kpis.operadoresCount, kpis.adminCount],
          backgroundColor: ['#059669', '#2563eb', '#7c3aed'],
          hoverBackgroundColor: ['#047857', '#1d4ed8', '#6d28d9'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [kpis]);

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const percentage = kpis.total > 0 ? ((value / kpis.total) * 100).toFixed(1) : 0;
            return ` ${label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  };

  // Datos para la Gráfica de Barras (Actividad de Registros por Mes)
  const barData = useMemo(() => {
    // Agrupar usuarios por mes según fecha_creacion
    const monthCounts = {};
    const monthsOrder = [];

    // Tomar los últimos 6 meses
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('es-GT', { month: 'short' });
      monthCounts[key] = 0;
      monthsOrder.push(key);
    }

    users.forEach((u) => {
      if (u.fecha_creacion) {
        const d = new Date(u.fecha_creacion);
        const key = d.toLocaleDateString('es-GT', { month: 'short' });
        if (monthCounts[key] !== undefined) {
          monthCounts[key] += 1;
        }
      }
    });

    return {
      labels: monthsOrder.map((m) => m.toUpperCase()),
      datasets: [
        {
          label: 'Nuevos Registros',
          data: monthsOrder.map((m) => monthCounts[m]),
          backgroundColor: '#059669',
          hoverBackgroundColor: '#047857',
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [users]);

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => ` Altas: ${context.parsed.y} usuarios`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
            weight: 'bold',
          },
          color: '#64748b',
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#f1f5f9',
        },
        ticks: {
          stepSize: 1,
          font: {
            size: 11,
          },
          color: '#94a3b8',
        },
      },
    },
  };

  const getActionBadge = (estadoNuevo, motivo) => {
    if (estadoNuevo === 'BLOQUEADO_TEMPORAL' || (motivo && motivo.toLowerCase().includes('fuerza bruta'))) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-warning-100 text-warning-800 border border-warning-300">
          <AlertTriangle className="w-3 h-3 mr-1 text-warning-600" />
          Bloqueo Fuerza Bruta
        </span>
      );
    }
    if (motivo && motivo.toLowerCase().includes('desbloqueo')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-800 border border-brand-300">
          <Unlock className="w-3 h-3 mr-1 text-brand-600" />
          Desbloqueo Admin
        </span>
      );
    }
    if (estadoNuevo === 'INACTIVO') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <UserX className="w-3 h-3 mr-1 text-slate-500" />
          Borrado Lógico
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
        <Activity className="w-3 h-3 mr-1 text-blue-600" />
        {estadoNuevo || 'Actualización'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Encabezado Principal del Centro de Monitoreo */}
      <div className="bg-white rounded-lg p-6 sm:p-8 border border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            <span>Centro de Monitoreo en Tiempo Real</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Estadísticas y Control Operativo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Plataforma institucional de supervisión de cuentas, presencia activa y trazabilidad de seguridad.
          </p>
        </div>
      </div>

      {/* 4 Tarjetas Métricas Superiores (KPIs Administrativos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Usuarios Registrados */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Usuarios
            </span>
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : kpis.total}
          </div>
          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
            <span className="font-semibold text-brand-700">
              {kpis.asociadosCount} Asociados
            </span>
            <span>•</span>
            <span>{kpis.operadoresCount} Operadores</span>
          </div>
        </div>

        {/* KPI 2: Usuarios Activos */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Usuarios Activos
            </span>
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-brand-700">
            {loading ? '...' : kpis.activos}
          </div>
          <div className="flex items-center space-x-1.5 mt-2 text-xs font-medium text-brand-600">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            <span>
              {kpis.total > 0 ? `${((kpis.activos / kpis.total) * 100).toFixed(0)}% del padrón habilitado` : '0%'}
            </span>
          </div>
        </div>

        {/* KPI 3: Cuentas Bloqueadas / Inactivas */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Bloqueados / Inactivos
            </span>
            <div className="w-10 h-10 rounded-lg bg-warning-50 text-warning-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-warning-700">
            {loading ? '...' : kpis.bloqueadosOInactivos}
          </div>
          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
            <span className="text-warning-800 font-semibold">
              {kpis.bloqueadosIntentos} por intentos
            </span>
            <span>•</span>
            <span>{kpis.inactivos} borrado lógico</span>
          </div>
        </div>

        {/* KPI 4: Sesiones Activas / En Línea */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sesiones en Línea
            </span>
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-teal-700 flex items-center space-x-2">
            <span>{loading ? '...' : kpis.enLinea}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-ping" />
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center space-x-1 font-medium">
            <span>Conectados en tiempo real (Sockets)</span>
          </div>
        </div>
      </div>

      {/* Sección de Estadísticas y Gráficas de Usuarios (2 Paneles) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Panel 1: Distribución por Rol (Dona) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Distribución de Usuarios</h3>
                <p className="text-xs text-slate-500">Proporción por roles asignados (RBAC)</p>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                Total: {kpis.total}
              </span>
            </div>

            <div className="h-56 relative flex items-center justify-center my-2">
              <Doughnut data={doughnutData} options={doughnutOptions} />
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-800">{kpis.total}</span>
                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                  Cuentas
                </span>
              </div>
            </div>
          </div>

          {/* Leyenda personalizada */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center">
            <div className="p-2 rounded-lg bg-brand-50/60 border border-brand-100">
              <div className="flex items-center justify-center space-x-1 text-brand-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-brand-600" />
                <span>Asociados</span>
              </div>
              <span className="text-sm font-extrabold text-brand-900 block mt-1">
                {kpis.asociadosCount}
              </span>
              <span className="text-xs text-brand-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.asociadosCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-100">
              <div className="flex items-center justify-center space-x-1 text-blue-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>Operadores</span>
              </div>
              <span className="text-sm font-extrabold text-blue-900 block mt-1">
                {kpis.operadoresCount}
              </span>
              <span className="text-xs text-blue-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.operadoresCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-purple-50/60 border border-purple-100">
              <div className="flex items-center justify-center space-x-1 text-purple-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span>Admins</span>
              </div>
              <span className="text-sm font-extrabold text-purple-900 block mt-1">
                {kpis.adminCount}
              </span>
              <span className="text-xs text-purple-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.adminCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Actividad de Registros por Mes (Barras) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-lg border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Actividad de Registros y Altas</h3>
                <p className="text-xs text-slate-500">Histórico de nuevos usuarios incorporados</p>
              </div>
              <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200">
                Semestre Reciente
              </span>
            </div>

            <div className="h-64 mt-2">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
        </div>
      </div>

      {/* Sección Inferior: Últimos Eventos de Seguridad */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-warning-50 text-warning-700 flex items-center justify-center border border-warning-200">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Últimos Eventos de Seguridad</h3>
              <p className="text-xs text-slate-500">
                Registro de auditoría reciente de <code>historial_estados_usuario</code>
              </p>
            </div>
          </div>

          <span className="text-xs text-slate-400 font-mono font-medium">Últimos 5 registros</span>
        </div>

        {securityEvents.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <span>No hay eventos de seguridad recientes registrados.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Usuario Afectado</th>
                  <th className="py-2.5 px-3">Acción Realizada</th>
                  <th className="py-2.5 px-3">Responsable</th>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {securityEvents.map((ev) => (
                  <tr key={ev.id_historial_estado} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      <div>{ev.usuario_nombre}</div>
                      <span className="text-xs font-mono text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                        {ev.usuario_codigo || 'S/C'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {getActionBadge(ev.estado_nuevo, ev.motivo)}
                    </td>

                    <td className="py-3 px-3 text-slate-600 font-medium">
                      <div>{ev.actor_nombre}</div>
                      {ev.actor_codigo && (
                        <span className="text-xs text-slate-400 font-mono">
                          Usuario: {ev.actor_codigo}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {new Date(ev.fecha_cambio).toLocaleDateString('es-GT', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-600" title={ev.motivo}>
                      {ev.motivo || 'Sin observaciones registradas'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Configuración y Prueba de Google Mail */}
      <GoogleEmailConfigModal
        isOpen={emailConfigModalOpen}
        onClose={() => setEmailConfigModalOpen(false)}
      />

      {/* Modal de Configuración de Seguridad y 2FA de la Cuenta del Administrador */}
      <AccountSettingsModal
        isOpen={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
        initialTab="2fa"
      />
    </div>
  );
};

export default AdminDashboard;
