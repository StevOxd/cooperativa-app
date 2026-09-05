import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

export const AssociateDashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estados de navegación interna (Tabs)
  const [activeTab, setActiveTab] = useState('resumen');

  // Estados del modal de movimientos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Estados del módulo de Traslado de Planilla
  const [cuentaPlanilla, setCuentaPlanilla] = useState(null);
  const [cuentasDestino, setCuentasDestino] = useState({ cuentasExistentes: [], tiposDisponibles: [] });
  const [solicitudesTraslado, setSolicitudesTraslado] = useState([]);
  const [catalogoProductos, setCatalogoProductos] = useState([]);

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

  const minRequerido = getMinimoRequerido();
  const nombreProductoDestino = getNombreProductoDestino();
  const parsedMontoVal = parseFloat(montoTraslado) || 0;
  const isMontoInferior = minRequerido > 0 && parsedMontoVal > 0 && parsedMontoVal < minRequerido;
  const isMontoMayorQueSaldo = cuentaPlanilla && parsedMontoVal > parseFloat(cuentaPlanilla.saldo_disponible);

  let realTimeError = '';
  if (isMontoInferior) {
    realTimeError = `El monto solicitado de Q${parsedMontoVal.toFixed(2)} es inferior al monto mínimo de apertura para la cuenta ${nombreProductoDestino} (Mínimo: Q${minRequerido.toFixed(2)}).`;
  } else if (isMontoMayorQueSaldo) {
    realTimeError = `Saldo insuficiente. Su cuenta de planilla dispone de Q${parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}.`;
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
      setModalErrorMessage('No posee una Cuenta de Planilla activa para realizar traslados.');
      return;
    }

    if (monto > parseFloat(cuentaPlanilla.saldo_disponible)) {
      setModalErrorMessage(`Saldo insuficiente en su cuenta de planilla (Disponible: Q${parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}).`);
      return;
    }

    if (!destinoSeleccionado) {
      setModalErrorMessage('Debe seleccionar una cuenta o producto de destino.');
      return;
    }

    // Validación extra en tiempo real preventiva
    if (realTimeError) {
      setModalErrorMessage(realTimeError);
      return;
    }

    setEnviandoTraslado(true);
    const [destType, destId] = destinoSeleccionado.split(':');

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
  const activeCreditosCount = creditos.filter(c => ['PENDIENTE', 'EN_ANALISIS', 'APROBADA', 'DESEMBOLSADA'].includes(c.estado)).length;

  const getStatusBadge = (estado) => {
    switch (estado) {
      case 'APROBADO':
      case 'APROBADA':
      case 'DESEMBOLSADA':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'RECHAZADO':
      case 'RECHAZADA':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-10 h-10 text-emerald-700 animate-spin mb-3" />
        <p className="text-sm font-semibold">Cargando Portal de Autogestión...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado del Portal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest block mb-1">
            Portal de Autogestión del Asociado
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bienvenido, {profile?.primer_nombre} {profile?.primer_apellido}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Código Asociado: <span className="font-mono font-bold text-slate-800">{profile?.codigo_corporativo}</span> | Ingreso: {profile?.fecha_ingreso ? new Date(profile.fecha_ingreso).toLocaleDateString() : '-'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={openTrasladoModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Solicitar Traslado</span>
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs Navegación */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('resumen')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'resumen'
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Resumen Financiero
        </button>
        <button
          onClick={() => setActiveTab('planilla')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'planilla'
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cuenta de Planilla y Traslados
        </button>
        <button
          onClick={() => setActiveTab('productos')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'productos'
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Productos y Beneficios
        </button>
      </div>

      {/* Alertas */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-red-600 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== TAB: RESUMEN FINANCIERO ==================== */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* Tarjetas de Resumen Financiero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total Ahorros */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Total Ahorros y Aportaciones
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block">
                  Q{totalAhorrado.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
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
              <span>Mis Cuentas de Ahorro y Aportaciones</span>
            </h2>

            {cuentas.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
                <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold">No posee cuentas activas actualmente.</p>
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
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

                    <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() => openMovimientosModal(c)}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
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

      {/* ==================== TAB: CUENTA DE PLANILLA Y TRASLADOS ==================== */}
      {activeTab === 'planilla' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Cuenta Planilla Info (Izquierda) */}
            <div className="md:col-span-5 bg-gradient-to-br from-emerald-800 to-teal-950 p-6 sm:p-8 rounded-2xl text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
              <div className="relative z-10 space-y-6">
                <div>
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest block mb-1">
                    Cuenta Origen Principal
                  </span>
                  <h3 className="text-lg font-bold">Cuenta de Planilla</h3>
                  {cuentaPlanilla ? (
                    <span className="text-sm font-mono font-semibold text-emerald-200 block mt-0.5">
                      {cuentaPlanilla.numero_cuenta}
                    </span>
                  ) : (
                    <span className="text-sm text-red-300 block mt-0.5">No vinculada</span>
                  )}
                </div>

                <div className="border-t border-white/10 pt-4">
                  <span className="text-xs text-emerald-200 block mb-1">Saldo Disponible Receptivo</span>
                  <span className="text-3xl font-extrabold tracking-tight">
                    Q{cuentaPlanilla ? parseFloat(cuentaPlanilla.saldo_disponible).toLocaleString('es-GT', { minimumFractionDigits: 2 }) : '0.00'}
                  </span>
                  <p className="text-[10px] text-emerald-300/80 leading-normal mt-2">
                    Fondo depositado por su empleador. Puede trasladarlo inmediatamente a cuentas de ahorro para generar rentabilidad o constituir aportaciones.
                  </p>
                </div>

                <button
                  onClick={openTrasladoModal}
                  disabled={!cuentaPlanilla}
                  className="w-full py-3 bg-white hover:bg-slate-50 text-emerald-950 font-bold text-sm rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trasladar Fondos
                </button>
              </div>
            </div>

            {/* Historial de Traslados (Derecha) */}
            <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800">
                  Solicitudes de Traslado de Fondos
                </h3>
                <span className="text-xs text-slate-500 font-semibold bg-slate-50 px-2 py-0.5 rounded border">
                  Bajo revisión del operador
                </span>
              </div>

              {solicitudesTraslado.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Activity className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-semibold">No tiene traslados registrados.</p>
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
                      {solicitudesTraslado.map((s) => (
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
                                <Clock className="w-3 h-3 text-amber-500" />
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

      {/* ==================== TAB: PRODUCTOS Y BENEFICIOS ==================== */}
      {activeTab === 'productos' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
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
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
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

      {/* Modal de Movimientos de Cuenta */}
      {isModalOpen && selectedCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest block">
                  {selectedCuenta.tipo_cuenta}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  Movimientos de Cuenta: {selectedCuenta.numero_cuenta}
                </h2>
              </div>
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
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
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
                              isCredit ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              <span>{t.tipo_transaccion}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 font-mono text-xs">
                            {t.referencia || '-'}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-bold ${
                            isCredit ? 'text-emerald-700' : 'text-slate-800'
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

            <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setTransactions([]);
                }}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: FORMULARIO DE TRASLADO DE PLANILLA ==================== */}
      {isTrasladoModalOpen && cuentaPlanilla && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest block">
                  Autogestión de Fondos
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
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

            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start space-x-3 text-emerald-950 text-xs">
              <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Cuenta Origen: Planilla ({cuentaPlanilla.numero_cuenta})</span>
                <span>Saldo disponible para trasladar: <strong className="text-emerald-900">Q{parseFloat(cuentaPlanilla.saldo_disponible).toFixed(2)}</strong></span>
              </div>
            </div>

            <form onSubmit={handleTrasladoSubmit} className="space-y-5">
              {/* Alertas internas de validación o error */}
              {(modalErrorMessage || realTimeError) && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs sm:text-sm flex items-start space-x-2 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
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
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                >
                  <option value="">-- Seleccione una opción --</option>
                  
                  {/* Cuentas existentes */}
                  {cuentasDestino.cuentasExistentes.length > 0 && (
                    <optgroup label="Cuentas Existentes (Traslado Directo)">
                      {cuentasDestino.cuentasExistentes.map((d) => (
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* Advertencia Legal */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2 text-amber-900 text-[10px] leading-relaxed">
                <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
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
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      )}
    </div>
  );
};

export default AssociateDashboard;
