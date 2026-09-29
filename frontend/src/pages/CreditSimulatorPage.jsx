import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generateCreditApplicationPdf } from '../utils/creditApplicationPdf';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { getSecureDocumentUrl } from '../utils/documentUrl';
import { Download, FileCheck, FileText, RefreshCw, Send, Trash2, UploadCloud } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  cn,
} from '../components/ui';
import { creditDestination } from '../components/credit/CreditTerms';
import { formatDate, formatQ, humanize } from '../utils/format';

/** Marca que el backend agrega a las observaciones cuando el asociado desiste. */
const MARCA_CANCELADA = '[Cancelada voluntariamente por el asociado]';
const esCancelada = (c) => c.estado === 'RECHAZADA' && (c.observaciones || '').includes(MARCA_CANCELADA);
const limpiarObservaciones = (texto) => (texto || '').replace(MARCA_CANCELADA, '').trim();

/** Estados de la solicitud vistos por el asociado. */
const ESTADOS = {
  PENDIENTE_FIRMA: { label: 'Falta firmar', tone: 'warning' },
  PENDIENTE: { label: 'En revisión', tone: 'brand' },
  EN_REVISION_OPERADOR: { label: 'En revisión', tone: 'brand' },
  EN_AUTORIZACION_EJECUTIVO: { label: 'En autorización', tone: 'brand' },
  DEVUELTA_OPERADOR: { label: 'Devuelta para corregir', tone: 'warning' },
  APROBADA: { label: 'Aprobada', tone: 'success' },
  APROBADO: { label: 'Aprobada', tone: 'success' },
  DESEMBOLSADA: { label: 'Desembolsada', tone: 'success' },
  RECHAZADA: { label: 'Denegada', tone: 'danger' },
  RECHAZADO: { label: 'Denegada', tone: 'danger' },
  DENEGADA: { label: 'Denegada', tone: 'danger' },
};
const estadoSolicitud = (c) =>
  esCancelada(c) ? { label: 'Cancelada por usted', tone: 'neutral' } : ESTADOS[c.estado] || { label: humanize(c.estado), tone: 'neutral' };

