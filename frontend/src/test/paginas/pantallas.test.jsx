import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { iniciarSesionComo, montar } from '../ayuda';

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

const PANTALLAS = [
  ['AdminDashboard', 'ADMINISTRADOR'],
  ['UsersPage', 'ADMINISTRADOR'],
  ['ConciliacionPage', 'ADMINISTRADOR'],
  ['ReportesPage', 'ADMINISTRADOR'],
  ['OperatorDashboard', 'OPERADOR'],
  ['AssociatesManagementPage', 'OPERADOR'],
  ['ExecutiveDashboard', 'EJECUTIVO'],
  ['AssociateDashboard', 'ASOCIADO'],
  ['CreditSimulatorPage', 'ASOCIADO'],
  ['DashboardPage', 'ASOCIADO'],
];

describe('pantallas con sesión', () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(PANTALLAS)('%s abre con el rol %s y pide sus datos', async (nombre, rol) => {
    iniciarSesionComo(rol);
    const modulo = await import(`../../pages/${nombre}.jsx`);
    const Pantalla = modulo.default || modulo[nombre];
    const { container } = montar(<Pantalla />);
    await waitFor(() => expect(container.textContent.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText(/Verificando/)).not.toBeInTheDocument());
  });
});

describe('pantallas públicas', () => {
  test.each(['LoginPage', 'PublicAffiliationPage'])('%s abre sin sesión', async (nombre) => {
    const modulo = await import(`../../pages/${nombre}.jsx`);
    const Pantalla = modulo.default || modulo[nombre];
    const { container } = montar(<Pantalla />);
    await waitFor(() => expect(container.textContent.length).toBeGreaterThan(0));
  });
});
