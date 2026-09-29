import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Alert } from '../components/ui';
import { Wordmark } from '../components/layout/Wordmark';
import {
  DpiLookupStep,
  BankCredentialsStep,
  BankConfigStep,
  PortalPasswordStep,
  DirectAffiliationSuccess,
  AgencyApplicationForm,
  AgencyReceiptStep,
} from '../components/affiliation';

/**
 * Afiliación en línea (pública). Dos caminos según el DPI:
 * - Cliente o colaborador del banco: se afilia en el momento, debitando su aporte inicial.
 * - Persona sin cuenta en el banco: recibe un número de caso para terminar en agencia.
 *
 * @component
 */
export const PublicAffiliationPage = () => {
  // Fases del flujo:
  // 'CONSULTAR_DPI': Pantalla de inicio con input obligatorio de CUI/DPI
  // 'EXISTENTE_AUTH_BANCO': Validación de 3 credenciales de Banca en Línea
  // 'EXISTENTE_CONFIG': Selección de cuenta bancaria y monto inicial
  // 'EXISTENTE_CREDENCIALES': Contraseña para acceso al portal y verificación de correo
  // 'EXISTENTE_EXITO': Constancia de membresía inmediata y cuenta de aportaciones
  // 'NUEVO_FORMULARIO': Formulario para personas sin registro bancario
  // 'NUEVO_CASO_EXITO': Constancia oficial con número de caso para acudir a agencia
  const [phase, setPhase] = useState('CONSULTAR_DPI');

  // Input inicial de DPI
  const [cuiInput, setCuiInput] = useState('');

  // Datos verificados del banco (Escenario 1)
  const [bancoData, setBancoData] = useState(null);
  const [selectedCuentaBancariaId, setSelectedCuentaBancariaId] = useState('');
  const [montoAportacion, setMontoAportacion] = useState('250.00');
  const [credenciales, setCredenciales] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Credenciales de Banca en Línea para validación (Paso intermedio Escenario 1)
  const [bancoCreds, setBancoCreds] = useState({
    nombre_usuario: '',
    codigo: '',
    password: '',
  });
  const [bancoAuthLoading, setBancoAuthLoading] = useState(false);

  // Datos del formulario para personas nuevas (Escenario 2)
  const [nuevoForm, setNuevoForm] = useState({
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    telefono: '',
    direccion: '',
    fecha_nacimiento: '',
    email: '',
    monto_estimado: '250.00',
  });

  // Resultados finales
  const [afiliacionExitosa, setAfiliacionExitosa] = useState(null);
  const [casoGenerado, setCasoGenerado] = useState(null);

  // Estados de retroalimentación
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selectores de fecha de nacimiento (Día / Mes / Año)
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');

  const currentYear = new Date().getFullYear();
  const DAYS = useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')), []);
  const MONTHS = useMemo(
    () => [
      { val: '01', name: '01 - Enero' },
      { val: '02', name: '02 - Febrero' },
      { val: '03', name: '03 - Marzo' },
      { val: '04', name: '04 - Abril' },
      { val: '05', name: '05 - Mayo' },
      { val: '06', name: '06 - Junio' },
      { val: '07', name: '07 - Julio' },
      { val: '08', name: '08 - Agosto' },
      { val: '09', name: '09 - Septiembre' },
      { val: '10', name: '10 - Octubre' },
      { val: '11', name: '11 - Noviembre' },
      { val: '12', name: '12 - Diciembre' },
    ],
    []
  );
  const YEARS = useMemo(
    () => Array.from({ length: 85 }, (_, i) => String(currentYear - 18 - i)),
    [currentYear]
  );

  const handleDatePartChange = (part, val) => {
    let d = part === 'day' ? val : birthDay;
    let m = part === 'month' ? val : birthMonth;
    let y = part === 'year' ? val : birthYear;

    if (part === 'day') setBirthDay(val);
    if (part === 'month') setBirthMonth(val);
    if (part === 'year') setBirthYear(val);

    if (d && m && y) {
      const formatted = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      setNuevoForm((prev) => ({ ...prev, fecha_nacimiento: formatted }));
    } else {
      setNuevoForm((prev) => ({ ...prev, fecha_nacimiento: '' }));
    }
  };

  const calculateAgeInfo = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return { valid: false, message: 'Fecha incompleta o no válida.' };
    }
    const [y, m, d] = parts;
    const today = new Date();
    const birthDate = new Date(y, m - 1, d);
    if (birthDate.getFullYear() !== y || birthDate.getMonth() !== m - 1 || birthDate.getDate() !== d) {
      return { valid: false, message: 'La combinación de día y mes no existe en el calendario.' };
    }
    if (birthDate > today) {
      return { valid: false, message: 'La fecha de nacimiento no puede ser en el futuro.' };
    }
    let age = today.getFullYear() - y;
    const mDiff = today.getMonth() + 1 - m;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) {
      age--;
    }
    if (age < 18) {
      return {
        valid: false,
        age,
        message: `Edad calculada: ${age >= 0 ? age : 0} años. Debe tener al menos 18 años cumplidos para afiliarse (nacidos en ${today.getFullYear() - 18} o antes).`,
      };
    }
    if (age > 105) {
      return {
        valid: false,
        age,
        message: `Edad calculada: ${age} años. La fecha ingresada excede el límite máximo permitido.`,
      };
    }
    return {
      valid: true,
      age,
      message: `${age} años cumplidos (Mayor de edad apto para membresía)`,
    };
  };

  const ageCalculation = calculateAgeInfo(nuevoForm.fecha_nacimiento);

  // Estados de validación en tiempo real para disponibilidad de correo electrónico
  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    disponible: null,
    message: '',
  });

  const [credEmailStatus, setCredEmailStatus] = useState({
    checking: false,
    disponible: null,
    message: '',
  });

  // Verificación en tiempo real del correo para nuevo solicitante (Escenario 2)
  useEffect(() => {
    const rawEmail = nuevoForm.email ? nuevoForm.email.trim() : '';
    if (!rawEmail) {
      setEmailStatus({ checking: false, disponible: null, message: '' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setEmailStatus({
        checking: false,
        disponible: false,
        message: 'Formato de correo electrónico no válido.',
      });
      return;
    }

    setEmailStatus({ checking: true, disponible: null, message: 'Verificando disponibilidad...' });

    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/afiliacion/verificar-email', { email: rawEmail });
        if (res.data.disponible) {
          setEmailStatus({
            checking: false,
            disponible: true,
            message: 'Correo disponible para registro.',
          });
        } else {
          setEmailStatus({
            checking: false,
            disponible: false,
            message: res.data.message || 'Este correo electrónico ya se encuentra registrado.',
          });
        }
      } catch (err) {
        setEmailStatus({ checking: false, disponible: null, message: '' });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [nuevoForm.email]);

  // Verificación en tiempo real del correo para colaboradores/clientes del banco (Escenario 1)
  useEffect(() => {
    const rawEmail = credenciales.email ? credenciales.email.trim() : '';
    if (!rawEmail || phase !== 'EXISTENTE_CREDENCIALES') {
      setCredEmailStatus({ checking: false, disponible: null, message: '' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setCredEmailStatus({
        checking: false,
        disponible: false,
        message: 'Formato de correo electrónico no válido.',
      });
      return;
    }

    setCredEmailStatus({ checking: true, disponible: null, message: 'Verificando disponibilidad...' });

    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/afiliacion/verificar-email', {
          email: rawEmail,
          excluir_id_persona: bancoData?.persona?.id_persona,
        });
        if (res.data.disponible) {
          setCredEmailStatus({
            checking: false,
            disponible: true,
            message: 'Correo disponible.',
          });
        } else {
          setCredEmailStatus({
            checking: false,
            disponible: false,
            message: res.data.message || 'Este correo electrónico ya se encuentra registrado.',
          });
        }
      } catch (err) {
        setCredEmailStatus({ checking: false, disponible: null, message: '' });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [credenciales.email, phase, bancoData?.persona?.id_persona]);

  // 1. Validar DPI en la base de datos de la Corporación Bancaria
  const handleConsultarDpi = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const limpio = cuiInput.trim().replace(/\s+/g, '');
    if (limpio.length !== 13 || !/^\d+$/.test(limpio)) {
      setErrorMsg('El CUI / DPI debe contener exactamente 13 dígitos numéricos.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/afiliacion/validar-dpi', { cui_dpi: limpio });

      if (response.data?.success) {
        if (response.data.pertenece_banco) {
          setBancoData(response.data);
          setBancoCreds({
            nombre_usuario: '',
            codigo: '',
            password: '',
          });
          setPhase('EXISTENTE_AUTH_BANCO');
        } else {
          setNuevoForm((prev) => ({
            ...prev,
            primer_nombre: '',
            segundo_nombre: '',
            primer_apellido: '',
            segundo_apellido: '',
            telefono: '',
            direccion: '',
            fecha_nacimiento: '',
            email: '',
            monto_estimado: '250.00',
          }));
          setPhase('NUEVO_FORMULARIO');
        }
      } else {
        setErrorMsg(response.data?.message || 'No fue posible validar el DPI ingresado.');
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || 'Error de comunicación al consultar el sistema bancario.'
      );
    } finally {
      setLoading(false);
    }
  };

  // 1.1 Validar credenciales de Banca en Línea contra la API del Banco
  const handleValidarCredencialesBanco = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!bancoCreds.nombre_usuario.trim() || !bancoCreds.codigo.trim() || !bancoCreds.password) {
      setErrorMsg('Debe ingresar su Nombre de Usuario, Código de Cliente y Contraseña de la Banca en Línea.');
      return;
    }

    setBancoAuthLoading(true);
    try {
      const response = await api.post('/afiliacion/validar-credenciales-banco', {
        cui_dpi: cuiInput.trim().replace(/\s+/g, ''),
        nombre_usuario: bancoCreds.nombre_usuario.trim(),
        codigo: bancoCreds.codigo.trim().toUpperCase(),
        password: bancoCreds.password,
      });

      if (response.data?.success) {
        setBancoData(response.data);
        if (response.data.cuentas_bancarias && response.data.cuentas_bancarias.length > 0) {
          setSelectedCuentaBancariaId(response.data.cuentas_bancarias[0].id_cuenta_bancaria);
        }
        if (response.data.persona?.email) {
          setCredenciales((prev) => ({ ...prev, email: response.data.persona.email }));
        }
        setPhase('EXISTENTE_CONFIG');
      } else {
        setErrorMsg(response.data?.message || 'Credenciales de la Banca en Línea no válidas.');
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || 'Error al validar credenciales con la Entidad Bancaria.'
      );
    } finally {
      setBancoAuthLoading(false);
    }
  };

  // 2. Procesar Afiliación para quien ya pertenece al banco (Escenario 1)
  const handleSubmitExistente = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (credenciales.password.length < 6) {
      setErrorMsg('La contraseña de acceso debe contener al menos 6 caracteres.');
      return;
    }
    if (credenciales.password !== credenciales.confirmPassword) {
      setErrorMsg('Las contraseñas ingresadas no coinciden.');
      return;
    }

    const monto = parseFloat(montoAportacion);
    if (isNaN(monto) || monto < 100.0) {
      setErrorMsg('El monto de aportación inicial no puede ser inferior a Q100.00.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/afiliacion/procesar-existente', {
        cui_dpi: bancoData.persona.cui_dpi,
        id_cuenta_bancaria: parseInt(selectedCuentaBancariaId, 10),
        numero_cuenta_bancaria: cuentaSeleccionadaObj?.numero_cuenta_bancaria || '',
        monto_aportacion: monto,
        email: credenciales.email,
        password: credenciales.password,
      });

      if (response.data?.success) {
        setAfiliacionExitosa(response.data.data);
        setPhase('EXISTENTE_EXITO');
      } else {
        setErrorMsg(response.data?.message || 'Error al procesar la afiliación.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Error al comunicarse con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Registrar Solicitud para quien NO pertenece al banco (Escenario 2)
  const handleSubmitNuevo = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{2,50}$/;
    if (!nuevoForm.primer_nombre.trim()) {
      setErrorMsg('El primer nombre es obligatorio.');
      return;
    }
    if (!nameRegex.test(nuevoForm.primer_nombre.trim())) {
      setErrorMsg('El primer nombre únicamente puede contener letras, sin números ni caracteres especiales.');
      return;
    }
    if (!nuevoForm.primer_apellido.trim()) {
      setErrorMsg('El primer apellido es obligatorio.');
      return;
    }
    if (!nameRegex.test(nuevoForm.primer_apellido.trim())) {
      setErrorMsg('El primer apellido únicamente puede contener letras, sin números ni caracteres especiales.');
      return;
    }
    if (nuevoForm.segundo_nombre.trim() && !nameRegex.test(nuevoForm.segundo_nombre.trim())) {
      setErrorMsg('El segundo nombre únicamente puede contener letras, sin números ni caracteres especiales.');
      return;
    }
    if (nuevoForm.segundo_apellido.trim() && !nameRegex.test(nuevoForm.segundo_apellido.trim())) {
      setErrorMsg('El segundo apellido únicamente puede contener letras, sin números ni caracteres especiales.');
      return;
    }

    const cleanTel = nuevoForm.telefono.replace(/\D/g, '');
    if (cleanTel.length !== 8) {
      setErrorMsg(`El número de teléfono móvil debe contener exactamente 8 dígitos numéricos (ingresó ${cleanTel.length} dígitos).`);
      return;
    }

    if (!nuevoForm.fecha_nacimiento) {
      setErrorMsg('Debe seleccionar su fecha de nacimiento completa (día, mes y año).');
      return;
    }
    const ageInfo = calculateAgeInfo(nuevoForm.fecha_nacimiento);
    if (!ageInfo || !ageInfo.valid) {
      setErrorMsg(ageInfo ? ageInfo.message : 'La fecha de nacimiento ingresada no es válida.');
      return;
    }

    if (!nuevoForm.email || !nuevoForm.email.trim()) {
      setErrorMsg('Debe ingresar su correo electrónico.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nuevoForm.email.trim())) {
      setErrorMsg('El formato del correo electrónico ingresado no es válido (ejemplo: usuario@correo.com).');
      return;
    }

    if (emailStatus.disponible === false) {
      setErrorMsg(emailStatus.message || 'El correo electrónico ya se encuentra registrado por otro usuario. Ingrese un correo diferente.');
      return;
    }

    if (emailStatus.checking) {
      setErrorMsg('Verificando disponibilidad del correo electrónico. Por favor espere un momento...');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/afiliacion/solicitar-nuevo', {
        cui_dpi: cuiInput.trim().replace(/\s+/g, ''),
        primer_nombre: nuevoForm.primer_nombre.trim(),
        segundo_nombre: nuevoForm.segundo_nombre.trim(),
        primer_apellido: nuevoForm.primer_apellido.trim(),
        segundo_apellido: nuevoForm.segundo_apellido.trim(),
        telefono: cleanTel,
        direccion: nuevoForm.direccion.trim(),
        fecha_nacimiento: nuevoForm.fecha_nacimiento,
        email: nuevoForm.email.trim(),
        monto_estimado: parseFloat(nuevoForm.monto_estimado) || 100.0,
      });

      if (response.data?.success) {
        setCasoGenerado(response.data.data);
        setPhase('NUEVO_CASO_EXITO');
      } else {
        setErrorMsg(response.data?.message || 'No fue posible registrar su solicitud.');
      }
    } catch (err) {
      const backendError = err.response?.data?.message || err.response?.data?.error;
      setErrorMsg(backendError || 'Error de conexión al registrar la solicitud. Por favor verifique los datos ingresados.');
    } finally {
      setLoading(false);
    }
  };

  // Reiniciar búsqueda
  const handleReset = () => {
    setPhase('CONSULTAR_DPI');
    setErrorMsg('');
    setBancoData(null);
    setBancoCreds({ nombre_usuario: '', codigo: '', password: '' });
    setAfiliacionExitosa(null);
    setCasoGenerado(null);
    setBirthDay('');
    setBirthMonth('');
    setBirthYear('');
  };

  // Cuenta bancaria seleccionada actualmente
  const cuentaSeleccionadaObj = bancoData?.cuentas_bancarias?.find(
    (c) => String(c.id_cuenta_bancaria) === String(selectedCuentaBancariaId)
  );

  // Cada paso empieza arriba (en móvil el formulario anterior podía dejar la vista a media página).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/login"
            aria-label="Cooperativa: ir al inicio de sesión"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Wordmark size="sm" />
          </Link>
          <p className="text-sm text-ink-muted">
            <span className="hidden sm:inline">¿Ya es asociado? </span>
            <Link
              to="/login"
              className="font-medium text-brand-700 hover:text-brand-800 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Iniciar sesión
            </Link>
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6 print:p-0">
        <div className="mx-auto w-full max-w-2xl print:max-w-none">
          <div className="mb-6 print:hidden">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">Afiliación en línea</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Hágase asociado de la cooperativa. Solo necesita su DPI y, si es cliente del banco, su acceso a la Banca en Línea.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-white px-5 py-6 sm:px-8 sm:py-8 print:border-none print:p-0">
            {errorMsg && (
              <Alert tone="danger" className="mb-6">
                {errorMsg}
              </Alert>
            )}

            {phase === 'CONSULTAR_DPI' && (
              <DpiLookupStep
                cuiInput={cuiInput}
                setCuiInput={setCuiInput}
                handleConsultarDpi={handleConsultarDpi}
                loading={loading}
                errorMsg={errorMsg}
                setErrorMsg={setErrorMsg}
              />
            )}

            {/* Cliente del banco · paso 1: Banca en Línea */}
            {phase === 'EXISTENTE_AUTH_BANCO' && bancoData && (
              <BankCredentialsStep
                bancoData={bancoData}
                bancoCreds={bancoCreds}
                setBancoCreds={setBancoCreds}
                handleValidarCredencialesBanco={handleValidarCredencialesBanco}
                bancoAuthLoading={bancoAuthLoading}
                handleReset={handleReset}
              />
            )}

            {/* Cliente del banco · paso 2: cuenta de origen y aporte */}
            {phase === 'EXISTENTE_CONFIG' && bancoData && (
              <BankConfigStep
                bancoData={bancoData}
                selectedCuentaBancariaId={selectedCuentaBancariaId}
                setSelectedCuentaBancariaId={setSelectedCuentaBancariaId}
                montoAportacion={montoAportacion}
                setMontoAportacion={setMontoAportacion}
                cuentaSeleccionadaObj={cuentaSeleccionadaObj}
                handleReset={handleReset}
                setPhase={setPhase}
                setErrorMsg={setErrorMsg}
              />
            )}

            {/* Cliente del banco · paso 3: acceso al portal */}
            {phase === 'EXISTENTE_CREDENCIALES' && bancoData && (
              <PortalPasswordStep
                credenciales={credenciales}
                setCredenciales={setCredenciales}
                credEmailStatus={credEmailStatus}
                cuentaSeleccionadaObj={cuentaSeleccionadaObj}
                montoAportacion={montoAportacion}
                handleSubmitExistente={handleSubmitExistente}
                loading={loading}
                setPhase={setPhase}
              />
            )}

            {phase === 'EXISTENTE_EXITO' && afiliacionExitosa && (
              <DirectAffiliationSuccess afiliacionExitosa={afiliacionExitosa} />
            )}

            {/* Sin cuenta en el banco: solicitud para agencia */}
            {phase === 'NUEVO_FORMULARIO' && (
              <AgencyApplicationForm
                cuiInput={cuiInput}
                nuevoForm={nuevoForm}
                setNuevoForm={setNuevoForm}
                birthDay={birthDay}
                birthMonth={birthMonth}
                birthYear={birthYear}
                handleDatePartChange={handleDatePartChange}
                DAYS={DAYS}
                MONTHS={MONTHS}
                YEARS={YEARS}
                ageCalculation={ageCalculation}
                emailStatus={emailStatus}
                handleSubmitNuevo={handleSubmitNuevo}
                handleReset={handleReset}
                loading={loading}
              />
            )}

            {phase === 'NUEVO_CASO_EXITO' && casoGenerado && <AgencyReceiptStep casoGenerado={casoGenerado} />}
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-ink-subtle print:hidden">
        © {new Date().getFullYear()} Cooperativa
      </footer>
    </div>
  );
};

export default PublicAffiliationPage;
