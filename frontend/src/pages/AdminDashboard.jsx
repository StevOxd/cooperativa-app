import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getSocket } from '../services/socket';
import {
  Users,
  UserCheck,
  UserX,
  Wifi,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  Clock,
  KeyRound,
  Shield,
  Activity,
  Unlock,
  AlertTriangle,
  FileText,
  Building2,
  Calendar,
  Sparkles,
} from 'lucide-react';

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
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchDashboardData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
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
      setRefreshing(false);
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
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
          Bloqueo Fuerza Bruta
        </span>
      );
    }
    if (motivo && motivo.toLowerCase().includes('desbloqueo')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <Unlock className="w-3 h-3 mr-1 text-emerald-600" />
          Desbloqueo Admin
        </span>
      );
    }
    if (estadoNuevo === 'INACTIVO') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <UserX className="w-3 h-3 mr-1 text-slate-500" />
          Borrado Lógico
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
        <Activity className="w-3 h-3 mr-1 text-blue-600" />
        {estadoNuevo || 'Actualización'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Encabezado Principal del Centro de Monitoreo */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Centro de Monitoreo en Tiempo Real</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Estadísticas y Control Operativo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Plataforma institucional de supervisión de cuentas, presencia activa y trazabilidad de seguridad.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>{refreshing ? 'Sincronizando...' : 'Actualizar'}</span>
          </button>

          <Link
            to="/usuarios"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all hover:shadow-md cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Gestión de Usuarios</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* 4 Tarjetas Métricas Superiores (KPIs Administrativos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Usuarios Registrados */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Usuarios
            </span>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? '...' : kpis.total}
          </div>
          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
            <span className="font-semibold text-emerald-700">
              {kpis.asociadosCount} Asociados
            </span>
            <span>•</span>
            <span>{kpis.operadoresCount} Operadores</span>
          </div>
        </div>

        {/* KPI 2: Usuarios Activos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Usuarios Activos
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-700">
            {loading ? '...' : kpis.activos}
          </div>
          <div className="flex items-center space-x-1.5 mt-2 text-xs font-medium text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {kpis.total > 0 ? `${((kpis.activos / kpis.total) * 100).toFixed(0)}% del padrón habilitado` : '0%'}
            </span>
          </div>
        </div>

        {/* KPI 3: Cuentas Bloqueadas / Inactivas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Bloqueados / Inactivos
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-700">
            {loading ? '...' : kpis.bloqueadosOInactivos}
          </div>
          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
            <span className="text-amber-800 font-semibold">
              {kpis.bloqueadosIntentos} por intentos
            </span>
            <span>•</span>
            <span>{kpis.inactivos} borrado lógico</span>
          </div>
        </div>

        {/* KPI 4: Sesiones Activas / En Línea */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sesiones en Línea
            </span>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
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
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
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
                <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                  Cuentas
                </span>
              </div>
            </div>
          </div>

          {/* Leyenda personalizada */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 text-center">
            <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <div className="flex items-center justify-center space-x-1 text-emerald-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>Asociados</span>
              </div>
              <span className="text-sm font-extrabold text-emerald-900 block mt-1">
                {kpis.asociadosCount}
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.asociadosCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-100">
              <div className="flex items-center justify-center space-x-1 text-blue-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>Operadores</span>
              </div>
              <span className="text-sm font-extrabold text-blue-900 block mt-1">
                {kpis.operadoresCount}
              </span>
              <span className="text-[10px] text-blue-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.operadoresCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-purple-50/60 border border-purple-100">
              <div className="flex items-center justify-center space-x-1 text-purple-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span>Admins</span>
              </div>
              <span className="text-sm font-extrabold text-purple-900 block mt-1">
                {kpis.adminCount}
              </span>
              <span className="text-[10px] text-purple-700 font-semibold">
                {kpis.total > 0 ? `${((kpis.adminCount / kpis.total) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Actividad de Registros por Mes (Barras) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Actividad de Registros y Altas</h3>
                <p className="text-xs text-slate-500">Histórico de nuevos usuarios incorporados</p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                Semestre Reciente
              </span>
            </div>

            <div className="h-64 mt-2">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
            <span>Base de datos relacional PostgreSQL (3FN)</span>
            <span className="font-semibold text-slate-700">Trazabilidad Inmutable</span>
          </div>
        </div>
      </div>

      {/* Sección Inferior: Últimos Eventos de Seguridad y Accesos Directos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tabla de Últimos Eventos de Seguridad */}
        <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
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
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {ev.usuario_codigo || 'S/C'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {getActionBadge(ev.estado_nuevo, ev.motivo)}
                      </td>

                      <td className="py-3 px-3 text-slate-600 font-medium">
                        <div>{ev.actor_nombre}</div>
                        {ev.actor_codigo && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Cód. {ev.actor_codigo}
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

                      <td className="py-3 px-3 text-slate-600 max-w-xs xl:max-w-md 2xl:max-w-lg truncate" title={ev.motivo}>
                        {ev.motivo || 'Sin observaciones registradas'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Accesos Directos de Gestión */}
        <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Accesos Directos</h3>
                <p className="text-xs text-slate-500">Operaciones administrativas rápidas</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => navigate('/usuarios')}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block group-hover:text-emerald-900">
                      Gestión de Usuarios
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Crear, editar o aplicar borrado lógico
                    </span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/usuarios')}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200 hover:border-amber-300 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <Unlock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block group-hover:text-amber-900">
                      Desbloquear Cuentas
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {kpis.bloqueadosIntentos} cuenta(s) requieren atención
                    </span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => fetchDashboardData(true)}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block group-hover:text-blue-900">
                      Sincronizar Métricas
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Actualizar presencia e indicadores
                    </span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-400 font-medium">
            Sistema Bancario de Cooperativa • Licencia Institucional 2026
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
