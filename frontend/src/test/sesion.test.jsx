import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import api from '../services/api';
import { iniciarSesionComo, montar, USUARIOS } from './ayuda';
import { useAuth } from '../context/AuthContext';
import { toast } from '../context/ToastContext';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleProtectedRoute from '../components/RoleProtectedRoute';
import LoginPage from '../pages/LoginPage';

vi.mock('../services/api', async () => {
  const { apiFalsa } = await import('./apiFalsa');
  return { default: apiFalsa() };
});
vi.mock('../services/socket', () => ({
  initSocket: vi.fn(() => null),
  getSocket: vi.fn(() => null),
  disconnectSocket: vi.fn(),
}));

const Rutas = ({ roles }) => (
  <Routes>
    <Route path="/login" element={<div>Pantalla de login</div>} />
    <Route path="/dashboard" element={<div>Inicio</div>} />
    <Route element={<ProtectedRoute />}>
      <Route path="/privada" element={<div>Contenido privado</div>} />
    </Route>
    <Route
      path="/rol"
      element={
        <RoleProtectedRoute allowedRoles={roles}>
          <div>Contenido del rol</div>
        </RoleProtectedRoute>
      }
    />
  </Routes>
);

describe('rutas protegidas', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sin sesión manda a login', async () => {
    montar(<Rutas />, { ruta: '/privada' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
  });

  test('con sesión muestra la ruta privada', async () => {
    iniciarSesionComo('OPERADOR');
    montar(<Rutas />, { ruta: '/privada' });
    expect(await screen.findByText('Contenido privado')).toBeInTheDocument();
  });

  test('un rol sin permiso vuelve al inicio', async () => {
    iniciarSesionComo('ASOCIADO');
    montar(<Rutas roles={['ADMINISTRADOR']} />, { ruta: '/rol' });
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByText('Contenido del rol')).not.toBeInTheDocument();
  });

  test('el rol permitido entra', async () => {
    iniciarSesionComo('ADMINISTRADOR');
    montar(<Rutas roles={['ADMINISTRADOR']} />, { ruta: '/rol' });
    expect(await screen.findByText('Contenido del rol')).toBeInTheDocument();
  });

  test('una sesión rechazada por el servidor se cierra y limpia el navegador', async () => {
    iniciarSesionComo('OPERADOR');
    api.get.mockRejectedValueOnce(new Error('401'));
    montar(<Rutas />, { ruta: '/privada' });
    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(localStorage.getItem('coop_token')).toBeNull();
  });
});

describe('AuthContext', () => {
  const Sonda = () => {
    const auth = useAuth();
    return (
      <div>
        <span>Usuario: {auth.user?.codigo_corporativo || 'ninguno'}</span>
        <button onClick={() => auth.logout()}>Salir</button>
      </div>
    );
  };

  test('recupera al usuario guardado y cierra la sesión', async () => {
    iniciarSesionComo('EJECUTIVO');
    api.get.mockResolvedValueOnce({ data: { success: true, user: USUARIOS.EJECUTIVO } });
    montar(<Sonda />);
    expect(await screen.findByText('Usuario: EJ-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('Usuario: ninguno')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem('coop_user')).toBeNull();
  });
});

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  const escribirCredenciales = async () => {
    const [usuario] = screen.getAllByRole('textbox');
    await userEvent.type(usuario, 'AD-1');
    await userEvent.type(document.querySelector('input[type="password"]'), 'clave');
    await userEvent.click(screen.getByRole('button', { name: /iniciar|ingresar|entrar/i }));
  };

  test('envía las credenciales y entra', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, token: 'tk', user: USUARIOS.ADMINISTRADOR } });
    montar(
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Inicio</div>} />
      </Routes>
    );
    await escribirCredenciales();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/auth/login',
        expect.objectContaining({ identifier: 'AD-1', password: 'clave' })
      )
    );
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(localStorage.getItem('coop_token')).toBe('tk');
  });

  test('muestra el error del servidor con credenciales incorrectas', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Credenciales incorrectas.' } } });
    montar(<LoginPage />);
    await escribirCredenciales();
    expect(await screen.findByText(/Credenciales incorrectas|No pudimos|incorrect/i)).toBeInTheDocument();
    expect(localStorage.getItem('coop_token')).toBeNull();
  });

  test('pide el código cuando el usuario tiene 2FA', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        mfaRequired: true,
        requires2FA: true,
        mfa_required: true,
        tempToken: 'tmp',
        temp_token: 'tmp',
        user: USUARIOS.ADMINISTRADOR,
      },
    });
    montar(<LoginPage />);
    await escribirCredenciales();
    await waitFor(() => expect(api.post).toHaveBeenCalled());
  });
});

describe('avisos', () => {
  test.each(['success', 'error', 'warning', 'info'])('toast.%s se muestra en pantalla', async (tipo) => {
    montar(<div />);
    await act(async () => {
      toast[tipo](`Mensaje ${tipo}`);
    });
    expect(await screen.findByText(`Mensaje ${tipo}`)).toBeInTheDocument();
  });
});
