import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import {
  X,
  UserPlus,
  Building2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Landmark,
  Banknote,
  KeyRound,
  ShieldCheck,
  CreditCard,
  Phone,
  Calendar,
  Mail,
  MapPin,
  Check,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';

export const NewAssociateModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    cui_dpi: '',
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    telefono: '',
    direccion: '',
    fecha_nacimiento: '',
    email: '',
    monto_aportacion: '200.00',
    metodo_pago: 'EFECTIVO_VENTANILLA',
    numero_cuenta_bancaria: '',
    crear_acceso_portal: true,
    tipo_asociado: 'EX',
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [emailStatus, setEmailStatus] = useState({ checking: false, available: null, message: '' });
  const [dpiStatus, setDpiStatus] = useState({
    checking: false,
    verified: false,
    es_empleado: false,
    tipo_asociado: 'EX',
    tipo_cliente: null,
    nombre_completo: null,
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState(null);

  // Selectores de fecha de nacimiento (Día / Mes / Año) - Estándar Portal de Afiliación
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
      setFormData((prev) => ({ ...prev, fecha_nacimiento: formatted }));
      if (fieldErrors.fecha_nacimiento) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next.fecha_nacimiento;
          return next;
        });
      }
    } else {
      setFormData((prev) => ({ ...prev, fecha_nacimiento: '' }));
    }
  };

  // Cálculo de edad exacta y validación de mayoría de edad
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
        message: `Edad: ${age >= 0 ? age : 0} años. Debe ser mayor de edad (mínimo 18 años).`,
      };
    }
    if (age > 105) {
      return {
        valid: false,
        age,
        message: `Edad: ${age} años. La fecha ingresada excede el límite permitido.`,
      };
    }
    return {
      valid: true,
      age,
      message: `${age} años cumplidos (Mayor de edad)`,
    };
  };

  const ageInfo = calculateAgeInfo(formData.fecha_nacimiento);

  // Estados para cuentas bancarias del Empleado Bancario (EB)
  const [cuentasEmpleado, setCuentasEmpleado] = useState([]);
  const [loadingCuentasBanco, setLoadingCuentasBanco] = useState(false);
  const [cuentaBancoSeleccionada, setCuentaBancoSeleccionada] = useState('');
  const [showAcreditarModal, setShowAcreditarModal] = useState(false);
  const [montoAcreditar, setMontoAcreditar] = useState('500.00');
  const [acreditando, setAcreditando] = useState(false);
  const [acreditarSuccessMsg, setAcreditarSuccessMsg] = useState('');
  const [acreditarErrorMsg, setAcreditarErrorMsg] = useState('');

  // Consulta de cuentas del empleado y verificación automática de DPI en la Entidad Bancaria
  const fetchCuentasYVerificarDpi = async (cui) => {
    const cleanCui = cui?.trim().replace(/\D/g, '');
    if (!cleanCui || cleanCui.length !== 13) {
      setCuentasEmpleado([]);
      setCuentaBancoSeleccionada('');
      setShowAcreditarModal(false);
      setDpiStatus({
        checking: false,
        verified: false,
        es_empleado: false,
        tipo_asociado: 'EX',
        tipo_cliente: null,
        nombre_completo: null,
        message: '',
      });
      setFormData((prev) => ({ ...prev, tipo_asociado: 'EX', numero_cuenta_bancaria: '' }));
      return;
    }

    setDpiStatus((prev) => ({
      ...prev,
      checking: true,
      message: 'Consultando datos de identidad en Core Banking...',
    }));
    setLoadingCuentasBanco(true);

    try {
      const res = await api.get(`/banco-externo/cuentas-cliente/${cleanCui}`);
      if (res.data?.success) {
        if (res.data.ya_registrado_cooperativa) {
          const errMsg = `El CUI / DPI ya se encuentra registrado en el padrón de asociados de la Cooperativa (${res.data.asociado_existente?.codigo_asociado || 'Asociado Activo'}).`;
          setFieldErrors((prev) => ({ ...prev, cui_dpi: errMsg }));
          setDpiStatus({
            checking: false,
            verified: false,
            es_empleado: res.data.es_empleado,
            tipo_asociado: res.data.tipo_asociado || 'EX',
            tipo_cliente: res.data.tipo_cliente,
            nombre_completo: res.data.cliente?.nombre_completo || null,
            message: errMsg,
            error: true,
          });
          return;
        }

        // Si no está registrado en la cooperativa, limpiar cualquier error previo de CUI
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next.cui_dpi;
          return next;
        });

        const esEmpleado = Boolean(res.data.es_empleado);
        const tipoAsoc = esEmpleado ? 'EB' : 'EX';
        const cuentas = Array.isArray(res.data.data) ? res.data.data : [];

        setFormData((prev) => ({
          ...prev,
          tipo_asociado: tipoAsoc,
          numero_cuenta_bancaria: esEmpleado && cuentas.length > 0 ? cuentas[0].numero_cuenta_bancaria : '',
        }));

        if (esEmpleado) {
          setCuentasEmpleado(cuentas);
          if (cuentas.length > 0) {
            setCuentaBancoSeleccionada(cuentas[0].numero_cuenta_bancaria);
          } else {
            setCuentaBancoSeleccionada('');
          }
        } else {
          setCuentasEmpleado([]);
          setCuentaBancoSeleccionada('');
          setShowAcreditarModal(false);
        }

        setDpiStatus({
          checking: false,
          verified: true,
          es_empleado: esEmpleado,
          tipo_asociado: tipoAsoc,
          tipo_cliente: res.data.tipo_cliente,
          nombre_completo: res.data.cliente?.nombre_completo || null,
          message: esEmpleado
            ? 'Colaborador Bancario identificado en Core Banking (Planilla Corporativa).'
            : 'Persona identificada como Afiliado Externo / Ajeno al Banco.',
          error: false,
        });

        // Autocompletar nombres si el usuario no los ha digitado aún
        if (res.data.cliente?.nombre_completo) {
          const parts = res.data.cliente.nombre_completo.trim().split(/\s+/);
          setFormData((prev) => ({
            ...prev,
            primer_nombre: prev.primer_nombre || parts[0] || '',
            segundo_nombre: prev.segundo_nombre || (parts.length > 2 ? parts[1] : ''),
            primer_apellido: prev.primer_apellido || (parts.length >= 2 ? parts[parts.length - (parts.length > 3 ? 2 : 1)] : ''),
            segundo_apellido: prev.segundo_apellido || (parts.length > 3 ? parts[parts.length - 1] : ''),
          }));
        }
      } else {
        setDpiStatus({
          checking: false,
          verified: true,
          es_empleado: false,
          tipo_asociado: 'EX',
          tipo_cliente: 'NO_REGISTRADO',
          nombre_completo: null,
          message: 'Persona identificada como Afiliado Externo / Ajeno al Banco.',
          error: false,
        });
        setFormData((prev) => ({ ...prev, tipo_asociado: 'EX', numero_cuenta_bancaria: '' }));
        setCuentasEmpleado([]);
        setCuentaBancoSeleccionada('');
      }
    } catch (err) {
      console.error('Error al verificar DPI en Core Banking:', err);
      setDpiStatus({
        checking: false,
        verified: true,
        es_empleado: false,
        tipo_asociado: 'EX',
        tipo_cliente: 'DESCONOCIDO',
        nombre_completo: null,
        message: 'Afiliado Externo (Sin vinculación bancaria previa).',
        error: false,
      });
      setFormData((prev) => ({ ...prev, tipo_asociado: 'EX', numero_cuenta_bancaria: '' }));
      setCuentasEmpleado([]);
      setCuentaBancoSeleccionada('');
    } finally {
      setLoadingCuentasBanco(false);
    }
  };

  const fetchCuentasEmpleado = fetchCuentasYVerificarDpi;

  // Consultar cuentas bancarias y validar tipo automáticamente al ingresar 13 dígitos de CUI/DPI
  useEffect(() => {
    const cleanCui = formData.cui_dpi?.trim().replace(/\D/g, '');
    if (cleanCui && cleanCui.length === 13) {
      fetchCuentasYVerificarDpi(cleanCui);
    } else {
      setCuentasEmpleado([]);
      setCuentaBancoSeleccionada('');
      setShowAcreditarModal(false);
      setDpiStatus({
        checking: false,
        verified: false,
        es_empleado: false,
        tipo_asociado: 'EX',
        tipo_cliente: null,
        nombre_completo: null,
        message: '',
      });
      setFormData((prev) => ({ ...prev, tipo_asociado: 'EX', numero_cuenta_bancaria: '' }));
    }
  }, [formData.cui_dpi]);

  // Acreditar o depositar saldo a la cuenta bancaria del empleado
  const handleAcreditarFondos = async () => {
    if (!cuentaBancoSeleccionada) {
      setAcreditarErrorMsg('Seleccione la cuenta bancaria a acreditar.');
      return;
    }
    const monto = parseFloat(montoAcreditar);
    if (isNaN(monto) || monto <= 0) {
      setAcreditarErrorMsg('Ingrese un monto válido mayor a Q0.00.');
      return;
    }

    setAcreditando(true);
    setAcreditarErrorMsg('');
    setAcreditarSuccessMsg('');
    try {
      const res = await api.post('/banco-externo/acreditar', {
        numero_cuenta: cuentaBancoSeleccionada,
        monto,
        concepto: 'Depósito en ventanilla a cuenta bancaria de colaborador',
        referencia: `DEP-VENT-${Date.now()}`,
      });

      if (res.data?.success) {
        setAcreditarSuccessMsg(`¡Se han acreditado Q${monto.toFixed(2)} exitosamente a la cuenta ${cuentaBancoSeleccionada}!`);
        await fetchCuentasEmpleado(formData.cui_dpi);
        setTimeout(() => {
          setAcreditarSuccessMsg('');
          setShowAcreditarModal(false);
        }, 2200);
      } else {
        setAcreditarErrorMsg(res.data?.message || 'Error al acreditar fondos en el banco.');
      }
    } catch (err) {
      setAcreditarErrorMsg(err.response?.data?.message || 'Error al conectar con la entidad bancaria.');
    } finally {
      setAcreditando(false);
    }
  };

  // Aperturar cuenta en el banco para el colaborador si no tuviese cuentas activas
  const handleAperturarCuentaBanco = async () => {
    if (!formData.cui_dpi || formData.cui_dpi.length !== 13 || !formData.primer_nombre) {
      setErrorMsg('Complete CUI (13 dígitos) y Nombres antes de aperturar la cuenta bancaria.');
      return;
    }
    setLoadingCuentasBanco(true);
    try {
      const res = await api.post('/banco-externo/aperturar', {
        cui_dpi: formData.cui_dpi,
        primer_nombre: formData.primer_nombre,
        segundo_nombre: formData.segundo_nombre,
        primer_apellido: formData.primer_apellido,
        segundo_apellido: formData.segundo_apellido,
        telefono: formData.telefono,
        direccion: formData.direccion,
        email: formData.email,
        fecha_nacimiento: formData.fecha_nacimiento,
        tipo_cuenta: 'MONETARIA',
        monto_inicial: 0.00,
      });

      if (res.data?.success) {
        await fetchCuentasEmpleado(formData.cui_dpi);
      }
    } catch (err) {
      console.error('Error al aperturar cuenta en banco:', err);
    } finally {
      setLoadingCuentasBanco(false);
    }
  };

  // Verificación en tiempo real de disponibilidad de correo electrónico
  const checkEmailAvailability = async (emailToVerify) => {
    const cleanEmail = emailToVerify?.trim().toLowerCase();
    if (!cleanEmail) {
      setEmailStatus({ checking: false, available: null, message: '' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setEmailStatus({ checking: false, available: false, message: 'Formato de correo inválido.' });
      return;
    }

    setEmailStatus({ checking: true, available: null, message: 'Verificando...' });
    try {
      const res = await api.get(`/afiliacion/verificar-email?email=${encodeURIComponent(cleanEmail)}`);
      if (res.data?.success) {
        if (res.data.disponible) {
          setEmailStatus({ checking: false, available: true, message: 'Correo disponible para registro.' });
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.email;
            return next;
          });
        } else {
          const msg = res.data.message || 'El correo electrónico ya se encuentra registrado.';
          setEmailStatus({
            checking: false,
            available: false,
            message: msg,
          });
          setFieldErrors((prev) => ({ ...prev, email: msg }));
        }
      }
    } catch (err) {
      console.error('Error al verificar email:', err);
      setEmailStatus({ checking: false, available: null, message: '' });
    }
  };

  // Debounce para chequeo automático de email
  useEffect(() => {
    if (!formData.email || !formData.email.includes('@')) {
      setEmailStatus({ checking: false, available: null, message: '' });
      return;
    }
    const timer = setTimeout(() => {
      checkEmailAvailability(formData.email);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.email]);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setFieldErrors({});
      setEmailStatus({ checking: false, available: null, message: '' });
      setDpiStatus({
        checking: false,
        verified: false,
        es_empleado: false,
        tipo_asociado: 'EX',
        tipo_cliente: null,
        nombre_completo: null,
        message: '',
      });
      setSuccessData(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (errorMsg) setErrorMsg('');
  };

  const handleResetForm = () => {
    setFormData({
      cui_dpi: '',
      primer_nombre: '',
      segundo_nombre: '',
      primer_apellido: '',
      segundo_apellido: '',
      telefono: '',
      direccion: '',
      fecha_nacimiento: '',
      email: '',
      monto_aportacion: '200.00',
      metodo_pago: 'EFECTIVO_VENTANILLA',
      numero_cuenta_bancaria: '',
      crear_acceso_portal: true,
      tipo_asociado: 'EX',
    });
    setBirthDay('');
    setBirthMonth('');
    setBirthYear('');
    setFieldErrors({});
    setEmailStatus({ checking: false, available: null, message: '' });
    setDpiStatus({
      checking: false,
      verified: false,
      es_empleado: false,
      tipo_asociado: 'EX',
      tipo_cliente: null,
      nombre_completo: null,
      message: '',
    });
    setCuentasEmpleado([]);
    setShowAcreditarModal(false);
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const errors = {};

    // 1. Validar CUI / DPI (13 dígitos numéricos)
    const cui = formData.cui_dpi.trim().replace(/\D/g, '');
    if (cui.length !== 13) {
      errors.cui_dpi = 'El CUI / DPI debe tener exactamente 13 dígitos numéricos.';
    }

    // 2. Validar Nombres y Apellidos
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!formData.primer_nombre.trim() || !nameRegex.test(formData.primer_nombre.trim()) || formData.primer_nombre.trim().length < 2) {
      errors.primer_nombre = 'El primer nombre es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).';
    }
    if (formData.segundo_nombre.trim() && !nameRegex.test(formData.segundo_nombre.trim())) {
      errors.segundo_nombre = 'El segundo nombre solo puede contener letras y espacios.';
    }
    if (!formData.primer_apellido.trim() || !nameRegex.test(formData.primer_apellido.trim()) || formData.primer_apellido.trim().length < 2) {
      errors.primer_apellido = 'El primer apellido es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).';
    }
    if (formData.segundo_apellido.trim() && !nameRegex.test(formData.segundo_apellido.trim())) {
      errors.segundo_apellido = 'El segundo apellido solo puede contener letras y espacios.';
    }

    // 3. Validar Teléfono (8 dígitos numéricos)
    const tel = formData.telefono.trim().replace(/\D/g, '');
    if (tel.length !== 8) {
      errors.telefono = 'El teléfono debe contener exactamente 8 dígitos numéricos.';
    }

    // 4. Validar Fecha de Nacimiento (Mayor de edad)
    const ageResult = calculateAgeInfo(formData.fecha_nacimiento);
    if (!formData.fecha_nacimiento || !ageResult || !ageResult.valid) {
      errors.fecha_nacimiento = ageResult?.message || 'Debe ser mayor de edad (mínimo 18 años cumplidos).';
    }

    // 5. Validar Correo Electrónico
    const cleanEmail = formData.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      errors.email = 'Ingrese un correo electrónico válido.';
    } else if (emailStatus.available === false) {
      errors.email = emailStatus.message || 'El correo electrónico ya se encuentra registrado.';
    }

    // 6. Validar Monto
    const monto = parseFloat(formData.monto_aportacion);
    if (isNaN(monto) || monto < 100.00) {
      errors.monto_aportacion = 'La aportación inicial no puede ser inferior a Q100.00.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMsg('Por favor corrija los campos requeridos con formato inválido.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        cui_dpi: cui,
        primer_nombre: formData.primer_nombre.trim(),
        segundo_nombre: formData.segundo_nombre.trim() || undefined,
        primer_apellido: formData.primer_apellido.trim(),
        segundo_apellido: formData.segundo_apellido.trim() || undefined,
        telefono: tel,
        direccion: formData.direccion.trim() || undefined,
        fecha_nacimiento: formData.fecha_nacimiento,
        email: cleanEmail,
        monto_aportacion: monto,
        metodo_pago: 'EFECTIVO_VENTANILLA',
        numero_cuenta_bancaria: formData.tipo_asociado === 'EB' ? cuentaBancoSeleccionada : undefined,
        crear_acceso_portal: formData.crear_acceso_portal,
        tipo_asociado: formData.tipo_asociado || 'EX',
      };

      const res = await api.post('/admin/asociados/presencial', payload);

      if (res.data?.success) {
        setSuccessData(res.data.data);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'Error al procesar afiliación.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error al conectar con el servidor.';
      setErrorMsg(msg);
      if (msg.toLowerCase().includes('correo') || msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
        setEmailStatus({ checking: false, available: false, message: msg });
      } else if (msg.toLowerCase().includes('cui') || msg.toLowerCase().includes('dpi')) {
        setFieldErrors((prev) => ({ ...prev, cui_dpi: msg }));
      } else if (msg.toLowerCase().includes('teléfono') || msg.toLowerCase().includes('telefono')) {
        setFieldErrors((prev) => ({ ...prev, telefono: msg }));
      } else if (msg.toLowerCase().includes('edad') || msg.toLowerCase().includes('nacimiento')) {
        setFieldErrors((prev) => ({ ...prev, fecha_nacimiento: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-associate-modal-title"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="new-associate-modal-title" className="text-base font-bold text-slate-800">
                Formulario 1: Ficha de Afiliación Presencial
              </h3>
              <p className="text-xs text-slate-500">
                Registro de nuevo asociado en ventanilla y apertura de aportaciones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Error dentro del Modal */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div className="text-xs font-semibold">{errorMsg}</div>
          </div>
        )}

        {/* Vista de Éxito */}
        {successData ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">¡Asociado Afiliado Exitosamente!</h4>
              <p className="text-xs text-slate-600 mt-1">
                Se ha generado el expediente y la cuenta de Aportaciones Ordinarias.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Código de Cliente:</span>
                <span className="font-bold text-emerald-700 font-mono text-sm">{successData.codigo_corporativo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nombre Titular:</span>
                <span className="font-semibold text-slate-800">{successData.nombre_completo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tipo de Asociado:</span>
                <span className="font-semibold text-slate-700">
                  {successData.tipo_asociado === 'EB' ? 'Empleado Bancario (EB)' : 'Ajeno / Externo (EX)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cuenta de Aportaciones:</span>
                <span className="font-mono font-bold text-slate-800">{successData.cuenta_ahorro || successData.cuenta_aportaciones}</span>
              </div>
              {successData.cuenta_bancaria_creada && (
                <div className="flex justify-between items-center p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="text-emerald-800 font-medium">Cuenta de Ahorro Bancaria Creada:</span>
                  <span className="font-mono font-bold text-emerald-700">{successData.cuenta_bancaria_creada}</span>
                </div>
              )}
              {successData.numero_cuenta_bancaria_asociada && (
                <div className="flex justify-between items-center p-2 bg-slate-100 rounded-lg border border-slate-200">
                  <span className="text-slate-700 font-medium">Cuenta Bancaria Vinculada:</span>
                  <span className="font-mono font-bold text-slate-800">{successData.numero_cuenta_bancaria_asociada}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Depósito Inicial en Ventanilla:</span>
                <span className="font-bold text-emerald-600">Q{parseFloat(successData.saldo_inicial).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Método de Recepción:</span>
                <span className="font-medium text-slate-700">Efectivo en Ventanilla</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Cerrar y Actualizar Padrón
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Sección: Datos Personales */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  1. Datos de Identificación Personal
                </h4>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-semibold text-slate-600">Tipo de Afiliado:</span>
                  {dpiStatus.checking ? (
                    <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-[11px] font-medium">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Consultando DPI...
                    </span>
                  ) : dpiStatus.verified ? (
                    formData.tipo_asociado === 'EB' ? (
                      <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-md text-[11px] font-bold">
                        <ShieldCheck className="w-3 h-3 mr-1 text-amber-600" />
                        Empleado Bancario (EB-X)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-md text-[11px] font-bold">
                        <Check className="w-3 h-3 mr-1 text-emerald-600" />
                        Ajeno / Externo (EX-X)
                      </span>
                    )
                  ) : (
                    <span
                      className="inline-flex items-center px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-md text-[11px] font-medium"
                      title="Ingrese los 13 dígitos del DPI para clasificar automáticamente"
                    >
                      Detección automática por DPI
                    </span>
                  )}
                </div>
              </div>

              {/* Fila 1: CUI, Primer Nombre, Segundo Nombre */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">CUI / DPI *</label>
                    <span
                      className={`text-[11px] font-mono font-semibold ${
                        formData.cui_dpi?.length === 13 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {formData.cui_dpi?.length || 0}/13
                    </span>
                  </div>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      name="cui_dpi"
                      inputMode="numeric"
                      maxLength={13}
                      value={formData.cui_dpi}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                        setFormData((prev) => ({ ...prev, cui_dpi: val }));
                        if (fieldErrors.cui_dpi) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.cui_dpi;
                            return next;
                          });
                        }
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="13 dígitos numéricos"
                      className={`w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs font-mono ${
                        formData.cui_dpi?.length === 13
                          ? dpiStatus.verified && formData.tipo_asociado === 'EB'
                            ? 'border-amber-400 focus:border-amber-500'
                            : 'border-emerald-400 focus:border-emerald-500'
                          : fieldErrors.cui_dpi
                          ? 'border-red-400 bg-red-50/20'
                          : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {fieldErrors.cui_dpi ? (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.cui_dpi}</p>
                  ) : dpiStatus.checking ? (
                    <p className="text-[10px] text-blue-600 font-medium mt-1 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Verificando en Core Banking...
                    </p>
                  ) : dpiStatus.verified && dpiStatus.message ? (
                    <p
                      className={`text-[10px] font-medium mt-1 ${
                        formData.tipo_asociado === 'EB' ? 'text-amber-700 font-semibold' : 'text-emerald-700'
                      }`}
                    >
                      ✓ {dpiStatus.message}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Sin guiones ni espacios.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Primer Nombre *</label>
                  </div>
                  <input
                    type="text"
                    name="primer_nombre"
                    value={formData.primer_nombre}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                      setFormData((prev) => ({ ...prev, primer_nombre: val }));
                      if (fieldErrors.primer_nombre) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.primer_nombre;
                          return next;
                        });
                      }
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Ej: Juan"
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs ${
                      fieldErrors.primer_nombre ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                    }`}
                    required
                  />
                  {fieldErrors.primer_nombre && (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.primer_nombre}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Segundo Nombre</label>
                  </div>
                  <input
                    type="text"
                    name="segundo_nombre"
                    value={formData.segundo_nombre}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                      setFormData((prev) => ({ ...prev, segundo_nombre: val }));
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Ej: José"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs"
                  />
                </div>
              </div>

              {/* Fila 2: Apellidos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Primer Apellido *</label>
                  </div>
                  <input
                    type="text"
                    name="primer_apellido"
                    value={formData.primer_apellido}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                      setFormData((prev) => ({ ...prev, primer_apellido: val }));
                      if (fieldErrors.primer_apellido) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.primer_apellido;
                          return next;
                        });
                      }
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Ej: Pérez"
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs ${
                      fieldErrors.primer_apellido ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                    }`}
                    required
                  />
                  {fieldErrors.primer_apellido && (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.primer_apellido}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Segundo Apellido</label>
                  </div>
                  <input
                    type="text"
                    name="segundo_apellido"
                    value={formData.segundo_apellido}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                      setFormData((prev) => ({ ...prev, segundo_apellido: val }));
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Ej: Gómez"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs"
                  />
                </div>
              </div>

              {/* Fila 3: Teléfono y Correo Electrónico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Teléfono Móvil *</label>
                    <span
                      className={`text-[11px] font-mono font-semibold ${
                        formData.telefono?.length === 8 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {formData.telefono?.length || 0}/8 dígitos
                    </span>
                  </div>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      name="telefono"
                      value={formData.telefono}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                        setFormData((prev) => ({ ...prev, telefono: val }));
                        if (fieldErrors.telefono) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.telefono;
                            return next;
                          });
                        }
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Ej: 55551234"
                      className={`w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs font-mono ${
                        formData.telefono?.length === 8
                          ? 'border-emerald-400 focus:border-emerald-500'
                          : fieldErrors.telefono
                          ? 'border-red-400 bg-red-50/20'
                          : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {fieldErrors.telefono ? (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.telefono}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">8 dígitos sin guiones.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Correo Electrónico *</label>
                    {emailStatus.checking && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
                      </span>
                    )}
                    {!emailStatus.checking && emailStatus.available === true && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                        ✓ Disponible
                      </span>
                    )}
                    {!emailStatus.checking && emailStatus.available === false && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                        ✕ Ya registrado
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/\s+/g, '');
                        setFormData((prev) => ({ ...prev, email: val }));
                        if (fieldErrors.email) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.email;
                            return next;
                          });
                        }
                        setEmailStatus({ checking: false, available: null, message: '' });
                        if (errorMsg) setErrorMsg('');
                      }}
                      onBlur={() => checkEmailAvailability(formData.email)}
                      placeholder="correo@ejemplo.com"
                      className={`w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs ${
                        emailStatus.available === true
                          ? 'border-emerald-400 focus:border-emerald-500'
                          : emailStatus.available === false || fieldErrors.email
                          ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                          : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {emailStatus.available === false ? (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{emailStatus.message}</p>
                  ) : fieldErrors.email ? (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.email}</p>
                  ) : emailStatus.available === true ? (
                    <p className="text-[10px] text-emerald-700 font-medium mt-1">{emailStatus.message}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Se enviará contraseña temporal.</p>
                  )}
                </div>
              </div>

              {/* Fila 4: Fecha de Nacimiento (Selectores Día, Mes, Año - Estilo Portal de Afiliación) */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Fecha de Nacimiento (Mayoría de Edad) *
                  </label>
                  {ageInfo && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ageInfo.valid
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {ageInfo.valid ? `✓ ${ageInfo.age} años (Mayor de edad)` : 'Menor de edad'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <select
                      value={birthDay}
                      onChange={(e) => handleDatePartChange('day', e.target.value)}
                      className={`w-full px-2.5 py-2 bg-slate-50 border rounded-lg text-slate-900 text-xs font-medium focus:ring-2 focus:ring-emerald-600 cursor-pointer ${
                        fieldErrors.fecha_nacimiento ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                      }`}
                      required
                    >
                      <option value="">Día</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      value={birthMonth}
                      onChange={(e) => handleDatePartChange('month', e.target.value)}
                      className={`w-full px-2.5 py-2 bg-slate-50 border rounded-lg text-slate-900 text-xs font-medium focus:ring-2 focus:ring-emerald-600 cursor-pointer ${
                        fieldErrors.fecha_nacimiento ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                      }`}
                      required
                    >
                      <option value="">Mes</option>
                      {MONTHS.map((m) => (
                        <option key={m.val} value={m.val}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      value={birthYear}
                      onChange={(e) => handleDatePartChange('year', e.target.value)}
                      className={`w-full px-2.5 py-2 bg-slate-50 border rounded-lg text-slate-900 text-xs font-medium focus:ring-2 focus:ring-emerald-600 cursor-pointer ${
                        fieldErrors.fecha_nacimiento ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                      }`}
                      required
                    >
                      <option value="">Año</option>
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-1">
                  {ageInfo ? (
                    <p
                      className={`text-[10px] font-medium ${
                        ageInfo.valid ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {ageInfo.message}
                    </p>
                  ) : fieldErrors.fecha_nacimiento ? (
                    <p className="text-[10px] text-red-600 font-medium">{fieldErrors.fecha_nacimiento}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400">Requerido: 18+ años cumplidos para membresía.</p>
                  )}
                </div>
              </div>

              {/* Fila 5: Dirección */}
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección Domiciliar</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    name="direccion"
                    value={formData.direccion}
                    onChange={handleChange}
                    placeholder="Calle, Avenida, Zona, Municipio"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-emerald-600 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Sección: Fondeo Inicial y Vinculación Bancaria */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  2. Fondeo Inicial y Vinculación Bancaria
                </h4>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                    formData.tipo_asociado === 'EB'
                      ? 'text-amber-800 bg-amber-50 border-amber-200'
                      : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                  }`}
                >
                  {formData.tipo_asociado === 'EB' ? 'Colaborador Bancario (EB)' : 'Afiliado Externo (EX)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aportación Ordinaria Inicial (Mínimo Q100.00) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-emerald-700 text-xs">Q</span>
                    <input
                      type="number"
                      step="0.01"
                      min="100.00"
                      name="monto_aportacion"
                      value={formData.monto_aportacion}
                      onChange={handleChange}
                      className={`w-full pl-7 pr-3 py-2 bg-slate-50 border rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-emerald-600 text-xs ${
                        fieldErrors.monto_aportacion ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {fieldErrors.monto_aportacion && (
                    <p className="text-[10px] text-red-600 font-medium mt-1">{fieldErrors.monto_aportacion}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Método de Recepción *</label>
                  <div className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-xs font-semibold flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>Efectivo en Ventanilla (Recepción In Situ)</span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Oficial</span>
                  </div>
                </div>
              </div>

              {/* Si es Afiliado Externo (EX): Cuenta de Ahorro Bancaria Automática */}
              {formData.tipo_asociado === 'EX' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start space-x-2.5">
                  <Building2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-emerald-950 block">Apertura Automática de Cuenta de Ahorro en Entidad Bancaria:</span>
                    Al ser un afiliado externo sin relación bancaria previa, el sistema aperturará automáticamente una <strong>Cuenta de Ahorro respaldada en la Entidad Bancaria Corporativa</strong> vinculada a su CUI, además de su cuenta en la Cooperativa.
                  </div>
                </div>
              )}

              {/* Si es Empleado Bancario (EB): Cuentas del Banco y Opción de Acreditar Dinero */}
              {formData.tipo_asociado === 'EB' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Landmark className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-bold text-slate-800">
                        Cuentas Bancarias del Colaborador (Banco de la Corporación)
                      </span>
                    </div>
                    {loadingCuentasBanco && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-emerald-600" /> Consultando banco...
                      </span>
                    )}
                  </div>

                  {formData.cui_dpi?.length !== 13 ? (
                    <p className="text-xs text-slate-500 italic">
                      Ingrese los 13 dígitos del CUI en el paso 1 para consultar automáticamente sus cuentas en el Core Bancario.
                    </p>
                  ) : cuentasEmpleado.length > 0 ? (
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-slate-600">
                        Seleccione la cuenta bancaria corporativa a vincular al expediente del asociado:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {cuentasEmpleado.map((cta) => {
                          const isSelected = cuentaBancoSeleccionada === cta.numero_cuenta_bancaria;
                          return (
                            <div
                              key={cta.id_cuenta_bancaria || cta.numero_cuenta_bancaria}
                              onClick={() => {
                                setCuentaBancoSeleccionada(cta.numero_cuenta_bancaria);
                                setFormData((prev) => ({
                                  ...prev,
                                  numero_cuenta_bancaria: cta.numero_cuenta_bancaria,
                                }));
                              }}
                              className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-mono font-bold text-slate-800">{cta.numero_cuenta_bancaria}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-700">
                                  {cta.tipo_cuenta}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500">Saldo Disponible:</span>
                                <span className={`font-bold ${cta.saldo_disponible > 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                                  Q{parseFloat(cta.saldo_disponible).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Botón para Acreditar Dinero si la cuenta no tiene fondos suficientes */}
                      <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-600">
                          ¿Requiere recargar o depositar saldo a su cuenta bancaria?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAcreditarModal(!showAcreditarModal);
                            setAcreditarErrorMsg('');
                            setAcreditarSuccessMsg('');
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
                        >
                          {showAcreditarModal ? 'Ocultar Acreditación' : '+ Acreditar Dinero en Banco'}
                        </button>
                      </div>

                      {/* Panel Interactivo de Acreditación / Depósito a Cuenta Bancaria */}
                      {showAcreditarModal && (
                        <div className="p-3 bg-white border border-emerald-300 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                              Acreditar Fondos a Cuenta Bancaria del Colaborador
                            </span>
                            <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                              {cuentaBancoSeleccionada}
                            </span>
                          </div>

                          {acreditarSuccessMsg && (
                            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-medium flex items-center space-x-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{acreditarSuccessMsg}</span>
                            </div>
                          )}

                          {acreditarErrorMsg && (
                            <div className="p-2 rounded-lg bg-red-50 border border-red-300 text-red-700 text-[11px] font-medium flex items-center space-x-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>{acreditarErrorMsg}</span>
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-2 font-bold text-emerald-700 text-xs">Q</span>
                              <input
                                type="number"
                                step="0.01"
                                min="1"
                                value={montoAcreditar}
                                onChange={(e) => setMontoAcreditar(e.target.value)}
                                placeholder="Monto a acreditar"
                                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleAcreditarFondos}
                              disabled={acreditando}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {acreditando ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Acreditando...</span>
                                </>
                              ) : (
                                <>
                                  <span>Acreditar Fondos</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span>No se encontraron cuentas activas en el Banco para este colaborador.</span>
                      <button
                        type="button"
                        onClick={handleAperturarCuentaBanco}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        Aperturar Cuenta en Banco
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sección Informativa: Portal Web */}
            <div className="pt-2 border-t border-slate-100">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start space-x-2.5">
                <KeyRound className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800 block">Acceso al Portal Web de Asociados:</span>
                  Al registrar al nuevo asociado, el sistema generará y enviará automáticamente a su correo electrónico una <strong>contraseña temporal segura</strong> junto con su código de cliente para su primer ingreso al portal web.
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Limpiar Campos
                </button>

                <button
                  type="submit"
                  disabled={loading || emailStatus.available === false}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <>
                      <span>Registrar Solicitud de Afiliación</span>
                      <ShieldCheck className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default NewAssociateModal;
