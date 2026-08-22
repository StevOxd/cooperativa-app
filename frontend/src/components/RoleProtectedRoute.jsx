import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Componente para proteger rutas privadas basadas en roles específicos
 * Si el usuario no tiene el rol permitido, es redirigido al dashboard con un mensaje de permiso denegado
 */
export const RoleProtectedRoute = ({ allowedRoles = ['ADMINISTRADOR'], children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium text-sm">Verificando permisos de acceso...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si el rol del usuario no está dentro de los roles permitidos
  if (!allowedRoles.includes(user?.rol)) {
    return (
      <Navigate
        to="/dashboard"
        state={{
          accessDenied: true,
          message: 'Acceso denegado: Se requieren permisos de Administrador para ingresar a esta sección.',
        }}
        replace
      />
    );
  }

  return children ? children : <Outlet />;
};

export default RoleProtectedRoute;
