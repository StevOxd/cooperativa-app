import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, Field, Input, cn } from '../ui';
import { formatQ, humanize } from '../../utils/format';
import { IdentityBar, StepActions, StepHeader } from './StepHeader';

/**
 * Paso 2 (clientes del banco): cuenta bancaria de origen y aporte inicial.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.bancoData - Persona y cuentas bancarias verificadas.
 * @param {string|number} props.selectedCuentaBancariaId
 * @param {Function} props.setSelectedCuentaBancariaId
 * @param {string} props.montoAportacion
 * @param {Function} props.setMontoAportacion
 * @param {Object|null} props.cuentaSeleccionadaObj
 * @param {Function} props.handleReset - Vuelve a la consulta de DPI.
 * @param {Function} props.setPhase
 * @param {Function} props.setErrorMsg
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
      setErrorMsg('El aporte inicial mínimo es de Q100.00.');
      return;
    }
    if (cuentaSeleccionadaObj && parseFloat(cuentaSeleccionadaObj.saldo_disponible) < monto) {
      setErrorMsg('Esa cuenta del banco no tiene saldo suficiente. Elija otra o reduzca el monto.');
      return;
    }
    setErrorMsg('');
    setPhase('EXISTENTE_CREDENCIALES');
  };

  return (
    <div>
      <IdentityBar
        nombre={bancoData.persona.nombre_completo}
        dpi={bancoData.persona.cui_dpi}
        detalle={bancoData.tipo_sujeto === 'EMPLEADO_BANCO' ? 'Colaborador del banco' : 'Cliente del banco'}
        onChange={handleReset}
      />

      <StepHeader
        step={2}
        total={3}
        title="Su primer ahorro"
        description="Elija de qué cuenta del banco sale el dinero y cuánto quiere pasar a su nueva cuenta de ahorro en la cooperativa."
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">
          Cuenta del banco<span className="ml-0.5 text-danger-700" aria-hidden="true">*</span>
          <span className="sr-only"> (obligatorio)</span>
        </legend>
        <div className="space-y-2">
          {bancoData.cuentas_bancarias.map((cb) => {
            const checked = String(selectedCuentaBancariaId) === String(cb.id_cuenta_bancaria);
            return (
              <label
                key={cb.id_cuenta_bancaria}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors focus-within:ring-2 focus-within:ring-brand-600',
                  checked ? 'border-brand-700 bg-brand-50' : 'border-line hover:border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="cuenta_bancaria"
                  value={cb.id_cuenta_bancaria}
                  checked={checked}
                  onChange={(e) => setSelectedCuentaBancariaId(e.target.value)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-brand-700 focus-visible:outline-none"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm text-ink">{cb.numero_cuenta_bancaria}</span>
                  <span className="block text-xs text-ink-subtle">Cuenta {humanize(cb.tipo_cuenta).toLowerCase()}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium text-ink tabular-nums">{formatQ(cb.saldo_disponible)}</span>
                  <span className="block text-xs text-ink-subtle">disponible</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="Aporte inicial"
        hint="Mínimo Q100.00. Se debita de la cuenta del banco y se acredita en su cuenta de ahorro de la cooperativa."
        required
        className="mt-6"
      >
        <Input
          type="number"
          step="0.01"
          min="100.00"
          inputMode="decimal"
          prefix="Q"
          value={montoAportacion}
          onChange={(e) => setMontoAportacion(e.target.value)}
          className="tabular-nums sm:max-w-xs"
          required
        />
      </Field>

      <StepActions>
        <Button variant="ghost" icon={ArrowLeft} onClick={handleReset}>
          Empezar de nuevo
        </Button>
        <Button onClick={handleProceed}>
          Continuar
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </StepActions>
    </div>
  );
};

export default BankConfigStep;
