import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import { StaffShell } from './layout/StaffShell';
import { STAFF_ROLES } from './layout/navigation';

export const Layout = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Validar inmediatamente si existe el token en el storage
    const checkSecurity = () => {
      const token = localStorage.getItem('coop_token');
      if (!token) {
        window.location.replace('/login');
      }
    };

    // Prevenir restauración no autorizada desde BFCache del navegador (botón Adelante)
    window.addEventListener('pageshow', checkSecurity);
    window.addEventListener('popstate', checkSecurity);

    checkSecurity();

    return () => {
      window.removeEventListener('pageshow', checkSecurity);
      window.removeEventListener('popstate', checkSecurity);
    };
  }, [location.pathname]);

  // Operador, Ejecutivo y Administrador: barra lateral. Asociado: barra superior.
  if (STAFF_ROLES.includes(user?.rol)) {
    return (
      <StaffShell>
        <Outlet />
      </StaffShell>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Navbar />
      <main className="w-full max-w-7xl flex-1 mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-white py-4 text-center text-xs text-ink-subtle print:hidden">
        © {new Date().getFullYear()} Cooperativa · Proyecto de graduación
      </footer>
    </div>
  );
};

export default Layout;
