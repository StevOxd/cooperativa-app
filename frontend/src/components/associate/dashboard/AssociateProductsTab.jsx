import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * Pestaña de productos y beneficios disponibles.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AssociateProductsTab = ({ catalogoProductos }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
        <TrendingUp className="w-5 h-5 text-brand-600" />
        <span>Nuestras Cuentas y Tasas de Interés</span>
      </h2>
      <p className="text-sm text-slate-500 mt-0.5">
        Conozca las características y beneficios de los productos financieros disponibles para usted.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {catalogoProductos.map((p) => (
        <div
          key={p.id_tipo_cuenta}
          className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between"
        >
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-start">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-100">
                Rendimiento
              </span>
              <div className="text-right">
                <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Tasa Anual</span>
                <span className="text-2xl font-extrabold text-slate-900">{p.tasa_interes_anual}%</span>
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-800">{p.nombre}</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{p.descripcion}</p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Beneficios principales</span>
              <p className="text-xs text-slate-600 leading-normal">{p.beneficios}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 border-t border-slate-200/60 flex justify-between items-center text-xs">
            <span className="text-slate-500">Monto apertura:</span>
            <span className="font-bold text-slate-700">Q{parseFloat(p.monto_minimo_apertura).toLocaleString('es-GT')}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default AssociateProductsTab;
