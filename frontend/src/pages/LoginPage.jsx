import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Building2,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  Sparkles,
  UserCheck,
  Hash,
} from 'lucide-react';

export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isAuthenticated) {
      const origin = location.state?.from?.pathname || '/dashboard';
      navigate(origin, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identifier.trim() || !password) {
      setErrorMessage('Por favor ingrese su correo electrónico o código corporativo y contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(identifier, password);
      if (result.success) {
        const origin = location.state?.from?.pathname || '/dashboard';
        navigate(origin, { replace: true });
      } else {
        setErrorMessage(result.message || 'Credenciales inválidas.');
      }
    } catch (err) {
      setErrorMessage('Ocurrió un error inesperado. Por favor intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Función para rellenar credenciales de prueba rápidamente
  const fillCredentials = (testId, testPass) => {
    setIdentifier(testId);
    setPassword(testPass);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden shadow-2xl border border-white/10 glass-dark">
        {/* Panel lateral informativo (Branding de la Cooperativa) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-emerald-800 to-teal-950 p-8 lg:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                <Building2 className="w-7 h-7 text-emerald-300" />
              </div>
              <div>
                <span className="text-xl font-extrabold tracking-tight block">COOPERATIVA</span>
                <span className="text-xs text-emerald-300 tracking-widest font-semibold uppercase">Portal Integral 3FN</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Identificación con Código Corporativo</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
                Seguridad y Confianza Financiera
              </h1>
              <p className="text-emerald-100/80 text-sm leading-relaxed">
                Accede con tu <span className="font-bold text-white">Código Corporativo (ej. 1001)</span> o correo electrónico institucional.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-8 pt-8 border-t border-white/10 space-y-3">
            <div className="flex items-center space-x-3 text-xs text-emerald-100/90">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Autenticación Segura con Cifrado JWT & Bcrypt</span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-emerald-100/90">
              <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Control de Acceso Basado en Roles (RBAC)</span>
            </div>
          </div>
        </div>

        {/* Panel del Formulario de Login */}
        <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-center bg-slate-900/90 backdrop-blur-xl">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Iniciar Sesión</h2>
              <p className="text-sm text-slate-400 mt-1">
                Ingresa con tu correo o código corporativo de 4 dígitos
              </p>
            </div>

            {/* Mensaje de Error */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start space-x-3 text-red-400 text-sm animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo Correo o Código Corporativo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Correo o Código Corporativo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ej. 1001 o admin@cooperativa.com"
                    required
                    disabled={isSubmitting}
                    className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
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
                    className="w-full pl-11 pr-11 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Botón Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Iniciando sesión...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar al Sistema</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Accesos Rápidos de Prueba con Códigos Corporativos */}
            <div className="mt-8 pt-6 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400 mb-3 font-medium">
                Cuentas de prueba con Código Corporativo:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => fillCredentials('1001', 'admin123')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  👑 Admin (Cód: 1001)
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials('2001', 'admin123')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  💼 Operador (Cód: 2001)
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials('3001', 'admin123')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-400 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  👤 Asociado (Cód: 3001)
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials('3000', 'admin123')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  ⛔ Inactivo (Cód: 3000)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
