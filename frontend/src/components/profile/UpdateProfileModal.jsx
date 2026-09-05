import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  User,
  Phone,
  Mail,
  CreditCard,
  KeyRound,
  Shield,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

/**
 * Modal dialog component for updating user contact information.
 * Allows modifying contact phone numbers and synchronizes with AuthContext.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {boolean} props.isOpen - Whether the modal is currently visible.
 * @param {Function} props.onClose - Callback invoked to dismiss the modal.
 * @returns {JSX.Element|null} The rendered modal or null if hidden.
 */
export const UpdateProfileModal = ({ isOpen, onClose }) => {
  const { user, updateUserData } = useAuth();
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      setTelefono(user.telefono || '');
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [isOpen, user]);

  // Cierre con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await api.patch('/auth/perfil', {
        telefono: telefono.trim(),
      });

      if (response.data?.success) {
        const nuevoTelefono = response.data.data?.telefono || telefono.trim();
        updateUserData({ telefono: nuevoTelefono });
        setSuccessMessage('Datos de contacto actualizados exitosamente.');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage(response.data?.message || 'Error al actualizar el teléfono.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8">
        {/* Encabezado del Modal */}
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Actualizar Datos de Perfil</h2>
              <p className="text-xs text-slate-500 mt-0.5">Información institucional y datos de contacto</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensajes de Feedback */}
        {successMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Bloque de Información Institucional (Solo Lectura) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Identificación Corporativa (Solo Lectura)
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Código Corporativo</span>
                <span className="font-mono font-bold text-emerald-800 flex items-center space-x-1 mt-0.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{user?.codigo_corporativo || '-'}</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">DPI / CUI</span>
                <span className="font-mono font-medium text-slate-700 flex items-center space-x-1 mt-0.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user?.cui_dpi || '-'}</span>
                </span>
              </div>

              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">Nombre Completo</span>
                <span className="font-semibold text-slate-800 block mt-0.5">
                  {user?.nombre_completo || user?.nombre || 'Usuario'}
                </span>
              </div>

              <div className="col-span-2">
                <span className="text-slate-400 block text-[11px]">Correo Institucional</span>
                <span className="font-mono text-slate-600 flex items-center space-x-1 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user?.email || '-'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Campo Editable: Número de Teléfono */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Número de Teléfono
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4 text-emerald-600" />
              </div>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 5555-1234"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 focus:bg-white transition-all font-medium"
              />
            </div>
            <p className="text-[11px] text-slate-400 pt-0.5">
              Este número se utilizará para notificaciones de seguridad y contacto institucional.
            </p>
          </div>

          {/* Botones de Acción */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdateProfileModal;
