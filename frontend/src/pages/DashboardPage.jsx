import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, X } from 'lucide-react';

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
      {/* Banner de Alerta por Permiso Denegado */}
      {deniedAlert && (
        <div className="p-4 rounded-lg bg-warning-50 border border-warning-200 text-warning-900 text-sm flex items-center justify-between animate-shake">
          <div className="flex items-center space-x-3">
            <AlertOctagon className="w-5 h-5 text-warning-600 flex-shrink-0" />
            <div>
              <span className="font-bold block">Acceso Restringido</span>
              <span>{deniedAlert}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeniedAlert('')}
            className="text-warning-600 hover:text-warning-900 p-1 rounded-md hover:bg-warning-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
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
