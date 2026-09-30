import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { X } from 'lucide-react';
import { Alert } from '../components/ui';

import AssociateDashboard from './AssociateDashboard';
import OperatorDashboard from './OperatorDashboard';
import ExecutiveDashboard from './ExecutiveDashboard';
import AdminDashboard from './AdminDashboard';

export const DashboardPage = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Mensaje de alerta si fue redirigido por falta de permisos
  const [deniedAlert, setDeniedAlert] = useState(
    location.state?.accessDenied ? location.state?.message : ''
  );

  return (
    <div className="space-y-6">
      {/* Aviso cuando se llega aquí por intentar abrir una sección sin permiso */}
      {deniedAlert && (
        <div className="relative">
          <Alert tone="warning" title="No tiene acceso a esa sección" className="pr-12">
            {deniedAlert}
          </Alert>
          <button
            type="button"
            onClick={() => setDeniedAlert('')}
            aria-label="Cerrar aviso"
            className="absolute right-2 top-2 rounded-md p-1.5 text-warning-800 hover:bg-warning-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Renderizado Condicional por Rol (RBAC) */}
      {user?.rol === 'ASOCIADO' && <AssociateDashboard />}
      {user?.rol === 'OPERADOR' && <OperatorDashboard />}
      {user?.rol === 'EJECUTIVO' && <ExecutiveDashboard />}
      {user?.rol === 'ADMINISTRADOR' && <AdminDashboard />}
      {!['ASOCIADO', 'OPERADOR', 'EJECUTIVO', 'ADMINISTRADOR'].includes(user?.rol) && <AdminDashboard />}
    </div>
  );
};

export default DashboardPage;
