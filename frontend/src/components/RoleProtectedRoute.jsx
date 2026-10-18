import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './ui';
import { ROLE_LABELS } from './layout/navigation';

/**
 * Componente para proteger rutas privadas basadas en roles específicos
 * Si el usuario no tiene el rol permitido, es redirigido al dashboard con un mensaje de permiso denegado
 */
export const RoleProtectedRoute = ({ allowedRoles = ['ADMINISTRADOR'], children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Verificando sus permisos…" className="min-h-screen bg-surface-muted" />;
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
          message: `Esta sección es solo para el rol ${allowedRoles.map((r) => ROLE_LABELS[r] || r).join(' o ')}.`,
        }}
        replace
      />
    );
  }

  return children ? children : <Outlet />;
};

export default RoleProtectedRoute;
