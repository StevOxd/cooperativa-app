import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users2,
} from 'lucide-react';

/**
 * Pestaña de beneficiarios por cuenta.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AssociateBeneficiariesTab = ({
  fetchMisBeneficiarios,
  loadingBeneficiarios,
  misBeneficiariosData,
  openEditarBeneficiariosModal,
}) => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-6 rounded-lg border border-slate-200">
      <div>
        <div className="flex items-center space-x-2">
          <Users2 className="w-6 h-6 text-brand-600" />
          <h2 className="text-xl font-bold text-slate-900">
            Declaración Legal de Beneficiarios
          </h2>
        </div>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Consulte y actualice los beneficiarios designados para cada una de sus cuentas activas.
          Conforme a la normativa interna y legal, la distribución de porcentajes debe sumar exactamente el <strong>100.00%</strong> por cuenta.
        </p>
      </div>
      <button
        onClick={fetchMisBeneficiarios}
        disabled={loadingBeneficiarios}
        className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors cursor-pointer self-start sm:self-auto"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loadingBeneficiarios ? 'animate-spin text-brand-600' : ''}`} />
        <span>Actualizar Lista</span>
      </button>
    </div>

    {loadingBeneficiarios ? (
      <div className="py-20 flex flex-col items-center justify-center text-slate-500 bg-white rounded-lg border border-slate-200">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
        <p className="text-xs font-semibold">Cargando beneficiarios registrados...</p>
      </div>
    ) : misBeneficiariosData.length === 0 ? (
      <div className="bg-white p-12 rounded-lg border border-slate-200 text-center space-y-3">
        <Users2 className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No se encontraron cuentas activas</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          No posee cuentas registradas que requieran designación de beneficiarios en este momento.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6">
        {misBeneficiariosData.map((cuenta) => {
          const totalPct = (cuenta.beneficiarios || []).reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);
          const isComplete = Math.abs(totalPct - 100.00) < 0.01;

          return (
            <div key={cuenta.id_cuenta} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-800">
                      {cuenta.tipo_cuenta}
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {cuenta.numero_cuenta}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center space-x-4">
                    <span>Saldo disponible: <strong className="text-slate-800">Q{parseFloat(cuenta.saldo_disponible || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong></span>
                    <span>•</span>
                    <span className={isComplete ? 'text-brand-700 font-semibold flex items-center space-x-1' : 'text-warning-600 font-semibold flex items-center space-x-1'}>
                      {isComplete ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                          <span>Distribución 100.00% asignada</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-warning-500" />
                          <span>Distribución incompleta ({totalPct.toFixed(2)}%)</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openEditarBeneficiariosModal(cuenta)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Users2 className="w-3.5 h-3.5" />
                  <span>Gestionar Beneficiarios</span>
                </button>
              </div>

              <div className="p-5 sm:p-6">
                {!cuenta.beneficiarios || cuenta.beneficiarios.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    <AlertCircle className="w-8 h-8 text-warning-500 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">Sin beneficiarios registrados</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Haga clic en "Gestionar Beneficiarios" para declarar los beneficiarios legales de esta cuenta.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Nombre Completo</th>
                          <th className="px-4 py-2.5 font-semibold">Parentesco</th>
                          <th className="px-4 py-2.5 font-semibold">DPI / CUI</th>
                          <th className="px-4 py-2.5 font-semibold">Teléfono</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Porcentaje Asignado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cuenta.beneficiarios.map((b, idx) => (
                          <tr key={b.id_beneficiario || idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {b.nombre_completo}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-xs">
                                {b.parentesco}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {b.cui_dpi || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {b.telefono || '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                                {parseFloat(b.porcentaje).toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50/70 border-t border-slate-200 font-bold">
                        <tr>
                          <td colSpan="4" className="px-4 py-2 text-right text-slate-600 text-xs">
                            Total Distribuido:
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-brand-800">
                            {totalPct.toFixed(2)}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default AssociateBeneficiariesTab;
