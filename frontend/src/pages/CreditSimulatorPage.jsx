import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FileText,
  Calendar,
  Percent,
  Calculator,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  RefreshCw,
  Send,
} from 'lucide-react';

export const CreditSimulatorPage = () => {
  const [monto, setMonto] = useState(5000);
  const [plazo, setPlazo] = useState(12);
  const [observaciones, setObservaciones] = useState('');
  const [cuota, setCuota] = useState(0);

  // Estados de carga e historial
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tasa de interés base: 10% anual
  const tasaAnual = 10;

  // Calcular la cuota estimada en tiempo real
  useEffect(() => {
    const tasaMensual = (tasaAnual / 100) / 12;
    let cuotaEstimada = 0;
    if (tasaMensual > 0) {
      cuotaEstimada = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
    } else {
      cuotaEstimada = monto / plazo;
    }
    setCuota(isNaN(cuotaEstimada) || !isFinite(cuotaEstimada) ? 0 : Math.round(cuotaEstimada * 100) / 100);
  }, [monto, plazo]);

  const fetchCreditos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/asociado/creditos');
      if (response.data?.success) {
        setCreditos(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar créditos:', err);
      setErrorMessage('No se pudieron obtener las solicitudes de crédito anteriores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditos();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    setSubmitting(true);

    try {
      const response = await api.post('/asociado/creditos', {
        monto_solicitado: monto,
        plazo_meses: plazo,
        observaciones,
      });

      if (response.data?.success) {
        setSuccessMessage('Su solicitud de crédito ha sido presentada exitosamente al comité de evaluación.');
        setObservaciones('');
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al enviar solicitud:', err);
      setErrorMessage(err.response?.data?.message || 'Error al procesar la solicitud de crédito.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCreditBadgeColor = (estado) => {
    switch (estado) {
      case 'APROBADA':
      case 'DESEMBOLSADA':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'RECHAZADA':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
          <Calculator className="w-7 h-7 text-emerald-600" />
          <span>Simulador de Créditos Financieros</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Calcule sus cuotas en tiempo real bajo amortización nivelada francesa y envíe su solicitud al comité.
        </p>
      </div>

      {/* Alertas */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-red-600 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Simulador y Formulario (Izquierda) */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
            Calcular Préstamo
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Monto */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Monto Solicitado (Quetzales)
                </label>
                <span className="text-sm font-extrabold text-slate-900">
                  Q{monto.toLocaleString('es-GT')}
                </span>
              </div>
              <div className="relative">
                <div className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">Q</div>
                <input
                  type="number"
                  min={500}
                  max={500000}
                  step={100}
                  value={monto}
                  onChange={(e) => setMonto(Math.max(500, parseFloat(e.target.value) || 0))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <input
                type="range"
                min={500}
                max={150000}
                step={500}
                value={monto}
                onChange={(e) => setMonto(parseFloat(e.target.value))}
                className="w-full mt-3 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-700"
              />
            </div>

            {/* Plazo */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Plazo en Meses
                </label>
                <span className="text-sm font-extrabold text-slate-900">
                  {plazo} meses
                </span>
              </div>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="number"
                  min={3}
                  max={120}
                  value={plazo}
                  onChange={(e) => setPlazo(Math.max(3, parseInt(e.target.value, 10) || 0))}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <input
                type="range"
                min={3}
                max={60}
                step={1}
                value={plazo}
                onChange={(e) => setPlazo(parseInt(e.target.value, 10))}
                className="w-full mt-3 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-700"
              />
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Destino del Crédito / Observaciones
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. Inversión en vivienda, consolidación de deudas, etc."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {/* Botón de Enviar */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando envío...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar Solicitud al Comité</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Resumen e Informativo (Derecha) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjeta de Resumen */}
          <div className="bg-emerald-900 p-6 sm:p-8 rounded-2xl text-white shadow-md space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            
            <h3 className="text-base font-bold border-b border-white/10 pb-3 flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-emerald-300" />
              <span>Resumen de Cuota Estimada</span>
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-200">Monto total:</span>
                <span className="font-bold">Q{monto.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-200">Plazo amortización:</span>
                <span className="font-bold">{plazo} meses</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-200">Tasa Anual:</span>
                <span className="font-semibold text-emerald-300">{tasaAnual}% Fija</span>
              </div>

              <div className="border-t border-white/10 pt-4 mt-2">
                <span className="text-xs text-emerald-200 block mb-1">Cuota Mensual Estimada</span>
                <span className="text-3xl font-extrabold tracking-tight">
                  Q{cuota.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-emerald-300 block mt-1">
                  * Amortización nivelada francesa. No incluye seguros.
                </span>
              </div>
            </div>
          </div>

          {/* Requisitos Informativos */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Requisitos de Préstamo
            </h4>
            <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
              <li>Membresía activa en la Cooperativa.</li>
              <li>Aportaciones ordinarias al día.</li>
              <li>Capacidad de pago verificable.</li>
              <li>Aprobación sujeta a políticas del comité de créditos.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Historial de Solicitudes (Seguimiento) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-slate-800">
            Historial de mis Solicitudes
          </h3>
          <button
            onClick={fetchCreditos}
            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
            <p className="text-xs">Actualizando historial...</p>
          </div>
        ) : creditos.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No posee solicitudes registradas.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold text-right">Monto</th>
                  <th className="px-4 py-3 font-semibold text-center">Plazo</th>
                  <th className="px-4 py-3 font-semibold text-right">Cuota Estimada</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditos.map((c) => (
                  <tr key={c.id_solicitud_credito} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      {new Date(c.fecha_solicitud).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                      Q{parseFloat(c.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-700 text-xs">
                      {c.plazo_meses} meses
                    </td>
                    <td className="px-4 py-3.5 text-right text-emerald-800 font-semibold">
                      Q{parseFloat(c.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getCreditBadgeColor(c.estado)}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs max-w-xs truncate">
                      {c.observaciones || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditSimulatorPage;
