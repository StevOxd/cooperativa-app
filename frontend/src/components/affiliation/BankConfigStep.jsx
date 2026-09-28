import React from 'react';
import { Briefcase, Landmark, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * Step 1B: Account selection and initial contribution configuration for bank clients.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object} props.bancoData - Bank payload containing verified accounts and profile.
 * @param {string|number} props.selectedCuentaBancariaId - Selected bank account ID.
 * @param {Function} props.setSelectedCuentaBancariaId - State updater for selected account.
 * @param {string} props.montoAportacion - Configured contribution amount.
 * @param {Function} props.setMontoAportacion - State updater for contribution amount.
 * @param {Object|null} props.cuentaSeleccionadaObj - Selected bank account object.
 * @param {Function} props.handleReset - Reset flow handler.
 * @param {Function} props.setPhase - State updater to advance/change phases.
 * @param {Function} props.setErrorMsg - State updater for error alerts.
 * @returns {JSX.Element} Rendered step.
 */
export const BankConfigStep = ({
  bancoData,
  selectedCuentaBancariaId,
  setSelectedCuentaBancariaId,
  montoAportacion,
  setMontoAportacion,
  cuentaSeleccionadaObj,
  handleReset,
  setPhase,
  setErrorMsg,
}) => {
  const handleProceed = () => {
    const monto = parseFloat(montoAportacion);
    if (isNaN(monto) || monto < 100) {
      setErrorMsg('La aportación inicial mínima es de Q100.00.');
      return;
    }
    if (cuentaSeleccionadaObj && parseFloat(cuentaSeleccionadaObj.saldo_disponible) < monto) {
      setErrorMsg('Fondos insuficientes en la cuenta bancaria de ahorro seleccionada.');
      return;
    }
    setErrorMsg('');
    setPhase('EXISTENTE_CREDENCIALES');
  };

  return (
    <div className="space-y-5">
      {/* Badge de Identificación */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <span
            className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200"
          >
            {bancoData.tipo_sujeto === 'EMPLEADO_BANCO' ? (
              <Briefcase className="w-3.5 h-3.5 text-blue-700" />
            ) : (
              <Landmark className="w-3.5 h-3.5 text-blue-700" />
            )}
            <span>{bancoData.tipo_sujeto_descripcion}</span>
          </span>
          <h3 className="text-lg font-extrabold text-slate-900 mt-2">
            {bancoData.persona.nombre_completo}
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            DPI: {bancoData.persona.cui_dpi} {bancoData.persona.codigo_corporativo && `| Código: ${bancoData.persona.codigo_corporativo}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          title="Cambiar DPI"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Cambiar</span>
        </button>
      </div>

      {/* Selección de Cuenta Bancaria de Ahorro para Débito */}
      <div>
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
          Cuenta Bancaria de Origen (Monetaria o Ahorro) *
        </label>
        <div className="space-y-2">
          {bancoData.cuentas_bancarias.map((cb) => (
            <label
              key={cb.id_cuenta_bancaria}
              className={`flex items-center justify-between p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                String(selectedCuentaBancariaId) === String(cb.id_cuenta_bancaria)
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                <input
                  type="radio"
                  name="cuenta_bancaria"
                  value={cb.id_cuenta_bancaria}
                  checked={String(selectedCuentaBancariaId) === String(cb.id_cuenta_bancaria)}
                  onChange={(e) => setSelectedCuentaBancariaId(e.target.value)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900 font-mono">
                    {cb.numero_cuenta_bancaria}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    Cuenta {cb.tipo_cuenta} • Banco de la Corporación
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-extrabold text-blue-900">
                  Q{parseFloat(cb.saldo_disponible).toFixed(2)}
                </p>
                <p className="text-xs text-slate-400 font-semibold uppercase">
                  Disponible
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Monto de Aportación Inicial */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Monto de Apertura de Ahorro en Cooperativa (Mínimo Q100.00) *
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-2.5 font-bold text-blue-700 text-base">Q</span>
          <input
            type="number"
            step="0.01"
            min="100.00"
            value={montoAportacion}
            onChange={(e) => setMontoAportacion(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 text-base"
            required
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Este monto será transferido desde tu cuenta bancaria hacia tu nueva cuenta de Ahorro en la Cooperativa.
        </p>
      </div>

      {/* Botones */}
      <div className="pt-4 flex justify-between items-center border-t border-slate-100">
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-md flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a DPI</span>
        </button>
        <button
          type="button"
          onClick={handleProceed}
          className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-md flex items-center space-x-2 transition-all cursor-pointer"
        >
          <span>Continuar a Credenciales</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default BankConfigStep;
