import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socket';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Unlock,
  X,
  Lock,
  Mail,
  User,
  CreditCard,
  Phone,
  MapPin,
  Shield,
  KeyRound,
  Sparkles,
  Ban,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import TableSkeleton from '../components/common/TableSkeleton';
import GoogleEmailConfigModal from '../components/admin/GoogleEmailConfigModal';

export const UsersPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterRol, setFilterRol] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [emailConfigModalOpen, setEmailConfigModalOpen] = useState(false);

  // Sincronizar mensajes hacia el estándar de Toasts flotantes tipo socket (4s)
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

  // Estados del Modal (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserPersonaId, setEditingUserPersonaId] = useState(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Estados para Modal de Reinicio de Contraseña
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetMotivo, setResetMotivo] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Estados para Modal de Cambio de Estado (Ventana de Motivo a INACTIVO)
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTargetUser, setStatusTargetUser] = useState(null);
  const [statusNewValue, setStatusNewValue] = useState('INACTIVO');
  const [statusMotivo, setStatusMotivo] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState('');

  const isAnyModalOpen = isModalOpen || (statusModalOpen && !!statusTargetUser) || (resetModalOpen && !!resetTargetUser);

  useEffect(() => {
    if (isAnyModalOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isAnyModalOpen]);

  // Formulario con campos 3FN + Código de Usuario
  const [formData, setFormData] = useState({
    codigo_corporativo: '',
    cui_dpi: '',
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    fecha_nacimiento: '',
    telefono: '',
    direccion: '',
    email: '',
    password: '',
    rol: 'EJECUTIVO',
    estado: 'ACTIVO',
    tipo_asociado: 'EX',
  });

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

  const [previewCode, setPreviewCode] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);

  // Consultar automáticamente el siguiente código correlativo al crear usuario según el rol
  useEffect(() => {
    if (isModalOpen && !isEditing && formData.rol) {
      setLoadingCode(true);
      api.get(`/usuarios/next-code?rol=${formData.rol}`)
        .then((res) => {
          if (res.data?.success) {
            setPreviewCode(res.data.next_code);
            setFormData((prev) => ({ ...prev, codigo_corporativo: res.data.next_code }));
          }
        })
        .catch((err) => {
          console.error('Error al obtener siguiente código correlativo:', err);
          const fallback = formData.rol === 'EJECUTIVO' ? 'EJ-1' : 'OP-1';
          setPreviewCode(fallback);
          setFormData((prev) => ({ ...prev, codigo_corporativo: fallback }));
        })
        .finally(() => setLoadingCode(false));
    }
  }, [isModalOpen, isEditing, formData.rol]);

  const fetchUsers = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const params = {};
      if (filterEstado) params.estado = filterEstado;
      if (filterRol) params.rol = filterRol;
      if (searchTerm) params.search = searchTerm;

      const response = await api.get('/usuarios', { params });
      if (response.data?.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      setErrorMessage(error.response?.data?.message || 'No se pudieron cargar los usuarios del servidor.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [filterEstado, filterRol]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Escuchar eventos de presencia en tiempo real vía Socket.io
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handlePresence = (data) => {
        if (data && data.id_persona !== undefined) {
          setUsers((prevUsers) =>
            prevUsers.map((u) => {
              const uId = Number(u.id_persona || u.id);
              if (uId === Number(data.id_persona)) {
                return { ...u, en_linea: Boolean(data.en_linea) };
              }
              return u;
            })
          );
        } else {
          fetchUsers(false);
        }
      };
      socket.on('presence_update', handlePresence);
      return () => {
        socket.off('presence_update', handlePresence);
      };
    }
  }, []);

  // Desbloqueo administrativo en 1 clic
  const handleDesbloquear = async (userId) => {
    try {
      setErrorMessage('');
      setSuccessMessage('');
      const response = await api.patch(`/usuarios/${userId}/desbloquear`);
      if (response.data?.success) {
        setSuccessMessage(response.data.message || 'Usuario desbloqueado exitosamente.');
        fetchUsers(false);
      }
    } catch (error) {
      console.error('Error al desbloquear usuario:', error);
      setErrorMessage(error.response?.data?.message || 'Error al desbloquear al usuario.');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers();
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingUserPersonaId(null);
    setFormData({
      codigo_corporativo: '',
      cui_dpi: '',
      primer_nombre: '',
      segundo_nombre: '',
      primer_apellido: '',
      segundo_apellido: '',
      fecha_nacimiento: '',
      telefono: '',
      direccion: '',
      email: '',
      password: '',
      rol: 'EJECUTIVO',
      estado: 'ACTIVO',
      tipo_asociado: 'EX',
    });
    setPreviewCode('');
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (u) => {
    setIsEditing(true);
    setEditingUserPersonaId(u.id_persona || u.id);
    setFormData({
      codigo_corporativo: u.codigo_corporativo || '',
      cui_dpi: u.cui_dpi || '',
      primer_nombre: u.primer_nombre || '',
      segundo_nombre: u.segundo_nombre || '',
      primer_apellido: u.primer_apellido || '',
      segundo_apellido: u.segundo_apellido || '',
      fecha_nacimiento: u.fecha_nacimiento ? String(u.fecha_nacimiento).split('T')[0] : '',
      telefono: u.telefono || '',
      direccion: u.direccion || '',
      email: u.email || '',
      password: '', // Dejar en blanco para conservar actual
      rol: u.rol || 'ASOCIADO',
      estado: u.estado || 'ACTIVO',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    // Validaciones de negocio y formato (igual al estándar institucional y de asociados)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email.trim())) {
      setModalError('Ingrese un correo electrónico válido (ejemplo: usuario@correo.com).');
      return;
    }

    const cleanCui = (formData.cui_dpi || '').replace(/\D/g, '');
    if (cleanCui.length !== 13) {
      setModalError('El DPI / CUI debe contener exactamente 13 dígitos numéricos.');
      return;
    }

    const cleanTel = (formData.telefono || '').replace(/\D/g, '');
    if (cleanTel && cleanTel.length !== 8) {
      setModalError('El número de teléfono debe contener exactamente 8 dígitos numéricos.');
      return;
    }

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!formData.primer_nombre || formData.primer_nombre.trim().length < 2) {
      setModalError('El primer nombre es obligatorio (mínimo 2 letras).');
      return;
    }
    if (!nameRegex.test(formData.primer_nombre.trim())) {
      setModalError('El primer nombre solo debe contener letras, sin números ni símbolos.');
      return;
    }

    if (formData.segundo_nombre && !nameRegex.test(formData.segundo_nombre.trim())) {
      setModalError('El segundo nombre solo debe contener letras, sin números ni símbolos.');
      return;
    }

    if (!formData.primer_apellido || formData.primer_apellido.trim().length < 2) {
      setModalError('El primer apellido es obligatorio (mínimo 2 letras).');
      return;
    }
    if (!nameRegex.test(formData.primer_apellido.trim())) {
      setModalError('El primer apellido solo debe contener letras, sin números ni símbolos.');
      return;
    }

    if (formData.segundo_apellido && !nameRegex.test(formData.segundo_apellido.trim())) {
      setModalError('El segundo apellido solo debe contener letras, sin números ni símbolos.');
      return;
    }

    if (!formData.fecha_nacimiento) {
      setModalError('La fecha de nacimiento es obligatoria.');
      return;
    }

    const ageCheck = calculateAgeInfo(formData.fecha_nacimiento);
    if (!ageCheck || !ageCheck.valid) {
      setModalError(ageCheck?.message || 'El colaborador debe ser mayor de edad (mínimo 18 años).');
      return;
    }

    setModalSubmitting(true);

    try {
      if (isEditing) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;

        const response = await api.put(`/usuarios/${editingUserPersonaId}`, payload);
        if (response.data?.success) {
          setSuccessMessage('Usuario actualizado exitosamente.');
          setIsModalOpen(false);
          fetchUsers();
        }
      } else {
        // En creación de nuevo colaborador institucional:
        // La contraseña se genera de forma aleatoria en el servidor y se envía al correo registrado
        // El código de usuario es asignado automáticamente según el correlativo del rol (EJ-X, OP-X)
        const payload = {
          ...formData,
          password: undefined, // Generación aleatoria criptográfica en backend
        };

        const response = await api.post('/usuarios', payload);
        if (response.data?.success) {
          const codAsignado = response.data.data?.codigo_corporativo || previewCode || '';
          setSuccessMessage(
            `Usuario ${codAsignado} creado exitosamente. La contraseña temporal generada fue enviada al correo ${formData.email}.`
          );
          toast?.success(`Usuario ${codAsignado} creado. Contraseña enviada a ${formData.email}.`);
          setIsModalOpen(false);
          fetchUsers();
        }
      }
    } catch (error) {
      setModalError(error.response?.data?.message || 'Error al procesar la solicitud.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const openResetPasswordModal = (u) => {
    setResetTargetUser(u);
    setResetMotivo('');
    setResetError('');
    setResetSuccess(false);
    setResetModalOpen(true);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSubmitting(true);
    try {
      const payload = {
        motivo: resetMotivo ? resetMotivo.trim() : undefined,
      };
      const response = await api.post(
        `/usuarios/${resetTargetUser.id_persona || resetTargetUser.id}/reset-password`,
        payload
      );
      if (response.data?.success) {
        setResetSuccess(true);
        setSuccessMessage(`Contraseña del usuario "${resetTargetUser.codigo_corporativo}" reiniciada exitosamente. Se ha enviado al correo institucional.`);
        toast?.success(`Contraseña de ${resetTargetUser.codigo_corporativo} reiniciada y enviada a ${resetTargetUser.email}.`);
        fetchUsers(false);
      }
    } catch (error) {
      setResetError(error.response?.data?.message || 'Error al reiniciar contraseña.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const openChangeStatusModal = (u, targetEstado) => {
    setStatusTargetUser(u);
    setStatusNewValue(targetEstado);
    setStatusMotivo('');
    setStatusError('');
    setStatusModalOpen(true);
  };

  const handleChangeStatusSubmit = async (e) => {
    e.preventDefault();
    if (statusNewValue === 'INACTIVO' && (!statusMotivo || !statusMotivo.trim())) {
      setStatusError('El motivo es obligatorio al cambiar el estado a INACTIVO.');
      return;
    }
    setStatusError('');
    setStatusSubmitting(true);
    try {
      const response = await api.patch(
        `/usuarios/${statusTargetUser.id_persona || statusTargetUser.id}/estado`,
        {
          estado: statusNewValue,
          motivo: statusMotivo.trim(),
        }
      );
      if (response.data?.success) {
        setSuccessMessage(
          `Estado del usuario "${statusTargetUser.nombre_completo || statusTargetUser.codigo_corporativo}" actualizado a ${statusNewValue}.`
        );
        setStatusModalOpen(false);
        fetchUsers();
      }
    } catch (error) {
      setStatusError(error.response?.data?.message || 'Error al actualizar el estado del usuario.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const canManageUsers = user?.rol === 'ADMINISTRADOR';

  return (
    <div className="space-y-6">
      {/* Encabezado y Botón Crear */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-7 h-7 text-blue-600" />
            <span>Gestión de Usuarios</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Administración institucional por Código de Usuario
          </p>
        </div>
        {canManageUsers && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          </div>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-4 justify-between items-stretch xl:items-center">
        {/* Buscador exclusivo por usuario */}
        <form onSubmit={handleSearchSubmit} className="w-full xl:w-72 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuario..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        </form>

        {/* Área de Filtros: Rol y Estado */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">
          {/* Filtro por Tipo de Usuario / Rol */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Rol:</span>
            <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterRol('')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterRol === '' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilterRol('ASOCIADO')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterRol === 'ASOCIADO' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Asociados
              </button>
              <button
                type="button"
                onClick={() => setFilterRol('EJECUTIVO')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterRol === 'EJECUTIVO' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ejecutivos
              </button>
              <button
                type="button"
                onClick={() => setFilterRol('OPERADOR')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterRol === 'OPERADOR' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Operadores
              </button>
            </div>
          </div>

          {/* Filtro por Estado */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Estado:</span>
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterEstado('')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterEstado === '' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilterEstado('ACTIVO')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterEstado === 'ACTIVO' ? 'bg-brand-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Activos
              </button>
              <button
                type="button"
                onClick={() => setFilterEstado('INACTIVO')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterEstado === 'INACTIVO' ? 'bg-warning-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inactivos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios 3FN con Código Corporativo e id_persona */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="pl-4 pr-2 py-3 font-semibold text-blue-800 whitespace-nowrap">Usuario</th>
                <th className="px-3 py-3 font-semibold whitespace-nowrap">DPI / CUI</th>
                <th className="px-3 py-3 font-semibold">Nombre Completo / Correo</th>
                <th className="px-2.5 py-3 font-semibold whitespace-nowrap">Teléfono</th>
                <th className="px-2.5 py-3 font-semibold whitespace-nowrap">Rol</th>
                <th className="px-2.5 py-3 font-semibold whitespace-nowrap">Estado</th>
                <th className="px-2.5 py-3 font-semibold whitespace-nowrap">Presencia</th>
                <th className="px-2.5 py-3 font-semibold whitespace-nowrap">Fecha Registro</th>
                {canManageUsers && (
                  <th className="pl-2 pr-4 py-3 font-semibold text-right whitespace-nowrap">Acciones</th>
                )}
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton rows={6} columns={canManageUsers ? 9 : 8} />
            ) : users.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={canManageUsers ? 9 : 8} className="py-16 text-center text-slate-500">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-semibold text-base">No se encontraron usuarios</p>
                    <p className="text-xs text-slate-400 mt-1">Ajusta los filtros de búsqueda</p>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id_persona || u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="pl-4 pr-2 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-mono font-extrabold text-xs border border-blue-200 shadow-xs">
                        {u.codigo_corporativo}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600 text-xs whitespace-nowrap">
                      {u.cui_dpi || '-'}
                    </td>
                    <td className="px-3 py-3 max-w-[190px] xl:max-w-[240px]">
                      <div className="font-semibold text-slate-900 truncate" title={u.nombre_completo || u.nombre}>
                        {u.nombre_completo || u.nombre}
                      </div>
                      <div className="text-slate-400 text-xs font-mono truncate" title={u.email}>
                        {u.email}
                      </div>
                    </td>
                    <td className="px-2.5 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {u.telefono || '-'}
                    </td>
                    <td className="px-2.5 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          u.rol === 'ADMINISTRADOR'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : u.rol === 'EJECUTIVO'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : u.rol === 'OPERADOR'
                            ? 'bg-brand-100 text-brand-800 border border-brand-200'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {u.rol}
                      </span>
                    </td>
                    {/* Columna Estado (Intacta con borrado lógico ACTIVO / INACTIVO) */}
                    <td className="px-2.5 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          u.estado === 'ACTIVO'
                            ? 'bg-brand-50 text-brand-700 border border-brand-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.estado === 'ACTIVO' ? 'bg-brand-500' : 'bg-slate-400'
                          }`}
                        />
                        <span>{u.estado}</span>
                      </span>
                    </td>
                    {/* Columna Presencia y Control de Bloqueo por Fuerza Bruta */}
                    <td className="px-2.5 py-3 whitespace-nowrap">
                      {u.bloqueado_por_intentos ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-warning-100 text-warning-800 border border-warning-300 shadow-2xs">
                            <AlertTriangle className="w-3 h-3 mr-1 text-warning-600" />
                            Bloqueado
                          </span>
                          {canManageUsers && (
                            <button
                              type="button"
                              onClick={() => handleDesbloquear(u.id_persona || u.id)}
                              title="Desbloquear cuenta de usuario con un solo clic"
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold text-warning-900 bg-warning-200/80 hover:bg-warning-300 border border-warning-400/60 rounded-md transition-colors cursor-pointer"
                            >
                              <Unlock className="w-3 h-3 mr-1" />
                              Desbloquear
                            </button>
                          )}
                        </div>
                      ) : u.en_linea ? (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                          <span>En línea</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          <span>Desconectado</span>
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(u.fecha_creacion).toLocaleDateString('es-GT', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    {canManageUsers && (
                      <td className="pl-2 pr-4 py-3 text-right space-x-1 whitespace-nowrap">
                        {/* Botón de Reiniciar Contraseña */}
                        <button
                          onClick={() => openResetPasswordModal(u)}
                          title="Reiniciar Contraseña y generar clave temporal"
                          className="p-1.5 text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg transition-colors cursor-pointer"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {/* Botón de Editar */}
                        <button
                          onClick={() => openEditModal(u)}
                          title="Editar datos del usuario"
                          className="p-1.5 text-slate-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Botón de Cambiar Estado a INACTIVO / ACTIVO con ventana de motivo */}
                        <button
                          onClick={() => openChangeStatusModal(u, u.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO')}
                          title={u.estado === 'ACTIVO' ? 'Cambiar a INACTIVO (Requiere motivo)' : 'Reactivar usuario a ACTIVO'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            u.estado === 'ACTIVO'
                              ? 'text-warning-600 hover:text-white hover:bg-warning-600'
                              : 'text-brand-600 hover:text-white hover:bg-brand-600'
                          }`}
                        >
                          {u.estado === 'ACTIVO' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Modal de Crear / Editar Usuario con Código Corporativo e id_persona */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
          <div
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 relative my-auto max-h-[90vh] flex flex-col animate-scaleUp overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-modal-title"
          >
            {/* Cabecera Fija */}
            <div className="flex justify-between items-center px-6 py-4 sm:px-7 sm:py-5 border-b border-slate-100 flex-shrink-0 bg-white">
              <div>
                <h2 id="user-form-modal-title" className="text-xl font-bold text-slate-900">
                  {isEditing ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Identificador de Negocio: Usuario según perfil (EJ-X, OP-X).
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo Desplazable */}
            <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-4">
              {modalError && (
                <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form id="user-edit-form" onSubmit={handleFormSubmit} className="space-y-4">
              {/* Sección 1: Identificación y Credenciales */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-bold uppercase text-blue-800 tracking-wider block">
                  1. Credenciales y Código de Usuario
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Usuario / Código
                      </label>
                      {!isEditing && (
                        <span className="text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
                          Asignación Automática
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-brand-600 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={isEditing ? formData.codigo_corporativo : (loadingCode ? 'Consultando...' : (previewCode || 'Autogenerado según rol'))}
                        disabled
                        readOnly
                        className="w-full pl-9 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-700 cursor-not-allowed select-none focus:outline-none"
                      />
                    </div>
                    {!isEditing && (
                      <p className="text-xs text-slate-500 mt-1">
                        Correlativo asignado según perfil ({formData.rol === 'EJECUTIVO' ? 'EJ' : 'OP'}).
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="usuario@cooperativa.com"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Rol Asignado *</label>
                    <select
                      value={formData.rol}
                      onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
                    >
                      <option value="EJECUTIVO">EJECUTIVO (EJ-X)</option>
                      <option value="OPERADOR">OPERADOR (OP-X)</option>
                      {isEditing && formData.rol === 'ASOCIADO' && (
                        <option value="ASOCIADO" disabled>ASOCIADO (Gestionado por Operador)</option>
                      )}
                      {isEditing && formData.rol === 'ADMINISTRADOR' && user?.rol === 'ADMINISTRADOR' && (
                        <option value="ADMINISTRADOR">ADMINISTRADOR (AD-X)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estado de Cuenta *</label>
                    <select
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                </div>

                {formData.rol === 'ASOCIADO' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Asociado *</label>
                    <select
                      value={formData.tipo_asociado || 'EX'}
                      onChange={(e) => setFormData({ ...formData, tipo_asociado: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
                    >
                      <option value="EX">Ajeno / Externo (EX-X)</option>
                      <option value="EB">Empleado Bancario (EB-X)</option>
                    </select>
                  </div>
                )}

                {!isEditing ? (
                  <div className="p-3.5 bg-brand-50/70 border border-brand-200 rounded-xl flex items-start space-x-3 text-xs text-brand-950">
                    <ShieldCheck className="w-5 h-5 text-brand-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-brand-900 block">Generación Criptográfica de Contraseña</span>
                      <span className="text-slate-600 mt-0.5 block leading-relaxed">
                        Por políticas de ciberseguridad bancaria, la contraseña temporal no se asigna manualmente. Se generará de forma aleatoria por el servidor y se enviará automáticamente al correo electrónico registrado.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nueva Contraseña <span className="text-slate-400 font-normal">(Dejar en blanco para conservar actual)</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Sin cambios"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección 2: Datos Personales */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-bold uppercase text-brand-800 tracking-wider block">
                  2. Datos Personales (Persona)
                </span>

                {/* DPI / CUI */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">DPI / CUI *</label>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        formData.cui_dpi?.length === 13 ? 'text-brand-600' : 'text-slate-400'
                      }`}
                    >
                      {formData.cui_dpi?.length || 0}/13 dígitos
                    </span>
                  </div>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={13}
                      value={formData.cui_dpi}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                        setFormData({ ...formData, cui_dpi: val });
                      }}
                      placeholder="Ej. 2999123450101 (13 dígitos)"
                      required
                      className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 ${
                        formData.cui_dpi?.length === 13
                          ? 'border-brand-300 focus:ring-brand-500'
                          : 'border-slate-200 focus:ring-brand-500'
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Documento Personal de Identificación sin espacios ni guiones.
                  </p>
                </div>

                {/* Nombres */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primer Nombre *</label>
                    <input
                      type="text"
                      value={formData.primer_nombre}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                        setFormData({ ...formData, primer_nombre: val });
                      }}
                      placeholder="Ej. Carlos"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Segundo Nombre</label>
                    <input
                      type="text"
                      value={formData.segundo_nombre}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                        setFormData({ ...formData, segundo_nombre: val });
                      }}
                      placeholder="Ej. Roberto"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Apellidos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primer Apellido *</label>
                    <input
                      type="text"
                      value={formData.primer_apellido}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                        setFormData({ ...formData, primer_apellido: val });
                      }}
                      placeholder="Ej. López"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Segundo Apellido</label>
                    <input
                      type="text"
                      value={formData.segundo_apellido}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
                        setFormData({ ...formData, segundo_apellido: val });
                      }}
                      placeholder="Ej. Gómez"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Teléfono y Fecha de Nacimiento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Teléfono *</label>
                      <span
                        className={`text-xs font-mono font-semibold ${
                          formData.telefono?.length === 8 ? 'text-brand-600' : 'text-slate-400'
                        }`}
                      >
                        {formData.telefono?.length || 0}/8 dígitos
                      </span>
                    </div>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        value={formData.telefono}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                          setFormData({ ...formData, telefono: val });
                        }}
                        placeholder="Ej. 55551234"
                        required
                        className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 ${
                          formData.telefono?.length === 8
                            ? 'border-brand-300 focus:ring-brand-500'
                            : 'border-slate-200 focus:ring-brand-500'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      8 dígitos sin guiones ni espacios.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Fecha / Año de Nacimiento *
                      </label>
                      {ageInfo && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            ageInfo.valid
                              ? 'bg-brand-50 text-brand-700 border border-brand-200'
                              : 'bg-danger-50 text-danger-700 border border-danger-200'
                          }`}
                        >
                          {ageInfo.valid ? `✓ ${ageInfo.age} años` : 'Menor de edad'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="date"
                        value={formData.fecha_nacimiento}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                        required
                        className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                          ageInfo
                            ? ageInfo.valid
                              ? 'border-brand-300 focus:ring-brand-500'
                              : 'border-danger-300 focus:ring-danger-500 bg-danger-50/20'
                            : 'border-slate-200 focus:ring-brand-500'
                        }`}
                      />
                    </div>
                    <div className="mt-1">
                      {ageInfo ? (
                        <p
                          className={`text-xs ${
                            ageInfo.valid ? 'text-brand-700 font-medium' : 'text-danger-600 font-medium'
                          }`}
                        >
                          {ageInfo.message}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Mayoría de edad requerida (18+ años).
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección Domiciliar</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={formData.direccion}
                      onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                      placeholder="Ej. 5ta Avenida 12-34, Zona 1, Ciudad de Guatemala"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              </form>
            </div>

            {/* Pie Fijo con Botones de Acción */}
            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/90 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                form="user-edit-form"
                type="submit"
                disabled={modalSubmitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {modalSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isEditing ? 'Actualizar Usuario' : 'Guardar Usuario'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal / Ventana de Cambio de Estado (INACTIVO / ACTIVO con Motivo Obligatorio) */}
      {statusModalOpen && statusTargetUser && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative animate-scaleUp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-change-modal-title"
          >
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    statusNewValue === 'INACTIVO'
                      ? 'bg-warning-100 text-warning-700'
                      : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  {statusNewValue === 'INACTIVO' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 id="status-change-modal-title" className="text-lg font-bold text-slate-900">
                    {statusNewValue === 'INACTIVO' ? 'Desactivar Cuenta' : 'Reactivar Cuenta'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cambio institucional de estado de usuario
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ficha del usuario afectado */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Nombre:</span>
                <span className="text-slate-800 font-bold">
                  {statusTargetUser.nombre_completo || statusTargetUser.nombre}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Usuario:</span>
                <span className="font-mono font-bold text-brand-700">
                  {statusTargetUser.codigo_corporativo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Rol:</span>
                <span className="text-slate-700 font-semibold">
                  {statusTargetUser.rol_nombre || statusTargetUser.rol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Estado actual:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    statusTargetUser.estado === 'ACTIVO'
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {statusTargetUser.estado}
                </span>
              </div>
            </div>

            {statusError && (
              <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{statusError}</span>
              </div>
            )}

            <form onSubmit={handleChangeStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {statusNewValue === 'INACTIVO' ? (
                    <span>
                      Motivo del cambio a <strong className="text-warning-700">INACTIVO</strong>{' '}
                      <span className="text-danger-500">* (Obligatorio)</span>
                    </span>
                  ) : (
                    <span>Motivo de la reactivación</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  value={statusMotivo}
                  onChange={(e) => setStatusMotivo(e.target.value)}
                  placeholder={
                    statusNewValue === 'INACTIVO'
                      ? 'Indica detalladamente por qué se cambia el estado a inactivo...'
                      : 'Indica la justificación de reactivación (opcional)...'
                  }
                  required={statusNewValue === 'INACTIVO'}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-warning-500 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Este motivo quedará inmutablemente registrado en la auditoría del sistema.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className={`px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer ${
                    statusNewValue === 'INACTIVO'
                      ? 'bg-warning-600 hover:bg-warning-500'
                      : 'bg-brand-600 hover:bg-brand-500'
                  }`}
                >
                  {statusSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {statusNewValue === 'INACTIVO'
                      ? 'Confirmar Desactivación'
                      : 'Confirmar Reactivación'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Reinicio de Contraseña */}
      {resetModalOpen && resetTargetUser && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative animate-scaleUp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-reset-modal-title"
          >
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="password-reset-modal-title" className="text-lg font-bold text-slate-900">
                    Reiniciar Contraseña
                  </h2>
                  <p className="text-xs text-slate-500">
                    Credenciales institucionales
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ficha del usuario */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Nombre:</span>
                <span className="text-slate-800 font-bold">
                  {resetTargetUser.nombre_completo || resetTargetUser.nombre}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Usuario:</span>
                <span className="font-mono font-bold text-brand-700">
                  {resetTargetUser.codigo_corporativo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Correo Electrónico:</span>
                <span className="text-slate-700">{resetTargetUser.email}</span>
              </div>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess ? (
              <div className="space-y-4">
                <div className="p-5 bg-brand-50 border border-brand-200 rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-brand-100 text-brand-600 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-brand-900">
                    ¡Contraseña Reiniciada Exitosamente!
                  </h4>
                  <div className="p-3.5 bg-white border border-brand-200 rounded-xl text-left space-y-2 text-xs text-slate-700">
                    <p className="flex items-center text-slate-800">
                      <Mail className="w-4 h-4 text-brand-600 mr-2 flex-shrink-0" />
                      <span>
                        Correo de destino: <strong>{resetTargetUser.email}</strong>
                      </span>
                    </p>
                    <p className="text-slate-600">
                      Por estrictos protocolos de confidencialidad institucional, la contraseña temporal generada <strong>no es visible para el administrador</strong>. Ha sido despachada automáticamente al correo del usuario.
                    </p>
                    <p className="text-slate-600">
                      El usuario deberá iniciar sesión con dicha credencial y el sistema le solicitará cambiarla obligatoriamente en su primer acceso.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Entendido / Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl space-y-2 text-xs text-brand-900">
                  <div className="flex items-center font-bold text-brand-950">
                    <ShieldAlert className="w-4 h-4 text-brand-700 mr-1.5 flex-shrink-0" />
                    <span>Envío Confidencial de Credencial Temporal</span>
                  </div>
                  <p>
                    Al confirmar, el sistema generará una <strong>contraseña temporal aleatoria y segura</strong> de 12 caracteres y la despachará de forma confidencial al correo registrado del usuario:
                  </p>
                  <div className="font-semibold text-slate-800 bg-white/80 p-2 rounded-lg border border-brand-200 flex items-center">
                    <Mail className="w-3.5 h-3.5 text-brand-600 mr-1.5 flex-shrink-0" />
                    <span>{resetTargetUser.email}</span>
                  </div>
                  <ul className="text-xs text-brand-800 space-y-0.5 mt-1 list-disc pl-4">
                    <li>La contraseña <strong>no se mostrará en pantalla</strong> para proteger la privacidad del usuario.</li>
                    <li>La cuenta requerirá obligatoriamente el <strong>cambio de contraseña</strong> al primer inicio de sesión.</li>
                    <li>Se restablecerán los intentos fallidos a 0 y se revocarán sesiones activas.</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Motivo / Observación Administrativa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={resetMotivo}
                    onChange={(e) => setResetMotivo(e.target.value)}
                    placeholder="Ej. Solicitud voluntaria del usuario / Olvido de clave"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="px-4 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {resetSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generando y Enviando...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Confirmar Reinicio y Enviar Correo</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Configuración y Prueba de Google Mail */}
      <GoogleEmailConfigModal
        isOpen={emailConfigModalOpen}
        onClose={() => setEmailConfigModalOpen(false)}
      />
    </div>
  );
};

export default UsersPage;
