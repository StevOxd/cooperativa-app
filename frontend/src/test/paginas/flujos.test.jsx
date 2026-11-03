import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { iniciarSesionComo, montar } from '../ayuda';
import { BASE, responder } from './datos';
import UsersPage from '../../pages/UsersPage';
import OperatorDashboard from '../../pages/OperatorDashboard';
import ExecutiveDashboard from '../../pages/ExecutiveDashboard';
import AssociatesManagementPage from '../../pages/AssociatesManagementPage';
import CreditSimulatorPage from '../../pages/CreditSimulatorPage';
import PublicAffiliationPage from '../../pages/PublicAffiliationPage';
import { NewAssociateModal } from '../../components/associates/NewAssociateModal';
import { BeneficiariesModal } from '../../components/associates/BeneficiariesModal';
import { OpenAccountModal } from '../../components/associates/OpenAccountModal';
import { AccountSettingsModal } from '../../components/profile/AccountSettingsModal';

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

const LISTO = { data: { success: true, message: 'Listo', data: {} } };

/** Abre cada acción de las filas de la tabla y cierra el diálogo que aparezca. */
const abrirAccionesDeFilas = async () => {
  const filas = screen.queryAllByRole('row').slice(1);
  let abiertos = 0;
  for (const fila of filas) {
    const cantidad = within(fila).queryAllByRole('button').length;
    for (let i = 0; i < cantidad; i += 1) {
      const boton = within(fila).queryAllByRole('button')[i];
      if (!boton) continue;
      await userEvent.click(boton);
      await act(async () => {});
      if (screen.queryAllByRole('dialog').length > 0) {
        abiertos += 1;
        await userEvent.keyboard('{Escape}');
        await act(async () => {});
      }
    }
  }
  return abiertos;
};

const recorrerPestanas = async (alEntrar) => {
  const total = screen.queryAllByRole('tab').length;
  for (let i = 0; i < total; i += 1) {
    await userEvent.click(screen.queryAllByRole('tab')[i]);
    await act(async () => {});
    if (alEntrar) await alEntrar();
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(responder);
  api.post.mockImplementation(async () => LISTO);
  api.put.mockImplementation(async () => LISTO);
  api.patch.mockImplementation(async () => LISTO);
});

