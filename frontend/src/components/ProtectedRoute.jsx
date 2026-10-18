import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './ui';
import { ROLE_LABELS } from './layout/navigation';

/**
 * Componente para proteger rutas privadas
 * Redirige a /login inmediatamente si no hay sesión activa o el token fue destruido
 */
export const ProtectedRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasToken = !!localStorage.getItem('coop_token');

  if (isLoading) {
    return <LoadingState label="Verificando su sesión…" className="min-h-screen bg-surface-muted" />;
  }

  // Si no está autenticado o no existe el token en storage, expulsar a /login con replace
  if (!isAuthenticated || !hasToken) {
    return <Navigate to="/login" replace />;
  }

  // Validación opcional por roles: igual que RoleProtectedRoute, vuelve al inicio con el aviso
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.rol)) {
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

export default ProtectedRoute;
