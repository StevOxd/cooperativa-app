const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

let io = null;
// Mapeos en memoria para conexiones activas
// userId -> Set de socketIds
const userSockets = new Map();
// socketId -> userId
const socketUser = new Map();

/**
 * Inicializa el servidor de Socket.io y configura los interceptores de autenticación y presencia.
 *
 * @function init
 * @param {import('http').Server} httpServer - Instancia del servidor HTTP de Node.js.
 * @returns {import('socket.io').Server} Instancia inicializada de Socket.io.
 */
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Middleware de autenticación opcional por handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id_persona || decoded.id;
        socket.userId = Number(userId);
      } catch (err) {
        console.warn('[SECURITY WARN] Token inválido en conexión WebSocket:', err.message);
      }
    }
    return next();
  });

  io.on('connection', (socket) => {
    // Si vino autenticado en el handshake
    if (socket.userId) {
      registrarSocketUsuario(socket.userId, socket.id);
    }

    // Evento de autenticación manual o re-autenticación
    socket.on('authenticate', (data) => {
      try {
        const token = data?.token;
        if (!token) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = Number(decoded.id_persona || decoded.id);
        socket.userId = userId;
        registrarSocketUsuario(userId, socket.id);
        socket.emit('authenticated', { success: true, userId });
      } catch (error) {
        socket.emit('authenticated', { success: false, message: 'Token inválido' });
      }
    });

    // Evento de Heartbeat / Ping de presencia activa
    socket.on('ping_presencia', async () => {
      if (socket.userId) {
        try {
          await db.query(
            'UPDATE usuarios SET ultimo_ping = CURRENT_TIMESTAMP WHERE id_persona = $1',
            [socket.userId]
          );
          socket.emit('pong_presencia', { timestamp: new Date().toISOString() });
        } catch (error) {
          console.error('Error al actualizar ultimo_ping:', error.message);
        }
      }
    });

    // Manejo de desconexión
    socket.on('disconnect', async () => {
      const userId = socket.userId || socketUser.get(socket.id);
      if (userId) {
        desregistrarSocketUsuario(userId, socket.id);

        // Si ya no quedan conexiones activas para este usuario, limpiar en DB
        if (!isUserConnected(userId)) {
          try {
            await db.query(
              'UPDATE usuarios SET sesion_activa_id = NULL, ultimo_ping = NULL WHERE id_persona = $1',
              [userId]
            );
            // Notificar a clientes que el usuario se desconectó
            if (io) {
              io.emit('presence_update', { id_persona: Number(userId), en_linea: false });
            }
          } catch (err) {
            console.error('Error al limpiar sesión en desconexión:', err.message);
          }
        }
      }
    });
  });

  console.log('[WS] Servicio de Socket.io inicializado correctamente.');
  return io;
};

/**
 * Registra un socket para un usuario
 */
const registrarSocketUsuario = async (userId, socketId) => {
  userId = Number(userId);
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
  socketUser.set(socketId, userId);

  // Actualizar ultimo_ping en base de datos
  try {
    await db.query(
      'UPDATE usuarios SET ultimo_ping = CURRENT_TIMESTAMP WHERE id_persona = $1',
      [userId]
    );
    if (io) {
      io.emit('presence_update', { id_persona: userId, en_linea: true });
    }
  } catch (error) {
    console.error('Error al actualizar presencia en DB:', error.message);
  }
};

/**
 * Desregistra un socket de un usuario
 */
const desregistrarSocketUsuario = (userId, socketId) => {
  userId = Number(userId);
  socketUser.delete(socketId);
  if (userSockets.has(userId)) {
    const sockets = userSockets.get(userId);
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  }
};

/**
 * Verifica si un usuario tiene conexión activa por WebSockets
 */
const isUserConnected = (userId) => {
  userId = Number(userId);
  return userSockets.has(userId) && userSockets.get(userId).size > 0;
};

/**
 * Emite una alerta de seguridad en tiempo real al usuario que tiene la sesión activa
 */
const sendSecurityAlert = (userId, message) => {
  userId = Number(userId);
  if (!io) return false;

  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    sockets.forEach((socketId) => {
      io.to(socketId).emit('security_alert', {
        message,
        titulo: 'Advertencia de Seguridad Bancaria',
        tipo: 'CONCURRENT_LOGIN_ATTEMPT',
        timestamp: new Date().toISOString(),
      });
    });
    return true;
  }
  return false;
};

/**
 * Emite una actualización de presencia a todos los clientes conectados
 */
const broadcastPresence = (userId, enLinea) => {
  userId = Number(userId);
  if (io) {
    io.emit('presence_update', { id_persona: userId, en_linea: Boolean(enLinea) });
  }
};

/**
 * Desconecta forzosamente todas las sesiones de un usuario
 */
const disconnectUser = (userId) => {
  userId = Number(userId);
  if (!io) return;
  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    sockets.forEach((socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });
    userSockets.delete(userId);
  }
};

/**
 * Retorna todos los IDs de usuarios conectados actualmente
 *
 * @function getConnectedUserIds
 * @returns {Array<number>} Arreglo con los identificadores de persona con sesiones abiertas.
 */
const getConnectedUserIds = () => {
  return Array.from(userSockets.keys());
};

/**
 * Obtiene la instancia activa del servidor de Socket.io.
 *
 * @function getIO
 * @returns {import('socket.io').Server|null} Instancia del servidor Socket.io o null si no se ha inicializado.
 */
const getIO = () => io;

module.exports = {
  init,
  getIO,
  isUserConnected,
  sendSecurityAlert,
  disconnectUser,
  broadcastPresence,
  getConnectedUserIds,
  registrarSocketUsuario,
};
