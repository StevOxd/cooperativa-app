import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../services/api';
import { USUARIOS, iniciarSesionComo, montar } from './ayuda';
import { GoogleEmailConfigModal } from '../components/admin/GoogleEmailConfigModal';
import { AccountSettingsModal } from '../components/profile/AccountSettingsModal';

vi.mock('../services/api', async () => {
  const { apiFalsa } = await import('./apiFalsa');
  return { default: apiFalsa() };
});
vi.mock('../services/socket', () => ({
  initSocket: vi.fn(() => null),
  getSocket: vi.fn(() => null),
  disconnectSocket: vi.fn(),
}));

const GMAIL_CONECTADO = {
  provider: 'google',
  configured: true,
  verified: true,
  rawUser: 'avisos@gmail.com',
  userMasked: 'av***s@gmail.com',
  from: 'Cooperativa Norte <avisos@gmail.com>',
  lastError: null,
  disabled: false,
  smtp: null,
};
const SMTP_CONECTADO = {
  ...GMAIL_CONECTADO,
  provider: 'smtp',
  rawUser: 'avisos',
  userMasked: 'avisos',
  from: 'Cooperativa <notificaciones@coop.com>',
  smtp: { host: 'smtp.coop.com', port: 465, secure: true },
};

/** Respuestas de la API falsa: la sesión y el estado del correo. */
const responderEstado = (estado, usuario = USUARIOS.ADMINISTRADOR) => {
  api.get.mockImplementation(async (url) =>
    url === '/auth/me' ? { data: { success: true, user: usuario } } : { data: { success: true, data: estado } }
  );
};

const abrir = async (estado, { usuario } = {}) => {
  responderEstado(estado, usuario);
  const onConfigSaved = vi.fn();
  montar(<GoogleEmailConfigModal isOpen onClose={vi.fn()} onConfigSaved={onConfigSaved} />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/usuarios/email/status'));
  return { onConfigSaved };
};

const formulario = (id) => document.getElementById(id);
/** Campo por el comienzo de su etiqueta (las obligatorias terminan en «* (obligatorio)»). */
const campo = (etiqueta) =>
  screen.getByLabelText(new RegExp(`^${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\*.*)?$`));
const escribir = (etiqueta, valor) => fireEvent.change(campo(etiqueta), { target: { value: valor } });

beforeEach(() => {
  vi.clearAllMocks();
  iniciarSesionComo('ADMINISTRADOR');
});

describe('estado del correo', () => {
  test('muestra Gmail conectado y su remitente', async () => {
    await abrir(GMAIL_CONECTADO);
    expect(await screen.findByText('Conectado con Google')).toBeInTheDocument();
    expect(screen.getByText('av***s@gmail.com')).toBeInTheDocument();
    expect(campo('Correo de Gmail')).toHaveValue('avisos@gmail.com');
    expect(campo('Nombre del remitente')).toHaveValue('Cooperativa Norte');
  });

  test('con un SMTP activo abre su pestaña con los datos guardados', async () => {
    await abrir(SMTP_CONECTADO);
    expect(await screen.findByText('Conectado por SMTP')).toBeInTheDocument();
    expect(screen.getByText('smtp.coop.com:465')).toBeInTheDocument();
    expect(campo('Servidor')).toHaveValue('smtp.coop.com');
    expect(campo('Correo del remitente')).toHaveValue('notificaciones@coop.com');
    const ssl = screen.getByLabelText('Conexión segura desde el inicio (SSL)');
    expect(ssl).toBeChecked();
    expect(ssl).toBeDisabled();
    expect(ssl).toHaveAccessibleDescription(/Con el puerto 465 siempre va activada/);
  });

  test.each([
    [{ ...GMAIL_CONECTADO, disabled: true }, 'El envío de correos está desactivado'],
    [
      { ...GMAIL_CONECTADO, verified: false, lastError: 'Google no aceptó la cuenta' },
      'Configurado, pero sin verificar',
    ],
    [{ provider: 'demo', verified: false }, 'Los correos no se están enviando'],
  ])('avisa el estado %#', async (estado, texto) => {
    await abrir(estado);
    expect(await screen.findByText(texto)).toBeInTheDocument();
  });

  test('si no se puede consultar el estado, el formulario sigue disponible', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/auth/me') return { data: { success: true, user: USUARIOS.ADMINISTRADOR } };
      throw new Error('sin conexión');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar(<GoogleEmailConfigModal isOpen onClose={vi.fn()} />);
    expect(await screen.findByText('Los correos no se están enviando')).toBeInTheDocument();
  });
});

