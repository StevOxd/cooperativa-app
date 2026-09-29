import React from 'react';
import { formatQ } from '../../utils/format';

/** Cuenta donde se acreditará el crédito, con el texto disponible más claro. */
export const creditDestination = (c) =>
  c.cuenta_destino_info ||
  (c.cuenta_bancaria_destino_numero
    ? `Cuenta bancaria${c.cuenta_bancaria_destino_tipo ? ` ${c.cuenta_bancaria_destino_tipo}` : ''} (${c.cuenta_bancaria_destino_numero})`
    : 'Cuenta principal del asociado');

/**
 * Condiciones de una solicitud de crédito: monto, plazo, cuota, tasa y destino.
 *
 * @param {Object} props
 * @param {Object} props.credito
 * @param {boolean} [props.showRate=true]
 */
export const CreditTerms = ({ credito, showRate = true }) => (
  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
    <div>
      <dt className="text-xs text-ink-muted">Monto solicitado</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{formatQ(credito.monto_solicitado)}</dd>
    </div>
    <div>
      <dt className="text-xs text-ink-muted">Plazo</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{credito.plazo_meses} meses</dd>
    </div>
    <div>
      <dt className="text-xs text-ink-muted">Cuota mensual</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{formatQ(credito.cuota_mensual_estimada)}</dd>
    </div>
    {showRate && credito.tasa_interes !== undefined && credito.tasa_interes !== null ? (
      <div>
        <dt className="text-xs text-ink-muted">Tasa de interés</dt>
        <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
          {parseFloat(credito.tasa_interes).toFixed(2)}% <span className="text-sm font-normal text-ink-muted">anual</span>
        </dd>
      </div>
    ) : (
      <div className="col-span-2 sm:col-span-1">
        <dt className="text-xs text-ink-muted">Se acredita en</dt>
        <dd className="mt-0.5 text-sm text-ink">{creditDestination(credito)}</dd>
      </div>
    )}
  </dl>
);

export default CreditTerms;
