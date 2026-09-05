import { io } from 'socket.io-client';

let socket = null;
let pingInterval = null;

/**
 * Inicializa y conecta el cliente de Socket.io
 */
export const initSocket = (token) => {
  if (socket && socket.connected) {
    return socket;
  }

  // Si ya existía desconectado, cerrarlo antes
  if (socket) {
    socket.disconnect();
  }

  // Conexión directa al backend parametrizada por variable de entorno o fallback a hostname:5001
  // Esto evita que el proxy de desarrollo interfiera y garantiza máxima estabilidad
  const socketUrl =
    import.meta.env.VITE_SOCKET_URL ||
    `${window.location.protocol}//${window.location.hostname}:5001`;

  socket = io(socketUrl, {
    auth: {
      token: token || localStorage.getItem('coop_token'),
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    // Iniciar latido de presencia periódica (cada 45 segundos)
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (socket && socket.connected) {
        socket.emit('ping_presencia');
      }
    }, 45000);
    // Enviar ping inicial de presencia
    socket.emit('ping_presencia');
  });

  socket.on('disconnect', () => {
    if (pingInterval) clearInterval(pingInterval);
  });

  return socket;
};

/**
 * Obtiene la instancia activa del socket
 */
export const getSocket = () => socket;

/**
 * Desconecta formalmente el socket
 */
export const disconnectSocket = () => {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
