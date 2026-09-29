import React from 'react';
import {
  ArrowRight,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Percent,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Pestaña de créditos: plan de pagos y amortización.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AssociateCreditsTab = ({
  creditosAprobados,
  cuotaPage,
  cuotasPerPage,
  currentCreditoPlan,
  pageCapitalAmortizado,
  pageInteresAmortizado,
  pagePagadoAmortizado,
  paginatedCuotas,
  planAmortizacion,
  setCuotaPage,
  setSelectedCreditoPlanId,
  totalCapitalAmortizado,
  totalCuotasPages,
  totalInteresAmortizado,
  totalPagadoAmortizado,
}) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
        <Calculator className="w-5 h-5 text-brand-600" />
        <span>Plan de Pagos y Créditos Financieros</span>
      </h2>
      <p className="text-sm text-slate-500 mt-0.5">
        Consulte el cronograma oficial de amortización de sus créditos aprobados y el desglose de cuota mensual.
      </p>
    </div>

    {creditosAprobados.length === 0 ? (
      <div className="bg-white p-12 rounded-lg border border-slate-200 text-center space-y-4 max-w-xl mx-auto">
        <div className="w-16 h-16 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center mx-auto">
          <Calculator className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-800">
            No posee créditos aprobados actualmente
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Actualmente no cuenta con créditos activos o vigentes. Puede utilizar el simulador financiero para calcular su cuota y presentar una solicitud ante el comité.
          </p>
        </div>
        <div className="pt-2">
          <Link
            to="/simulador-credito"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold transition-all cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>Ir al Simulador de Créditos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    ) : (
      <div className="space-y-6">
        {/* Selector si posee más de 1 crédito aprobado */}
        {creditosAprobados.length > 1 && (
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 whitespace-nowrap">
              Crédito Seleccionado:
            </span>
            {creditosAprobados.map((cr) => {
              const isSelected = currentCreditoPlan?.id_solicitud_credito === cr.id_solicitud_credito;
              return (
                <button
                  key={cr.id_solicitud_credito}
                  onClick={() => setSelectedCreditoPlanId(cr.id_solicitud_credito)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-brand-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Crédito #{cr.id_solicitud_credito} (Q{parseFloat(cr.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })})
                </button>
              );
            })}
          </div>
        )}

        {/* Tarjeta Principal del Crédito Aprobado */}
        {currentCreditoPlan && (
          <>
            <div className="bg-gradient-to-br from-brand-800 to-teal-950 p-6 sm:p-8 rounded-lg text-white relative overflow-hidden">

              <div className="relative z-10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-xs font-bold text-brand-300 uppercase tracking-widest block mb-0.5">
                      Plan de Pagos y Amortización Oficial
                    </span>
                    <h2 className="text-2xl font-black tracking-tight">
                      Crédito Financiero #{currentCreditoPlan.id_solicitud_credito}
                    </h2>
                  </div>
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-500/20 text-brand-200 border border-brand-400/30 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                    <span>Aprobado y Acreditado</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-brand-200 block uppercase font-medium">Monto Aprobado</span>
                    <span className="text-2xl font-black text-white">
                      Q{parseFloat(currentCreditoPlan.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-brand-200 block uppercase font-medium">Fecha de Aprobación</span>
                    <span className="text-sm sm:text-base font-bold text-white block">
                      {new Date(currentCreditoPlan.fecha_resolucion || currentCreditoPlan.fecha_solicitud).toLocaleDateString('es-GT', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-brand-200 block uppercase font-medium">Plazo de Pago</span>
                    <span className="text-2xl font-black text-white">
                      {currentCreditoPlan.plazo_meses} meses
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-brand-200 block uppercase font-medium">Tasa de Interés</span>
                    <span className="text-2xl font-black text-brand-300">
                      {parseFloat(currentCreditoPlan.tasa_interes).toFixed(2)}% <span className="text-xs font-normal text-brand-200">Anual Fija</span>
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-brand-100 gap-2">
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-brand-300 flex-shrink-0" />
                    <span>
                      <strong>Cuenta de Acreditación:</strong>{' '}
                      {currentCreditoPlan.cuenta_destino_info ||
                        (currentCreditoPlan.cuenta_bancaria_destino_numero
                          ? `Cuenta Bancaria de ${currentCreditoPlan.cuenta_bancaria_destino_tipo || ''} (${currentCreditoPlan.cuenta_bancaria_destino_numero})`
                          : 'Cuenta Principal del Asociado')}
                    </span>
                  </div>
                  <div className="text-brand-300 text-xs font-medium">
                    Amortización Nivelada Francesa (Cuotas fijas)
                  </div>
                </div>
              </div>
            </div>

            {/* Desglose de Fórmula: Cuota Capital + Interés = Cuota del Mes */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <Percent className="w-4 h-4 text-brand-600" />
                  <span>Fórmula de Cobro: Cuota Capital + Interés = Cuota del Mes</span>
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  Cuota nivelada mensual:{' '}
                  <strong className="text-brand-800 font-bold">
                    Q{parseFloat(currentCreditoPlan.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                {/* Bloque 1: Cuota Capital */}
                <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 text-center relative flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-1">
                      Cuota Capital
                    </span>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Abono directo que amortiza y reduce el saldo de la deuda principal. Se incrementa mes a mes.
                    </p>
                  </div>
                  <div className="mt-3 font-mono text-xs font-bold text-slate-700">
                    Amortiza progresivamente
                  </div>
                  <div className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-brand-700 text-white font-black text-sm items-center justify-center">
                    +
                  </div>
                </div>

                {/* Bloque 2: Interés del Mes */}
                <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 text-center relative flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-warning-800 uppercase tracking-wider block mb-1">
                      Interés del Mes
                    </span>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Interés financiero del 10% anual calculado exclusivamente sobre el saldo insoluto pendiente.
                    </p>
                  </div>
                  <div className="mt-3 font-mono text-xs font-bold text-warning-700">
                    Tasa mensual: {(parseFloat(currentCreditoPlan.tasa_interes) / 12).toFixed(4)}%
                  </div>
                  <div className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-brand-700 text-white font-black text-sm items-center justify-center">
                    =
                  </div>
                </div>

                {/* Bloque 3: Cuota del Mes */}
                <div className="p-5 rounded-lg bg-gradient-to-br from-brand-50 to-teal-50 border-2 border-brand-500 text-center flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-brand-900 uppercase tracking-wider block mb-1">
                      Cuota del Mes
                    </span>
                    <span className="text-2xl font-black text-brand-800 block my-1">
                      Q{parseFloat(currentCreditoPlan.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-xs text-brand-700 font-semibold block">
                    Cuota fija del mes (Capital + Interés)
                  </span>
                </div>
              </div>
            </div>

            {/* Tabla de Amortización Francesa */}
            <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-brand-600" />
                    <span>Cronograma Oficial de Cuotas Mensuales</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Fechas de cobro calculadas a partir de la fecha de resolución y aprobación del crédito ({new Date(currentCreditoPlan.fecha_resolucion || currentCreditoPlan.fecha_solicitud).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}).
                  </p>
                </div>

                {totalCuotasPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                      Año {cuotaPage} de {totalCuotasPages}
                    </span>
                  </div>
                )}
              </div>

              {/* Controles de Paginación Anual (Bloques de 12 cuotas) para créditos > 12 meses */}
              {totalCuotasPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center space-x-2 text-xs text-slate-600 font-medium">
                    <span>
                      Mostrando cuotas <strong>{(cuotaPage - 1) * cuotasPerPage + 1}</strong> a <strong>{Math.min(cuotaPage * cuotasPerPage, planAmortizacion.length)}</strong> de <strong>{planAmortizacion.length}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-brand-700 font-bold">Bloque Anual {cuotaPage}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCuotaPage((prev) => Math.max(1, prev - 1))}
                      disabled={cuotaPage === 1}
                      className="inline-flex items-center px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                      Anterior
                    </button>

                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalCuotasPages }, (_, idx) => {
                        const pageNum = idx + 1;
                        const startCuota = (pageNum - 1) * cuotasPerPage + 1;
                        const endCuota = Math.min(pageNum * cuotasPerPage, planAmortizacion.length);
                        const isActive = cuotaPage === pageNum;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCuotaPage(pageNum)}
                            className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                              isActive
                                ? 'bg-brand-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                            title={`Cuotas ${startCuota} a ${endCuota}`}
                          >
                            Año {pageNum} ({startCuota}-{endCuota})
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCuotaPage((prev) => Math.min(totalCuotasPages, prev + 1))}
                      disabled={cuotaPage === totalCuotasPages}
                      className="inline-flex items-center px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Siguiente
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-center">No. Cuota</th>
                      <th className="px-4 py-3 font-semibold">Fecha de Cobro</th>
                      <th className="px-4 py-3 font-semibold text-right">Abono a Capital</th>
                      <th className="px-4 py-3 font-semibold text-right">Interés del Mes</th>
                      <th className="px-4 py-3 font-semibold text-right text-brand-800 font-bold bg-brand-50/50">Cuota del Mes (Cap + Int)</th>
                      <th className="px-4 py-3 font-semibold text-right">Saldo Pendiente</th>
                      <th className="px-4 py-3 font-semibold text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedCuotas.map((c) => (
                      <tr key={c.numero} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-center font-mono font-bold text-slate-700 text-xs">
                          #{c.numero}
                        </td>
                        <td className="px-4 py-3 text-slate-700 text-xs font-medium">
                          {c.fechaPago.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 text-xs">
                          Q{c.capital.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-warning-700 text-xs">
                          Q{c.interes.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-brand-800 text-xs bg-brand-50/30">
                          Q{c.cuotaMes.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-600 text-xs">
                          Q{c.saldoPendiente.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Programada
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800">
                    {totalCuotasPages > 1 && (
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
                        <td colSpan={2} className="px-4 py-2.5 uppercase tracking-wider text-slate-600 font-semibold">
                          Subtotal Año {cuotaPage} (Cuotas {(cuotaPage - 1) * cuotasPerPage + 1} a {Math.min(cuotaPage * cuotasPerPage, planAmortizacion.length)})
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                          Q{pageCapitalAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-warning-700">
                          Q{pageInteresAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-extrabold text-brand-800 bg-brand-100/40">
                          Q{pagePagadoAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2} className="px-4 py-2.5 text-center text-slate-400">
                          -
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-slate-800 font-bold">
                        {totalCuotasPages > 1 ? `Total Global Crédito (${planAmortizacion.length} meses)` : 'Totales Amortización'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        Q{totalCapitalAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-warning-700">
                        Q{totalInteresAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-brand-800 font-extrabold bg-brand-100/70">
                        Q{totalPagadoAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        Q0.00
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        -
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {totalCuotasPages > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Página {cuotaPage} de {totalCuotasPages} (12 cuotas por año)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setCuotaPage((prev) => Math.max(1, prev - 1))}
                      disabled={cuotaPage === 1}
                      className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setCuotaPage((prev) => Math.min(totalCuotasPages, prev + 1))}
                      disabled={cuotaPage === totalCuotasPages}
                      className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )}
  </div>
);

export default AssociateCreditsTab;
