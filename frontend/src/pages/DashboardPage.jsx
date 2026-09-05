import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, X } from 'lucide-react';

import AssociateDashboard from './AssociateDashboard';
import OperatorDashboard from './OperatorDashboard';
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
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between shadow-sm animate-shake">
          <div className="flex items-center space-x-3">
            <AlertOctagon className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-bold block">Acceso Restringido</span>
              <span>{deniedAlert}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeniedAlert('')}
            className="text-amber-600 hover:text-amber-900 p-1 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Renderizado Condicional por Rol (RBAC) */}
      {user?.rol === 'ASOCIADO' && <AssociateDashboard />}
      {user?.rol === 'OPERADOR' && <OperatorDashboard />}
      {user?.rol === 'ADMINISTRADOR' && <AdminDashboard />}
      {!['ASOCIADO', 'OPERADOR', 'ADMINISTRADOR'].includes(user?.rol) && <AdminDashboard />}
    </div>
  );
};

export default DashboardPage;
