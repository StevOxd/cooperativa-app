import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Building2,
  ArrowRight,
  AlertCircle,
  ShieldAlert,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const identifierInputRef = useRef(null);

  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Control de sesión al entrar o retroceder a la pantalla de login
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const motivo = searchParams.get('motivo');
    const teniaToken = Boolean(localStorage.getItem('coop_token'));

    if (motivo === 'inactividad') {
      setInfoMessage('Su sesión ha expirado automáticamente por inactividad (10 minutos) para proteger su cuenta.');
      logout();
    } else if (teniaToken) {
      setInfoMessage('Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso.');
      logout();
    }

    setIdentifier('');
    setPassword('');

    const handleBackForward = () => {
      if (localStorage.getItem('coop_token')) {
        setInfoMessage('Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso.');
        logout();
      }
      setIdentifier('');
      setPassword('');
    };

    window.addEventListener('pageshow', handleBackForward);
    window.addEventListener('popstate', handleBackForward);

    return () => {
      window.removeEventListener('pageshow', handleBackForward);
      window.removeEventListener('popstate', handleBackForward);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    if (!identifier.trim() || !password) {
      setErrorMessage('Por favor ingrese su código corporativo o correo electrónico y contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(identifier, password);
      if (result.success) {
        // Navegar sin replace: true para permitir retroceso controlado
        navigate('/dashboard');
      } else {
        setErrorMessage(result.message || 'Credenciales inválidas.');
        setIdentifier('');
        setPassword('');
        identifierInputRef.current?.focus();
      }
    } catch (err) {
      setErrorMessage('Ocurrió un error inesperado. Por favor intente nuevamente.');
      setIdentifier('');
      setPassword('');
      identifierInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative"
      style={{
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}
    >
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-white">
        {/* Panel lateral izquierdo - Branding Institucional */}
        <div className="lg:col-span-5 bg-emerald-900 p-8 lg:p-12 text-white flex flex-col justify-between relative">
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-10">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-sm">
                <Building2 className="w-7 h-7 text-emerald-300" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight block">COOPERATIVA</span>
                <span className="text-xs text-emerald-300 tracking-wider font-semibold uppercase">Portal Institucional</span>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl lg:text-3xl font-bold leading-tight">
                Sistema de Gestión Financiera y Autogestión
              </h2>
              <p className="text-emerald-100/90 text-sm leading-relaxed">
                Plataforma corporativa centralizada para la administración de asociados, operaciones financieras e informes institucionales.
              </p>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-white/10 text-xs text-emerald-200/80 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Conexión cifrada de seguridad bancaria</span>
          </div>

          {/* Sutil resplandor de fondo institucional */}
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-700/20 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Panel derecho - Formulario de Login */}
        <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Acceso de Personal</h2>
              <p className="text-sm text-slate-500 mt-1">
                Ingrese sus credenciales corporativas autorizadas
              </p>
            </div>

            {/* Mensaje Informativo o de Seguridad Bancaria */}
            {infoMessage && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start space-x-3 text-amber-800 text-sm shadow-xs">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <span className="leading-snug font-medium">{infoMessage}</span>
              </div>
            )}

            {/* Mensaje de Error */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo Correo o Código Corporativo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Correo o Código Corporativo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    ref={identifierInputRef}
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ingrese su identificador"
                    required
                    disabled={isSubmitting}
                    autoComplete="off"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 focus:bg-white transition-all text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    disabled={isSubmitting}
                    autoComplete="current-password"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 focus:bg-white transition-all text-sm disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Botón de Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Validando credenciales...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar al Sistema</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                © 2026 Cooperativa. Todos los derechos reservados. Acceso restringido únicamente a personal autorizado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
