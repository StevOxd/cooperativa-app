import React from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, X, Loader2 } from 'lucide-react';

/**
 * Modal de Confirmación Resolutiva de Traslados (ARQ-04)
 * Permite al Operador aprobar o rechazar solicitudes de traslado y apertura de cuentas de ahorro/metas/plazo fijo.
 */
const OperatorTrasladoModal = ({
  selectedSolicitud,
  actionType,
  observacionesTraslado,
  setObservacionesTraslado,
  resolvingTraslado,
  closeResolverTrasladoModal,
  handleResolveTrasladoSubmit,
}) => {
  if (!selectedSolicitud || !actionType) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 overflow-y-auto">
      <div
        className="bg-white rounded-lg max-w-md w-full p-6 sm:p-8 shadow-lg border border-slate-200 relative my-auto animate-scaleUp max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="traslado-modal-title"
      >
        <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
          <h3 id="traslado-modal-title" className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <ShieldAlert className={`w-5 h-5 ${actionType === 'APROBAR' ? 'text-brand-600' : 'text-danger-600'}`} />
            <span>Confirmar Acción de Operador</span>
          </h3>
          <button
            onClick={closeResolverTrasladoModal}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-600 mb-6">
          <p>
            ¿Está seguro de que desea{' '}
            <strong className={actionType === 'APROBAR' ? 'text-brand-700' : 'text-danger-700'}>
              {actionType === 'APROBAR' ? 'APROBAR' : 'RECHAZAR'}
            </strong>{' '}
            la solicitud de traslado del asociado{' '}
            <strong>
              {selectedSolicitud.primer_nombre} {selectedSolicitud.primer_apellido}
            </strong>
            ?
          </p>

          <div className="p-3.5 bg-slate-50 border rounded-lg space-y-1.5 text-xs text-slate-700 font-mono">
            <div>
              Caso: <strong>{selectedSolicitud.numero_caso}</strong>
            </div>
            <div>
              Monto: <strong>Q{parseFloat(selectedSolicitud.monto).toFixed(2)}</strong>
            </div>
            <div>
              Operación: <strong>{selectedSolicitud.tipo_operacion}</strong>
            </div>
            {selectedSolicitud.cuenta_destino_numero && (
              <div>
                Cuenta Destino: <strong>{selectedSolicitud.cuenta_destino_numero}</strong>
              </div>
            )}
          </div>

          <form onSubmit={handleResolveTrasladoSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-750 uppercase tracking-wider mb-2">
                Observaciones / Comentario de la Resolución
              </label>
              <textarea
                value={observacionesTraslado}
                onChange={(e) => setObservacionesTraslado(e.target.value)}
                placeholder={
                  actionType === 'APROBAR'
                    ? 'Comentario de aprobación...'
                    : 'Escriba el motivo detallado del rechazo...'
                }
                required={actionType === 'RECHAZAR'}
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeResolverTrasladoModal}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-semibold cursor-pointer"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={resolvingTraslado}
                className={`px-5 py-2 text-white rounded-md text-sm font-semibold flex items-center space-x-1.5 cursor-pointer ${
                  actionType === 'APROBAR' ? 'bg-brand-700 hover:bg-brand-800' : 'bg-danger-700 hover:bg-danger-800'
                }`}
              >
                {resolvingTraslado ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{actionType === 'APROBAR' ? 'Aprobar Caso' : 'Rechazar Caso'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OperatorTrasladoModal;
