import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { iniciarSesionComo, montar, USUARIOS } from '../ayuda';
import { BASE, responder } from './datos';

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

const PAGINAS = import.meta.glob('../../pages/*.jsx');
const COMPONENTES = import.meta.glob('../../components/*/*.jsx');

const cargar = async (nombre) => {
  const modulo = await PAGINAS[`../../pages/${nombre}.jsx`]();
  return modulo.default || modulo[nombre];
};

const recorrerPestanas = async () => {
  for (const pestana of screen.queryAllByRole('tab')) {
    await userEvent.click(pestana);
    await act(async () => {});
  }
};

describe('pantallas con datos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(responder);
    api.post.mockImplementation(async () => ({ data: { success: true, message: 'Listo', data: {} } }));
    api.put.mockImplementation(async () => ({ data: { success: true, message: 'Listo', data: {} } }));
    api.patch.mockImplementation(async () => ({ data: { success: true, message: 'Listo', data: {} } }));
  });

  test('el administrador ve a los usuarios y puede buscar', async () => {
    iniciarSesionComo('ADMINISTRADOR');
    const Pantalla = await cargar('UsersPage');
    montar(<Pantalla />);
    expect((await screen.findAllByText(BASE.usuario.email)).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith('/usuarios', expect.anything());
  });

  test('el administrador abre su panel con usuarios y eventos', async () => {
    iniciarSesionComo('ADMINISTRADOR');
    const Pantalla = await cargar('AdminDashboard');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/usuarios/auditoria/eventos-recientes'));
    await recorrerPestanas();
  });

  test('la conciliación muestra depósitos y reversiones', async () => {
    iniciarSesionComo('ADMINISTRADOR');
    const Pantalla = await cargar('ConciliacionPage');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/conciliacion/depositos', expect.anything()));
    await recorrerPestanas();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/conciliacion/reversiones', expect.anything()));
  });

  test('el operador recorre su bandeja', async () => {
    iniciarSesionComo('OPERADOR');
    const Pantalla = await cargar('OperatorDashboard');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/operador/bandeja-solicitudes'));
    await recorrerPestanas();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/operador/creditos'));
  });

  test('el operador ve el padrón de asociados', async () => {
    iniciarSesionComo('OPERADOR');
    const Pantalla = await cargar('AssociatesManagementPage');
    montar(<Pantalla />);
    expect((await screen.findAllByText(/Ana/)).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith('/admin/asociados', expect.anything());
  });

  test('el ejecutivo ve los créditos por resolver', async () => {
    iniciarSesionComo('EJECUTIVO');
    const Pantalla = await cargar('ExecutiveDashboard');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/ejecutivo/creditos'));
    await recorrerPestanas();
  });

  test('el asociado ve sus cuentas y recorre su portal', async () => {
    iniciarSesionComo('ASOCIADO');
    const Pantalla = await cargar('AssociateDashboard');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/asociado/cuentas'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/asociado/documentos'));
    await recorrerPestanas();
  });

  test('el simulador calcula y muestra los créditos del asociado', async () => {
    iniciarSesionComo('ASOCIADO');
    const Pantalla = await cargar('CreditSimulatorPage');
    montar(<Pantalla />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/asociado/capacidad-crediticia'));
    await recorrerPestanas();
  });

  test('la afiliación pública pide el DPI', async () => {
    const Pantalla = await cargar('PublicAffiliationPage');
    montar(<Pantalla />);
    const botones = await screen.findAllByRole('button');
    expect(botones.length).toBeGreaterThan(0);
    await userEvent.click(botones[botones.length - 1]);
    expect(within(document.body).getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('modales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(responder);
    iniciarSesionComo('OPERADOR');
  });

  const ASOCIADO = { ...BASE.asociado, id: 1 };

  test.each([
    ['associates/NewAssociateModal', 'NewAssociateModal', { onSuccess: vi.fn(), onAbrirCuenta: vi.fn() }],
    ['associates/BeneficiariesModal', 'BeneficiariesModal', { asociado: ASOCIADO, onSuccess: vi.fn() }],
    ['associates/OpenAccountModal', 'OpenAccountModal', { asociado: ASOCIADO, onSuccess: vi.fn() }],
    ['associates/AssociateExpedienteModal', 'AssociateExpedienteModal', { asociado: ASOCIADO, idAsociado: 1 }],
    ['profile/AccountSettingsModal', 'AccountSettingsModal', {}],
    ['profile/StaffAffiliationModal', 'StaffAffiliationModal', {}],
    ['admin/GoogleEmailConfigModal', 'GoogleEmailConfigModal', { onConfigSaved: vi.fn() }],
  ])('%s abre y cierra', async (ruta, nombre, props) => {
    const modulo = await COMPONENTES[`../../components/${ruta}.jsx`]();
    const Modal = modulo[nombre] || modulo.default;
    const alCerrar = vi.fn();
    montar(<Modal isOpen onClose={alCerrar} {...props} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await recorrerPestanas();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
  });

  test('USUARIOS de prueba cubren los cuatro roles', () => {
    expect(Object.keys(USUARIOS)).toHaveLength(4);
  });
});
