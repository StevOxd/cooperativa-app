import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import {
  X,
  FileText,
  Printer,
  CreditCard,
  Users,
  Shield,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PlusCircle,
  UserCheck,
} from 'lucide-react';

export const AssociateExpedienteModal = ({
  isOpen,
  onClose,
  idAsociado,
  onOpenNewAccount,
  onOpenBeneficiarios,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expediente, setExpediente] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && idAsociado) {
      setLoading(true);
      setErrorMsg('');
      api.get(`/admin/asociados/${idAsociado}/expediente`)
        .then((res) => {
          if (res.data?.success) {
            setExpediente(res.data.data);
          } else {
            setErrorMsg(res.data?.message || 'Error al obtener expediente.');
          }
        })
        .catch((err) => {
          console.error('Error al consultar expediente:', err);
          setErrorMsg(err.response?.data?.message || 'Error de conexión.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, idAsociado]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:m-0 print:w-full print:max-w-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expediente-modal-title"
      >
        {/* Header Modal (Oculto al imprimir) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="expediente-modal-title" className="text-base font-bold text-slate-800">
                Expediente Integral 360° del Asociado
              </h3>
              <p className="text-xs text-slate-500">
                Reporte 1.1: Ficha de Posición Global y Registro de Cuentas
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Imprimir o guardar en PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ficha</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 max-h-[80vh] overflow-y-auto print:max-h-none print:p-0 print:overflow-visible">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Cargando expediente 360°...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{errorMsg}</span>
            </div>
          ) : expediente ? (
            <div className="space-y-6">
              {/* Membrete Formal de Reporte (Para impresión o vista formal) */}
              <div className="border-b-2 border-emerald-800 pb-4 flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-700 flex items-center justify-center text-white font-black text-xl">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">
                      COOPERATIVA DE AHORRO Y CRÉDITO
                    </h2>
                    <p className="text-xs text-emerald-800 font-semibold tracking-wider uppercase">
                      FICHA DE POSICIÓN GLOBAL DEL ASOCIADO (REPORTE 1.1)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Fecha de emisión: {new Date().toLocaleDateString('es-GT', { dateStyle: 'full' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                      expediente.asociado.estado_asociado === 'ACTIVO'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    ESTADO: {expediente.asociado.estado_asociado}
                  </span>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    ID Socio: #{expediente.asociado.id_asociado}
                  </p>
                </div>
              </div>

              {/* Datos Personales */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Datos Generales del Asociado
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Nombre Completo:</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {expediente.asociado.nombre_completo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">CUI / DPI:</span>
                    <span className="font-bold text-slate-800 font-mono text-sm">
                      {expediente.asociado.cui_dpi}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Usuario:</span>
                    <span className="font-bold text-emerald-700 font-mono text-sm">
                      {expediente.asociado.codigo_corporativo || 'Sin acceso portal'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium">Teléfono:</span>
                    <span className="font-semibold text-slate-700">
                      {expediente.asociado.telefono || 'No registrado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Correo Electrónico:</span>
                    <span className="font-semibold text-slate-700">
                      {expediente.asociado.email || 'No registrado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Fecha de Afiliación:</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(expediente.asociado.fecha_ingreso).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="sm:col-span-3">
                    <span className="text-slate-400 block font-medium">Dirección de Domicilio:</span>
                    <span className="font-semibold text-slate-700">
                      {expediente.asociado.direccion || 'No especificada'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Resumen Financiero Consolidado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-xs text-emerald-800 font-semibold block">
                    Saldo Total Disponible
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700 font-mono">
                    Q{expediente.metricas.saldo_total_disponible.toFixed(2)}
                  </span>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-xs text-blue-800 font-semibold block">
                    Aportaciones Ordinarias
                  </span>
                  <span className="text-xl font-extrabold text-blue-700 font-mono">
                    Q{expediente.metricas.saldo_aportaciones.toFixed(2)}
                  </span>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <span className="text-xs text-purple-800 font-semibold block">
                    Total Cuentas Activas
                  </span>
                  <span className="text-xl font-extrabold text-purple-700 font-mono">
                    {expediente.metricas.total_cuentas}
                  </span>
                </div>
              </div>

              {/* Detalle de Cuentas Financieras */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cuentas Financieras y Beneficiarios
                  </h4>
                  {/* Botones de acción rápida (Ocultos en impresión) */}
                  <div className="flex items-center space-x-2 print:hidden">
                    <button
                      type="button"
                      onClick={() => onOpenNewAccount && onOpenNewAccount(expediente.asociado)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Aperturar Cuenta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBeneficiarios && onOpenBeneficiarios(expediente.asociado)}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Beneficiarios</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {expediente.cuentas.map((c) => (
                    <div
                      key={c.id_cuenta}
                      className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold text-slate-800">{c.tipo_cuenta}</span>
                          <p className="font-mono text-xs text-slate-600 font-semibold">
                            {c.numero_cuenta}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-emerald-700 font-mono block">
                            Q{c.saldo_disponible.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Apertura: {new Date(c.fecha_apertura).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Beneficiarios de esta cuenta */}
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Beneficiarios Designados ({c.beneficiarios.length})
                        </span>
                        {c.beneficiarios.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {c.beneficiarios.map((b) => (
                              <div
                                key={b.id_beneficiario}
                                className="p-2 bg-slate-50 rounded-lg text-xs flex justify-between items-center border border-slate-100"
                              >
                                <div>
                                  <span className="font-bold text-slate-800 block">
                                    {b.nombre_completo}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {b.parentesco} {b.cui_dpi ? `• DPI: ${b.cui_dpi}` : ''}
                                  </span>
                                </div>
                                <span className="font-mono font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                  {b.porcentaje.toFixed(2)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-600 italic">
                            No se han declarado beneficiarios para esta cuenta aún.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bloque de Firmas Institucionales para Impresión */}
              <div className="pt-12 hidden print:grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-800">{expediente.asociado.nombre_completo}</p>
                  <p className="text-slate-500">Firma del Asociado Titular</p>
                  <p className="text-[10px] text-slate-400 font-mono">DPI: {expediente.asociado.cui_dpi}</p>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-800">Oficial de Cumplimiento / Ventanilla</p>
                  <p className="text-slate-500">Sello y Firma Institucional</p>
                  <p className="text-[10px] text-slate-400 font-mono">Cooperativa Financiera RL</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Modal (Oculto en Impresión) */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cerrar Expediente
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AssociateExpedienteModal;
