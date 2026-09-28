import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  KeyRound,
  User,
  X,
  Copy,
  Check,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Phone,
  Mail,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Shield,
} from 'lucide-react';

/**
 * Modal integral de "Configuración de la Cuenta":
 * Pestaña 1: Seguridad & Doble Factor (2FA TOTP con QR)
 * Pestaña 2: Cambio de Contraseña Institucional
 * Pestaña 3: Datos de Contacto y Perfil
 */
export const AccountSettingsModal = ({ isOpen, onClose, initialTab = '2fa' }) => {
  const { user, updateUserData } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState(initialTab);

  // Estados 2FA
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [isConfiguring2fa, setIsConfiguring2fa] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [isDisabling2fa, setIsDisabling2fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disablingLoading, setDisablingLoading] = useState(false);

  // Estados Cambio de Contraseña
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [showPasswordActual, setShowPasswordActual] = useState(false);
  const [showNuevaPassword, setShowNuevaPassword] = useState(false);
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Estados Perfil
  const [telefono, setTelefono] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Mensajes y alertas por pestaña
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sincronizar tab inicial cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || '2fa');
      setErrorMsg('');
      setSuccessMsg('');
      setIsConfiguring2fa(false);
      setIsDisabling2fa(false);
      setTotpCode('');
      setDisablePassword('');
      setPasswordActual('');
      setNuevaPassword('');
      setConfirmarPassword('');
      setGeneratingQr(false);
      setVerifyingCode(false);

      if (user) {
        setTelefono(user.telefono || '');
        setMfaEnabled(Boolean(user.mfa_enabled));
      }

      // Verificación silenciosa del estado de 2FA en el servidor sin bloquear la UI
      let isMounted = true;
      api.get('/auth/2fa/status')
        .then((response) => {
          if (isMounted && response.data?.success) {
            const enabled = Boolean(response.data.mfa_enabled);
            setMfaEnabled(enabled);
            if (user && Boolean(user.mfa_enabled) !== enabled) {
              updateUserData({ mfa_enabled: enabled });
            }
          }
        })
        .catch((err) => {
          console.error('Error al consultar estado 2FA:', err);
        });

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        isMounted = false;
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen, initialTab]);

  // Cierre con Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Solicitar QR y Secreto para iniciar configuración 2FA (a petición explícita del usuario)
  const handleStart2faSetup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setGeneratingQr(true);
    try {
      const response = await api.post('/auth/2fa/setup');
      if (response.data?.success) {
        setQrCodeUrl(response.data.qr_code_url);
        setSecretKey(response.data.secret);
        setIsConfiguring2fa(true);
        setTotpCode('');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo iniciar la configuración de 2FA.');
      }
    } catch (err) {
      console.error('Error al generar configuración 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Error al comunicarse con el servidor.');
    } finally {
      setGeneratingQr(false);
    }
  };

  // Copiar clave secreta al portapapeles
  const handleCopySecret = async () => {
    if (!secretKey) return;
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  // Confirmar y Activar 2FA con código de 6 dígitos
  const handleEnable2faSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanCode = totpCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('Por favor ingrese un código numérico válido de 6 dígitos.');
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await api.post('/auth/2fa/enable', {
        secret: secretKey,
        totp_code: cleanCode,
      });

      if (response.data?.success) {
        setMfaEnabled(true);
        setIsConfiguring2fa(false);
        setQrCodeUrl('');
        setSecretKey('');
        setTotpCode('');
        updateUserData({ mfa_enabled: true });
        setSuccessMsg('¡Doble Factor de Autenticación (2FA) activado con éxito! Su cuenta ahora está protegida.');
        toast?.success('Doble Factor de Autenticación (2FA) activado exitosamente.');
      } else {
        setErrorMsg(response.data?.message || 'Código incorrecto. Intente de nuevo.');
      }
    } catch (err) {
      console.error('Error al activar 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Código de seguridad incorrecto o expirado.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Desactivar 2FA con confirmación de contraseña
  const handleDisable2faSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!disablePassword) {
      setErrorMsg('Debe ingresar su contraseña actual para confirmar la desactivación.');
      return;
    }

    setDisablingLoading(true);
    try {
      const response = await api.post('/auth/2fa/disable', {
        password: disablePassword,
      });

      if (response.data?.success) {
        setMfaEnabled(false);
        setIsDisabling2fa(false);
        setDisablePassword('');
        updateUserData({ mfa_enabled: false });
        setSuccessMsg('Doble factor de autenticación desactivado.');
        toast?.success('2FA desactivado.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo desactivar el 2FA.');
      }
    } catch (err) {
      console.error('Error al desactivar 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Contraseña incorrecta.');
    } finally {
      setDisablingLoading(false);
    }
  };

  // Guardar Cambio de Contraseña
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!passwordActual || !nuevaPassword || !confirmarPassword) {
      setErrorMsg('Todos los campos son obligatorios.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setErrorMsg('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    if (nuevaPassword.length < 6) {
      setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (nuevaPassword === passwordActual) {
      setErrorMsg('La nueva contraseña no puede ser idéntica a la anterior.');
      return;
    }

    const hasLetters = /[a-zA-Z]/.test(nuevaPassword);
    const hasNumbers = /[0-9]/.test(nuevaPassword);
    if (!hasLetters || !hasNumbers) {
      setErrorMsg('La nueva contraseña debe contener al menos una letra y un número.');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await api.post('/auth/cambiar-password', {
        password_actual: passwordActual,
        nueva_password: nuevaPassword,
        confirmar_password: confirmarPassword,
      });

      if (response.data?.success) {
        setPasswordActual('');
        setNuevaPassword('');
        setConfirmarPassword('');
        setSuccessMsg('Contraseña actualizada exitosamente.');
        toast?.success('Contraseña actualizada exitosamente.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo actualizar la contraseña.');
      }
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      setErrorMsg(err.response?.data?.message || 'Error al procesar la actualización de contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  // Guardar Cambios de Perfil (Teléfono)
  const handleUpdateProfileSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanTel = telefono.trim();
    if (!cleanTel) {
      setErrorMsg('El número de teléfono no puede estar vacío.');
      return;
    }

    if (!/^\d{8}$/.test(cleanTel)) {
      setErrorMsg('El número de teléfono debe contener exactamente 8 dígitos.');
      return;
    }

    setSavingProfile(true);
    try {
      const response = await api.patch('/auth/perfil', { telefono: cleanTel });
      if (response.data?.success) {
        updateUserData({ telefono: cleanTel });
        setSuccessMsg('Datos de contacto actualizados correctamente.');
        toast?.success('Teléfono actualizado correctamente.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo actualizar el teléfono.');
      }
    } catch (err) {
      console.error('Error al actualizar perfil:', err);
      setErrorMsg(err.response?.data?.message || 'Error al comunicarse con el servidor.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div
        className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
      >
        {/* Cabecera del Modal */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700 shadow-2xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 id="account-settings-title" className="text-xl font-bold text-slate-900 tracking-tight">
                Configuración de la Cuenta
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Administre la seguridad de su acceso, doble factor (2FA) y datos institucionales
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Pestañas (Tabs) */}
        <div className="flex space-x-1 p-1 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('2fa');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === '2fa'
                ? 'bg-white text-sky-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Seguridad & 2FA</span>
            {mfaEnabled && (
              <span className="w-2 h-2 rounded-full bg-sky-500" title="2FA Activo" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'password'
                ? 'bg-white text-sky-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Contraseña</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-white text-sky-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Datos Personales</span>
          </button>
        </div>

        {/* Notificaciones globales de la pestaña */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-3 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed font-medium">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex items-start space-x-3 text-sky-800 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-600" />
            <span className="leading-relaxed font-medium">{successMsg}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 1: SEGURIDAD Y DOBLE FACTOR 2FA                                  */}
        {/* ========================================================================= */}
        {activeTab === '2fa' && (
          <div className="space-y-6">
            {/* Estado Actual del Factor de Doble Autenticación */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              mfaEnabled
                ? 'bg-sky-50/60 border-sky-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  mfaEnabled
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-amber-500 text-white'
                }`}>
                  {mfaEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Factor de Doble Autenticación (2FA)
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      mfaEnabled
                        ? 'bg-sky-100 text-sky-800 border border-sky-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {mfaEnabled ? 'ACTIVO Y PROTEGIDO' : 'INACTIVO'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {mfaEnabled
                      ? 'Su cuenta solicita obligatoriamente el código dinámico de 6 dígitos de Google Authenticator o Microsoft Authenticator al iniciar sesión.'
                      : 'Proteja su cuenta bancaria y cooperativa requiriendo un código de 6 dígitos temporal generado en su teléfono móvil.'}
                  </p>
                </div>
              </div>

              {!isConfiguring2fa && !isDisabling2fa && (
                <div className="sm:self-center flex-shrink-0">
                  {mfaEnabled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDisabling2fa(true);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      Desactivar 2FA
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStart2faSetup}
                      disabled={generatingQr}
                      className="px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-50"
                    >
                      {generatingQr ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generando Código QR...</span>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          <span>Generar Código QR para 2FA</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Vista de Desactivación de 2FA */}
            {isDisabling2fa && (
              <form onSubmit={handleDisable2faSubmit} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Confirmar Desactivación de Seguridad
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDisabling2fa(false);
                      setDisablePassword('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Por seguridad, ingrese su contraseña actual para confirmar la desactivación del doble factor de autenticación:
                </p>
                <div className="relative">
                  <input
                    type={showDisablePassword ? 'text' : 'password'}
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Contraseña actual"
                    required
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDisablePassword(!showDisablePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showDisablePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDisabling2fa(false)}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={disablingLoading}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {disablingLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Confirmar Desactivación</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Vista Interactiva de Configuración 2FA con Código QR */}
            {isConfiguring2fa && (
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-5 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2 text-sky-900">
                    <QrCode className="w-4 h-4 text-sky-700" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Enrolamiento de Doble Factor (TOTP)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfiguring2fa(false);
                      setQrCodeUrl('');
                      setSecretKey('');
                      setTotpCode('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Pasos Visuales */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Código QR Centrado */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="Código QR de Enrolamiento 2FA"
                        className="w-44 h-44 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 font-semibold mt-2 text-center">
                      Escanee con Google o Microsoft Authenticator
                    </span>
                  </div>

                  {/* Instrucciones y Clave Manual */}
                  <div className="md:col-span-7 space-y-4">
                    <div>
                      <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider block">
                        Paso 1: Escanear Código
                      </span>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Abra la app de autenticación en su teléfono móvil y escanee el código QR que se muestra a la izquierda.
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Paso 2: O copie la clave secreta manualmente
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono font-bold text-sky-900 tracking-wider break-all select-all">
                          {secretKey || 'CARGANDO...'}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-lg border border-sky-200 transition-colors flex-shrink-0 cursor-pointer"
                        >
                          {copiedSecret ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-sky-700" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Formulario de Código de 6 dígitos */}
                    <form onSubmit={handleEnable2faSubmit} className="space-y-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Paso 3: Ingrese el código de 6 dígitos generado
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            className="w-full text-center tracking-[0.4em] font-mono font-bold text-xl py-2 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={verifyingCode || totpCode.length !== 6}
                        className="w-full py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyingCode ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Verificando código...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Confirmar y Activar 2FA</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 2: CAMBIO DE CONTRASEÑA                                          */}
        {/* ========================================================================= */}
        {activeTab === 'password' && (
          <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Contraseña Actual
              </label>
              <div className="relative">
                <input
                  type={showPasswordActual ? 'text' : 'password'}
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  placeholder="Ingrese su contraseña actual"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:bg-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordActual(!showPasswordActual)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswordActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nueva Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showNuevaPassword ? 'text' : 'password'}
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:bg-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNuevaPassword(!showNuevaPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNuevaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirmar Nueva Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirmarPassword ? 'text' : 'password'}
                    value={confirmarPassword}
                    onChange={(e) => setConfirmarPassword(e.target.value)}
                    placeholder="Repita la contraseña"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:bg-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmarPassword(!showConfirmarPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Checklist de requisitos de seguridad */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Requisitos de seguridad:
              </span>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li className={nuevaPassword.length >= 6 ? 'text-sky-700 font-semibold' : ''}>
                  Al menos 6 caracteres de longitud
                </li>
                <li className={/[a-zA-Z]/.test(nuevaPassword) && /[0-9]/.test(nuevaPassword) ? 'text-sky-700 font-semibold' : ''}>
                  Combinación de letras y números
                </li>
                <li className={nuevaPassword && nuevaPassword === confirmarPassword ? 'text-sky-700 font-semibold' : ''}>
                  Coincidencia exacta con el campo de confirmación
                </li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Actualizar Contraseña</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* PESTAÑA 3: DATOS PERSONALES                                              */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Nombre Completo
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200">
                  {user?.nombre_completo || user?.nombre || '-'}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  CUI / DPI
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-mono font-semibold text-slate-700 border border-slate-200">
                  {user?.cui_dpi || '-'}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Código Corporativo
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-mono font-bold text-sky-800 border border-slate-200">
                  {user?.codigo_corporativo || '-'}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Rol Institucional
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-800 border border-slate-200">
                  {user?.rol_nombre || user?.rol || '-'}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200">
                  {user?.email || '-'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Teléfono de Contacto (Editable)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={8}
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
                  placeholder="8 dígitos (ej. 55110001)"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
