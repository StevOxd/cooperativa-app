import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getSecureDocumentUrl } from '../utils/documentUrl';
import OperatorCreditEvaluationModal from '../components/operator/modals/OperatorCreditEvaluationModal';
import OperatorAffiliationModal from '../components/operator/modals/OperatorAffiliationModal';
import OperatorAffiliationSuccessModal from '../components/operator/modals/OperatorAffiliationSuccessModal';
import OperatorTrasladoModal from '../components/operator/modals/OperatorTrasladoModal';
import { generateAccountOpeningReceiptPdf } from '../utils/accountOpeningReceiptPdf';
import {
  Inbox,
  CheckCircle,
  CheckCircle2,
  FileDown,
  XCircle,
  Loader2,
  AlertCircle,
  Check,
  X,
  FileText,
  Clock,
  RefreshCw,
  Send,
  Building2,
  ShieldAlert,
  Search,
  UserCheck,
  UserPlus,
  Lock,
  Unlock,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  AlertTriangle,
  User,
  Calculator,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  Info,
  Eye,
  FileCheck,
  ExternalLink,
} from 'lucide-react';

const formatDateOnly = (dateStr) => {
  if (!dateStr) return '-';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export const OperatorDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Pestaña activa: 'afiliaciones' (por defecto) o 'traslados'
  const [activeTab, setActiveTab] = useState('afiliaciones');

  // Estados para Afiliaciones en Agencia
  const [afiliaciones, setAfiliaciones] = useState([]);
  const [loadingAfiliaciones, setLoadingAfiliaciones] = useState(true);
  const [searchAfiliacion, setSearchAfiliacion] = useState('');
  const [filterAfiliacionEstado, setFilterAfiliacionEstado] = useState('TODOS');

  // Estados para Traslados y Aperturas
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingTraslados, setLoadingTraslados] = useState(true);

  // Estados para Historial de Traslados por Asociado (Req-4)
  const [subTabTraslados, setSubTabTraslados] = useState('pendientes'); // 'pendientes' | 'historial'
  const [historialTraslados, setHistorialTraslados] = useState([]);
  const [loadingHistorialTraslados, setLoadingHistorialTraslados] = useState(false);
  const [searchHistorialTraslados, setSearchHistorialTraslados] = useState('');
  const [filterHistorialEstado, setFilterHistorialEstado] = useState('TODOS');

  // Estados para Solicitudes de Crédito
  const [creditos, setCreditos] = useState([]);
  const [loadingCreditos, setLoadingCreditos] = useState(true);
  const [searchCredito, setSearchCredito] = useState('');
  const [selectedCredito, setSelectedCredito] = useState(null);
  const [actionCreditoType, setActionCreditoType] = useState(''); // 'APROBAR' | 'RECHAZAR'
  const [observacionesCredito, setObservacionesCredito] = useState('');
  const [resolvingCredito, setResolvingCredito] = useState(false);
  const [evaluacionData, setEvaluacionData] = useState(null);
  const [loadingEvaluacion, setLoadingEvaluacion] = useState(false);
  const [activeEvalTab, setActiveEvalTab] = useState('scoring'); // 'scoring' | 'transacciones'

  // Estados del modal de Atención y Formalización de Afiliación
  const [selectedAfiliacion, setSelectedAfiliacion] = useState(null);
  const [lockingCaso, setLockingCaso] = useState(false);
  const [montoAportacion, setMontoAportacion] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO_VENTANILLA');
  const [tipoAsociado, setTipoAsociado] = useState('EX');
  const [passwordInicial, setPasswordInicial] = useState('admin123');
  const [observacionesAfiliacion, setObservacionesAfiliacion] = useState('');
  const [formalizando, setFormalizando] = useState(false);

  // Estados de datos del solicitante editables en ventanilla
  const [editPrimerNombre, setEditPrimerNombre] = useState('');
  const [editSegundoNombre, setEditSegundoNombre] = useState('');
  const [editPrimerApellido, setEditPrimerApellido] = useState('');
  const [editSegundoApellido, setEditSegundoApellido] = useState('');
  const [editCuiDpi, setEditCuiDpi] = useState('');
  const [editFechaNacimiento, setEditFechaNacimiento] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDireccion, setEditDireccion] = useState('');

  // Validación de disponibilidad de correo en el modal del operador
  const [operatorEmailStatus, setOperatorEmailStatus] = useState({
    checking: false,
    disponible: null,
    message: '',
  });

  useEffect(() => {
    if (!selectedAfiliacion) {
      setOperatorEmailStatus({ checking: false, disponible: null, message: '' });
      return;
    }

    const rawEmail = editEmail ? editEmail.trim() : '';
    if (!rawEmail) {
      setOperatorEmailStatus({ checking: false, disponible: null, message: '' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setOperatorEmailStatus({
        checking: false,
        disponible: false,
        message: 'Formato de correo inválido.',
      });
      return;
    }

    setOperatorEmailStatus({ checking: true, disponible: null, message: 'Verificando...' });

    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/afiliacion/verificar-email', {
          email: rawEmail,
          excluir_id_solicitud: selectedAfiliacion?.id_solicitud,
        });
        if (res.data.disponible) {
          setOperatorEmailStatus({
            checking: false,
            disponible: true,
            message: 'Correo disponible.',
          });
        } else {
          setOperatorEmailStatus({
            checking: false,
            disponible: false,
            message: res.data.message || 'Este correo ya pertenece a otro usuario.',
          });
        }
      } catch (err) {
        setOperatorEmailStatus({ checking: false, disponible: null, message: '' });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [editEmail, selectedAfiliacion]);

  // Estado para rechazo de afiliación
  const [showRechazarAfiliacion, setShowRechazarAfiliacion] = useState(false);
  const [motivoRechazoAfiliacion, setMotivoRechazoAfiliacion] = useState('');
  const [rechazandoAfiliacion, setRechazandoAfiliacion] = useState(false);

  // Modal de Éxito de Formalización
  const [formalizadoResult, setFormalizadoResult] = useState(null);

  // Estados del modal resolutivo de Traslados
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [actionType, setActionType] = useState(''); // 'APROBAR' o 'RECHAZAR'
  const [observacionesTraslado, setObservacionesTraslado] = useState('');
  const [resolvingTraslado, setResolvingTraslado] = useState(false);

  // 1. Cargar Afiliaciones de Agencia
  const fetchAfiliaciones = async (search = '') => {
    try {
      setLoadingAfiliaciones(true);
      const url = search.trim()
        ? `/operador/afiliaciones?search=${encodeURIComponent(search.trim())}`
        : '/operador/afiliaciones';
      const response = await api.get(url);
      if (response.data?.success) {
        setAfiliaciones(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar afiliaciones de operador:', err);
      toast.error('No se pudo cargar la bandeja de afiliaciones.');
    } finally {
      setLoadingAfiliaciones(false);
    }
  };

  // 2. Cargar Traslados y Aperturas
  const fetchTraslados = async () => {
    try {
      setLoadingTraslados(true);
      const response = await api.get('/operador/bandeja-solicitudes');
      if (response.data?.success) {
        setSolicitudes(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar traslados de operador:', err);
      toast.error('No se pudo cargar la bandeja de traslados.');
    } finally {
      setLoadingTraslados(false);
    }
  };

  // 3. Cargar Solicitudes de Crédito
  const fetchCreditos = async () => {
    try {
      setLoadingCreditos(true);
      const response = await api.get('/operador/creditos');
      if (response.data?.success) {
        setCreditos(response.data.data);
      }
    } catch (err) {
      console.error('Error al cargar créditos de operador:', err);
      toast.error('No se pudo cargar la bandeja de créditos.');
    } finally {
      setLoadingCreditos(false);
    }
  };

  // 4. Cargar Historial de Traslados por Asociado (Req-4)
  const fetchHistorialTraslados = async (searchTerm = searchHistorialTraslados, estadoFilter = filterHistorialEstado) => {
    try {
      setLoadingHistorialTraslados(true);
      const params = {};
      if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();
      if (estadoFilter && estadoFilter !== 'TODOS') params.estado = estadoFilter;
      const res = await api.get('/operador/traslados/historial', { params });
      if (res.data?.success) {
        setHistorialTraslados(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar historial de traslados:', err);
      toast.error('No se pudo cargar el historial de traslados.');
    } finally {
      setLoadingHistorialTraslados(false);
    }
  };

  const refreshAll = () => {
    fetchAfiliaciones(searchAfiliacion);
    fetchTraslados();
    fetchCreditos();
    if (subTabTraslados === 'historial') {
      fetchHistorialTraslados();
    }
  };

  useEffect(() => {
    fetchAfiliaciones();
    fetchTraslados();
    fetchCreditos();
  }, []);

  // Bloquear scroll de la página de fondo cuando cualquier modal esté abierto
  useEffect(() => {
    const isAnyModalOpen = !!(selectedAfiliacion || formalizadoResult || (selectedSolicitud && actionType) || selectedCredito);
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedAfiliacion, formalizadoResult, selectedSolicitud, actionType, selectedCredito]);

  // Contadores por estado de solicitudes de afiliación
  const afiliacionesPendientesCount = useMemo(
    () => afiliaciones.filter((a) => a.estado === 'PENDIENTE_AGENCIA').length,
    [afiliaciones]
  );
  const afiliacionesAtendidasCount = useMemo(
    () => afiliaciones.filter((a) => a.estado === 'ATENDIDA').length,
    [afiliaciones]
  );
  const afiliacionesCanceladasCount = useMemo(
    () => afiliaciones.filter((a) => a.estado === 'CANCELADA').length,
    [afiliaciones]
  );

  // Filtrado dinámico en memoria para respuesta instantánea al tipear y filtro de estado
  const filteredAfiliaciones = useMemo(() => {
    let list = afiliaciones;
    if (filterAfiliacionEstado !== 'TODOS') {
      list = list.filter((a) => a.estado === filterAfiliacionEstado);
    }
    if (!searchAfiliacion.trim()) return list;
    const term = searchAfiliacion.toLowerCase().trim();
    return list.filter((a) => {
      const caso = (a.numero_caso || '').toLowerCase();
      const dpi = (a.cui_dpi || '').toLowerCase();
      const nombre = (a.nombre_completo || `${a.primer_nombre} ${a.primer_apellido}`).toLowerCase();
      const email = (a.email || '').toLowerCase();
      const tel = (a.telefono || '').toLowerCase();
      return caso.includes(term) || dpi.includes(term) || nombre.includes(term) || email.includes(term) || tel.includes(term);
    });
  }, [afiliaciones, searchAfiliacion, filterAfiliacionEstado]);

  // Filtrado de solicitudes de crédito
  const filteredCreditos = useMemo(() => {
    if (!searchCredito.trim()) return creditos;
    const term = searchCredito.toLowerCase().trim();
    return creditos.filter((c) => {
      const idStr = String(c.id_solicitud_credito || '');
      const cui = (c.cui_dpi || '').toLowerCase();
      const nombre = `${c.primer_nombre || ''} ${c.segundo_nombre || ''} ${c.primer_apellido || ''} ${c.segundo_apellido || ''}`.toLowerCase();
      const corp = (c.codigo_corporativo || '').toLowerCase();
      const estado = (c.estado || '').toLowerCase();
      const obs = (c.observaciones || '').toLowerCase();
      return idStr.includes(term) || cui.includes(term) || nombre.includes(term) || corp.includes(term) || estado.includes(term) || obs.includes(term);
    });
  }, [creditos, searchCredito]);

  const creditosPendientesCount = useMemo(() => {
    return creditos.filter((c) =>
      ['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'].includes(c.estado)
    ).length;
  }, [creditos]);

  // =========================================================================
  // GESTIÓN Y BLOQUEO CONCURRENTE DE AFILIACIONES
  // =========================================================================
  const handleOpenAfiliacionModal = async (caso) => {
    try {
      setLockingCaso(true);
      // Intentar adquirir el bloqueo del caso
      const response = await api.post(`/operador/afiliaciones/${caso.id_solicitud}/bloquear`);
      if (response.data?.success) {
        setSelectedAfiliacion(caso);
        setEditPrimerNombre((caso.primer_nombre || '').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''));
        setEditSegundoNombre((caso.segundo_nombre || '').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''));
        setEditPrimerApellido((caso.primer_apellido || '').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''));
        setEditSegundoApellido((caso.segundo_apellido || '').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, ''));
        setEditCuiDpi((caso.cui_dpi || '').replace(/\D/g, '').slice(0, 13));
        const fNac = caso.fecha_nacimiento ? String(caso.fecha_nacimiento).split('T')[0] : '';
        setEditFechaNacimiento(fNac);
        setEditTelefono((caso.telefono || '').replace(/\D/g, '').slice(0, 8));
        setEditEmail(caso.email || '');
        setEditDireccion(caso.direccion || '');

        setMontoAportacion(caso.monto_estimado ? String(caso.monto_estimado) : '100.00');
        setMetodoPago('EFECTIVO_VENTANILLA');
        setTipoAsociado('EX');
        setPasswordInicial('admin123');
        setObservacionesAfiliacion('');
        setShowRechazarAfiliacion(false);
        setMotivoRechazoAfiliacion('');
        // Refrescar lista para reflejar el bloqueo
        fetchAfiliaciones(searchAfiliacion);
      }
    } catch (err) {
      console.error('Error al bloquear caso:', err);
      const msg = err.response?.data?.message || 'No se pudo adquirir el caso. Es posible que otro operador lo esté atendiendo.';
      toast.error(msg);
      fetchAfiliaciones(searchAfiliacion);
    } finally {
      setLockingCaso(false);
    }
  };

  const handleLiberarAfiliacion = async () => {
    if (!selectedAfiliacion) return;
    try {
      await api.post(`/operador/afiliaciones/${selectedAfiliacion.id_solicitud}/liberar`);
    } catch (err) {
      console.warn('Error al liberar caso:', err);
    } finally {
      setSelectedAfiliacion(null);
      setShowRechazarAfiliacion(false);
      fetchAfiliaciones(searchAfiliacion);
    }
  };

  const handleFormalizarSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAfiliacion) return;

    if (!editPrimerNombre.trim() || !editPrimerApellido.trim()) {
      toast.error('Primer nombre y primer apellido son campos obligatorios.');
      return;
    }

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{2,50}$/;
    if (!nameRegex.test(editPrimerNombre.trim()) || !nameRegex.test(editPrimerApellido.trim())) {
      toast.error('Los nombres y apellidos únicamente pueden contener letras, sin números ni símbolos especiales.');
      return;
    }

    if (editSegundoNombre.trim() && !nameRegex.test(editSegundoNombre.trim())) {
      toast.error('El segundo nombre únicamente puede contener letras.');
      return;
    }

    if (editSegundoApellido.trim() && !nameRegex.test(editSegundoApellido.trim())) {
      toast.error('El segundo apellido únicamente puede contener letras.');
      return;
    }

    const cleanTel = editTelefono.replace(/\D/g, '');
    if (cleanTel && cleanTel.length !== 8) {
      toast.error(`El teléfono de contacto debe contener exactamente 8 dígitos (ingresó ${cleanTel.length} dígitos).`);
      return;
    }

    if (!editCuiDpi.trim() || editCuiDpi.trim().length !== 13) {
      toast.error('El CUI / DPI debe contener exactamente 13 dígitos.');
      return;
    }

    if (!editFechaNacimiento) {
      toast.error('La fecha de nacimiento es obligatoria.');
      return;
    }

    const montoNum = parseFloat(montoAportacion);
    if (isNaN(montoNum) || montoNum < 100.0) {
      toast.error('El depósito inicial mínimo estatutario es de Q100.00.');
      return;
    }

    if (operatorEmailStatus.disponible === false) {
      toast.error(operatorEmailStatus.message || 'El correo electrónico ya se encuentra registrado por otro usuario. Modifíquelo antes de formalizar.');
      return;
    }

    if (operatorEmailStatus.checking) {
      toast.error('Verificando disponibilidad del correo electrónico. Por favor espere...');
      return;
    }

    try {
      setFormalizando(true);
      const response = await api.post(`/operador/afiliaciones/${selectedAfiliacion.id_solicitud}/formalizar`, {
        monto_aportacion: montoNum,
        metodo_pago: 'EFECTIVO_VENTANILLA',
        tipo_asociado: tipoAsociado,
        observaciones: observacionesAfiliacion,
        primer_nombre: editPrimerNombre,
        segundo_nombre: editSegundoNombre,
        primer_apellido: editPrimerApellido,
        segundo_apellido: editSegundoApellido,
        cui_dpi: editCuiDpi,
        telefono: editTelefono,
        direccion: editDireccion,
        fecha_nacimiento: editFechaNacimiento,
        email: editEmail,
      });

      if (response.data?.success) {
        const resData = response.data.data;
        toast.success(`¡Afiliación formalizada con éxito para ${resData.nombre_completo}!`);
        setFormalizadoResult(resData);
        setSelectedAfiliacion(null);
        fetchAfiliaciones(searchAfiliacion);
      }
    } catch (err) {
      console.error('Error al formalizar afiliación:', err);
      toast.error(err.response?.data?.message || 'Ocurrió un error al formalizar la afiliación.');
    } finally {
      setFormalizando(false);
    }
  };

  const handleDownloadComprobanteExistente = (caso) => {
    try {
      generateAccountOpeningReceiptPdf({
        data: {
          numero_caso: caso.numero_caso,
          nombre_completo: caso.nombre_completo || `${caso.primer_nombre} ${caso.primer_apellido}`,
          usuario: caso.asociado_codigo || 'ASOCIADO',
          numero_cuenta: caso.numero_cuenta || 'CTA-AHORR-ACTIVA',
          saldo_inicial: caso.saldo_disponible || caso.monto_estimado || 100.0,
          tipo_cuenta: 'Ahorro Corriente',
          email: caso.email,
          cui_dpi: caso.cui_dpi,
          telefono: caso.telefono,
          operador_nombre: caso.operador_resuelve_nombre || user?.nombre || user?.nombre_completo || 'Operador en Ventanilla',
        },
      });
      toast.success(`Comprobante del caso ${caso.numero_caso} descargado exitosamente.`);
    } catch (err) {
      console.error('Error al generar comprobante existente:', err);
      toast.error('No se pudo generar el comprobante PDF.');
    }
  };

  const handleRechazarAfiliacionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAfiliacion || !motivoRechazoAfiliacion.trim()) {
      toast.error('Debe ingresar un motivo detallado del rechazo.');
      return;
    }

    try {
      setRechazandoAfiliacion(true);
      const response = await api.post(`/operador/afiliaciones/${selectedAfiliacion.id_solicitud}/rechazar`, {
        motivo: motivoRechazoAfiliacion.trim(),
      });

      if (response.data?.success) {
        toast.success(`El caso ${selectedAfiliacion.numero_caso} ha sido cancelado.`);
        setSelectedAfiliacion(null);
        setShowRechazarAfiliacion(false);
        fetchAfiliaciones(searchAfiliacion);
      }
    } catch (err) {
      console.error('Error al rechazar caso de afiliación:', err);
      toast.error(err.response?.data?.message || 'Error al cancelar la solicitud.');
    } finally {
      setRechazandoAfiliacion(false);
    }
  };

  // =========================================================================
  // GESTIÓN DE TRASLADOS Y APERTURAS
  // =========================================================================
  const openResolverTrasladoModal = (sol, type) => {
    setSelectedSolicitud(sol);
    setActionType(type);
    setObservacionesTraslado(type === 'APROBAR' ? 'Traslado de fondos aprobado y procesado.' : '');
  };

  const closeResolverTrasladoModal = () => {
    setSelectedSolicitud(null);
    setActionType('');
    setObservacionesTraslado('');
  };

  const handleResolveTrasladoSubmit = async (e) => {
    e.preventDefault();
    setResolvingTraslado(true);

    try {
      const response = await api.post(`/operador/solicitudes/${selectedSolicitud.id_solicitud}/resolver`, {
        accion: actionType,
        observaciones: observacionesTraslado,
      });

      if (response.data?.success) {
        toast.success(`El caso ${selectedSolicitud.numero_caso} ha sido ${actionType === 'APROBAR' ? 'aprobado y procesado' : 'rechazado'} correctamente.`);
        closeResolverTrasladoModal();
        fetchTraslados();
      }
    } catch (err) {
      console.error('Error al resolver caso:', err);
      toast.error(err.response?.data?.message || 'Ocurrió un error al intentar resolver el caso.');
      closeResolverTrasladoModal();
    } finally {
      setResolvingTraslado(false);
    }
  };

  // =========================================================================
  // GESTIÓN DE SOLICITUDES DE CRÉDITO & EVALUACIÓN CREDITICIA
  // =========================================================================
  const openResolverCreditoModal = async (cred, type = '') => {
    setSelectedCredito(cred);
    setActionCreditoType(type);
    setActiveEvalTab(cred.documento_firmado_url ? 'documento' : 'scoring');
    setObservacionesCredito(cred.dictamen_operador || '');
    setEvaluacionData(null);
    try {
      setLoadingEvaluacion(true);
      const res = await api.get(`/operador/creditos/${cred.id_solicitud_credito}/evaluacion`);
      if (res.data?.success) {
        setEvaluacionData(res.data.data.evaluacion);
      }
    } catch (err) {
      console.error('Error al cargar evaluación crediticia:', err);
      toast.error('No se pudo cargar la evaluación y scoring del asociado.');
    } finally {
      setLoadingEvaluacion(false);
    }
  };

  const closeResolverCreditoModal = () => {
    setSelectedCredito(null);
    setActionCreditoType('');
    setObservacionesCredito('');
    setEvaluacionData(null);
    setActiveEvalTab('scoring');
  };

  const handleElevarCredito = async (archivoFirmado = null) => {
    if (!selectedCredito) return;
    if (!archivoFirmado?.base64) {
      toast.error('Es obligatorio adjuntar el archivo PDF firmado por el Operador para poder aceptar la solicitud y elevarla al Ejecutivo.');
      return;
    }
    if (!observacionesCredito.trim()) {
      toast.error('Debe ingresar su dictamen u observaciones operativas antes de elevar la solicitud al Ejecutivo.');
      return;
    }

    setResolvingCredito(true);
    try {
      const payload = {
        dictamen_operador: observacionesCredito.trim(),
      };
      if (archivoFirmado?.base64) {
        payload.documento_firmado = archivoFirmado.base64;
        payload.nombre_archivo_firmado = archivoFirmado.name;
      }

      const response = await api.post(`/operador/creditos/${selectedCredito.id_solicitud_credito}/elevar`, payload);

      if (response.data?.success) {
        toast.success(`Solicitud #${selectedCredito.id_solicitud_credito} elevada con éxito a la Gerencia Ejecutiva para dictamen final.`);
        closeResolverCreditoModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al elevar crédito:', err);
      toast.error(err.response?.data?.message || 'Error al elevar la solicitud de crédito.');
    } finally {
      setResolvingCredito(false);
    }
  };

  const handleResolveCreditoSubmit = async (accionParam, archivoFirmado = null) => {
    if (!selectedCredito) return;
    const finalAction = typeof accionParam === 'string' && accionParam ? accionParam : actionCreditoType;

    if (!finalAction || !['RECHAZAR', 'DENEGAR'].includes(finalAction)) {
      toast.error('Acción operativa inválida.');
      return;
    }

    if (!observacionesCredito.trim()) {
      toast.error('Debe ingresar el motivo detallado del rechazo en el campo de observaciones.');
      return;
    }

    setResolvingCredito(true);
    try {
      const payload = {
        accion: 'RECHAZAR',
        observaciones: observacionesCredito.trim(),
      };
      if (archivoFirmado?.base64) {
        payload.documento_firmado = archivoFirmado.base64;
        payload.nombre_archivo_firmado = archivoFirmado.name;
      }

      const response = await api.post(`/operador/creditos/${selectedCredito.id_solicitud_credito}/resolver`, payload);

      if (response.data?.success) {
        toast.success(`La solicitud de crédito #${selectedCredito.id_solicitud_credito} ha sido rechazada exitosamente.`);
        closeResolverCreditoModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al rechazar crédito:', err);
      toast.error(err.response?.data?.message || 'Ocurrió un error al procesar el rechazo de la solicitud.');
    } finally {
      setResolvingCredito(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado del Operador */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block mb-1">
            Bandeja de Operaciones
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Gestión Operativa de Casos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Operador en turno: <span className="font-semibold text-slate-800">{user?.nombre_completo || user?.nombre}</span>{' '}
            <span className="font-mono text-xs text-brand-700 font-bold">({user?.codigo_corporativo})</span>
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={loadingAfiliaciones || loadingTraslados || loadingCreditos}
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingAfiliaciones || loadingTraslados || loadingCreditos ? 'animate-spin' : ''}`} />
          <span>Actualizar Bandeja</span>
        </button>
      </div>

      {/* Pestañas Operativas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50/60 px-4 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('afiliaciones')}
            className={`pb-3 px-4 text-xs font-bold flex items-center space-x-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'afiliaciones'
                ? 'border-brand-600 text-brand-800 bg-white rounded-t-xl -mb-px'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4 text-brand-600" />
            <span>Solicitudes de Afiliación (Atención en Agencia)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'afiliaciones'
                  ? 'bg-brand-100 text-brand-800'
                  : afiliacionesPendientesCount > 0
                  ? 'bg-warning-100 text-warning-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {afiliacionesPendientesCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('traslados')}
            className={`pb-3 px-4 text-xs font-bold flex items-center space-x-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'traslados'
                ? 'border-brand-600 text-brand-800 bg-white rounded-t-xl -mb-px'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4 text-slate-600" />
            <span>Traslados de Fondos y Aperturas</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'traslados' ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {solicitudes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('creditos')}
            className={`pb-3 px-4 text-xs font-bold flex items-center space-x-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'creditos'
                ? 'border-brand-600 text-brand-800 bg-white rounded-t-xl -mb-px'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calculator className="w-4 h-4 text-brand-600" />
            <span>Solicitudes de Crédito</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'creditos'
                  ? 'bg-brand-100 text-brand-800'
                  : creditosPendientesCount > 0
                  ? 'bg-warning-100 text-warning-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {creditosPendientesCount}
            </span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* CONTENIDO PESTAÑA 1: SOLICITUDES DE AFILIACIÓN EN AGENCIA */}
        {/* ================================================================= */}
        {activeTab === 'afiliaciones' && (
          <div className="p-5 space-y-4">
            {/* Filtros por Estado de Afiliación */}
            <div className="flex flex-wrap gap-2 items-center">
              {[
                { id: 'TODOS', label: 'Todas las Solicitudes', count: afiliaciones.length },
                { id: 'PENDIENTE_AGENCIA', label: 'Pendientes de Atención', count: afiliacionesPendientesCount },
                { id: 'ATENDIDA', label: 'Formalizadas / Aceptadas', count: afiliacionesAtendidasCount },
                { id: 'CANCELADA', label: 'Canceladas / Denegadas', count: afiliacionesCanceladasCount },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setFilterAfiliacionEstado(pill.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                    filterAfiliacionEstado === pill.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      filterAfiliacionEstado === pill.id
                        ? 'bg-slate-700 text-slate-100'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchAfiliacion}
                  onChange={(e) => setSearchAfiliacion(e.target.value)}
                  placeholder="Buscar por No. Caso, CUI/DPI, Nombre o Correo..."
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600 font-medium"
                />
                {searchAfiliacion && (
                  <button
                    onClick={() => setSearchAfiliacion('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Mostrando:{' '}
                <span className="font-bold text-slate-800">{filteredAfiliaciones.length}</span>
                <span className="ml-2 text-slate-400 font-medium">({afiliacionesPendientesCount} pendientes)</span>
              </div>
            </div>

            {/* Tabla de Afiliaciones */}
            {loadingAfiliaciones ? (
              <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                <p className="text-xs font-semibold">Cargando solicitudes de afiliación...</p>
              </div>
            ) : filteredAfiliaciones.length === 0 ? (
              <div className="py-20 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle className="w-14 h-14 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No hay solicitudes de afiliación pendientes</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {searchAfiliacion
                    ? 'No se encontraron resultados para los términos de búsqueda ingresados.'
                    : 'Las solicitudes digitales generadas para atención en agencia aparecerán automáticamente aquí.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Número de Caso</th>
                      <th className="py-3 px-4">Solicitante</th>
                      <th className="py-3 px-4">CUI / DPI</th>
                      <th className="py-3 px-4">Contacto</th>
                      <th className="py-3 px-4 text-right">Monto Estimado</th>
                      <th className="py-3 px-4">Fecha Emisión</th>
                      <th className="py-3 px-4 text-center">Estado / Bloqueo</th>
                      <th className="py-3 px-4 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {filteredAfiliaciones.map((a) => {
                      const bloqueadoPorOtro = a.esta_bloqueado && !a.bloqueado_por_mi;
                      const bloqueadoPorMi = a.bloqueado_por_mi;

                      return (
                        <tr
                          key={a.id_solicitud}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            bloqueadoPorMi ? 'bg-blue-50/40' : bloqueadoPorOtro ? 'bg-warning-50/30' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 border border-slate-200">
                              {a.numero_caso}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-900 block">
                              {a.nombre_completo || `${a.primer_nombre} ${a.primer_apellido}`}
                            </span>
                            {a.fecha_nacimiento && (
                              <span className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Nac: {formatDateOnly(a.fecha_nacimiento)}</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold whitespace-nowrap">
                            {a.cui_dpi}
                          </td>

                          <td className="py-3.5 px-4 text-[11px] text-slate-600 space-y-0.5">
                            {a.email && (
                              <div className="flex items-center space-x-1 truncate max-w-[180px]">
                                <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{a.email}</span>
                              </div>
                            )}
                            {a.telefono && (
                              <div className="flex items-center space-x-1 font-mono text-slate-700">
                                <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span>{a.telefono}</span>
                              </div>
                            )}
                            {a.direccion && (
                              <div className="flex items-center space-x-1 text-slate-400 truncate max-w-[180px]">
                                <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{a.direccion}</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-extrabold text-brand-800 whitespace-nowrap">
                            Q{parseFloat(a.monto_estimado || 100.0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{new Date(a.fecha_solicitud).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {a.estado === 'ATENDIDA' ? (
                              <div className="flex flex-col items-center">
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-50 text-brand-800 border border-brand-200">
                                  <CheckCircle2 className="w-3 h-3 text-brand-600" />
                                  <span>Formalizada</span>
                                </span>
                                {a.fecha_resolucion && (
                                  <span className="text-[10px] text-slate-400 mt-0.5 font-sans">
                                    {new Date(a.fecha_resolucion).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            ) : a.estado === 'CANCELADA' ? (
                              <div className="flex flex-col items-center">
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                  <span>Cancelada / Denegada</span>
                                </span>
                                {a.fecha_resolucion && (
                                  <span className="text-[10px] text-slate-400 mt-0.5 font-sans">
                                    {new Date(a.fecha_resolucion).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            ) : bloqueadoPorOtro ? (
                              <span
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-warning-100 text-warning-900 border border-warning-300"
                                title={`Caso tomado por ${a.operador_bloqueo_nombre} (${a.operador_bloqueo_codigo})`}
                              >
                                <Lock className="w-3 h-3 text-warning-700" />
                                <span>En atención por {a.operador_bloqueo_codigo || 'Operador'}</span>
                              </span>
                            ) : bloqueadoPorMi ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 animate-pulse">
                                <Unlock className="w-3 h-3 text-blue-700" />
                                <span>En atención por ti</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-50 text-brand-800 border border-brand-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                                <span>Disponible</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {a.estado === 'ATENDIDA' ? (
                              <div className="flex items-center justify-center space-x-1.5 mx-auto">
                                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-brand-50 text-brand-800 text-xs font-bold border border-brand-200 shadow-2xs">
                                  <Check className="w-3.5 h-3.5 text-brand-600" />
                                  <span>Caso Formalizado</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadComprobanteExistente(a)}
                                  title="Descargar Comprobante Oficial de Apertura en PDF"
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-300 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                >
                                  <FileDown className="w-3.5 h-3.5 text-brand-700" />
                                  <span>PDF</span>
                                </button>
                              </div>
                            ) : a.estado === 'CANCELADA' ? (
                              <span
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 text-xs font-bold border border-rose-200 mx-auto shadow-2xs"
                                title={a.observaciones ? `Motivo: ${a.observaciones}` : 'Caso denegado'}
                              >
                                <X className="w-3.5 h-3.5 text-rose-600" />
                                <span>Caso Denegado</span>
                              </span>
                            ) : bloqueadoPorOtro ? (
                              <button
                                disabled
                                title={`Este caso está siendo gestionado por ${a.operador_bloqueo_nombre} (${a.operador_bloqueo_codigo})`}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200 cursor-not-allowed flex items-center space-x-1 mx-auto"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Bloqueado</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleOpenAfiliacionModal(a)}
                                disabled={lockingCaso}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 mx-auto ${
                                  bloqueadoPorMi
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-brand-700 hover:bg-brand-800 text-white'
                                }`}
                              >
                                {bloqueadoPorMi ? (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Continuar</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Atender Caso</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* CONTENIDO PESTAÑA 2: TRASLADOS DE FONDOS Y APERTURAS */}
        {/* ================================================================= */}
        {activeTab === 'traslados' && (
          <div className="p-5 space-y-4">
            {/* Sub-navegación entre Bandeja de Pendientes y Buscador de Historial (Req-4) */}
            <div className="flex border-b border-slate-200 gap-4 pb-1">
              <button
                type="button"
                onClick={() => setSubTabTraslados('pendientes')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 flex items-center space-x-1.5 cursor-pointer transition-all ${
                  subTabTraslados === 'pendientes'
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Inbox className="w-4 h-4 text-brand-600" />
                <span>Casos Pendientes de Aprobación</span>
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-100 text-brand-800">
                  {solicitudes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubTabTraslados('historial');
                  if (historialTraslados.length === 0) {
                    fetchHistorialTraslados();
                  }
                }}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 flex items-center space-x-1.5 cursor-pointer transition-all ${
                  subTabTraslados === 'historial'
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Search className="w-4 h-4 text-slate-600" />
                <span>Buscador e Historial por Asociado</span>
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                  {historialTraslados.length}
                </span>
              </button>
            </div>

            {/* SUB-TAB 1: BANDEJA DE CASOS PENDIENTES */}
            {subTabTraslados === 'pendientes' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-warning-500" />
                    <span>Casos en Espera de Dictamen Operativo ({solicitudes.length})</span>
                  </h2>
                </div>

                {loadingTraslados ? (
                  <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                    <p className="text-xs font-semibold">Cargando bandeja de traslados...</p>
                  </div>
                ) : solicitudes.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <CheckCircle className="w-14 h-14 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">¡Bandeja de traslados al día!</p>
                    <p className="text-xs text-slate-400 mt-0.5">No hay solicitudes de traslado o aperturas pendientes.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Número de Caso</th>
                          <th className="px-6 py-3 font-semibold">Asociado</th>
                          <th className="px-6 py-3 font-semibold text-right">Monto</th>
                          <th className="px-6 py-3 font-semibold">Operación / Destino</th>
                          <th className="px-6 py-3 font-semibold">Origen / Saldo</th>
                          <th className="px-6 py-3 font-semibold">Fecha Recepción</th>
                          <th className="px-6 py-3 font-semibold text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {solicitudes.map((s) => (
                          <tr key={s.id_solicitud} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-mono font-bold text-slate-850">
                              {s.numero_caso}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold block text-slate-900">
                                {s.primer_nombre} {s.primer_apellido}
                              </span>
                              <span className="text-xs text-slate-500">ID Asociado: {s.id_asociado}</span>
                            </td>
                            <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                              Q{parseFloat(s.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 text-xs">
                              <span className="font-semibold block text-slate-700">
                                {s.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado Directo' : 'Apertura y Traslado'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                                Tipo Destino: {s.tipo_cuenta_destino_nombre}
                              </span>
                              {s.cuenta_destino_numero && (
                                <span className="text-[10px] text-brand-700 font-mono">
                                  Cta Destino: {s.cuenta_destino_numero}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">
                              <span className="font-mono block">{s.cuenta_origen_numero}</span>
                              <span className="block mt-0.5">Saldo Planilla: Q{parseFloat(s.cuenta_origen_saldo).toFixed(2)}</span>
                            </td>
                            <td className="px-6 py-4 text-slate-500 text-xs">
                              {new Date(s.fecha_solicitud).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => openResolverTrasladoModal(s, 'APROBAR')}
                                  className="px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold border border-brand-200 transition-colors cursor-pointer"
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() => openResolverTrasladoModal(s, 'RECHAZAR')}
                                  className="px-3 py-1.5 rounded-lg bg-danger-50 hover:bg-danger-100 text-danger-700 text-xs font-bold border border-danger-200 transition-colors cursor-pointer"
                                >
                                  Rechazar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: BUSCADOR E HISTORIAL POR ASOCIADO (Req-4) */}
            {subTabTraslados === 'historial' && (
              <div className="space-y-4">
                {/* Barra de Filtros y Búsqueda */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                  <div className="relative w-full sm:max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={searchHistorialTraslados}
                      onChange={(e) => setSearchHistorialTraslados(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') fetchHistorialTraslados(searchHistorialTraslados, filterHistorialEstado);
                      }}
                      placeholder="Buscar por Nombre, CUI/DPI, Caso o No. Cuenta..."
                      className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600 font-medium"
                    />
                    {searchHistorialTraslados && (
                      <button
                        onClick={() => {
                          setSearchHistorialTraslados('');
                          fetchHistorialTraslados('', filterHistorialEstado);
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <select
                      value={filterHistorialEstado}
                      onChange={(e) => {
                        setFilterHistorialEstado(e.target.value);
                        fetchHistorialTraslados(searchHistorialTraslados, e.target.value);
                      }}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="TODOS">Todos los Estados</option>
                      <option value="PENDIENTE">Pendientes</option>
                      <option value="APROBADO">Aprobados</option>
                      <option value="RECHAZADO">Rechazados</option>
                    </select>

                    <button
                      onClick={() => fetchHistorialTraslados(searchHistorialTraslados, filterHistorialEstado)}
                      disabled={loadingHistorialTraslados}
                      className="px-3.5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Buscar</span>
                    </button>
                  </div>
                </div>

                {/* Tabla de Historial de Traslados */}
                {loadingHistorialTraslados ? (
                  <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                    <p className="text-xs font-semibold">Consultando historial de traslados...</p>
                  </div>
                ) : historialTraslados.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <Activity className="w-14 h-14 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">No se encontraron registros de traslados</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchHistorialTraslados
                        ? 'No hay registros que coincidan con la búsqueda ingresada.'
                        : 'Utilice el buscador para localizar el historial de traslados de un asociado específico.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Número de Caso</th>
                          <th className="px-4 py-3">Asociado</th>
                          <th className="px-4 py-3">CUI / DPI</th>
                          <th className="px-4 py-3 text-right">Monto</th>
                          <th className="px-4 py-3">Operación / Destino</th>
                          <th className="px-4 py-3">Fechas</th>
                          <th className="px-4 py-3 text-center">Estado</th>
                          <th className="px-4 py-3">Resolución / Operador</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {historialTraslados.map((h) => {
                          const nombreCompleto = `${h.primer_nombre} ${h.segundo_nombre || ''} ${h.primer_apellido} ${h.segundo_apellido || ''}`.trim();
                          return (
                            <tr key={h.id_solicitud} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200">
                                  {h.numero_caso}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-bold text-slate-900 block">{nombreCompleto}</span>
                                {h.codigo_corporativo && (
                                  <span className="text-[10px] font-mono text-brand-700 block">
                                    {h.codigo_corporativo}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                                {h.cui_dpi}
                              </td>
                              <td className="px-4 py-3 text-right font-extrabold text-slate-900 font-mono whitespace-nowrap">
                                Q{parseFloat(h.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-semibold block text-slate-800">
                                  {h.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado Directo' : 'Apertura y Traslado'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  {h.cuenta_destino_numero || h.tipo_cuenta_destino_nombre}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                                <div>Sol: {new Date(h.fecha_solicitud).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                {h.fecha_resolucion && (
                                  <div className="text-[10px] text-slate-400">
                                    Res: {new Date(h.fecha_resolucion).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  h.estado === 'APROBADO'
                                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                                    : h.estado === 'RECHAZADO'
                                    ? 'bg-danger-50 text-danger-700 border-danger-200'
                                    : 'bg-warning-50 text-warning-700 border-warning-200'
                                }`}>
                                  {h.estado}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[11px] max-w-xs">
                                {h.operador_nombre ? (
                                  <span className="block font-medium text-slate-700">
                                    Por: {h.operador_nombre} {h.operador_apellido || ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic block">-</span>
                                )}
                                {h.observaciones_operador && (
                                  <span className="block text-[10px] text-slate-500 truncate" title={h.observaciones_operador}>
                                    "{h.observaciones_operador}"
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* CONTENIDO PESTAÑA 3: SOLICITUDES DE CRÉDITO DE ASOCIADOS */}
        {/* ================================================================= */}
        {activeTab === 'creditos' && (
          <div className="p-5 space-y-4">
            {/* Barra de Filtros y Búsqueda */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchCredito}
                  onChange={(e) => setSearchCredito(e.target.value)}
                  placeholder="Buscar por ID, CUI/DPI, Nombre o Código Corporativo..."
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600 font-medium"
                />
                {searchCredito && (
                  <button
                    onClick={() => setSearchCredito('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Pendientes de análisis:{' '}
                <span className="font-bold text-warning-700">{creditosPendientesCount}</span>
                <span className="mx-1.5">•</span>
                Total solicitudes: <span className="font-bold text-slate-800">{creditos.length}</span>
              </div>
            </div>

            {loadingCreditos ? (
              <div className="py-24 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                <p className="text-xs font-semibold">Cargando solicitudes de crédito...</p>
              </div>
            ) : filteredCreditos.length === 0 ? (
              <div className="py-20 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle className="w-14 h-14 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No hay solicitudes de crédito</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {searchCredito
                    ? 'No se encontraron resultados para los términos ingresados.'
                    : 'Las solicitudes presentadas por los asociados a través del simulador aparecerán aquí.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">No. Solicitud</th>
                      <th className="px-4 py-3 font-semibold">Asociado</th>
                      <th className="px-4 py-3 font-semibold text-right">Monto</th>
                      <th className="px-4 py-3 font-semibold">Cuenta Acreditación</th>
                      <th className="px-4 py-3 font-semibold text-center">Plazo</th>
                      <th className="px-4 py-3 font-semibold text-right">Cuota Estimada</th>
                      <th className="px-4 py-3 font-semibold text-center">Tasa Anual</th>
                      <th className="px-4 py-3 font-semibold">Fecha Solicitud</th>
                      <th className="px-4 py-3 font-semibold text-center">Estado</th>
                      <th className="px-4 py-3 font-semibold">Observaciones / Motivo</th>
                      <th className="px-4 py-3 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCreditos.map((c) => (
                      <tr key={c.id_solicitud_credito} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-800 text-xs">
                          #{c.id_solicitud_credito}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold block text-slate-900 text-xs">
                            {c.primer_nombre} {c.segundo_nombre || ''} {c.primer_apellido} {c.segundo_apellido || ''}
                          </span>
                          <span className="text-[11px] text-slate-500 block font-mono">
                            CUI: {c.cui_dpi} {c.codigo_corporativo ? `• ${c.codigo_corporativo}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-extrabold text-slate-900 text-xs">
                          Q{parseFloat(c.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-700">
                          <span className="font-semibold text-brand-900 block text-xs">
                            {c.cuenta_destino_info || (c.cuenta_bancaria_destino_numero ? `Cuenta Bancaria (${c.cuenta_bancaria_destino_numero})` : 'Cuenta Principal')}
                          </span>
                          {c.cuenta_bancaria_destino_tipo && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Tipo: {c.cuenta_bancaria_destino_tipo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs text-slate-700 font-medium">
                          {c.plazo_meses} meses
                        </td>
                        <td className="px-4 py-3.5 text-right text-xs text-brand-800 font-bold">
                          Q{parseFloat(c.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs text-slate-600 font-mono">
                          {parseFloat(c.tasa_interes).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {new Date(c.fecha_solicitud).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                              c.estado === 'APROBADA' || c.estado === 'APROBADO' || c.estado === 'DESEMBOLSADA'
                                ? 'bg-brand-50 text-brand-700 border-brand-200'
                                : c.estado === 'RECHAZADA' || c.estado === 'RECHAZADO' || c.estado === 'DENEGADA'
                                ? 'bg-danger-50 text-danger-700 border-danger-200'
                                : c.estado === 'DEVUELTA_OPERADOR'
                                ? 'bg-warning-50 text-warning-700 border-warning-200'
                                : c.estado === 'EN_AUTORIZACION_EJECUTIVO'
                                ? 'bg-brand-50 text-brand-700 border-brand-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {c.estado === 'PENDIENTE_FIRMA'
                              ? 'Pendiente Firma'
                              : c.estado === 'EN_REVISION_OPERADOR'
                              ? 'En Revisión'
                              : c.estado === 'DEVUELTA_OPERADOR'
                              ? 'Devuelta'
                              : c.estado === 'EN_AUTORIZACION_EJECUTIVO'
                              ? 'En Ejecutivo'
                              : c.estado}
                          </span>
                          {c.documento_firmado_url && (
                            <div className="mt-1">
                              <a
                                href={getSecureDocumentUrl(c.documento_firmado_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-[10px] font-bold text-brand-700 hover:text-brand-900 hover:underline"
                              >
                                <FileCheck className="w-3 h-3 mr-0.5" />
                                <span>PDF Firmado</span>
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 max-w-xs truncate" title={c.observaciones_ejecutivo || c.dictamen_operador || c.observaciones}>
                          {c.observaciones_ejecutivo ? (
                            <span className="text-warning-800 font-semibold">Devuelta: "{c.observaciones_ejecutivo}"</span>
                          ) : c.dictamen_operador ? (
                            <span>Dictamen: "{c.dictamen_operador}"</span>
                          ) : (
                            c.observaciones || '-'
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {['PENDIENTE', 'EN_REVISION_OPERADOR', 'DEVUELTA_OPERADOR'].includes(c.estado) ? (
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => openResolverCreditoModal(c, '')}
                                className={`px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer ${
                                  c.estado === 'DEVUELTA_OPERADOR'
                                    ? 'bg-warning-600 hover:bg-warning-700'
                                    : 'bg-brand-600 hover:bg-brand-700'
                                }`}
                                title="Evaluar solvencia y emitir dictamen"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{c.estado === 'DEVUELTA_OPERADOR' ? 'Reevaluar' : 'Evaluar'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center space-y-1">
                              <button
                                onClick={() => openResolverCreditoModal(c, '')}
                                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 transition-colors cursor-pointer"
                              >
                                <Eye className="w-3 h-3 mr-1 text-slate-500" />
                                <span>Expediente</span>
                              </button>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {c.analista_nombre ? `Por ${c.analista_nombre}` : 'Procesado'}
                                {c.fecha_resolucion && ` • ${formatDateOnly(c.fecha_resolucion)}`}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODALES MODULARIZADOS DEL OPERADOR (ARQ-04) */}
      <OperatorAffiliationModal
        selectedAfiliacion={selectedAfiliacion}
        showRechazarAfiliacion={showRechazarAfiliacion}
        setShowRechazarAfiliacion={setShowRechazarAfiliacion}
        motivoRechazoAfiliacion={motivoRechazoAfiliacion}
        setMotivoRechazoAfiliacion={setMotivoRechazoAfiliacion}
        rechazandoAfiliacion={rechazandoAfiliacion}
        handleRechazarAfiliacionSubmit={handleRechazarAfiliacionSubmit}
        handleLiberarAfiliacion={handleLiberarAfiliacion}
        handleFormalizarSubmit={handleFormalizarSubmit}
        editPrimerNombre={editPrimerNombre}
        setEditPrimerNombre={setEditPrimerNombre}
        editSegundoNombre={editSegundoNombre}
        setEditSegundoNombre={setEditSegundoNombre}
        editPrimerApellido={editPrimerApellido}
        setEditPrimerApellido={setEditPrimerApellido}
        editSegundoApellido={editSegundoApellido}
        setEditSegundoApellido={setEditSegundoApellido}
        editCuiDpi={editCuiDpi}
        setEditCuiDpi={setEditCuiDpi}
        editFechaNacimiento={editFechaNacimiento}
        setEditFechaNacimiento={setEditFechaNacimiento}
        editTelefono={editTelefono}
        setEditTelefono={setEditTelefono}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editDireccion={editDireccion}
        setEditDireccion={setEditDireccion}
        operatorEmailStatus={operatorEmailStatus}
        montoAportacion={montoAportacion}
        setMontoAportacion={setMontoAportacion}
        passwordInicial={passwordInicial}
        setPasswordInicial={setPasswordInicial}
        observacionesAfiliacion={observacionesAfiliacion}
        setObservacionesAfiliacion={setObservacionesAfiliacion}
        formalizando={formalizando}
      />

      <OperatorAffiliationSuccessModal
        formalizadoResult={formalizadoResult}
        onClose={() => setFormalizadoResult(null)}
      />

      <OperatorTrasladoModal
        selectedSolicitud={selectedSolicitud}
        actionType={actionType}
        observacionesTraslado={observacionesTraslado}
        setObservacionesTraslado={setObservacionesTraslado}
        resolvingTraslado={resolvingTraslado}
        closeResolverTrasladoModal={closeResolverTrasladoModal}
        handleResolveTrasladoSubmit={handleResolveTrasladoSubmit}
      />

      <OperatorCreditEvaluationModal
        selectedCredito={selectedCredito}
        loadingEvaluacion={loadingEvaluacion}
        evaluacionData={evaluacionData}
        activeEvalTab={activeEvalTab}
        setActiveEvalTab={setActiveEvalTab}
        observacionesCredito={observacionesCredito}
        setObservacionesCredito={setObservacionesCredito}
        resolvingCredito={resolvingCredito}
        closeResolverCreditoModal={closeResolverCreditoModal}
        handleResolveCreditoSubmit={handleResolveCreditoSubmit}
        handleElevarCredito={handleElevarCredito}
      />
    </div>
  );
};

export default OperatorDashboard;
