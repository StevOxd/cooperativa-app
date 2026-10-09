import React, { useState, useEffect } from 'react';
import { KeyRound, PlusCircle, Printer, Users } from 'lucide-react';
import api from '../../services/api';
import { Alert, Badge, Button, LoadingState, Modal, StatCard, StatGroup, cn } from '../ui';
import { formatDate, formatQ, humanize } from '../../utils/format';
import { parentescoLabel } from '../../utils/parentesco';
import { toast } from '../../context/ToastContext';
import { PortalAccessDialog } from './PortalAccessDialog';

/** Cómo se muestra el acceso al portal en el expediente (issue #27). */
const ACCESO_PORTAL = {
  SIN_ACCESO: { tone: 'neutral', etiqueta: 'Sin acceso', texto: 'No tiene usuario del portal.', accion: 'Activar acceso al portal' },
  PENDIENTE: { tone: 'warning', etiqueta: 'Pendiente', texto: 'Tiene usuario, pero nunca entró al portal.', accion: 'Reenviar acceso' },
  ACTIVO: { tone: 'success', etiqueta: 'Activo', texto: 'Ya usa el portal. Si olvidó su contraseña, la reinicia el administrador.' },
  INACTIVO: { tone: 'danger', etiqueta: 'Desactivado', texto: 'Su usuario está desactivado. Lo reactiva el administrador.' },
  PERSONAL: { tone: 'neutral', etiqueta: 'Personal', texto: 'Su usuario es del personal de la cooperativa.' },
};

/**
 * Expediente del asociado: datos generales, posición consolidada, cuentas y
 * beneficiarios. Se puede imprimir como ficha, con espacio para firmas.
 */
