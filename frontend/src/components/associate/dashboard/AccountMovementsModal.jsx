import React from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  FileDown,
  Loader2,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * Modal de movimientos de una cuenta.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AccountMovementsModal = ({
  generatingPdf,
  handleDownloadPdf,
  isModalOpen,
  loadingTx,
  selectedCuenta,
  setIsModalOpen,
  setTransactions,
  transactions,
}) => (
  <>
    {isModalOpen && selectedCuenta && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 overflow-y-auto">
        <div
          className="bg-white rounded-lg max-w-4xl w-full p-6 sm:p-8 shadow-lg border border-slate-200 relative my-8 animate-scaleUp"
          role="dialog"
          aria-modal="true"
          aria-labelledby="movimientos-modal-title"
        >
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                {selectedCuenta.tipo_cuenta}
              </span>
              <h2 id="movimientos-modal-title" className="text-xl font-bold text-slate-900 mt-0.5">
                Movimientos de Cuenta: {selectedCuenta.numero_cuenta}
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedCuenta, transactions)}
                disabled={generatingPdf}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200/80 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Descargar Estado de Cuenta Oficial en PDF"
              >
                {generatingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-700" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-brand-700" />
                )}
                <span className="hidden sm:inline">Descargar PDF</span>
              </button>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setTransactions([]);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200/60 flex flex-wrap gap-6 justify-between items-center text-sm">
            <div>
              <span className="text-slate-400 block text-xs">Saldo Disponible</span>
              <span className="text-lg font-bold text-slate-900">
                Q{parseFloat(selectedCuenta.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Saldo en Reserva</span>
              <span className="text-sm font-semibold text-slate-700">
                Q{parseFloat(selectedCuenta.saldo_reserva).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Tasa de Interés Anual</span>
              <span className="text-sm font-semibold text-slate-700">{selectedCuenta.tasa_interes_anual}%</span>
            </div>
          </div>

          {loadingTx ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
              <p className="text-xs">Consultando transacciones...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Activity className="w-12 h-12 text-slate-200 mx-auto mb-2" />
              <p className="text-sm">No se encontraron movimientos registrados para esta cuenta.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha / Hora</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Referencia</th>
                    <th className="px-4 py-3 font-semibold text-right">Monto</th>
                    <th className="px-4 py-3 font-semibold text-right">Saldo Resultante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => {
                    const isCredit = ['DEPOSITO', 'PAGO_CREDITO'].includes(t.tipo_transaccion);
                    return (
                      <tr key={t.id_transaccion} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3.5 text-slate-500 text-xs">
                          {new Date(t.fecha_transaccion).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-xs">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full ${
                            isCredit ? 'bg-brand-50 text-brand-700' : 'bg-warning-50 text-warning-700'
                          }`}>
                            {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            <span>{t.tipo_transaccion}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 font-mono text-xs">
                          {t.referencia || '-'}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-bold ${
                          isCredit ? 'text-brand-700' : 'text-slate-800'
                        }`}>
                          {isCredit ? '+' : '-'}Q{parseFloat(t.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5 text-right text-slate-900 font-semibold">
                          Q{parseFloat(t.saldo_nuevo).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleDownloadPdf(selectedCuenta, transactions)}
              disabled={generatingPdf}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-brand-700 to-brand-900 hover:from-brand-800 hover:to-brand-950 text-white rounded-md text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span>Descargar Estado de Cuenta Oficial (PDF)</span>
            </button>
            <button
              onClick={() => {
                setIsModalOpen(false);
                setTransactions([]);
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-semibold cursor-pointer"
            >
              Cerrar Ventana
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
);

export default AccountMovementsModal;
