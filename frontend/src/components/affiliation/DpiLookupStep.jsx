import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Field, Input } from '../ui';
import { StepHeader } from './StepHeader';

/**
 * Paso inicial: consulta del DPI para saber si la persona ya es cliente del banco.
 *
 * @component
 * @param {Object} props
 * @param {string} props.cuiInput
 * @param {Function} props.setCuiInput
 * @param {Function} props.handleConsultarDpi - Envío del formulario.
 * @param {boolean} props.loading
 * @param {string} props.errorMsg - Se limpia al escribir.
 * @param {Function} props.setErrorMsg
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
    <form onSubmit={handleConsultarDpi} noValidate>
      <StepHeader
        title="Empecemos con su DPI"
        description="Si ya tiene una cuenta monetaria o de ahorro en el banco, puede afiliarse ahora mismo. Si no, le daremos un número de caso para terminar el trámite en una agencia."
      />

      <Field label="Número de DPI" hint="Los 13 dígitos, sin espacios." required>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={13}
          value={cuiInput}
          onChange={(e) => {
            setCuiInput(e.target.value);
            if (errorMsg) setErrorMsg('');
          }}
          className="font-mono text-base tracking-wide"
          required
          autoFocus
        />
      </Field>

      <Button type="submit" fullWidth size="lg" className="mt-6" loading={loading} loadingText="Consultando…">
        Continuar
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Button>

      <p className="mt-6 text-center text-sm text-ink-muted">
        ¿Ya es asociado?{' '}
        <Link
          to="/login"
          className="font-medium text-brand-700 hover:text-brand-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          Inicie sesión
        </Link>
      </p>
    </form>
  );
};

export default DpiLookupStep;