export const AssociateExpedienteModal = ({
  isOpen,
  onClose,
  idAsociado,
  onOpenNewAccount,
  onOpenBeneficiarios,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expediente, setExpediente] = useState(null);
  const [dialogoAcceso, setDialogoAcceso] = useState(false);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && idAsociado) {
      setLoading(true);
      setErrorMsg('');
      api.get(`/admin/asociados/${idAsociado}/expediente`)
        .then((res) => {
          if (res.data?.success) {
            setExpediente(res.data.data);
          } else {
            setErrorMsg(res.data?.message || 'No se pudo cargar el expediente.');
          }
        })
        .catch((err) => {
          console.error('Error al consultar expediente:', err);
          setErrorMsg(err.response?.data?.message || 'No hay conexión con el servidor. Intente de nuevo.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, idAsociado, recargar]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const a = expediente?.asociado;

  return (
    <Modal
      isOpen
      onClose={onClose}
      lockScroll={false}
      printable
      size="xl"
      title="Expediente del asociado"
      description="Datos generales, cuentas y beneficiarios."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button icon={Printer} onClick={handlePrint} disabled={!expediente} title="Imprimir o guardar en PDF">
            Imprimir ficha
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingState label="Cargando expediente…" />
      ) : errorMsg ? (
        <Alert tone="danger">{errorMsg}</Alert>
      ) : expediente ? (
        <div className="space-y-6">
          {/* Membrete: se imprime como encabezado de la ficha */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line-strong pb-4">
            <div>
              <p className="text-base font-semibold text-ink">Cooperativa Integral de Ahorro y Crédito, R.L.</p>
              <p className="text-sm text-ink-muted">Ficha de posición global del asociado</p>
              <p className="text-xs text-ink-subtle">
                Emitida el {new Date().toLocaleDateString('es-GT', { dateStyle: 'long' })}
              </p>
            </div>
            <div className="text-right">
              <Badge tone={a.estado_asociado === 'ACTIVO' ? 'success' : 'danger'}>{humanize(a.estado_asociado)}</Badge>
              <p className="mt-1 font-mono text-xs text-ink-subtle">Asociado #{a.id_asociado}</p>
            </div>
          </header>

          <section aria-labelledby="exp-datos">
            <h3 id="exp-datos" className="mb-3 text-sm font-semibold text-ink">Datos generales</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ['Nombre', a.nombre_completo],
                ['DPI', a.cui_dpi, 'font-mono'],
                ['Código de usuario', a.codigo_corporativo || 'Sin acceso al portal', a.codigo_corporativo && 'font-mono'],
                ['Teléfono', a.telefono || 'No registrado', a.telefono && 'font-mono'],
                ['Correo', a.email || 'No registrado'],
                ['Asociado desde', formatDate(a.fecha_ingreso)],
              ].map(([label, value, valueClass]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className={cn('mt-0.5 break-words text-ink', valueClass)}>{value}</dd>
                </div>
              ))}
              <div className="sm:col-span-3">
                <dt className="text-xs text-ink-muted">Dirección</dt>
                <dd className="mt-0.5 text-ink">{a.direccion || 'No especificada'}</dd>
              </div>
            </dl>
          </section>

          {a.acceso_portal && ACCESO_PORTAL[a.acceso_portal] && (
            <section
              aria-labelledby="exp-acceso"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3"
            >
              <div>
                <h3 id="exp-acceso" className="flex items-center gap-2 text-sm font-semibold text-ink">
                  Acceso al portal
                  <Badge tone={ACCESO_PORTAL[a.acceso_portal].tone}>{ACCESO_PORTAL[a.acceso_portal].etiqueta}</Badge>
                </h3>
                <p className="mt-0.5 text-sm text-ink-muted">{ACCESO_PORTAL[a.acceso_portal].texto}</p>
              </div>
              {ACCESO_PORTAL[a.acceso_portal].accion && a.estado_asociado === 'ACTIVO' && (
                <Button size="sm" icon={KeyRound} onClick={() => setDialogoAcceso(true)} className="print:hidden">
                  {ACCESO_PORTAL[a.acceso_portal].accion}
                </Button>
              )}
            </section>
          )}

          <StatGroup columns={3}>
            <StatCard label="Saldo total disponible" value={formatQ(expediente.metricas.saldo_total_disponible)} />
            <StatCard label="Aportaciones" value={formatQ(expediente.metricas.saldo_aportaciones)} />
            <StatCard label="Cuentas activas" value={expediente.metricas.total_cuentas} />
          </StatGroup>

          <section aria-labelledby="exp-cuentas" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="exp-cuentas" className="text-sm font-semibold text-ink">Cuentas y beneficiarios</h3>
              <div className="flex gap-2 print:hidden">
                <Button size="sm" variant="secondary" icon={PlusCircle} onClick={() => onOpenNewAccount && onOpenNewAccount(expediente.asociado)}>
                  Abrir cuenta
                </Button>
                <Button size="sm" variant="secondary" icon={Users} onClick={() => onOpenBeneficiarios && onOpenBeneficiarios(expediente.asociado)}>
                  Beneficiarios
                </Button>
              </div>
            </div>

            <ul className="space-y-3">
              {expediente.cuentas.map((c) => (
                <li key={c.id_cuenta} className="print-avoid-break rounded-md border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{c.tipo_cuenta_nombre || c.tipo_cuenta || 'Cuenta'}</p>
                      <p className="font-mono text-xs text-ink-subtle">{c.numero_cuenta}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-ink tabular-nums">{formatQ(c.saldo_disponible)}</p>
                      <p className="text-xs text-ink-subtle">Abierta el {formatDate(c.fecha_apertura)}</p>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-2 text-xs text-ink-muted">
                      Beneficiarios <span className="tabular-nums">({c.beneficiarios.length})</span>
                    </p>
                    {c.beneficiarios.length > 0 ? (
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {c.beneficiarios.map((b) => (
                          <li key={b.id_beneficiario} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate text-ink">{b.nombre_completo}</span>
                              <span className="text-xs text-ink-subtle">
                                {parentescoLabel(b.parentesco)}
                                {b.cui_dpi && <> · DPI <span className="font-mono">{b.cui_dpi}</span></>}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-ink-soft">{parseFloat(b.porcentaje).toFixed(2)} %</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-warning-800">Esta cuenta todavía no tiene beneficiarios.</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Firmas: solo al imprimir. Se usan <footer>/<span> porque la regla de impresión
              de index.css quita márgenes y rellenos a todos los <div>. */}
          <footer className="hidden grid-cols-2 gap-8 pt-16 text-center text-xs print:grid">
            <span className="block border-t border-ink-subtle pt-2">
              <span className="block font-medium text-ink">{a.nombre_completo}</span>
              <span className="block text-ink-muted">Firma del asociado</span>
              <span className="block font-mono text-ink-subtle">DPI {a.cui_dpi}</span>
            </span>
            <span className="block border-t border-ink-subtle pt-2">
              <span className="block font-medium text-ink">Operador de ventanilla</span>
              <span className="block text-ink-muted">Firma y sello</span>
            </span>
          </footer>
        </div>
      ) : null}
      <PortalAccessDialog
        isOpen={dialogoAcceso}
        asociado={a}
        onClose={() => setDialogoAcceso(false)}
        onCambioDeEstado={() => setRecargar((n) => n + 1)}
        onSuccess={(mensaje) => {
          setDialogoAcceso(false);
          toast.success(mensaje);
          setRecargar((n) => n + 1);
        }}
      />
    </Modal>
  );
};

export default AssociateExpedienteModal;
