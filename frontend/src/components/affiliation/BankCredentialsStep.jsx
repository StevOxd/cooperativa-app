import React from 'react';
import {
  Landmark,
  RotateCcw,
  ShieldCheck,
  User,
  Briefcase,
  Lock,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from 'lucide-react';

/**
 * Step 1A: Online banking authentication credentials for bank customers/employees.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {Object} props.bancoData - Bank customer verification payload.
 * @param {Object} props.bancoCreds - Current banking credentials state.
 * @param {Function} props.setBancoCreds - State updater for banking credentials.
 * @param {Function} props.handleValidarCredencialesBanco - Form submission handler.
 * @param {boolean} props.bancoAuthLoading - Indicates credentials verification is running.
 * @param {Function} props.handleReset - Reset flow handler.
 * @returns {JSX.Element} Rendered step.
 */
export const BankCredentialsStep = ({
  bancoData,
  bancoCreds,
  setBancoCreds,
  handleValidarCredencialesBanco,
  bancoAuthLoading,
  handleReset,
}) => {
  return (
    <div className="space-y-5">
      {/* Header de verificación */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
            <Landmark className="w-3.5 h-3.5 text-blue-700" />
            <span>Cliente de la Corporación Bancaria</span>
          </span>
          <h3 className="text-lg font-extrabold text-slate-900 mt-2">
            {bancoData.cliente?.nombre_completo || 'Cliente Bancario Identificado'}
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            DPI: {bancoData.cui_dpi} {bancoData.cliente?.tipo_cliente === 'EMPLEADO_PLANILLA' ? '• Colaborador de Nómina' : '• Cliente Externo'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          title="Cambiar DPI"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Cambiar</span>
        </button>
      </div>

      {/* Mensaje explicativo */}
      <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-100 text-xs text-blue-900 space-y-1">
        <div className="flex items-center space-x-2 font-bold text-blue-950">
          <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
          <span>Autenticación de Banca en Línea Requerida</span>
        </div>
        <p className="text-xs leading-relaxed text-blue-800">
          Has sido identificado en la Entidad Bancaria. Para vincular tus cuentas de forma segura a tu membresía cooperativa, ingresa tus 3 credenciales de acceso a la <strong>Banca en Línea</strong> del banco.
        </p>
      </div>

      {/* Formulario de las 3 credenciales */}
      <form onSubmit={handleValidarCredencialesBanco} autoComplete="off" className="space-y-4">
        {/* 1. Nombre de Usuario Bancario */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            1. Nombre de Usuario de Banca en Línea *
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              name="banco_usuario_seguro"
              autoComplete="off"
              value={bancoCreds.nombre_usuario}
              onChange={(e) => setBancoCreds((prev) => ({ ...prev, nombre_usuario: e.target.value }))}
              placeholder="Ingrese nombre de usuario"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
              required
            />
          </div>
        </div>

        {/* 2. Código de Cliente */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            2. Código de Cliente *
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              name="banco_codigo_seguro"
              autoComplete="off"
              value={bancoCreds.codigo}
              onChange={(e) => setBancoCreds((prev) => ({ ...prev, codigo: e.target.value.toUpperCase() }))}
              placeholder="Ingrese código de cliente"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
              required
            />
          </div>
        </div>

        {/* 3. Contraseña de Banca en Línea */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            3. Contraseña de Acceso Bancario *
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="password"
              name="banco_password_seguro"
              autoComplete="new-password"
              value={bancoCreds.password}
              onChange={(e) => setBancoCreds((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Ingrese contraseña de acceso bancario"
              className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
              required
            />
          </div>
        </div>

        {/* Botones de acción */}
        <div className="pt-3 flex justify-between items-center border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver</span>
          </button>
          <button
            type="submit"
            disabled={bancoAuthLoading}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {bancoAuthLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validando con Banco...</span>
              </>
            ) : (
              <>
                <span>Validar Credenciales</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BankCredentialsStep;
