import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import {
  X,
  Users2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  PieChart,
  Percent,
  Sparkles,
  ShieldCheck,
  History,
  Clock,
  User,
  ArrowRight,
} from 'lucide-react';

const PARENTESCOS = ['HIJO/A', 'CONYUGE', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO'];

export const BeneficiariesModal = ({
  isOpen,
  onClose,
  asociado,
  idCuentaInicial = null,
  onSuccess,
}) => {
  const [cuentas, setCuentas] = useState([]);
  const [selectedCuentaId, setSelectedCuentaId] = useState(idCuentaInicial);
  const [beneficiarios, setBeneficiarios] = useState([
    { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 100 },
  ]);

  const [initialBeneficiarios, setInitialBeneficiarios] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('declaracion'); // 'declaracion' | 'historial'
  const [historialList, setHistorialList] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [motivoCambio, setMotivoCambio] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadHistorialBeneficiarios = async (cuentaId) => {
    if (!cuentaId) return;
    try {
      setLoadingHistorial(true);
      const res = await api.get(`/admin/asociados/cuentas/${cuentaId}/beneficiarios/historial`);
      if (res.data?.success) {
        setHistorialList(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar historial de beneficiarios:', err);
    } finally {
      setLoadingHistorial(false);
    }
  };

  // Cargar cuentas del asociado y beneficiarios de la cuenta
  useEffect(() => {
    if (isOpen && asociado) {
      setErrorMsg('');
      setSuccessMsg('');
      setLoading(true);

      api.get(`/admin/asociados/${asociado.id_asociado}/expediente`)
        .then((res) => {
          if (res.data?.success) {
            const ctas = res.data.data.cuentas || [];
            setCuentas(ctas);

            const targetId = idCuentaInicial || (ctas.length > 0 ? ctas[0].id_cuenta : null);
            setSelectedCuentaId(targetId);

            if (targetId) {
              loadBeneficiariosDeCuenta(targetId);
              loadHistorialBeneficiarios(targetId);
            }
          }
        })
        .catch((err) => {
          console.error('Error al cargar cuentas del asociado:', err);
          setErrorMsg('No se pudieron obtener las cuentas del asociado.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, asociado, idCuentaInicial]);

  useEffect(() => {
    if (isOpen && asociado) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, asociado]);

  const loadBeneficiariosDeCuenta = async (cuentaId) => {
    try {
      const res = await api.get(`/admin/asociados/cuentas/${cuentaId}/beneficiarios`);
      if (res.data?.success && res.data.data.length > 0) {
        setBeneficiarios(res.data.data);
        setInitialBeneficiarios(JSON.parse(JSON.stringify(res.data.data)));
      } else {
        const defaultBens = [
          { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 100 },
        ];
        setBeneficiarios(defaultBens);
        setInitialBeneficiarios([]);
      }
    } catch (err) {
      console.error('Error al cargar beneficiarios:', err);
    }
  };

  const handleCuentaChange = (e) => {
    const cuentaId = parseInt(e.target.value, 10);
    setSelectedCuentaId(cuentaId);
    setErrorMsg('');
    setSuccessMsg('');
    loadBeneficiariosDeCuenta(cuentaId);
    loadHistorialBeneficiarios(cuentaId);
  };

  const handleBenChange = (index, field, value) => {
    let sanitizedVal = value;
    if (field === 'telefono') {
      // Solo dígitos, máximo 8 dígitos
      sanitizedVal = value.replace(/\D/g, '').slice(0, 8);
    } else if (field === 'cui_dpi') {
      sanitizedVal = value.replace(/\D/g, '').slice(0, 13);
    }

    setBeneficiarios((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: sanitizedVal };
      return updated;
    });
    if (errorMsg) setErrorMsg('');
    if (successMsg) setSuccessMsg('');
  };

  const handleAddBeneficiario = () => {
    setBeneficiarios((prev) => [
      ...prev,
      { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 0 },
    ]);
  };

  const handleRemoveBeneficiario = (index) => {
    if (beneficiarios.length === 1) return;
    setBeneficiarios((prev) => prev.filter((_, i) => i !== index));
  };

  // Distribuir el 100% de manera uniforme entre todos los beneficiarios
  const handleDistribuirEquitativo = () => {
    const totalCount = beneficiarios.length;
    if (totalCount === 0) return;

    const basePct = Math.floor((100 / totalCount) * 100) / 100;
    const remainder = parseFloat((100 - basePct * totalCount).toFixed(2));

    setBeneficiarios((prev) =>
      prev.map((ben, idx) => ({
        ...ben,
        porcentaje: idx === 0 ? parseFloat((basePct + remainder).toFixed(2)) : basePct,
      }))
    );
  };

  // Cálculo de la suma total
  const sumaPorcentajes = beneficiarios.reduce((sum, b) => {
    const val = parseFloat(b.porcentaje);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const esValido100 = Math.abs(sumaPorcentajes - 100.0) < 0.01;

  // Detección estricta de cambios respecto a la versión cargada inicialmente
  const hasChanges = React.useMemo(() => {
    if (!initialBeneficiarios) return false;

    const normalize = (list) => {
      return (list || [])
        .map((b) => ({
          nombre_completo: (b.nombre_completo || '').trim(),
          parentesco: (b.parentesco || 'HIJO/A').trim(),
          cui_dpi: (b.cui_dpi || '').trim(),
          telefono: (b.telefono || '').trim(),
          porcentaje: Number(parseFloat(b.porcentaje || 0).toFixed(2)),
        }))
        .filter((b) => b.nombre_completo !== '' || b.cui_dpi !== '' || b.telefono !== '');
    };

    const normInitial = normalize(initialBeneficiarios);
    const normCurrent = normalize(beneficiarios);

    if (normInitial.length !== normCurrent.length) return true;

    for (let i = 0; i < normInitial.length; i++) {
      const init = normInitial[i];
      const curr = normCurrent[i];
      if (
        init.nombre_completo !== curr.nombre_completo ||
        init.parentesco !== curr.parentesco ||
        init.cui_dpi !== curr.cui_dpi ||
        init.telefono !== curr.telefono ||
        init.porcentaje !== curr.porcentaje
      ) {
        return true;
      }
    }

    return false;
  }, [initialBeneficiarios, beneficiarios]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCuentaId) {
      setErrorMsg('Debe seleccionar una cuenta para registrar beneficiarios.');
      return;
    }

    if (!hasChanges) {
      setErrorMsg('No se detectaron modificaciones en los beneficiarios. Realice algún cambio para guardar.');
      return;
    }

    if (!esValido100) {
      setErrorMsg(
        `La suma de los porcentajes asignados debe ser exactamente el 100.00%. Suma actual: ${sumaPorcentajes.toFixed(
          2
        )}%`
      );
      return;
    }

    for (const b of beneficiarios) {
      if (!b.nombre_completo.trim()) {
        setErrorMsg('Todos los beneficiarios deben tener nombre completo.');
        return;
      }
      if (b.telefono && b.telefono.length > 0 && b.telefono.length !== 8) {
        setErrorMsg(`El teléfono de "${b.nombre_completo}" debe contener exactamente 8 dígitos numéricos.`);
        return;
      }
      if (parseFloat(b.porcentaje) <= 0) {
        setErrorMsg('Cada beneficiario debe tener un porcentaje mayor al 0.00%.');
        return;
      }
    }

    setSaving(true);

    try {
      const res = await api.post(`/admin/asociados/cuentas/${selectedCuentaId}/beneficiarios`, {
        beneficiarios: beneficiarios.map((b) => ({
          nombre_completo: b.nombre_completo.trim(),
          parentesco: b.parentesco,
          cui_dpi: b.cui_dpi?.trim() || null,
          telefono: b.telefono?.trim() || null,
          porcentaje: parseFloat(b.porcentaje),
        })),
        motivo: motivoCambio.trim() || 'Actualización de beneficiarios en ventanilla por Operador',
      });

      if (res.data?.success) {
        setSuccessMsg('Beneficiarios declarados y guardados exitosamente (100.00% distribuido).');
        setMotivoCambio('');
        setInitialBeneficiarios(JSON.parse(JSON.stringify(beneficiarios)));
        loadHistorialBeneficiarios(selectedCuentaId);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'Error al guardar beneficiarios.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Error al conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !asociado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beneficiaries-modal-title"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="beneficiaries-modal-title" className="text-base font-bold text-slate-800">
                Formulario 3: Declaración y Distribución de Beneficiarios
              </h3>
              <p className="text-xs text-slate-500">
                Asociado: <span className="font-semibold text-slate-700">{asociado.nombre_completo}</span>
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

        {/* Selector de Pestañas del Modal */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-4">
          <button
            type="button"
            onClick={() => setActiveModalTab('declaracion')}
            className={`pb-2.5 pt-2 text-xs font-bold border-b-2 flex items-center space-x-1.5 cursor-pointer transition-all ${
              activeModalTab === 'declaracion'
                ? 'border-purple-600 text-purple-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users2 className="w-4 h-4 text-purple-600" />
            <span>Declaración y Distribución (100%)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveModalTab('historial');
              if (selectedCuentaId) loadHistorialBeneficiarios(selectedCuentaId);
            }}
            className={`pb-2.5 pt-2 text-xs font-bold border-b-2 flex items-center space-x-1.5 cursor-pointer transition-all ${
              activeModalTab === 'historial'
                ? 'border-purple-600 text-purple-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>Historial de Modificaciones</span>
            {historialList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                {historialList.length}
              </span>
            )}
          </button>
        </div>

        {/* Alerta de Error dentro del Modal */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-danger-50 border border-danger-200 flex items-start space-x-3 text-danger-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-danger-600" />
            <div className="text-xs font-semibold">{errorMsg}</div>
          </div>
        )}

        {/* Alerta de Éxito dentro del Modal */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-brand-50 border border-brand-200 flex items-start space-x-3 text-brand-800">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-brand-600" />
            <div className="text-xs font-semibold">{successMsg}</div>
          </div>
        )}

        {activeModalTab === 'declaracion' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Selector de Cuenta Financiera */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Cuenta Financiera a Designar Beneficiarios *
            </label>
            {cuentas.length > 0 ? (
              <select
                value={selectedCuentaId || ''}
                onChange={handleCuentaChange}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-purple-600"
                required
              >
                {cuentas.map((c) => (
                  <option key={c.id_cuenta} value={c.id_cuenta}>
                    {c.tipo_cuenta} - {c.numero_cuenta} (Saldo: Q{c.saldo_disponible.toFixed(2)})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-warning-700">No hay cuentas disponibles para este asociado.</p>
            )}
          </div>

          {/* Barra de Progreso Visual de la Regla del 100.00% */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <PieChart className="w-4 h-4 text-purple-600" />
                <span>Distribución Total del Saldo:</span>
              </span>
              <span
                className={`font-mono font-extrabold text-sm ${
                  esValido100
                    ? 'text-brand-600'
                    : sumaPorcentajes > 100
                    ? 'text-danger-600'
                    : 'text-warning-600'
                }`}
              >
                {sumaPorcentajes.toFixed(2)}% / 100.00%
              </span>
            </div>

            {/* Barra visual */}
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  esValido100
                    ? 'bg-brand-500'
                    : sumaPorcentajes > 100
                    ? 'bg-danger-500'
                    : 'bg-warning-500'
                }`}
                style={{ width: `${Math.min(sumaPorcentajes, 100)}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[11px] pt-1">
              {esValido100 ? (
                <span className="text-brand-700 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Distribución válida y completa al 100.00%.</span>
                </span>
              ) : sumaPorcentajes > 100 ? (
                <span className="text-danger-600 font-semibold">
                  Excedido por {(sumaPorcentajes - 100).toFixed(2)}% (El máximo permitido es 100.00%).
                </span>
              ) : (
                <span className="text-warning-700 font-semibold">
                  Faltan {(100 - sumaPorcentajes).toFixed(2)}% por distribuir entre los beneficiarios.
                </span>
              )}

              <button
                type="button"
                onClick={handleDistribuirEquitativo}
                className="text-purple-700 hover:text-purple-900 font-bold flex items-center space-x-1 underline cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Distribuir Equitativamente</span>
              </button>
            </div>
          </div>

          {/* Lista de Beneficiarios Dinámica */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Beneficiarios Designados ({beneficiarios.length})
              </span>
              <button
                type="button"
                onClick={handleAddBeneficiario}
                className="px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Beneficiario</span>
              </button>
            </div>

            {beneficiarios.map((ben, index) => (
              <div
                key={index}
                className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 relative group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Beneficiario #{index + 1}
                  </span>
                  {beneficiarios.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBeneficiario(index)}
                      className="text-danger-400 hover:text-danger-600 p-1 rounded transition-colors cursor-pointer"
                      title="Eliminar este beneficiario"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      value={ben.nombre_completo}
                      onChange={(e) => handleBenChange(index, 'nombre_completo', e.target.value)}
                      placeholder="Nombres y Apellidos"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Parentesco *
                    </label>
                    <select
                      value={ben.parentesco}
                      onChange={(e) => handleBenChange(index, 'parentesco', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      {PARENTESCOS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      CUI / DPI
                    </label>
                    <input
                      type="text"
                      maxLength={13}
                      value={ben.cui_dpi || ''}
                      onChange={(e) => handleBenChange(index, 'cui_dpi', e.target.value)}
                      placeholder="13 dígitos"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Teléfono (8 dígitos)
                    </label>
                    <input
                      type="tel"
                      maxLength={8}
                      value={ben.telefono || ''}
                      onChange={(e) => handleBenChange(index, 'telefono', e.target.value)}
                      placeholder="Ej. 55551234"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Porcentaje Asignado (%) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="100.00"
                        value={ben.porcentaje}
                        onChange={(e) => handleBenChange(index, 'porcentaje', e.target.value)}
                        className="w-full pr-6 pl-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-600"
                        required
                      />
                      <span className="absolute right-2 top-2 text-xs font-bold text-slate-400 pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Motivo de la Modificación (Opcional) */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Motivo o Justificación del Cambio (Opcional)
            </label>
            <input
              type="text"
              value={motivoCambio}
              onChange={(e) => setMotivoCambio(e.target.value)}
              placeholder="Ej. Solicitud directa en ventanilla por actualización familiar"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Footer Modal */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <div className="text-xs">
              {!hasChanges && esValido100 && (
                <span className="text-slate-400 italic text-[11px]">
                  Sin modificaciones pendientes por guardar
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={saving || !esValido100 || !hasChanges}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasChanges ? 'Modifique algún campo o porcentaje para habilitar el guardado' : ''}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validando...</span>
                  </>
                ) : (
                  <>
                    <span>Guardar Beneficiarios (100%)</span>
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
        )}

        {/* PESTAÑA: HISTORIAL DE MODIFICACIONES DE BENEFICIARIOS */}
        {activeModalTab === 'historial' && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Selector de cuenta para filtrar historial */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Cuenta Financiera *
              </label>
              {cuentas.length > 0 ? (
                <select
                  value={selectedCuentaId || ''}
                  onChange={handleCuentaChange}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {cuentas.map((c) => (
                    <option key={c.id_cuenta} value={c.id_cuenta}>
                      {c.tipo_cuenta || 'Cuenta'} - {c.numero_cuenta} (Saldo: Q{parseFloat(c.saldo_disponible || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-slate-500 italic">No hay cuentas disponibles</div>
              )}
            </div>

            {loadingHistorial ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-2" />
                <p className="text-xs font-semibold">Cargando registro de auditoría...</p>
              </div>
            ) : historialList.length === 0 ? (
              <div className="py-16 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <History className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">Sin modificaciones registradas</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Esta cuenta no posee cambios previos en la declaración de beneficiarios.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {historialList.map((item) => {
                  let prevBens = [];
                  let newBens = [];
                  try {
                    prevBens = typeof item.beneficiarios_anteriores === 'string'
                      ? JSON.parse(item.beneficiarios_anteriores)
                      : (item.beneficiarios_anteriores || []);
                  } catch (e) {
                    prevBens = [];
                  }
                  try {
                    newBens = typeof item.beneficiarios_nuevos === 'string'
                      ? JSON.parse(item.beneficiarios_nuevos)
                      : (item.beneficiarios_nuevos || []);
                  } catch (e) {
                    newBens = [];
                  }

                  return (
                    <div key={item.id_historial} className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-2 border-b border-slate-200/80 text-xs">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-bold text-slate-800">
                            {new Date(item.fecha_cambio).toLocaleString('es-GT', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                            {item.rol_usuario || 'OPERADOR'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Modificado por: <strong className="text-slate-700">{item.nombre_usuario || 'Operador'}</strong>
                        </div>
                      </div>

                      {item.motivo && (
                        <div className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                          Motivo: "{item.motivo}"
                        </div>
                      )}

                      {/* Comparativa: Anteriores vs Nuevos */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Anteriores */}
                        <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            Distribución Anterior
                          </span>
                          {prevBens.length === 0 ? (
                            <span className="text-slate-400 italic text-[11px]">Sin beneficiarios registrados previamente</span>
                          ) : (
                            <ul className="space-y-1">
                              {prevBens.map((b, i) => (
                                <li key={i} className="flex justify-between items-center text-[11px]">
                                  <span className="text-slate-700 font-medium truncate max-w-[140px]">{b.nombre_completo}</span>
                                  <span className="font-bold text-slate-500 font-mono">{parseFloat(b.porcentaje).toFixed(2)}%</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Nuevos */}
                        <div className="p-3 bg-brand-50/50 rounded-lg border border-brand-200 space-y-1.5">
                          <span className="text-[11px] font-bold text-brand-800 uppercase tracking-wider block">
                            Nueva Distribución Asignada (100%)
                          </span>
                          <ul className="space-y-1">
                            {newBens.map((b, i) => (
                              <li key={i} className="flex justify-between items-center text-[11px]">
                                <span className="text-brand-950 font-bold truncate max-w-[140px]">{b.nombre_completo}</span>
                                <span className="font-extrabold text-brand-700 font-mono bg-brand-100 px-1.5 py-0.2 rounded">
                                  {parseFloat(b.porcentaje).toFixed(2)}%
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default BeneficiariesModal;
