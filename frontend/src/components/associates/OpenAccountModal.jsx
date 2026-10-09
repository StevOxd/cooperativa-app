import React, { useState, useEffect } from 'react';
import { Check, FileDown, FileText, Mail } from 'lucide-react';
import api from '../../services/api';
import { generateAccountOpeningReceiptPdf } from '../../utils/accountOpeningReceiptPdf';
import { generateAccountStatementPdf } from '../../utils/accountStatementPdf';
import { Alert, Button, Field, Input, LoadingState, Modal, Select, cn } from '../ui';
import { toast } from '../../context/ToastContext';
import { formatDateTime, formatQ } from '../../utils/format';

const FORM_ID = 'apertura-cuenta';

/** Cómo se muestra el origen de los fondos en el resumen. */
const ORIGENES = {
  EFECTIVO_VENTANILLA: 'Efectivo en ventanilla',
  CUENTA_INTERNA: 'Otra cuenta del asociado',
  BANCO_EXTERNO: 'Cuenta del asociado en el banco',
};

/** Opción seleccionable con aspecto de tarjeta (radio accesible con teclado). */
const OptionCard = ({ name, checked, onSelect, children }) => (
  <label
    className={cn(
      'block cursor-pointer rounded-md border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600',
      checked ? 'border-brand-700 bg-brand-50' : 'border-line hover:border-line-strong'
    )}
  >
    <input type="radio" name={name} className="sr-only" checked={checked} onChange={onSelect} />
    {children}
  </label>
);

const TIPOS_PRODUCTO = [
  {
    id_tipo_cuenta: 2,
    nombre: 'Cuenta de Ahorro Corriente',
    descripcion: 'Disponibilidad inmediata de fondos con capitalización mensual de intereses.',
    monto_minimo: 100.0,
    tasa: '3.50%',
  },
  {
    id_tipo_cuenta: 3,
    nombre: 'Ahorro a Plazo Fijo',
    descripcion: 'Inversión a término con alto rendimiento y certificado de depósito.',
    monto_minimo: 1000.0,
    tasa: '7.00%',
  },
  {
    id_tipo_cuenta: 4,
    nombre: 'Plan de Ahorro Programado',
    descripcion: 'Ahorro sistemático para objetivos específicos con tasa preferencial.',
    monto_minimo: 100.0,
    tasa: '5.00%',
  },
  {
    id_tipo_cuenta: 5,
    nombre: 'Ahorro Juvenil / Metas',
    descripcion: 'Fomento al ahorro formativo y metas a mediano plazo.',
    monto_minimo: 50.0,
    tasa: '4.00%',
  },
];

/**
 * Apertura de una cuenta nueva para un asociado (Formulario 2).
 *
 * @param {Object} props
 * @param {Object} [props.valoresIniciales] - Para abrirla desde el resumen de una afiliación (issue #26):
 *   `{ origen_fondos, numero_cuenta_bancaria, monto_apertura }`.
 */
