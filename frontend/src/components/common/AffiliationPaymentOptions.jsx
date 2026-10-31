import React, { useEffect, useId, useState } from 'react';
import api from '../../services/api';
import { Alert, Field, Select, cn } from '../ui';
import { formatQ, humanize } from '../../utils/format';
import { COBRO } from '../../utils/cobroAfiliacion';

/**
 * Cómo paga el aporte quien se afilia en ventanilla. Si tiene cuentas activas en el banco, se le pregunta si el
 * efectivo va a una de ellas o a una cuenta nueva y, si se permite, si prefiere que se debite de su cuenta.
 *
 * @param {Object} props
 * @param {string} props.cui - DPI de 13 dígitos (con menos, no se consulta).
 * @param {{ metodo: string, cuenta: string }} props.value
 * @param {(cobro: { metodo: string, cuenta: string }) => void} props.onChange
 * @param {boolean} [props.permitirDebito=false] - Ofrece el débito de su cuenta (formalización).
 * @param {boolean} [props.disabled=false]
 */
export const AffiliationPaymentOptions = ({ cui, value, onChange, permitirDebito = false, disabled = false }) => {
  const nombre = useId();
  const [cuentas, setCuentas] = useState([]);
  const [estado, setEstado] = useState('inicial');

  useEffect(() => {
    if (!/^\d{13}$/.test(cui || '')) {
      setCuentas([]);
      setEstado('inicial');
      return undefined;
    }
    let vigente = true;
    // Las cuentas de la persona anterior no se ofrecen mientras llegan las de esta
    setCuentas([]);
    setEstado('cargando');
    api.get(`/banco-externo/cuentas-cliente/${cui}`)
      .then((res) => {
        if (!vigente) return;
        setCuentas((Array.isArray(res.data?.data) ? res.data.data : []).filter((c) => c.estado === 'ACTIVA' && ['AHORRO', 'MONETARIA'].includes(c.tipo_cuenta)));
        setEstado('listo');
      })
      .catch(() => {
        if (!vigente) return;
        setCuentas([]);
        setEstado('error');
      });
    return () => { vigente = false; };
  }, [cui]);

  // Sin cuentas (o sin poder consultarlas) solo queda la cuenta nueva
  useEffect(() => {
    if (cuentas.length === 0 && value.metodo !== COBRO.EFECTIVO_NUEVA) onChange({ metodo: COBRO.EFECTIVO_NUEVA, cuenta: '' });
    else if (value.metodo === COBRO.DEBITO && !permitirDebito) onChange({ metodo: COBRO.EFECTIVO_NUEVA, cuenta: '' });
    else if (cuentas.length > 0 && value.metodo !== COBRO.EFECTIVO_NUEVA && !cuentas.some((c) => c.numero_cuenta_bancaria === value.cuenta)) {
      onChange({ ...value, cuenta: cuentas[0].numero_cuenta_bancaria });
    }
  }, [cuentas, value, onChange, permitirDebito]);

  const opciones = [
    { id: COBRO.EFECTIVO_NUEVA, label: 'Efectivo: abrirle una cuenta de ahorro nueva en el banco' },
    ...(cuentas.length > 0 ? [{ id: COBRO.EFECTIVO_EXISTENTE, label: 'Efectivo: depositarlo en una cuenta que ya tiene' }] : []),
    ...(cuentas.length > 0 && permitirDebito ? [{ id: COBRO.DEBITO, label: 'Débito de su cuenta del banco (sin efectivo)' }] : []),
  ];
  const elegir = (metodo) => onChange({ metodo, cuenta: metodo === COBRO.EFECTIVO_NUEVA ? '' : value.cuenta || cuentas[0]?.numero_cuenta_bancaria || '' });

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-ink-soft">Forma de pago</legend>
      <p role="status" className="min-h-5 text-sm text-ink-muted">
        {estado === 'cargando' && 'Consultando las cuentas del cliente en el banco…'}
      </p>
      {estado === 'error' && (
        <Alert tone="warning">No se pudieron consultar las cuentas del cliente en el banco: solo se puede abrir una cuenta nueva.</Alert>
      )}
      <div className="space-y-1.5">
        {opciones.map((opcion) => (
          <label
            key={opcion.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2',
              value.metodo === opcion.id ? 'border-brand-600 bg-brand-50 text-ink' : 'border-line text-ink-soft'
            )}
          >
            <input
              type="radio"
              name={nombre}
              value={opcion.id}
              checked={value.metodo === opcion.id}
              onChange={() => elegir(opcion.id)}
              className="h-4 w-4 accent-brand-700"
            />
            {opcion.label}
          </label>
        ))}
      </div>
      {value.metodo !== COBRO.EFECTIVO_NUEVA && cuentas.length > 0 && (
        <Field label={value.metodo === COBRO.DEBITO ? 'Cuenta de la que se debita' : 'Cuenta donde se deposita'}>
          <Select value={value.cuenta} onChange={(e) => onChange({ ...value, cuenta: e.target.value })}>
            {cuentas.map((c) => (
              <option key={c.numero_cuenta_bancaria} value={c.numero_cuenta_bancaria}>
                {/* Una sola cadena (un <option> solo admite texto); el saldo solo importa para debitar */}
                {`${humanize(c.tipo_cuenta)} ${c.numero_cuenta_bancaria}${value.metodo === COBRO.DEBITO ? ` · ${formatQ(c.saldo_disponible)}` : ''}`}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </fieldset>
  );
};

export default AffiliationPaymentOptions;
