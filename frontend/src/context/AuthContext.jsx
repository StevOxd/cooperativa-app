import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { initSocket, disconnectSocket, getSocket } from '../services/socket';
import { SecurityAlertModal } from '../components/common/SecurityAlertModal';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('coop_token') || null);
  const [isLoading, setIsLoading] = useState(true);
  const [securityAlert, setSecurityAlert] = useState(null);

  // Inicializar o reconectar socket cuando haya token y usuario
  const setupSocketListeners = (userToken) => {
    try {
      const socket = initSocket(userToken);
      if (socket) {
        socket.off('security_alert');
        socket.on('security_alert', (data) => {
          console.warn('[SECURITY ALERT] Alerta de seguridad recibida por Socket.io:', data);
          setSecurityAlert(data);
        });
      }
    } catch (err) {
      console.error('Error al inicializar socket:', err);
    }
  };

  // Verificar la sesión al inicializar la aplicación
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('coop_token');
      const storedUser = localStorage.getItem('coop_user');

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setToken(storedToken);
          setupSocketListeners(storedToken);

          // Validar con el backend que el token siga siendo vigente
          const response = await api.get('/auth/me');
          if (response.data?.success && response.data?.user) {
            setUser(response.data.user);
            localStorage.setItem('coop_user', JSON.stringify(response.data.user));
          }
        } catch (error) {
          console.warn('Sesión no válida o expirada:', error.message);
          logout();
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  // Temporizador de inactividad: 10 minutos (600,000 ms) sin actividad del usuario
  useEffect(() => {
    if (!token || !user) return;

    const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
    let timerId;

    const handleTimeout = async () => {
      console.warn('[AUTH] Sesión cerrada automáticamente por inactividad de 10 minutos.');
      await logout();
      window.location.href = '/login?motivo=inactividad';
    };

    const resetTimer = () => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(handleTimeout, INACTIVITY_TIMEOUT_MS);
    };

    // Iniciar temporizador
    resetTimer();

    // Eventos de interacción del usuario
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    let lastActivityLogged = Date.now();

    const onUserActivity = () => {
      const now = Date.now();
      // Throttling: registrar actividad máximo cada 2 segundos
      if (now - lastActivityLogged > 2000) {
        lastActivityLogged = now;
        localStorage.setItem('coop_last_activity', now.toString());
        resetTimer();
      }
    };

    // Sincronización entre pestañas
    const onStorageSync = (e) => {
      if (e.key === 'coop_last_activity') {
        resetTimer();
      }
    };

    events.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });
    window.addEventListener('storage', onStorageSync);

    return () => {
      if (timerId) clearTimeout(timerId);
      events.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      window.removeEventListener('storage', onStorageSync);
    };
  }, [token, user]);

  /**
   * Función para iniciar sesión con credenciales
   */
  const login = async (identifier, password) => {
    try {
      const response = await api.post('/auth/login', {
        identifier: identifier.trim(),
        email: identifier.trim(),
        password,
      });

      if (response.data?.success) {
        const { token: receivedToken, user: receivedUser } = response.data;
        
        // Guardar en localStorage
        localStorage.setItem('coop_token', receivedToken);
        localStorage.setItem('coop_user', JSON.stringify(receivedUser));

        // Actualizar estado reactivo
        setToken(receivedToken);
        setUser(receivedUser);

        // Inicializar socket con el nuevo token
        setupSocketListeners(receivedToken);

        return { success: true, user: receivedUser };
      }

      return {
        success: false,
        message: response.data?.message || 'Error al iniciar sesión',
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        'No se pudo conectar con el servidor. Verifique que el backend esté ejecutándose.';
      return { 
        success: false, 
        message: errorMessage,
        bloqueado: error.response?.data?.bloqueado || false,
        sesion_concurrente: error.response?.data?.sesion_concurrente || false,
      };
    }
  };

  /**
   * Cierra formalmente la sesión activa del usuario.
   * Emite `POST /api/auth/logout` al servidor, desconecta el socket singleton
   * y purga de forma segura `localStorage` y `sessionStorage`.
   *
   * @async
   * @function logout
   * @returns {Promise<void>}
   */
  const logout = async () => {
    try {
      const currentToken = localStorage.getItem('coop_token');
      if (currentToken) {
        // Notificar al backend para limpiar sesion_activa_id
        await api.post('/auth/logout').catch(() => {});
      }
    } catch (e) {
      // Ignorar fallos de red al cerrar sesión
    } finally {
      disconnectSocket();
      localStorage.removeItem('coop_token');
      localStorage.removeItem('coop_user');
      localStorage.removeItem('coop_last_activity');
      sessionStorage.clear();
      setToken(null);
      setUser(null);
      setSecurityAlert(null);
    }
  };

  /**
   * Actualiza campos específicos del usuario autenticado en memoria y en `localStorage`.
   *
   * @function updateUserData
   * @param {Object} updatedFields - Objeto con los atributos modificados (ej. `{ telefono: '...' }`).
   */
  const updateUserData = (updatedFields) => {
    setUser((prevUser) => {
      const newUser = { ...prevUser, ...updatedFields };
      localStorage.setItem('coop_user', JSON.stringify(newUser));
      return newUser;
    });
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    updateUserData,
    securityAlert,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SecurityAlertModal
        alert={securityAlert}
        onClose={() => setSecurityAlert(null)}
        onLogout={logout}
      />
    </AuthContext.Provider>
  );
};

/**
 * Hook de React para consumir de forma segura el contexto global de autenticación.
 *
 * @function useAuth
 * @returns {Object} Objeto de contexto con { user, token, isAuthenticated, isLoading, login, logout, updateUserData, securityAlert }.
 * @throws {Error} Si se invoca fuera de un `AuthProvider`.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};