describe('gestión de usuarios', () => {
  beforeEach(() => iniciarSesionComo('ADMINISTRADOR'));

  test('un usuario nuevo con datos incompletos no se envía al servidor', async () => {
    montar(<UsersPage />);
    await screen.findAllByText(BASE.usuario.email);
    await userEvent.click(screen.getByRole('button', { name: /nuevo|crear|agregar/i }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.submit(dialogo.querySelector('form'));
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalledWith('/usuarios', expect.anything());
    await userEvent.keyboard('{Escape}');
  });

  test('un usuario nuevo con datos válidos se envía al servidor', async () => {
    montar(<UsersPage />);
    await screen.findAllByText(BASE.usuario.email);
    await userEvent.click(screen.getByRole('button', { name: /nuevo|crear|agregar/i }));
    const dialogo = await screen.findByRole('dialog');
    const llenar = (etiqueta, valor) => {
      const campo = within(dialogo).getByLabelText(etiqueta);
      fireEvent.change(campo, { target: { value: valor } });
    };
    llenar(/Correo/, 'nuevo@prueba.test');
    llenar(/DPI/, '1234567890123');
    llenar(/Primer nombre/, 'Nora');
    llenar(/Primer apellido/, 'Nueva');
    llenar(/Teléfono/, '55554444');
    llenar(/Fecha de nacimiento/, '1990-01-01');
    fireEvent.submit(dialogo.querySelector('form'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/usuarios', expect.objectContaining({ email: 'nuevo@prueba.test' }))
    );
  });

  test('cada acción de la fila abre su diálogo', async () => {
    montar(<UsersPage />);
    await screen.findAllByText(BASE.usuario.email);
    expect(await abrirAccionesDeFilas()).toBeGreaterThan(0);
  });

  test('si la API falla se avisa', async () => {
    api.get.mockImplementation(async () => {
      throw { response: { data: { message: 'Sin conexión con el servidor' } } };
    });
    montar(<UsersPage />);
    expect(await screen.findByText('Sin conexión con el servidor')).toBeInTheDocument();
  });
});

describe('operación en ventanilla', () => {
  beforeEach(() => iniciarSesionComo('OPERADOR'));

  test('el operador abre las acciones de cada bandeja', async () => {
    montar(<OperatorDashboard />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/operador/bandeja-solicitudes'));
    await recorrerPestanas(abrirAccionesDeFilas);
    expect(api.get).toHaveBeenCalledWith('/operador/creditos');
  });

  test('el padrón abre las acciones del asociado', async () => {
    montar(<AssociatesManagementPage />);
    await screen.findAllByText(/Ana/);
    await abrirAccionesDeFilas();
    expect(api.get).toHaveBeenCalledWith('/admin/asociados', expect.anything());
  });

  test('una afiliación vacía muestra los errores y no se envía', async () => {
    montar(<NewAssociateModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.submit(dialogo.querySelector('form') || dialogo);
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalledWith('/admin/asociados/presencial', expect.anything());
  });

  test('el DPI escrito consulta las cuentas del banco', async () => {
    montar(<NewAssociateModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const dialogo = await screen.findByRole('dialog');
    const dpi = within(dialogo).getByLabelText(/DPI/);
    await userEvent.type(dpi, '1234567890123');
    fireEvent.blur(dpi);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/banco-externo/cuentas-cliente/1234567890123'))
    );
    await userEvent.type(within(dialogo).getByLabelText(/Primer nombre/), 'Nora');
    await userEvent.type(within(dialogo).getByLabelText(/Primer apellido/), 'Nueva');
    await userEvent.type(within(dialogo).getByLabelText(/Teléfono/), '55554444');
    await userEvent.type(within(dialogo).getByLabelText(/Aportación/), '150');
    expect(within(dialogo).getByLabelText(/Primer nombre/)).toHaveValue('Nora');
  });

  test('los beneficiarios exigen sumar 100 % antes de guardar', async () => {
    montar(
      <BeneficiariesModal isOpen onClose={vi.fn()} asociado={BASE.asociado} cuenta={BASE.cuenta} onSuccess={vi.fn()} />
    );
    const dialogo = await screen.findByRole('dialog');
    const entradas = within(dialogo).queryAllByRole('textbox');
    if (entradas[0]) await userEvent.type(entradas[0], 'Beto');
    for (const boton of within(dialogo).queryAllByRole('button').slice(0, 4)) {
      await userEvent.click(boton);
      await act(async () => {});
    }
    expect(api.post).not.toHaveBeenCalledWith(
      expect.stringContaining('beneficiarios'),
      expect.objectContaining({ beneficiarios: [] })
    );
  });

  test('abrir una cuenta sin monto no se envía', async () => {
    montar(<OpenAccountModal isOpen onClose={vi.fn()} asociado={BASE.asociado} onSuccess={vi.fn()} />);
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const formulario = dialogo.querySelector('form');
    if (formulario) fireEvent.submit(formulario);
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalledWith(
      expect.stringContaining('aperturar'),
      expect.objectContaining({ monto_apertura: '' })
    );
  });
});

describe('comité de crédito', () => {
  test('el ejecutivo abre la evaluación de un crédito', async () => {
    iniciarSesionComo('EJECUTIVO');
    montar(<ExecutiveDashboard />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/ejecutivo/creditos'));
    await recorrerPestanas(abrirAccionesDeFilas);
    expect(api.get).toHaveBeenCalledWith('/ejecutivo/creditos');
  });
});

describe('simulador de crédito', () => {
  test('cambiar el monto y el plazo actualiza el cálculo', async () => {
    iniciarSesionComo('ASOCIADO');
    montar(<CreditSimulatorPage />);
    const monto = await screen.findByLabelText('Monto (control deslizante)');
    const plazo = screen.getByLabelText('Plazo (control deslizante)');
    fireEvent.change(monto, { target: { value: '20000' } });
    fireEvent.change(plazo, { target: { value: '24' } });
    await act(async () => {});
    expect(screen.getAllByText(/24 meses/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/20,000\.00/).length).toBeGreaterThan(0);
  });

  test('enviar la solicitud llama a la API', async () => {
    iniciarSesionComo('ASOCIADO');
    api.get.mockImplementation(async (url) =>
      url === '/asociado/creditos' ? { data: { success: true, data: [] } } : responder(url)
    );
    const { container } = montar(<CreditSimulatorPage />);
    await screen.findByLabelText('Monto (control deslizante)');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/asociado/cuentas-acreditacion'));
    await act(async () => {});
    const formulario = container.querySelector('form');
    fireEvent.submit(formulario);
    await act(async () => {});
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/asociado/creditos/iniciar',
        expect.objectContaining({ monto_solicitado: expect.anything() })
      )
    );
  });
});

describe('mi cuenta', () => {
  test('recorre seguridad, contraseña y datos', async () => {
    iniciarSesionComo('OPERADOR');
    montar(<AccountSettingsModal isOpen onClose={vi.fn()} />);
    await screen.findByRole('dialog');
    await recorrerPestanas(async () => {
      const claves = document.querySelectorAll('input[type="password"]');
      for (const clave of claves) await userEvent.type(clave, 'Clave123!');
    });
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
  });
});

describe('afiliación pública', () => {
  const consultar = async (container) => {
    const entrada = container.querySelector('input');
    await userEvent.type(entrada, '1234567890123');
    fireEvent.submit(container.querySelector('form') || entrada);
  };

  test('quien no es cliente del banco pasa al formulario de la agencia', async () => {
    api.post.mockImplementation(async () => ({ data: { success: true, pertenece_banco: false, tipo_asociado: 'EX' } }));
    const { container } = montar(<PublicAffiliationPage />);
    await consultar(container);
    await screen.findByRole('button', { name: /Obtener número de caso/ });
    const campos = container.querySelectorAll('input');
    expect(campos.length).toBeGreaterThan(2);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalledWith(
      '/afiliacion/solicitar-nuevo',
      expect.objectContaining({ primer_nombre: '' })
    );
  });

  test('el cliente del banco debe validar sus credenciales', async () => {
    api.post.mockImplementation(async (url) =>
      url === '/afiliacion/validar-dpi'
        ? { data: { success: true, pertenece_banco: true, tipo_asociado: 'EB', nombre: 'Ana' } }
        : { data: { success: false, message: 'Credenciales inválidas' } }
    );
    const { container } = montar(<PublicAffiliationPage />);
    await consultar(container);
    await waitFor(() => expect(container.querySelector('input[type="password"]')).toBeTruthy());
    const campos = [...container.querySelectorAll('input')];
    for (const campo of campos)
      fireEvent.change(campo, { target: { value: campo.type === 'password' ? 'Clave123!' : 'usuario1' } });
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/afiliacion/validar-credenciales-banco', expect.anything())
    );
    expect(await screen.findByText(/Credenciales inválidas/)).toBeInTheDocument();
  });

  test('un DPI válido se consulta en el servidor', async () => {
    api.post.mockImplementation(async () => ({
      data: { success: true, esClienteBanco: false, data: { existe: false } },
    }));
    const { container } = montar(<PublicAffiliationPage />);
    const entrada = container.querySelector('input');
    await userEvent.type(entrada, '1234567890123');
    fireEvent.submit(container.querySelector('form') || entrada);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/afiliacion/validar-dpi', { cui_dpi: '1234567890123' }));
  });

  test('un DPI incompleto no se consulta', async () => {
    const { container } = montar(<PublicAffiliationPage />);
    const entrada = container.querySelector('input');
    await userEvent.type(entrada, '123');
    fireEvent.submit(container.querySelector('form') || entrada);
    await act(async () => {});
    expect(api.post).not.toHaveBeenCalledWith('/afiliacion/validar-dpi', expect.anything());
  });
});

describe('acciones sobre usuarios', () => {
  beforeEach(() => iniciarSesionComo('ADMINISTRADOR'));

  const abrirAccion = async (nombre) => {
    montar(<UsersPage />);
    await screen.findAllByText(BASE.usuario.email);
    await userEvent.click(screen.getByRole('button', { name: nombre }));
    return screen.findByRole('dialog');
  };

  test('reiniciar la contraseña la envía al servidor y recarga la lista', async () => {
    const dialogo = await abrirAccion(`Reiniciar la contraseña de ${BASE.usuario.codigo_corporativo}`);
    fireEvent.submit(dialogo.querySelector('form'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/usuarios/${BASE.usuario.id_usuario}/reset-password`, expect.anything())
    );
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/usuarios').length).toBeGreaterThan(1));
  });

  test('desactivar a un usuario cambia su estado y recarga la lista', async () => {
    const dialogo = await abrirAccion(`Desactivar a ${BASE.usuario.codigo_corporativo}`);
    const motivo = dialogo.querySelector('textarea, input');
    if (motivo) fireEvent.change(motivo, { target: { value: 'Ya no trabaja en la cooperativa' } });
    fireEvent.submit(dialogo.querySelector('form'));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        expect.stringContaining(`/usuarios/${BASE.usuario.id_usuario}`),
        expect.anything()
      )
    );
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/usuarios').length).toBeGreaterThan(1));
  });

  test('editar a un usuario guarda los cambios con PUT', async () => {
    const dialogo = await abrirAccion(`Editar a ${BASE.usuario.codigo_corporativo}`);
    fireEvent.change(within(dialogo).getByLabelText(/Correo/), { target: { value: 'cambiado@prueba.test' } });
    fireEvent.submit(dialogo.querySelector('form'));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        `/usuarios/${BASE.usuario.id_usuario}`,
        expect.objectContaining({ email: 'cambiado@prueba.test' })
      )
    );
  });

  test('buscar por código vuelve a pedir la lista', async () => {
    montar(<UsersPage />);
    await screen.findAllByText(BASE.usuario.email);
    const buscador = screen.getByLabelText('Buscar por código de usuario');
    await userEvent.type(buscador, 'OP-9');
    fireEvent.submit(buscador.closest('form'));
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/usuarios').length).toBeGreaterThan(2));
  });
});

describe('padrón y bandeja', () => {
  beforeEach(() => iniciarSesionComo('OPERADOR'));

  test('buscar en el padrón pide la primera página', async () => {
    const { container } = montar(<AssociatesManagementPage />);
    await screen.findAllByText(/Ana/);
    const formulario = container.querySelector('form');
    fireEvent.submit(formulario);
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([url]) => url === '/admin/asociados').length).toBeGreaterThan(1)
    );
  });

  test('ver el historial de traslados lo pide al servidor', async () => {
    api.get.mockImplementation(async (url, ...resto) =>
      url === '/operador/bandeja-solicitudes' ? { data: { success: true, data: [] } } : responder(url, ...resto)
    );
    montar(<OperatorDashboard />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/operador/bandeja-solicitudes'));
    await userEvent.click(screen.getByRole('tab', { name: /traslados/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Ver historial/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/operador/traslados/historial', expect.anything()));
  });
});

describe('afiliación en línea de una persona sin cuenta en el banco', () => {
  const llenarSolicitud = async (container) => {
    await userEvent.type(container.querySelector('input'), '1234567890123');
    fireEvent.submit(container.querySelector('form'));
    await screen.findByRole('button', { name: /Obtener número de caso/ });
    const escribir = (etiqueta, valor) =>
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
    escribir(/Primer nombre/, 'Nora');
    escribir(/Primer apellido/, 'Nueva');
    escribir(/Teléfono/, '55554444');
    escribir(/Correo electrónico/, 'nora@prueba.test');
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '1990' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '05' } });
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '10' } });
    fireEvent.submit(screen.getByRole('button', { name: /Obtener número de caso/ }).closest('form'));
  };

  const confirmarCodigo = async (codigo) => {
    const dialogo = await screen.findByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText(/Código de verificación/), codigo);
    fireEvent.submit(dialogo.querySelector('form'));
  };

  beforeEach(() => {
    api.get.mockImplementation(async () => ({ data: { success: true, disponible: true, data: [] } }));
  });

  test('verifica el correo con un código y registra la solicitud', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/afiliacion/validar-dpi') return { data: { success: true, pertenece_banco: false } };
      if (url === '/afiliacion/codigo-correo') return { data: { success: true, reenviar_en: 60 } };
      return { data: { success: true, data: { numero_caso: 'AF-2026-0001', fecha_solicitud: '2026-02-01' } } };
    });
    const { container } = montar(<PublicAffiliationPage />);
    await llenarSolicitud(container);
    await act(async () => {});
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/afiliacion/codigo-correo', { email: 'nora@prueba.test' })
    );
    await confirmarCodigo('123456');
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/afiliacion/solicitar-nuevo',
        expect.objectContaining({ cui_dpi: '1234567890123', primer_nombre: 'Nora', primer_apellido: 'Nueva' })
      )
    );
  });

  test('un código incorrecto se muestra en el mismo diálogo', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/afiliacion/validar-dpi') return { data: { success: true, pertenece_banco: false } };
      if (url === '/afiliacion/codigo-correo') return { data: { success: true, reenviar_en: 60 } };
      throw { response: { data: { success: false, error: 'CODIGO_INCORRECTO', message: 'El código no coincide.' } } };
    });
    const { container } = montar(<PublicAffiliationPage />);
    await llenarSolicitud(container);
    await confirmarCodigo('000000');
    expect(await screen.findByText(/código no coincide|no coincide/i)).toBeInTheDocument();
  });
});
