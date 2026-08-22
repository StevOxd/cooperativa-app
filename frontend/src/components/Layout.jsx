import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export const Layout = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Cooperativa © 2026 - Sistema de Gestión Integral | Proyecto de Graduación
      </footer>
    </div>
  );
};

export default Layout;
