import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import Layout from './components/Layout';
import { LoadingState } from './components/ui';
import { ScreenErrorBoundary } from './components/common/ScreenErrorBoundary';
import { STAFF_ROLES } from './components/layout/navigation';

// Cada pantalla se descarga al abrirla, no al cargar la aplicación (issue #21)
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const CreditSimulatorPage = lazy(() => import('./pages/CreditSimulatorPage'));
const PublicAffiliationPage = lazy(() => import('./pages/PublicAffiliationPage'));
const AssociatesManagementPage = lazy(() => import('./pages/AssociatesManagementPage'));
const ConciliacionPage = lazy(() => import('./pages/ConciliacionPage'));
const ReportesPage = lazy(() => import('./pages/ReportesPage'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {/* Si una pantalla no se puede descargar, se avisa en lugar de dejar la página en blanco */}
          <ScreenErrorBoundary className="mx-auto max-w-lg px-4 py-16">
            {/* Las pantallas privadas tienen su propio Suspense en Layout: al cambiar de pantalla no desaparece el menú */}
            <Suspense fallback={<LoadingState label="Cargando…" className="min-h-screen" />}>
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
                    path="/conciliacion"
                    element={
                      <RoleProtectedRoute allowedRoles={['ADMINISTRADOR']}>
                        <ConciliacionPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="/reportes"
                    element={
                      <RoleProtectedRoute allowedRoles={STAFF_ROLES}>
                        <ReportesPage />
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
            </Suspense>
          </ScreenErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
