import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Users } from 'lucide-react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { Alert, Button, PageHeader } from '../components/ui';
import { AdminKpis } from '../components/admin/dashboard/AdminKpis';
import { UsersByRoleCard } from '../components/admin/dashboard/UsersByRoleCard';
import { MonthlySignupsCard } from '../components/admin/dashboard/MonthlySignupsCard';
import { SecurityEventsCard } from '../components/admin/dashboard/SecurityEventsCard';

export const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [porConciliar, setPorConciliar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // Cargar lista de usuarios y últimos eventos de auditoría en paralelo
      const [usersRes, eventsRes, conciliacionRes] = await Promise.all([
        api.get('/usuarios'),
        api.get('/usuarios/auditoria/eventos-recientes').catch((err) => {
          console.warn('No se pudieron obtener eventos de auditoría:', err.message);
          return { data: { success: false, data: [] } };
        }),
        // Si el resumen falla, el panel sigue sin el aviso
        api.get('/conciliacion/resumen').catch(() => ({ data: { success: false } })),
      ]);

      if (usersRes.data?.success) {
        setUsers(usersRes.data.data || []);
      }
      if (eventsRes.data?.success) {
        setSecurityEvents(eventsRes.data.data || []);
      }
      setPorConciliar(conciliacionRes.data?.success ? conciliacionRes.data.data : null);
    } catch (error) {
      console.error('Error al cargar datos del Centro de Monitoreo:', error);
      setErrorMessage('Algunos datos del panel no se pudieron cargar. Actualice la página para intentar de nuevo.');
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
        if (data?.id_usuario !== undefined) {
          setUsers((prevUsers) =>
            prevUsers.map((u) => {
              if (Number(u.id_usuario) === Number(data.id_usuario)) {
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
    const ejecutivosCount = users.filter((u) => u.rol === 'EJECUTIVO').length;
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
      ejecutivosCount,
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

      {porConciliar && porConciliar.depositos_por_conciliar + porConciliar.reversiones_pendientes > 0 && (
        <Alert tone="warning" icon={Scale} title="Hay operaciones con el banco por conciliar">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {[
                porConciliar.depositos_por_conciliar > 0 &&
                  `${porConciliar.depositos_por_conciliar} ${porConciliar.depositos_por_conciliar === 1 ? 'depósito en ventanilla' : 'depósitos en ventanilla'}`,
                porConciliar.reversiones_pendientes > 0 &&
                  `${porConciliar.reversiones_pendientes} ${porConciliar.reversiones_pendientes === 1 ? 'reversión pendiente' : 'reversiones pendientes'}`,
              ]
                .filter(Boolean)
                .join(' y ')}
              .
            </span>
            <Button as={Link} to="/conciliacion" size="sm" variant="link" className="px-0">
              Ir a Conciliación
            </Button>
          </span>
        </Alert>
      )}

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
    </div>
  );
};

export default AdminDashboard;
