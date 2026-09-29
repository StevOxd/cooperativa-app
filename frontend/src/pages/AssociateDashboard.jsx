import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Loader2, RefreshCw, Send, Compass, Users2 } from 'lucide-react';
import AssociateOnboardingTour from '../components/associate/AssociateOnboardingTour';
import { useToast } from '../context/ToastContext';
import { generateAccountStatementPdf } from '../utils/accountStatementPdf';
import { AssociateSummaryTab } from '../components/associate/dashboard/AssociateSummaryTab';
import { AssociateTransfersTab } from '../components/associate/dashboard/AssociateTransfersTab';
import { AssociateCreditsTab } from '../components/associate/dashboard/AssociateCreditsTab';
import { AssociateProductsTab } from '../components/associate/dashboard/AssociateProductsTab';
import { AssociateBeneficiariesTab } from '../components/associate/dashboard/AssociateBeneficiariesTab';
import { AccountMovementsModal } from '../components/associate/dashboard/AccountMovementsModal';
import { TransferRequestModal } from '../components/associate/dashboard/TransferRequestModal';
import { EditBeneficiariesModal } from '../components/associate/dashboard/EditBeneficiariesModal';

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-lg border border-slate-200">
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
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-md border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-800 text-xs font-bold transition-colors cursor-pointer"
            title="Ver recorrido guiado por las funciones del portal"
          >
            <Compass className="w-3.5 h-3.5 text-brand-700" />
            <span>Recorrido Guiado</span>
          </button>
          <button
            onClick={openTrasladoModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Solicitar Traslado</span>
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors cursor-pointer"
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
            <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-brand-100 text-brand-800">
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
        <AssociateSummaryTab
          activeCreditosCount={activeCreditosCount}
          activeCuentasCount={activeCuentasCount}
          cuentas={cuentas}
          downloadingAccountId={downloadingAccountId}
          generatingPdf={generatingPdf}
          handleDownloadPdf={handleDownloadPdf}
          openMovimientosModal={openMovimientosModal}
          setActiveTab={setActiveTab}
          totalAhorrado={totalAhorrado}
        />
      )}

      {/* ==================== TAB: CUENTA ORIGEN Y TRASLADOS ==================== */}
      {activeTab === 'planilla' && (
        <AssociateTransfersTab
          cuentaPlanilla={cuentaPlanilla}
          cuentas={cuentas}
          filterTrasladoEstado={filterTrasladoEstado}
          filterTrasladoTipo={filterTrasladoTipo}
          filteredSolicitudesTraslado={filteredSolicitudesTraslado}
          getStatusBadge={getStatusBadge}
          openTrasladoModal={openTrasladoModal}
          searchTrasladoQuery={searchTrasladoQuery}
          setFilterTrasladoEstado={setFilterTrasladoEstado}
          setFilterTrasladoTipo={setFilterTrasladoTipo}
          setSearchTrasladoQuery={setSearchTrasladoQuery}
          solicitudesTraslado={solicitudesTraslado}
        />
      )}

      {/* ==================== TAB: PLAN DE PAGOS Y CRÉDITOS ==================== */}
      {activeTab === 'creditos' && (
        <AssociateCreditsTab
          creditosAprobados={creditosAprobados}
          cuotaPage={cuotaPage}
          cuotasPerPage={cuotasPerPage}
          currentCreditoPlan={currentCreditoPlan}
          pageCapitalAmortizado={pageCapitalAmortizado}
          pageInteresAmortizado={pageInteresAmortizado}
          pagePagadoAmortizado={pagePagadoAmortizado}
          paginatedCuotas={paginatedCuotas}
          planAmortizacion={planAmortizacion}
          setCuotaPage={setCuotaPage}
          setSelectedCreditoPlanId={setSelectedCreditoPlanId}
          totalCapitalAmortizado={totalCapitalAmortizado}
          totalCuotasPages={totalCuotasPages}
          totalInteresAmortizado={totalInteresAmortizado}
          totalPagadoAmortizado={totalPagadoAmortizado}
        />
      )}

      {/* ==================== TAB: PRODUCTOS Y BENEFICIOS ==================== */}
      {activeTab === 'productos' && (
        <AssociateProductsTab
          catalogoProductos={catalogoProductos}
        />
      )}

      {/* ==================== TAB: MIS BENEFICIARIOS ==================== */}
      {activeTab === 'beneficiarios' && (
        <AssociateBeneficiariesTab
          fetchMisBeneficiarios={fetchMisBeneficiarios}
          loadingBeneficiarios={loadingBeneficiarios}
          misBeneficiariosData={misBeneficiariosData}
          openEditarBeneficiariosModal={openEditarBeneficiariosModal}
        />
      )}

      {/* Modal de Movimientos de Cuenta */}
      <AccountMovementsModal
        generatingPdf={generatingPdf}
        handleDownloadPdf={handleDownloadPdf}
        isModalOpen={isModalOpen}
        loadingTx={loadingTx}
        selectedCuenta={selectedCuenta}
        setIsModalOpen={setIsModalOpen}
        setTransactions={setTransactions}
        transactions={transactions}
      />

      {/* ==================== MODAL: FORMULARIO DE TRASLADO DE PLANILLA ==================== */}
      <TransferRequestModal
        closeTrasladoModal={closeTrasladoModal}
        cuentaPlanilla={cuentaPlanilla}
        cuentasDestino={cuentasDestino}
        cuentasDestinoFiltradas={cuentasDestinoFiltradas}
        destinoSeleccionado={destinoSeleccionado}
        enviandoTraslado={enviandoTraslado}
        handleDestinoChange={handleDestinoChange}
        handleTrasladoSubmit={handleTrasladoSubmit}
        isTrasladoModalOpen={isTrasladoModalOpen}
        modalErrorMessage={modalErrorMessage}
        montoTraslado={montoTraslado}
        observacionesTraslado={observacionesTraslado}
        realTimeError={realTimeError}
        setMontoTraslado={setMontoTraslado}
        setObservacionesTraslado={setObservacionesTraslado}
      />

      {/* Modal para Editar Beneficiarios del Asociado (Req-9) */}
      <EditBeneficiariesModal
        closeEditarBeneficiariosModal={closeEditarBeneficiariosModal}
        editBeneficiariosList={editBeneficiariosList}
        handleAddBeneficiarioAsociado={handleAddBeneficiarioAsociado}
        handleRemoveBeneficiarioAsociado={handleRemoveBeneficiarioAsociado}
        handleSaveBeneficiariosSubmit={handleSaveBeneficiariosSubmit}
        hasAssociateBenChanges={hasAssociateBenChanges}
        modalBenError={modalBenError}
        savingBeneficiarios={savingBeneficiarios}
        selectedCuentaParaEditar={selectedCuentaParaEditar}
        setEditBeneficiariosList={setEditBeneficiariosList}
        totalPorcentajeAsociado={totalPorcentajeAsociado}
      />

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
