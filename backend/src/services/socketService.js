const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { validarSesion } = require('./sesionService');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

let io = null;
// Mapeos en memoria para conexiones activas. userId es usuarios.id_usuario (issue #32: una persona
// puede tener dos usuarios, cada uno con su propia sesión). Cada socket guarda además la sesión con la
// que se autenticó (socket.sesionId).
// userId -> Set de socketIds
const userSockets = new Map();
// socketId -> userId
const socketUser = new Map();
// socketId -> sesion_activa_id con la que se autenticó
const socketSesion = new Map();
// Sala de los sockets que reciben la presencia de los usuarios: solo administradores con sesión vigente
const SALA_PRESENCIA = 'presencia-administradores';

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
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
          return callback(null, true);
        }

        const isLocalOrLan = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
        if (isLocalOrLan || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }

        return callback(new Error('[WS SECURITY ERROR] Conexión WebSocket rechazada por origen no autorizado.'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Autenticación opcional por handshake: el socket queda asociado al usuario solo si el token es de una
  // sesión vigente (las mismas reglas que verifyToken). Si no, se conecta como anónimo. El token va en `auth`,
  // nunca en la URL (`?token=` quedaría en el registro de nginx).
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const sesion = await autenticarToken(token);
        if (sesion) {
          socket.userId = sesion.idUsuario;
          socket.sesionId = sesion.sesionId;
          socket.rol = sesion.rol;
        }
      } catch (err) {
        registrarErrorDeToken(err);
      }
    }
    return next();
  });

  io.on('connection', (socket) => {
    // Si vino autenticado en el handshake
    if (socket.userId) {
      registrarSocketUsuario(socket.userId, socket.id, socket.sesionId);
      if (socket.rol === 'ADMINISTRADOR') socket.join(SALA_PRESENCIA);
    }

    // Evento de autenticación manual o re-autenticación
    socket.on('authenticate', async (data) => {
      try {
        const token = data?.token;
        if (!token) return;
        const sesion = await autenticarToken(token);
        // El socket pudo cerrarse mientras se consultaba la base de datos
        if (!socket.connected) return;
        if (!sesion) {
          socket.emit('authenticated', { success: false, message: 'Token inválido' });
          return;
        }
        // Deja de contar como conexión del usuario o la sesión anteriores
        const anterior = socket.userId;
        if (anterior) {
          desregistrarSocketUsuario(anterior, socket.id);
          if (anterior !== sesion.idUsuario && !isUserConnected(anterior)) broadcastPresence(anterior, false);
        }
        socket.userId = sesion.idUsuario;
        socket.sesionId = sesion.sesionId;
        socket.rol = sesion.rol;
        registrarSocketUsuario(sesion.idUsuario, socket.id, sesion.sesionId);
        if (sesion.rol === 'ADMINISTRADOR') socket.join(SALA_PRESENCIA);
        else socket.leave(SALA_PRESENCIA);
        socket.emit('authenticated', { success: true, userId: sesion.idUsuario });
      } catch (error) {
        registrarErrorDeToken(error);
        if (socket.connected) socket.emit('authenticated', { success: false, message: 'Token inválido' });
      }
    });

    // Evento de Heartbeat / Ping de presencia activa
    socket.on('ping_presencia', async () => {
      if (socket.userId) {
        try {
          // Solo cuenta como presencia mientras la sesión del socket siga siendo la vigente
          const ping = await db.query(
            'UPDATE usuarios SET ultimo_ping = CURRENT_TIMESTAMP WHERE id_usuario = $1 AND sesion_activa_id = $2',
            [socket.userId, socket.sesionId]
          );
          if (ping.rowCount > 0) socket.emit('pong_presencia', { timestamp: new Date().toISOString() });
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

        // Si ya no quedan conexiones de esta sesión, cerrarla en DB. Si el usuario ya tiene otra sesión
        // (cerró y volvió a entrar), esa no se toca.
        if (socket.sesionId && !isUserConnected(userId, socket.sesionId)) {
          try {
            const cierre = await db.query(
              'UPDATE usuarios SET sesion_activa_id = NULL, ultimo_ping = NULL WHERE id_usuario = $1 AND sesion_activa_id = $2',
              [userId, socket.sesionId]
            );
            // Notificar a clientes que el usuario se desconectó
            if (cierre.rowCount > 0) broadcastPresence(userId, false);
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
 * Verifica un token de WebSocket con las mismas reglas que las rutas HTTP (sesionService).
 *
 * @async
 * @param {string} token - JWT enviado por el cliente.
 * @returns {Promise<{idUsuario: number, sesionId: string, rol: string}|null>} null si no es una sesión vigente.
 * @throws {Error} si la firma es inválida, el token venció o falla la consulta a la base de datos.
 */
const autenticarToken = async (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);
  const sesion = await validarSesion(decoded);
  return sesion.valida ? { idUsuario: sesion.idUsuario, sesionId: decoded.sesion_activa_id, rol: sesion.usuario.rol } : null;
};

/**
 * Registra el error al autenticar un socket: un token inválido es un aviso; cualquier otro, un error.
 *
 * @param {Error} err
 */
const registrarErrorDeToken = (err) => {
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    console.warn('[SECURITY WARN] Token inválido en conexión WebSocket:', err.message);
  } else {
    console.error('[ERROR] No se pudo autenticar la conexión WebSocket:', err.message);
  }
};

/**
 * Registra un socket para un usuario y la sesión con la que se autenticó.
 *
 * @param {number} userId - usuarios.id_usuario.
 * @param {string} socketId
 * @param {string} sesionId - sesion_activa_id del token del socket.
 */
const registrarSocketUsuario = async (userId, socketId, sesionId) => {
  userId = Number(userId);
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
  socketUser.set(socketId, userId);
  socketSesion.set(socketId, sesionId);

  // Actualizar ultimo_ping en base de datos, solo si la sesión sigue siendo la vigente
  try {
    const ping = await db.query(
      'UPDATE usuarios SET ultimo_ping = CURRENT_TIMESTAMP WHERE id_usuario = $1 AND sesion_activa_id = $2',
      [userId, sesionId]
    );
    if (ping.rowCount > 0) broadcastPresence(userId, true);
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
  socketSesion.delete(socketId);
  if (userSockets.has(userId)) {
    const sockets = userSockets.get(userId);
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  }
};

/**
 * Sockets abiertos de un usuario; si se indica la sesión, solo los que se autenticaron con ella.
 *
 * @param {number} userId
 * @param {string} [sesionId]
 * @returns {string[]} ids de socket.
 */
const socketsDelUsuario = (userId, sesionId) => {
  const sockets = [...(userSockets.get(Number(userId)) || [])];
  return sesionId === undefined ? sockets : sockets.filter((socketId) => socketSesion.get(socketId) === sesionId);
};

/**
 * Verifica si un usuario tiene conexión activa por WebSockets. Con `sesionId`, solo cuentan los sockets
 * de esa sesión: los de una sesión ya cerrada no la mantienen abierta.
 *
 * @param {number} userId
 * @param {string|null} [sesionId]
 * @returns {boolean}
 */
const isUserConnected = (userId, sesionId) => {
  if (sesionId === null) return false;
  return socketsDelUsuario(userId, sesionId).length > 0;
};

/**
 * Emite una alerta de seguridad en tiempo real a los sockets de la sesión activa del usuario.
 *
 * @param {number} userId
 * @param {string} message
 * @param {string} sesionId - Sesión vigente del usuario (sesion_activa_id).
 * @returns {boolean} true si había a quién avisar.
 */
const sendSecurityAlert = (userId, message, sesionId) => {
  if (!io) return false;
  const sockets = socketsDelUsuario(userId, sesionId);
  sockets.forEach((socketId) => {
    io.to(socketId).emit('security_alert', {
      message,
      titulo: 'Advertencia de Seguridad Bancaria',
      tipo: 'CONCURRENT_LOGIN_ATTEMPT',
      timestamp: new Date().toISOString(),
    });
  });
  return sockets.length > 0;
};

/**
 * Emite una actualización de presencia. Solo la reciben los administradores con sesión vigente (su monitor de
 * presencia): un socket anónimo o de otro rol no se entera de quién entra y sale.
 */
const broadcastPresence = (userId, enLinea) => {
  userId = Number(userId);
  if (io) {
    io.to(SALA_PRESENCIA).emit('presence_update', { id_usuario: userId, en_linea: Boolean(enLinea) });
  }
};

/**
 * Desconecta forzosamente todas las conexiones de un usuario. Se usa al cerrar su sesión desde el servidor
 * (logout, desactivación o reinicio de contraseña).
 *
 * @param {number} userId
 */
const disconnectUser = (userId) => {
  userId = Number(userId);
  if (!io) return;
  socketsDelUsuario(userId).forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.disconnect(true);
    desregistrarSocketUsuario(userId, socketId);
  });
};

/**
 * Emite un evento a los sockets de una sesión concreta de un usuario.
 *
 * @returns {boolean} true si había a quién enviarlo.
 */
const emitirASesion = (userId, sesionId, event, payload) => {
  if (!io || !sesionId) return false;
  const sockets = socketsDelUsuario(userId, sesionId);
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
  return sockets.length > 0;
};

/**
 * Emite un evento en tiempo real a las conexiones de la sesión vigente de un usuario.
 *
 * @async
 * @param {number} userId - usuarios.id_usuario.
 * @param {string} event
 * @param {object} payload
 * @returns {Promise<boolean>} true si había a quién enviarlo.
 */
const emitToUser = async (userId, event, payload) => {
  if (!io || !isUserConnected(userId)) return false;
  try {
    const res = await db.query(
      "SELECT sesion_activa_id FROM usuarios WHERE id_usuario = $1 AND estado = 'ACTIVO'",
      [Number(userId)]
    );
    return emitirASesion(userId, res.rows[0]?.sesion_activa_id, event, payload);
  } catch (err) {
    console.error('Error en emitToUser:', err.message);
    return false;
  }
};

/**
 * Emite un evento en tiempo real a todos los usuarios conectados con un rol específico
 */
const emitToRole = async (rolCodigo, event, payload) => {
  if (!io) return false;
  try {
    const res = await db.query(
      `SELECT u.id_usuario, u.sesion_activa_id FROM usuarios u JOIN roles r ON u.id_rol = r.id_rol
       WHERE r.codigo = $1 AND u.estado = 'ACTIVO' AND u.sesion_activa_id IS NOT NULL`,
      [rolCodigo]
    );
    res.rows.forEach((row) => {
      emitirASesion(row.id_usuario, row.sesion_activa_id, event, payload);
    });
    return true;
  } catch (err) {
    console.error('Error en emitToRole:', err.message);
    return false;
  }
};

/**
 * Retorna todos los IDs de usuarios conectados actualmente
 *
 * @function getConnectedUserIds
 * @returns {Array<number>} Arreglo con los id_usuario con sesiones abiertas.
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
  emitToUser,
  emitToRole,
};
