import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('coop_token') || null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar la sesión al inicializar la aplicación
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('coop_token');
      const storedUser = localStorage.getItem('coop_user');

      if (storedToken && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
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

  /**
   * Función para iniciar sesión con credenciales
   */
  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', {
        email: email.trim(),
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
      return { success: false, message: errorMessage };
    }
  };

  /**
   * Función para cerrar sesión
   */
  const logout = () => {
    localStorage.removeItem('coop_token');
    localStorage.removeItem('coop_user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook personalizado para acceder al contexto de autenticación
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};

export default AuthContext;
