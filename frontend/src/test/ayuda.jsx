import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';

export const USUARIOS = {
  ADMINISTRADOR: {
    id: 1,
    rol: 'ADMINISTRADOR',
    codigo_corporativo: 'AD-1',
    nombre: 'Ana Admin',
    email: 'admin@prueba.test',
  },
  OPERADOR: { id: 2, rol: 'OPERADOR', codigo_corporativo: 'OP-1', nombre: 'Omar Operador', email: 'op@prueba.test' },
  EJECUTIVO: { id: 3, rol: 'EJECUTIVO', codigo_corporativo: 'EJ-1', nombre: 'Eva Ejecutiva', email: 'ej@prueba.test' },
  ASOCIADO: { id: 4, rol: 'ASOCIADO', codigo_corporativo: 'EB-1', nombre: 'Aldo Asociado', email: 'as@prueba.test' },
};

/** Deja la sesión en el navegador de prueba, como la deja el login. */
export const iniciarSesionComo = (rol) => {
  localStorage.setItem('coop_token', 'token-de-prueba');
  localStorage.setItem('coop_user', JSON.stringify(USUARIOS[rol]));
};

/** Monta una pantalla con sus proveedores y un enrutador en memoria. */
export const montar = (elemento, { ruta = '/' } = {}) =>
  render(
    <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>{elemento}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