describe('guardar Gmail', () => {
  test('pide la cuenta, la contraseña de aplicación y la confirmación', async () => {
    await abrir(null);
    fireEvent.submit(formulario('config-correo'));
    expect(await screen.findAllByText(/Escriba la cuenta de Gmail/)).not.toHaveLength(0);

    escribir('Correo de Gmail', 'avisos@gmail.com');
    escribir('Contraseña de aplicación', 'abcd efgh ijkl mnop');
    fireEvent.submit(formulario('config-correo'));
    expect(await screen.findAllByText('Escriba su contraseña para confirmar.')).not.toHaveLength(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('envía la cuenta con la confirmación y limpia las contraseñas', async () => {
    const { onConfigSaved } = await abrir(null);
    api.post.mockResolvedValue({ data: { success: true, message: 'Gmail quedó conectado.', data: GMAIL_CONECTADO } });
    await userEvent.click(screen.getByRole('button', { name: /Cómo obtengo la contraseña/ }));
    expect(screen.getByRole('link', { name: /apppasswords/ })).toBeInTheDocument();

    escribir('Correo de Gmail', ' avisos@gmail.com ');
    escribir('Contraseña de aplicación', 'abcd efgh ijkl mnop');
    escribir('Nombre del remitente', 'Coop, "Norte"');
    escribir('Su contraseña de ingreso', 'Clave123!');
    fireEvent.submit(formulario('config-correo'));

    await waitFor(() => expect(onConfigSaved).toHaveBeenCalledWith(GMAIL_CONECTADO));
    expect(api.post).toHaveBeenCalledWith('/usuarios/email/config', {
      provider: 'google',
      gmail_user: 'avisos@gmail.com',
      gmail_app_password: 'abcd efgh ijkl mnop',
      email_from: 'Coop Norte <avisos@gmail.com>',
      password_actual: 'Clave123!',
    });
    expect(campo('Contraseña de aplicación')).toHaveValue('');
    expect(campo('Su contraseña de ingreso')).toHaveValue('');
  });

  test('si la confirmación falla, el aviso queda junto a la contraseña', async () => {
    await abrir(null);
    api.post.mockRejectedValue({ response: { status: 403, data: { message: 'Los datos no coinciden.' } } });
    escribir('Correo de Gmail', 'avisos@gmail.com');
    escribir('Contraseña de aplicación', 'abcd efgh ijkl mnop');
    escribir('Su contraseña de ingreso', 'Mala123!');
    fireEvent.submit(formulario('config-correo'));

    const entrada = campo('Su contraseña de ingreso');
    await waitFor(() => expect(entrada).toHaveAccessibleDescription('Los datos no coinciden.'));
    expect(entrada).toHaveValue('');
  });

  test('si falla el correo, conserva la confirmación para corregir los datos', async () => {
    await abrir(null);
    api.post.mockRejectedValue({ response: { status: 400, data: { message: 'Google rechazó la cuenta.' } } });
    escribir('Correo de Gmail', 'avisos@gmail.com');
    escribir('Contraseña de aplicación', 'abcd efgh ijkl mnop');
    escribir('Su contraseña de ingreso', 'Clave123!');
    fireEvent.submit(formulario('config-correo'));

    expect(await screen.findAllByText('Google rechazó la cuenta.')).not.toHaveLength(0);
    expect(campo('Su contraseña de ingreso')).toHaveValue('Clave123!');
  });

  test('con 2FA activo pide también el código de 6 dígitos', async () => {
    const conMfa = { ...USUARIOS.ADMINISTRADOR, mfa_enabled: true };
    localStorage.setItem('coop_user', JSON.stringify(conMfa));
    await abrir(null, { usuario: conMfa });
    api.post.mockResolvedValue({ data: { success: true, data: GMAIL_CONECTADO } });
    escribir('Correo de Gmail', 'avisos@gmail.com');
    escribir('Contraseña de aplicación', 'abcd efgh ijkl mnop');
    escribir('Su contraseña de ingreso', 'Clave123!');
    escribir('Código de verificación', '12a3');
    fireEvent.submit(formulario('config-correo'));
    expect(await screen.findAllByText('Escriba su contraseña y el código de 6 dígitos.')).not.toHaveLength(0);

    escribir('Su contraseña de ingreso', 'Clave123!');
    escribir('Código de verificación', '123456');
    fireEvent.submit(formulario('config-correo'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/usuarios/email/config',
        expect.objectContaining({ password_actual: 'Clave123!', codigo_2fa: '123456' })
      )
    );
  });
});

describe('guardar un servidor SMTP', () => {
  const abrirSmtp = async (estado = GMAIL_CONECTADO) => {
    await abrir(estado);
    await screen.findByText(/Conectado|no se están enviando/);
    await userEvent.click(screen.getByRole('tab', { name: 'Otro servidor (SMTP)' }));
  };

  test('avisa que el proveedor activo dejará de usarse', async () => {
    await abrirSmtp();
    expect(screen.getByText('Al guardar, los correos dejarán de salir por Gmail.')).toBeInTheDocument();
  });

  test('pide los datos del servidor y un remitente que sea correo', async () => {
    await abrirSmtp(null);
    fireEvent.submit(formulario('config-correo-smtp'));
    expect(await screen.findAllByText(/Escriba el servidor, el usuario y la contraseña/)).not.toHaveLength(0);

    escribir('Servidor', 'smtp.coop.com');
    escribir('Usuario', 'avisos');
    escribir('Contraseña del servidor de correo', 'secreta');
    fireEvent.submit(formulario('config-correo-smtp'));
    expect(await screen.findAllByText(/el usuario de este servidor no es un correo/)).not.toHaveLength(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('con el puerto 465 la conexión segura va siempre activada', async () => {
    await abrirSmtp(null);
    const ssl = screen.getByLabelText('Conexión segura desde el inicio (SSL)');
    await userEvent.click(ssl);
    expect(ssl).toBeChecked();

    const puerto = campo('Puerto');
    fireEvent.change(puerto, { target: { value: '465' } });
    expect(ssl).toBeDisabled();
    fireEvent.change(puerto, { target: { value: '587' } });
    expect(ssl).not.toBeChecked();
    expect(ssl).toBeEnabled();
  });

  test('envía el servidor con la confirmación y limpia su contraseña', async () => {
    await abrirSmtp(null);
    api.post.mockResolvedValue({ data: { success: true, data: SMTP_CONECTADO } });
    escribir('Servidor', ' smtp.coop.com ');
    fireEvent.change(campo('Puerto'), { target: { value: '465' } });
    escribir('Usuario', 'avisos@coop.com');
    escribir('Contraseña del servidor de correo', 'secreta');
    escribir('Su contraseña de ingreso', 'Clave123!');
    fireEvent.submit(formulario('config-correo-smtp'));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/usuarios/email/config', {
        provider: 'smtp',
        smtp_host: 'smtp.coop.com',
        smtp_port: 465,
        smtp_secure: true,
        smtp_user: 'avisos@coop.com',
        smtp_pass: 'secreta',
        email_from: 'Cooperativa Corporativa <avisos@coop.com>',
        password_actual: 'Clave123!',
      })
    );
    await waitFor(() => expect(campo('Contraseña del servidor de correo')).toHaveValue(''));
  });
});

describe('correo de prueba', () => {
  const enviarPrueba = async (destino) => {
    fireEvent.change(screen.getByLabelText('Correo de destino para la prueba'), { target: { value: destino } });
    fireEvent.submit(formulario('prueba-correo'));
  };

  test('pide un destino válido', async () => {
    await abrir(GMAIL_CONECTADO);
    await enviarPrueba('sin-arroba');
    expect(await screen.findAllByText('Escriba un correo de destino válido.')).not.toHaveLength(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('muestra el identificador de un envío real', async () => {
    await abrir(GMAIL_CONECTADO);
    api.post.mockResolvedValue({
      data: { success: true, message: 'Correo de prueba enviado.', data: { simulado: false, messageId: '<id-1>' } },
    });
    await enviarPrueba('destino@coop.com');
    expect(await screen.findByText('<id-1>')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/usuarios/email/test', { to: 'destino@coop.com' });
  });

  test('avisa cuando el correo no salió', async () => {
    await abrir(null);
    api.post.mockResolvedValue({ data: { success: true, message: 'No salió.', data: { simulado: true } } });
    await enviarPrueba('destino@coop.com');
    expect(await screen.findByText('El correo no salió')).toBeInTheDocument();
  });

  test('muestra el error del servidor', async () => {
    await abrir(GMAIL_CONECTADO);
    api.post.mockRejectedValue({ response: { data: { message: 'No se pudo enviar.' } } });
    await enviarPrueba('destino@coop.com');
    expect(await screen.findAllByText('No se pudo enviar.')).not.toHaveLength(0);
  });
});

describe('desactivar la verificación en dos pasos', () => {
  const abrirConMfa = async () => {
    api.get.mockImplementation(async (url) =>
      url === '/auth/2fa/status'
        ? { data: { success: true, mfa_enabled: true } }
        : { data: { success: true, user: USUARIOS.ADMINISTRADOR } }
    );
    montar(<AccountSettingsModal isOpen onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    return screen.getByRole('heading', { name: 'Desactivar la verificación en dos pasos' }).closest('form');
  };

  test('pide la contraseña y un código de 6 dígitos', async () => {
    const form = await abrirConMfa();
    escribir('Código de verificación', '12ab3');
    expect(campo('Código de verificación')).toHaveValue('123');
    fireEvent.submit(form);
    expect(await screen.findByText(/Escriba su contraseña actual y el código de 6 dígitos/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('con datos correctos la desactiva', async () => {
    const form = await abrirConMfa();
    api.post.mockResolvedValue({ data: { success: true } });
    escribir('Contraseña actual', 'Clave123!');
    escribir('Código de verificación', '123456');
    fireEvent.submit(form);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/2fa/disable', { password: 'Clave123!', totp_code: '123456' })
    );
    expect(await screen.findAllByText('Verificación en dos pasos desactivada.')).not.toHaveLength(0);
  });

  test.each([
    [
      'el servidor no la desactiva',
      () => Promise.resolve({ data: { success: false, message: 'No se pudo.' } }),
      'No se pudo.',
    ],
    [
      'la contraseña o el código no coinciden',
      () => Promise.reject({ response: { data: { message: 'Código incorrecto.' } } }),
      'Código incorrecto.',
    ],
  ])('si %s, lo avisa', async (_caso, respuesta, mensaje) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const form = await abrirConMfa();
    api.post.mockImplementation(respuesta);
    escribir('Contraseña actual', 'Clave123!');
    escribir('Código de verificación', '123456');
    fireEvent.submit(form);
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  test('cancelar cierra el formulario', async () => {
    await abrirConMfa();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('heading', { name: 'Desactivar la verificación en dos pasos' })).not.toBeInTheDocument();
  });
});
