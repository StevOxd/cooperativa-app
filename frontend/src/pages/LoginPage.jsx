import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Layers, ShieldAlert } from 'lucide-react';
import { Alert, Button, Field, Input, cn } from '../components/ui';

const Wordmark = ({ inverse = false }) => (
  <div className="flex items-center gap-2.5">
    <span
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md',
        inverse ? 'bg-white/10 text-white' : 'bg-brand-700 text-white'
      )}
    >
      <Layers className="w-5 h-5" aria-hidden="true" />
    </span>
    <span className={cn('text-lg font-semibold', inverse ? 'text-white' : 'text-ink')}>Cooperativa</span>
  </div>
);

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


  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-4xl grid lg:grid-cols-2 bg-white border border-line rounded-lg overflow-hidden">
          {/* Panel institucional: solo en pantallas grandes */}
          <aside className="hidden lg:flex flex-col justify-between gap-10 bg-brand-900 p-10 text-white">
            <Wordmark inverse />
            <div>
              <p className="text-sm font-semibold">Antes de ingresar</p>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-brand-100 list-disc pl-4 marker:text-brand-300">
                <li>Verifique que la dirección en su navegador sea la del portal de la cooperativa.</li>
                <li>No comparta su contraseña ni su código de verificación con nadie, tampoco con personal de la cooperativa.</li>
                <li>Por su seguridad, la sesión se cierra después de 10 minutos sin actividad.</li>
              </ul>
            </div>
            <p className="text-xs text-brand-200">© {year} Cooperativa</p>
          </aside>

          <section className="px-6 py-8 sm:px-10 sm:py-12">
            <div className="lg:hidden mb-8">
              <Wordmark />
            </div>

            {mfaRequired ? (
              /* Segundo paso: código del autenticador (2FA TOTP) */
              <>
                <h1 className="text-2xl font-semibold text-ink">Verificación en dos pasos</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Ingrese el código de 6 dígitos que muestra su aplicación de autenticación.
                </p>
                <p className="mt-4 text-sm text-ink-soft">
                  Cuenta:{' '}
                  <span className="font-medium text-ink">
                    {mfaUser?.nombre_completo || mfaUser?.codigo_corporativo || mfaUser?.email || 'Usuario'}
                  </span>
                </p>

                {errorMessage && (
                  <Alert tone="danger" className="mt-6">{errorMessage}</Alert>
                )}

                <form onSubmit={handleVerifyMfa} className="mt-6 space-y-5">
                  <Field label="Código de verificación" hint="El código cambia cada 30 segundos.">
                    <Input
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
                      className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
                    />
                  </Field>

                  <div className="space-y-2">
                    <Button
                      type="submit"
                      size="lg"
                      fullWidth
                      loading={isSubmitting}
                      loadingText="Verificando…"
                      disabled={totpCode.trim().length !== 6}
                    >
                      Verificar
                    </Button>
                    <Button variant="ghost" fullWidth onClick={handleCancelMfa} disabled={isSubmitting}>
                      Volver al inicio de sesión
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              /* Primer paso: usuario y contraseña */
              <>
                <h1 className="text-2xl font-semibold text-ink">Iniciar sesión</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  Ingrese con su código de usuario o su correo electrónico.
                </p>

                {infoMessage && (
                  <Alert tone="warning" icon={ShieldAlert} className="mt-6">{infoMessage}</Alert>
                )}

                {errorMessage && (
                  <Alert tone="danger" className="mt-6">{errorMessage}</Alert>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <Field label="Código de usuario o correo">
                    <Input
                      ref={identifierInputRef}
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      disabled={isSubmitting}
                      autoComplete="off"
                    />
                  </Field>

                  <Field label="Contraseña">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          aria-pressed={showPassword}
                          className="rounded-md p-2 text-ink-subtle hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      }
                    />
                  </Field>

                  <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingText="Ingresando…">
                    Ingresar
                  </Button>
                </form>

                <p className="mt-8 pt-6 border-t border-line text-sm text-ink-muted">
                  ¿Todavía no es asociado?{' '}
                  <Link
                    to="/registro-asociado"
                    className="font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    Solicite su afiliación en línea
                  </Link>
                </p>
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="lg:hidden pb-6 text-center text-xs text-ink-subtle">© {year} Cooperativa</footer>
    </div>
  );
};

export default LoginPage;
