import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';

export const Layout = () => {
  const location = useLocation();

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-[1680px] mx-auto p-4 sm:p-6 lg:p-8 xl:p-10 2xl:px-12">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          Cooperativa © 2026 - Sistema de Gestión Integral | Proyecto de Graduación
        </div>
      </footer>
    </div>
  );
};

export default Layout;
