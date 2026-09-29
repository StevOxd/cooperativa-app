import { Calculator, Home, UserCheck, Users } from 'lucide-react';

export const ROLE_LABELS = {
  ADMINISTRADOR: 'Administrador',
  EJECUTIVO: 'Ejecutivo',
  OPERADOR: 'Operador',
  ASOCIADO: 'Asociado',
};

/** Roles que trabajan con la barra lateral; el resto usa la barra superior. */
export const STAFF_ROLES = ['ADMINISTRADOR', 'EJECUTIVO', 'OPERADOR'];

/**
 * Enlaces de navegación según el rol. Las rutas y los permisos son los mismos
 * que protege `RoleProtectedRoute` en App.jsx.
 */
export const getNavLinks = (rol) => [
  { to: '/dashboard', label: 'Inicio', icon: Home },
  ...(rol === 'OPERADOR' ? [{ to: '/asociados', label: 'Asociados', icon: UserCheck }] : []),
  ...(rol === 'ADMINISTRADOR' ? [{ to: '/usuarios', label: 'Usuarios', icon: Users }] : []),
  ...(rol === 'ASOCIADO' ? [{ to: '/simulador-credito', label: 'Simulador de crédito', icon: Calculator }] : []),
];

/** Nombre visible del usuario autenticado. */
export const getDisplayName = (user) => user?.nombre_completo || user?.nombre || 'Usuario';

/** Iniciales para el avatar: primera letra de las dos primeras palabras del nombre. */
export const getInitials = (user) =>
  getDisplayName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
