import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Wallet,
  CreditCard,
  Send,
  TrendingUp,
  ShieldCheck,
  Compass,
  Info,
} from 'lucide-react';

export const AssociateOnboardingTour = ({
  user,
  activeTab,
  setActiveTab,
  forceOpen = false,
  onCloseTour = () => {},
}) => {
  const storageKey = `coop_tour_dismissed_${user?.codigo_corporativo || user?.id_usuario || 'default'}`;

  const [isOpen, setIsOpen] = useState(false);
  const [modalMode, setModalMode] = useState('welcome'); // 'welcome' | 'tour' | 'completed'
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Pasos del recorrido guiado
  const TOUR_STEPS = [
    {
      stepNumber: 1,
      title: 'Resumen Financiero y Aportaciones',
      badge: 'Patrimonio y Membresía',
      targetTab: 'resumen',
      icon: Wallet,
      description:
        'En este panel tienes una vista panorámica de tu salud financiera en la Cooperativa. El saldo de Aportaciones representa tu patrimonio como socio copropietario, el cual genera excedentes según el ejercicio contable.',
      tip: 'Tus aportaciones de membresía son la base para acceder a tasas preferenciales y derechos de voto.',
    },
    {
      stepNumber: 2,
      title: 'Mis Cuentas y Consulta de Movimientos',
      badge: 'Trazabilidad y Estados de Cuenta',
      targetTab: 'resumen',
      icon: CreditCard,
      description:
        'Accede al detalle de tus cuentas activas (Aportaciones, Ahorro Corriente y Depósitos a Plazo). Al presionar "Ver Movimientos" puedes auditar cada depósito, retiro o acreditación de intereses en tiempo real.',
      tip: 'Puedes filtrar y revisar cada débito interbancario ACH con su respectivo identificador.',
    },
    {
      stepNumber: 3,
      title: 'Cuenta de Planilla y Traslado de Fondos',
      badge: 'Nómina y Ahorro Programado',
      targetTab: 'planilla',
      icon: Send,
      description:
        'Si tu empresa cuenta con convenio de pago de nómina, recibirás tu salario directamente en tu Cuenta de Planilla. Con el botón "Solicitar Traslado" puedes mover fondos hacia tus cuentas de ahorro o aperturar nuevas cuentas automáticamente.',
      tip: 'Automatiza tu ahorro programando traslados mensuales sin comisiones interbancarias.',
    },
    {
      stepNumber: 4,
      title: 'Productos Financieros y Créditos en Línea',
      badge: 'Simuladores Financieros',
      targetTab: 'productos',
      icon: TrendingUp,
      description:
        'Explora nuestro catálogo de productos de financiamiento. Dispones de un simulador de cuotas con amortización decreciente sobre saldos (Sistema Alemán) o cuotas niveladas fijas (Sistema Francés).',
      tip: 'Conoce con total claridad el desglose de intereses y capital antes de solicitar un crédito.',
    },
    {
      stepNumber: 5,
      title: 'Seguridad Bancaria y Control de Sesión',
      badge: 'Protección Integral',
      targetTab: 'resumen',
      icon: ShieldCheck,
      description:
        'Tu tranquilidad es lo más importante. Tu sesión cuenta con cifrado institucional. Por normativa bancaria, si sales de tu cuenta o regresas a la pantalla de login, el sistema revocará inmediatamente la sesión para evitar accesos de terceros.',
      tip: 'No compartas tus credenciales y utiliza siempre el botón oficial de Cerrar Sesión al terminar.',
    },
  ];

  // Comprobar estado en localStorage al montar o cambiar de usuario
  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === 'true';
    if (forceOpen) {
      setModalMode('welcome');
      setCurrentStep(0);
      setIsOpen(true);
    } else if (!isDismissed) {
      // Si es la primera vez o no ha sido omitido de forma permanente
      setModalMode('welcome');
      setCurrentStep(0);
      setIsOpen(true);
    }
  }, [user?.codigo_corporativo, forceOpen, storageKey]);

  const handleStartTour = () => {
    setModalMode('tour');
    setCurrentStep(0);
    if (setActiveTab && TOUR_STEPS[0].targetTab) {
      setActiveTab(TOUR_STEPS[0].targetTab);
    }
  };

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(storageKey, 'true');
    }
    setIsOpen(false);
    onCloseTour();
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      if (setActiveTab && TOUR_STEPS[next].targetTab) {
        setActiveTab(TOUR_STEPS[next].targetTab);
      }
    } else {
      setModalMode('completed');
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      if (setActiveTab && TOUR_STEPS[prev].targetTab) {
        setActiveTab(TOUR_STEPS[prev].targetTab);
      }
    }
  };

  const handleFinish = () => {
    if (dontShowAgain) {
      localStorage.setItem(storageKey, 'true');
    }
    setIsOpen(false);
    onCloseTour();
  };

  const handleCheckboxChange = (e) => {
    const checked = e.target.checked;
    setDontShowAgain(checked);
    if (checked) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStepData = TOUR_STEPS[currentStep];
  const StepIcon = currentStepData?.icon || Sparkles;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-lg shadow-lg border border-slate-200 overflow-hidden relative transition-all">
        
        {/* Botón de Cierre Superior */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-full transition-colors cursor-pointer z-10"
          title="Cerrar ventana"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ================= MODAL: BIENVENIDA INICIAL ================= */}
        {modalMode === 'welcome' && (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-brand-100 text-brand-700 rounded-lg flex items-center justify-center mx-auto">
              <Compass className="w-8 h-8 animate-pulse" />
            </div>

            <div>
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest bg-brand-50 px-3 py-1 rounded-full border border-brand-200">
                Bienvenido Asociado
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2.5 tracking-tight">
                ¡Te damos la bienvenida a tu Portal!
              </h2>
              <p className="text-sm text-slate-600 font-medium mt-2 max-w-md mx-auto leading-relaxed">
                Hola, <strong className="text-slate-800">{user?.nombre || 'estimado socio'}</strong>. Hemos preparado un recorrido guiado e interactivo de 5 pasos para que conozcas todas las herramientas y beneficios disponibles para gestionar tus cuentas.
              </p>
            </div>

            {/* Tarjetas resumen de lo que verá */}
            <div className="grid grid-cols-2 gap-2 text-left pt-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2.5">
                <Wallet className="w-5 h-5 text-brand-700 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">Aportaciones y Ahorros</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2.5">
                <Send className="w-5 h-5 text-brand-700 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">Traslados de Planilla</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2.5">
                <TrendingUp className="w-5 h-5 text-brand-700 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">Simulador de Créditos</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center space-x-2.5">
                <ShieldCheck className="w-5 h-5 text-brand-700 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">Seguridad Bancaria</span>
              </div>
            </div>

            {/* Checkbox de No volver a mostrar */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-center space-x-2">
              <input
                id="tour-dismiss-welcome"
                type="checkbox"
                checked={dontShowAgain}
                onChange={handleCheckboxChange}
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="tour-dismiss-welcome" className="text-xs text-slate-600 select-none cursor-pointer font-medium">
                No volver a mostrar este mensaje al iniciar sesión
              </label>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm transition-colors cursor-pointer"
              >
                Omitir por ahora
              </button>
              <button
                type="button"
                onClick={handleStartTour}
                className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <span>Iniciar Recorrido</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= MODAL: PASO A PASO DEL TOUR ================= */}
        {modalMode === 'tour' && (
          <div className="p-6 sm:p-8 space-y-5">
            {/* Header del paso */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center">
                  <StepIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-brand-700 uppercase tracking-wider block">
                    Paso {currentStepData.stepNumber} de {TOUR_STEPS.length} • {currentStepData.badge}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {currentStepData.title}
                  </h3>
                </div>
              </div>
            </div>

            {/* Barra de Progreso */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%`,
                }}
              />
            </div>

            {/* Contenido Principal del Paso */}
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                {currentStepData.description}
              </p>

              {/* Recuadro de Tip o Consejo de Uso */}
              <div className="p-3.5 bg-brand-50/70 border border-brand-200 rounded-lg flex items-start space-x-2.5 text-xs text-brand-900">
                <Info className="w-4 h-4 text-brand-700 shrink-0 mt-0.5" />
                <span className="leading-snug">{currentStepData.tip}</span>
              </div>
            </div>

            {/* Checkbox persistente */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <input
                  id="tour-dismiss-step"
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={handleCheckboxChange}
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="tour-dismiss-step" className="text-xs text-slate-600 select-none cursor-pointer">
                  No volver a mostrar
                </label>
              </div>

              {/* Botones Anterior / Siguiente */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="px-3.5 py-2 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-xs font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-2 rounded-md bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                >
                  <span>
                    {currentStep === TOUR_STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL: COMPLETADO ================= */}
        {modalMode === 'completed' && (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                ¡Recorrido Completado!
              </h3>
              <p className="text-sm text-slate-600 mt-2 font-medium max-w-md mx-auto leading-relaxed">
                Ahora conoces las principales capacidades de tu portal de asociado. Si en cualquier momento deseas volver a ver este recorrido, puedes presionar el botón <strong>"Recorrido Guiado"</strong> en el encabezado de tu pantalla.
              </p>
            </div>

            {/* Checkbox de No volver a mostrar */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-center space-x-2">
              <input
                id="tour-dismiss-finish"
                type="checkbox"
                checked={dontShowAgain}
                onChange={handleCheckboxChange}
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="tour-dismiss-finish" className="text-xs text-slate-600 select-none cursor-pointer font-medium">
                No volver a mostrar automáticamente este mensaje
              </label>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3 px-6 rounded-md bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm transition-all cursor-pointer"
              >
                Comenzar a Gestionar mis Cuentas
              </button>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
};

export default AssociateOnboardingTour;
