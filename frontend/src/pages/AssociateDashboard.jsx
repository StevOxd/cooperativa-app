import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  AlertCircle,
  X,
  FileText,
  Calendar,
  DollarSign,
  Activity,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Send,
  HelpCircle,
  Info,
  TrendingUp,
  Compass,
  Calculator,
  Percent,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Users2,
  Plus,
  Trash2,
  PieChart,
  Filter,
  Search,
} from 'lucide-react';
import AssociateOnboardingTour from '../components/associate/AssociateOnboardingTour';
import { useToast } from '../context/ToastContext';
import { generateAccountStatementPdf } from '../utils/accountStatementPdf';

export const AssociateDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  // Estados de navegación interna (Tabs)
  const [activeTab, setActiveTab] = useState('resumen');
  const [showTour, setShowTour] = useState(false);

  // Estados del modal de movimientos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingAccountId, setDownloadingAccountId] = useState(null);

  // Estados del módulo de Traslado de Planilla
  const [cuentaPlanilla, setCuentaPlanilla] = useState(null);
  const [cuentasDestino, setCuentasDestino] = useState({ cuentasExistentes: [], tiposDisponibles: [] });
  const [solicitudesTraslado, setSolicitudesTraslado] = useState([]);
  const [catalogoProductos, setCatalogoProductos] = useState([]);

  // Estados de filtros para Historial de Traslados (Req-7)
  const [filterTrasladoEstado, setFilterTrasladoEstado] = useState('TODOS');
  const [filterTrasladoTipo, setFilterTrasladoTipo] = useState('TODOS');
  const [searchTrasladoQuery, setSearchTrasladoQuery] = useState('');

  // Estados de Mis Beneficiarios (Req-9)
  const [misBeneficiariosData, setMisBeneficiariosData] = useState([]);
  const [loadingBeneficiarios, setLoadingBeneficiarios] = useState(false);
  const [selectedCuentaParaEditar, setSelectedCuentaParaEditar] = useState(null);
  const [editBeneficiariosList, setEditBeneficiariosList] = useState([]);
  const [initialEditBeneficiarios, setInitialEditBeneficiarios] = useState(null);
  const [savingBeneficiarios, setSavingBeneficiarios] = useState(false);
  const [modalBenError, setModalBenError] = useState('');

  // Estados del Formulario de Traslado
  const [isTrasladoModalOpen, setIsTrasladoModalOpen] = useState(false);
  const [montoTraslado, setMontoTraslado] = useState('');
  const [tipoOperacion, setTipoOperacion] = useState('TRASLADO_DIRECTO');
  const [destinoSeleccionado, setDestinoSeleccionado] = useState(''); // Formato: "EXISTENTE:<id>" o "APERTURA:<id>"
  const [observacionesTraslado, setObservacionesTraslado] = useState('');
  const [enviandoTraslado, setEnviandoTraslado] = useState(false);
  const [modalErrorMessage, setModalErrorMessage] = useState('');

  const openTrasladoModal = () => {
    setModalErrorMessage('');
    setMontoTraslado('');
    setDestinoSeleccionado('');
    setObservacionesTraslado('');
    setIsTrasladoModalOpen(true);
  };

  const closeTrasladoModal = () => {
    setModalErrorMessage('');
    setIsTrasladoModalOpen(false);
  };

  // Validación en tiempo real de monto mínimo y saldo
  const getMinimoRequerido = () => {
    if (!destinoSeleccionado || !destinoSeleccionado.startsWith('APERTURA:')) return 0;
    const typeId = parseInt(destinoSeleccionado.split(':')[1], 10);
    const tipo = cuentasDestino.tiposDisponibles.find(t => t.id_tipo_cuenta === typeId);
    return tipo ? parseFloat(tipo.monto_minimo_apertura) : 0;
  };

  const getNombreProductoDestino = () => {
    if (!destinoSeleccionado || !destinoSeleccionado.startsWith('APERTURA:')) return '';
    const typeId = parseInt(destinoSeleccionado.split(':')[1], 10);
    const tipo = cuentasDestino.tiposDisponibles.find(t => t.id_tipo_cuenta === typeId);
    return tipo ? tipo.nombre : '';
  };

  const cuentasDestinoFiltradas = useMemo(() => {
    if (!cuentasDestino?.cuentasExistentes) return [];
    return cuentasDestino.cuentasExistentes.filter(
      (d) => String(d.id_cuenta) !== String(cuentaPlanilla?.id_cuenta)
    );
  }, [cuentasDestino, cuentaPlanilla]);

  const minRequerido = getMinimoRequerido();
  const nombreProductoDestino = getNombreProductoDestino();
  const parsedMontoVal = parseFloat(montoTraslado) || 0;
  const isMontoInferior = minRequerido > 0 && parsedMontoVal > 0 && parsedMontoVal < minRequerido;
  const isMontoMayorQueSaldo = cuentaPlanilla && parsedMontoVal > parseFloat(cuentaPlanilla.saldo_disponible);
  const isMismaCuenta =
    destinoSeleccionado?.startsWith('EXISTENTE:') &&
    cuentaPlanilla &&
    String(destinoSeleccionado.split(':')[1]) === String(cuentaPlanilla.id_cuenta);

  let realTimeError = '';
  if (isMismaCuenta) {
    realTimeError = 'La cuenta de destino no puede ser la misma cuenta de origen. Seleccione otra cuenta o elija la apertura de un nuevo producto (ej. Plazo Fijo o Metas).';
  } else if (isMontoInferior) {
    realTimeError = `El monto solicitado de Q${parsedMontoVal.toFixed(2)} es inferior al monto mínimo de apertura para la cuenta ${nombreProductoDestino} (Mínimo: Q${minRequerido.toFixed(2)}).`;
  } else if (isMontoMayorQueSaldo) {
    realTimeError = `Saldo insuficiente. Su cuenta dispone de Q${parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}.`;
  }

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // Cargar perfil, cuentas y créditos
      const [perfilRes, cuentasRes, creditosRes, planillaRes, destinoRes, solicitudesRes, catalogoRes] = await Promise.all([
        api.get('/asociado/perfil').catch(e => ({ data: { success: false } })),
        api.get('/asociado/cuentas').catch(e => ({ data: { success: false } })),
        api.get('/asociado/creditos').catch(e => ({ data: { success: false } })),
        api.get('/asociado/cuenta-planilla').catch(e => ({ data: { success: false } })),
        api.get('/asociado/mis-cuentas-destino').catch(e => ({ data: { success: false } })),
        api.get('/asociado/mis-solicitudes').catch(e => ({ data: { success: false } })),
        api.get('/catalogo/tipos-cuenta').catch(e => ({ data: { success: false } })),
      ]);

      if (perfilRes.data?.success) setProfile(perfilRes.data.data);
      if (cuentasRes.data?.success) setCuentas(cuentasRes.data.data);
      if (creditosRes.data?.success) setCreditos(creditosRes.data.data);
      if (planillaRes.data?.success) setCuentaPlanilla(planillaRes.data.data);
      if (destinoRes.data?.success) setCuentasDestino(destinoRes.data.data);
      if (solicitudesRes.data?.success) setSolicitudesTraslado(solicitudesRes.data.data);
      if (catalogoRes.data?.success) setCatalogoProductos(catalogoRes.data.data);

    } catch (error) {
      console.error('Error al cargar datos del asociado:', error);
      setErrorMessage('No se pudieron obtener los datos financieros del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtrado de solicitudes de traslado (Req-7)
  const filteredSolicitudesTraslado = useMemo(() => {
    return solicitudesTraslado.filter((s) => {
      if (filterTrasladoEstado !== 'TODOS' && s.estado !== filterTrasladoEstado) return false;
      if (filterTrasladoTipo !== 'TODOS' && s.tipo_operacion !== filterTrasladoTipo) return false;
      if (!searchTrasladoQuery.trim()) return true;
      const q = searchTrasladoQuery.toLowerCase();
      const numCaso = (s.numero_caso || '').toLowerCase();
      const ctaDestino = (s.cuenta_destino_numero || '').toLowerCase();
      const tipoDestino = (s.tipo_cuenta_destino || '').toLowerCase();
      return numCaso.includes(q) || ctaDestino.includes(q) || tipoDestino.includes(q);
    });
  }, [solicitudesTraslado, filterTrasladoEstado, filterTrasladoTipo, searchTrasladoQuery]);

  // Cargar beneficiarios al cambiar de pestaña
  const fetchMisBeneficiarios = async () => {
    try {
      setLoadingBeneficiarios(true);
      const res = await api.get('/asociado/beneficiarios');
      if (res.data?.success) {
        setMisBeneficiariosData(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar beneficiarios del asociado:', err);
    } finally {
      setLoadingBeneficiarios(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'beneficiarios') {
      fetchMisBeneficiarios();
    }
  }, [activeTab]);

  // Bloquear scroll de la página de fondo cuando cualquier modal esté abierto
  useEffect(() => {
    const isAnyModalOpen = !!(isModalOpen || isTrasladoModalOpen || selectedCuentaParaEditar);
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isModalOpen, isTrasladoModalOpen, selectedCuentaParaEditar]);

  const openEditarBeneficiariosModal = (cuenta) => {
    setSelectedCuentaParaEditar(cuenta);
    setModalBenError('');
    if (cuenta.beneficiarios && cuenta.beneficiarios.length > 0) {
      const cloned = cuenta.beneficiarios.map(b => ({ ...b }));
      setEditBeneficiariosList(cloned);
      setInitialEditBeneficiarios(JSON.parse(JSON.stringify(cloned)));
    } else {
      const defaultBens = [
        { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 100 }
      ];
      setEditBeneficiariosList(defaultBens);
      setInitialEditBeneficiarios([]);
    }
  };

  const closeEditarBeneficiariosModal = () => {
    setSelectedCuentaParaEditar(null);
    setModalBenError('');
  };

  const totalPorcentajeAsociado = useMemo(() => {
    return editBeneficiariosList.reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);
  }, [editBeneficiariosList]);

  // Detección estricta de cambios respecto al estado original
  const hasAssociateBenChanges = useMemo(() => {
    if (!initialEditBeneficiarios) return false;

    const normalize = (list) => {
      return (list || [])
        .map((b) => ({
          nombre_completo: (b.nombre_completo || '').trim(),
          parentesco: (b.parentesco || 'HIJO/A').trim(),
          cui_dpi: (b.cui_dpi || '').trim(),
          telefono: (b.telefono || '').trim(),
          porcentaje: Number(parseFloat(b.porcentaje || 0).toFixed(2)),
        }))
        .filter((b) => b.nombre_completo !== '' || b.cui_dpi !== '' || b.telefono !== '');
    };

    const normInitial = normalize(initialEditBeneficiarios);
    const normCurrent = normalize(editBeneficiariosList);

    if (normInitial.length !== normCurrent.length) return true;

    for (let i = 0; i < normInitial.length; i++) {
      const init = normInitial[i];
      const curr = normCurrent[i];
      if (
        init.nombre_completo !== curr.nombre_completo ||
        init.parentesco !== curr.parentesco ||
        init.cui_dpi !== curr.cui_dpi ||
        init.telefono !== curr.telefono ||
        init.porcentaje !== curr.porcentaje
      ) {
        return true;
      }
    }

    return false;
  }, [initialEditBeneficiarios, editBeneficiariosList]);

  const handleAddBeneficiarioAsociado = () => {
    if (totalPorcentajeAsociado >= 100) {
      toast.warning('La suma actual de porcentajes ya es del 100.00%. Reduzca los porcentajes actuales antes de agregar otro beneficiario.');
      return;
    }
    const rem = Math.max(0, 100 - totalPorcentajeAsociado);
    setEditBeneficiariosList([
      ...editBeneficiariosList,
      { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: rem }
    ]);
  };

  const handleRemoveBeneficiarioAsociado = (index) => {
    if (editBeneficiariosList.length <= 1) {
      toast.error('Debe declarar al menos un beneficiario para la cuenta.');
      return;
    }
    const updated = editBeneficiariosList.filter((_, i) => i !== index);
    setEditBeneficiariosList(updated);
  };

  const handleSaveBeneficiariosSubmit = async () => {
    if (!selectedCuentaParaEditar) return;
    setModalBenError('');

    if (!hasAssociateBenChanges) {
      setModalBenError('No se han detectado modificaciones en los beneficiarios. Realice algún cambio para guardar.');
      return;
    }

    if (Math.abs(totalPorcentajeAsociado - 100.00) > 0.01) {
      setModalBenError(`La suma de los porcentajes debe ser exactamente 100.00%. Suma actual: ${totalPorcentajeAsociado.toFixed(2)}%`);
      return;
    }

    for (let i = 0; i < editBeneficiariosList.length; i++) {
      const b = editBeneficiariosList[i];
      if (!b.nombre_completo.trim()) {
        setModalBenError(`El beneficiario #${i + 1} debe contener Nombre Completo.`);
        return;
      }
      if (b.telefono && b.telefono.length > 0 && b.telefono.length !== 8) {
        setModalBenError(`El teléfono del beneficiario #${i + 1} (${b.nombre_completo || 'sin nombre'}) debe contener exactamente 8 dígitos numéricos.`);
        return;
      }
      const pct = parseFloat(b.porcentaje);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        setModalBenError(`El beneficiario #${i + 1} debe tener un porcentaje mayor a 0% y menor o igual a 100%.`);
        return;
      }
    }

    try {
      setSavingBeneficiarios(true);
      const res = await api.post(`/asociado/cuentas/${selectedCuentaParaEditar.id_cuenta}/beneficiarios`, {
        beneficiarios: editBeneficiariosList,
      });
      if (res.data?.success) {
        toast.success('¡Beneficiarios actualizados exitosamente (100.00% distribuido)!');
        setInitialEditBeneficiarios(JSON.parse(JSON.stringify(editBeneficiariosList)));
        closeEditarBeneficiariosModal();
        fetchMisBeneficiarios();
      } else {
        setModalBenError(res.data?.message || 'Error al guardar beneficiarios.');
      }
    } catch (err) {
      setModalBenError(err.response?.data?.message || 'Error al actualizar beneficiarios.');
    } finally {
      setSavingBeneficiarios(false);
    }
  };

  const openMovimientosModal = async (cuenta) => {
    setSelectedCuenta(cuenta);
    setIsModalOpen(true);
    setLoadingTx(true);
    try {
      const response = await api.get(`/asociado/cuentas/${cuenta.id_cuenta}/transacciones`);
      if (response.data?.success) {
        setTransactions(response.data.data);
      }
    } catch (error) {
      console.error('Error al cargar transacciones:', error);
      setErrorMessage('No se pudieron cargar los movimientos de la cuenta.');
    } finally {
      setLoadingTx(false);
    }
  };

  // Descargar Estado de Cuenta Oficial en PDF (Módulo 3)
  const handleDownloadPdf = async (cuentaTarget = selectedCuenta, txsTarget = null) => {
    if (!cuentaTarget) return;
    setGeneratingPdf(true);
    setDownloadingAccountId(cuentaTarget.id_cuenta);
    try {
      let finalTxs = txsTarget;
      if (!finalTxs || !Array.isArray(finalTxs) || (finalTxs.length === 0 && txsTarget === null)) {
        const response = await api.get(`/asociado/cuentas/${cuentaTarget.id_cuenta}/transacciones`);
        if (response.data?.success) {
          finalTxs = response.data.data;
        }
      }
      generateAccountStatementPdf({
        asociado: profile || user,
        cuenta: cuentaTarget,
        transacciones: finalTxs || [],
      });
      toast.success(`Estado de cuenta de la cuenta ${cuentaTarget.numero_cuenta} generado exitosamente.`);
    } catch (err) {
      console.error('Error al generar estado de cuenta en PDF:', err);
      toast.error('No se pudo generar el Estado de Cuenta en PDF.');
    } finally {
      setGeneratingPdf(false);
      setDownloadingAccountId(null);
    }
  };

  // Procesar envío del traslado
  const handleTrasladoSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setModalErrorMessage('');

    const monto = parseFloat(montoTraslado);
    if (isNaN(monto) || monto <= 0) {
      setModalErrorMessage('Por favor ingrese un monto válido mayor a cero.');
      return;
    }

    if (!cuentaPlanilla) {
      setModalErrorMessage('No posee una cuenta activa vinculada para realizar traslados.');
      return;
    }

    if (monto > parseFloat(cuentaPlanilla.saldo_disponible)) {
      setModalErrorMessage(`Saldo insuficiente en su cuenta origen (Disponible: Q${parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}).`);
      return;
    }

    if (!destinoSeleccionado) {
      setModalErrorMessage('Debe seleccionar una cuenta o producto de destino.');
      return;
    }

    const [destType, destId] = destinoSeleccionado.split(':');
    if (destType === 'EXISTENTE' && cuentaPlanilla && String(destId) === String(cuentaPlanilla.id_cuenta)) {
      setModalErrorMessage('La cuenta de destino no puede ser la misma cuenta de origen. Seleccione otra cuenta o elija la apertura de un nuevo producto (ej. Plazo Fijo o Metas).');
      return;
    }

    // Validación extra en tiempo real preventiva
    if (realTimeError) {
      setModalErrorMessage(realTimeError);
      return;
    }

    setEnviandoTraslado(true);

    const payload = {
      id_cuenta_origen: cuentaPlanilla.id_cuenta,
      monto: monto,
      tipo_operacion: tipoOperacion,
      observaciones: observacionesTraslado,
    };

    if (destType === 'EXISTENTE') {
      payload.id_cuenta_destino = parseInt(destId, 10);
    } else {
      payload.id_tipo_cuenta_destino = parseInt(destId, 10);
    }

    try {
      const response = await api.post('/asociado/solicitudes-traslado', payload);
      if (response.data?.success) {
        setSuccessMessage(`Solicitud registrada. Se generó el caso ${response.data.data.numero_caso} para aprobación operativa.`);
        setMontoTraslado('');
        setObservacionesTraslado('');
        setDestinoSeleccionado('');
        setIsTrasladoModalOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error al registrar traslado:', error);
      setModalErrorMessage(error.response?.data?.message || 'Error al procesar la solicitud de traslado.');
    } finally {
      setEnviandoTraslado(false);
    }
  };

  // Configurar tipo de operación basado en el destino seleccionado
  const handleDestinoChange = (value) => {
    setDestinoSeleccionado(value);
    if (value.startsWith('EXISTENTE:')) {
      setTipoOperacion('TRASLADO_DIRECTO');
    } else if (value.startsWith('APERTURA:')) {
      setTipoOperacion('APERTURA_Y_TRASLADO');
    }
  };

  // Cálculos de totales
  const totalAhorrado = cuentas.reduce((sum, c) => sum + parseFloat(c.saldo_disponible), 0);
  const activeCuentasCount = cuentas.filter(c => c.estado === 'ACTIVA').length;
  const activeCreditosCount = creditos.filter(c => ['PENDIENTE', 'EN_ANALISIS', 'APROBADA', 'APROBADO', 'DESEMBOLSADA'].includes(c.estado)).length;

  // Cálculos de créditos y amortización nivelada francesa
  const [selectedCreditoPlanId, setSelectedCreditoPlanId] = useState(null);
  const [cuotaPage, setCuotaPage] = useState(1);

  // Resetear página de cuotas cuando cambia el crédito seleccionado
  useEffect(() => {
    setCuotaPage(1);
  }, [selectedCreditoPlanId]);

  const creditosAprobados = useMemo(() => {
    return creditos.filter((c) =>
      ['APROBADA', 'APROBADO', 'DESEMBOLSADA'].includes(c.estado)
    );
  }, [creditos]);

  const currentCreditoPlan = useMemo(() => {
    if (creditosAprobados.length === 0) return null;
    if (selectedCreditoPlanId) {
      const match = creditosAprobados.find((c) => c.id_solicitud_credito === selectedCreditoPlanId);
      if (match) return match;
    }
    return creditosAprobados[0];
  }, [creditosAprobados, selectedCreditoPlanId]);

  const planAmortizacion = useMemo(() => {
    if (!currentCreditoPlan) return [];
    const monto = parseFloat(currentCreditoPlan.monto_solicitado);
    const plazo = parseInt(currentCreditoPlan.plazo_meses, 10);
    const tasaAnual = parseFloat(currentCreditoPlan.tasa_interes) || 10.0;
    const tasaMensual = (tasaAnual / 100) / 12;

    const cuotaNivelada =
      tasaMensual > 0
        ? (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) /
          (Math.pow(1 + tasaMensual, plazo) - 1)
        : monto / plazo;

    // Fecha según cuando se dio por aprobada la solicitud de crédito (fecha_resolucion)
    const fechaAprobacion = currentCreditoPlan.fecha_resolucion
      ? new Date(currentCreditoPlan.fecha_resolucion)
      : (currentCreditoPlan.fecha_solicitud
      ? new Date(currentCreditoPlan.fecha_solicitud)
      : new Date());

    let saldo = monto;
    const cuotas = [];

    for (let i = 1; i <= plazo; i++) {
      const interes = Math.round(saldo * tasaMensual * 100) / 100;
      let capital = Math.round((cuotaNivelada - interes) * 100) / 100;
      let cuotaMes = Math.round((capital + interes) * 100) / 100;

      if (i === plazo || capital > saldo) {
        capital = Math.round(saldo * 100) / 100;
        cuotaMes = Math.round((capital + interes) * 100) / 100;
        saldo = 0;
      } else {
        saldo = Math.round((saldo - capital) * 100) / 100;
      }

      // Fecha de cobro programada sumando i meses a la fecha de aprobación
      const fechaPago = new Date(fechaAprobacion);
      fechaPago.setMonth(fechaPago.getMonth() + i);

      cuotas.push({
        numero: i,
        fechaPago,
        capital,
        interes,
        cuotaMes, // cuota capital + interes = cuota del mes
        saldoPendiente: Math.max(0, saldo),
      });
    }

    return cuotas;
  }, [currentCreditoPlan]);

  const totalCapitalAmortizado = useMemo(
    () => planAmortizacion.reduce((sum, c) => sum + c.capital, 0),
    [planAmortizacion]
  );
  const totalInteresAmortizado = useMemo(
    () => planAmortizacion.reduce((sum, c) => sum + c.interes, 0),
    [planAmortizacion]
  );
  const totalPagadoAmortizado = totalCapitalAmortizado + totalInteresAmortizado;

  // Paginación de cuotas de 12 en 12 (Anualidades) para créditos > 12 meses
  const cuotasPerPage = 12;
  const totalCuotasPages = Math.ceil(planAmortizacion.length / cuotasPerPage);
  const paginatedCuotas = useMemo(() => {
    if (planAmortizacion.length <= cuotasPerPage) {
      return planAmortizacion;
    }
    const start = (cuotaPage - 1) * cuotasPerPage;
    return planAmortizacion.slice(start, start + cuotasPerPage);
  }, [planAmortizacion, cuotaPage]);

  const pageCapitalAmortizado = useMemo(
    () => paginatedCuotas.reduce((sum, c) => sum + c.capital, 0),
    [paginatedCuotas]
  );
  const pageInteresAmortizado = useMemo(
    () => paginatedCuotas.reduce((sum, c) => sum + c.interes, 0),
    [paginatedCuotas]
  );
  const pagePagadoAmortizado = pageCapitalAmortizado + pageInteresAmortizado;

  const getStatusBadge = (estado) => {
    switch (estado) {
      case 'APROBADO':
      case 'APROBADA':
      case 'DESEMBOLSADA':
        return 'bg-brand-50 text-brand-700 border-brand-200';
      case 'RECHAZADO':
      case 'RECHAZADA':
        return 'bg-danger-50 text-danger-700 border-danger-200';
      default:
        return 'bg-warning-50 text-warning-700 border-warning-200';
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-10 h-10 text-brand-700 animate-spin mb-3" />
        <p className="text-sm font-semibold">Cargando Portal de Autogestión...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado del Portal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block mb-1">
            Portal de Autogestión del Asociado
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bienvenido, {profile?.primer_nombre ? `${profile.primer_nombre} ${profile.primer_apellido || ''}` : (user?.nombre || user?.nombre_completo || 'Asociado')}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Usuario: <span className="font-mono font-bold text-slate-800">{profile?.codigo_corporativo || user?.codigo_corporativo}</span> | Ingreso: {profile?.fecha_ingreso ? new Date(profile.fecha_ingreso).toLocaleDateString() : 'Activo'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowTour(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-800 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="Ver recorrido guiado por las funciones del portal"
          >
            <Compass className="w-3.5 h-3.5 text-brand-700" />
            <span>Recorrido Guiado</span>
          </button>
          <button
            onClick={openTrasladoModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Solicitar Traslado</span>
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs Navegación */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('resumen')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'resumen'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Resumen Financiero
        </button>
        <button
          onClick={() => setActiveTab('planilla')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'planilla'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cuenta Origen y Traslados
        </button>
        <button
          onClick={() => setActiveTab('creditos')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
            activeTab === 'creditos'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Plan de Pagos y Créditos</span>
          {creditosAprobados.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800">
              {creditosAprobados.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('productos')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'productos'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Productos y Beneficios
        </button>
        <button
          onClick={() => setActiveTab('beneficiarios')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
            activeTab === 'beneficiarios'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users2 className="w-4 h-4" />
          <span>Mis Beneficiarios</span>
        </button>
      </div>

      {/* ==================== TAB: RESUMEN FINANCIERO ==================== */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* Tarjetas de Resumen Financiero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total Ahorros */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Total Ahorros
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block">
                  Q{totalAhorrado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            {/* Cuentas Activas */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Cuentas Activas
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block">
                  {activeCuentasCount}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>

            {/* Créditos Solicitados */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Créditos Activos / En Curso
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block">
                  {activeCreditosCount}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Cuentas */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-slate-500" />
              <span>Mis Cuentas de Ahorro</span>
            </h2>

            {cuentas.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 shadow-xs">
                <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-800 text-base">No posee cuentas activas en la cooperativa aún.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  Su depósito inicial se encuentra acreditado en su <span className="font-semibold text-slate-700">Cuenta Bancaria Vinculada</span>. Puede solicitar un traslado desde la pestaña <span className="font-bold text-brand-700">"Cuenta Origen y Traslados"</span> para aperturar sus productos en la Cooperativa (Ahorro a la Vista, Plazo Fijo o Metas).
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('planilla')}
                  className="mt-4 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5"
                >
                  <span>Ir a Cuenta Origen y Traslados</span>
                  <span>&rarr;</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cuentas.map((c) => (
                  <div 
                    key={c.id_cuenta}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            {c.tipo_cuenta}
                          </span>
                          <span className="text-sm font-mono font-bold text-slate-700 block mt-0.5">
                            {c.numero_cuenta}
                          </span>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-100">
                          {c.estado}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400 block">Saldo Disponible</span>
                        <span className="text-xl font-extrabold text-slate-900">
                          Q{parseFloat(c.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {parseFloat(c.saldo_reserva) > 0 && (
                        <div className="mt-2 text-xs text-slate-500 flex justify-between border-t border-slate-100 pt-2">
                          <span>Saldo Reserva:</span>
                          <span className="font-semibold">Q{parseFloat(c.saldo_reserva).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(c)}
                        disabled={generatingPdf && downloadingAccountId === c.id_cuenta}
                        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg border border-brand-200/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Descargar Estado de Cuenta Oficial en PDF"
                      >
                        {generatingPdf && downloadingAccountId === c.id_cuenta ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-700" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-brand-700" />
                        )}
                        <span>Estado de Cuenta (PDF)</span>
                      </button>

                      <button
                        onClick={() => openMovimientosModal(c)}
                        className="text-xs font-bold text-brand-700 hover:text-brand-900 transition-colors cursor-pointer"
                      >
                        Ver Movimientos &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB: CUENTA ORIGEN Y TRASLADOS ==================== */}
      {activeTab === 'planilla' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Cuenta Origen Info (Izquierda) */}
            <div className="md:col-span-5 bg-gradient-to-br from-brand-800 to-teal-950 p-6 sm:p-8 rounded-2xl text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
              <div className="relative z-10 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-brand-300 uppercase tracking-widest block">
                      {cuentaPlanilla?.origen_cuenta === 'COOPERATIVA'
                        ? 'Cuenta Cooperativa Principal'
                        : 'Cuenta Bancaria Vinculada'}
                    </span>
                    {cuentaPlanilla && (
                      <span className="text-[10px] font-bold bg-white/15 text-brand-200 border border-brand-400/30 px-2 py-0.5 rounded-full">
                        {cuentaPlanilla.origen_cuenta === 'COOPERATIVA' ? 'Cooperativa' : 'Entidad Bancaria'}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold">
                    {cuentaPlanilla ? cuentaPlanilla.tipo_cuenta : (cuentas.length > 0 ? cuentas[0].tipo_cuenta : 'Cuenta de Ahorro')}
                  </h3>
                  {cuentaPlanilla ? (
                    <span className="text-sm font-mono font-semibold text-brand-200 block mt-0.5">
                      {cuentaPlanilla.numero_cuenta}
                    </span>
                  ) : cuentas.length > 0 ? (
                    <span className="text-sm font-mono font-semibold text-brand-200 block mt-0.5">
                      {cuentas[0].numero_cuenta} (Ahorro Activa)
                    </span>
                  ) : (
                    <span className="text-sm text-danger-300 block mt-0.5">No vinculada</span>
                  )}
                </div>

                <div className="border-t border-white/10 pt-4">
                  <span className="text-xs text-brand-200 block mb-1">Saldo Disponible</span>
                  <span className="text-3xl font-extrabold tracking-tight">
                    Q{cuentaPlanilla 
                      ? parseFloat(cuentaPlanilla.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })
                      : (cuentas.length > 0 ? parseFloat(cuentas[0].saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 }) : '0.00')}
                  </span>
                  <p className="text-[10px] text-brand-300/80 leading-normal mt-2">
                    {cuentaPlanilla?.origen_cuenta === 'COOPERATIVA'
                      ? 'Fondos disponibles en su cuenta de ahorro para traslados, pagos o aperturas en la Cooperativa.'
                      : 'Fondos disponibles en su cuenta de ahorro bancaria para aperturar y trasladar hacia sus cuentas en la Cooperativa.'}
                  </p>
                </div>

                <button
                  onClick={openTrasladoModal}
                  disabled={!cuentaPlanilla}
                  className="w-full py-3 bg-white hover:bg-slate-50 text-brand-950 font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trasladar Fondos
                </button>
              </div>
            </div>

            {/* Historial de Traslados (Derecha) */}
            <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Solicitudes de Traslado de Fondos
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold bg-slate-50 px-2 py-0.5 rounded border inline-block mt-0.5">
                    Bajo revisión del operador
                  </span>
                </div>
              </div>

              {/* Filtros de Historial (Req-7) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 pb-1">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTrasladoQuery}
                    onChange={(e) => setSearchTrasladoQuery(e.target.value)}
                    placeholder="Buscar por caso o destino..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white"
                  />
                </div>
                <div>
                  <select
                    value={filterTrasladoEstado}
                    onChange={(e) => setFilterTrasladoEstado(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-slate-700"
                  >
                    <option value="TODOS">Todos los Estados</option>
                    <option value="PENDIENTE">Pendientes</option>
                    <option value="APROBADO">Aprobados</option>
                    <option value="RECHAZADO">Rechazados</option>
                  </select>
                </div>
                <div>
                  <select
                    value={filterTrasladoTipo}
                    onChange={(e) => setFilterTrasladoTipo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-slate-700"
                  >
                    <option value="TODOS">Todos los Tipos</option>
                    <option value="TRASLADO_DIRECTO">Traslado Directo</option>
                    <option value="APERTURA_Y_TRASLADO">Apertura y Traslado</option>
                  </select>
                </div>
              </div>

              {filteredSolicitudesTraslado.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Activity className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-semibold">
                    {solicitudesTraslado.length === 0
                      ? 'No tiene traslados registrados.'
                      : 'No se encontraron traslados que coincidan con los filtros aplicados.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Caso</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Monto</th>
                        <th className="px-4 py-2.5 font-semibold">Operación / Destino</th>
                        <th className="px-4 py-2.5 font-semibold text-center">Estado</th>
                        <th className="px-4 py-2.5 font-semibold">Resolución</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSolicitudesTraslado.map((s) => (
                        <tr key={s.id_solicitud} className="hover:bg-slate-50/50 text-xs">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {s.numero_caso}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            Q{parseFloat(s.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold block text-slate-700">
                              {s.tipo_operacion === 'TRASLADO_DIRECTO' ? 'Traslado Directo' : 'Apertura y Traslado'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Destino: {s.cuenta_destino_numero || s.tipo_cuenta_destino}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(s.estado)}`}>
                              {s.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[10px] max-w-xs truncate">
                            {s.estado === 'PENDIENTE' ? (
                              <span className="text-slate-400 flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-warning-500" />
                                <span>Esperando operador</span>
                              </span>
                            ) : (
                              <div>
                                <span className="block font-medium">{s.estado === 'APROBADO' ? 'Aprobado' : 'Rechazado'}</span>
                                <span className="block text-[9px] text-slate-400">{s.observaciones_operador || '-'}</span>
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
          </div>
        </div>
      )}

      {/* ==================== TAB: PLAN DE PAGOS Y CRÉDITOS ==================== */}
      {activeTab === 'creditos' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-brand-600" />
              <span>Plan de Pagos y Créditos Financieros</span>
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Consulte el cronograma oficial de amortización de sus créditos aprobados y el desglose de cuota mensual.
            </p>
          </div>

          {creditosAprobados.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4 max-w-xl mx-auto shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto">
                <Calculator className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800">
                  No posee créditos aprobados actualmente
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Actualmente no cuenta con créditos activos o vigentes. Puede utilizar el simulador financiero para calcular su cuota y presentar una solicitud ante el comité.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/simulador-credito"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Ir al Simulador de Créditos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selector si posee más de 1 crédito aprobado */}
              {creditosAprobados.length > 1 && (
                <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 whitespace-nowrap">
                    Crédito Seleccionado:
                  </span>
                  {creditosAprobados.map((cr) => {
                    const isSelected = currentCreditoPlan?.id_solicitud_credito === cr.id_solicitud_credito;
                    return (
                      <button
                        key={cr.id_solicitud_credito}
                        onClick={() => setSelectedCreditoPlanId(cr.id_solicitud_credito)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-brand-800 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Crédito #{cr.id_solicitud_credito} (Q{parseFloat(cr.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tarjeta Principal del Crédito Aprobado */}
              {currentCreditoPlan && (
                <>
                  <div className="bg-gradient-to-br from-brand-800 to-teal-950 p-6 sm:p-8 rounded-2xl text-white shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-4">
                        <div>
                          <span className="text-xs font-bold text-brand-300 uppercase tracking-widest block mb-0.5">
                            Plan de Pagos y Amortización Oficial
                          </span>
                          <h2 className="text-2xl font-black tracking-tight">
                            Crédito Financiero #{currentCreditoPlan.id_solicitud_credito}
                          </h2>
                        </div>
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-500/20 text-brand-200 border border-brand-400/30 w-fit">
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                          <span>Aprobado y Acreditado</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <span className="text-[11px] text-brand-200 block uppercase font-medium">Monto Aprobado</span>
                          <span className="text-2xl font-black text-white">
                            Q{parseFloat(currentCreditoPlan.monto_solicitado).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-brand-200 block uppercase font-medium">Fecha de Aprobación</span>
                          <span className="text-sm sm:text-base font-bold text-white block">
                            {new Date(currentCreditoPlan.fecha_resolucion || currentCreditoPlan.fecha_solicitud).toLocaleDateString('es-GT', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-brand-200 block uppercase font-medium">Plazo de Pago</span>
                          <span className="text-2xl font-black text-white">
                            {currentCreditoPlan.plazo_meses} meses
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-brand-200 block uppercase font-medium">Tasa de Interés</span>
                          <span className="text-2xl font-black text-brand-300">
                            {parseFloat(currentCreditoPlan.tasa_interes).toFixed(2)}% <span className="text-xs font-normal text-brand-200">Anual Fija</span>
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-brand-100 gap-2">
                        <div className="flex items-center space-x-2">
                          <Wallet className="w-4 h-4 text-brand-300 flex-shrink-0" />
                          <span>
                            <strong>Cuenta de Acreditación:</strong>{' '}
                            {currentCreditoPlan.cuenta_destino_info ||
                              (currentCreditoPlan.cuenta_bancaria_destino_numero
                                ? `Cuenta Bancaria de ${currentCreditoPlan.cuenta_bancaria_destino_tipo || ''} (${currentCreditoPlan.cuenta_bancaria_destino_numero})`
                                : 'Cuenta Principal del Asociado')}
                          </span>
                        </div>
                        <div className="text-brand-300 text-[11px] font-medium">
                          Amortización Nivelada Francesa (Cuotas fijas)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desglose de Fórmula: Cuota Capital + Interés = Cuota del Mes */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                        <Percent className="w-4 h-4 text-brand-600" />
                        <span>Fórmula de Cobro: Cuota Capital + Interés = Cuota del Mes</span>
                      </h3>
                      <span className="text-xs text-slate-500 font-medium">
                        Cuota nivelada mensual:{' '}
                        <strong className="text-brand-800 font-bold">
                          Q{parseFloat(currentCreditoPlan.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                        </strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                      {/* Bloque 1: Cuota Capital */}
                      <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center relative flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-1">
                            Cuota Capital
                          </span>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Abono directo que amortiza y reduce el saldo de la deuda principal. Se incrementa mes a mes.
                          </p>
                        </div>
                        <div className="mt-3 font-mono text-xs font-bold text-slate-700">
                          Amortiza progresivamente
                        </div>
                        <div className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-brand-700 text-white font-black text-sm items-center justify-center shadow-xs">
                          +
                        </div>
                      </div>

                      {/* Bloque 2: Interés del Mes */}
                      <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center relative flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-extrabold text-warning-800 uppercase tracking-wider block mb-1">
                            Interés del Mes
                          </span>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Interés financiero del 10% anual calculado exclusivamente sobre el saldo insoluto pendiente.
                          </p>
                        </div>
                        <div className="mt-3 font-mono text-xs font-bold text-warning-700">
                          Tasa mensual: {(parseFloat(currentCreditoPlan.tasa_interes) / 12).toFixed(4)}%
                        </div>
                        <div className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-brand-700 text-white font-black text-sm items-center justify-center shadow-xs">
                          =
                        </div>
                      </div>

                      {/* Bloque 3: Cuota del Mes */}
                      <div className="p-5 rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 border-2 border-brand-500 text-center flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-extrabold text-brand-900 uppercase tracking-wider block mb-1">
                            Cuota del Mes
                          </span>
                          <span className="text-2xl font-black text-brand-800 block my-1">
                            Q{parseFloat(currentCreditoPlan.cuota_mensual_estimada).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <span className="text-[11px] text-brand-700 font-semibold block">
                          Cuota fija del mes (Capital + Interés)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tabla de Amortización Francesa */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                          <Calendar className="w-5 h-5 text-brand-600" />
                          <span>Cronograma Oficial de Cuotas Mensuales</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Fechas de cobro calculadas a partir de la fecha de resolución y aprobación del crédito ({new Date(currentCreditoPlan.fecha_resolucion || currentCreditoPlan.fecha_solicitud).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}).
                        </p>
                      </div>

                      {totalCuotasPages > 1 && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                            Año {cuotaPage} de {totalCuotasPages}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Controles de Paginación Anual (Bloques de 12 cuotas) para créditos > 12 meses */}
                    {totalCuotasPages > 1 && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center space-x-2 text-xs text-slate-600 font-medium">
                          <span>
                            Mostrando cuotas <strong>{(cuotaPage - 1) * cuotasPerPage + 1}</strong> a <strong>{Math.min(cuotaPage * cuotasPerPage, planAmortizacion.length)}</strong> de <strong>{planAmortizacion.length}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-brand-700 font-bold">Bloque Anual {cuotaPage}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCuotaPage((prev) => Math.max(1, prev - 1))}
                            disabled={cuotaPage === 1}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                          >
                            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                            Anterior
                          </button>

                          <div className="flex items-center space-x-1">
                            {Array.from({ length: totalCuotasPages }, (_, idx) => {
                              const pageNum = idx + 1;
                              const startCuota = (pageNum - 1) * cuotasPerPage + 1;
                              const endCuota = Math.min(pageNum * cuotasPerPage, planAmortizacion.length);
                              const isActive = cuotaPage === pageNum;
                              return (
                                <button
                                  key={pageNum}
                                  type="button"
                                  onClick={() => setCuotaPage(pageNum)}
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    isActive
                                      ? 'bg-brand-600 text-white shadow-xs'
                                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                  title={`Cuotas ${startCuota} a ${endCuota}`}
                                >
                                  Año {pageNum} ({startCuota}-{endCuota})
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => setCuotaPage((prev) => Math.min(totalCuotasPages, prev + 1))}
                            disabled={cuotaPage === totalCuotasPages}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                          >
                            Siguiente
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto border border-slate-100 rounded-xl">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-center">No. Cuota</th>
                            <th className="px-4 py-3 font-semibold">Fecha de Cobro</th>
                            <th className="px-4 py-3 font-semibold text-right">Abono a Capital</th>
                            <th className="px-4 py-3 font-semibold text-right">Interés del Mes</th>
                            <th className="px-4 py-3 font-semibold text-right text-brand-800 font-bold bg-brand-50/50">Cuota del Mes (Cap + Int)</th>
                            <th className="px-4 py-3 font-semibold text-right">Saldo Pendiente</th>
                            <th className="px-4 py-3 font-semibold text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedCuotas.map((c) => (
                            <tr key={c.numero} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-3 text-center font-mono font-bold text-slate-700 text-xs">
                                #{c.numero}
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs font-medium">
                                {c.fechaPago.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-800 text-xs">
                                Q{c.capital.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-warning-700 text-xs">
                                Q{c.interes.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-right font-extrabold text-brand-800 text-xs bg-brand-50/30">
                                Q{c.cuotaMes.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-600 text-xs">
                                Q{c.saldoPendiente.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  Programada
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800">
                          {totalCuotasPages > 1 && (
                            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
                              <td colSpan={2} className="px-4 py-2.5 uppercase tracking-wider text-slate-600 font-semibold">
                                Subtotal Año {cuotaPage} (Cuotas {(cuotaPage - 1) * cuotasPerPage + 1} a {Math.min(cuotaPage * cuotasPerPage, planAmortizacion.length)})
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                                Q{pageCapitalAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-warning-700">
                                Q{pageInteresAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right font-extrabold text-brand-800 bg-brand-100/40">
                                Q{pagePagadoAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={2} className="px-4 py-2.5 text-center text-slate-400">
                                -
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-slate-800 font-bold">
                              {totalCuotasPages > 1 ? `Total Global Crédito (${planAmortizacion.length} meses)` : 'Totales Amortización'}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-900">
                              Q{totalCapitalAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right text-warning-700">
                              Q{totalInteresAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right text-brand-800 font-extrabold bg-brand-100/70">
                              Q{totalPagadoAmortizado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500">
                              Q0.00
                            </td>
                            <td className="px-4 py-3 text-center text-slate-400">
                              -
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {totalCuotasPages > 1 && (
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>Página {cuotaPage} de {totalCuotasPages} (12 cuotas por año)</span>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setCuotaPage((prev) => Math.max(1, prev - 1))}
                            disabled={cuotaPage === 1}
                            className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            onClick={() => setCuotaPage((prev) => Math.min(totalCuotasPages, prev + 1))}
                            disabled={cuotaPage === totalCuotasPages}
                            className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB: PRODUCTOS Y BENEFICIOS ==================== */}
      {activeTab === 'productos' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-brand-600" />
              <span>Nuestras Cuentas y Tasas de Interés</span>
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Conozca las características y beneficios de los productos financieros disponibles para usted.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogoProductos.map((p) => (
              <div
                key={p.id_tipo_cuenta}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between"
              >
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-100">
                      Rendimiento
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Tasa Anual</span>
                      <span className="text-2xl font-extrabold text-slate-900">{p.tasa_interes_anual}%</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-800">{p.nombre}</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{p.descripcion}</p>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Beneficios principales</span>
                    <p className="text-xs text-slate-600 leading-normal">{p.beneficios}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 border-t border-slate-200/60 flex justify-between items-center text-xs">
                  <span className="text-slate-500">Monto apertura:</span>
                  <span className="font-bold text-slate-700">Q{parseFloat(p.monto_minimo_apertura).toLocaleString('es-GT')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TAB: MIS BENEFICIARIOS ==================== */}
      {activeTab === 'beneficiarios' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <div className="flex items-center space-x-2">
                <Users2 className="w-6 h-6 text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">
                  Declaración Legal de Beneficiarios
                </h2>
              </div>
              <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                Consulte y actualice los beneficiarios designados para cada una de sus cuentas activas.
                Conforme a la normativa interna y legal, la distribución de porcentajes debe sumar exactamente el <strong>100.00%</strong> por cuenta.
              </p>
            </div>
            <button
              onClick={fetchMisBeneficiarios}
              disabled={loadingBeneficiarios}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBeneficiarios ? 'animate-spin text-brand-600' : ''}`} />
              <span>Actualizar Lista</span>
            </button>
          </div>

          {loadingBeneficiarios ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
              <p className="text-xs font-semibold">Cargando beneficiarios registrados...</p>
            </div>
          ) : misBeneficiariosData.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
              <Users2 className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No se encontraron cuentas activas</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No posee cuentas registradas que requieran designación de beneficiarios en este momento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {misBeneficiariosData.map((cuenta) => {
                const totalPct = (cuenta.beneficiarios || []).reduce((acc, b) => acc + (parseFloat(b.porcentaje) || 0), 0);
                const isComplete = Math.abs(totalPct - 100.00) < 0.01;

                return (
                  <div key={cuenta.id_cuenta} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-100 text-brand-800">
                            {cuenta.tipo_cuenta}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-800">
                            {cuenta.numero_cuenta}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center space-x-4">
                          <span>Saldo disponible: <strong className="text-slate-800">Q{parseFloat(cuenta.saldo_disponible || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong></span>
                          <span>•</span>
                          <span className={isComplete ? 'text-brand-700 font-semibold flex items-center space-x-1' : 'text-warning-600 font-semibold flex items-center space-x-1'}>
                            {isComplete ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                                <span>Distribución 100.00% asignada</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3.5 h-3.5 text-warning-500" />
                                <span>Distribución incompleta ({totalPct.toFixed(2)}%)</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => openEditarBeneficiariosModal(cuenta)}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                      >
                        <Users2 className="w-3.5 h-3.5" />
                        <span>Gestionar Beneficiarios</span>
                      </button>
                    </div>

                    <div className="p-5 sm:p-6">
                      {!cuenta.beneficiarios || cuenta.beneficiarios.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          <AlertCircle className="w-8 h-8 text-warning-500 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-700">Sin beneficiarios registrados</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Haga clic en "Gestionar Beneficiarios" para declarar los beneficiarios legales de esta cuenta.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2.5 font-semibold">Nombre Completo</th>
                                <th className="px-4 py-2.5 font-semibold">Parentesco</th>
                                <th className="px-4 py-2.5 font-semibold">DPI / CUI</th>
                                <th className="px-4 py-2.5 font-semibold">Teléfono</th>
                                <th className="px-4 py-2.5 font-semibold text-right">Porcentaje Asignado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {cuenta.beneficiarios.map((b, idx) => (
                                <tr key={b.id_beneficiario || idx} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-3 font-semibold text-slate-800">
                                    {b.nombre_completo}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                                      {b.parentesco}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-slate-600">
                                    {b.cui_dpi || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {b.telefono || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                                      {parseFloat(b.porcentaje).toFixed(2)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-50/70 border-t border-slate-200 font-bold">
                              <tr>
                                <td colSpan="4" className="px-4 py-2 text-right text-slate-600 text-xs">
                                  Total Distribuido:
                                </td>
                                <td className="px-4 py-2 text-right text-xs text-brand-800">
                                  {totalPct.toFixed(2)}%
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Movimientos de Cuenta */}
      {isModalOpen && selectedCuenta && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div
            className="bg-white rounded-2xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="movimientos-modal-title"
          >
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                  {selectedCuenta.tipo_cuenta}
                </span>
                <h2 id="movimientos-modal-title" className="text-xl font-bold text-slate-900 mt-0.5">
                  Movimientos de Cuenta: {selectedCuenta.numero_cuenta}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedCuenta, transactions)}
                  disabled={generatingPdf}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200/80 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Descargar Estado de Cuenta Oficial en PDF"
                >
                  {generatingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-700" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5 text-brand-700" />
                  )}
                  <span className="hidden sm:inline">Descargar PDF</span>
                </button>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setTransactions([]);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-wrap gap-6 justify-between items-center text-sm">
              <div>
                <span className="text-slate-400 block text-xs">Saldo Disponible</span>
                <span className="text-lg font-bold text-slate-900">
                  Q{parseFloat(selectedCuenta.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Saldo en Reserva</span>
                <span className="text-sm font-semibold text-slate-700">
                  Q{parseFloat(selectedCuenta.saldo_reserva).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Tasa de Interés Anual</span>
                <span className="text-sm font-semibold text-slate-700">{selectedCuenta.tasa_interes_anual}%</span>
              </div>
            </div>

            {loadingTx ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                <p className="text-xs">Consultando transacciones...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Activity className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                <p className="text-sm">No se encontraron movimientos registrados para esta cuenta.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Fecha / Hora</th>
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Referencia</th>
                      <th className="px-4 py-3 font-semibold text-right">Monto</th>
                      <th className="px-4 py-3 font-semibold text-right">Saldo Resultante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((t) => {
                      const isCredit = ['DEPOSITO', 'PAGO_CREDITO'].includes(t.tipo_transaccion);
                      return (
                        <tr key={t.id_transaccion} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3.5 text-slate-500 text-xs">
                            {new Date(t.fecha_transaccion).toLocaleString()}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-xs">
                            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full ${
                              isCredit ? 'bg-brand-50 text-brand-700' : 'bg-warning-50 text-warning-700'
                            }`}>
                              {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              <span>{t.tipo_transaccion}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 font-mono text-xs">
                            {t.referencia || '-'}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-bold ${
                            isCredit ? 'text-brand-700' : 'text-slate-800'
                          }`}>
                            {isCredit ? '+' : '-'}Q{parseFloat(t.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 text-right text-slate-900 font-semibold">
                            Q{parseFloat(t.saldo_nuevo).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedCuenta, transactions)}
                disabled={generatingPdf}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-brand-700 to-brand-900 hover:from-brand-800 hover:to-brand-950 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>Descargar Estado de Cuenta Oficial (PDF)</span>
              </button>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setTransactions([]);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ==================== MODAL: FORMULARIO DE TRASLADO DE PLANILLA ==================== */}
      {isTrasladoModalOpen && cuentaPlanilla && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="traslado-modal-title"
          >
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                  Autogestión de Fondos
                </span>
                <h2 id="traslado-modal-title" className="text-xl font-bold text-slate-900 mt-0.5">
                  Solicitud de Traslado / Apertura
                </h2>
              </div>
              <button
                onClick={closeTrasladoModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6 p-4 bg-brand-50 border border-brand-100 rounded-xl flex items-start space-x-3 text-brand-950 text-xs">
              <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Cuenta Origen: {cuentaPlanilla.tipo_cuenta} ({cuentaPlanilla.numero_cuenta})</span>
                <span>Saldo disponible para trasladar: <strong className="text-brand-900">Q{parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}</strong></span>
              </div>
            </div>

            <form onSubmit={handleTrasladoSubmit} className="space-y-5">
              {/* Alertas internas de validación o error */}
              {(modalErrorMessage || realTimeError) && (
                <div className="p-3 bg-danger-50 text-danger-700 border border-danger-200 rounded-xl text-xs sm:text-sm flex items-start space-x-2 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
                  <span>{modalErrorMessage || realTimeError}</span>
                </div>
              )}

              {/* Campo Monto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Monto a Trasladar
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-[12px] text-slate-400 font-bold text-sm">Q</div>
                  <input
                    type="number"
                    min={1}
                    max={parseFloat(cuentaPlanilla.saldo_disponible)}
                    step={0.01}
                    value={montoTraslado}
                    onChange={(e) => setMontoTraslado(e.target.value)}
                    placeholder="Q0.00"
                    required
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              {/* Campo Cuenta/Producto Destino */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Seleccionar Destino
                </label>
                <select
                  value={destinoSeleccionado}
                  onChange={(e) => handleDestinoChange(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                >
                  <option value="">-- Seleccione una opción --</option>
                  
                  {/* Cuentas existentes elegibles (excluye la cuenta origen) */}
                  {cuentasDestinoFiltradas.length > 0 && (
                    <optgroup label="Cuentas Existentes (Traslado Directo)">
                      {cuentasDestinoFiltradas.map((d) => (
                        <option key={`EXISTENTE:${d.id_cuenta}`} value={`EXISTENTE:${d.id_cuenta}`}>
                          {d.tipo_cuenta} - {d.numero_cuenta} (Saldo: Q{parseFloat(d.saldo_disponible).toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {/* Productos disponibles para abrir */}
                  {cuentasDestino.tiposDisponibles.length > 0 && (
                    <optgroup label="Nueva Apertura (Crear y Trasladar)">
                      {cuentasDestino.tiposDisponibles.map((t) => (
                        <option key={`APERTURA:${t.id_tipo_cuenta}`} value={`APERTURA:${t.id_tipo_cuenta}`}>
                          Apertura: {t.nombre} (Mínimo: Q{parseFloat(t.monto_minimo_apertura).toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Observaciones / Motivo del traslado
                </label>
                <textarea
                  value={observacionesTraslado}
                  onChange={(e) => setObservacionesTraslado(e.target.value)}
                  placeholder="Detalles opcionales sobre el motivo del traslado"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
                />
              </div>

              {/* Advertencia Legal */}
              <div className="p-3 bg-warning-50 border border-warning-200 rounded-xl flex items-start space-x-2 text-warning-900 text-[10px] leading-relaxed">
                <HelpCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Aviso Importante:</strong> Se generará un número de caso único que pasará al flujo de revisión del equipo de operaciones para su aprobación correspondiente.
                </span>
              </div>

              {/* Botones de acción */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeTrasladoModal}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviandoTraslado || !!realTimeError}
                  className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-sm font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviandoTraslado ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar Solicitud</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal para Editar Beneficiarios del Asociado (Req-9) */}
      {selectedCuentaParaEditar && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp max-h-[90vh] flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <span className="text-xs font-bold text-brand-700 uppercase tracking-widest block">
                  Declaración Legal de Beneficiarios
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                  {selectedCuentaParaEditar.tipo_cuenta} • {selectedCuentaParaEditar.numero_cuenta}
                </h2>
              </div>
              <button
                onClick={closeEditarBeneficiariosModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
              <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-brand-950 text-xs flex items-start space-x-2">
                <Info className="w-4 h-4 text-brand-700 flex-shrink-0 mt-0.5" />
                <span>
                  Los beneficiarios recibirán los fondos de la cuenta en caso de fallecimiento del titular. La sumatoria de todos los porcentajes asignados debe ser exactamente <strong>100.00%</strong>.
                </span>
              </div>

              {modalBenError && (
                <div className="p-3 bg-danger-50 border border-danger-200 text-danger-700 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalBenError}</span>
                </div>
              )}

              {/* Lista de Beneficiarios */}
              <div className="space-y-3">
                {editBeneficiariosList.map((ben, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Beneficiario #{idx + 1}
                      </span>
                      {editBeneficiariosList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBeneficiarioAsociado(idx)}
                          className="text-danger-500 hover:text-danger-700 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-slate-600 font-semibold mb-1">
                          Nombre Completo *
                        </label>
                        <input
                          type="text"
                          value={ben.nombre_completo}
                          onChange={(e) => {
                            const updated = [...editBeneficiariosList];
                            updated[idx].nombre_completo = e.target.value;
                            setEditBeneficiariosList(updated);
                          }}
                          placeholder="Nombre y Apellidos completos"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">
                          Parentesco *
                        </label>
                        <select
                          value={ben.parentesco}
                          onChange={(e) => {
                            const updated = [...editBeneficiariosList];
                            updated[idx].parentesco = e.target.value;
                            setEditBeneficiariosList(updated);
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                        >
                          <option value="CÓNYUGE">CÓNYUGE</option>
                          <option value="HIJO/A">HIJO/A</option>
                          <option value="PADRE">PADRE</option>
                          <option value="MADRE">MADRE</option>
                          <option value="HERMANO/A">HERMANO/A</option>
                          <option value="OTRO">OTRO</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">
                          DPI / CUI
                        </label>
                        <input
                          type="text"
                          value={ben.cui_dpi || ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                            const updated = [...editBeneficiariosList];
                            updated[idx].cui_dpi = val;
                            setEditBeneficiariosList(updated);
                          }}
                          placeholder="13 dígitos"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">
                          Teléfono (8 dígitos)
                        </label>
                        <input
                          type="text"
                          maxLength={8}
                          value={ben.telefono || ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                            const updated = [...editBeneficiariosList];
                            updated[idx].telefono = val;
                            setEditBeneficiariosList(updated);
                          }}
                          placeholder="Ej. 55551234"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">
                          Porcentaje (%) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.01"
                            value={ben.porcentaje}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...editBeneficiariosList];
                              updated[idx].porcentaje = val;
                              setEditBeneficiariosList(updated);
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-bold text-slate-800 pr-8"
                          />
                          <Percent className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botón Agregar Beneficiario */}
              <button
                type="button"
                onClick={handleAddBeneficiarioAsociado}
                disabled={totalPorcentajeAsociado >= 100}
                className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-brand-500 text-slate-600 hover:text-brand-700 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Beneficiario</span>
              </button>

              {/* Barra de Distribución Porcentual */}
              <div className={`p-4 rounded-xl border ${
                Math.abs(totalPorcentajeAsociado - 100.00) < 0.01
                  ? 'bg-brand-50 border-brand-200 text-brand-900'
                  : totalPorcentajeAsociado > 100
                  ? 'bg-danger-50 border-danger-200 text-danger-900'
                  : 'bg-warning-50 border-warning-200 text-warning-900'
              }`}>
                <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                  <span>Total Distribuido:</span>
                  <span className="text-sm font-extrabold">{totalPorcentajeAsociado.toFixed(2)}% de 100.00%</span>
                </div>
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      Math.abs(totalPorcentajeAsociado - 100.00) < 0.01
                        ? 'bg-brand-600'
                        : totalPorcentajeAsociado > 100
                        ? 'bg-danger-600'
                        : 'bg-warning-500'
                    }`}
                    style={{ width: `${Math.min(100, totalPorcentajeAsociado)}%` }}
                  />
                </div>
                <div className="text-[11px] mt-1.5">
                  {Math.abs(totalPorcentajeAsociado - 100.00) < 0.01 ? (
                    <span className="text-brand-700 font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Distribución exacta y aprobable (100.00%).</span>
                    </span>
                  ) : totalPorcentajeAsociado > 100 ? (
                    <span className="text-danger-700 font-semibold">
                      Excede el 100.00% por {(totalPorcentajeAsociado - 100).toFixed(2)}%. Reduzca los porcentajes.
                    </span>
                  ) : (
                    <span className="text-warning-700 font-semibold">
                      Falta asignar el {(100 - totalPorcentajeAsociado).toFixed(2)}% para completar el 100.00%.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
              <div className="text-xs">
                {!hasAssociateBenChanges && Math.abs(totalPorcentajeAsociado - 100.00) < 0.01 && (
                  <span className="text-slate-400 italic text-[11px]">
                    Sin modificaciones pendientes por guardar
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={closeEditarBeneficiariosModal}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveBeneficiariosSubmit}
                  disabled={savingBeneficiarios || Math.abs(totalPorcentajeAsociado - 100.00) > 0.01 || !hasAssociateBenChanges}
                  className="px-5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!hasAssociateBenChanges ? 'Modifique algún campo o porcentaje para guardar' : ''}
                >
                  {savingBeneficiarios ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Guardar Declaración (100.00%)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Recorrido Guiado Interactivo para Nuevos Asociados */}
      <AssociateOnboardingTour
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        forceOpen={showTour}
        onCloseTour={() => setShowTour(false)}
      />
    </div>
  );
};

export default AssociateDashboard;
