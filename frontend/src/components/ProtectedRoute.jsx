import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Componente para proteger rutas privadas
 * Redirige a /login inmediatamente si no hay sesión activa o el token fue destruido
 */
export const ProtectedRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasToken = !!localStorage.getItem('coop_token');

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-700">
        <Loader2 className="w-10 h-10 text-emerald-700 animate-spin mb-4" />
        <p className="font-medium text-sm">Verificando sesión segura...</p>
      </div>
    );
  }

  // Si no está autenticado o no existe el token en storage, expulsar a /login con replace
  if (!isAuthenticated || !hasToken) {
    return <Navigate to="/login" replace />;
  }

  // Validación opcional por roles
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.rol)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Restringido</h2>
          <p className="text-slate-600 mb-6 text-sm">
            Tu rol actual (<span className="font-semibold text-slate-800">{user?.rol}</span>) no cuenta con permisos para acceder a esta sección.
          </p>
          <Navigate to="/dashboard" replace />
        </div>
      </div>
    );
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
