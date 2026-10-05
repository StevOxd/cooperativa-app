import React from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, Button, Field, Input, PasswordInput } from '../ui';
import { formatQ } from '../../utils/format';
import { checkPassword } from '../../utils/passwordPolicy';
import { PasswordRequirement } from '../auth/PasswordRequirement';
import { StepActions, StepHeader } from './StepHeader';

/** Ícono a la derecha del correo según la verificación de disponibilidad. */
const EmailStatusIcon = ({ status }) => {
  if (status.checking) return <Loader2 className="mr-2 w-4 h-4 animate-spin text-ink-subtle" aria-hidden="true" />;
  if (status.disponible === true) return <CheckCircle2 className="mr-2 w-4 h-4 text-success-700" aria-hidden="true" />;
  if (status.disponible === false) return <AlertCircle className="mr-2 w-4 h-4 text-danger-700" aria-hidden="true" />;
  return null;
};

/**
 * Paso 3 (clientes del banco): correo y contraseña del portal, y confirmación del débito.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.credenciales
 * @param {Function} props.setCredenciales
 * @param {Object} props.credEmailStatus - Verificación del correo en tiempo real.
 * @param {string|null} props.codigoPortalExistente - Código del usuario que ya tiene; si viene, no se pide correo ni contraseña.
 * @param {Object|null} props.cuentaSeleccionadaObj - Cuenta del banco a debitar.
 * @param {string} props.montoAportacion
 * @param {Function} props.handleSubmitExistente - Envío del formulario.
 * @param {boolean} props.loading
 * @param {Function} props.setPhase
 */
export const PortalPasswordStep = ({
  credenciales,
  setCredenciales,
  credEmailStatus,
  codigoPortalExistente,
  cuentaSeleccionadaObj,
  montoAportacion,
  handleSubmitExistente,
  loading,
  setPhase,
}) => {
  const emailError = credEmailStatus.disponible === false ? credEmailStatus.message : undefined;
  const emailHint = credEmailStatus.message && !emailError ? credEmailStatus.message : 'Aquí recibirá sus datos de acceso.';
  const { hasMinLength, hasLetters, hasNumbers, hasSpecial } = checkPassword(credenciales.password);

  return (
    <form onSubmit={handleSubmitExistente}>
      <StepHeader
        step={3}
        total={3}
        title="Su acceso al portal"
        description={
          codigoPortalExistente
            ? 'Revise el débito del aporte inicial y confirme la afiliación.'
            : 'Con este correo y esta contraseña consultará sus cuentas y solicitará créditos en línea.'
        }
      />

      {codigoPortalExistente ? (
        <Alert tone="info" title="Ya tiene acceso al portal">
          Seguirá entrando con su usuario <span className="font-mono font-medium">{codigoPortalExistente}</span> y su
          contraseña de siempre. No cambia nada de su acceso.
        </Alert>
      ) : (
        <div className="space-y-4">
          <Field label="Correo electrónico" hint={emailHint} error={emailError} required>
            <Input
              type="email"
              autoComplete="email"
              value={credenciales.email}
              onChange={(e) => setCredenciales((prev) => ({ ...prev, email: e.target.value }))}
              trailing={<EmailStatusIcon status={credEmailStatus} />}
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contraseña" required>
              <PasswordInput
                autoComplete="new-password"
                value={credenciales.password}
                onChange={(e) => setCredenciales((prev) => ({ ...prev, password: e.target.value }))}
                aria-describedby="requisitos-password-portal"
                required
              />
            </Field>
            <Field label="Repita la contraseña" required>
              <PasswordInput
                autoComplete="new-password"
                value={credenciales.confirmPassword}
                onChange={(e) => setCredenciales((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                required
              />
            </Field>
          </div>
          <ul id="requisitos-password-portal" className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Requisitos de la contraseña">
            <PasswordRequirement met={hasMinLength}>Al menos 8 caracteres</PasswordRequirement>
            <PasswordRequirement met={hasLetters}>Letras</PasswordRequirement>
            <PasswordRequirement met={hasNumbers}>Números</PasswordRequirement>
            <PasswordRequirement met={hasSpecial}>Un símbolo (!@#$…)</PasswordRequirement>
          </ul>
        </div>
      )}

      {/* Lo que se va a debitar al confirmar */}
      <section aria-labelledby="resumen-debito" className="mt-6 rounded-md border border-line">
        <h3 id="resumen-debito" className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink">
          Al confirmar
        </h3>
        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Se debita de</dt>
            <dd className="font-mono text-ink">{cuentaSeleccionadaObj?.numero_cuenta_bancaria}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-ink-muted">Aporte inicial</dt>
            <dd className="font-medium text-ink tabular-nums">{formatQ(montoAportacion)}</dd>
          </div>
        </dl>
      </section>

      <StepActions>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setPhase('EXISTENTE_CONFIG')} disabled={loading}>
          Volver
        </Button>
        <Button
          type="submit"
          loading={loading}
          loadingText="Afiliando…"
          disabled={loading || (!codigoPortalExistente && (credEmailStatus.disponible === false || credEmailStatus.checking))}
        >
          Confirmar afiliación
        </Button>
      </StepActions>
    </form>
  );
};

export default PortalPasswordStep;
