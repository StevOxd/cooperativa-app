import React from 'react';
import {
  CreditCard,
  FileDown,
  FileText,
  Loader2,
  Wallet,
} from 'lucide-react';

/**
 * Pestaña "Resumen": totales y cuentas de ahorro del asociado.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AssociateSummaryTab = ({
  activeCreditosCount,
  activeCuentasCount,
  cuentas,
  downloadingAccountId,
  generatingPdf,
  handleDownloadPdf,
  openMovimientosModal,
  setActiveTab,
  totalAhorrado,
}) => (
  <div className="space-y-6">
    {/* Tarjetas de Resumen Financiero */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Total Ahorros */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Total Ahorros
          </span>
          <span className="text-2xl font-extrabold text-slate-900 block">
            Q{totalAhorrado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="w-12 h-12 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
          <Wallet className="w-6 h-6" />
        </div>
      </div>

      {/* Cuentas Activas */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Cuentas Activas
          </span>
          <span className="text-2xl font-extrabold text-slate-900 block">
            {activeCuentasCount}
          </span>
        </div>
        <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
          <CreditCard className="w-6 h-6" />
        </div>
      </div>

      {/* Créditos Solicitados */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Créditos Activos / En Curso
          </span>
          <span className="text-2xl font-extrabold text-slate-900 block">
            {activeCreditosCount}
          </span>
        </div>
        <div className="w-12 h-12 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
          <FileText className="w-6 h-6" />
        </div>
      </div>
    </div>

    {/* Cuentas */}
    <div>
      <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center space-x-2">
        <CreditCard className="w-5 h-5 text-slate-500" />
        <span>Mis Cuentas de Ahorro</span>
      </h2>

      {cuentas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg border border-slate-200 text-center text-slate-500">
          <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="font-bold text-slate-800 text-base">No posee cuentas activas en la cooperativa aún.</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Su depósito inicial se encuentra acreditado en su <span className="font-semibold text-slate-700">Cuenta Bancaria Vinculada</span>. Puede solicitar un traslado desde la pestaña <span className="font-bold text-brand-700">"Cuenta Origen y Traslados"</span> para aperturar sus productos en la Cooperativa (Ahorro a la Vista, Plazo Fijo o Metas).
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('planilla')}
            className="mt-4 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-md transition-colors cursor-pointer inline-flex items-center space-x-1.5"
          >
            <span>Ir a Cuenta Origen y Traslados</span>
            <span>&rarr;</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cuentas.map((c) => (
            <div 
              key={c.id_cuenta}
              className="bg-white p-6 rounded-lg border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      {c.tipo_cuenta}
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-700 block mt-0.5">
                      {c.numero_cuenta}
                    </span>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-100">
                    {c.estado}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 block">Saldo Disponible</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    Q{parseFloat(c.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {parseFloat(c.saldo_reserva) > 0 && (
                  <div className="mt-2 text-xs text-slate-500 flex justify-between border-t border-slate-100 pt-2">
                    <span>Saldo Reserva:</span>
                    <span className="font-semibold">Q{parseFloat(c.saldo_reserva).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(c)}
                  disabled={generatingPdf && downloadingAccountId === c.id_cuenta}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-md border border-brand-200/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Descargar Estado de Cuenta Oficial en PDF"
                >
                  {generatingPdf && downloadingAccountId === c.id_cuenta ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-700" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5 text-brand-700" />
                  )}
                  <span>Estado de Cuenta (PDF)</span>
                </button>

                <button
                  onClick={() => openMovimientosModal(c)}
                  className="text-xs font-bold text-brand-700 hover:text-brand-900 transition-colors cursor-pointer"
                >
                  Ver Movimientos &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default AssociateSummaryTab;
