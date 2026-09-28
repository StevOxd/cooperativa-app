import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
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
  Smartphone,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';

export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para Doble Factor de Autenticación (MFA / 2FA TOTP)
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [mfaUser, setMfaUser] = useState(null);
  const [totpCode, setTotpCode] = useState('');

  const identifierInputRef = useRef(null);
  const mfaInputRef = useRef(null);

  const { login, verifyMfa, logout } = useAuth();
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
    setMfaRequired(false);

    const handleBackForward = () => {
      if (localStorage.getItem('coop_token')) {
        setInfoMessage('Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso.');
        logout();
      }
      setIdentifier('');
      setPassword('');
      setMfaRequired(false);
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
      setErrorMessage('Por favor ingrese su usuario o correo electrónico y contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(identifier, password);
      if (result.success) {
        if (result.mfa_required) {
          // Requiere segundo factor TOTP
          setMfaRequired(true);
          setTempToken(result.temp_token);
          setMfaUser(result.user);
          setTotpCode('');
          setErrorMessage('');
          setTimeout(() => mfaInputRef.current?.focus(), 100);
          return;
        }

        // Login directo exitoso
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

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanCode = totpCode.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage('Ingrese exactamente los 6 dígitos numéricos del autenticador.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await verifyMfa(tempToken, cleanCode);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setErrorMessage(result.message || 'Código de seguridad incorrecto.');
        setTotpCode('');
        mfaInputRef.current?.focus();
      }
    } catch (err) {
      setErrorMessage('Error al verificar el código de seguridad. Intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelMfa = () => {
    setMfaRequired(false);
    setTempToken('');
    setMfaUser(null);
    setTotpCode('');
    setErrorMessage('');
    setInfoMessage('');
    setPassword('');
    setTimeout(() => identifierInputRef.current?.focus(), 100);
  };

  return (
    <div 
      className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative"
      style={{
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}
    >
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-lg overflow-hidden shadow-lg border border-slate-200 bg-white">
        {/* Panel lateral izquierdo - Branding Institucional */}
        <div className="lg:col-span-5 bg-brand-900 p-8 lg:p-12 text-white flex flex-col justify-between relative">
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-10">
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                <Building2 className="w-7 h-7 text-brand-300" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight block">COOPERATIVA</span>
                <span className="text-xs text-brand-300 tracking-wider font-semibold uppercase">Portal Institucional</span>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl lg:text-3xl font-bold leading-tight">
                Sistema de Gestión Financiera y Autogestión
              </h2>
              <p className="text-brand-100/90 text-sm leading-relaxed">
                Plataforma corporativa centralizada para la administración de asociados, operaciones financieras e informes institucionales.
              </p>
            </div>
          </div>

          {/* Sutil resplandor de fondo institucional */}
        </div>

        {/* Panel derecho - Formulario de Login */}
        <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            {mfaRequired ? (
              /* Vista de Doble Factor de Autenticación (MFA / 2FA TOTP) */
              <div>
                <div className="mb-6 text-center">
                  <div className="w-14 h-14 bg-brand-100 text-brand-700 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Verificación de Seguridad</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Doble Factor de Autenticación (MFA / 2FA) Requerido
                  </p>
                </div>

                <div className="mb-6 p-4 rounded-lg bg-brand-50 border border-brand-200 text-xs text-brand-900 leading-relaxed">
                  <p className="font-bold text-brand-950 mb-0.5">
                    Usuario: {mfaUser?.nombre_completo || mfaUser?.codigo_corporativo || mfaUser?.email || 'Usuario'}
                  </p>
                  <p className="text-brand-800">
                    Abre tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator) e ingresa el código numérico de 6 dígitos.
                  </p>
                </div>

                {/* Mensaje de Error */}
                {errorMessage && (
                  <div className="mb-6 p-4 rounded-lg bg-danger-50 border border-danger-200 flex items-start space-x-3 text-danger-700 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-danger-600" />
                    <span className="leading-snug">{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleVerifyMfa} className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 text-center">
                      Código de Seguridad (6 dígitos)
                    </label>
                    <input
                      ref={mfaInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setTotpCode(val);
                      }}
                      placeholder="000000"
                      required
                      autoFocus
                      disabled={isSubmitting}
                      autoComplete="one-time-code"
                      className="w-full text-center tracking-[0.4em] font-mono text-2xl py-3.5 bg-slate-50 border-2 border-brand-500/60 rounded-md text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-brand-500/20 focus:border-brand-600 focus:bg-white transition-all disabled:opacity-50"
                    />
                    <p className="text-xs text-slate-400 text-center mt-2">
                      El código se actualiza dinámicamente cada 30 segundos.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="submit"
                      disabled={isSubmitting || totpCode.trim().length !== 6}
                      className="w-full py-3.5 px-6 rounded-md bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Validando código...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          <span>Verificar y Acceder</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelMfa}
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                    >
                      ← Cancelar y volver al inicio
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Vista Principal de Acceso */
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Acceso de Personal</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Ingrese sus credenciales corporativas autorizadas
                  </p>
                </div>

                {/* Mensaje Informativo o de Seguridad Bancaria */}
                {infoMessage && (
                  <div className="mb-6 p-4 rounded-lg bg-warning-50 border border-warning-200 flex items-start space-x-3 text-warning-800 text-sm">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning-600" />
                    <span className="leading-snug font-medium">{infoMessage}</span>
                  </div>
                )}

                {/* Mensaje de Error */}
                {errorMessage && (
                  <div className="mb-6 p-4 rounded-lg bg-danger-50 border border-danger-200 flex items-start space-x-3 text-danger-700 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-danger-600" />
                    <span className="leading-snug">{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Campo Usuario */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Usuario
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
                        placeholder="Ingrese su usuario"
                        required
                        disabled={isSubmitting}
                        autoComplete="off"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 focus:bg-white transition-all text-sm disabled:opacity-50"
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
                        className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 focus:bg-white transition-all text-sm disabled:opacity-50"
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
                    className="w-full mt-2 py-3.5 px-6 rounded-md bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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

                {/* Enlace a Afiliación en Línea */}
                <div className="mt-6 p-4 rounded-lg bg-brand-50/70 border border-brand-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-brand-950">¿Deseas ser asociado?</p>
                  </div>
                  <Link
                    to="/registro-asociado"
                    className="px-3.5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all cursor-pointer"
                  >
                    Afiliarme
                  </Link>
                </div>
              </>
            )}

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
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
