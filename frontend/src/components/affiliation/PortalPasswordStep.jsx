import React from 'react';
import {
  Lock,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

/**
 * Step 1C: Setting portal password and email validation for bank customers/employees.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object} props.credenciales - Current portal credentials state.
 * @param {Function} props.setCredenciales - State updater for credentials.
 * @param {Object} props.credEmailStatus - Real-time email validation status.
 * @param {Object|null} props.cuentaSeleccionadaObj - Selected debit bank account object.
 * @param {string} props.montoAportacion - Contribution amount to debit.
 * @param {Function} props.handleSubmitExistente - Form submission handler.
 * @param {boolean} props.loading - Indicates affiliation processing is in progress.
 * @param {Function} props.setPhase - State updater for navigation.
 * @returns {JSX.Element} Rendered step.
 */
export const PortalPasswordStep = ({
  credenciales,
  setCredenciales,
  credEmailStatus,
  cuentaSeleccionadaObj,
  montoAportacion,
  handleSubmitExistente,
  loading,
  setPhase,
}) => {
  return (
    <form onSubmit={handleSubmitExistente} className="space-y-4">
      <div className="border-b border-slate-100 pb-3 mb-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
          <Lock className="w-5 h-5 text-blue-700" />
          <span>Definición de Contraseña para el Portal</span>
        </h3>
        <p className="text-xs text-slate-500">
          Establece las credenciales que utilizarás para consultar tus cuentas y solicitar créditos.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
          Correo Electrónico *
        </label>
        <div className="relative">
          <Mail className={`w-4 h-4 absolute left-3 top-3 ${
            credEmailStatus.disponible === false ? 'text-red-500' :
            credEmailStatus.disponible === true ? 'text-blue-600' : 'text-slate-400'
          }`} />
          <input
            type="email"
            value={credenciales.email}
            onChange={(e) => setCredenciales((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Ingrese correo electrónico"
            className={`w-full pl-9 pr-10 py-2.5 bg-white border rounded-xl text-slate-900 text-sm focus:outline-none shadow-2xs transition-colors ${
              credEmailStatus.disponible === false
                ? 'border-red-500 focus:ring-2 focus:ring-red-500 bg-red-50/20 text-red-900'
                : credEmailStatus.disponible === true
                ? 'border-blue-500 focus:ring-2 focus:ring-blue-600 bg-blue-50/20'
                : 'border-slate-300 focus:ring-2 focus:ring-blue-600'
            }`}
            required
          />
          {credEmailStatus.checking && (
            <div className="absolute right-3 top-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            </div>
          )}
          {!credEmailStatus.checking && credEmailStatus.disponible === true && (
            <div className="absolute right-3 top-3">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
          )}
          {!credEmailStatus.checking && credEmailStatus.disponible === false && (
            <div className="absolute right-3 top-3">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
          )}
        </div>
        {credEmailStatus.message && (
          <p className={`text-xs mt-1.5 flex items-center space-x-1 font-medium ${
            credEmailStatus.disponible === false ? 'text-red-600' :
            credEmailStatus.disponible === true ? 'text-blue-700' : 'text-slate-500'
          }`}>
            <span>{credEmailStatus.message}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Contraseña *
          </label>
          <input
            type="password"
            value={credenciales.password}
            onChange={(e) => setCredenciales((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Ingrese contraseña para el portal"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Confirmar Contraseña *
          </label>
          <input
            type="password"
            value={credenciales.confirmPassword}
            onChange={(e) => setCredenciales((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            placeholder="Confirme su contraseña"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
            required
          />
        </div>
      </div>

      {/* Resumen del débito */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-slate-600 font-medium">Cuenta de Débito:</span>
          <span className="font-mono font-bold text-slate-800">{cuentaSeleccionadaObj?.numero_cuenta_bancaria}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5">
          <span className="text-slate-600 font-medium">Aportación a debitar:</span>
          <span className="font-bold text-blue-700">Q{parseFloat(montoAportacion).toFixed(2)}</span>
        </div>
      </div>

      <div className="pt-4 flex justify-between items-center border-t border-slate-100">
        <button
          type="button"
          onClick={() => setPhase('EXISTENTE_CONFIG')}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a Cuentas</span>
        </button>
        <button
          type="submit"
          disabled={loading || credEmailStatus.disponible === false || credEmailStatus.checking}
          className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Formalizando Membresía...</span>
            </>
          ) : (
            <>
              <span>Confirmar y Afiliarme</span>
              <ShieldCheck className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default PortalPasswordStep;
