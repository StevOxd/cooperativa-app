import React from 'react';
import { Activity, Clock, Search } from 'lucide-react';

/**
 * Pestaña de cuenta de origen (planilla) e historial de traslados.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const AssociateTransfersTab = ({
  cuentaPlanilla,
  cuentas,
  filterTrasladoEstado,
  filterTrasladoTipo,
  filteredSolicitudesTraslado,
  getStatusBadge,
  openTrasladoModal,
  searchTrasladoQuery,
  setFilterTrasladoEstado,
  setFilterTrasladoTipo,
  setSearchTrasladoQuery,
  solicitudesTraslado,
}) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Cuenta Origen Info (Izquierda) */}
      <div className="md:col-span-5 bg-gradient-to-br from-brand-800 to-teal-950 p-6 sm:p-8 rounded-lg text-white relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-brand-300 uppercase tracking-widest block">
                {cuentaPlanilla?.origen_cuenta === 'COOPERATIVA'
                  ? 'Cuenta Cooperativa Principal'
                  : 'Cuenta Bancaria Vinculada'}
              </span>
              {cuentaPlanilla && (
                <span className="text-xs font-bold bg-white/15 text-brand-200 border border-brand-400/30 px-2 py-0.5 rounded-full">
                  {cuentaPlanilla.origen_cuenta === 'COOPERATIVA' ? 'Cooperativa' : 'Entidad Bancaria'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold">
              {cuentaPlanilla ? cuentaPlanilla.tipo_cuenta : (cuentas.length > 0 ? cuentas[0].tipo_cuenta : 'Cuenta de Ahorro')}
            </h3>
            {cuentaPlanilla ? (
              <span className="text-sm font-mono font-semibold text-brand-200 block mt-0.5">
                {cuentaPlanilla.numero_cuenta}
              </span>
            ) : cuentas.length > 0 ? (
              <span className="text-sm font-mono font-semibold text-brand-200 block mt-0.5">
                {cuentas[0].numero_cuenta} (Ahorro Activa)
              </span>
            ) : (
              <span className="text-sm text-danger-300 block mt-0.5">No vinculada</span>
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <span className="text-xs text-brand-200 block mb-1">Saldo Disponible</span>
            <span className="text-3xl font-extrabold tracking-tight">
              Q{cuentaPlanilla 
                ? parseFloat(cuentaPlanilla.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })
                : (cuentas.length > 0 ? parseFloat(cuentas[0].saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 }) : '0.00')}
            </span>
            <p className="text-xs text-brand-300/80 leading-normal mt-2">
              {cuentaPlanilla?.origen_cuenta === 'COOPERATIVA'
                ? 'Fondos disponibles en su cuenta de ahorro para traslados, pagos o aperturas en la Cooperativa.'
                : 'Fondos disponibles en su cuenta de ahorro bancaria para aperturar y trasladar hacia sus cuentas en la Cooperativa.'}
            </p>
          </div>

          <button
            onClick={openTrasladoModal}
            disabled={!cuentaPlanilla}
            className="w-full py-3 bg-white hover:bg-slate-50 text-brand-950 font-bold text-sm rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-line"
          >
            Trasladar Fondos
          </button>
        </div>
      </div>

      {/* Historial de Traslados (Derecha) */}
      <div className="md:col-span-7 bg-white p-6 rounded-lg border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Solicitudes de Traslado de Fondos
            </h3>
            <span className="text-xs text-slate-500 font-semibold bg-slate-50 px-2 py-0.5 rounded border inline-block mt-0.5">
              Bajo revisión del operador
            </span>
          </div>
        </div>

        {/* Filtros de Historial (Req-7) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTrasladoQuery}
              onChange={(e) => setSearchTrasladoQuery(e.target.value)}
              placeholder="Buscar por caso o destino..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white"
            />
          </div>
          <div>
            <select
              value={filterTrasladoEstado}
              onChange={(e) => setFilterTrasladoEstado(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-slate-700"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="APROBADO">Aprobados</option>
              <option value="RECHAZADO">Rechazados</option>
            </select>
          </div>
          <div>
            <select
              value={filterTrasladoTipo}
              onChange={(e) => setFilterTrasladoTipo(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-slate-700"
            >
              <option value="TODOS">Todos los Tipos</option>
              <option value="TRASLADO_DIRECTO">Traslado Directo</option>
              <option value="APERTURA_Y_TRASLADO">Apertura y Traslado</option>
            </select>
          </div>
        </div>

        {filteredSolicitudesTraslado.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Activity className="w-12 h-12 text-slate-200 mx-auto mb-2" />
            <p className="text-xs font-semibold">
              {solicitudesTraslado.length === 0
                ? 'No tiene traslados registrados.'
                : 'No se encontraron traslados que coincidan con los filtros aplicados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Caso</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Monto</th>
                  <th className="px-4 py-2.5 font-semibold">Operación / Destino</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Resolución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSolicitudesTraslado.map((s) => (
                  <tr key={s.id_solicitud} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {s.numero_caso}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      Q{parseFloat(s.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold block text-slate-700">
                        {s.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado Directo' : 'Apertura y Traslado'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Destino: {s.cuenta_destino_numero || s.tipo_cuenta_destino}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(s.estado)}`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                      {s.estado === 'PENDIENTE' ? (
                        <span className="text-slate-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-warning-500" />
                          <span>Esperando operador</span>
                        </span>
                      ) : (
                        <div>
                          <span className="block font-medium">{s.estado === 'APROBADO' ? 'Aprobado' : 'Rechazado'}</span>
                          <span className="block text-xs text-slate-400">{s.observaciones_operador || '-'}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default AssociateTransfersTab;
