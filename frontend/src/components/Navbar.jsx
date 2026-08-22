import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Building2,
  Users,
  LayoutDashboard,
  LogOut,
  Shield,
  User,
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const getRoleBadgeStyle = (rol) => {
    switch (rol) {
      case 'ADMINISTRADOR':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
      case 'OPERADOR':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      default:
        return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
    }
  };

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(user?.rol === 'ADMINISTRADOR'
      ? [{ to: '/usuarios', label: 'Gestión de Usuarios', icon: Users }]
      : []),
  ];


  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo & Marca */}
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="flex items-center space-x-3 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-lg tracking-tight block">COOPERATIVA</span>
                <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider block">Sistema Integral</span>
              </div>
            </Link>

            {/* Navegación Desktop */}
            <nav className="hidden md:flex space-x-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Perfil de Usuario y Logout */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-3 pl-4 border-l border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                <User className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="block text-xs font-semibold text-slate-800 leading-tight">
                  {user?.nombre || 'Usuario'}
                </span>
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${getRoleBadgeStyle(
                    user?.rol
                  )}`}
                >
                  {user?.rol || 'USUARIO'}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
