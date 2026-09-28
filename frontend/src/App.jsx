import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import CreditSimulatorPage from './pages/CreditSimulatorPage';
import PublicAffiliationPage from './pages/PublicAffiliationPage';
import AssociatesManagementPage from './pages/AssociatesManagementPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
          {/* Rutas Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro-asociado" element={<PublicAffiliationPage />} />

          {/* Rutas Privadas Protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/asociados"
              element={
                <RoleProtectedRoute allowedRoles={['OPERADOR']}>
                  <AssociatesManagementPage />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RoleProtectedRoute allowedRoles={['ADMINISTRADOR']}>
                  <UsersPage />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="/simulador-credito"
              element={
                <RoleProtectedRoute allowedRoles={['ASOCIADO']}>
                  <CreditSimulatorPage />
                </RoleProtectedRoute>
              }
            />
          </Route>



          {/* Redirección por defecto */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
