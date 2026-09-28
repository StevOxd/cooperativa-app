import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, FileDown } from 'lucide-react';
import { generateAccountOpeningReceiptPdf } from '../../../utils/accountOpeningReceiptPdf';

/**
 * Modal Informativo de Éxito de Afiliación Formalizada (ARQ-04)
 * Muestra el resumen del asociado creado y permite descargar el comprobante en PDF.
 * Por políticas de ciberseguridad, no expone la contraseña generada al operador.
 */
const OperatorAffiliationSuccessModal = ({ formalizadoResult, onClose }) => {
  if (!formalizadoResult) return null;

  const handleDownloadPdf = () => {
    try {
      generateAccountOpeningReceiptPdf({ data: formalizadoResult });
    } catch (err) {
      console.error('Error al generar comprobante de apertura:', err);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-auto animate-scaleUp text-center space-y-4 max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-success-modal-title"
      >
        <div className="w-16 h-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle className="w-10 h-10" />
        </div>

        <h3 id="operator-success-modal-title" className="text-xl font-bold text-slate-900">¡Afiliación Formalizada con Éxito!</h3>
        <p className="text-xs text-slate-600">
          Se ha formalizado la afiliación y aperturado la cuenta bancaria de ahorro.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Asociado Titular:</span>
            <span className="font-bold text-slate-900 text-right">{formalizadoResult.nombre_completo}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Usuario Asignado:</span>
            <span className="font-mono font-extrabold text-brand-800 text-sm">{formalizadoResult.usuario}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">No. Cuenta Bancaria:</span>
            <span className="font-mono font-bold text-slate-800">{formalizadoResult.numero_cuenta}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Depósito Inicial:</span>
            <span className="font-mono font-bold text-brand-800 text-sm">
              Q{parseFloat(formalizadoResult.saldo_inicial).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <span className="text-slate-500 font-medium">Contraseña Temporal:</span>
            <span className="text-xs font-semibold text-brand-800 bg-brand-100/70 px-2 py-0.5 rounded-md border border-brand-200">
              Despachada al Correo
            </span>
          </div>
          {formalizadoResult.email && (
            <div className="text-xs text-slate-500 text-center pt-1 font-sans">
              Despachada a: <span className="font-semibold text-slate-700">{formalizadoResult.email}</span>
            </div>
          )}
          {formalizadoResult.email_status?.simulado && (
            <div className="text-xs text-warning-800 bg-warning-50 border border-warning-200 rounded-xl p-2.5 text-left mt-1">
              <strong>Nota del servicio de correo:</strong> Se encuentra en modo demostrativo local. Para despachar correos reales a bandejas externas (Gmail), active Google Mail con su Contraseña de Aplicación desde el menú de Administración.
            </div>
          )}
        </div>

        {/* Botón de descarga de comprobante en PDF */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="w-full py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
        >
          <FileDown className="w-4 h-4 text-brand-700" />
          <span>Descargar Comprobante Oficial (PDF)</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-md"
        >
          Finalizar y Volver a la Bandeja
        </button>
      </div>
    </div>,
    document.body
  );
};

export default OperatorAffiliationSuccessModal;
