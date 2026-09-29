import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, Field, Input, PasswordInput } from '../ui';
import { IdentityBar, StepActions, StepHeader } from './StepHeader';

/**
 * Paso 1 (clientes del banco): credenciales de la Banca en Línea para vincular sus cuentas.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.bancoData - Respuesta de la consulta de DPI.
 * @param {Object} props.bancoCreds
 * @param {Function} props.setBancoCreds
 * @param {Function} props.handleValidarCredencialesBanco - Envío del formulario.
 * @param {boolean} props.bancoAuthLoading
 * @param {Function} props.handleReset - Vuelve a la consulta de DPI.
 */
export const BankCredentialsStep = ({
  bancoData,
  bancoCreds,
  setBancoCreds,
  handleValidarCredencialesBanco,
  bancoAuthLoading,
  handleReset,
}) => {
  return (
    <div>
      <IdentityBar
        nombre={bancoData.cliente?.nombre_completo || 'Cliente del banco'}
        dpi={bancoData.cui_dpi}
        detalle={bancoData.cliente?.tipo_cliente === 'EMPLEADO_PLANILLA' ? 'Colaborador del banco' : 'Cliente del banco'}
        onChange={handleReset}
        disabled={bancoAuthLoading}
      />

      <StepHeader
        step={1}
        total={3}
        title="Confirme que es usted"
        description="Ingrese los datos con los que entra a la Banca en Línea del banco. Los usamos solo para ver sus cuentas; no se guardan en la cooperativa."
      />

      <form onSubmit={handleValidarCredencialesBanco} autoComplete="off" className="space-y-4">
        <Field label="Usuario de Banca en Línea" required>
          <Input
            type="text"
            name="banco_usuario_seguro"
            autoComplete="off"
            value={bancoCreds.nombre_usuario}
            onChange={(e) => setBancoCreds((prev) => ({ ...prev, nombre_usuario: e.target.value }))}
            required
          />
        </Field>

        <Field label="Código de cliente" hint="Aparece en su estado de cuenta del banco." required>
          <Input
            type="text"
            name="banco_codigo_seguro"
            autoComplete="off"
            value={bancoCreds.codigo}
            onChange={(e) => setBancoCreds((prev) => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
            className="font-mono uppercase"
            required
          />
        </Field>

        <Field label="Contraseña de Banca en Línea" required>
          <PasswordInput
            name="banco_password_seguro"
            autoComplete="new-password"
            value={bancoCreds.password}
            onChange={(e) => setBancoCreds((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
        </Field>

        <StepActions>
          <Button variant="ghost" icon={ArrowLeft} onClick={handleReset} disabled={bancoAuthLoading}>
            Volver
          </Button>
          <Button type="submit" loading={bancoAuthLoading} loadingText="Verificando…">
            Continuar
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Button>
        </StepActions>
      </form>
    </div>
  );
};

export default BankCredentialsStep;