const ESTADOS_EN_TRAMITE = ['PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR'];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Fila de una lista de definiciones. */
const Row = ({ label, children, className }) => (
  <div className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2', className)}>
    <dt className="text-sm text-ink-muted">{label}</dt>
    <dd className="text-sm text-ink tabular-nums">{children}</dd>
  </div>
);

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

  const cuentaSeleccionada = cuentasAcreditacion.find((c) => c.key === selectedCuentaKey);
  const resumen = solicitudPendienteFirma
    ? {
        monto: solicitudPendienteFirma.monto_solicitado,
        plazo: solicitudPendienteFirma.plazo_meses,
        cuota: solicitudPendienteFirma.cuota_mensual_estimada,
        destino: creditDestination(solicitudPendienteFirma),
      }
    : {
        monto,
        plazo,
        cuota,
        destino: cuentaSeleccionada ? `${cuentaSeleccionada.etiqueta_tipo || `Cuenta ${cuentaSeleccionada.tipo_cuenta}`} · ${cuentaSeleccionada.numero_cuenta}` : '—',
      };

  return (
    <div>
      <PageHeader
        title="Simulador de crédito"
        description={`Calcule su cuota mensual y envíe su solicitud. Tasa fija de ${tasaAnual} % anual, con cuotas iguales cada mes.`}
      />

      <div className="space-y-6">
        {limitePendientesAlcanzado && (
          <Alert tone="warning" title="Ya tiene 2 solicitudes en trámite">
            Es el máximo permitido. Podrá enviar otra cuando se resuelva alguna de ellas, o si desiste de una en el historial.
          </Alert>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Izquierda: firma de la solicitud en curso o formulario de simulación */}
          <div className="lg:col-span-7">
            {solicitudPendienteFirma ? (
              <Card>
                <CardHeader
                  title={`Solicitud #${solicitudPendienteFirma.id_solicitud_credito}: falta su firma`}
                  description={`Registrada el ${formatDate(solicitudPendienteFirma.fecha_solicitud)}. Las condiciones ya no cambian; si quiere otras, desista y haga una nueva.`}
                  actions={<Badge tone="warning">Falta firmar</Badge>}
                />
                <CardBody className="space-y-6">
                  <ol className="space-y-6">
                    <li className="flex gap-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-800" aria-hidden="true">1</span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-ink">Descargue el formulario</p>
                          <p className="text-sm text-ink-muted">Ya trae sus datos y las condiciones de la solicitud.</p>
                        </div>
                        <Button variant="secondary" icon={Download} onClick={() => handleDescargarPdfDeSolicitud(solicitudPendienteFirma)}>
                          Descargar formulario (PDF)
                        </Button>
                      </div>
                    </li>

                    <li className="flex gap-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-800" aria-hidden="true">2</span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-ink">Fírmelo y adjúntelo</p>
                          <p className="text-sm text-ink-muted">Firma a mano o digital. PDF, PNG o JPG de hasta 12 MB.</p>
                        </div>
                        {!archivoFirmadoBase64 ? (
                          // El input queda accesible con teclado (sr-only), no oculto con `hidden`.
                          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong px-4 py-6 text-center transition-colors hover:border-brand-600 hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-600">
                            <UploadCloud className="w-6 h-6 text-ink-subtle" aria-hidden="true" />
                            <span className="text-sm font-medium text-brand-700">Elegir el archivo firmado</span>
                            <span className="text-xs text-ink-subtle">Del formulario de la solicitud #{solicitudPendienteFirma.id_solicitud_credito}</span>
                            <input
                              type="file"
                              accept=".pdf,image/png,image/jpeg,image/jpg"
                              onChange={handleFileChange}
                              className="sr-only"
                            />
                          </label>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success-200 bg-success-50 px-4 py-2.5 text-sm">
                            <span className="flex min-w-0 items-center gap-2 text-success-900">
                              <FileCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                              <span className="truncate font-medium" title={archivoFirmadoNombre}>{archivoFirmadoNombre}</span>
                              <span className="shrink-0 text-success-800">{kb(archivoFirmadoSize)}</span>
                            </span>
                            <Button size="sm" variant="ghostDanger" icon={Trash2} onClick={handleRemoveFile}>
                              Quitar
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  </ol>

                  <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="ghostDanger"
                      onClick={() => openCancelarModal(solicitudPendienteFirma)}
                      disabled={submitting || cancelando}
                    >
                      Desistir de esta solicitud
                    </Button>
                    <Button
                      icon={Send}
                      onClick={() => handleSubirExpediente(solicitudPendienteFirma.id_solicitud_credito)}
                      disabled={submitting || !archivoFirmadoBase64}
                      loading={submitting}
                      loadingText="Enviando…"
                    >
                      Enviar solicitud firmada
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Calcule su crédito" />
                <CardBody>
                  <form onSubmit={handleIniciarSolicitud} className="space-y-6">
                    <div className="space-y-2">
                      <Field
                        label="Monto"
                        className="sm:max-w-sm"
                        hint={montoExcedeCupo ? undefined : `Desde Q500. Su cupo disponible es ${formatQ(cupoDisponible)}.`}
                        error={montoExcedeCupo ? `Supera su cupo disponible de ${formatQ(cupoDisponible)}.` : undefined}
                      >
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={500}
                          max={500000}
                          step={100}
                          prefix="Q"
                          value={monto}
                          onChange={(e) => setMonto(Math.max(500, parseFloat(e.target.value) || 0))}
                          className="tabular-nums"
                        />
                      </Field>
                      <input
                        type="range"
                        min={500}
                        max={Math.max(10000, Math.min(cupoDisponible > 0 ? cupoDisponible : 100000, 150000))}
                        step={500}
                        value={monto}
                        onChange={(e) => setMonto(parseFloat(e.target.value))}
                        aria-label="Monto (control deslizante)"
                        aria-valuetext={formatQ(monto)}
                        className="w-full cursor-pointer accent-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Field label="Plazo" hint="De 3 a 120 meses." className="sm:max-w-sm">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={3}
                          max={120}
                          value={plazo}
                          onChange={(e) => setPlazo(Math.max(3, parseInt(e.target.value, 10) || 0))}
                          trailing={<span className="pr-2 text-sm text-ink-subtle" aria-hidden="true">meses</span>}
                          className="tabular-nums pr-16"
                        />
                      </Field>
                      <input
                        type="range"
                        min={3}
                        max={60}
                        step={1}
                        value={plazo}
                        onChange={(e) => setPlazo(parseInt(e.target.value, 10))}
                        aria-label="Plazo (control deslizante)"
                        aria-valuetext={`${plazo} meses`}
                        className="w-full cursor-pointer accent-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-sm"
                      />
                    </div>

                    {/* Cuenta donde se acreditará el crédito */}
                    {loadingCuentas ? (
                      <LoadingState label="Cargando sus cuentas…" className="py-6" />
                    ) : cuentasAcreditacion.length === 0 ? (
                      <Alert tone="warning">
                        No encontramos una cuenta del banco activa (monetaria o de ahorro) para recibir el dinero.
                      </Alert>
                    ) : (
                      <fieldset>
                        <legend className="mb-1 text-sm font-medium text-ink-soft">Se acredita en</legend>
                        <p className="mb-2 text-xs text-ink-subtle">
                          {cuentasAcreditacion.length === 1
                            ? 'Es su única cuenta del banco activa.'
                            : 'Elija la cuenta del banco que recibirá el dinero si se aprueba.'}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {cuentasAcreditacion.map((cta) => {
                            const checked = selectedCuentaKey === cta.key;
                            return (
                              <label
                                key={cta.key}
                                className={cn(
                                  'block cursor-pointer rounded-md border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600',
                                  checked ? 'border-brand-700 bg-brand-50' : 'border-line hover:border-line-strong'
                                )}
                              >
                                <input
                                  type="radio"
                                  name="cuenta-acreditacion"
                                  className="sr-only"
                                  checked={checked}
                                  onChange={() => setSelectedCuentaKey(cta.key)}
                                />
                                <span className="block font-medium text-ink">{cta.etiqueta_tipo || `Cuenta ${cta.tipo_cuenta}`}</span>
                                <span className="block font-mono text-xs text-ink-soft">{cta.numero_cuenta}</span>
                                <span className="mt-1 block text-xs text-ink-subtle tabular-nums">Saldo {formatQ(cta.saldo_disponible)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}

                    <Field label="¿Para qué es el crédito?" hint="Opcional. Por ejemplo: mejoras de vivienda o capital de trabajo.">
                      <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} />
                    </Field>

                    <div className="space-y-2 border-t border-line pt-5">
                      <Button type="submit" size="lg" fullWidth disabled={isFormDisabled} loading={submitting} loadingText="Registrando…">
                        <FileText className="w-4 h-4" aria-hidden="true" />
                        Solicitar este crédito
                      </Button>
                      <p className="text-center text-xs text-ink-subtle">
                        {limitePendientesAlcanzado
                          ? 'Ya tiene 2 solicitudes en trámite.'
                          : montoExcedeCupo
                          ? 'Reduzca el monto para continuar.'
                          : 'Se registra la solicitud y se descarga el formulario para que lo firme.'}
                      </p>
                    </div>
                  </form>
                </CardBody>
              </Card>
            )}
          </div>

          {/* Derecha: cuota y capacidad */}
          <div className="space-y-6 lg:col-span-5">
            <Card className="border-brand-200">
              <CardBody>
                <p className="text-sm text-ink-muted">
                  {solicitudPendienteFirma ? `Cuota de la solicitud #${solicitudPendienteFirma.id_solicitud_credito}` : 'Su cuota mensual estimada'}
                </p>
                <p className="mt-1 text-3xl font-semibold text-ink tabular-nums" aria-live="polite">
                  {formatQ(resumen.cuota)}
                </p>
                <dl className="mt-4 divide-y divide-line border-t border-line">
                  <Row label="Monto">{formatQ(resumen.monto)}</Row>
                  <Row label="Plazo">{resumen.plazo} meses</Row>
                  <Row label="Tasa">{tasaAnual} % anual fija</Row>
                  <Row label="Se acredita en" className="[&_dd]:text-right [&_dd]:font-sans">{resumen.destino}</Row>
                </dl>
                <p className="mt-3 text-xs text-ink-subtle">Cuotas iguales cada mes. No incluye seguros.</p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Su capacidad de crédito"
                as="h2"
                actions={capacidadInfo?.capacidad?.nivel && <Badge tone="brand">{humanize(capacidadInfo.capacidad.nivel)}</Badge>}
              />
              <CardBody>
                {loadingCapacidad ? (
                  <LoadingState label="Consultando…" className="py-6" />
                ) : (
                  <>
                    <p className="text-sm text-ink-muted">Cupo disponible</p>
                    <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{formatQ(cupoDisponible)}</p>
                    <dl className="mt-4 divide-y divide-line border-t border-line">
                      <Row label="Ahorro total">{formatQ(saldoTotal)}</Row>
                      <Row label="Límite asignado">{formatQ(limiteMaximo)}</Row>
                      <Row label="Deuda en créditos">
                        <span className={deudaActiva > 0 ? 'text-warning-800' : undefined}>{formatQ(deudaActiva)}</span>
                      </Row>
                      <Row label="Solicitudes en trámite">
                        <span className={solicitudesPendientesCount >= 2 ? 'font-medium text-warning-800' : undefined}>
                          {solicitudesPendientesCount} de 2
                        </span>
                      </Row>
                    </dl>
                  </>
                )}
              </CardBody>
            </Card>

            <section aria-labelledby="requisitos-credito" className="px-1">
              <h2 id="requisitos-credito" className="text-sm font-medium text-ink">Requisitos</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                <li>Ser asociado activo.</li>
                <li>Tener sus aportaciones al día.</li>
                <li>Poder demostrar su capacidad de pago.</li>
                <li>La aprobación depende del comité de créditos.</li>
              </ul>
            </section>
          </div>
        </div>

        {/* Historial */}
        <Card>
          <CardHeader
            title="Mis solicitudes"
            actions={
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={fetchCreditos} disabled={loading}>
                Actualizar
              </Button>
            }
          />
          {loading ? (
            <LoadingState label="Cargando sus solicitudes…" />
          ) : creditos.length === 0 ? (
            <EmptyState icon={FileText} title="Aún no tiene solicitudes" description="Cuando solicite un crédito, podrá seguirlo aquí." />
          ) : (
            <Table bordered={false} caption="Mis solicitudes de crédito">
              <THead>
                <TR>
                  <TH>Solicitud</TH>
                  <TH numeric>Monto</TH>
                  <TH>Plazo y cuota</TH>
                  <TH>Se acredita en</TH>
                  <TH>Estado</TH>
                  <TH>Comentarios</TH>
                  <TH>Documento</TH>
                  <TH sticky><span className="sr-only">Acciones</span></TH>
                </TR>
              </THead>
              <TBody>
                {creditos.map((c) => {
                  const st = estadoSolicitud(c);
                  const enTramite = ESTADOS_EN_TRAMITE.includes(c.estado);
                  const nota = limpiarObservaciones(c.observaciones);
                  return (
                    <TR key={c.id_solicitud_credito} highlight={c.estado === 'PENDIENTE_FIRMA' ? 'warning' : 'none'}>
                      <TD className="whitespace-nowrap">
                        <div className="font-mono text-ink">#{c.id_solicitud_credito}</div>
                        <div className="text-xs text-ink-subtle">{formatDate(c.fecha_solicitud)}</div>
                      </TD>
                      <TD numeric className="font-medium text-ink">{formatQ(c.monto_solicitado)}</TD>
                      <TD className="whitespace-nowrap">
                        <div>{c.plazo_meses} meses</div>
                        <div className="text-xs text-ink-subtle tabular-nums">{formatQ(c.cuota_mensual_estimada)}/mes</div>
                      </TD>
                      <TD className="min-w-[10rem] max-w-[14rem]">
                        <span className="line-clamp-2" title={creditDestination(c)}>{creditDestination(c)}</span>
                      </TD>
                      <TD className="whitespace-nowrap"><Badge tone={st.tone}>{st.label}</Badge></TD>
                      <TD className="min-w-[12rem] max-w-xs space-y-1">
                        {c.observaciones_ejecutivo && (
                          <p className="line-clamp-3" title={c.observaciones_ejecutivo}>
                            <span className="font-medium text-ink">Comité:</span> {c.observaciones_ejecutivo}
                          </p>
                        )}
                        {c.dictamen_operador && (
                          <p className="line-clamp-3 text-ink-muted" title={c.dictamen_operador}>
                            <span className="font-medium text-ink-soft">Operador:</span> {c.dictamen_operador}
                          </p>
                        )}
                        {!c.observaciones_ejecutivo && !c.dictamen_operador && (
                          <span className="line-clamp-2 text-ink-subtle" title={nota || undefined}>{nota || '—'}</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {c.documento_firmado_url ? (
                          <a
                            href={getSecureDocumentUrl(c.documento_firmado_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir el documento firmado en una pestaña nueva"
                            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                          >
                            <FileCheck className="w-4 h-4" aria-hidden="true" />
                            PDF firmado
                          </a>
                        ) : c.estado === 'PENDIENTE_FIRMA' ? (
                          <Button size="sm" variant="secondary" icon={Download} onClick={() => handleDescargarPdfDeSolicitud(c)}>
                            Formulario
                          </Button>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </TD>
                      <TD sticky className="whitespace-nowrap text-center">
                        {enTramite ? (
                          <Button
                            size="sm"
                            variant="ghostDanger"
                            onClick={() => openCancelarModal(c)}
                            aria-label={`Desistir de la solicitud #${c.id_solicitud_credito}`}
                          >
                            Desistir
                          </Button>
                        ) : (
                          <span className="text-ink-subtle" aria-hidden="true">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <ConfirmModal
        isOpen={!!solicitudACancelar}
        onClose={closeCancelarModal}
        onConfirm={handleConfirmarCancelacion}
        loading={cancelando}
        title="¿Desistir de esta solicitud?"
        subtitle={solicitudACancelar ? `Solicitud #${solicitudACancelar.id_solicitud_credito}` : ''}
        message="La solicitud se cancela y deja libre su espacio de trámite, para que pueda pedir un crédito con otras condiciones."
        details={
          solicitudACancelar
            ? [
                { label: 'Monto', value: formatQ(solicitudACancelar.monto_solicitado) },
                { label: 'Plazo', value: `${solicitudACancelar.plazo_meses} meses` },
                ...(solicitudACancelar.cuota_mensual_estimada
                  ? [{ label: 'Cuota mensual', value: formatQ(solicitudACancelar.cuota_mensual_estimada), highlight: true }]
                  : []),
                ...(solicitudACancelar.cuenta_destino_info || solicitudACancelar.cuenta_bancaria_destino_numero
                  ? [{ label: 'Se acredita en', value: creditDestination(solicitudACancelar) }]
                  : []),
              ]
            : []
        }
        note="No se puede deshacer. Podrá hacer una nueva simulación cuando quiera."
        confirmText="Sí, desistir"
        cancelText="No, mantenerla"
        variant="danger"
      />
    </div>
  );
};

export default CreditSimulatorPage;
