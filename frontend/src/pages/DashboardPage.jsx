import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Users,
  ShieldCheck,
  Building2,
  ArrowUpRight,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertOctagon,
  X,
  CreditCard,
  Phone,
  MapPin,
  Mail,
  User,
  Hash,
  Shield,
  Activity,
  BadgePercent,
  FileText,
} from 'lucide-react';

export const DashboardPage = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Mensaje de alerta si fue redirigido por falta de permisos
  const [deniedAlert, setDeniedAlert] = useState(
    location.state?.accessDenied ? location.state?.message : ''
  );

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    loading: true,
  });

  useEffect(() => {
    // Consultar métricas globales ÚNICAMENTE si el rol es ADMINISTRADOR
    if (user?.rol === 'ADMINISTRADOR') {
      const fetchUserStats = async () => {
        try {
          const res = await api.get('/usuarios');
          if (res.data?.success) {
            const users = res.data.data;
            const active = users.filter((u) => u.estado === 'ACTIVO').length;
            const inactive = users.filter((u) => u.estado === 'INACTIVO').length;
            setStats({
              totalUsers: users.length,
              activeUsers: active,
              inactiveUsers: inactive,
              loading: false,
            });
          }
        } catch (err) {
          console.error('Error fetching dashboard stats:', err);
          setStats((prev) => ({ ...prev, loading: false }));
        }
      };

      fetchUserStats();
    } else {
      setStats((prev) => ({ ...prev, loading: false }));
    }
  }, [user]);

  return (
    <div className="space-y-6">
      {/* Banner de Alerta por Permiso Denegado */}
      {deniedAlert && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between shadow-sm animate-shake">
          <div className="flex items-center space-x-3">
            <AlertOctagon className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-bold block">Acceso Restringido</span>
              <span>{deniedAlert}</span>
            </div>
          </div>
          <button
            onClick={() => setDeniedAlert('')}
            className="text-amber-600 hover:text-amber-900 p-1 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. VISTA EXCLUSIVA PARA ADMINISTRADOR */}
      {/* ========================================================================= */}
      {user?.rol === 'ADMINISTRADOR' && (
        <>
          {/* Banner de Bienvenida Administrador */}
          <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Panel de Control Global (3FN)</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                ¡Bienvenido, {user?.nombre_completo || user?.nombre}!
              </h1>
              <p className="text-emerald-100/80 text-sm leading-relaxed mb-6">
                Tienes privilegios de <span className="font-bold text-white">ADMINISTRADOR</span>. Cuentas con acceso total para gestionar usuarios, asignar roles y auditar las operaciones del sistema.
              </p>
              <Link
                to="/usuarios"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-all shadow-md hover:shadow-lg"
              >
                <Users className="w-4 h-4" />
                <span>Ir a Gestión de Usuarios</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Métricas Globales de Administración */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Total Usuarios</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.loading ? '...' : stats.totalUsers}</div>
              <span className="text-xs text-slate-500 mt-1 block">Registrados en PostgreSQL (3FN)</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Usuarios Activos</span>
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-teal-600">{stats.loading ? '...' : stats.activeUsers}</div>
              <span className="text-xs text-slate-500 mt-1 block">Cuentas habilitadas</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Inactivos (Borrados)</span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.loading ? '...' : stats.inactiveUsers}</div>
              <span className="text-xs text-slate-500 mt-1 block">Borrado lógico auditado</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Seguridad</span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="text-base font-bold text-blue-700 flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>RBAC & 3FN</span>
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Auditoría transaccional</span>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. VISTA PARA OPERADOR */}
      {/* ========================================================================= */}
      {user?.rol === 'OPERADOR' && (
        <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-3">
              <Activity className="w-3.5 h-3.5" />
              <span>Panel de Operaciones de Cooperativa</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              ¡Hola, {user?.nombre_completo || user?.nombre}!
            </h1>
            <p className="text-blue-100/80 text-sm leading-relaxed">
              Has iniciado sesión con el rol de <span className="font-bold text-white">OPERADOR</span>. Puedes realizar consultas de asociados y procesos operativos de atención en ventanilla.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. VISTA PARA ASOCIADO */}
      {/* ========================================================================= */}
      {user?.rol === 'ASOCIADO' && (
        <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-semibold mb-3">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Portal de Membresía del Asociado</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              ¡Bienvenido, {user?.nombre_completo || user?.nombre}!
            </h1>
            <p className="text-purple-100/80 text-sm leading-relaxed">
              Consulta tu información personal, número de DPI y estado de cuenta como asociado cooperativista.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TARJETA DE INFORMACIÓN PERSONAL / PERFIL (PARA TODOS LOS ROLES) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Datos Personales y de Cuenta</h3>
              <p className="text-xs text-slate-500">Información consolidada desde la base de datos relacional 3FN.</p>
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            {user?.rol}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Cód. Corporativo</span>
            <span className="text-base font-mono font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 inline-block">
              {user?.codigo_corporativo || 'S/C'}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Nombre Completo</span>
            <span className="text-sm font-bold text-slate-900 block truncate">{user?.nombre_completo || user?.nombre}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">DPI / CUI</span>
            <span className="text-sm font-mono font-bold text-slate-900 block">{user?.cui_dpi || 'No registrado'}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Código de Planilla</span>
            <span className="text-sm font-mono font-bold text-emerald-700 block">{user?.codigo_planilla}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Correo Electrónico</span>
            <span className="text-sm font-mono text-slate-800 block truncate">{user?.email}</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Estado de la Cuenta</span>
            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{user?.estado}</span>
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">Tipo de Permisos</span>
            <span className="text-xs font-medium text-slate-700 block mt-0.5">
              {user?.rol === 'ADMINISTRADOR'
                ? 'Acceso Total (Administración)'
                : user?.rol === 'OPERADOR'
                ? 'Caja y Atención al Público'
                : 'Membresía y Aportaciones'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

