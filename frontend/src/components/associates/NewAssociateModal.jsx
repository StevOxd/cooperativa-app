import React, { useState, useEffect, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import api from '../../services/api';
import { Alert, Badge, Button, Field, Input, LoadingState, Modal, Select, cn } from '../ui';
import { formatQ } from '../../utils/format';

const FORM_ID = 'nuevo-asociado';

/** Quita un error de campo sin tocar los demás. */
const clearFieldError = (setFieldErrors, field) =>
  setFieldErrors((prev) => {
    const next = { ...prev };
    delete next[field];
    return next;
  });

/**
 * Afiliación presencial de un nuevo asociado en ventanilla: datos personales,
 * validación de DPI (detecta si es empleado del banco), mayoría de edad,
 * correo disponible, depósito inicial y cuenta bancaria.
 */
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
        message: `Tiene ${age >= 0 ? age : 0} años. Debe tener 18 años cumplidos.`,
      };
    }
    if (age > 105) {
      return {
        valid: false,
        age,
        message: `La fecha da ${age} años. Revise el año de nacimiento.`,
      };
    }
    return {
      valid: true,
      age,
      message: `${age} años cumplidos.`,
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
      message: 'Consultando el DPI en el banco…',
    }));
    setLoadingCuentasBanco(true);

    try {
      const res = await api.get(`/banco-externo/cuentas-cliente/${cleanCui}`);
      if (res.data?.success) {
        if (res.data.ya_registrado_cooperativa) {
          const errMsg = `Este DPI ya es de un asociado (${res.data.asociado_existente?.codigo_asociado || 'activo'}).`;
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
            ? 'Es empleado del banco. Se registrará como asociado EB.'
            : 'No es empleado del banco. Se registrará como asociado externo (EX).',
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
          message: 'No es empleado del banco. Se registrará como asociado externo (EX).',
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
        message: 'No tiene cuentas en el banco. Se registrará como asociado externo (EX).',
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
      setAcreditarErrorMsg('Elija la cuenta del banco a la que se acreditará.');
      return;
    }
    const monto = parseFloat(montoAcreditar);
    if (isNaN(monto) || monto <= 0) {
      setAcreditarErrorMsg('Escriba un monto mayor que Q0.00.');
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
        setAcreditarSuccessMsg(`Se acreditaron Q${monto.toFixed(2)} a la cuenta ${cuentaBancoSeleccionada}.`);
        await fetchCuentasEmpleado(formData.cui_dpi);
        setTimeout(() => {
          setAcreditarSuccessMsg('');
          setShowAcreditarModal(false);
        }, 2200);
      } else {
        setAcreditarErrorMsg(res.data?.message || 'No se pudieron acreditar los fondos. Intente de nuevo.');
      }
    } catch (err) {
      setAcreditarErrorMsg(err.response?.data?.message || 'No hay conexión con el banco. Intente de nuevo.');
    } finally {
      setAcreditando(false);
    }
  };

  // Aperturar cuenta en el banco para el colaborador si no tuviese cuentas activas
  const handleAperturarCuentaBanco = async () => {
    if (!formData.cui_dpi || formData.cui_dpi.length !== 13 || !formData.primer_nombre) {
      setErrorMsg('Escriba el DPI (13 dígitos) y los nombres antes de abrir la cuenta en el banco.');
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
      setEmailStatus({ checking: false, available: false, message: 'Revise el formato del correo.' });
      return;
    }

    setEmailStatus({ checking: true, available: null, message: 'Verificando...' });
    try {
      const res = await api.get(`/afiliacion/verificar-email?email=${encodeURIComponent(cleanEmail)}`);
      if (res.data?.success) {
        if (res.data.disponible) {
          setEmailStatus({ checking: false, available: true, message: 'Correo disponible.' });
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.email;
            return next;
          });
        } else {
          const msg = res.data.message || 'Ese correo ya está registrado.';
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
      errors.fecha_nacimiento = ageResult?.message || 'Debe tener 18 años cumplidos.';
    }

    // 5. Validar Correo Electrónico
    const cleanEmail = formData.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      errors.email = 'Ingrese un correo electrónico válido.';
    } else if (emailStatus.available === false) {
      errors.email = emailStatus.message || 'Ese correo ya está registrado.';
    }

    // 6. Validar Monto
    const monto = parseFloat(formData.monto_aportacion);
    if (isNaN(monto) || monto < 100.00) {
      errors.monto_aportacion = 'La aportación inicial no puede ser inferior a Q100.00.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMsg('Revise los campos marcados.');
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
        setErrorMsg(res.data?.message || 'No se pudo registrar al asociado. Intente de nuevo.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'No hay conexión con el servidor. Intente de nuevo.';
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


  const soloLetras = (value) => value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
  const esEmpleado = formData.tipo_asociado === 'EB';

  // Estado del DPI: texto de ayuda bajo el campo
  const dpiHint = dpiStatus.checking
    ? 'Verificando en el banco…'
    : dpiStatus.verified && dpiStatus.message
    ? dpiStatus.message
    : `${formData.cui_dpi?.length || 0}/13 dígitos, sin guiones ni espacios.`;

  const emailError = emailStatus.available === false ? emailStatus.message : fieldErrors.email;
  const emailHint = emailStatus.checking
    ? 'Verificando que el correo esté disponible…'
    : emailStatus.available === true
    ? emailStatus.message
    : 'A este correo se enviará la contraseña temporal.';

  if (successData) {
    return (
      <Modal
        isOpen
        onClose={onClose}
        lockScroll={false}
        title="Asociado registrado"
        description="Se creó su expediente y su cuenta de aportaciones."
        footer={<Button onClick={onClose}>Cerrar</Button>}
      >
        <dl className="divide-y divide-line rounded-md border border-line text-sm">
          {[
            ['Código de usuario', <span className="font-mono">{successData.codigo_corporativo}</span>],
            ['Nombre', successData.nombre_completo],
            ['Tipo de asociado', successData.tipo_asociado === 'EB' ? 'Empleado del banco (EB)' : 'Externo (EX)'],
            ['Cuenta de aportaciones', <span className="font-mono">{successData.cuenta_ahorro || successData.cuenta_aportaciones}</span>],
            successData.cuenta_bancaria_creada && ['Cuenta de ahorro abierta en el banco', <span className="font-mono">{successData.cuenta_bancaria_creada}</span>],
            successData.numero_cuenta_bancaria_asociada && ['Cuenta bancaria vinculada', <span className="font-mono">{successData.numero_cuenta_bancaria_asociada}</span>],
            ['Depósito inicial', <span className="font-medium tabular-nums">{formatQ(successData.saldo_inicial)}</span>],
            ['Forma de pago', 'Efectivo en ventanilla'],
          ]
            .filter(Boolean)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right text-ink">{value}</dd>
              </div>
            ))}
        </dl>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!loading}
      closeOnOverlay={false}
      lockScroll={false}
      size="lg"
      title="Nuevo asociado"
      description="Afiliación presencial en ventanilla."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={handleResetForm} disabled={loading}>
              Limpiar campos
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              loading={loading}
              loadingText="Registrando…"
              disabled={emailStatus.available === false}
            >
              Registrar asociado
            </Button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6">
        {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}

        {/* ============ 1. DATOS PERSONALES ============ */}
        <section aria-labelledby="na-datos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="na-datos" className="text-sm font-semibold text-ink">Datos personales</h3>
            {dpiStatus.checking ? (
              <Badge>Consultando DPI…</Badge>
            ) : dpiStatus.verified ? (
              esEmpleado ? <Badge tone="warning">Empleado del banco (EB)</Badge> : <Badge tone="brand">Externo (EX)</Badge>
            ) : (
              <Badge>El tipo se detecta con el DPI</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="DPI" hint={dpiHint} error={fieldErrors.cui_dpi} required>
              <Input
                name="cui_dpi"
                inputMode="numeric"
                maxLength={13}
                value={formData.cui_dpi}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                  setFormData((prev) => ({ ...prev, cui_dpi: val }));
                  if (fieldErrors.cui_dpi) clearFieldError(setFieldErrors, 'cui_dpi');
                  if (errorMsg) setErrorMsg('');
                }}
                className="font-mono"
                required
              />
            </Field>
            <Field label="Primer nombre" error={fieldErrors.primer_nombre} required>
              <Input
                name="primer_nombre"
                value={formData.primer_nombre}
                onChange={(e) => {
                  const val = soloLetras(e.target.value);
                  setFormData((prev) => ({ ...prev, primer_nombre: val }));
                  if (fieldErrors.primer_nombre) clearFieldError(setFieldErrors, 'primer_nombre');
                  if (errorMsg) setErrorMsg('');
                }}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Segundo nombre">
              <Input
                name="segundo_nombre"
                value={formData.segundo_nombre}
                onChange={(e) => {
                  const val = soloLetras(e.target.value);
                  setFormData((prev) => ({ ...prev, segundo_nombre: val }));
                  if (errorMsg) setErrorMsg('');
                }}
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Primer apellido" error={fieldErrors.primer_apellido} required>
              <Input
                name="primer_apellido"
                value={formData.primer_apellido}
                onChange={(e) => {
                  const val = soloLetras(e.target.value);
                  setFormData((prev) => ({ ...prev, primer_apellido: val }));
                  if (fieldErrors.primer_apellido) clearFieldError(setFieldErrors, 'primer_apellido');
                  if (errorMsg) setErrorMsg('');
                }}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Segundo apellido">
              <Input
                name="segundo_apellido"
                value={formData.segundo_apellido}
                onChange={(e) => {
                  const val = soloLetras(e.target.value);
                  setFormData((prev) => ({ ...prev, segundo_apellido: val }));
                  if (errorMsg) setErrorMsg('');
                }}
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Teléfono móvil"
              hint={`${formData.telefono?.length || 0}/8 dígitos, sin guiones.`}
              error={fieldErrors.telefono}
              required
            >
              <Input
                name="telefono"
                inputMode="numeric"
                maxLength={8}
                value={formData.telefono}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setFormData((prev) => ({ ...prev, telefono: val }));
                  if (fieldErrors.telefono) clearFieldError(setFieldErrors, 'telefono');
                  if (errorMsg) setErrorMsg('');
                }}
                className="font-mono"
                required
              />
            </Field>
            <Field label="Correo electrónico" hint={emailHint} error={emailError} required>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/\s+/g, '');
                  setFormData((prev) => ({ ...prev, email: val }));
                  if (fieldErrors.email) clearFieldError(setFieldErrors, 'email');
                  setEmailStatus({ checking: false, available: null, message: '' });
                  if (errorMsg) setErrorMsg('');
                }}
                onBlur={() => checkEmailAvailability(formData.email)}
                required
              />
            </Field>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-ink-soft">
              Fecha de nacimiento
              <span className="ml-0.5 text-danger-700" aria-hidden="true">*</span>
              <span className="sr-only"> (obligatorio)</span>
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={birthDay}
                onChange={(e) => handleDatePartChange('day', e.target.value)}
                invalid={Boolean(fieldErrors.fecha_nacimiento)}
                aria-label="Día"
                required
              >
                <option value="">Día</option>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Select
                value={birthMonth}
                onChange={(e) => handleDatePartChange('month', e.target.value)}
                invalid={Boolean(fieldErrors.fecha_nacimiento)}
                aria-label="Mes"
                required
              >
                <option value="">Mes</option>
                {MONTHS.map((m) => <option key={m.val} value={m.val}>{m.name}</option>)}
              </Select>
              <Select
                value={birthYear}
                onChange={(e) => handleDatePartChange('year', e.target.value)}
                invalid={Boolean(fieldErrors.fecha_nacimiento)}
                aria-label="Año"
                required
              >
                <option value="">Año</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <p
              role="status"
              className={cn(
                'text-xs',
                ageInfo ? (ageInfo.valid ? 'text-success-700' : 'text-danger-700') : fieldErrors.fecha_nacimiento ? 'text-danger-700' : 'text-ink-subtle'
              )}
            >
              {ageInfo ? ageInfo.message : fieldErrors.fecha_nacimiento || 'Debe tener 18 años cumplidos.'}
            </p>
          </fieldset>

          <Field label="Dirección">
            <Input name="direccion" value={formData.direccion} onChange={handleChange} placeholder="Calle, avenida, zona, municipio" />
          </Field>
        </section>

        {/* ============ 2. DEPÓSITO Y CUENTA BANCARIA ============ */}
        <section aria-labelledby="na-deposito" className="space-y-4 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="na-deposito" className="text-sm font-semibold text-ink">Depósito inicial y cuenta bancaria</h3>
            <Badge tone={esEmpleado ? 'warning' : 'brand'}>{esEmpleado ? 'Empleado del banco (EB)' : 'Externo (EX)'}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Aportación inicial" hint="Mínimo Q100.00." error={fieldErrors.monto_aportacion} required>
              <Input
                type="number"
                step="0.01"
                min="100.00"
                name="monto_aportacion"
                prefix="Q"
                value={formData.monto_aportacion}
                onChange={handleChange}
                className="tabular-nums"
                required
              />
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink-soft">Forma de pago</p>
              <p className="flex h-10 items-center rounded-md border border-line bg-surface-muted px-3 text-sm text-ink">
                Efectivo en ventanilla
              </p>
            </div>
          </div>

          {!esEmpleado && (
            <Alert tone="info" icon={Building2}>
              Como no tiene relación previa con el banco, se abrirá automáticamente una cuenta de ahorro en el banco
              vinculada a su DPI, además de su cuenta en la cooperativa.
            </Alert>
          )}

          {esEmpleado && (
            <div className="space-y-3 rounded-md border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium text-ink">Cuentas del colaborador en el banco</h4>
                {loadingCuentasBanco && <span className="text-xs text-ink-muted">Consultando…</span>}
              </div>

              {formData.cui_dpi?.length !== 13 ? (
                <p className="text-sm text-ink-muted">Escriba los 13 dígitos del DPI para consultar sus cuentas en el banco.</p>
              ) : loadingCuentasBanco && cuentasEmpleado.length === 0 ? (
                <LoadingState label="Consultando cuentas…" className="py-6" />
              ) : cuentasEmpleado.length > 0 ? (
                <div className="space-y-3">
                  <fieldset>
                    <legend className="mb-2 text-sm text-ink-muted">Elija la cuenta que se vinculará al expediente:</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {cuentasEmpleado.map((cta) => {
                        const isSelected = cuentaBancoSeleccionada === cta.numero_cuenta_bancaria;
                        return (
                          <label
                            key={cta.id_cuenta_bancaria || cta.numero_cuenta_bancaria}
                            className={cn(
                              'block cursor-pointer rounded-md border p-3 text-sm transition-colors',
                              'focus-within:ring-2 focus-within:ring-brand-600',
                              isSelected ? 'border-brand-700 bg-brand-50' : 'border-line hover:border-line-strong'
                            )}
                          >
                            <input
                              type="radio"
                              name="cuenta-banco"
                              className="sr-only"
                              checked={isSelected}
                              onChange={() => {
                                setCuentaBancoSeleccionada(cta.numero_cuenta_bancaria);
                                setFormData((prev) => ({
                                  ...prev,
                                  numero_cuenta_bancaria: cta.numero_cuenta_bancaria,
                                }));
                              }}
                            />
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-mono text-ink">{cta.numero_cuenta_bancaria}</span>
                              <Badge>{cta.tipo_cuenta}</Badge>
                            </span>
                            <span className="mt-1 flex items-center justify-between text-xs">
                              <span className="text-ink-muted">Saldo disponible</span>
                              <span className={cn('font-medium tabular-nums', cta.saldo_disponible > 0 ? 'text-ink' : 'text-warning-800')}>
                                {formatQ(cta.saldo_disponible)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-ink-muted">¿Necesita depositar saldo en la cuenta bancaria?</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={showAcreditarModal}
                      onClick={() => {
                        setShowAcreditarModal(!showAcreditarModal);
                        setAcreditarErrorMsg('');
                        setAcreditarSuccessMsg('');
                      }}
                    >
                      {showAcreditarModal ? 'Ocultar' : 'Acreditar fondos'}
                    </Button>
                  </div>

                  {showAcreditarModal && (
                    <div className="space-y-3 rounded-md border border-line bg-surface-muted p-3">
                      <p className="text-sm text-ink-soft">
                        Acreditar a la cuenta <span className="font-mono text-ink">{cuentaBancoSeleccionada}</span>
                      </p>
                      {acreditarSuccessMsg && <Alert tone="success">{acreditarSuccessMsg}</Alert>}
                      {acreditarErrorMsg && <Alert tone="danger">{acreditarErrorMsg}</Alert>}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="1"
                            prefix="Q"
                            value={montoAcreditar}
                            onChange={(e) => setMontoAcreditar(e.target.value)}
                            aria-label="Monto a acreditar"
                            className="tabular-nums"
                          />
                        </div>
                        <Button onClick={handleAcreditarFondos} loading={acreditando} loadingText="Acreditando…">
                          Acreditar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900 sm:flex-row sm:items-center sm:justify-between">
                  <span>El colaborador no tiene cuentas activas en el banco.</span>
                  <Button size="sm" variant="secondary" onClick={handleAperturarCuentaBanco}>
                    Abrir cuenta en el banco
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <Alert tone="info">
          Al registrarlo, el sistema enviará a su correo el código de usuario y una contraseña temporal para su primer
          ingreso al portal.
        </Alert>
      </form>
    </Modal>
  );
};

export default NewAssociateModal;
