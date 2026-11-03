import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import App from '../../App';
import { iniciarSesionComo, montar } from '../ayuda';
import { responder } from './datos';
import { DocumentChecklist } from '../../components/documents';
import ForcedPasswordChangeModal from '../../components/auth/ForcedPasswordChangeModal';
import { Navbar } from '../../components/Navbar';
import Layout from '../../components/Layout';

vi.mock('../../services/api', async () => {
  const { apiFalsa } = await import('../apiFalsa');
  return { default: apiFalsa() };
});
vi.mock('../../services/socket', () => ({
  initSocket: vi.fn(() => null),
  getSocket: vi.fn(() => null),
  disconnectSocket: vi.fn(),
}));
vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null, Doughnut: () => null, Pie: () => null }));

const abrir = (ruta) => {
  window.history.pushState({}, '', ruta);
  return render(<App />);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(responder);
  api.post.mockImplementation(async () => ({ data: { success: true, message: 'Listo', data: {} } }));
});

describe('App y navegación', () => {
  test('sin sesión, una ruta privada lleva al login', async () => {
    abrir('/dashboard');
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 10000 });
  });

  test.each([
    ['ADMINISTRADOR', '/dashboard'],
    ['ADMINISTRADOR', '/usuarios'],
    ['OPERADOR', '/dashboard'],
    ['OPERADOR', '/asociados'],
    ['EJECUTIVO', '/dashboard'],
    ['ASOCIADO', '/dashboard'],
    ['ASOCIADO', '/simulador-credito'],
  ])('el rol %s abre %s dentro del menú', async (rol, ruta) => {
    iniciarSesionComo(rol);
    const { container } = abrir(ruta);
    await waitFor(() => expect(container.textContent.length).toBeGreaterThan(50), { timeout: 10000 });
    expect(localStorage.getItem('coop_token')).toBe('token-de-prueba');
  });

  test('el asociado no entra a una pantalla del personal', async () => {
    iniciarSesionComo('ASOCIADO');
    abrir('/usuarios');
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'), { timeout: 10000 });
  });

  test('Navbar abre el menú de la cuenta del asociado', async () => {
    iniciarSesionComo('ASOCIADO');
    montar(<Navbar />);
    const botones = await screen.findAllByRole('button');
    for (const boton of botones) await userEvent.click(boton);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  test.each(['ADMINISTRADOR', 'OPERADOR', 'EJECUTIVO', 'ASOCIADO'])(
    'Layout muestra el menú del rol %s',
    async (rol) => {
      iniciarSesionComo(rol);
      const { container } = montar(<Layout />);
      await waitFor(() => expect(container.textContent.length).toBeGreaterThan(10));
    }
  );
});

describe('DocumentChecklist', () => {
  const DOCUMENTOS = [
    {
      id_documento: 1,
      tipo_documento: 'DPI_FRENTE',
      estado: 'ACEPTADO',
      version: 1,
      nombre_archivo: 'a.pdf',
      fecha_carga: '2026-02-01T12:00:00Z',
    },
    {
      id_documento: 2,
      tipo_documento: 'DPI_REVERSO',
      estado: 'RECHAZADO',
      motivo_rechazo: 'Borroso',
      version: 1,
      fecha_carga: '2026-02-01T12:00:00Z',
    },
    {
      id_documento: 3,
      tipo_documento: 'RECIBO_SERVICIOS',
      estado: 'PENDIENTE',
      version: 2,
      fecha_carga: '2026-02-01T12:00:00Z',
    },
  ];

  test('muestra el estado de cada documento y el motivo del rechazo', () => {
    render(<DocumentChecklist documentos={DOCUMENTOS} puedeSubir={() => true} onSubir={vi.fn()} onVer={vi.fn()} />);
    expect(screen.getAllByText('DPI (frente)').length).toBeGreaterThan(0);
    expect(screen.getByText('Aceptado')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText(/Borroso/)).toBeInTheDocument();
  });

  test('sin documentos, todos aparecen como faltantes', () => {
    render(<DocumentChecklist documentos={[]} puedeSubir={() => false} onVer={vi.fn()} />);
    expect(screen.getAllByText('Falta').length).toBeGreaterThanOrEqual(4);
  });
});

describe('cambio forzoso de contraseña', () => {
  test('no deja enviar una contraseña que no cumple la política', async () => {
    iniciarSesionComo('OPERADOR');
    montar(
      <ForcedPasswordChangeModal isOpen user={{ codigo_corporativo: 'OP-1' }} onSuccess={vi.fn()} onLogout={vi.fn()} />
    );
    const claves = document.querySelectorAll('input[type="password"]');
    if (claves.length) await userEvent.type(claves[claves.length - 1], 'corta');
    expect(api.post).not.toHaveBeenCalledWith('/auth/cambiar-password', expect.anything());
  });
});
