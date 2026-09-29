import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Percent,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * Modal para editar los beneficiarios de una cuenta.
 * Extraído sin cambios visuales desde AssociateDashboard.
 */
export const EditBeneficiariesModal = ({
  closeEditarBeneficiariosModal,
  editBeneficiariosList,
  handleAddBeneficiarioAsociado,
  handleRemoveBeneficiarioAsociado,
  handleSaveBeneficiariosSubmit,
  hasAssociateBenChanges,
  modalBenError,
  savingBeneficiarios,
  selectedCuentaParaEditar,
  setEditBeneficiariosList,
  totalPorcentajeAsociado,
}) => (
  <>
    {selectedCuentaParaEditar && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 overflow-y-auto">
        <div
          className="bg-white rounded-lg max-w-3xl w-full p-6 sm:p-8 shadow-lg border border-slate-200 relative my-8 animate-scaleUp max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 flex-shrink-0">
            <div>
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                Declaración Legal de Beneficiarios
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {selectedCuentaParaEditar.tipo_cuenta} • {selectedCuentaParaEditar.numero_cuenta}
              </h2>
            </div>
            <button
              onClick={closeEditarBeneficiariosModal}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body scrollable */}
          <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
            <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg text-brand-950 text-xs flex items-start space-x-2">
              <Info className="w-4 h-4 text-brand-700 flex-shrink-0 mt-0.5" />
              <span>
                Los beneficiarios recibirán los fondos de la cuenta en caso de fallecimiento del titular. La sumatoria de todos los porcentajes asignados debe ser exactamente <strong>100.00%</strong>.
              </span>
            </div>

            {modalBenError && (
              <div className="p-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg text-xs font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalBenError}</span>
              </div>
            )}

            {/* Lista de Beneficiarios */}
            <div className="space-y-3">
              {editBeneficiariosList.map((ben, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Beneficiario #{idx + 1}
                    </span>
                    {editBeneficiariosList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBeneficiarioAsociado(idx)}
                        className="text-danger-500 hover:text-danger-700 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 font-semibold mb-1">
                        Nombre Completo *
                      </label>
                      <input
                        type="text"
                        value={ben.nombre_completo}
                        onChange={(e) => {
                          const updated = [...editBeneficiariosList];
                          updated[idx].nombre_completo = e.target.value;
                          setEditBeneficiariosList(updated);
                        }}
                        placeholder="Nombre y Apellidos completos"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Parentesco *
                      </label>
                      <select
                        value={ben.parentesco}
                        onChange={(e) => {
                          const updated = [...editBeneficiariosList];
                          updated[idx].parentesco = e.target.value;
                          setEditBeneficiariosList(updated);
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                      >
                        <option value="CÓNYUGE">CÓNYUGE</option>
                        <option value="HIJO/A">HIJO/A</option>
                        <option value="PADRE">PADRE</option>
                        <option value="MADRE">MADRE</option>
                        <option value="HERMANO/A">HERMANO/A</option>
                        <option value="OTRO">OTRO</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        DPI / CUI
                      </label>
                      <input
                        type="text"
                        value={ben.cui_dpi || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                          const updated = [...editBeneficiariosList];
                          updated[idx].cui_dpi = val;
                          setEditBeneficiariosList(updated);
                        }}
                        placeholder="13 dígitos"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Teléfono (8 dígitos)
                      </label>
                      <input
                        type="text"
                        maxLength={8}
                        value={ben.telefono || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                          const updated = [...editBeneficiariosList];
                          updated[idx].telefono = val;
                          setEditBeneficiariosList(updated);
                        }}
                        placeholder="Ej. 55551234"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">
                        Porcentaje (%) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={ben.porcentaje}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = [...editBeneficiariosList];
                            updated[idx].porcentaje = val;
                            setEditBeneficiariosList(updated);
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-bold text-slate-800 pr-8"
                        />
                        <Percent className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Botón Agregar Beneficiario */}
            <button
              type="button"
              onClick={handleAddBeneficiarioAsociado}
              disabled={totalPorcentajeAsociado >= 100}
              className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-brand-500 text-slate-600 hover:text-brand-700 rounded-md text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Beneficiario</span>
            </button>

            {/* Barra de Distribución Porcentual */}
            <div className={`p-4 rounded-lg border ${
              Math.abs(totalPorcentajeAsociado - 100.00) < 0.01
                ? 'bg-brand-50 border-brand-200 text-brand-900'
                : totalPorcentajeAsociado > 100
                ? 'bg-danger-50 border-danger-200 text-danger-900'
                : 'bg-warning-50 border-warning-200 text-warning-900'
            }`}>
              <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                <span>Total Distribuido:</span>
                <span className="text-sm font-extrabold">{totalPorcentajeAsociado.toFixed(2)}% de 100.00%</span>
              </div>
              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    Math.abs(totalPorcentajeAsociado - 100.00) < 0.01
                      ? 'bg-brand-600'
                      : totalPorcentajeAsociado > 100
                      ? 'bg-danger-600'
                      : 'bg-warning-500'
                  }`}
                  style={{ width: `${Math.min(100, totalPorcentajeAsociado)}%` }}
                />
              </div>
              <div className="text-xs mt-1.5">
                {Math.abs(totalPorcentajeAsociado - 100.00) < 0.01 ? (
                  <span className="text-brand-700 font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Distribución exacta y aprobable (100.00%).</span>
                  </span>
                ) : totalPorcentajeAsociado > 100 ? (
                  <span className="text-danger-700 font-semibold">
                    Excede el 100.00% por {(totalPorcentajeAsociado - 100).toFixed(2)}%. Reduzca los porcentajes.
                  </span>
                ) : (
                  <span className="text-warning-700 font-semibold">
                    Falta asignar el {(100 - totalPorcentajeAsociado).toFixed(2)}% para completar el 100.00%.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
            <div className="text-xs">
              {!hasAssociateBenChanges && Math.abs(totalPorcentajeAsociado - 100.00) < 0.01 && (
                <span className="text-slate-400 italic text-xs">
                  Sin modificaciones pendientes por guardar
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={closeEditarBeneficiariosModal}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveBeneficiariosSubmit}
                disabled={savingBeneficiarios || Math.abs(totalPorcentajeAsociado - 100.00) > 0.01 || !hasAssociateBenChanges}
                className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-md text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasAssociateBenChanges ? 'Modifique algún campo o porcentaje para guardar' : ''}
              >
                {savingBeneficiarios ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Guardar Declaración (100.00%)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
);

export default EditBeneficiariesModal;
