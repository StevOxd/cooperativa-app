import React from 'react';
import { Link } from 'react-router-dom';
import { Search, User, Loader2, ArrowRight } from 'lucide-react';

/**
 * Step 0: Initial CUI/DPI identity verification form for public affiliation.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {string} props.cuiInput - Current CUI input value.
 * @param {Function} props.setCuiInput - State updater for CUI.
 * @param {Function} props.handleConsultarDpi - Submit handler.
 * @param {boolean} props.loading - Indicates API verification is in progress.
 * @param {string} props.errorMsg - Current error message to clear on typing.
 * @param {Function} props.setErrorMsg - State updater for error message.
 * @returns {JSX.Element} Rendered step.
 */
export const DpiLookupStep = ({
  cuiInput,
  setCuiInput,
  handleConsultarDpi,
  loading,
  errorMsg,
  setErrorMsg,
}) => {
  return (
    <form onSubmit={handleConsultarDpi} className="space-y-6">
      <div className="text-center space-y-2 border-b border-slate-100 pb-5">
        <div className="w-12 h-12 bg-brand-50 text-brand-700 rounded-2xl flex items-center justify-center mx-auto border border-brand-200">
          <Search className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Verificación de Identidad</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Ingresa tu CUI / DPI para verificar si cuentas con una cuenta bancaria (monetaria o de ahorro) en la Corporación Bancaria o si debemos generar una nueva solicitud de apertura.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
          CUI / DPI (13 Dígitos) *
        </label>
        <div className="relative">
          <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            maxLength={13}
            value={cuiInput}
            onChange={(e) => {
              setCuiInput(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="Ingrese CUI / DPI (13 dígitos)"
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 text-base font-mono tracking-wider shadow-2xs"
            required
            autoFocus
          />
        </div>
      </div>

      {/* Botón de Consulta */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-6 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verificando en Entidad Bancaria...</span>
          </>
        ) : (
          <>
            <span>Verificar Identidad</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <div className="text-center pt-2">
        <Link to="/login" className="text-xs font-bold text-slate-600 hover:text-brand-700 transition-colors">
          ¿Ya tienes cuenta activa? Inicia sesión aquí
        </Link>
      </div>
    </form>
  );
};

export default DpiLookupStep;
