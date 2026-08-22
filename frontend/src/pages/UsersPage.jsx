import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
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
} from 'lucide-react';

export const UsersPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estados del Modal (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserPersonaId, setEditingUserPersonaId] = useState(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Formulario con campos 3FN + Código Corporativo
  const [formData, setFormData] = useState({
    codigo_corporativo: '',
    cui_dpi: '',
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    telefono: '',
    direccion: '',
    email: '',
    password: '',
    rol: 'ASOCIADO',
    estado: 'ACTIVO',
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterEstado) params.estado = filterEstado;
      if (searchTerm) params.search = searchTerm;

      const response = await api.get('/usuarios', { params });
      if (response.data?.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      setErrorMessage(error.response?.data?.message || 'No se pudieron cargar los usuarios del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [filterEstado]);

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
      telefono: '',
      direccion: '',
      email: '',
      password: '',
      rol: 'ASOCIADO',
      estado: 'ACTIVO',
    });
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
        if (!formData.password) {
          setModalError('La contraseña es obligatoria para nuevos usuarios.');
          setModalSubmitting(false);
          return;
        }

        const response = await api.post('/usuarios', formData);
        if (response.data?.success) {
          setSuccessMessage('Usuario creado exitosamente con código corporativo.');
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

  const handleDeleteLogical = async (idPersona, nombreCompleto) => {
    if (!window.confirm(`¿Deseas aplicar borrado lógico al usuario "${nombreCompleto}"? Su estado cambiará a INACTIVO.`)) {
      return;
    }

    try {
      const response = await api.delete(`/usuarios/${idPersona}`);
      if (response.data?.success) {
        setSuccessMessage(`Usuario "${nombreCompleto}" desactivado exitosamente (borrado lógico auditado).`);
        fetchUsers();
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Error al desactivar el usuario.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y Botón Crear */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-7 h-7 text-emerald-600" />
            <span>Gestión de Usuarios</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Administración institucional con Código Corporativo y clave estandarizada id_persona.
          </p>
        </div>
        {user?.rol === 'ADMINISTRADOR' && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        )}
      </div>

      {/* Alertas */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <form onSubmit={handleSearchSubmit} className="w-full md:w-96 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Código Corporativo (ej. 1001), DPI, nombre..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        </form>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase">Estado:</span>
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setFilterEstado('')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterEstado === '' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterEstado('ACTIVO')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterEstado === 'ACTIVO' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setFilterEstado('INACTIVO')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterEstado === 'INACTIVO' ? 'bg-amber-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactivos
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios 3FN con Código Corporativo e id_persona */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
            <p className="text-sm">Cargando usuarios...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-base">No se encontraron usuarios</p>
            <p className="text-xs text-slate-400 mt-1">Ajusta los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold text-emerald-800">Cód. Corporativo</th>
                  <th className="px-6 py-3 font-semibold">DPI / CUI</th>
                  <th className="px-6 py-3 font-semibold">Nombre Completo / Correo</th>
                  <th className="px-6 py-3 font-semibold">Teléfono</th>
                  <th className="px-6 py-3 font-semibold">Rol</th>
                  <th className="px-6 py-3 font-semibold">Estado</th>
                  <th className="px-6 py-3 font-semibold">Fecha Registro</th>
                  {user?.rol === 'ADMINISTRADOR' && (
                    <th className="px-6 py-3 font-semibold text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id_persona || u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-mono font-extrabold text-xs border border-emerald-200 shadow-xs">
                        {u.codigo_corporativo}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600 text-xs">
                      {u.cui_dpi || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{u.nombre_completo || u.nombre}</div>
                      <div className="text-slate-400 text-xs font-mono">{u.email}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {u.telefono || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          u.rol === 'ADMINISTRADOR'
                            ? 'bg-emerald-100 text-emerald-800'
                            : u.rol === 'OPERADOR'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.estado === 'ACTIVO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.estado === 'ACTIVO' ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span>{u.estado}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(u.fecha_creacion).toLocaleDateString('es-GT', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    {user?.rol === 'ADMINISTRADOR' && (
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(u)}
                          title="Editar Usuario"
                          className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.estado === 'ACTIVO' && (
                          <button
                            onClick={() => handleDeleteLogical(u.id_persona || u.id, u.nombre_completo || u.nombre)}
                            title="Desactivar (Borrado Lógico)"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Crear / Editar Usuario con Código Corporativo e id_persona */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8 animate-scaleUp">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {isEditing ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Identificador de Negocio: Código Corporativo de 4 dígitos (1000s, 2000s, 3000s).
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Sección 1: Identificación y Credenciales */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-bold uppercase text-emerald-800 tracking-wider block">
                  1. Credenciales y Código Corporativo
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Código Corporativo (4 dígitos)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-emerald-600 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={formData.codigo_corporativo}
                        onChange={(e) => setFormData({ ...formData, codigo_corporativo: e.target.value })}
                        placeholder={isEditing ? 'Ej. 1001' : 'Autogenerado según rol si está vacío'}
                        maxLength={4}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
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
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    >
                      <option value="ADMINISTRADOR">ADMINISTRADOR (1000s)</option>
                      <option value="OPERADOR">OPERADOR (2000s)</option>
                      <option value="ASOCIADO">ASOCIADO (3000s)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estado de Cuenta *</label>
                    <select
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contraseña {isEditing && <span className="text-slate-400 font-normal">(Dejar en blanco para conservar)</span>}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={isEditing ? 'Sin cambios' : '••••••••'}
                      required={!isEditing}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Datos Personales */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <span className="text-xs font-bold uppercase text-emerald-800 tracking-wider block">
                  2. Datos Personales (Persona)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">DPI / CUI *</label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={formData.cui_dpi}
                        onChange={(e) => setFormData({ ...formData, cui_dpi: e.target.value })}
                        placeholder="Ej. 2999123450101"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        placeholder="Ej. 5555-1234"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primer Nombre *</label>
                    <input
                      type="text"
                      value={formData.primer_nombre}
                      onChange={(e) => setFormData({ ...formData, primer_nombre: e.target.value })}
                      placeholder="Ej. Carlos"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Segundo Nombre</label>
                    <input
                      type="text"
                      value={formData.segundo_nombre}
                      onChange={(e) => setFormData({ ...formData, segundo_nombre: e.target.value })}
                      placeholder="Ej. Roberto"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primer Apellido *</label>
                    <input
                      type="text"
                      value={formData.primer_apellido}
                      onChange={(e) => setFormData({ ...formData, primer_apellido: e.target.value })}
                      placeholder="Ej. López"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Segundo Apellido</label>
                    <input
                      type="text"
                      value={formData.segundo_apellido}
                      onChange={(e) => setFormData({ ...formData, segundo_apellido: e.target.value })}
                      placeholder="Ej. Gómez"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección Domiciliar</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={formData.direccion}
                      onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                      placeholder="Ej. 5ta Avenida 12-34, Zona 1, Ciudad de Guatemala"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  {modalSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isEditing ? 'Actualizar Usuario' : 'Guardar Usuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
