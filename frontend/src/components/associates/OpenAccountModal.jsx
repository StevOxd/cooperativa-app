import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { generateAccountOpeningReceiptPdf } from '../../utils/accountOpeningReceiptPdf';
import {
  X,
  CreditCard,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Wallet,
  Banknote,
  ShieldCheck,
  FileDown,
  Mail,
  Check,
} from 'lucide-react';

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

export const OpenAccountModal = ({ isOpen, onClose, asociado, onSuccess }) => {
  const [formData, setFormData] = useState({
    id_tipo_cuenta: 2,
    monto_apertura: '100.00',
    origen_fondos: 'EFECTIVO_VENTANILLA',
    id_cuenta_origen: '',
  });

  const [cuentasAsociado, setCuentasAsociado] = useState([]);
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
      setErrorMsg('');
      setSuccessData(null);
      setEmailSent(false);
      setEmailNotice('');
      setFormData({
        id_tipo_cuenta: 2,
        monto_apertura: '100.00',
        origen_fondos: 'EFECTIVO_VENTANILLA',
        id_cuenta_origen: '',
      });

      // Cargar cuentas del asociado para traslado interno
      api.get(`/admin/asociados/${asociado.id_asociado}/expediente`)
        .then((res) => {
          if (res.data?.success) {
            const ctas = res.data.data.cuentas || [];
            setCuentasAsociado(ctas);
            if (ctas.length > 0) {
              setFormData((prev) => ({ ...prev, id_cuenta_origen: ctas[0].id_cuenta }));
            }
          }
        })
        .catch((err) => console.error('Error al cargar expediente:', err));
    }
  }, [isOpen, asociado]);

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
      setErrorMsg('Debe seleccionar la cuenta interna del asociado para realizar el débito.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        id_tipo_cuenta: parseInt(formData.id_tipo_cuenta, 10),
        monto_apertura: monto,
        origen_fondos: formData.origen_fondos,
        id_cuenta_origen:
          formData.origen_fondos === 'CUENTA_INTERNA' ? parseInt(formData.id_cuenta_origen, 10) : undefined,
      };

      const res = await api.post(`/admin/asociados/${asociado.id_asociado}/cuentas`, payload);

      if (res.data?.success) {
        setSuccessData(res.data.data);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'Error al aperturar cuenta.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Error al procesar la apertura de la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!successData || !asociado) return;
    try {
      const doc = generateAccountOpeningReceiptPdf({
        data: {
          asociado: {
            id_asociado: asociado.id_asociado,
            nombre_completo: asociado.nombre_completo,
            cui_dpi: asociado.cui_dpi,
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
      doc.save(`Comprobante_Apertura_${successData.numero_cuenta}.pdf`);
    } catch (err) {
      console.error('Error al generar PDF de comprobante:', err);
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
        setEmailNotice(res.data.message || 'Comprobante enviado al correo del asociado con éxito.');
      } else {
        setEmailNotice(res.data?.message || 'No se pudo enviar el correo.');
      }
    } catch (err) {
      console.error('Error al enviar boleta por correo:', err);
      setEmailNotice(err.response?.data?.message || 'Error al enviar el comprobante por correo.');
    } finally {
      setSendingEmail(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-account-modal-title"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 id="open-account-modal-title" className="text-base font-bold text-slate-800">
                Formulario 2: Apertura de Cuenta Financiera
              </h3>
              <p className="text-xs text-slate-500">
                Titular: <span className="font-semibold text-slate-700">{asociado.nombre_completo}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Error dentro del Modal */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div className="text-xs font-semibold">{errorMsg}</div>
          </div>
        )}

        {/* Vista de Éxito / Boleta Oficial */}
        {successData ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">¡Cuenta Aperturada Exitosamente!</h4>
              <p className="text-xs text-slate-600 mt-1">
                El producto financiero ha sido registrado y activado en el sistema core de la cooperativa.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Titular:</span>
                <span className="font-bold text-slate-800">{asociado.nombre_completo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Producto:</span>
                <span className="font-bold text-slate-800">{successData.tipo_cuenta}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Número de Cuenta Generado:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">{successData.numero_cuenta}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Saldo Disponible Inicial:</span>
                <span className="font-bold text-emerald-600 text-sm">
                  Q{parseFloat(successData.saldo_disponible).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Origen de Fondos:</span>
                <span className="font-semibold text-slate-700">
                  {formData.origen_fondos === 'EFECTIVO_VENTANILLA' ? 'Efectivo en Ventanilla' : 'Cuenta Interna Cooperativa'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha de Alta:</span>
                <span className="text-slate-700 font-medium">
                  {new Date(successData.fecha_apertura).toLocaleString()}
                </span>
              </div>
            </div>

            {emailNotice && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                  emailSent
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {emailSent ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{emailNotice}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                  title="Descargar comprobante en formato PDF"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Descargar Boleta (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={sendingEmail || emailSent}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="Enviar comprobante por correo electrónico al asociado"
                >
                  {sendingEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : emailSent ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Boleta Enviada</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Enviar por Correo</span>
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cerrar y Actualizar Padrón
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Selección de Producto */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Seleccione el Producto Financiero *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TIPOS_PRODUCTO.map((p) => {
                  const isSelected = formData.id_tipo_cuenta === p.id_tipo_cuenta;
                  return (
                    <div
                      key={p.id_tipo_cuenta}
                      onClick={() => handleChange({ target: { name: 'id_tipo_cuenta', value: p.id_tipo_cuenta } })}
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-xs text-slate-800">{p.nombre}</p>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          {p.tasa}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{p.descripcion}</p>
                      <p className="text-[11px] font-semibold text-blue-700 mt-2">
                        Mínimo apertura: Q{p.monto_minimo.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monto de Apertura */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Monto de Depósito Inicial *
                </label>
                <span className="text-xs text-slate-500">
                  Mínimo requerido: <strong>Q{productoSeleccionado.monto_minimo.toFixed(2)}</strong>
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-blue-700 text-sm">Q</span>
                <input
                  type="number"
                  step="0.01"
                  min={productoSeleccionado.monto_minimo}
                  name="monto_apertura"
                  value={formData.monto_apertura}
                  onChange={handleChange}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:ring-2 focus:ring-blue-600 text-sm"
                  required
                />
              </div>
            </div>

            {/* Origen de Fondos */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Origen de los Fondos para Apertura *
              </label>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => handleChange({ target: { name: 'origen_fondos', value: 'EFECTIVO_VENTANILLA' } })}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    formData.origen_fondos === 'EFECTIVO_VENTANILLA'
                      ? 'border-blue-600 bg-blue-50/60 text-blue-700 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                  <span className="text-xs font-semibold block">Efectivo en Ventanilla</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Depósito in situ en agencia</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange({ target: { name: 'origen_fondos', value: 'CUENTA_INTERNA' } })}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    formData.origen_fondos === 'CUENTA_INTERNA'
                      ? 'border-blue-600 bg-blue-50/60 text-blue-700 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Wallet className="w-5 h-5 mx-auto mb-1 text-sky-600" />
                  <span className="text-xs font-semibold block">Cuenta Interna</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Débito a otra cuenta del socio</span>
                </button>
              </div>

              {/* Detalle según Origen */}
              {formData.origen_fondos === 'CUENTA_INTERNA' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta Interna de Débito:
                  </label>
                  {cuentasAsociado.length > 0 ? (
                    <select
                      name="id_cuenta_origen"
                      value={formData.id_cuenta_origen}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      required
                    >
                      {cuentasAsociado.map((c) => (
                        <option key={c.id_cuenta} value={c.id_cuenta}>
                          {c.tipo_cuenta} - {c.numero_cuenta} (Saldo: Q{parseFloat(c.saldo_disponible).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-amber-700">El asociado no posee cuentas internas con saldo.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Aperturando...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar Apertura</span>
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default OpenAccountModal;
