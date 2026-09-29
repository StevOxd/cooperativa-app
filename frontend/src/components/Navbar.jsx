import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UpdateProfileModal } from './profile/UpdateProfileModal';
import { ChangePasswordModal } from './profile/ChangePasswordModal';
import { AccountSettingsModal } from './profile/AccountSettingsModal';
import { GoogleEmailConfigModal } from './admin/GoogleEmailConfigModal';
import {
  Building2,
  Users,
  UserCheck,
  LayoutDashboard,
  LogOut,
  User,
  Calculator,
  ChevronDown,
  KeyRound,
  Menu,
  X,
  Database,
  Settings,
  ShieldCheck,
  Mail,
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpdateProfileOpen, setIsUpdateProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountSettingsInitialTab, setAccountSettingsInitialTab] = useState('2fa');
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);

  const dropdownRef = useRef(null);

  // Cierre automático al cambiar de ruta
  useEffect(() => {
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Cierre al hacer clic fuera del menú o presionar la tecla Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    if (isDropdownOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDropdownOpen, isMobileMenuOpen]);

  const getRoleBadgeStyle = (rol) => {
    switch (rol) {
      case 'ADMINISTRADOR':
        return 'bg-brand-500/10 text-brand-800 border-brand-500/30';
      case 'EJECUTIVO':
        return 'bg-blue-500/10 text-blue-800 border-blue-500/30 font-bold';
      case 'OPERADOR':
        return 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30';
      default:
        return 'bg-slate-500/10 text-slate-800 border-slate-500/30';
    }
  };

  const isOperator = user?.rol === 'OPERADOR';
  const isAdmin = user?.rol === 'ADMINISTRADOR';

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isOperator
      ? [{ to: '/asociados', label: 'Gestión de Asociados', icon: UserCheck }]
      : []),
    ...(isAdmin
      ? [{ to: '/usuarios', label: 'Gestión de Usuarios', icon: Users }]
      : []),
    ...(user?.rol === 'ASOCIADO'
      ? [{ to: '/simulador-credito', label: 'Simulador de Crédito', icon: Calculator }]
      : []),
  ];

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="flex justify-between h-16 items-center">
            {/* Logo & Marca Institucional */}
            <div className="flex items-center space-x-8">
              <Link to="/dashboard" className="flex items-center space-x-3 group">
                <div className="w-10 h-10 rounded-lg bg-brand-700 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-lg tracking-tight block">COOPERATIVA</span>
                  <span className="text-xs text-brand-700 font-semibold uppercase tracking-wider block">
                    Sistema Integral
                  </span>
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
                          ? 'bg-brand-50 text-brand-800 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-brand-700' : 'text-slate-400'}`} />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Lado Derecho: Menú de Usuario y Botón Hamburguesa Móvil */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Menú Desplegable de Usuario (User Dropdown Menu) */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="true"
                  className={`flex items-center space-x-3 p-1.5 sm:px-3 sm:py-2 rounded-md transition-all cursor-pointer border ${
                    isDropdownOpen
                      ? 'bg-slate-100 border-slate-300 ring-2 ring-brand-500/20'
                      : 'hover:bg-slate-50 border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="text-left hidden sm:block">
                    <span className="block text-xs font-semibold text-slate-800 leading-tight">
                      {user?.nombre_completo || user?.nombre || 'Usuario'}
                    </span>
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full border font-bold uppercase mt-0.5 ${getRoleBadgeStyle(
                        user?.rol
                      )}`}
                    >
                      {user?.rol || 'USUARIO'}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 hidden sm:block ${
                      isDropdownOpen ? 'rotate-180 text-brand-700' : ''
                    }`}
                  />
                </button>

                {/* Menú Flotante Institucional */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-68 rounded-lg bg-white shadow-lg border border-slate-200 py-1.5 z-50">
                    {/* Encabezado del Perfil */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 rounded-t-lg">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {user?.nombre_completo || user?.nombre || 'Usuario'}
                      </p>
                      <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                        {user?.codigo_corporativo ? `Usuario: ${user.codigo_corporativo}` : user?.email}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full border font-bold uppercase ${getRoleBadgeStyle(
                            user?.rol
                          )}`}
                        >
                          {user?.rol || 'USUARIO'}
                        </span>
                        {user?.mfa_enabled && (
                          <span className="inline-flex items-center space-x-1 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="w-3 h-3" />
                            <span>2FA Activo</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Opciones de Perfil */}
                    <div className="p-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setAccountSettingsInitialTab('2fa');
                          setIsAccountSettingsOpen(true);
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer text-left"
                      >
                        <ShieldCheck className="w-4 h-4 text-brand-700 flex-shrink-0" />
                        <div className="flex items-center justify-between w-full">
                          <span>Seguridad & Doble Factor (2FA)</span>
                          {user?.mfa_enabled ? (
                            <span className="text-xs bg-brand-100 text-brand-800 font-bold px-1.5 py-0.5 rounded">Activo</span>
                          ) : (
                            <span className="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">Opcional</span>
                          )}
                        </div>
                      </button>

                      {/* Configuración del Servicio de Correo (solo ADMINISTRADOR) */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            setIsEmailConfigOpen(true);
                          }}
                          className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer text-left"
                        >
                          <Mail className="w-4 h-4 text-brand-700 flex-shrink-0" />
                          <span>Servicio de Correo (Google SMTP)</span>
                        </button>
                      )}
                    </div>

                    {/* Separador Horizontal */}
                    <div className="my-1 border-t border-slate-100" />

                    {/* Opción Cerrar Sesión */}
                    <div className="p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <span>Cerrar Sesión</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botón de Menú Móvil (visible en pantallas < md) */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                  setIsDropdownOpen(false);
                }}
                aria-label={isMobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
                aria-expanded={isMobileMenuOpen}
                className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-slate-700" />
                ) : (
                  <Menu className="w-5 h-5 text-slate-700" />
                )}
              </button>
            </div>
          </div>

          {/* Menú Móvil Desplegable (visible en < md) */}
          {isMobileMenuOpen && (
            <div className="md:hidden border-t border-slate-200 py-3 space-y-1 bg-white animate-fadeIn">
              <div className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Navegación del Sistema
              </div>
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-800 font-bold border border-brand-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-brand-700' : 'text-slate-400'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Modal Integral de Configuración de la Cuenta (2FA, Contraseña, Perfil) */}
      <AccountSettingsModal
        isOpen={isAccountSettingsOpen}
        onClose={() => setIsAccountSettingsOpen(false)}
        initialTab={accountSettingsInitialTab}
      />

      {/* Modal de Configuración y Prueba de Google Mail (solo ADMINISTRADOR) */}
      {isAdmin && (
        <GoogleEmailConfigModal
          isOpen={isEmailConfigOpen}
          onClose={() => setIsEmailConfigOpen(false)}
        />
      )}

      {/* Modales de Perfil y Contraseña Legados (por compatibilidad) */}
      <UpdateProfileModal
        isOpen={isUpdateProfileOpen}
        onClose={() => setIsUpdateProfileOpen(false)}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );
};

export default Navbar;