export const OpenAccountModal = ({ isOpen, onClose, asociado, onSuccess, valoresIniciales }) => {
  const [formData, setFormData] = useState({
    id_tipo_cuenta: 2,
    monto_apertura: '100.00',
    origen_fondos: 'EFECTIVO_VENTANILLA',
    id_cuenta_origen: '',
    numero_cuenta_bancaria: '',
  });

  const [cuentasAsociado, setCuentasAsociado] = useState([]);
  const [cuentasBanco, setCuentasBanco] = useState([]);
  const [cargandoBanco, setCargandoBanco] = useState(false);
  const [errorBanco, setErrorBanco] = useState(false);
  const [datosTitular, setDatosTitular] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  const productoSeleccionado =
    TIPOS_PRODUCTO.find((p) => p.id_tipo_cuenta === parseInt(formData.id_tipo_cuenta, 10)) ||
    TIPOS_PRODUCTO[0];

  useEffect(() => {
    if (isOpen && asociado) {
      // Si se cierra o cambia de asociado antes de que lleguen las respuestas, se ignoran.
      let vigente = true;
      setErrorMsg('');
      setSuccessData(null);
      setEmailSent(false);
      setEmailNotice('');
      setCuentasBanco([]);
      setCuentasAsociado([]);
      setDatosTitular(null);
      setErrorBanco(false);
      setCargandoBanco(true);
      setFormData({
        id_tipo_cuenta: 2,
        monto_apertura: valoresIniciales?.monto_apertura ? Number(valoresIniciales.monto_apertura).toFixed(2) : '100.00',
        origen_fondos: valoresIniciales?.origen_fondos || 'EFECTIVO_VENTANILLA',
        id_cuenta_origen: '',
        numero_cuenta_bancaria: valoresIniciales?.numero_cuenta_bancaria || '',
      });

      // Cargar cuentas del asociado (traslado interno) y sus cuentas en el banco (débito desde el banco)
      api.get(`/admin/asociados/${asociado.id_asociado}/expediente`)
        .then((res) => {
          if (!vigente) return;
          if (!res.data?.success) throw new Error('No se pudo cargar el expediente.');
          const ctas = res.data.data.cuentas || [];
          setCuentasAsociado(ctas);
          setDatosTitular(res.data.data.asociado || null);
          if (ctas.length > 0) {
            setFormData((prev) => ({ ...prev, id_cuenta_origen: ctas[0].id_cuenta }));
          }
          const cui = res.data.data.asociado?.cui_dpi || asociado.cui_dpi;
          if (!cui) return;
          return api.get(`/banco-externo/cuentas-cliente/${cui}`).then((bancoRes) => {
            if (!vigente) return;
            const lista = (bancoRes.data?.data || []).filter((c) => c.estado === 'ACTIVA');
            setCuentasBanco(lista);
            // La cuenta precargada solo se conserva si sigue en la lista; si no, la primera.
            setFormData((prev) => ({
              ...prev,
              numero_cuenta_bancaria: lista.some((c) => c.numero_cuenta_bancaria === prev.numero_cuenta_bancaria)
                ? prev.numero_cuenta_bancaria
                : lista[0]?.numero_cuenta_bancaria || '',
            }));
          });
        })
        .catch((err) => {
          if (!vigente) return;
          console.error('Error al cargar las cuentas del asociado:', err);
          setErrorBanco(true);
        })
        .finally(() => {
          if (vigente) setCargandoBanco(false);
        });
      return () => {
        vigente = false;
      };
    }
  }, [isOpen, asociado, valoresIniciales]);

  if (!isOpen || !asociado) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'id_tipo_cuenta') {
        const prod = TIPOS_PRODUCTO.find((p) => p.id_tipo_cuenta === parseInt(value, 10));
        if (prod && parseFloat(next.monto_apertura) < prod.monto_minimo) {
          next.monto_apertura = prod.monto_minimo.toFixed(2);
        }
      }
      return next;
    });
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const monto = parseFloat(formData.monto_apertura);
    if (isNaN(monto) || monto < productoSeleccionado.monto_minimo) {
      setErrorMsg(
        `El monto ingresado (Q${monto.toFixed(2)}) es menor al monto mínimo de apertura para ${
          productoSeleccionado.nombre
        } (Q${productoSeleccionado.monto_minimo.toFixed(2)}).`
      );
      return;
    }

    if (formData.origen_fondos === 'CUENTA_INTERNA' && !formData.id_cuenta_origen) {
      setErrorMsg('Elija la cuenta del asociado de la que saldrá el dinero.');
      return;
    }

    if (formData.origen_fondos === 'BANCO_EXTERNO') {
      const cuentaBanco = cuentasBanco.find((c) => c.numero_cuenta_bancaria === formData.numero_cuenta_bancaria);
      if (!cuentaBanco) {
        setErrorMsg('Elija la cuenta del banco de la que saldrá el dinero.');
        return;
      }
      if (parseFloat(cuentaBanco.saldo_disponible) < monto) {
        setErrorMsg(`La cuenta del banco tiene ${formatQ(cuentaBanco.saldo_disponible)}; no alcanza para el depósito.`);
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        id_tipo_cuenta: parseInt(formData.id_tipo_cuenta, 10),
        monto_apertura: monto,
        origen_fondos: formData.origen_fondos,
        id_cuenta_origen:
          formData.origen_fondos === 'CUENTA_INTERNA' ? parseInt(formData.id_cuenta_origen, 10) : undefined,
        numero_cuenta_bancaria:
          formData.origen_fondos === 'BANCO_EXTERNO' ? formData.numero_cuenta_bancaria : undefined,
      };

      const res = await api.post(`/admin/asociados/${asociado.id_asociado}/cuentas`, payload);

      if (res.data?.success) {
        setSuccessData(res.data.data);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'No se pudo abrir la cuenta. Intente de nuevo.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'No se pudo abrir la cuenta. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!successData || !asociado) return;
    try {
      // El generador ya descarga el archivo; no volver a llamar a doc.save() aquí (se descargaba dos veces).
      generateAccountOpeningReceiptPdf({
        data: {
          asociado: {
            id_asociado: asociado.id_asociado,
            nombre_completo: asociado.nombre_completo,
            cui_dpi: asociado.cui_dpi,
            email: asociado.email,
            telefono: asociado.telefono,
          },
          cuenta: {
            numero_cuenta: successData.numero_cuenta,
            tipo_cuenta: successData.tipo_cuenta,
            saldo_disponible: successData.saldo_disponible,
            fecha_apertura: successData.fecha_apertura,
          },
          deposito: {
            monto: successData.saldo_disponible,
            metodo_pago: formData.origen_fondos,
            tipo_operacion: 'APERTURA_Y_FONDEO',
          },
        },
      });
    } catch (err) {
      console.error('Error al generar PDF de comprobante:', err);
      toast.error('No se pudo generar el comprobante. Intente de nuevo.');
    }
  };

  // Si los fondos vinieron del banco hubo un traslado: el asociado se lleva el estado de cuenta (issue #26).
  const handleDownloadStatement = () => {
    if (!successData) return;
    try {
      generateAccountStatementPdf({
        asociado: {
          ...asociado,
          ...(datosTitular || {}),
          nombre_completo: datosTitular?.nombre_completo || asociado.nombre_completo,
        },
        cuenta: {
          numero_cuenta: successData.numero_cuenta,
          tipo_cuenta: successData.tipo_cuenta,
          saldo_disponible: successData.saldo_disponible,
          saldo_reserva: 0,
          estado: 'ACTIVA',
        },
        transacciones: successData.movimiento_inicial ? [successData.movimiento_inicial] : [],
        origen: 'ventanilla',
      });
    } catch (err) {
      console.error('Error al generar el estado de cuenta:', err);
      toast.error('No se pudo generar el estado de cuenta. Intente de nuevo.');
    }
  };

  const handleSendEmail = async () => {
    if (!successData || !asociado) return;
    setSendingEmail(true);
    setEmailNotice('');
    setEmailSent(false);

    try {
      const res = await api.post(`/admin/asociados/${asociado.id_asociado}/enviar-boleta-apertura`, {
        numero_cuenta: successData.numero_cuenta,
        tipo_cuenta: successData.tipo_cuenta,
        saldo_disponible: successData.saldo_disponible,
        fecha_apertura: successData.fecha_apertura,
        origen_fondos: formData.origen_fondos,
      });

      if (res.data?.success) {
        setEmailSent(true);
        setEmailNotice(res.data.message || 'Comprobante enviado al correo del asociado.');
      } else {
        setEmailNotice(res.data?.message || 'No se pudo enviar el correo.');
      }
    } catch (err) {
      console.error('Error al enviar boleta por correo:', err);
      setEmailNotice(err.response?.data?.message || 'No se pudo enviar el comprobante. Intente de nuevo.');
    } finally {
      setSendingEmail(false);
    }
  };


  if (successData) {
    return (
      <Modal
        isOpen
        onClose={onClose}
        lockScroll={false}
        title="Cuenta abierta"
        description={`${successData.tipo_cuenta} para ${asociado.nombre_completo}.`}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                variant="secondary"
                icon={emailSent ? Check : Mail}
                onClick={handleSendEmail}
                loading={sendingEmail}
                loadingText="Enviando…"
                disabled={emailSent}
                title="Enviar el comprobante al correo del asociado"
              >
                {emailSent ? 'Comprobante enviado' : 'Enviar por correo'}
              </Button>
              {formData.origen_fondos === 'BANCO_EXTERNO' && (
                <Button
                  variant="secondary"
                  icon={FileText}
                  onClick={handleDownloadStatement}
                  title="Descargar el estado de cuenta en PDF con el traslado desde el banco"
                >
                  Estado de cuenta
                </Button>
              )}
              <Button icon={FileDown} onClick={handleDownloadPdf} title="Descargar el comprobante en PDF">
                Descargar comprobante
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <dl className="divide-y divide-line rounded-md border border-line text-sm">
            {[
              ['Titular', asociado.nombre_completo],
              ['Producto', successData.tipo_cuenta],
              ['Número de cuenta', successData.numero_cuenta, 'font-mono'],
              ['Saldo inicial', formatQ(successData.saldo_disponible), 'font-medium tabular-nums'],
              [
                'Origen de los fondos',
                formData.origen_fondos === 'BANCO_EXTERNO'
                  ? `${ORIGENES.BANCO_EXTERNO} (${formData.numero_cuenta_bancaria})`
                  : ORIGENES[formData.origen_fondos],
              ],
              ['Fecha de apertura', formatDateTime(successData.fecha_apertura)],
            ].map(([label, value, valueClass]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-muted">{label}</dt>
                <dd className={cn('text-right text-ink', valueClass)}>{value}</dd>
              </div>
            ))}
          </dl>
          {emailNotice && <Alert tone={emailSent ? 'success' : 'danger'}>{emailNotice}</Alert>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!loading}
      closeOnOverlay={false}
      lockScroll={false}
      size="lg"
      title="Abrir cuenta"
      description={`Titular: ${asociado.nombre_completo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={loading}
            loadingText="Abriendo cuenta…"
            disabled={formData.origen_fondos === 'BANCO_EXTERNO' && (cargandoBanco || cuentasBanco.length === 0)}
          >
            Abrir cuenta
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6">
        {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">
            Producto
            <span className="ml-0.5 text-danger-700" aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS_PRODUCTO.map((p) => (
              <OptionCard
                key={p.id_tipo_cuenta}
                name="producto"
                checked={formData.id_tipo_cuenta === p.id_tipo_cuenta}
                onSelect={() => handleChange({ target: { name: 'id_tipo_cuenta', value: p.id_tipo_cuenta } })}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-medium text-ink">{p.nombre}</span>
                  <span className="shrink-0 tabular-nums text-ink-soft">{p.tasa}</span>
                </span>
                <span className="mt-1 block text-xs text-ink-muted">{p.descripcion}</span>
                <span className="mt-2 block text-xs text-ink-subtle">Apertura desde {formatQ(p.monto_minimo)}</span>
              </OptionCard>
            ))}
          </div>
        </fieldset>

        <Field label="Depósito inicial" hint={`Mínimo ${formatQ(productoSeleccionado.monto_minimo)} para este producto.`} required>
          <Input
            type="number"
            step="0.01"
            min={productoSeleccionado.monto_minimo}
            name="monto_apertura"
            prefix="Q"
            value={formData.monto_apertura}
            onChange={handleChange}
            className="tabular-nums sm:max-w-xs"
            required
          />
        </Field>

        <fieldset className="space-y-3 border-t border-line pt-5">
          <legend className="mb-2 text-sm font-medium text-ink-soft">Origen de los fondos</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <OptionCard
              name="origen"
              checked={formData.origen_fondos === 'EFECTIVO_VENTANILLA'}
              onSelect={() => handleChange({ target: { name: 'origen_fondos', value: 'EFECTIVO_VENTANILLA' } })}
            >
              <span className="block font-medium text-ink">Efectivo en ventanilla</span>
              <span className="block text-xs text-ink-muted">El asociado deposita en la agencia.</span>
            </OptionCard>
            <OptionCard
              name="origen"
              checked={formData.origen_fondos === 'CUENTA_INTERNA'}
              onSelect={() => handleChange({ target: { name: 'origen_fondos', value: 'CUENTA_INTERNA' } })}
            >
              <span className="block font-medium text-ink">Otra cuenta del asociado</span>
              <span className="block text-xs text-ink-muted">Se debita de una de sus cuentas en la cooperativa.</span>
            </OptionCard>
            <OptionCard
              name="origen"
              checked={formData.origen_fondos === 'BANCO_EXTERNO'}
              onSelect={() => handleChange({ target: { name: 'origen_fondos', value: 'BANCO_EXTERNO' } })}
            >
              <span className="block font-medium text-ink">{ORIGENES.BANCO_EXTERNO}</span>
              <span className="block text-xs text-ink-muted">Se traslada desde su cuenta de ahorro o monetaria en el banco.</span>
            </OptionCard>
          </div>

          {formData.origen_fondos === 'BANCO_EXTERNO' &&
            (cargandoBanco ? (
              <LoadingState label="Consultando cuentas del banco…" className="py-6" />
            ) : errorBanco ? (
              <Alert tone="danger">No se pudieron consultar las cuentas del banco. Cierre y vuelva a intentarlo.</Alert>
            ) : cuentasBanco.length > 0 ? (
              <Field label="Cuenta del banco de la que se debita" hint="Solo cuentas del asociado." required>
                <Select name="numero_cuenta_bancaria" value={formData.numero_cuenta_bancaria} onChange={handleChange} required>
                  {cuentasBanco.map((c) => (
                    <option key={c.numero_cuenta_bancaria} value={c.numero_cuenta_bancaria}>
                      {c.tipo_cuenta} · {c.numero_cuenta_bancaria} (saldo {formatQ(c.saldo_disponible)})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Alert tone="warning">El asociado no tiene cuentas activas en el banco.</Alert>
            ))}

          {formData.origen_fondos === 'CUENTA_INTERNA' &&
            (cuentasAsociado.length > 0 ? (
              <Field label="Cuenta de la que se debita" required>
                <Select name="id_cuenta_origen" value={formData.id_cuenta_origen} onChange={handleChange} required>
                  {cuentasAsociado.map((c) => (
                    <option key={c.id_cuenta} value={c.id_cuenta}>
                      {c.tipo_cuenta} · {c.numero_cuenta} (saldo {formatQ(c.saldo_disponible)})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Alert tone="warning">El asociado no tiene cuentas en la cooperativa con saldo.</Alert>
            ))}
        </fieldset>
      </form>
    </Modal>
  );
};

export default OpenAccountModal;
