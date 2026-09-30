import React from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, Button, Field, Input, Select, cn } from '../ui';
import { IdentityBar, StepActions, StepHeader } from './StepHeader';

/** Solo letras (con tildes y ñ) y espacios en nombres y apellidos. */
const onlyLetters = (value) => value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');

/** Ícono a la derecha del correo según la verificación de disponibilidad. */
const EmailStatusIcon = ({ status }) => {
  if (status.checking) return <Loader2 className="mr-2 w-4 h-4 animate-spin text-ink-subtle" aria-hidden="true" />;
  if (status.disponible === true) return <CheckCircle2 className="mr-2 w-4 h-4 text-success-700" aria-hidden="true" />;
  if (status.disponible === false) return <AlertCircle className="mr-2 w-4 h-4 text-danger-700" aria-hidden="true" />;
  return null;
};

/**
 * Solicitud para personas sin cuenta en el banco: datos personales para emitir
 * un número de caso y terminar la afiliación en una agencia.
 *
 * @component
 * @param {Object} props
 * @param {string} props.cuiInput
 * @param {Object} props.nuevoForm
 * @param {Function} props.setNuevoForm
 * @param {string} props.birthDay
 * @param {string} props.birthMonth
 * @param {string} props.birthYear
 * @param {Function} props.handleDatePartChange
 * @param {Array<string>} props.DAYS
 * @param {Array<{val: string, name: string}>} props.MONTHS
 * @param {Array<string>} props.YEARS - Solo años de mayores de edad.
 * @param {Object|null} props.ageCalculation
 * @param {Object} props.emailStatus - Verificación del correo en tiempo real.
 * @param {Function} props.handleSubmitNuevo - Envío del formulario.
 * @param {Function} props.handleReset - Vuelve a la consulta de DPI.
 * @param {boolean} props.loading
 */
export const AgencyApplicationForm = ({
  cuiInput,
  nuevoForm,
  setNuevoForm,
  birthDay,
  birthMonth,
  birthYear,
  handleDatePartChange,
  DAYS,
  MONTHS,
  YEARS,
  ageCalculation,
  emailStatus,
  handleSubmitNuevo,
  handleReset,
  loading,
}) => {
  const emailError = emailStatus.disponible === false ? emailStatus.message : undefined;
  const emailHint = emailStatus.message && !emailError ? emailStatus.message : 'Lo usará para ingresar al portal cuando complete su afiliación.';

  return (
    <form onSubmit={handleSubmitNuevo}>
      <IdentityBar nombre="Solicitante nuevo" dpi={cuiInput} onChange={handleReset} disabled={loading} />

      <Alert tone="info" className="mb-6">
        No encontramos una cuenta del banco con este DPI. Complete sus datos y le daremos un número de caso para
        terminar la afiliación en cualquier agencia.
      </Alert>

      <StepHeader title="Sus datos" description="Escríbalos tal como aparecen en su DPI." />

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Primer nombre" required>
            <Input
              type="text"
              autoComplete="given-name"
              value={nuevoForm.primer_nombre}
              onChange={(e) => setNuevoForm({ ...nuevoForm, primer_nombre: onlyLetters(e.target.value) })}
              required
            />
          </Field>
          <Field label="Segundo nombre">
            <Input
              type="text"
              autoComplete="additional-name"
              value={nuevoForm.segundo_nombre}
              onChange={(e) => setNuevoForm({ ...nuevoForm, segundo_nombre: onlyLetters(e.target.value) })}
            />
          </Field>
          <Field label="Primer apellido" required>
            <Input
              type="text"
              autoComplete="family-name"
              value={nuevoForm.primer_apellido}
              onChange={(e) => setNuevoForm({ ...nuevoForm, primer_apellido: onlyLetters(e.target.value) })}
              required
            />
          </Field>
          <Field label="Segundo apellido">
            <Input
              type="text"
              value={nuevoForm.segundo_apellido}
              onChange={(e) => setNuevoForm({ ...nuevoForm, segundo_apellido: onlyLetters(e.target.value) })}
            />
          </Field>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink-soft">
            Fecha de nacimiento
            <span className="ml-0.5 text-danger-700" aria-hidden="true">*</span>
            <span className="sr-only"> (obligatorio)</span>
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            <Select value={birthDay} onChange={(e) => handleDatePartChange('day', e.target.value)} aria-label="Día" required>
              <option value="">Día</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={birthMonth} onChange={(e) => handleDatePartChange('month', e.target.value)} aria-label="Mes" required>
              <option value="">Mes</option>
              {MONTHS.map((m) => <option key={m.val} value={m.val}>{m.name}</option>)}
            </Select>
            <Select value={birthYear} onChange={(e) => handleDatePartChange('year', e.target.value)} aria-label="Año" required>
              <option value="">Año</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <p
            role="status"
            className={cn(
              'text-xs',
              ageCalculation ? (ageCalculation.valid ? 'text-success-700' : 'text-danger-700') : 'text-ink-subtle'
            )}
          >
            {ageCalculation ? ageCalculation.message : 'Debe tener 18 años cumplidos.'}
          </p>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Teléfono móvil" hint={`8 dígitos · ${nuevoForm.telefono.length}/8`} required>
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={8}
              value={nuevoForm.telefono}
              onChange={(e) => setNuevoForm({ ...nuevoForm, telefono: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              className="font-mono"
              required
            />
          </Field>
          <Field label="Correo electrónico" hint={emailHint} error={emailError} required>
            <Input
              type="email"
              autoComplete="email"
              value={nuevoForm.email}
              onChange={(e) => setNuevoForm({ ...nuevoForm, email: e.target.value })}
              trailing={<EmailStatusIcon status={emailStatus} />}
              required
            />
          </Field>
        </div>

        <Field label="Dirección" hint="Opcional.">
          <Input
            type="text"
            autoComplete="street-address"
            value={nuevoForm.direccion}
            onChange={(e) => setNuevoForm({ ...nuevoForm, direccion: e.target.value })}
          />
        </Field>

        <Field label="¿Cuánto piensa depositar al abrir su cuenta?" hint="Es un estimado; el depósito se hace en la agencia. Mínimo Q100.00.">
          <Input
            type="number"
            step="0.01"
            min="100.00"
            inputMode="decimal"
            prefix="Q"
            value={nuevoForm.monto_estimado}
            onChange={(e) => setNuevoForm({ ...nuevoForm, monto_estimado: e.target.value })}
            className="tabular-nums sm:max-w-xs"
          />
        </Field>
      </div>

      <StepActions>
        <Button variant="ghost" icon={ArrowLeft} onClick={handleReset} disabled={loading}>
          Volver
        </Button>
        <Button
          type="submit"
          loading={loading}
          loadingText="Enviando…"
          disabled={loading || emailStatus.disponible === false || emailStatus.checking}
        >
          Obtener número de caso
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </StepActions>
    </form>
  );
};

export default AgencyApplicationForm;
