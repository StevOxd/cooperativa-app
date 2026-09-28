import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  KeyRound,
} from 'lucide-react';
import api from '../../services/api';
import { toast } from '../../context/ToastContext';

/**
 * Modal de Cambio Obligatorio de Contraseña (SEC-09)
 * Bloquea la navegación completa del usuario hasta que actualice la contraseña temporal
 * asignada en su primer inicio de sesión o creación de cuenta.
 */
const ForcedPasswordChangeModal = ({ isOpen, user, onSuccess, onLogout }) => {
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [showPassActual, setShowPassActual] = useState(false);
  const [showNuevaPass, setShowNuevaPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Criterios de validación en tiempo real (Contraseña Fuerte)
  const hasMinLength = nuevaPassword.length >= 8;
  const hasLetters = /[a-zA-Z]/.test(nuevaPassword);
  const hasNumbers = /[0-9]/.test(nuevaPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(nuevaPassword);
  const passwordsMatch = nuevaPassword.length > 0 && nuevaPassword === confirmarPassword;
  const isFormValid = hasMinLength && hasLetters && hasNumbers && hasSpecial && passwordsMatch && passwordActual.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!passwordActual) {
      setErrorMsg('Debe ingresar la contraseña temporal asignada.');
      return;
    }

    if (!hasMinLength) {
      setErrorMsg('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (!hasLetters || !hasNumbers) {
      setErrorMsg('La nueva contraseña debe combinar obligatoriamente letras y números.');
      return;
    }

    if (!hasSpecial) {
      setErrorMsg('La nueva contraseña debe contener al menos un carácter especial (!@#$%^&*...).');
      return;
    }

    if (passwordActual === nuevaPassword) {
      setErrorMsg('La nueva contraseña debe ser distinta a la contraseña actual.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setErrorMsg('La confirmación de la contraseña no coincide.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/cambiar-password', {
        password_actual: passwordActual.trim(),
        nueva_password: nuevaPassword.trim(),
        confirmar_password: confirmarPassword.trim(),
      });

      if (response.data?.success) {
        toast.success('¡Contraseña actualizada exitosamente! Por favor, inicia sesión con tu nueva contraseña.');
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(response.data?.message || 'Error al actualizar la contraseña.');
      }
    } catch (err) {
      console.error('Error al cambiar contraseña obligatoria:', err);
      const backendMsg = err.response?.data?.message || 'Error de comunicación con el servidor.';
      setErrorMsg(backendMsg);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 overflow-y-auto">
      <div
        className="bg-white rounded-lg max-w-md w-full p-6 sm:p-8 shadow-lg border border-warning-200/80 relative my-auto animate-scaleUp text-slate-800 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forced-password-title"
      >
        {/* Cabecera de Alerta de Seguridad */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-warning-100 text-warning-700 rounded-lg flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7" />
          </div>
          <h2 id="forced-password-title" className="text-xl font-bold text-slate-900 tracking-tight">
            Cambio Obligatorio de Contraseña
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Hola <span className="font-semibold text-slate-900">{user?.nombre || user?.codigo_corporativo}</span>.
            Por políticas de seguridad bancaria, debe actualizar su contraseña temporal asignada en su primer acceso para activar su cuenta.
          </p>
        </div>

        {/* Mensaje de Error */}
        {errorMsg && (
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg flex items-start space-x-2 text-xs text-danger-700 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-danger-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contraseña Temporal / Actual */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Contraseña Temporal (recibida por correo)
            </label>
            <div className="relative">
              <input
                type={showPassActual ? 'text' : 'password'}
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                placeholder="Ingrese su contraseña temporal..."
                required
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-warning-500 focus:border-warning-500"
              />
              <button
                type="button"
                onClick={() => setShowPassActual(!showPassActual)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showPassActual ? 'Ocultar' : 'Mostrar'}
              >
                {showPassActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nueva Contraseña */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nueva Contraseña Personal
            </label>
            <div className="relative">
              <input
                type={showNuevaPass ? 'text' : 'password'}
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres (letras y números)..."
                required
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-warning-500 focus:border-warning-500"
              />
              <button
                type="button"
                onClick={() => setShowNuevaPass(!showNuevaPass)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showNuevaPass ? 'Ocultar' : 'Mostrar'}
              >
                {showNuevaPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Checklist de Requisitos de Contraseña Fuerte */}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
              <span className={`flex items-center space-x-1 ${hasMinLength ? 'text-brand-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Mín. 8 chars</span>
              </span>
              <span className={`flex items-center space-x-1 ${hasLetters ? 'text-brand-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Letras (a-z)</span>
              </span>
              <span className={`flex items-center space-x-1 ${hasNumbers ? 'text-brand-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Números (0-9)</span>
              </span>
              <span className={`flex items-center space-x-1 ${hasSpecial ? 'text-brand-700 font-semibold' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Especial (!@#$)</span>
              </span>
            </div>
          </div>

          {/* Confirmar Nueva Contraseña */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Repita su nueva contraseña..."
                required
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-warning-500 focus:border-warning-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showConfirmPass ? 'Ocultar' : 'Mostrar'}
              >
                {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmarPassword && (
              <span className={`text-xs mt-1 block font-medium ${passwordsMatch ? 'text-brand-700' : 'text-danger-600'}`}>
                {passwordsMatch ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
              </span>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className={`w-full py-2.5 px-4 rounded-md text-xs font-bold text-white transition-all flex items-center justify-center space-x-2 shadow-lg ${
                loading || !isFormValid
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-brand-700 hover:bg-brand-800 cursor-pointer'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Actualizando y Activando Cuenta...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Actualizar Contraseña y Activar Cuenta</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md text-xs font-medium transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ForcedPasswordChangeModal;
