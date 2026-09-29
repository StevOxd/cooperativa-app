import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Percent, Send, ShieldCheck, Users2, Wallet } from 'lucide-react';
import { Button, Modal } from '../ui';

/** Casilla "no mostrar": se repite en cada vista del recorrido. */
const DontShowAgain = ({ id, checked, onChange }) => (
  <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer rounded border-line-input accent-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    />
    No mostrar este recorrido al iniciar sesión
  </label>
);

/**
 * Recorrido guiado del portal del asociado: bienvenida, pasos por cada
 * pestaña y cierre. Cambia de pestaña al avanzar para mostrar cada sección.
 */
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

  // Pasos del recorrido guiado (solo describen lo que el portal hace hoy)
  const TOUR_STEPS = [
    {
      stepNumber: 1,
      title: 'Sus cuentas y su saldo',
      targetTab: 'resumen',
      icon: Wallet,
      description:
        'En Resumen ve el total que tiene en la cooperativa y cada una de sus cuentas con su saldo disponible.',
      tip: 'Con «Ver movimientos» revisa depósitos, retiros y pagos, y con «Estado de cuenta» lo descarga en PDF.',
    },
    {
      stepNumber: 2,
      title: 'Traslados desde su cuenta de planilla',
      targetTab: 'planilla',
      icon: Send,
      description:
        'Su cuenta de planilla es la cuenta bancaria vinculada a su afiliación. Con «Solicitar traslado» puede pasar fondos a una cuenta de la cooperativa o abrir una cuenta nueva.',
      tip: 'Un operador revisa cada solicitud. Su estado aparece en «Mis solicitudes de traslado».',
    },
    {
      stepNumber: 3,
      title: 'Plan de pagos de sus créditos',
      targetTab: 'creditos',
      icon: Calculator,
      description:
        'Si tiene un crédito aprobado, aquí ve la cuota, la tasa y el calendario de pagos, con lo que abona a capital y a interés cada mes.',
      tip: 'Para pedir un crédito, use el «Simulador de crédito» del menú: calcula la cuota antes de enviar la solicitud.',
    },
    {
      stepNumber: 4,
      title: 'Productos de ahorro',
      targetTab: 'productos',
      icon: Percent,
      description: 'Consulte la tasa anual y el monto mínimo de apertura de cada tipo de cuenta.',
      tip: 'Para abrir una de estas cuentas, solicite un traslado y elija «Abrir una cuenta nueva».',
    },
    {
      stepNumber: 5,
      title: 'Sus beneficiarios',
      targetTab: 'beneficiarios',
      icon: Users2,
      description:
        'Designe quién recibirá los fondos de cada cuenta. En cada cuenta, los porcentajes deben sumar 100 %.',
      tip: 'Revise sus beneficiarios cuando cambie su situación familiar.',
    },
    {
      stepNumber: 6,
      title: 'Su cuenta está protegida',
      targetTab: 'resumen',
      icon: ShieldCheck,
      description:
        'La sesión se cierra sola después de 10 minutos sin actividad o si vuelve a la pantalla de inicio de sesión. Puede activar la verificación en dos pasos en el menú de su cuenta, en «Seguridad».',
      tip: 'No comparta su contraseña ni su código de verificación con nadie.',
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
  const StepIcon = currentStepData?.icon || Wallet;
  const nombre = user?.nombre || user?.nombre_completo;

  if (modalMode === 'welcome') {
    return (
      <Modal
        isOpen
        onClose={handleClose}
        lockScroll={false}
        title="Le damos la bienvenida a su portal"
        description={`${nombre ? `Hola, ${nombre}. ` : ''}En ${TOUR_STEPS.length} pasos le mostramos dónde está cada cosa.`}
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <DontShowAgain id="tour-dismiss-welcome" checked={dontShowAgain} onChange={handleCheckboxChange} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={handleClose}>Ahora no</Button>
              <Button onClick={handleStartTour}>
                Empezar recorrido
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        }
      >
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {TOUR_STEPS.map(({ stepNumber, title, icon: Icon }) => (
            <li key={stepNumber} className="flex items-center gap-2.5 text-ink-soft">
              <Icon className="w-4 h-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              {title}
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  if (modalMode === 'completed') {
    return (
      <Modal
        isOpen
        onClose={handleFinish}
        lockScroll={false}
        size="sm"
        title="Ya conoce su portal"
        description="Puede volver a ver este recorrido cuando quiera con el botón «Recorrido» del encabezado."
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <DontShowAgain id="tour-dismiss-finish" checked={dontShowAgain} onChange={handleCheckboxChange} />
            <Button onClick={handleFinish}>Ir a mi portal</Button>
          </div>
        }
      />
    );
  }

  return (
    <Modal
      isOpen
      onClose={handleClose}
      lockScroll={false}
      title={
        <span className="flex items-center gap-2.5">
          <StepIcon className="w-5 h-5 shrink-0 text-brand-700" aria-hidden="true" />
          {currentStepData.title}
        </span>
      }
      description={`Paso ${currentStepData.stepNumber} de ${TOUR_STEPS.length}`}
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DontShowAgain id="tour-dismiss-step" checked={dontShowAgain} onChange={handleCheckboxChange} />
          <div className="flex gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={handlePrev} disabled={currentStep === 0}>
              Anterior
            </Button>
            <Button onClick={handleNext}>
              {currentStep === TOUR_STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className="h-1.5 w-full rounded-sm bg-surface-sunken"
          role="progressbar"
          aria-label="Avance del recorrido"
          aria-valuemin={1}
          aria-valuemax={TOUR_STEPS.length}
          aria-valuenow={currentStep + 1}
        >
          <div
            className="h-1.5 rounded-sm bg-brand-700 transition-all"
            style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>
        <p className="text-sm text-ink-soft">{currentStepData.description}</p>
        <p className="text-sm text-ink-muted">{currentStepData.tip}</p>
      </div>
    </Modal>
  );
};

export default AssociateOnboardingTour;
