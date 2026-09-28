import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Clock, Landmark, Download } from 'lucide-react';
import { generateAffiliationCasePdf } from '../../utils/affiliationCasePdf';

/**
 * Step 2B: Printable & downloadable official case confirmation for bank agency processing.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object} props.casoGenerado - Generated case details.
 * @returns {JSX.Element} Rendered confirmation view.
 */
export const AgencyReceiptStep = ({ casoGenerado }) => {
  if (!casoGenerado) return null;

  return (
    <div className="text-center py-4 space-y-5 print:py-0 print:space-y-3 print-avoid-break">
      {/* Encabezado Institucional Exclusivo para Impresión */}
      <div className="hidden print:flex items-center justify-between border-b border-slate-300 pb-3 mb-2 text-left">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#0c4a6e] flex items-center justify-center text-white">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-slate-900 text-sm leading-tight">
              COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO, R.L.
            </h1>
            <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">
              Corporación Bancaria • Constancia Oficial de Trámite
            </span>
          </div>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          <p className="font-bold text-slate-800">COMPROBANTE PARA AGENCIA</p>
          <p>Fecha de Impresión: {new Date().toLocaleDateString('es-GT')}</p>
        </div>
      </div>

      {/* Icono de Reloj (Solo en pantalla) */}
      <div className="print:hidden">
        <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto shadow-inner border border-blue-100">
          <Clock className="w-8 h-8" />
        </div>
      </div>

      <div>
        <span className="text-xs font-bold text-slate-700 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-300 print:text-[10px]">
          Solicitud Registrada
        </span>
        <h3 className="text-2xl font-black text-slate-900 mt-2 tracking-tight print:text-lg print:mt-1">
          Caso Emitido para Atención en Agencia
        </h3>
      </div>

      {/* Tarjeta de Número de Caso Destacado */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 text-center shadow-lg border border-slate-800 print:p-3 print:rounded-xl print:shadow-none">
        <p className="text-xs uppercase tracking-wider text-sky-400 font-bold print:text-[10px]">
          Tu Número de Caso Oficial
        </p>
        <p className="text-2xl sm:text-3xl font-mono font-black tracking-wider text-white mt-1 print:text-2xl">
          {casoGenerado.numero_caso}
        </p>
        <p className="text-[11px] text-slate-400 mt-1 font-mono print:text-[10px]">
          Fecha de Emisión: {new Date(casoGenerado.fecha_solicitud).toLocaleDateString('es-GT')}
        </p>
      </div>

      {/* Mensaje imperativo de acudir a la agencia */}
      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-left space-y-2 text-amber-950 print:p-3 print:rounded-xl print:border print:border-amber-400 print:space-y-1">
        <p className="font-extrabold text-xs uppercase tracking-wider flex items-center space-x-1.5 text-amber-900 print:text-[10px]">
          <Landmark className="w-4 h-4 text-amber-700 print:w-3.5 print:h-3.5" />
          <span>Instrucciones para Completar tu Afiliación:</span>
        </p>
        <p className="text-xs leading-relaxed font-medium print:text-[10px] print:leading-tight">
          {casoGenerado.instrucciones ||
            'Debes presentarte a cualquier agencia de la Corporación Bancaria con tu DPI físico original y este Número de Caso para depositar tus fondos iniciales y formalizar la apertura de tu cuenta de ahorro bancaria y de asociado.'}
        </p>
      </div>

      {/* Ficha Resumen */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2 print:p-3 print:rounded-xl print:text-[10px] print:space-y-1.5">
        <div className="flex justify-between">
          <span className="text-slate-500 font-medium">Solicitante:</span>
          <span className="font-bold text-slate-800">{casoGenerado.nombre_completo}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 print:pt-1">
          <span className="text-slate-500 font-medium">CUI / DPI:</span>
          <span className="font-mono font-bold text-slate-800">{casoGenerado.cui_dpi}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 print:pt-1">
          <span className="text-slate-500 font-medium">Monto Inicial Estimado:</span>
          <span className="font-bold text-blue-600">Q{parseFloat(casoGenerado.monto_estimado || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 print:pt-1">
          <span className="text-slate-500 font-medium">Estado del Caso:</span>
          <span className="font-bold text-amber-700 uppercase">Pendiente en Agencia</span>
        </div>
      </div>

      {/* Firmas y Sellos Receptores - Exclusivo para Impresión */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-7 pb-2 text-center text-[10px] text-slate-600">
        <div className="border-t border-slate-400 pt-1.5">
          <p className="font-bold text-slate-800">Firma del Solicitante</p>
          <p className="text-[9px]">DPI: {casoGenerado.cui_dpi}</p>
        </div>
        <div className="border-t border-slate-400 pt-1.5">
          <p className="font-bold text-slate-800">Firma y Sello de Agencia Receptora</p>
          <p className="text-[9px]">Corporación Bancaria • Verificado</p>
        </div>
      </div>

      {/* Pie de página de seguridad impreso */}
      <div className="hidden print:block text-center text-[8.5px] text-slate-400 border-t border-slate-200 pt-1.5">
        Documento de control interno emitido por el Sistema de Afiliación Digital • Válido para ventanilla en agencias.
      </div>

      {/* Botón único de acción (COMPLETAMENTE OCULTO AL IMPRIMIR O GENERAR PDF) */}
      <div className="print:hidden space-y-3 pt-3">
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => generateAffiliationCasePdf({ caso: casoGenerado })}
            className="w-full sm:w-auto px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar PDF</span>
          </button>
        </div>

        <div className="pt-1">
          <Link
            to="/login"
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors inline-block"
          >
            Regresar a la pantalla de Inicio de Sesión
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AgencyReceiptStep;
