import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSecureDocumentUrl } from '../../../utils/documentUrl';
import {
  ShieldCheck,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  FileCheck,
  ExternalLink,
  FileText,
  Calculator,
  Activity,
  Send,
  UploadCloud,
  Paperclip,
  Trash2,
  Download,
} from 'lucide-react';

/**
 * Modal de Expediente & Evaluación Crediticia del Asociado (ARQ-04)
 * Permite al Operador inspeccionar parámetros crediticios, scoring automático, formulario firmado y emitir dictamen.
 */
const OperatorCreditEvaluationModal = ({
  selectedCredito,
  loadingEvaluacion,
  evaluacionData,
  activeEvalTab,
  setActiveEvalTab,
  observacionesCredito,
  setObservacionesCredito,
  resolvingCredito,
  closeResolverCreditoModal,
  handleResolveCreditoSubmit,
  handleElevarCredito,
}) => {
  const [archivoFirmado, setArchivoFirmado] = useState(null);
  const [fileError, setFileError] = useState('');

  // El operador debe adjuntar obligatoriamente el archivo PDF firmado para poder aceptar la solicitud
  const hasOperatorSignedPdf = Boolean(archivoFirmado);

  useEffect(() => {
    setArchivoFirmado(null);
    setFileError('');
  }, [selectedCredito?.id_solicitud_credito]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFileError('Solo se admiten documentos en formato PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError('El tamaño del PDF no debe exceder los 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setArchivoFirmado({
        file,
        name: file.name,
        size: file.size,
        base64: event.target.result,
      });
      setActiveEvalTab('documento');
    };
    reader.onerror = () => {
      setFileError('Error al leer el archivo PDF seleccionado.');
    };
    reader.readAsDataURL(file);
  };
  if (!selectedCredito) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white rounded-2xl max-w-4xl w-full my-6 shadow-2xl border border-slate-200 animate-scaleUp overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-evaluation-modal-title"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 id="credit-evaluation-modal-title" className="text-base font-bold flex items-center space-x-2">
                <span>Expediente y Evaluación Crediticia</span>
                <span className="font-mono text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Solicitud #{selectedCredito.id_solicitud_credito}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedCredito.primer_nombre} {selectedCredito.segundo_nombre || ''} {selectedCredito.primer_apellido} {selectedCredito.segundo_apellido || ''} • CUI: {selectedCredito.cui_dpi} {selectedCredito.codigo_corporativo ? `• Código: ${selectedCredito.codigo_corporativo}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                selectedCredito.estado === 'APROBADA' || selectedCredito.estado === 'APROBADO' || selectedCredito.estado === 'DESEMBOLSADA'
                  ? 'bg-brand-950 text-brand-400 border-brand-700'
                  : selectedCredito.estado === 'RECHAZADA' || selectedCredito.estado === 'RECHAZADO'
                  ? 'bg-danger-950 text-danger-400 border-danger-700'
                  : 'bg-warning-950 text-warning-300 border-warning-700'
              }`}
            >
              {selectedCredito.estado}
            </span>
            <button
              onClick={closeResolverCreditoModal}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0 text-slate-700">
          {loadingEvaluacion ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-9 h-9 text-brand-600 animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-700">Analizando solvencia y transacciones financieras...</p>
              <p className="text-xs text-slate-400 mt-1">Consultando saldos consolidados, deudas activas e historial de movimientos.</p>
            </div>
          ) : evaluacionData ? (
            <>
              {/* Banner de Dictamen Financiero Automático */}
              {evaluacionData.analisisSolicitud.dictamen === 'APTO' ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-50 to-teal-50 border-2 border-brand-500 flex items-start space-x-3 shadow-xs">
                  <div className="p-2 rounded-xl bg-brand-600 text-white flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-brand-950 uppercase tracking-wide">
                        Dictamen del Sistema: Asociado APTO (Riesgo Bajo)
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-brand-200 text-brand-900 border border-brand-300">
                        Aprobación Recomendada
                      </span>
                    </div>
                    <p className="text-xs text-brand-800 mt-1 leading-relaxed">
                      El asociado cuenta con suficiente respaldo financiero (Saldo consolidado: <strong>Q{evaluacionData.solicitante.saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong>) y su endeudamiento proyectado del <strong>{evaluacionData.analisisSolicitud.porcentajeEndeudamiento}%</strong> se mantiene en rangos seguros.
                    </p>
                  </div>
                </div>
              ) : evaluacionData.analisisSolicitud.dictamen === 'CONDICIONADO' ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-warning-50 to-yellow-50 border-2 border-warning-400 flex items-start space-x-3 shadow-xs">
                  <div className="p-2 rounded-xl bg-warning-600 text-white flex-shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-warning-950 uppercase tracking-wide">
                        Dictamen del Sistema: Crédito CONDICIONADO (Riesgo Moderado)
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-warning-200 text-warning-900 border border-warning-300">
                        Revisión Cautelosa
                      </span>
                    </div>
                    <p className="text-xs text-warning-800 mt-1 leading-relaxed">
                      El asociado posee solvencia básica, pero la deuda total proyectada (Q{evaluacionData.analisisSolicitud.deudaProyectada.toLocaleString('es-GT', { minimumFractionDigits: 2 })}) absorbe el <strong>{evaluacionData.analisisSolicitud.porcentajeEndeudamiento}%</strong> de su límite máximo asignado.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-danger-50 to-rose-50 border-2 border-danger-500 flex items-start space-x-3 shadow-xs">
                  <div className="p-2 rounded-xl bg-danger-600 text-white flex-shrink-0 mt-0.5">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-danger-950 uppercase tracking-wide">
                        Dictamen del Sistema: NO APTO (Alto Riesgo / Endeudamiento Excesivo)
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-danger-200 text-danger-900 border border-danger-300">
                        Rechazo Sugerido
                      </span>
                    </div>
                    <p className="text-xs text-danger-800 mt-1 leading-relaxed">
                      El monto solicitado (Q{evaluacionData.analisisSolicitud.montoSolicitado.toLocaleString('es-GT', { minimumFractionDigits: 2 })}) supera el cupo disponible asignado (Q{evaluacionData.analisisSolicitud.cupoDisponible.toLocaleString('es-GT', { minimumFractionDigits: 2 })}) o sobrepasa el 100% de la capacidad crediticia calculada.
                    </p>
                  </div>
                </div>
              )}

              {/* Grid de 4 Indicadores Financieros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Saldo Total en Cuentas
                  </span>
                  <span className="text-lg font-black text-slate-900 font-mono block">
                    Q{evaluacionData.solicitante.saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Banco: Q{evaluacionData.solicitante.totalBanco.toLocaleString('es-GT')} • Coop: Q{evaluacionData.solicitante.totalCoop.toLocaleString('es-GT')}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Límite Máximo Asignado
                  </span>
                  <span className="text-lg font-black text-slate-900 font-mono block">
                    Q{evaluacionData.capacidad.limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {evaluacionData.capacidad.nivel} ({evaluacionData.capacidad.rangoTexto})
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Deuda Proyectada Total
                  </span>
                  <span className="text-lg font-black text-slate-900 font-mono block">
                    Q{evaluacionData.analisisSolicitud.deudaProyectada.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Activa: Q{evaluacionData.solicitante.deudaActiva.toLocaleString('es-GT')} + Solicitud: Q{evaluacionData.analisisSolicitud.montoSolicitado.toLocaleString('es-GT')}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Endeudamiento Proyectado
                  </span>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-lg font-black font-mono text-slate-900">
                      {evaluacionData.analisisSolicitud.porcentajeEndeudamiento}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Cupo disp: Q{evaluacionData.analisisSolicitud.cupoDisponible.toLocaleString('es-GT')}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        evaluacionData.analisisSolicitud.porcentajeEndeudamiento > 100
                          ? 'bg-danger-600'
                          : evaluacionData.analisisSolicitud.porcentajeEndeudamiento > 75
                          ? 'bg-warning-500'
                          : 'bg-brand-600'
                      }`}
                      style={{ width: `${Math.min(100, evaluacionData.analisisSolicitud.porcentajeEndeudamiento)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Alerta si el caso fue devuelto por Ejecutivo */}
              {selectedCredito.estado === 'DEVUELTA_OPERADOR' && (
                <div className="p-3.5 bg-warning-50 border-2 border-warning-300 rounded-xl text-xs text-warning-950 flex items-start space-x-2.5 shadow-xs mb-3">
                  <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-warning-900 block text-xs">
                      Solicitud DEVUELTA por el Comité Ejecutivo para Subsanación
                    </span>
                    <p className="mt-0.5 text-warning-800 leading-relaxed">
                      {selectedCredito.observaciones_ejecutivo
                        ? `Observaciones del Ejecutivo: "${selectedCredito.observaciones_ejecutivo}"`
                        : 'El Ejecutivo devolvió este expediente solicitando revisión de los datos o documentos adjuntos.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Selector de Pestañas Internas del Modal */}
              <div className="border-b border-slate-200 flex space-x-4">
                <button
                  type="button"
                  onClick={() => setActiveEvalTab('documento')}
                  className={`pb-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                    activeEvalTab === 'documento'
                      ? 'border-brand-600 text-brand-800'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Formulario Firmado (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEvalTab('scoring')}
                  className={`pb-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                    activeEvalTab === 'scoring'
                      ? 'border-brand-600 text-brand-800'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Diagnóstico y Cuentas Vinculadas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEvalTab('transacciones')}
                  className={`pb-2 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                    activeEvalTab === 'transacciones'
                      ? 'border-brand-600 text-brand-800'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Historial Financiero de Transacciones ({evaluacionData?.transaccionesRecientes?.length || 0})</span>
                </button>
              </div>

              {/* PESTAÑA 0: FORMULARIO FIRMADO POR EL ASOCIADO (PDF) */}
              {activeEvalTab === 'documento' && (
                <div className="space-y-4">
                  {/* Barra de Carga / Reemplazo de PDF */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        {archivoFirmado
                          ? '✓ PDF Firmado por Operador Cargado'
                          : selectedCredito.documento_firmado_url
                          ? 'Expediente del Asociado (Descargue y adjunte firmado por Operador)'
                          : 'Adjuntar Solicitud Firmada en PDF'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {archivoFirmado
                          ? 'Archivo listo para remitir y elevar al Ejecutivo.'
                          : 'Es obligatorio adjuntar el archivo PDF firmado por el operador para poder aceptar la solicitud y elevarla al Ejecutivo.'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {selectedCredito.documento_firmado_url && (
                        <a
                          href={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                          download={`Solicitud_Credito_${selectedCredito.id_solicitud_credito}.pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors cursor-pointer shrink-0"
                          title="Descargar formulario para firma física o digital"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar PDF</span>
                        </a>
                      )}
                      <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto shrink-0">
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>{archivoFirmado ? 'Reemplazar PDF Firmado' : 'Subir PDF Firmado por Operador *'}</span>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {fileError && (
                    <div className="p-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-xl text-xs font-semibold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{fileError}</span>
                    </div>
                  )}

                  {/* Estado del Archivo Nuevo Seleccionado */}
                  {archivoFirmado && (
                    <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl flex items-center justify-between text-xs text-brand-900">
                      <div className="flex items-center space-x-2">
                        <FileCheck className="w-4 h-4 text-brand-600" />
                        <span className="font-bold">{archivoFirmado.name}</span>
                        <span className="text-brand-700">
                          ({(archivoFirmado.size / 1024).toFixed(1)} KB) • Listo para adjuntar
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArchivoFirmado(null)}
                        className="text-danger-500 hover:text-danger-700 font-bold flex items-center space-x-1 cursor-pointer"
                        title="Descartar este archivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>
                    </div>
                  )}

                  {/* Visualizador del PDF */}
                  {archivoFirmado ? (
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-2">
                        Vista previa del nuevo PDF cargado:
                      </span>
                      <div className="w-full h-96 rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                        <iframe
                          src={archivoFirmado.base64}
                          title="Vista Previa de Nuevo Formulario Firmado"
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  ) : selectedCredito.documento_firmado_url ? (
                    <div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl mb-3">
                        <div className="flex items-center space-x-2 text-xs text-slate-700">
                          <FileCheck className="w-4 h-4 text-brand-600" />
                          <span className="font-bold text-slate-800">
                            {selectedCredito.nombre_archivo_firmado || 'formulario_firmado.pdf'}
                          </span>
                          {selectedCredito.peso_archivo_bytes && (
                            <span className="text-slate-400">
                              ({(selectedCredito.peso_archivo_bytes / 1024).toFixed(1)} KB)
                            </span>
                          )}
                        </div>
                        <a
                          href={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir en Pantalla Completa</span>
                        </a>
                      </div>

                      <div className="w-full h-96 rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                        <iframe
                          src={getSecureDocumentUrl(selectedCredito.documento_firmado_url)}
                          title="Formulario Firmado"
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">Sin Formulario Adjunto</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Utilice el botón de "Seleccionar PDF" arriba para adjuntar la solicitud física o digital firmada.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* PESTAÑA 1: Diagnóstico y Cuentas */}
              {activeEvalTab === 'scoring' && (
                <div className="space-y-4">
                  {/* Datos del Crédito Solicitado */}
                  <div className="p-4 rounded-xl bg-brand-50/50 border border-brand-200">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-brand-950 mb-3 flex items-center space-x-1.5">
                      <Calculator className="w-4 h-4 text-brand-700" />
                      <span>Parámetros del Crédito en Revisión</span>
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block">Monto Solicitado:</span>
                        <span className="font-extrabold text-slate-900 text-sm">
                          Q{parseFloat(selectedCredito.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Plazo Amortización:</span>
                        <span className="font-bold text-slate-900">
                          {selectedCredito.plazo_meses} meses
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Cuota Mensual Estimada:</span>
                        <span className="font-bold text-brand-800">
                          Q{parseFloat(selectedCredito.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tasa de Interés:</span>
                        <span className="font-bold text-slate-900">
                          {parseFloat(selectedCredito.tasa_interes).toFixed(2)}% Anual Fija
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-brand-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-1">
                      <span>
                        Cuenta designada para desembolso:{' '}
                        <strong className="text-brand-900 font-semibold">
                          {selectedCredito.cuenta_destino_info ||
                            (selectedCredito.cuenta_bancaria_destino_numero
                              ? `Cuenta Bancaria (${selectedCredito.cuenta_bancaria_destino_numero})`
                              : 'Cuenta Principal')}
                        </strong>
                      </span>
                      {selectedCredito.observaciones && (
                        <span className="text-slate-500 italic">
                          Destino declarado: "{selectedCredito.observaciones}"
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lista de Verificaciones del Sistema */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Verificaciones Automáticas de Solvencia
                    </h5>
                    <div className="space-y-1.5">
                      {evaluacionData.analisisSolicitud.diagnosticos?.map((diag, index) => (
                        <div key={index} className="flex items-start space-x-2 text-xs text-slate-700">
                          <span className="text-brand-600 font-bold">•</span>
                          <span>{diag}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cuentas del Asociado (Bancarias y Cooperativas) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cuentas Bancarias */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                        <span>Cuentas Bancarias Vinculadas</span>
                        <span className="text-[11px] font-extrabold text-brand-700">
                          Total: Q{evaluacionData.solicitante.totalBanco.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </h5>
                      {evaluacionData.solicitante.cuentasBancarias?.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No registra cuentas bancarias.</p>
                      ) : (
                        <div className="space-y-2">
                          {evaluacionData.solicitante.cuentasBancarias.map((cb) => (
                            <div key={cb.id_cuenta_bancaria} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-slate-800 block">{cb.tipo_cuenta}</span>
                                <span className="font-mono text-[11px] text-slate-500">{cb.numero_cuenta_bancaria}</span>
                              </div>
                              <span className="font-mono font-bold text-brand-800">
                                Q{parseFloat(cb.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cuentas de la Cooperativa */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                        <span>Cuentas Internas de Cooperativa</span>
                        <span className="text-[11px] font-extrabold text-brand-700">
                          Total: Q{evaluacionData.solicitante.totalCoop.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </h5>
                      {evaluacionData.solicitante.cuentas?.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No registra cuentas de cooperativa.</p>
                      ) : (
                        <div className="space-y-2">
                          {evaluacionData.solicitante.cuentas.map((c) => (
                            <div key={c.id_cuenta} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-slate-800 block">{c.tipo || c.tipo_cuenta || 'Cuenta Cooperativa'}</span>
                                <span className="font-mono text-[11px] text-slate-500">{c.numero_cuenta}</span>
                              </div>
                              <span className="font-mono font-bold text-brand-800">
                                Q{(Number(c.saldo_disponible !== undefined ? c.saldo_disponible : (c.saldo || 0)) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PESTAÑA 2: Historial de Transacciones */}
              {activeEvalTab === 'transacciones' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Movimientos consolidados recientes del solicitante (bancarios y cooperativos):
                    </span>
                    <span className="text-xs font-bold text-slate-700 font-mono">
                      {evaluacionData.transaccionesRecientes?.length || 0} registros
                    </span>
                  </div>

                  {evaluacionData.transaccionesRecientes?.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                      No se encontraron transacciones previas registradas para este asociado.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Fecha</th>
                            <th className="px-3 py-2.5 font-semibold">Entidad / Origen</th>
                            <th className="px-3 py-2.5 font-semibold">Cuenta</th>
                            <th className="px-3 py-2.5 font-semibold text-center">Tipo</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Monto</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Saldo Resultante</th>
                            <th className="px-3 py-2.5 font-semibold">Descripción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {evaluacionData.transaccionesRecientes.map((tx, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-3 py-2 text-slate-600 font-medium whitespace-nowrap">
                                {new Date(tx.fecha).toLocaleString('es-GT', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="px-3 py-2 font-semibold">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  tx.origen === 'BANCO'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                                }`}>
                                  {tx.origen}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                                {tx.cuenta_numero}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  (tx.tipo_movimiento || tx.tipo) === 'CREDITO'
                                    ? 'bg-brand-100 text-brand-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {(tx.tipo_movimiento || tx.tipo) === 'CREDITO' ? 'Ingreso (+)' : 'Egreso (-)'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-bold font-mono">
                                <span className={(tx.tipo_movimiento || tx.tipo) === 'CREDITO' ? 'text-brand-700' : 'text-slate-800'}>
                                  {(tx.tipo_movimiento || tx.tipo) === 'CREDITO' ? '+' : '-'}Q{parseFloat(tx.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-600">
                                Q{parseFloat(tx.saldo_resultante || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={tx.descripcion}>
                                {tx.descripcion || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-slate-400">
              No se pudo cargar la información financiera.
            </div>
          )}
        </div>

        {/* Modal Footer / Resolución */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
          {['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'].includes(selectedCredito.estado) ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Observaciones / Dictamen de Resolución Operativa
                </label>
                <textarea
                  value={observacionesCredito}
                  onChange={(e) => setObservacionesCredito(e.target.value)}
                  placeholder="Ingrese los comentarios del dictamen operativo para elevarlo al Ejecutivo, o la justificación en caso de rechazo..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white resize-none max-h-24"
                />
              </div>

              {/* Alerta de PDF firmado obligatorio */}
              {!hasOperatorSignedPdf && (
                <div className="flex items-start space-x-2.5 text-xs text-warning-900 bg-warning-50 px-3.5 py-2.5 rounded-xl border border-warning-300">
                  <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="block text-warning-950 font-bold">Documento Firmado por Operador Obligatorio:</strong>
                    Para poder aceptar la solicitud y elevarla a la Gerencia Ejecutiva, es obligatorio adjuntar el archivo PDF firmado por el Operador. Ingrese a la pestaña "Formulario Firmado (PDF)" arriba para seleccionarlo.
                  </div>
                </div>
              )}

              {archivoFirmado && (
                <div className="flex items-center space-x-2 text-xs text-brand-800 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200">
                  <Paperclip className="w-3.5 h-3.5 text-brand-600" />
                  <span>
                    Se adjuntará: <strong>{archivoFirmado.name}</strong> ({(archivoFirmado.size / 1024).toFixed(1)} KB) • Listo para aceptar
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeResolverCreditoModal}
                  className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  Volver / Cancelar
                </button>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={resolvingCredito}
                    onClick={() => handleResolveCreditoSubmit('RECHAZAR', archivoFirmado)}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-danger-600 hover:bg-danger-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {resolvingCredito ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Rechazar Solicitud'}
                  </button>

                  <button
                    type="button"
                    disabled={resolvingCredito || !hasOperatorSignedPdf}
                    onClick={() => handleElevarCredito(archivoFirmado)}
                    className="flex-1 sm:flex-initial px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
                    title={!hasOperatorSignedPdf ? 'Debe adjuntar el PDF firmado por el operador antes de aceptar la solicitud' : 'Aceptar dictamen y elevar solicitud a la Gerencia Ejecutiva'}
                  >
                    {resolvingCredito ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Aceptar y Elevar a Ejecutivo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                <span>Esta solicitud fue resuelta como <strong>{selectedCredito.estado}</strong></span>
                {selectedCredito.fecha_resolucion && (
                  <span> el {new Date(selectedCredito.fecha_resolucion).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                )}
                {selectedCredito.observaciones && (
                  <p className="text-[11px] text-slate-500 mt-0.5">Motivo/Resolución: "{selectedCredito.observaciones}"</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeResolverCreditoModal}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OperatorCreditEvaluationModal;
