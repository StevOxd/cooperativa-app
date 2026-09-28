import React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Building2,
  Landmark,
  ShieldCheck,
  Info,
  ArrowRight,
} from 'lucide-react';

/**
 * Step 1D: Direct affiliation success confirmation with membership details and 2FA QR code.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object} props.afiliacionExitosa - Affiliation result payload with user, account and MFA tokens.
 * @returns {JSX.Element} Rendered success view.
 */
export const DirectAffiliationSuccess = ({ afiliacionExitosa }) => {
  if (!afiliacionExitosa) return null;

  return (
    <div className="text-center py-4 space-y-5">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-700 shadow-inner">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">
          ¡Afiliación Formalizada con Éxito!
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          Has sido registrado formalmente en el Padrón General de Asociados.
        </p>
      </div>

      {/* Resumen de Cuentas */}
      <div className="space-y-3 text-left">
        {/* Datos del Asociado */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
            <span className="text-xs text-slate-600 font-semibold">Usuario:</span>
            <span className="text-sm font-bold text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {afiliacionExitosa.usuario.codigo_corporativo}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-slate-600 font-semibold">Asociado Titular:</span>
            <span className="text-sm font-bold text-slate-900">
              {afiliacionExitosa.asociado.nombre_completo}
            </span>
          </div>
        </div>

        {/* Tarjeta 1: NUEVA CUENTA EN LA COOPERATIVA */}
        <div className="bg-emerald-50/90 border-2 border-emerald-400 rounded-2xl p-4 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-900 font-extrabold text-xs uppercase tracking-wider">
            <Building2 className="w-4 h-4 text-emerald-700" />
            <span>Tu Nueva Cuenta en la Cooperativa</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-700 font-medium">Número de Cuenta Aperturada:</span>
            <span className="text-base font-mono font-extrabold text-emerald-900">
              {afiliacionExitosa.cuenta_ahorro?.numero_cuenta || afiliacionExitosa.cuenta_aportaciones?.numero_cuenta}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-emerald-200 pt-2">
            <span className="text-xs text-slate-700 font-medium">Saldo Inicial Acreditado:</span>
            <span className="text-base font-extrabold text-emerald-700">
              Q{parseFloat(afiliacionExitosa.cuenta_ahorro?.saldo_disponible || afiliacionExitosa.cuenta_aportaciones?.saldo_disponible || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Tarjeta 2: CUENTA BANCARIA DEBITADA */}
        <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-2">
          <div className="flex items-center space-x-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
            <Landmark className="w-4 h-4 text-slate-600" />
            <span>Cuenta Bancaria Debitada (Banco Corporativo)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-600 font-medium">Cuenta de Origen:</span>
            <span className="text-xs font-mono font-bold text-slate-800">
              {afiliacionExitosa.cuenta_bancaria_origen.numero_cuenta_bancaria}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-200 pt-2">
            <span className="text-xs text-slate-600 font-medium">Monto Debitado:</span>
            <span className="text-xs font-bold text-slate-800">
              Q{parseFloat(afiliacionExitosa.cuenta_bancaria_origen.monto_debitado).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-200 pt-2">
            <span className="text-xs text-slate-600 font-medium">Nuevo Saldo en Cuenta Bancaria:</span>
            <span className="text-xs font-mono font-bold text-emerald-700">
              Q{parseFloat(afiliacionExitosa.cuenta_bancaria_origen.nuevo_saldo).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Tarjeta de Seguridad: Doble Factor de Autenticación (MFA / 2FA) */}
        {afiliacionExitosa.mfa?.qr_code_url && (
          <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3.5 border border-slate-800 shadow-md">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Seguridad Bancaria: Doble Factor de Autenticación (2FA)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Hemos enviado este código QR a tu correo electrónico registrado. Escanéalo ahora con <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> para activar tu acceso:
            </p>

            <div className="bg-white p-3 rounded-xl inline-block mx-auto shadow-inner text-center">
              <img
                src={afiliacionExitosa.mfa.qr_code_url}
                alt="Código QR de Verificación 2FA"
                className="w-40 h-40 mx-auto rounded"
              />
            </div>

            <div className="bg-slate-800/90 rounded-xl p-3 border border-slate-700/80 text-center space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                Clave Secreta de Configuración Manual:
              </span>
              <span className="font-mono text-xs font-bold text-emerald-300 tracking-widest select-all">
                {afiliacionExitosa.mfa.secret}
              </span>
            </div>
          </div>
        )}

        {/* Banner Aclaratorio */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
          <p className="font-bold flex items-center space-x-1.5">
            <Info className="w-4 h-4 text-blue-700 shrink-0" />
            <span>Primer Ingreso al Portal:</span>
          </p>
          <p className="text-[11px] leading-relaxed text-blue-800">
            Ingresa utilizando tu <strong>Usuario ({afiliacionExitosa.usuario.codigo_corporativo})</strong> o correo electrónico junto con la contraseña que acabas de definir. Al entrar se te presentará el <strong>recorrido guiado</strong> para que conozcas todas las funciones.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Link
          to="/login"
          className="w-full py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          <span>Iniciar Sesión Ahora</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};

export default DirectAffiliationSuccess;
