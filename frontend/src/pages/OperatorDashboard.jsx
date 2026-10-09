import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import OperatorCreditEvaluationModal from '../components/operator/modals/OperatorCreditEvaluationModal';
import OperatorAffiliationModal from '../components/operator/modals/OperatorAffiliationModal';
import { useCorreoDisponible } from '../hooks/useCorreoDisponible';
import OperatorAffiliationSuccessModal from '../components/operator/modals/OperatorAffiliationSuccessModal';
import OperatorTrasladoModal from '../components/operator/modals/OperatorTrasladoModal';
import { generateAccountOpeningReceiptPdf } from '../utils/accountOpeningReceiptPdf';
import { Button, Card, PageHeader, TabPanel, Tabs } from '../components/ui';
import { AffiliationsPanel } from '../components/operator/dashboard/AffiliationsPanel';
import { TransfersPanel } from '../components/operator/dashboard/TransfersPanel';
import { CreditsPanel } from '../components/operator/dashboard/CreditsPanel';

const TABS_ID = 'operador';

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

  // Acceso al portal al formalizar (issue #26): solo si el correo de la cooperativa funciona
  const correoDisponible = useCorreoDisponible(Boolean(selectedAfiliacion));
  const [crearAccesoPortal, setCrearAccesoPortal] = useState(true);
  useEffect(() => {
    setCrearAccesoPortal(correoDisponible !== false);
  }, [correoDisponible, selectedAfiliacion?.id_solicitud]);
  const crearAcceso = crearAccesoPortal && correoDisponible !== false;

  // Validación de disponibilidad de correo en el modal del operador
  const [operatorEmailStatus, setOperatorEmailStatus] = useState({
    checking: false,
    disponible: null,
    message: '',
  });

  useEffect(() => {
    // Sin acceso al portal el correo no se guarda en un usuario: no hace falta revisar si está en uso.
    if (!selectedAfiliacion || !crearAcceso) {
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
        message: 'Revise el formato del correo.',
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
  }, [editEmail, selectedAfiliacion, crearAcceso]);

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
      const msg = err.response?.data?.message || 'No pudo tomar el caso. Es posible que otro operador ya lo esté atendiendo.';
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
      toast.error('Escriba el primer nombre y el primer apellido.');
      return;
    }

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{2,50}$/;
    if (!nameRegex.test(editPrimerNombre.trim()) || !nameRegex.test(editPrimerApellido.trim())) {
      toast.error('Los nombres y apellidos solo pueden llevar letras.');
      return;
    }

    if (editSegundoNombre.trim() && !nameRegex.test(editSegundoNombre.trim())) {
      toast.error('El segundo nombre solo puede llevar letras.');
      return;
    }

    if (editSegundoApellido.trim() && !nameRegex.test(editSegundoApellido.trim())) {
      toast.error('El segundo apellido solo puede llevar letras.');
      return;
    }

    const cleanTel = editTelefono.replace(/\D/g, '');
    if (cleanTel && cleanTel.length !== 8) {
      toast.error(`El teléfono debe tener 8 dígitos (tiene ${cleanTel.length}).`);
      return;
    }

    if (!editCuiDpi.trim() || editCuiDpi.trim().length !== 13) {
      toast.error('El DPI debe tener 13 dígitos.');
      return;
    }

    if (!editFechaNacimiento) {
      toast.error('La fecha de nacimiento es obligatoria.');
      return;
    }

    const montoNum = parseFloat(montoAportacion);
    if (isNaN(montoNum) || montoNum < 100.0) {
      toast.error('El depósito inicial mínimo es de Q100.00.');
      return;
    }

    if (crearAcceso && !editEmail.trim()) {
      toast.error('Escriba el correo del asociado para crear su acceso al portal, o desmarque «Crear acceso al portal».');
      return;
    }

    if (crearAcceso && operatorEmailStatus.disponible === false) {
      toast.error(operatorEmailStatus.message || 'Ese correo ya lo usa otra persona. Cámbielo para continuar.');
      return;
    }

    if (crearAcceso && operatorEmailStatus.checking) {
      toast.error('Estamos revisando el correo. Espere un momento.');
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
        crear_acceso_portal: crearAcceso,
      });

      if (response.data?.success) {
        const resData = response.data.data;
        if (resData.correo_enviado || !resData.acceso_portal || resData.acceso_existente) {
          toast.success(`${resData.nombre_completo} ya es asociado.`);
        } else {
          toast.warning(`${resData.nombre_completo} ya es asociado, pero no recibió su acceso al portal por correo.`);
        }
        setFormalizadoResult(resData);
        setSelectedAfiliacion(null);
        fetchAfiliaciones(searchAfiliacion);
      }
    } catch (err) {
      console.error('Error al formalizar afiliación:', err);
      toast.error(err.response?.data?.message || 'No se pudo completar la afiliación. Intente de nuevo.');
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
      toast.success(`Se descargó el comprobante del caso ${caso.numero_caso}.`);
    } catch (err) {
      console.error('Error al generar comprobante existente:', err);
      toast.error('No se pudo generar el comprobante. Intente de nuevo.');
    }
  };

  const handleRechazarAfiliacionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAfiliacion || !motivoRechazoAfiliacion.trim()) {
      toast.error('Escriba el motivo del rechazo.');
      return;
    }

    try {
      setRechazandoAfiliacion(true);
      const response = await api.post(`/operador/afiliaciones/${selectedAfiliacion.id_solicitud}/rechazar`, {
        motivo: motivoRechazoAfiliacion.trim(),
      });

      if (response.data?.success) {
        toast.success(`Se canceló el caso ${selectedAfiliacion.numero_caso}.`);
        setSelectedAfiliacion(null);
        setShowRechazarAfiliacion(false);
        fetchAfiliaciones(searchAfiliacion);
      }
    } catch (err) {
      console.error('Error al rechazar caso de afiliación:', err);
      toast.error(err.response?.data?.message || 'No se pudo cancelar la solicitud. Intente de nuevo.');
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
    setObservacionesTraslado(type === 'APROBAR' ? 'Traslado aprobado.' : '');
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
        toast.success(`Se ${actionType === 'APROBAR' ? 'aprobó' : 'rechazó'} el caso ${selectedSolicitud.numero_caso}.`);
        closeResolverTrasladoModal();
        fetchTraslados();
      }
    } catch (err) {
      console.error('Error al resolver caso:', err);
      toast.error(err.response?.data?.message || 'No se pudo resolver el caso. Intente de nuevo.');
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
      toast.error('No se pudo cargar la evaluación del asociado.');
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
      toast.error('Adjunte el PDF firmado por usted para enviar la solicitud al ejecutivo.');
      return;
    }
    if (!observacionesCredito.trim()) {
      toast.error('Escriba su dictamen antes de enviar la solicitud al ejecutivo.');
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
        toast.success(`La solicitud #${selectedCredito.id_solicitud_credito} se envió al ejecutivo para su resolución.`);
        closeResolverCreditoModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al elevar crédito:', err);
      toast.error(err.response?.data?.message || 'No se pudo enviar la solicitud al ejecutivo. Intente de nuevo.');
    } finally {
      setResolvingCredito(false);
    }
  };

  const handleResolveCreditoSubmit = async (accionParam, archivoFirmado = null) => {
    if (!selectedCredito) return;
    const finalAction = typeof accionParam === 'string' && accionParam ? accionParam : actionCreditoType;

    if (!finalAction || !['RECHAZAR', 'DENEGAR'].includes(finalAction)) {
      toast.error('Acción no válida.');
      return;
    }

    if (!observacionesCredito.trim()) {
      toast.error('Escriba el motivo del rechazo en las observaciones.');
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
        toast.success(`Se rechazó la solicitud #${selectedCredito.id_solicitud_credito}.`);
        closeResolverCreditoModal();
        fetchCreditos();
      }
    } catch (err) {
      console.error('Error al rechazar crédito:', err);
      toast.error(err.response?.data?.message || 'No se pudo rechazar la solicitud. Intente de nuevo.');
    } finally {
      setResolvingCredito(false);
    }
  };


  const isRefreshing = loadingAfiliaciones || loadingTraslados || loadingCreditos;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bandeja de trabajo"
        description="Afiliaciones, traslados y créditos que esperan su atención."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={refreshAll}
            disabled={isRefreshing}
            className={isRefreshing ? '[&>svg]:animate-spin' : undefined}
          >
            Actualizar
          </Button>
        }
      />

      <Card>
        <div className="px-5 pt-4">
          <Tabs
            label="Bandejas del operador"
            idPrefix={TABS_ID}
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'afiliaciones', label: 'Afiliaciones', count: afiliacionesPendientesCount, attention: afiliacionesPendientesCount > 0 },
              { id: 'traslados', label: 'Traslados', count: solicitudes.length, attention: solicitudes.length > 0 },
              { id: 'creditos', label: 'Créditos', count: creditosPendientesCount, attention: creditosPendientesCount > 0 },
            ]}
          />
        </div>

        <TabPanel id={activeTab} idPrefix={TABS_ID} className="p-5">
          {activeTab === 'afiliaciones' && (
            <AffiliationsPanel
              afiliaciones={filteredAfiliaciones}
              loading={loadingAfiliaciones}
              search={searchAfiliacion}
              onSearchChange={setSearchAfiliacion}
              filter={filterAfiliacionEstado}
              onFilterChange={setFilterAfiliacionEstado}
              counts={{
                total: afiliaciones.length,
                pendientes: afiliacionesPendientesCount,
                atendidas: afiliacionesAtendidasCount,
                canceladas: afiliacionesCanceladasCount,
              }}
              lockingCaso={lockingCaso}
              onAttend={handleOpenAfiliacionModal}
              onDownloadReceipt={handleDownloadComprobanteExistente}
            />
          )}

          {activeTab === 'traslados' && (
            <TransfersPanel
              subTab={subTabTraslados}
              onSubTabChange={(id) => {
                setSubTabTraslados(id);
                if (id === 'historial' && historialTraslados.length === 0) {
                  fetchHistorialTraslados();
                }
              }}
              solicitudes={solicitudes}
              loadingTraslados={loadingTraslados}
              onResolve={openResolverTrasladoModal}
              historial={historialTraslados}
              loadingHistorial={loadingHistorialTraslados}
              historialSearch={searchHistorialTraslados}
              onHistorialSearchChange={setSearchHistorialTraslados}
              historialEstado={filterHistorialEstado}
              onHistorialEstadoChange={setFilterHistorialEstado}
              onHistorialSearch={fetchHistorialTraslados}
            />
          )}

          {activeTab === 'creditos' && (
            <CreditsPanel
              creditos={filteredCreditos}
              total={creditos.length}
              pendientes={creditosPendientesCount}
              loading={loadingCreditos}
              search={searchCredito}
              onSearchChange={setSearchCredito}
              onOpen={openResolverCreditoModal}
            />
          )}
        </TabPanel>
      </Card>

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
        correoDisponible={correoDisponible}
        crearAccesoPortal={crearAcceso}
        setCrearAccesoPortal={setCrearAccesoPortal}
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
