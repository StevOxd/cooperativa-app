import React from 'react';
import {
  Info,
  RotateCcw,
  Phone,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Mail,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

/**
 * Step 2A: Agency application form for external applicants without bank accounts.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {string} props.cuiInput - CUI/DPI string.
 * @param {Object} props.nuevoForm - Form fields state.
 * @param {Function} props.setNuevoForm - State updater for form fields.
 * @param {string} props.birthDay - Selected birth day.
 * @param {string} props.birthMonth - Selected birth month.
 * @param {string} props.birthYear - Selected birth year.
 * @param {Function} props.handleDatePartChange - Handler for date dropdown changes.
 * @param {Array<string>} props.DAYS - List of days 01-31.
 * @param {Array<{val: string, name: string}>} props.MONTHS - List of months.
 * @param {Array<string>} props.YEARS - List of eligible years (18+).
 * @param {Object|null} props.ageCalculation - Validated age calculation result.
 * @param {Object} props.emailStatus - Email verification state.
 * @param {Function} props.handleSubmitNuevo - Submit handler.
 * @param {Function} props.handleReset - Reset flow handler.
 * @param {boolean} props.loading - Indicates application submission is in progress.
 * @returns {JSX.Element} Rendered form.
 */
export const AgencyApplicationForm = ({
  cuiInput,
  nuevoForm,
  setNuevoForm,
  birthDay,
  birthMonth,
  birthYear,
  handleDatePartChange,
  DAYS,
  MONTHS,
  YEARS,
  ageCalculation,
  emailStatus,
  handleSubmitNuevo,
  handleReset,
  loading,
}) => {
  return (
    <form onSubmit={handleSubmitNuevo} className="space-y-4">
      {/* Banner Informativo con el texto exacto institucional */}
      <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 space-y-2">
        <div className="flex items-start space-x-2.5">
          <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed font-semibold">
            DPI no registrado en la Entidad Bancaria. La Cooperativa forma parte de la Corporación Bancaria, emitiremos tu solicitud para apertura de cuenta de ahorro y membresía.
          </p>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-amber-200 text-[11px] text-amber-800">
          <span>CUI / DPI Verificado: <strong className="font-mono">{cuiInput}</strong></span>
          <button
            type="button"
            onClick={handleReset}
            className="text-amber-900 font-bold hover:underline cursor-pointer flex items-center space-x-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Cambiar DPI</span>
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Datos Personales del Solicitante
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Primer Nombre *
          </label>
          <input
            type="text"
            value={nuevoForm.primer_nombre}
            onChange={(e) =>
              setNuevoForm({
                ...nuevoForm,
                primer_nombre: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''),
              })
            }
            placeholder="Ej: Carlos"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Segundo Nombre
          </label>
          <input
            type="text"
            value={nuevoForm.segundo_nombre}
            onChange={(e) =>
              setNuevoForm({
                ...nuevoForm,
                segundo_nombre: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''),
              })
            }
            placeholder="Ej: Alberto"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Primer Apellido *
          </label>
          <input
            type="text"
            value={nuevoForm.primer_apellido}
            onChange={(e) =>
              setNuevoForm({
                ...nuevoForm,
                primer_apellido: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''),
              })
            }
            placeholder="Ej: Gómez"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Segundo Apellido
          </label>
          <input
            type="text"
            value={nuevoForm.segundo_apellido}
            onChange={(e) =>
              setNuevoForm({
                ...nuevoForm,
                segundo_apellido: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''),
              })
            }
            placeholder="Ej: Méndez"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Teléfono Móvil *
            </label>
            <span className="text-[11px] font-mono text-slate-400 font-semibold">
              {nuevoForm.telefono.length}/8 dígitos
            </span>
          </div>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input
              type="tel"
              maxLength={8}
              value={nuevoForm.telefono}
              onChange={(e) =>
                setNuevoForm({
                  ...nuevoForm,
                  telefono: e.target.value.replace(/\D/g, '').slice(0, 8),
                })
              }
              placeholder="Ej: 55551234"
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Fecha de Nacimiento (Mayoría de Edad) *
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <select
                value={birthDay}
                onChange={(e) => handleDatePartChange('day', e.target.value)}
                className="w-full px-2 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs cursor-pointer"
                required
              >
                <option value="">Día</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={birthMonth}
                onChange={(e) => handleDatePartChange('month', e.target.value)}
                className="w-full px-1.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs cursor-pointer"
                required
              >
                <option value="">Mes</option>
                {MONTHS.map((m) => (
                  <option key={m.val} value={m.val}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={birthYear}
                onChange={(e) => handleDatePartChange('year', e.target.value)}
                className="w-full px-2 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs cursor-pointer"
                required
              >
                <option value="">Año</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Indicador de cálculo dinámico de edad */}
          {ageCalculation && (
            <div
              className={`mt-2 p-2 rounded-xl text-xs font-medium flex items-start space-x-1.5 border transition-all ${
                ageCalculation.valid
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              {ageCalculation.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-tight">{ageCalculation.message}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
          Dirección Residencial
        </label>
        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            value={nuevoForm.direccion}
            onChange={(e) => setNuevoForm({ ...nuevoForm, direccion: e.target.value })}
            placeholder="Ej: 4ta Calle 8-20 Zona 1, Ciudad de Guatemala"
            className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Correo Electrónico *
          </label>
          <div className="relative">
            <Mail className={`w-4 h-4 absolute left-3 top-3.5 ${
              emailStatus.disponible === false ? 'text-red-500' :
              emailStatus.disponible === true ? 'text-emerald-600' : 'text-slate-400'
            }`} />
            <input
              type="email"
              required
              value={nuevoForm.email}
              onChange={(e) => setNuevoForm({ ...nuevoForm, email: e.target.value })}
              placeholder="correo@ejemplo.com"
              className={`w-full pl-9 pr-10 py-2.5 bg-white border rounded-xl text-slate-900 text-sm focus:outline-none shadow-2xs transition-colors ${
                emailStatus.disponible === false
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500 bg-red-50/20 text-red-900'
                  : emailStatus.disponible === true
                  ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-600 bg-emerald-50/20'
                  : 'border-slate-300 focus:ring-2 focus:ring-emerald-600'
              }`}
            />
            {emailStatus.checking && (
              <div className="absolute right-3 top-3.5">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              </div>
            )}
            {!emailStatus.checking && emailStatus.disponible === true && (
              <div className="absolute right-3 top-3.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            )}
            {!emailStatus.checking && emailStatus.disponible === false && (
              <div className="absolute right-3 top-3.5">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
            )}
          </div>
          {emailStatus.message && (
            <p className={`text-xs mt-1.5 flex items-center space-x-1 font-medium ${
              emailStatus.disponible === false ? 'text-red-600' :
              emailStatus.disponible === true ? 'text-emerald-700' : 'text-slate-500'
            }`}>
              <span>{emailStatus.message}</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
            Depósito Inicial Estimado (Q)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-2.5 font-bold text-emerald-700 text-sm">Q</span>
            <input
              type="number"
              step="0.01"
              min="100.00"
              value={nuevoForm.monto_estimado}
              onChange={(e) => setNuevoForm({ ...nuevoForm, monto_estimado: e.target.value })}
              className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-between items-center border-t border-slate-100">
        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a DPI</span>
        </button>
        <button
          type="submit"
          disabled={loading || emailStatus.disponible === false || emailStatus.checking}
          className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generando Solicitud...</span>
            </>
          ) : (
            <>
              <span>Emitir Solicitud y Número de Caso</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default AgencyApplicationForm;
