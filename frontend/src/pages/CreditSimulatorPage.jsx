import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generateCreditApplicationPdf } from '../utils/creditApplicationPdf';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { getSecureDocumentUrl } from '../utils/documentUrl';
import {
  FileText,
  Calendar,
  Percent,
  Calculator,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  RefreshCw,
  Send,
  Wallet,
  CreditCard,
  Building2,
  Check,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Download,
  Upload,
  FileCheck,
  Eye,
  Clock,
} from 'lucide-react';

export const CreditSimulatorPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [monto, setMonto] = useState(5000);
  const [plazo, setPlazo] = useState(12);
  const [observaciones, setObservaciones] = useState('');
  const [cuota, setCuota] = useState(0);

  // Capacidad crediticia y scoring
  const [capacidadInfo, setCapacidadInfo] = useState(null);
  const [loadingCapacidad, setLoadingCapacidad] = useState(true);

  // Cuentas de acreditación disponibles
  const [cuentasAcreditacion, setCuentasAcreditacion] = useState([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [selectedCuentaKey, setSelectedCuentaKey] = useState('');

  // Estados de carga e historial
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Estados del Flujo de Firma PDF
  const [archivoFirmadoBase64, setArchivoFirmadoBase64] = useState(null);
  const [archivoFirmadoNombre, setArchivoFirmadoNombre] = useState('');
  const [archivoFirmadoSize, setArchivoFirmadoSize] = useState(0);

  // Modal de confirmación para desistir / cancelar solicitud
  const [solicitudACancelar, setSolicitudACancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
      setSuccessMessage('');
    }
  }, [successMessage, toast]);

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
      setErrorMessage('');
    }
  }, [errorMessage, toast]);

  // Tasa de interés base: 10% anual
  const tasaAnual = 10;

  // Calcular la cuota estimada en tiempo real
  useEffect(() => {
    const tasaMensual = (tasaAnual / 100) / 12;
    let cuotaEstimada = 0;
    if (tasaMensual > 0) {
      cuotaEstimada = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
    } else {
      cuotaEstimada = monto / plazo;
    }
    setCuota(isNaN(cuotaEstimada) || !isFinite(cuotaEstimada) ? 0 : Math.round(cuotaEstimada * 100) / 100);
  }, [monto, plazo]);

  const fetchCuentas = async () => {
    try {
      setLoadingCuentas(true);
      const response = await api.get('/asociado/cuentas-acreditacion');
      if (response.data?.success && response.data.data?.todas) {
        const list = response.data.data.todas;
        setCuentasAcreditacion(list);
        if (list.length > 0) {
          setSelectedCuentaKey((prev) => {
            if (prev && list.some((c) => c.key === prev)) return prev;
            return list[0].key;
          });
        }
      }
    } catch (err) {
      console.error('Error al cargar cuentas de acreditación:', err);
    } finally {
      setLoadingCuentas(false);
    }
  };

  const fetchCreditos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/asociado/creditos');
      if (response.data?.success) {
        setCreditos(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar créditos:', err);
      setErrorMessage('No se pudieron obtener las solicitudes de crédito anteriores.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCapacidad = async () => {
    try {
      setLoadingCapacidad(true);
      const response = await api.get('/asociado/capacidad-crediticia');
      if (response.data?.success) {
        setCapacidadInfo(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar capacidad crediticia:', err);
    } finally {
      setLoadingCapacidad(false);
    }
  };

  useEffect(() => {
    fetchCuentas();
    fetchCreditos();
    fetchCapacidad();
  }, []);

  const solicitudesPendientesCount =
    capacidadInfo?.solicitudesPendientesCount ??
    creditos.filter((c) =>
      ['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'].includes(c.estado)
    ).length;
  const limitePendientesAlcanzado = solicitudesPendientesCount >= 2;

  // Solicitud activa que se encuentra esperando la carga del formulario firmado
  const solicitudPendienteFirma = creditos.find((c) => c.estado === 'PENDIENTE_FIRMA');

  const limiteMaximo = capacidadInfo?.capacidad?.limiteMaximo ?? 500000;
  const cupoDisponible = capacidadInfo?.cupoDisponible ?? limiteMaximo;
  const deudaActiva = capacidadInfo?.deudaActiva ?? 0;
  const saldoTotal = capacidadInfo?.saldoTotal ?? 0;
  const montoExcedeCupo = monto > cupoDisponible;

  const isFormDisabled =
    limitePendientesAlcanzado ||
    montoExcedeCupo ||
    (cuentasAcreditacion.length > 0 && !selectedCuentaKey) ||
    submitting ||
    !!solicitudPendienteFirma;

  // Paso 1: Confirmar condiciones financieras y registrar la solicitud en estado 'PENDIENTE_FIRMA'
  const handleIniciarSolicitud = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (limitePendientesAlcanzado) {
      toast.error('Ha alcanzado el límite máximo de 2 solicitudes activas en evaluación.');
      return;
    }

    if (montoExcedeCupo) {
      toast.error('El monto solicitado supera su cupo crediticio disponible.');
      return;
    }

    const selectedCuenta = cuentasAcreditacion.find((c) => c.key === selectedCuentaKey);
    if (!selectedCuenta?.id_cuenta_bancaria) {
      toast.error('Debe seleccionar una cuenta bancaria (Monetaria o Ahorro) para acreditación.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        monto_solicitado: monto,
        plazo_meses: plazo,
        observaciones,
        id_cuenta_bancaria_destino: selectedCuenta.id_cuenta_bancaria,
      };

      const res = await api.post('/asociado/creditos/iniciar', payload);
      if (res.data?.success) {
        const nuevaSol = res.data.data;
        toast.success(`¡Solicitud #${nuevaSol.id_solicitud_credito} registrada! Se ha descargado el formulario oficial para su firma.`);
        
        // Generar y descargar inmediatamente el PDF oficial vinculado al Folio persistido en BD
        generateCreditApplicationPdf({
          asociado: user,
          credito: {
            id_solicitud_credito: nuevaSol.id_solicitud_credito,
            monto: nuevaSol.monto_solicitado,
            plazo: nuevaSol.plazo_meses,
            cuotaMensual: nuevaSol.cuota_mensual_estimada,
            observaciones: nuevaSol.observaciones,
            cuenta_destino_info: nuevaSol.cuenta_destino_info,
          },
          cuentaDestino: selectedCuenta,
        });

        setObservaciones('');
        await Promise.all([fetchCreditos(), fetchCapacidad()]);
      }
    } catch (err) {
      console.error('Error al iniciar solicitud de crédito:', err);
      toast.error(err.response?.data?.message || 'Error al registrar la solicitud de crédito.');
    } finally {
      setSubmitting(false);
    }
  };

  // Paso 2: Subir formulario firmado para la solicitud exacta
  const handleSubirExpediente = async (idSolicitud) => {
    if (!archivoFirmadoBase64) {
      toast.error('Por favor seleccione el documento PDF o imagen firmado antes de enviarlo.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        documento_firmado: archivoFirmadoBase64,
        nombre_archivo_firmado: archivoFirmadoNombre,
      };

      const res = await api.post(`/asociado/creditos/${idSolicitud}/subir-expediente-firmado`, payload);
      if (res.data?.success) {
        toast.success('¡Formulario firmado enviado al comité de créditos exitosamente!');
        setArchivoFirmadoBase64(null);
        setArchivoFirmadoNombre('');
        setArchivoFirmadoSize(0);
        await Promise.all([fetchCreditos(), fetchCapacidad()]);
      }
    } catch (err) {
      console.error('Error al subir expediente firmado:', err);
      toast.error(err.response?.data?.message || 'Error al enviar el expediente firmado.');
    } finally {
      setSubmitting(false);
    }
  };

  // Descarga bajo demanda del PDF para una solicitud específica
  const handleDescargarPdfDeSolicitud = (sol) => {
    try {
      generateCreditApplicationPdf({
        asociado: user,
        credito: {
          id_solicitud_credito: sol.id_solicitud_credito,
          monto: sol.monto_solicitado,
          plazo: sol.plazo_meses,
          cuotaMensual: sol.cuota_mensual_estimada,
          observaciones: sol.observaciones,
          cuenta_destino_info: sol.cuenta_destino_info,
        },
        cuentaDestino: {
          numero_cuenta: sol.cuenta_bancaria_destino_numero || sol.cuenta_destino_info,
          etiqueta_tipo: sol.cuenta_destino_info,
        },
      });
      toast.success(`Formulario oficial de la Solicitud #${sol.id_solicitud_credito} descargado.`);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      toast.error('No se pudo generar el documento PDF.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
      toast.error('El archivo excede el tamaño máximo permitido de 12 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setArchivoFirmadoBase64(reader.result);
      setArchivoFirmadoNombre(file.name);
      setArchivoFirmadoSize(file.size);
      toast.success(`Archivo "${file.name}" cargado exitosamente.`);
    };
    reader.onerror = () => {
      toast.error('Error al leer el archivo. Intente nuevamente.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setArchivoFirmadoBase64(null);
    setArchivoFirmadoNombre('');
    setArchivoFirmadoSize(0);
  };

  const openCancelarModal = (solicitudOrId) => {
    if (typeof solicitudOrId === 'object' && solicitudOrId !== null) {
      setSolicitudACancelar(solicitudOrId);
    } else {
      const found = creditos.find((c) => c.id_solicitud_credito === solicitudOrId);
      setSolicitudACancelar(found || { id_solicitud_credito: solicitudOrId });
    }
  };

  const closeCancelarModal = () => {
    if (!cancelando) {
      setSolicitudACancelar(null);
    }
  };

  const handleConfirmarCancelacion = async () => {
    if (!solicitudACancelar) return;
    const idSolicitud = solicitudACancelar.id_solicitud_credito;
    try {
      setCancelando(true);
      const res = await api.post(`/asociado/creditos/${idSolicitud}/cancelar`);
      if (res.data?.success) {
        toast.success(`Solicitud #${idSolicitud} cancelada exitosamente.`);
        setArchivoFirmadoBase64(null);
        setArchivoFirmadoNombre('');
        setArchivoFirmadoSize(0);
        setSolicitudACancelar(null);
        await Promise.all([fetchCreditos(), fetchCapacidad()]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cancelar la solicitud.');
    } finally {
      setCancelando(false);
    }
  };

  const getCreditBadgeColor = (estado) => {
    switch (estado) {
      case 'APROBADA':
      case 'APROBADO':
      case 'DESEMBOLSADA':
        return 'bg-brand-50 text-brand-700 border-brand-200';
      case 'RECHAZADA':
      case 'RECHAZADO':
      case 'DENEGADA':
        return 'bg-danger-50 text-danger-700 border-danger-200';
      case 'EN_AUTORIZACION_EJECUTIVO':
        return 'bg-brand-50 text-brand-700 border-brand-200';
      case 'DEVUELTA_OPERADOR':
        return 'bg-warning-50 text-warning-700 border-warning-200';
      case 'PENDIENTE_FIRMA':
        return 'bg-warning-50 text-warning-800 border-warning-300 font-extrabold';
      case 'EN_REVISION_OPERADOR':
      case 'PENDIENTE':
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getCreditBadgeLabel = (estado) => {
    switch (estado) {
      case 'PENDIENTE_FIRMA':
        return 'Pendiente de Firma';
      case 'EN_REVISION_OPERADOR':
        return 'En Revisión Operador';
      case 'EN_AUTORIZACION_EJECUTIVO':
        return 'En Autorización Ejecutiva';
      case 'DEVUELTA_OPERADOR':
        return 'Devuelta para Subsanar';
      case 'APROBADA':
      case 'APROBADO':
      case 'DESEMBOLSADA':
        return 'Aprobada y Desembolsada';
      case 'RECHAZADA':
      case 'RECHAZADO':
      case 'DENEGADA':
        return 'Denegada';
      case 'PENDIENTE':
      default:
        return 'En Trámite';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
          <Calculator className="w-7 h-7 text-brand-600" />
          <span>Simulador de Créditos Financieros</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Calcule sus cuotas en tiempo real bajo amortización nivelada francesa y envíe su solicitud al comité.
        </p>
      </div>

      {/* Banner de restricción de solicitudes pendientes */}
      {limitePendientesAlcanzado && (
        <div className="p-4 rounded-lg bg-warning-50 border-2 border-warning-300 flex items-start space-x-3 text-warning-900">
          <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-extrabold text-warning-900">
              Límite de solicitudes pendientes alcanzado (2 de 2 permitidas)
            </p>
            <p className="text-xs text-warning-700 mt-1 leading-relaxed">
              Actualmente tiene 2 solicitudes de crédito en revisión por el comité operativo. Por normativas internas de riesgo de la cooperativa, no es posible ingresar nuevas solicitudes hasta que al menos una de ellas sea formalmente resuelta (aprobada o rechazada).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Panel de Firma de Solicitud en Proceso o Formulario de Simulación */}
        <div className="lg:col-span-7">
          {solicitudPendienteFirma ? (
            <div className="bg-white p-6 sm:p-8 rounded-lg border-2 border-warning-300 space-y-6">
              <div className="flex items-center justify-between border-b border-warning-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-warning-600" />
                  <h2 className="text-lg font-bold text-slate-800">
                    Solicitud en Proceso de Firma (Folio #{solicitudPendienteFirma.id_solicitud_credito})
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-warning-100 text-warning-800 border border-warning-300">
                  Pendiente de Firma
                </span>
              </div>

              <div className="p-4 rounded-lg bg-warning-50/70 border border-warning-200 text-xs text-warning-900 space-y-2">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Tiene una solicitud oficial previamente registrada en el sistema. Los montos, plazos y cuenta destino han sido <strong>asegurados con este Folio</strong> para garantizar total coincidencia con el documento firmado.
                  </p>
                </div>
                <p className="text-xs text-warning-800 pl-6">
                  Descargue el formulario prellenado, fírmelo (manuscrito o digital) y adjunte el archivo para someterlo a dictamen del comité operativo.
                </p>
              </div>

              {/* Parámetros Bloqueados de la Solicitud */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Condiciones Aseguradas de la Solicitud
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Registrada el {new Date(solicitudPendienteFirma.fecha_solicitud).toLocaleDateString('es-GT')}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-400 block uppercase">Monto Solicitado</span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      Q{parseFloat(solicitudPendienteFirma.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-400 block uppercase">Plazo</span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {solicitudPendienteFirma.plazo_meses} meses
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-400 block uppercase">Cuota Mensual</span>
                    <span className="font-extrabold text-brand-700 text-sm">
                      Q{parseFloat(solicitudPendienteFirma.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 col-span-2 sm:col-span-3">
                    <span className="text-xs text-slate-400 block uppercase">Cuenta para Acreditación</span>
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {solicitudPendienteFirma.cuenta_destino_info || (solicitudPendienteFirma.cuenta_bancaria_destino_numero ? `Cuenta Bancaria (${solicitudPendienteFirma.cuenta_bancaria_destino_numero})` : 'Cuenta Principal')}
                    </span>
                  </div>
                </div>
                {solicitudPendienteFirma.observaciones && (
                  <div className="text-xs text-slate-600 pt-1">
                    <strong>Destino / Observaciones:</strong> {solicitudPendienteFirma.observaciones}
                  </div>
                )}
              </div>

              {/* Paso 1: Descargar Formulario Oficial */}
              <div className="p-4 rounded-lg bg-brand-50/70 border border-brand-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="font-bold text-brand-950 block">
                    Paso 1: Descargar Formulario Oficial (PDF)
                  </span>
                  <span className="text-brand-700 text-xs block mt-0.5">
                    Descargue el formulario prellenado con el Folio #{solicitudPendienteFirma.id_solicitud_credito} para firmarlo.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDescargarPdfDeSolicitud(solicitudPendienteFirma)}
                  className="px-4 py-2.5 rounded-md text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white transition-all flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </button>
              </div>

              {/* Paso 2: Subir Formulario Firmado */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Paso 2: Adjuntar Formulario Firmado <span className="text-warning-600">*</span>
                  </label>
                  <span className="text-xs text-slate-400">PDF, PNG o JPG (Máx. 12MB)</span>
                </div>

                {!archivoFirmadoBase64 ? (
                  <label className="border-2 border-dashed border-warning-300 hover:border-warning-500 bg-warning-50/30 hover:bg-warning-50/60 rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-colors group">
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/jpg"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload className="w-7 h-7 text-warning-600 group-hover:scale-110 transition-transform mb-1.5" />
                    <span className="text-xs font-bold text-slate-800">
                      Haga clic aquí para seleccionar el archivo firmado
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      Asegúrese de subir el formulario correspondiente al Folio #{solicitudPendienteFirma.id_solicitud_credito}
                    </span>
                  </label>
                ) : (
                  <div className="p-3.5 bg-brand-50/80 border border-brand-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <span className="font-bold text-xs text-slate-800 block truncate" title={archivoFirmadoNombre}>
                          {archivoFirmadoNombre}
                        </span>
                        <span className="text-xs text-brand-700 font-semibold block">
                          Documento listo para enviar • {(archivoFirmadoSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="text-slate-400 hover:text-danger-600 p-1.5 rounded-md hover:bg-danger-50 transition-colors cursor-pointer"
                      title="Quitar archivo seleccionado"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Acciones */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => handleSubirExpediente(solicitudPendienteFirma.id_solicitud_credito)}
                    disabled={submitting || !archivoFirmadoBase64}
                    className="flex-1 py-3 px-5 rounded-md bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Enviando expediente al comité...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Formulario Firmado al Comité</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openCancelarModal(solicitudPendienteFirma)}
                    disabled={submitting || cancelando}
                    className="py-3 px-4 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    title="Desistir de esta solicitud para calcular con un monto o plazo diferente"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Desistir / Cambiar Condiciones</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 sm:p-8 rounded-lg border border-slate-200 space-y-6">
              <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
                Calcular Préstamo y Generar Solicitud
              </h2>

              <form onSubmit={handleIniciarSolicitud} className="space-y-5">
                {/* Monto */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Monto Solicitado (Quetzales)
                    </label>
                    <span className="text-sm font-extrabold text-slate-900">
                      Q{monto.toLocaleString('es-GT')}
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">Q</div>
                    <input
                      type="number"
                      min={500}
                      max={500000}
                      step={100}
                      value={monto}
                      onChange={(e) => setMonto(Math.max(500, parseFloat(e.target.value) || 0))}
                      className={`w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 ${
                        montoExcedeCupo
                          ? 'border-danger-300 focus:ring-danger-500 bg-danger-50/20'
                          : 'border-slate-300 focus:ring-brand-600'
                      }`}
                    />
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={Math.max(10000, Math.min(cupoDisponible > 0 ? cupoDisponible : 100000, 150000))}
                    step={500}
                    value={monto}
                    onChange={(e) => setMonto(parseFloat(e.target.value))}
                    className="w-full mt-3 h-1.5 bg-slate-200 rounded-md appearance-none cursor-pointer accent-brand-700"
                  />

                  {montoExcedeCupo && (
                    <div className="mt-2.5 p-3 bg-danger-50 border border-danger-200 rounded-lg text-xs text-danger-700 flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-danger-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Monto supera el cupo crediticio disponible</span>
                        <span className="leading-relaxed">
                          El monto solicitado de <strong>Q{monto.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong> supera su cupo disponible de <strong>Q{cupoDisponible.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong> asignado a su perfil de ahorro.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Plazo */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Plazo en Meses
                    </label>
                    <span className="text-sm font-extrabold text-slate-900">
                      {plazo} meses
                    </span>
                  </div>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={plazo}
                      onChange={(e) => setPlazo(Math.max(3, parseInt(e.target.value, 10) || 0))}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={60}
                    step={1}
                    value={plazo}
                    onChange={(e) => setPlazo(parseInt(e.target.value, 10))}
                    className="w-full mt-3 h-1.5 bg-slate-200 rounded-md appearance-none cursor-pointer accent-brand-700"
                  />
                </div>

                {/* Selección de Cuenta para Acreditación de Fondos */}
                {loadingCuentas ? (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center space-x-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                    <span>Cargando cuentas para acreditación...</span>
                  </div>
                ) : cuentasAcreditacion.length === 1 ? (
                  <div className="bg-brand-50/70 border border-brand-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <Wallet className="w-4 h-4 text-brand-700" />
                      <span className="text-xs font-bold text-brand-900 uppercase tracking-wider">
                        Cuenta de Acreditación (Asignación Automática)
                      </span>
                    </div>
                    <p className="text-xs text-brand-700 mb-2.5">
                      Al contar con una única cuenta bancaria activa registrada, los fondos serán acreditados automáticamente a esta cuenta al ser aprobada su solicitud:
                    </p>
                    <div className="bg-white border border-brand-200 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          {cuentasAcreditacion[0].etiqueta_tipo || `Cuenta de ${cuentasAcreditacion[0].tipo_cuenta}`}
                        </span>
                        <span className="font-mono text-xs text-slate-600 block">
                          {cuentasAcreditacion[0].numero_cuenta}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block uppercase">Saldo actual</span>
                        <span className="text-xs font-bold text-brand-800">
                          Q{cuentasAcreditacion[0].saldo_disponible?.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : cuentasAcreditacion.length > 1 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Cuenta para Acreditación de Fondos <span className="text-brand-700">*</span>
                      </label>
                      <span className="text-xs text-slate-400">Seleccione una opción</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      Seleccione a cuál de sus cuentas bancarias se le acreditará el dinero en caso de ser aprobada la solicitud:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cuentasAcreditacion.map((cta) => {
                        const isSelected = selectedCuentaKey === cta.key;
                        return (
                          <div
                            key={cta.key}
                            onClick={() => setSelectedCuentaKey(cta.key)}
                            className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-brand-800 uppercase tracking-wider">
                                {cta.etiqueta_tipo || `Cuenta de ${cta.tipo_cuenta}`}
                              </span>
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  isSelected ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                                }`}
                              >
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                            </div>
                            <div className="font-mono text-xs font-bold text-slate-800">
                              {cta.numero_cuenta}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              Saldo disponible:{' '}
                              <span className="font-semibold text-slate-700">
                                Q{cta.saldo_disponible?.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg text-xs text-warning-800 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0" />
                    <span>No se encontraron cuentas bancarias activas (Monetaria o Ahorro) vinculadas para recibir el desembolso.</span>
                  </div>
                )}

                {/* Observaciones */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Destino del Crédito / Observaciones
                  </label>
                  <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej. Inversión en vivienda, compra de insumos, capital de trabajo, etc."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
                  />
                </div>

                {/* Botón de Confirmación y Generación (Paso 1) */}
                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={isFormDisabled}
                    className="w-full py-3.5 px-6 rounded-md bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Registrando solicitud oficial...</span>
                      </>
                    ) : limitePendientesAlcanzado ? (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>Límite de Solicitudes Pendientes (2/2)</span>
                      </>
                    ) : montoExcedeCupo ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Monto Supera Cupo Disponible</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        <span>Confirmar Condiciones y Generar Solicitud Oficial (Paso 1)</span>
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 text-center leading-relaxed">
                    Al confirmar, se registrará formalmente su solicitud en el sistema con un Folio Oficial, se asegurarán sus condiciones financieras y se descargará automáticamente su formulario para su firma.
                  </p>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Resumen e Informativo (Derecha) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjeta de Capacidad y Scoring */}
          <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-brand-600" />
                <span>Capacidad Crediticia Asignada</span>
              </h3>
              {capacidadInfo?.capacidad?.nivel && (
                <span className="text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800 border border-brand-300">
                  {capacidadInfo.capacidad.nivel}
                </span>
              )}
            </div>

            {loadingCapacidad ? (
              <div className="py-4 flex items-center justify-center space-x-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                <span>Consultando capacidad de crédito...</span>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Saldo Total Ahorrado:</span>
                  <span className="font-bold text-slate-900">
                    Q{saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Límite Máximo Asignado:</span>
                  <span className="font-bold text-slate-900">
                    Q{limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Deuda Activa en Créditos:</span>
                  <span className={`font-bold ${deudaActiva > 0 ? 'text-warning-700' : 'text-slate-600'}`}>
                    Q{deudaActiva.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="p-3.5 bg-gradient-to-br from-brand-50 to-teal-50 border border-brand-200 rounded-lg flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-900 block">
                      Cupo Disponible
                    </span>
                    <span className="text-xs text-brand-700">Para nuevas solicitudes</span>
                  </div>
                  <span className="text-lg font-black text-brand-800 font-mono">
                    Q{cupoDisponible.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 text-xs text-slate-500">
                  <span title="Máximo 2 solicitudes de crédito simultáneas en revisión u homologación">
                    Solicitudes activas en evaluación:
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      solicitudesPendientesCount >= 2
                        ? 'bg-warning-100 text-warning-800 border border-warning-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {solicitudesPendientesCount} de 2 permitidas
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tarjeta de Resumen */}
          <div className="bg-brand-900 p-6 sm:p-8 rounded-lg text-white space-y-6 relative overflow-hidden">
            
            <h3 className="text-base font-bold border-b border-white/10 pb-3 flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-brand-300" />
              <span>
                {solicitudPendienteFirma
                  ? `Condiciones Folio #${solicitudPendienteFirma.id_solicitud_credito}`
                  : 'Resumen de Cuota Estimada'}
              </span>
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-200">Monto total:</span>
                <span className="font-bold">
                  Q{parseFloat(solicitudPendienteFirma ? solicitudPendienteFirma.monto_solicitado : monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-200">Plazo amortización:</span>
                <span className="font-bold">
                  {solicitudPendienteFirma ? solicitudPendienteFirma.plazo_meses : plazo} meses
                </span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-200">Tasa Anual:</span>
                <span className="font-semibold text-brand-300">{tasaAnual}% Fija</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-200">Acreditación a:</span>
                <span className="font-semibold text-brand-300 text-xs text-right max-w-[200px] truncate">
                  {solicitudPendienteFirma
                    ? (solicitudPendienteFirma.cuenta_destino_info || solicitudPendienteFirma.cuenta_bancaria_destino_numero)
                    : (cuentasAcreditacion.find((c) => c.key === selectedCuentaKey)?.etiqueta_tipo || 'Cuenta Bancaria')}
                </span>
              </div>

              <div className="border-t border-white/10 pt-4 mt-2">
                <span className="text-xs text-brand-200 block mb-1">
                  {solicitudPendienteFirma ? 'Cuota Mensual Pactada' : 'Cuota Mensual Estimada'}
                </span>
                <span className="text-3xl font-extrabold tracking-tight">
                  Q{parseFloat(solicitudPendienteFirma ? solicitudPendienteFirma.cuota_mensual_estimada : cuota).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-brand-300 block mt-1">
                  * Amortización nivelada francesa. No incluye seguros.
                </span>
              </div>
            </div>
          </div>

          {/* Requisitos Informativos */}
          <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Requisitos de Préstamo
            </h4>
            <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
              <li>Membresía activa en la Cooperativa.</li>
              <li>Aportaciones ordinarias al día.</li>
              <li>Capacidad de pago verificable.</li>
              <li>Aprobación sujeta a políticas del comité de créditos.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Historial de Solicitudes (Seguimiento) */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-slate-800">
            Historial de mis Solicitudes
          </h3>
          <button
            onClick={fetchCreditos}
            className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
            <p className="text-xs">Actualizando historial...</p>
          </div>
        ) : creditos.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No posee solicitudes registradas.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Folio / Fecha</th>
                  <th className="px-4 py-3 font-semibold text-right">Monto</th>
                  <th className="px-4 py-3 font-semibold text-center">Plazo</th>
                  <th className="px-4 py-3 font-semibold text-right">Cuota Estimada</th>
                  <th className="px-4 py-3 font-semibold">Cuenta Acreditación</th>
                  <th className="px-4 py-3 font-semibold text-center">Expediente</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado de Solicitud</th>
                  <th className="px-4 py-3 font-semibold">Seguimiento / Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditos.map((c) => (
                  <tr key={c.id_solicitud_credito} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      <span className="font-mono font-bold text-slate-900 block">#{c.id_solicitud_credito}</span>
                      <span className="text-xs text-slate-400">{new Date(c.fecha_solicitud).toLocaleDateString()}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                      Q{parseFloat(c.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-700 text-xs">
                      {c.plazo_meses} meses
                    </td>
                    <td className="px-4 py-3.5 text-right text-brand-800 font-semibold">
                      Q{parseFloat(c.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                      {c.cuenta_destino_info || (c.cuenta_bancaria_destino_numero ? `Cuenta Bancaria (${c.cuenta_bancaria_destino_numero})` : 'Cuenta Principal')}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {c.documento_firmado_url ? (
                        <a
                          href={getSecureDocumentUrl(c.documento_firmado_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2.5 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold border border-brand-200 transition-colors"
                          title="Descargar o ver documento PDF firmado"
                        >
                          <FileCheck className="w-3.5 h-3.5 mr-1 text-brand-600" />
                          <span>Ver PDF</span>
                        </a>
                      ) : c.estado === 'PENDIENTE_FIRMA' ? (
                        <button
                          type="button"
                          onClick={() => handleDescargarPdfDeSolicitud(c)}
                          className="inline-flex items-center px-2.5 py-1 rounded-md bg-warning-50 hover:bg-warning-100 text-warning-800 text-xs font-bold border border-warning-300 transition-colors cursor-pointer"
                          title="Descargar formulario oficial prellenado para firma"
                        >
                          <Download className="w-3.5 h-3.5 mr-1 text-warning-600" />
                          <span>Descargar PDF</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sin adjunto</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getCreditBadgeColor(c.estado)}`}>
                        {getCreditBadgeLabel(c.estado)}
                      </span>
                      {['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'].includes(c.estado) && (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() => openCancelarModal(c)}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                            title="Desistir de esta solicitud y liberar espacio de evaluación"
                          >
                            <X className="w-3 h-3 mr-1 text-rose-500" />
                            <span>Desistir / Cancelar</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs max-w-xs space-y-1">
                      {c.observaciones_ejecutivo && (
                        <div className="p-1.5 rounded-lg bg-warning-50 border border-warning-200 text-warning-900 text-xs">
                          <strong>Comité Ejecutivo:</strong> "{c.observaciones_ejecutivo}"
                        </div>
                      )}
                      {c.dictamen_operador && (
                        <div className="text-xs text-slate-600">
                          <strong>Operador:</strong> "{c.dictamen_operador}"
                        </div>
                      )}
                      {!c.observaciones_ejecutivo && !c.dictamen_operador && (
                        <span className="text-slate-500 truncate block">{c.observaciones || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Corporativo de Confirmación para Desistir / Cancelar */}
      <ConfirmModal
        isOpen={!!solicitudACancelar}
        onClose={closeCancelarModal}
        onConfirm={handleConfirmarCancelacion}
        loading={cancelando}
        title="¿Desistir y Cancelar esta Solicitud?"
        subtitle={solicitudACancelar ? `Folio Oficial #${solicitudACancelar.id_solicitud_credito}` : ''}
        message="¿Está seguro de que desea desistir y cancelar esta solicitud de crédito? Esta acción liberará de inmediato su cupo de evaluación para permitirle calcular y emitir una nueva solicitud con las condiciones que prefiera."
        details={
          solicitudACancelar
            ? [
                {
                  label: 'Monto Solicitado',
                  value: `Q${parseFloat(solicitudACancelar.monto_solicitado || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
                },
                {
                  label: 'Plazo',
                  value: `${solicitudACancelar.plazo_meses} meses`,
                },
                ...(solicitudACancelar.cuota_mensual_estimada
                  ? [
                      {
                        label: 'Cuota Mensual Estimada',
                        value: `Q${parseFloat(solicitudACancelar.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
                        highlight: true,
                      },
                    ]
                  : []),
                ...(solicitudACancelar.cuenta_destino_info || solicitudACancelar.cuenta_bancaria_destino_numero
                  ? [
                      {
                        label: 'Cuenta de Acreditación',
                        value:
                          solicitudACancelar.cuenta_destino_info ||
                          `Cuenta Bancaria (${solicitudACancelar.cuenta_bancaria_destino_numero})`,
                      },
                    ]
                  : []),
              ]
            : []
        }
        confirmText="Sí, Desistir y Cancelar"
        cancelText="No, Mantener Solicitud"
        variant="danger"
      />
    </div>
  );
};

export default CreditSimulatorPage;
