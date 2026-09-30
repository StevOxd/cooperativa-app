import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, Inbox, Plus, Search, Users } from 'lucide-react';
import '../index.css';
import { SecurityAlertModal } from '../components/common/SecurityAlertModal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, EmptyState, Field, Input,
  Modal, PageHeader, Select, StatCard, StatGroup, Table, TBody, TD, TH, THead, TR, Textarea,
} from '../components/ui';

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-semibold text-ink-muted">{title}</h2>
    {children}
  </section>
);

const movimientos = [
  { fecha: '12/09/2026', concepto: 'Depósito en agencia', tipo: 'CRÉDITO', monto: 1500 },
  { fecha: '10/09/2026', concepto: 'Abono a préstamo', tipo: 'DÉBITO', monto: 725.5 },
  { fecha: '02/09/2026', concepto: 'Aportación mensual', tipo: 'CRÉDITO', monto: 100 },
];
const q = (n) => `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`;

const UiPreview = () => {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [securityAlert, setSecurityAlert] = useState(null);
  const [confirm, setConfirm] = useState(null);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Agencia Central"
        title="Asociados"
        description="Busca un asociado para ver sus cuentas, créditos y beneficiarios."
        actions={
          <>
            <Button variant="secondary" icon={Download}>Exportar</Button>
            <Button icon={Plus}>Nuevo asociado</Button>
          </>
        }
      />

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Guardar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver detalle</Button>
          <Button variant="danger">Rechazar</Button>
          <Button variant="link">Ver historial</Button>
          <Button loading loadingText="Guardando…">Guardar</Button>
          <Button disabled>Deshabilitado</Button>
          <Button size="sm">Pequeño</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" variant="ghost" aria-label="Buscar"><Search className="w-4 h-4" /></Button>
        </div>
      </Section>

      <Section title="Field, Input, Select, Textarea">
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="DPI" hint="13 dígitos, sin espacios." required>
              <Input inputMode="numeric" maxLength={13} placeholder="0000000000000" />
            </Field>
            <Field label="Monto de aportación" error="El monto mínimo es Q100.00.">
              <Input prefix="Q" defaultValue="50.00" />
            </Field>
            <Field label="Tipo de cuenta">
              <Select defaultValue="">
                <option value="" disabled>Selecciona una opción</option>
                <option>Ahorro</option>
                <option>Aportación</option>
              </Select>
            </Field>
            <Field label="Buscar">
              <Input icon={Search} placeholder="Nombre o DPI" />
            </Field>
            <Field label="Observaciones" className="sm:col-span-2">
              <Textarea placeholder="Opcional" />
            </Field>
            <Field label="Código corporativo">
              <Input readOnly defaultValue="ASC-000124" />
            </Field>
            <Field label="Agencia">
              <Input disabled defaultValue="Central" />
            </Field>
          </CardBody>
        </Card>
      </Section>

      <Section title="Alert">
        <div className="grid gap-2">
          <Alert tone="info">Su solicitud fue enviada. Le avisaremos por correo cuando sea revisada.</Alert>
          <Alert tone="success" title="Cuenta creada">El número de cuenta es 01-0042.</Alert>
          <Alert tone="warning">Su sesión se cerró por inactividad.</Alert>
          <Alert tone="danger">El DPI debe tener 13 dígitos.</Alert>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Borrador</Badge>
          <Badge tone="brand">En revisión</Badge>
          <Badge tone="success" dot>Activo</Badge>
          <Badge tone="warning" dot>Pendiente</Badge>
          <Badge tone="danger" dot>Bloqueado</Badge>
        </div>
      </Section>

      <Section title="StatGroup y StatCard">
        <StatGroup>
          <StatCard label="Asociados activos" value="1,284" hint="+32 este mes" hintTone="success" />
          <StatCard label="Solicitudes pendientes" value="17" hint="5 con más de 3 días" hintTone="warning" />
          <StatCard label="Cartera de créditos" value="Q 4,812,300.00" />
          <StatCard label="Conectados ahora" value="42" icon={Users} />
        </StatGroup>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Saldo disponible" value="Q 12,450.75" hint="Cuenta de ahorro 01-0042" />
        </div>
      </Section>

      <Section title="Card + Table">
        <Card>
          <CardHeader
            title="Últimos movimientos"
            description="Cuenta de ahorro 01-0042"
            actions={<Button size="sm" variant="secondary">Ver todos</Button>}
          />
          <Table bordered={false} caption="Últimos movimientos de la cuenta">
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Concepto</TH>
                <TH>Tipo</TH>
                <TH numeric>Monto</TH>
              </TR>
            </THead>
            <TBody>
              {movimientos.map((m) => (
                <TR key={m.fecha + m.concepto} interactive>
                  <TD className="whitespace-nowrap">{m.fecha}</TD>
                  <TD className="text-ink">{m.concepto}</TD>
                  <TD><Badge tone={m.tipo === 'CRÉDITO' ? 'success' : 'neutral'}>{m.tipo === 'CRÉDITO' ? 'Crédito' : 'Débito'}</Badge></TD>
                  <TD numeric className="text-ink">{q(m.monto)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <CardFooter>
            <Button variant="ghost" size="sm">Anterior</Button>
            <Button variant="secondary" size="sm">Siguiente</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            icon={Inbox}
            title="No hay solicitudes pendientes"
            description="Cuando un asociado envíe una solicitud, aparecerá aquí."
            action={<Button variant="secondary" size="sm">Actualizar</Button>}
          />
        </Card>
      </Section>

      <Section title="Alerta de sesión concurrente">
        <Button
          variant="secondary"
          onClick={() => setSecurityAlert({ message: '', timestamp: new Date().toISOString() })}
        >
          Simular alerta
        </Button>
        <SecurityAlertModal
          alert={securityAlert}
          onClose={() => setSecurityAlert(null)}
          onLogout={() => setSecurityAlert(null)}
        />
      </Section>

      <Section title="ConfirmModal">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirm('danger')}>Confirmación con aviso</Button>
          <Button variant="secondary" onClick={() => setConfirm('primary')}>Confirmación simple</Button>
        </div>
        <ConfirmModal
          isOpen={Boolean(confirm)}
          onClose={() => setConfirm(null)}
          onConfirm={() => setConfirm(null)}
          variant={confirm || 'danger'}
          title={confirm === 'danger' ? '¿Cancelar esta solicitud?' : '¿Activar al asociado?'}
          subtitle={confirm === 'danger' ? 'Solicitud #33' : 'María José López'}
          message={confirm === 'danger' ? 'Se liberará su cupo para enviar una nueva solicitud.' : 'Podrá volver a operar sus cuentas.'}
          details={confirm === 'danger' ? [{ label: 'Monto', value: 'Q5,000.00' }, { label: 'Cuota mensual', value: 'Q453.65', highlight: true }] : []}
          note={confirm === 'danger' ? 'Esta acción no se puede deshacer.' : undefined}
          confirmText={confirm === 'danger' ? 'Sí, cancelar' : 'Activar'}
          cancelText={confirm === 'danger' ? 'No, mantenerla' : 'Cancelar'}
        />
      </Section>

      <Section title="Modal">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setOpen(true)}>Abrir modal</Button>
          <Button variant="secondary" onClick={() => setLocked(true)}>Modal obligatorio</Button>
        </div>
        <Modal
          isOpen={open}
          onClose={() => setOpen(false)}
          title="Aprobar traslado"
          description="Revisa los datos antes de confirmar."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Aprobar</Button>
            </>
          }
        >
          <Field label="Comentario">
            <Textarea placeholder="Opcional" />
          </Field>
        </Modal>
        <Modal
          isOpen={locked}
          onClose={() => setLocked(false)}
          dismissible={false}
          size="sm"
          title="Cambia tu contraseña"
          description="Por seguridad, debes definir una nueva contraseña para continuar."
          footer={<Button onClick={() => setLocked(false)}>Continuar</Button>}
        >
          <p className="text-sm text-ink-muted">Sin botón de cerrar, sin Escape y sin clic fuera.</p>
        </Modal>
      </Section>
    </main>
  );
};

createRoot(document.getElementById('root')).render(<UiPreview />);
