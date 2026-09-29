import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import GoogleEmailConfigModal from '../components/admin/GoogleEmailConfigModal';
import { AccountSettingsModal } from '../components/profile/AccountSettingsModal';
import { Alert, Button, PageHeader } from '../components/ui';
import { AdminKpis } from '../components/admin/dashboard/AdminKpis';
import { UsersByRoleCard } from '../components/admin/dashboard/UsersByRoleCard';
import { MonthlySignupsCard } from '../components/admin/dashboard/MonthlySignupsCard';
import { SecurityEventsCard } from '../components/admin/dashboard/SecurityEventsCard';

export const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailConfigModalOpen, setEmailConfigModalOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // Cargar lista de usuarios y últimos eventos de auditoría en paralelo
      const [usersRes, eventsRes] = await Promise.all([
        api.get('/usuarios'),
        api.get('/usuarios/auditoria/eventos-recientes').catch((err) => {
          console.warn('No se pudieron obtener eventos de auditoría:', err.message);
          return { data: { success: false, data: [] } };
        }),
      ]);

      if (usersRes.data?.success) {
        setUsers(usersRes.data.data || []);
      }
      if (eventsRes.data?.success) {
        setSecurityEvents(eventsRes.data.data || []);
      }
    } catch (error) {
      console.error('Error al cargar datos del Centro de Monitoreo:', error);
      setErrorMessage('No se pudieron cargar todas las métricas en tiempo real.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Escuchar eventos de presencia en tiempo real por WebSocket
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handlePresence = (data) => {
        if (data?.id_persona !== undefined) {
          setUsers((prevUsers) =>
            prevUsers.map((u) => {
              const uid = Number(u.id_persona || u.id);
              if (uid === Number(data.id_persona)) {
                return { ...u, en_linea: Boolean(data.en_linea) };
              }
              return u;
            })
          );
        }
      };

      socket.on('presence_update', handlePresence);
      return () => {
        socket.off('presence_update', handlePresence);
      };
    }
  }, []);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const total = users.length;
    const activos = users.filter((u) => u.estado === 'ACTIVO').length;
    const inactivos = users.filter((u) => u.estado === 'INACTIVO').length;
    const bloqueadosIntentos = users.filter((u) => u.bloqueado_por_intentos).length;
    const bloqueadosOInactivos = users.filter(
      (u) => u.estado === 'INACTIVO' || u.bloqueado_por_intentos
    ).length;
    const enLinea = users.filter((u) => u.en_linea).length;

    // Desglose por roles
    const asociadosCount = users.filter((u) => u.rol === 'ASOCIADO').length;
    const operadoresCount = users.filter((u) => u.rol === 'OPERADOR').length;
    const adminCount = users.filter((u) => u.rol === 'ADMINISTRADOR').length;

    return {
      total,
      activos,
      inactivos,
      bloqueadosIntentos,
      bloqueadosOInactivos,
      enLinea,
      asociadosCount,
      operadoresCount,
      adminCount,
    };
  }, [users]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen de usuarios"
        description="Estado de las cuentas, quién está conectado y los últimos cambios de acceso."
        actions={
          <Button as={Link} to="/usuarios" variant="secondary" icon={Users}>
            Administrar usuarios
          </Button>
        }
      />

      {errorMessage && <Alert tone="danger">{errorMessage}</Alert>}

      <AdminKpis kpis={kpis} loading={loading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <UsersByRoleCard users={users} />
        </div>
        <div className="lg:col-span-7">
          <MonthlySignupsCard users={users} />
        </div>
      </div>

      <SecurityEventsCard events={securityEvents} />

      {/* Modal de Configuración y Prueba de Google Mail */}
      <GoogleEmailConfigModal
        isOpen={emailConfigModalOpen}
        onClose={() => setEmailConfigModalOpen(false)}
      />

      {/* Modal de Configuración de Seguridad y 2FA de la Cuenta del Administrador */}
      <AccountSettingsModal
        isOpen={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
        initialTab="2fa"
      />
    </div>
  );
};

export default AdminDashboard;
