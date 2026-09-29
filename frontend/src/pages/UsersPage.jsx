import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socket';
import { Ban, Mail, Pencil, KeyRound, Unlock, UserCheck, UserPlus, Users } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import GoogleEmailConfigModal from '../components/admin/GoogleEmailConfigModal';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  PasswordInput,
  SearchInput,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  cn,
} from '../components/ui';
import { ROLE_LABELS } from '../components/layout/navigation';
import { formatDate, humanize } from '../utils/format';

const ROLE_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'ASOCIADO', label: 'Asociados' },
  { value: 'EJECUTIVO', label: 'Ejecutivos' },
  { value: 'OPERADOR', label: 'Operadores' },
];

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVO', label: 'Activos' },
  { value: 'INACTIVO', label: 'Inactivos' },
];

const roleLabel = (rol) => ROLE_LABELS[rol] || humanize(rol);
const estadoLabel = (estado) => (estado === 'ACTIVO' ? 'Activo' : estado === 'INACTIVO' ? 'Inactivo' : humanize(estado));

/** Solo letras (con tildes y ñ) y espacios en nombres y apellidos. */
const onlyLetters = (value) => value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');

/** Grupo de botones de filtro (uno activo a la vez). */
const FilterGroup = ({ label, options, value, onChange }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="text-sm text-ink-muted">{label}</span>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filtrar por ${label.toLowerCase()}`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || 'todos'}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
              active
                ? 'border-brand-700 bg-brand-50 font-medium text-brand-800'
                : 'border-line-strong bg-white text-ink-soft hover:bg-surface-muted'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  </div>
);

/** Ficha breve del usuario sobre el que se actúa en un modal. */
const UserSummary = ({ u, extra }) => (
  <dl className="divide-y divide-line rounded-md border border-line text-sm">
    <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
      <dt className="text-ink-muted">Nombre</dt>
      <dd className="text-ink">{u.nombre_completo || u.nombre}</dd>
    </div>
    <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
      <dt className="text-ink-muted">Usuario</dt>
      <dd className="font-mono text-ink">{u.codigo_corporativo}</dd>
    </div>
    {extra}
  </dl>
);

/** Botón de ícono de la columna de acciones: el texto va en `title` y `aria-label`. */
const RowAction = ({ icon: Icon, label, onClick, className }) => (
  <Button size="icon" variant="ghost" onClick={onClick} title={label} aria-label={label} className={className}>
    <Icon className="w-4 h-4" aria-hidden="true" />
  </Button>
);

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

  const hasFilters = Boolean(searchTerm || filterRol || filterEstado);
  const desactivando = statusNewValue === 'INACTIVO';

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Cuentas de acceso de asociados, operadores, ejecutivos y administradores."
        actions={
          canManageUsers && (
            <Button icon={UserPlus} onClick={openCreateModal}>
              Nuevo usuario
            </Button>
          )
        }
      />

      <Card>
        <div className="space-y-4 border-b border-line px-5 py-4">
          <form onSubmit={handleSearchSubmit} role="search" className="w-full sm:max-w-xs">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              label="Buscar por código de usuario"
              placeholder="Código de usuario, p. ej. OP-3"
              className="[&_input]:font-mono"
            />
          </form>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <FilterGroup label="Rol" options={ROLE_FILTERS} value={filterRol} onChange={setFilterRol} />
            <FilterGroup label="Estado" options={STATUS_FILTERS} value={filterEstado} onChange={setFilterEstado} />
          </div>
        </div>

        {loading ? (
          <LoadingState label="Cargando usuarios…" />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? 'Sin resultados' : 'Aún no hay usuarios'}
            description={hasFilters ? 'Revise el código de usuario o cambie los filtros.' : undefined}
          />
        ) : (
          <Table bordered={false} caption="Usuarios del sistema">
            <THead>
              <TR>
                <TH>Usuario</TH>
                <TH>Código</TH>
                <TH>DPI y teléfono</TH>
                <TH>Rol</TH>
                <TH>Estado</TH>
                <TH>Conexión</TH>
                <TH>Registro</TH>
                {canManageUsers && <TH sticky><span className="sr-only">Acciones</span></TH>}
              </TR>
            </THead>
            <TBody>
              {users.map((u) => {
                const nombre = u.nombre_completo || u.nombre;
                const activo = u.estado === 'ACTIVO';
                return (
                  <TR key={u.id_persona || u.id} interactive>
                    <TD className="min-w-[13rem] max-w-[16rem]">
                      <div className="truncate font-medium text-ink" title={nombre}>{nombre}</div>
                      <div className="truncate text-xs text-ink-subtle" title={u.email}>{u.email}</div>
                    </TD>
                    <TD className="whitespace-nowrap font-mono text-ink">{u.codigo_corporativo}</TD>
                    <TD className="whitespace-nowrap">
                      <div className="font-mono text-ink">{u.cui_dpi || '—'}</div>
                      <div className="text-xs text-ink-subtle tabular-nums">{u.telefono || 'Sin teléfono'}</div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Badge tone={u.rol === 'ADMINISTRADOR' ? 'brand' : 'neutral'}>{roleLabel(u.rol)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Badge tone={activo ? 'success' : 'neutral'}>{estadoLabel(u.estado)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {u.bloqueado_por_intentos ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone="warning" title="Bloqueado por intentos fallidos de inicio de sesión">Bloqueado</Badge>
                          {canManageUsers && (
                            <button
                              type="button"
                              onClick={() => handleDesbloquear(u.id_persona || u.id)}
                              aria-label={`Desbloquear a ${u.codigo_corporativo}`}
                              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                            >
                              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                              Desbloquear
                            </button>
                          )}
                        </div>
                      ) : u.en_linea ? (
                        <Badge tone="success" dot>En línea</Badge>
                      ) : (
                        <span className="text-sm text-ink-subtle">Desconectado</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{formatDate(u.fecha_creacion)}</TD>
                    {canManageUsers && (
                      <TD sticky className="whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <RowAction
                            icon={KeyRound}
                            label={`Reiniciar la contraseña de ${u.codigo_corporativo}`}
                            onClick={() => openResetPasswordModal(u)}
                          />
                          <RowAction
                            icon={Pencil}
                            label={`Editar a ${u.codigo_corporativo}`}
                            onClick={() => openEditModal(u)}
                          />
                          <RowAction
                            icon={activo ? Ban : UserCheck}
                            label={activo ? `Desactivar a ${u.codigo_corporativo}` : `Reactivar a ${u.codigo_corporativo}`}
                            onClick={() => openChangeStatusModal(u, activo ? 'INACTIVO' : 'ACTIVO')}
                            className={activo ? 'text-danger-700 hover:bg-danger-50' : 'text-success-700 hover:bg-success-50'}
                          />
                        </div>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Crear / editar usuario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dismissible={!modalSubmitting}
        closeOnOverlay={false}
        lockScroll={false}
        size="lg"
        title={isEditing ? 'Editar usuario' : 'Nuevo usuario'}
        description={
          isEditing
            ? <>Usuario <span className="font-mono">{formData.codigo_corporativo}</span></>
            : 'Para operadores y ejecutivos. Los asociados se registran desde Asociados.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={modalSubmitting}>
              Cancelar
            </Button>
            <Button form="user-edit-form" type="submit" loading={modalSubmitting} loadingText="Guardando…">
              {isEditing ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </>
        }
      >
        <form id="user-edit-form" onSubmit={handleFormSubmit} className="space-y-6">
          {modalError && <Alert tone="danger">{modalError}</Alert>}

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-ink">Acceso</legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Código de usuario"
                hint={!isEditing ? `Se asigna solo, según el rol (${formData.rol === 'EJECUTIVO' ? 'EJ' : 'OP'}-…).` : undefined}
              >
                <Input
                  type="text"
                  value={isEditing ? formData.codigo_corporativo : (loadingCode ? 'Consultando…' : (previewCode || 'Se asigna al elegir el rol'))}
                  readOnly
                  className="font-mono"
                />
              </Field>
              <Field label="Correo electrónico" required>
                <Input
                  type="email"
                  autoComplete="off"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </Field>
              <Field label="Rol" required>
                <Select value={formData.rol} onChange={(e) => setFormData({ ...formData, rol: e.target.value })}>
                  <option value="EJECUTIVO">Ejecutivo (EJ-…)</option>
                  <option value="OPERADOR">Operador (OP-…)</option>
                  {isEditing && formData.rol === 'ASOCIADO' && (
                    <option value="ASOCIADO" disabled>Asociado (lo gestiona el operador)</option>
                  )}
                  {isEditing && formData.rol === 'ADMINISTRADOR' && user?.rol === 'ADMINISTRADOR' && (
                    <option value="ADMINISTRADOR">Administrador (AD-…)</option>
                  )}
                </Select>
              </Field>
              <Field label="Estado" required>
                <Select value={formData.estado} onChange={(e) => setFormData({ ...formData, estado: e.target.value })}>
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </Select>
              </Field>

              {formData.rol === 'ASOCIADO' && (
                <Field label="Tipo de asociado" required>
                  <Select
                    value={formData.tipo_asociado || 'EX'}
                    onChange={(e) => setFormData({ ...formData, tipo_asociado: e.target.value })}
                  >
                    <option value="EX">Externo (EX-…)</option>
                    <option value="EB">Empleado del banco (EB-…)</option>
                  </Select>
                </Field>
              )}
            </div>

            {!isEditing ? (
              <Alert tone="info">
                El sistema genera una contraseña temporal y la envía al correo. La persona deberá cambiarla al entrar
                por primera vez. Nadie más la ve.
              </Alert>
            ) : (
              <Field label="Contraseña nueva" hint="Déjela vacía para no cambiarla. Al menos 6 caracteres, con letras y números.">
                <PasswordInput
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="sm:max-w-sm"
                />
              </Field>
            )}
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-5">
            <legend className="sr-only">Datos personales</legend>
            <p className="!mt-0 text-sm font-semibold text-ink" aria-hidden="true">Datos personales</p>

            <Field label="DPI" hint={`13 dígitos · ${formData.cui_dpi?.length || 0}/13`} required>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={13}
                value={formData.cui_dpi}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                  setFormData({ ...formData, cui_dpi: val });
                }}
                required
                className="font-mono sm:max-w-xs"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Primer nombre" required>
                <Input
                  type="text"
                  value={formData.primer_nombre}
                  onChange={(e) => setFormData({ ...formData, primer_nombre: onlyLetters(e.target.value) })}
                  required
                />
              </Field>
              <Field label="Segundo nombre">
                <Input
                  type="text"
                  value={formData.segundo_nombre}
                  onChange={(e) => setFormData({ ...formData, segundo_nombre: onlyLetters(e.target.value) })}
                />
              </Field>
              <Field label="Primer apellido" required>
                <Input
                  type="text"
                  value={formData.primer_apellido}
                  onChange={(e) => setFormData({ ...formData, primer_apellido: onlyLetters(e.target.value) })}
                  required
                />
              </Field>
              <Field label="Segundo apellido">
                <Input
                  type="text"
                  value={formData.segundo_apellido}
                  onChange={(e) => setFormData({ ...formData, segundo_apellido: onlyLetters(e.target.value) })}
                />
              </Field>
              <Field label="Teléfono" hint={`8 dígitos · ${formData.telefono?.length || 0}/8`} required>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={formData.telefono}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setFormData({ ...formData, telefono: val });
                  }}
                  required
                  className="font-mono"
                />
              </Field>
              <div className="space-y-1.5">
                <Field label="Fecha de nacimiento" required>
                  <Input
                    type="date"
                    value={formData.fecha_nacimiento}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                    invalid={Boolean(ageInfo && !ageInfo.valid)}
                    required
                  />
                </Field>
                <p
                  role="status"
                  className={cn('text-xs', ageInfo ? (ageInfo.valid ? 'text-success-700' : 'text-danger-700') : 'text-ink-subtle')}
                >
                  {ageInfo ? ageInfo.message : 'Debe tener 18 años cumplidos.'}
                </p>
              </div>
            </div>

            <Field label="Dirección">
              <Input
                type="text"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              />
            </Field>
          </fieldset>
        </form>
      </Modal>

      {/* Desactivar / reactivar */}
      <Modal
        isOpen={statusModalOpen && !!statusTargetUser}
        onClose={() => setStatusModalOpen(false)}
        dismissible={!statusSubmitting}
        closeOnOverlay={false}
        lockScroll={false}
        size="sm"
        title={desactivando ? '¿Desactivar al usuario?' : '¿Reactivar al usuario?'}
        description={
          desactivando
            ? 'No podrá iniciar sesión hasta que se reactive.'
            : 'Podrá volver a iniciar sesión con su contraseña actual.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusModalOpen(false)} disabled={statusSubmitting}>
              Cancelar
            </Button>
            <Button
              form="user-status-form"
              type="submit"
              variant={desactivando ? 'danger' : 'primary'}
              loading={statusSubmitting}
              loadingText="Guardando…"
            >
              {desactivando ? 'Desactivar' : 'Reactivar'}
            </Button>
          </>
        }
      >
        {statusTargetUser && (
          <form id="user-status-form" onSubmit={handleChangeStatusSubmit} className="space-y-4">
            <UserSummary
              u={statusTargetUser}
              extra={
                <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
                  <dt className="text-ink-muted">Rol</dt>
                  <dd className="text-ink">{roleLabel(statusTargetUser.rol_nombre || statusTargetUser.rol)}</dd>
                </div>
              }
            />
            {statusError && <Alert tone="danger">{statusError}</Alert>}
            <Field
              label={desactivando ? 'Motivo' : 'Motivo de la reactivación'}
              hint={desactivando ? 'Queda registrado en la bitácora de auditoría.' : 'Opcional. Queda registrado en la bitácora de auditoría.'}
              required={desactivando}
            >
              <Textarea
                rows={3}
                value={statusMotivo}
                onChange={(e) => setStatusMotivo(e.target.value)}
                required={desactivando}
              />
            </Field>
          </form>
        )}
      </Modal>

      {/* Reinicio de contraseña: la contraseña temporal nunca se muestra en pantalla */}
      <Modal
        isOpen={resetModalOpen && !!resetTargetUser}
        onClose={() => setResetModalOpen(false)}
        dismissible={!resetSubmitting}
        lockScroll={false}
        size="sm"
        title={resetSuccess ? 'Contraseña reiniciada' : '¿Reiniciar la contraseña?'}
        footer={
          resetSuccess ? (
            <Button onClick={() => setResetModalOpen(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setResetModalOpen(false)} disabled={resetSubmitting}>
                Cancelar
              </Button>
              <Button form="user-reset-form" type="submit" loading={resetSubmitting} loadingText="Enviando…">
                Reiniciar y enviar
              </Button>
            </>
          )
        }
      >
        {resetTargetUser && (
          <div className="space-y-4">
            <UserSummary
              u={resetTargetUser}
              extra={
                <div className="flex flex-wrap justify-between gap-x-4 px-4 py-2">
                  <dt className="text-ink-muted">Correo</dt>
                  <dd className="break-all text-ink">{resetTargetUser.email}</dd>
                </div>
              }
            />

            {resetError && <Alert tone="danger">{resetError}</Alert>}

            {resetSuccess ? (
              <Alert tone="success" icon={Mail} title={`Enviamos una contraseña temporal a ${resetTargetUser.email}`}>
                No se muestra en pantalla. Al entrar, el sistema le pedirá a la persona crear una nueva.
              </Alert>
            ) : (
              <form id="user-reset-form" onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  <li>Se genera una contraseña temporal de 12 caracteres y se envía al correo del usuario.</li>
                  <li>No se muestra en pantalla, ni siquiera a usted.</li>
                  <li>Se cierran sus sesiones abiertas y se reinician sus intentos fallidos.</li>
                  <li>Al entrar, deberá crear una contraseña nueva.</li>
                </ul>
                <Field label="Motivo" hint="Opcional. Por ejemplo: la persona olvidó su contraseña.">
                  <Input type="text" value={resetMotivo} onChange={(e) => setResetMotivo(e.target.value)} />
                </Field>
              </form>
            )}
          </div>
        )}
      </Modal>

      <GoogleEmailConfigModal
        isOpen={emailConfigModalOpen}
        onClose={() => setEmailConfigModalOpen(false)}
      />
    </div>
  );
};

export default UsersPage;
