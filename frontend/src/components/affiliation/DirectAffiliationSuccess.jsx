import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui';
import { formatQ } from '../../utils/format';

/** Fila de una lista de definiciones. */
const Row = ({ label, children }) => (
  <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-ink">{children}</dd>
  </div>
);

/**
 * Afiliación completada (clientes del banco): usuario, cuenta creada, débito
 * realizado y cómo ingresar por primera vez.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.afiliacionExitosa - Respuesta de `/afiliacion/procesar-existente`.
 */
export const DirectAffiliationSuccess = ({ afiliacionExitosa }) => {
  if (!afiliacionExitosa) return null;

  const cuenta = afiliacionExitosa.cuenta_ahorro || afiliacionExitosa.cuenta_aportaciones;
  const origen = afiliacionExitosa.cuenta_bancaria_origen;
  const email = afiliacionExitosa.usuario.email;

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 w-6 h-6 shrink-0 text-success-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-ink">Ya es asociado de la cooperativa</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Su cuenta de ahorro está abierta y el aporte inicial ya está acreditado.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <section aria-labelledby="afiliacion-cuenta" className="rounded-md border border-line">
          <h3 id="afiliacion-cuenta" className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink">
            Su cuenta en la cooperativa
          </h3>
          <dl className="divide-y divide-line text-sm">
            <Row label="Titular">{afiliacionExitosa.asociado.nombre_completo}</Row>
            <Row label="Usuario"><span className="font-mono">{afiliacionExitosa.usuario.codigo_corporativo}</span></Row>
            <Row label="Cuenta de ahorro"><span className="font-mono">{cuenta?.numero_cuenta}</span></Row>
            <Row label="Saldo inicial"><span className="font-medium tabular-nums">{formatQ(cuenta?.saldo_disponible)}</span></Row>
          </dl>
        </section>

        <section aria-labelledby="afiliacion-banco" className="rounded-md border border-line">
          <h3 id="afiliacion-banco" className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink">
            Débito en el banco
          </h3>
          <dl className="divide-y divide-line text-sm">
            <Row label="Cuenta de origen"><span className="font-mono">{origen.numero_cuenta_bancaria}</span></Row>
            <Row label="Monto debitado"><span className="tabular-nums">{formatQ(origen.monto_debitado)}</span></Row>
            <Row label="Saldo que queda en el banco"><span className="tabular-nums">{formatQ(origen.nuevo_saldo)}</span></Row>
          </dl>
        </section>

        <section aria-labelledby="afiliacion-ingreso" className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <h3 id="afiliacion-ingreso" className="font-medium">Cómo ingresar por primera vez</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Revise su correo{email && <> <span className="font-medium">{email}</span></>}: ahí le enviamos su usuario.
            </li>
            <li>Inicie sesión con su usuario o su correo y la contraseña que acaba de elegir.</li>
          </ol>
        </section>

        {afiliacionExitosa.mfa?.qr_code_url && (
          <section aria-labelledby="afiliacion-2fa" className="rounded-md border border-line px-4 py-4">
            <h3 id="afiliacion-2fa" className="text-sm font-medium text-ink">Verificación en dos pasos</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Código generado para su usuario. También se lo enviamos por correo.
            </p>
            <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <img
                src={afiliacionExitosa.mfa.qr_code_url}
                alt="Código QR para configurar la verificación en dos pasos"
                className="h-36 w-36 shrink-0 rounded border border-line bg-white p-1"
              />
              <div className="min-w-0 text-sm">
                <p className="text-ink-muted">Si no puede escanearlo, use esta clave en su aplicación de autenticación:</p>
                <p className="mt-1 break-all font-mono text-ink select-all">{afiliacionExitosa.mfa.secret}</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <Button as={Link} to="/login" fullWidth size="lg" className="mt-8">
        Ir a iniciar sesión
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Button>
    </div>
  );
};

export default DirectAffiliationSuccess;
