import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor de solicitudes para adjuntar automáticamente el token JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('coop_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor de respuestas para capturar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si el backend responde 403 por cambio obligatorio de contraseña
    if (error.response && error.response.status === 403 && error.response.data?.debe_cambiar_password) {
      const storedUser = localStorage.getItem('coop_user');
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          parsed.debe_cambiar_password = true;
          localStorage.setItem('coop_user', JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent('coop_force_password_change'));
        } catch (_) {}
      }
    }

    // Si el backend responde 401 y no es la ruta de login, limpiar sesión
    if (
      error.response &&
      error.response.status === 401 &&
      !error.config.url.includes('/auth/login')
    ) {
      localStorage.removeItem('coop_token');
      localStorage.removeItem('coop_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
