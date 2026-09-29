import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Mail, Menu, ShieldCheck, X } from 'lucide-react';
import { cn } from './ui';
import { Wordmark } from './layout/Wordmark';
import { getDisplayName, getInitials, getNavLinks } from './layout/navigation';
import { useAccountActions } from './layout/useAccountActions';

const menuItemClasses =
  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

/**
 * Barra superior del portal del Asociado.
 */
export const Navbar = () => {
  const { user, isAdmin, logout, openSecurity, openEmailConfig, modals } = useAccountActions();
  const location = useLocation();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const navLinks = getNavLinks(user?.rol);

  const runFromMenu = (action) => () => {
    setIsDropdownOpen(false);
    action();
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-line print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex h-full items-center gap-8">
            <Link
              to="/dashboard"
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Wordmark size="sm" />
            </Link>

            {/* Navegación de escritorio */}
            <nav aria-label="Principal" className="hidden h-full md:flex">
              <ul className="flex h-full gap-6">
                {navLinks.map(({ to, label }) => {
                  const isActive = location.pathname === to;
                  return (
                    <li key={to} className="flex">
                      <Link
                        to={to}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center border-b-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                          isActive
                            ? 'border-brand-700 font-medium text-ink'
                            : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                        )}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Menú de la cuenta */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-expanded={isDropdownOpen}
                aria-controls="menu-cuenta"
                aria-label={`Cuenta de ${getDisplayName(user)}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-md p-1 sm:py-1.5 sm:pl-1.5 sm:pr-2.5 transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                  isDropdownOpen ? 'bg-surface-sunken' : 'hover:bg-surface-sunken'
                )}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-800"
                  aria-hidden="true"
                >
                  {getInitials(user)}
                </span>
                <span className="hidden max-w-[12rem] truncate text-sm font-medium text-ink sm:block">
                  {getDisplayName(user)}
                </span>
                <ChevronDown
                  className={cn('hidden w-4 h-4 text-ink-subtle transition-transform sm:block', isDropdownOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>

              {isDropdownOpen && (
                <div
                  id="menu-cuenta"
                  className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-line bg-white shadow-lg"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-sm font-medium text-ink">{getDisplayName(user)}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-subtle">
                      {user?.codigo_corporativo || user?.email}
                    </p>
                  </div>

                  <div className="space-y-0.5 p-1.5">
                    <button
                      type="button"
                      onClick={runFromMenu(openSecurity)}
                      className={cn(menuItemClasses, 'text-ink-soft hover:bg-surface-sunken hover:text-ink')}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                      <span className="flex-1">Seguridad</span>
                      <span className={cn('text-xs', user?.mfa_enabled ? 'text-success-700' : 'text-ink-subtle')}>
                        {user?.mfa_enabled ? 'En 2 pasos' : 'Básica'}
                      </span>
                    </button>

                    {/* Configuración del correo del sistema (solo ADMINISTRADOR) */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={runFromMenu(openEmailConfig)}
                        className={cn(menuItemClasses, 'text-ink-soft hover:bg-surface-sunken hover:text-ink')}
                      >
                        <Mail className="w-4 h-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                        Correo de notificaciones
                      </button>
                    )}
                  </div>

                  <div className="border-t border-line p-1.5">
                    <button
                      type="button"
                      onClick={runFromMenu(logout)}
                      className={cn(menuItemClasses, 'text-danger-700 hover:bg-danger-50 hover:text-danger-800')}
                    >
                      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botón de menú móvil (< md) */}
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(!isMobileMenuOpen);
                setIsDropdownOpen(false);
              }}
              aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="menu-movil"
              className="md:hidden rounded-md p-2 text-ink-soft hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Menú móvil (< md) */}
        {isMobileMenuOpen && (
          <nav id="menu-movil" aria-label="Principal" className="md:hidden border-t border-line px-4 py-2">
            <ul className="space-y-0.5">
              {navLinks.map(({ to, label, icon: Icon }) => {
                const isActive = location.pathname === to;
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                        isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-soft hover:bg-surface-sunken'
                      )}
                    >
                      <Icon className={cn('w-4 h-4', isActive ? 'text-brand-700' : 'text-ink-subtle')} aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      {modals}
    </>
  );
};

export default Navbar;
