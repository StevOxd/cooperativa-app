import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Mail, Menu, ShieldCheck, X } from 'lucide-react';
import { cn } from '../ui';
import { Wordmark } from './Wordmark';
import { ROLE_LABELS, getDisplayName, getInitials, getNavLinks } from './navigation';
import { useAccountActions } from './useAccountActions';

const itemClasses =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

/** Contenido de la barra lateral; se usa fijo en escritorio y dentro del panel móvil. */
const SidebarContent = ({ account, onAction }) => {
  const location = useLocation();
  const { user, isAdmin, logout, openSecurity, openEmailConfig } = account;
  const links = getNavLinks(user?.rol);

  const run = (action) => () => {
    onAction?.();
    action();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5 border-b border-line">
        <Link
          to="/dashboard"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Wordmark size="sm" />
        </Link>
      </div>

      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {links.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    itemClasses,
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                  )}
                >
                  <Icon
                    className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand-700' : 'text-ink-subtle')}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Cuenta del usuario, siempre visible al pie de la barra */}
      <div className="shrink-0 border-t border-line px-3 py-4">
        <div className="flex items-center gap-3 px-3 pb-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-800"
            aria-hidden="true"
          >
            {getInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{getDisplayName(user)}</p>
            <p className="truncate text-xs text-ink-subtle">
              {ROLE_LABELS[user?.rol] || 'Usuario'}
              {user?.codigo_corporativo && <> · <span className="font-mono">{user.codigo_corporativo}</span></>}
            </p>
          </div>
        </div>

        <div className="space-y-0.5">
          <button
            type="button"
            onClick={run(openSecurity)}
            className={cn(itemClasses, 'text-ink-soft hover:bg-surface-sunken hover:text-ink')}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <span className="flex-1">Seguridad</span>
            <span className={cn('text-xs', user?.mfa_enabled ? 'text-success-700' : 'text-ink-subtle')}>
              {user?.mfa_enabled ? 'En 2 pasos' : 'Básica'}
            </span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={run(openEmailConfig)}
              className={cn(itemClasses, 'text-ink-soft hover:bg-surface-sunken hover:text-ink')}
            >
              <Mail className="w-4 h-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              Correo de notificaciones
            </button>
          )}

          <button
            type="button"
            onClick={run(logout)}
            className={cn(itemClasses, 'text-danger-700 hover:bg-danger-50 hover:text-danger-800')}
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Estructura de trabajo para Operador, Ejecutivo y Administrador: barra
 * lateral fija en pantallas grandes y panel deslizable en pantallas pequeñas.
 */
export const StaffShell = ({ children }) => {
  const account = useAccountActions();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const openButtonRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Cierre automático al cambiar de ruta
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Panel móvil: foco, Escape y bloqueo del scroll de fondo
  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    const openButton = openButtonRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsDrawerOpen(false);
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
      openButton?.focus();
    };
  }, [isDrawerOpen]);

  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Barra lateral fija (≥ lg) */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64 border-r border-line bg-white print:hidden">
        <SidebarContent account={account} />
      </aside>

      {/* Barra superior compacta (< lg) */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-white px-4 print:hidden">
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={isDrawerOpen}
          aria-controls="menu-lateral"
          className="-ml-1.5 rounded-md p-1.5 text-ink-soft hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <Link to="/dashboard" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
          <Wordmark size="sm" />
        </Link>
      </header>

      {/* Panel deslizable (< lg) */}
      {isDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 print:hidden">
          <div
            className="absolute inset-0 bg-surface-inverse/60"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            id="menu-lateral"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-lg"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-3 top-3.5 z-10 rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <SidebarContent account={account} onAction={() => setIsDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64 print:pl-0">
        <main className="w-full max-w-[1600px] flex-1 mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-4 text-xs text-ink-subtle sm:px-6 lg:px-8 print:hidden">
          © {year} Cooperativa · Proyecto de graduación
        </footer>
      </div>

      {account.modals}
    </div>
  );
};

export default StaffShell;
