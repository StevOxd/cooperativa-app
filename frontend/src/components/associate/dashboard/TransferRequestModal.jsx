import React from 'react';
import {
  AlertCircle,
  HelpCircle,
  Info,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * Modal para solicitar un traslado desde la cuenta de planilla.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const TransferRequestModal = ({
  closeTrasladoModal,
  cuentaPlanilla,
  cuentasDestino,
  cuentasDestinoFiltradas,
  destinoSeleccionado,
  enviandoTraslado,
  handleDestinoChange,
  handleTrasladoSubmit,
  isTrasladoModalOpen,
  modalErrorMessage,
  montoTraslado,
  observacionesTraslado,
  realTimeError,
  setMontoTraslado,
  setObservacionesTraslado,
}) => (
  <>
    {isTrasladoModalOpen && cuentaPlanilla && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 overflow-y-auto">
        <div
          className="bg-white rounded-lg max-w-lg w-full p-6 sm:p-8 shadow-lg border border-slate-200 relative my-8 animate-scaleUp"
          role="dialog"
          aria-modal="true"
          aria-labelledby="traslado-modal-title"
        >
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                Autogestión de Fondos
              </span>
              <h2 id="traslado-modal-title" className="text-xl font-bold text-slate-900 mt-0.5">
                Solicitud de Traslado / Apertura
              </h2>
            </div>
            <button
              onClick={closeTrasladoModal}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6 p-4 bg-brand-50 border border-brand-100 rounded-lg flex items-start space-x-3 text-brand-950 text-xs">
            <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">Cuenta Origen: {cuentaPlanilla.tipo_cuenta} ({cuentaPlanilla.numero_cuenta})</span>
              <span>Saldo disponible para trasladar: <strong className="text-brand-900">Q{parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}</strong></span>
            </div>
          </div>

          <form onSubmit={handleTrasladoSubmit} className="space-y-5">
            {/* Alertas internas de validación o error */}
            {(modalErrorMessage || realTimeError) && (
              <div className="p-3 bg-danger-50 text-danger-700 border border-danger-200 rounded-lg text-xs sm:text-sm flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
                <span>{modalErrorMessage || realTimeError}</span>
              </div>
            )}

            {/* Campo Monto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Monto a Trasladar
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-[12px] text-slate-400 font-bold text-sm">Q</div>
                <input
                  type="number"
                  min={1}
                  max={parseFloat(cuentaPlanilla.saldo_disponible)}
                  step={0.01}
                  value={montoTraslado}
                  onChange={(e) => setMontoTraslado(e.target.value)}
                  placeholder="Q0.00"
                  required
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>

            {/* Campo Cuenta/Producto Destino */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Seleccionar Destino
              </label>
              <select
                value={destinoSeleccionado}
                onChange={(e) => handleDestinoChange(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
              >
                <option value="">-- Seleccione una opción --</option>
            
                {/* Cuentas existentes elegibles (excluye la cuenta origen) */}
                {cuentasDestinoFiltradas.length > 0 && (
                  <optgroup label="Cuentas Existentes (Traslado Directo)">
                    {cuentasDestinoFiltradas.map((d) => (
                      <option key={`EXISTENTE:${d.id_cuenta}`} value={`EXISTENTE:${d.id_cuenta}`}>
                        {d.tipo_cuenta} - {d.numero_cuenta} (Saldo: Q{parseFloat(d.saldo_disponible).toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Productos disponibles para abrir */}
                {cuentasDestino.tiposDisponibles.length > 0 && (
                  <optgroup label="Nueva Apertura (Crear y Trasladar)">
                    {cuentasDestino.tiposDisponibles.map((t) => (
                      <option key={`APERTURA:${t.id_tipo_cuenta}`} value={`APERTURA:${t.id_tipo_cuenta}`}>
                        Apertura: {t.nombre} (Mínimo: Q{parseFloat(t.monto_minimo_apertura).toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Observaciones / Motivo del traslado
              </label>
              <textarea
                value={observacionesTraslado}
                onChange={(e) => setObservacionesTraslado(e.target.value)}
                placeholder="Detalles opcionales sobre el motivo del traslado"
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
              />
            </div>

            {/* Advertencia Legal */}
            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg flex items-start space-x-2 text-warning-900 text-xs leading-relaxed">
              <HelpCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Aviso Importante:</strong> Se generará un número de caso único que pasará al flujo de revisión del equipo de operaciones para su aprobación correspondiente.
              </span>
            </div>

            {/* Botones de acción */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={closeTrasladoModal}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviandoTraslado || !!realTimeError}
                className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-md text-sm font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviandoTraslado ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar Solicitud</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    )}
  </>
);

export default TransferRequestModal;
