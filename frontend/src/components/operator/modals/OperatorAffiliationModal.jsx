import React from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus,
  Lock,
  X,
  AlertTriangle,
  Loader2,
  User,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Check,
} from 'lucide-react';

/**
 * Modal de Atención y Formalización de Afiliación en Agencia (ARQ-04)
 * Permite al Operador revisar y corregir datos del solicitante, registrar el depósito inicial en ventanilla o cancelar el caso.
 */
const OperatorAffiliationModal = ({
  selectedAfiliacion,
  showRechazarAfiliacion,
  setShowRechazarAfiliacion,
  motivoRechazoAfiliacion,
  setMotivoRechazoAfiliacion,
  rechazandoAfiliacion,
  handleRechazarAfiliacionSubmit,
  handleLiberarAfiliacion,
  handleFormalizarSubmit,
  editPrimerNombre,
  setEditPrimerNombre,
  editSegundoNombre,
  setEditSegundoNombre,
  editPrimerApellido,
  setEditPrimerApellido,
  editSegundoApellido,
  setEditSegundoApellido,
  editCuiDpi,
  setEditCuiDpi,
  editFechaNacimiento,
  setEditFechaNacimiento,
  editTelefono,
  setEditTelefono,
  editEmail,
  setEditEmail,
  editDireccion,
  setEditDireccion,
  operatorEmailStatus,
  montoAportacion,
  setMontoAportacion,
  passwordInicial,
  setPasswordInicial,
  observacionesAfiliacion,
  setObservacionesAfiliacion,
  formalizando,
}) => {
  if (!selectedAfiliacion) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 relative my-auto animate-scaleUp overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-affiliation-modal-title"
      >
        {/* Header del modal - fijo en la parte superior, nunca se corta */}
        <div className="flex justify-between items-start p-5 sm:p-6 pb-4 border-b border-slate-100 shrink-0 bg-white">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-brand-100 text-brand-800 rounded-xl">
                <UserPlus className="w-5 h-5" />
              </span>
              <div>
                <h3 id="operator-affiliation-modal-title" className="text-lg font-bold text-slate-900">
                  Atención y Formalización de Afiliación
                </h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200">
                    {selectedAfiliacion.numero_caso}
                  </span>
                  <span className="text-xs text-blue-700 font-semibold flex items-center space-x-1">
                    <Lock className="w-3 h-3" />
                    <span>Caso bloqueado bajo tu atención exclusiva</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleLiberarAfiliacion}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Cerrar y liberar caso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subformulario o Vista de Rechazo */}
        {showRechazarAfiliacion ? (
          <form onSubmit={handleRechazarAfiliacionSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-danger-50/50 p-4 rounded-2xl border border-danger-200 space-y-3">
                <div className="flex items-center space-x-2 text-danger-700 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Cancelar / Rechazar Caso de Afiliación</span>
                </div>
                <p className="text-xs text-slate-600">
                  Indique el motivo por el cual no se formaliza la afiliación en ventanilla (e.g. inconsistencia en DPI, falta de fondos mínimos, solicitud cancelada por el solicitante).
                </p>
                <div>
                  <textarea
                    value={motivoRechazoAfiliacion}
                    onChange={(e) => setMotivoRechazoAfiliacion(e.target.value)}
                    rows={3}
                    required
                    placeholder="Escriba el motivo detallado de la cancelación..."
                    className="w-full px-3 py-2 bg-white border border-danger-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-danger-500 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 p-4 sm:p-5 border-t border-slate-100 shrink-0 bg-slate-50/80 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setShowRechazarAfiliacion(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Volver a Formalización
              </button>
              <button
                type="submit"
                disabled={rechazandoAfiliacion}
                className="px-4 py-2 bg-danger-700 hover:bg-danger-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center space-x-1"
              >
                {rechazandoAfiliacion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Confirmar Cancelación</span>}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleFormalizarSubmit} className="flex flex-col flex-1 overflow-hidden">
            {/* Cuerpo del modal con scroll interno fluido */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* Ficha editable de datos del solicitante */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>Datos de Identidad y Contacto del Solicitante</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Primer Nombre *</label>
                    <input
                      type="text"
                      required
                      value={editPrimerNombre}
                      onChange={(e) => setEditPrimerNombre(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Segundo Nombre</label>
                    <input
                      type="text"
                      value={editSegundoNombre}
                      onChange={(e) => setEditSegundoNombre(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Primer Apellido *</label>
                    <input
                      type="text"
                      required
                      value={editPrimerApellido}
                      onChange={(e) => setEditPrimerApellido(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Segundo Apellido</label>
                    <input
                      type="text"
                      value={editSegundoApellido}
                      onChange={(e) => setEditSegundoApellido(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">CUI / DPI (13 Dígitos) *</label>
                    <input
                      type="text"
                      maxLength={13}
                      required
                      value={editCuiDpi}
                      onChange={(e) => setEditCuiDpi(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-brand-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Fecha de Nacimiento *</label>
                    <input
                      type="date"
                      required
                      value={editFechaNacimiento}
                      onChange={(e) => setEditFechaNacimiento(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-xs font-medium text-slate-500">Teléfono (8 Dígitos)</label>
                      <span className={`text-xs font-mono font-semibold ${
                        editTelefono.length === 8 ? 'text-brand-700 font-bold' : 'text-slate-400'
                      }`}>
                        {editTelefono.length}/8 dígitos
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={8}
                      value={editTelefono}
                      onChange={(e) => setEditTelefono(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="Ej: 55551234"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-xs font-medium text-slate-500">Correo Electrónico</label>
                      {operatorEmailStatus.checking && (
                        <span className="text-xs text-brand-600 flex items-center space-x-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          <span>Verificando...</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className={`w-full pl-2.5 pr-8 py-1.5 bg-white border rounded-lg text-xs text-slate-800 transition-colors ${
                          operatorEmailStatus.disponible === false
                            ? 'border-danger-500 focus:ring-1 focus:ring-danger-500 bg-danger-50/20 text-danger-900'
                            : operatorEmailStatus.disponible === true
                            ? 'border-brand-500 focus:ring-1 focus:ring-brand-600'
                            : 'border-slate-300 focus:ring-1 focus:ring-brand-600'
                        }`}
                      />
                      {!operatorEmailStatus.checking && operatorEmailStatus.disponible === false && (
                        <AlertCircle className="w-3.5 h-3.5 text-danger-500 absolute right-2.5 top-2" />
                      )}
                      {!operatorEmailStatus.checking && operatorEmailStatus.disponible === true && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-600 absolute right-2.5 top-2" />
                      )}
                    </div>
                    {operatorEmailStatus.message && (
                      <p className={`text-xs mt-1 font-medium ${
                        operatorEmailStatus.disponible === false ? 'text-danger-600' : 'text-brand-700'
                      }`}>
                        {operatorEmailStatus.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-0.5">Dirección de Residencia</label>
                    <input
                      type="text"
                      value={editDireccion}
                      onChange={(e) => setEditDireccion(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                </div>
              </div>

              {/* Bloque de Formalización y Depósito en Ventanilla */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase text-brand-800 tracking-wider block">
                  Formalización y Depósito en Ventanilla
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Monto de Depósito Inicial (Q) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">Q</span>
                      <input
                        type="number"
                        step="0.01"
                        min="100.00"
                        required
                        value={montoAportacion}
                        onChange={(e) => setMontoAportacion(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">Mínimo estatutario Q100.00</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Método de Recepción de Fondos
                    </label>
                    <div className="px-3 py-2 bg-brand-50 border border-brand-200 rounded-xl flex items-center justify-between text-xs font-bold text-brand-800">
                      <div className="flex items-center space-x-1.5">
                        <DollarSign className="w-4 h-4 text-brand-700" />
                        <span>Efectivo en Ventanilla</span>
                      </div>
                      <span className="text-xs bg-brand-200/80 text-brand-900 px-2 py-0.5 rounded-md font-semibold">
                        Recepción Presencial
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Depósito físico en ventanilla de caja al formalizar cuenta
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 mb-1">
                      <Lock className="w-4 h-4 text-brand-600 shrink-0" />
                      <span>Generación Automática de Contraseña Segura</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Por normativa de seguridad bancaria, la contraseña temporal se genera criptográficamente (12 caracteres) y se envía automáticamente junto con el usuario institucional al correo del asociado. Al iniciar sesión por primera vez, el sistema le solicitará el cambio obligatorio de contraseña.
                    </p>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Observaciones de Ventanilla (Opcional)
                    </label>
                    <textarea
                      value={observacionesAfiliacion}
                      onChange={(e) => setObservacionesAfiliacion(e.target.value)}
                      rows={2}
                      placeholder="Anotaciones de la atención presencial..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-brand-600 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer del modal con botones de acción - siempre visible abajo */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-2 p-4 sm:p-5 border-t border-slate-100 shrink-0 bg-slate-50/80 rounded-b-3xl">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleLiberarAfiliacion}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Liberar y Salir
                </button>
                <button
                  type="button"
                  onClick={() => setShowRechazarAfiliacion(true)}
                  className="w-full sm:w-auto px-3 py-2 text-danger-700 hover:bg-danger-50 rounded-xl text-xs font-bold border border-danger-200 cursor-pointer"
                >
                  Cancelar Caso
                </button>
              </div>

              <button
                type="submit"
                disabled={formalizando || operatorEmailStatus.disponible === false || operatorEmailStatus.checking}
                className="w-full sm:w-auto px-6 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formalizando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Formalizando Afiliación...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Formalizar y Crear Afiliado</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default OperatorAffiliationModal;
