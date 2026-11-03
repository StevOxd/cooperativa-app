import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const socketFalso = { connected: false, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), off: vi.fn() };
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socketFalso) }));

describe('cliente de la API', () => {
  let api;

  beforeEach(async () => {
    ({ default: api } = await import('../services/api'));
  });

  const responderCon = (status, data, url = '/usuarios') => {
    api.defaults.adapter = async (config) => {
      const error = new Error(`status ${status}`);
      error.config = { ...config, url };
      error.response = { status, data, config, headers: {} };
      if (status < 400) return { status, data, config, headers: {}, statusText: 'OK' };
      throw error;
    };
  };

  test('adjunta el token guardado a cada petición', async () => {
    localStorage.setItem('coop_token', 'tk');
    let cabecera;
    api.defaults.adapter = async (config) => {
      cabecera = config.headers.Authorization;
      return { status: 200, data: {}, config, headers: {}, statusText: 'OK' };
    };
    await api.get('/usuarios');
    expect(cabecera).toBe('Bearer tk');
  });

  test('cambia el error 413 de nginx por un mensaje para el usuario', async () => {
    responderCon(413, '<html></html>');
    await expect(api.post('/subir', {})).rejects.toMatchObject({
      response: { data: { success: false, message: expect.stringContaining('demasiado grande') } },
    });
  });

  test('avisa cuando el servidor exige cambiar la contraseña', async () => {
    localStorage.setItem('coop_user', JSON.stringify({ id: 1 }));
    const aviso = vi.fn();
    window.addEventListener('coop_force_password_change', aviso);
    responderCon(403, { debe_cambiar_password: true });
    await expect(api.get('/usuarios')).rejects.toBeTruthy();
    expect(JSON.parse(localStorage.getItem('coop_user')).debe_cambiar_password).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    window.removeEventListener('coop_force_password_change', aviso);
  });

  test('un 401 fuera del login limpia la sesión', async () => {
    localStorage.setItem('coop_token', 'tk');
    localStorage.setItem('coop_user', '{}');
    window.history.pushState({}, '', '/login');
    responderCon(401, {});
    await expect(api.get('/usuarios')).rejects.toBeTruthy();
    expect(localStorage.getItem('coop_token')).toBeNull();
  });

  test('un 401 del login no toca la sesión', async () => {
    localStorage.setItem('coop_token', 'tk');
    responderCon(401, {}, '/auth/login');
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(localStorage.getItem('coop_token')).toBe('tk');
  });
});

describe('socket', () => {
  afterEach(() => vi.useRealTimers());

  test('se conecta con el token, reporta presencia y se desconecta', async () => {
    vi.useFakeTimers();
    const { initSocket, getSocket, disconnectSocket } = await import('../services/socket');
    const { io } = await import('socket.io-client');
    const socket = initSocket('tk');
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ auth: { token: 'tk' } }));
    expect(getSocket()).toBe(socket);

    const alConectar = socketFalso.on.mock.calls.find(([evento]) => evento === 'connect')[1];
    alConectar();
    expect(socketFalso.emit).toHaveBeenCalledWith('ping_presencia');

    socketFalso.connected = true;
    vi.advanceTimersByTime(45000);
    expect(socketFalso.emit).toHaveBeenCalledTimes(2);
    expect(initSocket('otro')).toBe(socket);

    const alDesconectar = socketFalso.on.mock.calls.find(([evento]) => evento === 'disconnect')[1];
    alDesconectar();
    disconnectSocket();
    expect(socketFalso.disconnect).toHaveBeenCalled();
  });
});
