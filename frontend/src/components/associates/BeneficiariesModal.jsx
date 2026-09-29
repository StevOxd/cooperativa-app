import React, { useState, useEffect } from 'react';
import { History, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import {
  Alert, Badge, Button, EmptyState, Field, Input, LoadingState, Modal, Select, TabPanel, Tabs, cn,
} from '../ui';
import { formatDateTime, formatQ, humanize } from '../../utils/format';
import { ROLE_LABELS } from '../layout/navigation';
import { parentescoLabel } from '../../utils/parentesco';

const FORM_ID = 'beneficiarios-operador';
const TABS_ID = 'beneficiarios-operador';

/** Valor guardado → texto en pantalla (los valores no cambian). */
const CuentaSelect = ({ cuentas, value, onChange }) =>
  cuentas.length > 0 ? (
    <Field label="Cuenta" required>
      <Select value={value || ''} onChange={onChange} required>
        {cuentas.map((c) => (
          <option key={c.id_cuenta} value={c.id_cuenta}>
            {c.tipo_cuenta_nombre || c.tipo_cuenta || 'Cuenta'} · {c.numero_cuenta} (saldo {formatQ(c.saldo_disponible)})
          </option>
        ))}
      </Select>
    </Field>
  ) : (
    <Alert tone="warning">El asociado no tiene cuentas para asignar beneficiarios.</Alert>
  );

/**
 * Declaración de beneficiarios de las cuentas de un asociado, hecha por el
 * operador en ventanilla, con el historial de cambios. La suma debe ser 100 %.
 */
const PARENTESCOS = ['HIJO/A', 'CONYUGE', 'PADRE/MADRE', 'HERMANO/A', 'SOBRINO/A', 'OTRO'];

export const BeneficiariesModal = ({
  isOpen,
  onClose,
  asociado,
  idCuentaInicial = null,
  onSuccess,
}) => {
  const [cuentas, setCuentas] = useState([]);
  const [selectedCuentaId, setSelectedCuentaId] = useState(idCuentaInicial);
  const [beneficiarios, setBeneficiarios] = useState([
    { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 100 },
  ]);

  const [initialBeneficiarios, setInitialBeneficiarios] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('declaracion'); // 'declaracion' | 'historial'
  const [historialList, setHistorialList] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [motivoCambio, setMotivoCambio] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadHistorialBeneficiarios = async (cuentaId) => {
    if (!cuentaId) return;
    try {
      setLoadingHistorial(true);
      const res = await api.get(`/admin/asociados/cuentas/${cuentaId}/beneficiarios/historial`);
      if (res.data?.success) {
        setHistorialList(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar historial de beneficiarios:', err);
    } finally {
      setLoadingHistorial(false);
    }
  };

  // Cargar cuentas del asociado y beneficiarios de la cuenta
  useEffect(() => {
    if (isOpen && asociado) {
      setErrorMsg('');
      setSuccessMsg('');
      setLoading(true);

      api.get(`/admin/asociados/${asociado.id_asociado}/expediente`)
        .then((res) => {
          if (res.data?.success) {
            const ctas = res.data.data.cuentas || [];
            setCuentas(ctas);

            const targetId = idCuentaInicial || (ctas.length > 0 ? ctas[0].id_cuenta : null);
            setSelectedCuentaId(targetId);

            if (targetId) {
              loadBeneficiariosDeCuenta(targetId);
              loadHistorialBeneficiarios(targetId);
            }
          }
        })
        .catch((err) => {
          console.error('Error al cargar cuentas del asociado:', err);
          setErrorMsg('No se pudieron obtener las cuentas del asociado.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, asociado, idCuentaInicial]);

  useEffect(() => {
    if (isOpen && asociado) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, asociado]);

  const loadBeneficiariosDeCuenta = async (cuentaId) => {
    try {
      const res = await api.get(`/admin/asociados/cuentas/${cuentaId}/beneficiarios`);
      if (res.data?.success && res.data.data.length > 0) {
        setBeneficiarios(res.data.data);
        setInitialBeneficiarios(JSON.parse(JSON.stringify(res.data.data)));
      } else {
        const defaultBens = [
          { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 100 },
        ];
        setBeneficiarios(defaultBens);
        setInitialBeneficiarios([]);
      }
    } catch (err) {
      console.error('Error al cargar beneficiarios:', err);
    }
  };

  const handleCuentaChange = (e) => {
    const cuentaId = parseInt(e.target.value, 10);
    setSelectedCuentaId(cuentaId);
    setErrorMsg('');
    setSuccessMsg('');
    loadBeneficiariosDeCuenta(cuentaId);
    loadHistorialBeneficiarios(cuentaId);
  };

  const handleBenChange = (index, field, value) => {
    let sanitizedVal = value;
    if (field === 'telefono') {
      // Solo dígitos, máximo 8 dígitos
      sanitizedVal = value.replace(/\D/g, '').slice(0, 8);
    } else if (field === 'cui_dpi') {
      sanitizedVal = value.replace(/\D/g, '').slice(0, 13);
    }

    setBeneficiarios((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: sanitizedVal };
      return updated;
    });
    if (errorMsg) setErrorMsg('');
    if (successMsg) setSuccessMsg('');
  };

  const handleAddBeneficiario = () => {
    setBeneficiarios((prev) => [
      ...prev,
      { nombre_completo: '', parentesco: 'HIJO/A', cui_dpi: '', telefono: '', porcentaje: 0 },
    ]);
  };

  const handleRemoveBeneficiario = (index) => {
    if (beneficiarios.length === 1) return;
    setBeneficiarios((prev) => prev.filter((_, i) => i !== index));
  };

  // Distribuir el 100% de manera uniforme entre todos los beneficiarios
  const handleDistribuirEquitativo = () => {
    const totalCount = beneficiarios.length;
    if (totalCount === 0) return;

    const basePct = Math.floor((100 / totalCount) * 100) / 100;
    const remainder = parseFloat((100 - basePct * totalCount).toFixed(2));

    setBeneficiarios((prev) =>
      prev.map((ben, idx) => ({
        ...ben,
        porcentaje: idx === 0 ? parseFloat((basePct + remainder).toFixed(2)) : basePct,
      }))
    );
  };

  // Cálculo de la suma total
  const sumaPorcentajes = beneficiarios.reduce((sum, b) => {
    const val = parseFloat(b.porcentaje);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const esValido100 = Math.abs(sumaPorcentajes - 100.0) < 0.01;

  // Detección estricta de cambios respecto a la versión cargada inicialmente
  const hasChanges = React.useMemo(() => {
    if (!initialBeneficiarios) return false;

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

    const normInitial = normalize(initialBeneficiarios);
    const normCurrent = normalize(beneficiarios);

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
  }, [initialBeneficiarios, beneficiarios]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCuentaId) {
      setErrorMsg('Debe seleccionar una cuenta para registrar beneficiarios.');
      return;
    }

    if (!hasChanges) {
      setErrorMsg('No se detectaron modificaciones en los beneficiarios. Realice algún cambio para guardar.');
      return;
    }

    if (!esValido100) {
      setErrorMsg(
        `La suma de los porcentajes asignados debe ser exactamente el 100.00%. Suma actual: ${sumaPorcentajes.toFixed(
          2
        )}%`
      );
      return;
    }

    for (const b of beneficiarios) {
      if (!b.nombre_completo.trim()) {
        setErrorMsg('Todos los beneficiarios deben tener nombre completo.');
        return;
      }
      if (b.telefono && b.telefono.length > 0 && b.telefono.length !== 8) {
        setErrorMsg(`El teléfono de "${b.nombre_completo}" debe contener exactamente 8 dígitos numéricos.`);
        return;
      }
      if (parseFloat(b.porcentaje) <= 0) {
        setErrorMsg('Cada beneficiario debe tener un porcentaje mayor al 0.00%.');
        return;
      }
    }

    setSaving(true);

    try {
      const res = await api.post(`/admin/asociados/cuentas/${selectedCuentaId}/beneficiarios`, {
        beneficiarios: beneficiarios.map((b) => ({
          nombre_completo: b.nombre_completo.trim(),
          parentesco: b.parentesco,
          cui_dpi: b.cui_dpi?.trim() || null,
          telefono: b.telefono?.trim() || null,
          porcentaje: parseFloat(b.porcentaje),
        })),
        motivo: motivoCambio.trim() || 'Actualización de beneficiarios en ventanilla por Operador',
      });

      if (res.data?.success) {
        setSuccessMsg('Beneficiarios declarados y guardados exitosamente (100.00% distribuido).');
        setMotivoCambio('');
        setInitialBeneficiarios(JSON.parse(JSON.stringify(beneficiarios)));
        loadHistorialBeneficiarios(selectedCuentaId);
        if (onSuccess) onSuccess();
      } else {
        setErrorMsg(res.data?.message || 'Error al guardar beneficiarios.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Error al conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !asociado) return null;

  const isOver = sumaPorcentajes > 100;
  const tone = esValido100 ? 'success' : isOver ? 'danger' : 'warning';
  const toneText = { success: 'text-success-700', danger: 'text-danger-700', warning: 'text-warning-800' }[tone];
  const toneBar = { success: 'bg-success-600', danger: 'bg-danger-600', warning: 'bg-warning-500' }[tone];

  const footer =
    activeModalTab === 'declaracion' ? (
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-subtle" aria-live="polite">
          {!hasChanges && esValido100 ? 'Sin cambios por guardar.' : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cerrar</Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={saving}
            loadingText="Guardando…"
            disabled={!esValido100 || !hasChanges}
            title={!hasChanges ? 'Cambie algún dato o porcentaje para guardar' : undefined}
          >
            Guardar beneficiarios
          </Button>
        </div>
      </div>
    ) : (
      <Button variant="secondary" onClick={onClose}>Cerrar</Button>
    );

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!saving}
      closeOnOverlay={false}
      lockScroll={false}
      size="lg"
      title="Beneficiarios"
      description={`Asociado: ${asociado.nombre_completo}`}
      footer={footer}
    >
      <div className="space-y-5">
        <Tabs
          label="Secciones de beneficiarios"
          idPrefix={TABS_ID}
          value={activeModalTab}
          onChange={(id) => {
            setActiveModalTab(id);
            if (id === 'historial' && selectedCuentaId) loadHistorialBeneficiarios(selectedCuentaId);
          }}
          items={[
            { id: 'declaracion', label: 'Declaración' },
            { id: 'historial', label: 'Historial de cambios', ...(historialList.length > 0 && { count: historialList.length }) },
          ]}
        />

        {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        <TabPanel id={activeModalTab} idPrefix={TABS_ID}>
          {activeModalTab === 'declaracion' && (
            <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
              <CuentaSelect cuentas={cuentas} value={selectedCuentaId} onChange={handleCuentaChange} />

              {/* Total asignado: debe ser exactamente 100 % */}
              <div className="space-y-2 rounded-md border border-line p-4" aria-live="polite">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-muted">Total asignado</span>
                  <span className={cn('font-medium tabular-nums', toneText)}>{sumaPorcentajes.toFixed(2)} % de 100 %</span>
                </div>
                <div className="h-1.5 w-full rounded-sm bg-surface-sunken" aria-hidden="true">
                  <div className={cn('h-1.5 rounded-sm transition-all', toneBar)} style={{ width: `${Math.min(sumaPorcentajes, 100)}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={cn('text-sm', toneText)}>
                    {esValido100
                      ? 'La distribución está completa.'
                      : isOver
                      ? `Sobra ${(sumaPorcentajes - 100).toFixed(2)} %. Reduzca algún porcentaje.`
                      : `Falta asignar ${(100 - sumaPorcentajes).toFixed(2)} %.`}
                  </p>
                  <Button size="sm" variant="link" onClick={handleDistribuirEquitativo}>
                    Repartir en partes iguales
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Beneficiarios <span className="font-normal text-ink-subtle tabular-nums">({beneficiarios.length})</span>
                  </h3>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={handleAddBeneficiario}>
                    Agregar
                  </Button>
                </div>

                <ol className="space-y-3">
                  {beneficiarios.map((ben, index) => (
                    <li key={index} className="rounded-md border border-line p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-medium text-ink">Beneficiario {index + 1}</h4>
                        {beneficiarios.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghostDanger"
                            icon={Trash2}
                            onClick={() => handleRemoveBeneficiario(index)}
                            aria-label={`Quitar al beneficiario ${index + 1}`}
                          >
                            Quitar
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field label="Nombre completo" required className="sm:col-span-2">
                          <Input value={ben.nombre_completo} onChange={(e) => handleBenChange(index, 'nombre_completo', e.target.value)} required />
                        </Field>
                        <Field label="Parentesco" required>
                          <Select value={ben.parentesco} onChange={(e) => handleBenChange(index, 'parentesco', e.target.value)}>
                            {PARENTESCOS.map((p) => (
                              <option key={p} value={p}>{parentescoLabel(p)}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="DPI" hint="13 dígitos.">
                          <Input
                            inputMode="numeric"
                            maxLength={13}
                            value={ben.cui_dpi || ''}
                            onChange={(e) => handleBenChange(index, 'cui_dpi', e.target.value)}
                            className="font-mono"
                          />
                        </Field>
                        <Field label="Teléfono" hint="8 dígitos.">
                          <Input
                            type="tel"
                            maxLength={8}
                            value={ben.telefono || ''}
                            onChange={(e) => handleBenChange(index, 'telefono', e.target.value)}
                            className="font-mono"
                          />
                        </Field>
                        <Field label="Porcentaje" required>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="100.00"
                            value={ben.porcentaje}
                            onChange={(e) => handleBenChange(index, 'porcentaje', e.target.value)}
                            trailing={<span className="pr-2 text-sm text-ink-subtle" aria-hidden="true">%</span>}
                            className="tabular-nums"
                            required
                          />
                        </Field>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <Field label="Motivo del cambio" hint="Opcional. Queda en el historial.">
                <Input
                  value={motivoCambio}
                  onChange={(e) => setMotivoCambio(e.target.value)}
                  placeholder="Por ejemplo: el asociado actualizó sus datos familiares"
                />
              </Field>
            </form>
          )}

          {activeModalTab === 'historial' && (
            <div className="space-y-4">
              <CuentaSelect cuentas={cuentas} value={selectedCuentaId} onChange={handleCuentaChange} />

              {loadingHistorial ? (
                <LoadingState label="Cargando historial…" />
              ) : historialList.length === 0 ? (
                <div className="rounded-md border border-dashed border-line-strong">
                  <EmptyState icon={History} title="Sin cambios registrados" description="Esta cuenta no tiene cambios previos de beneficiarios." />
                </div>
              ) : (
                <ol className="space-y-3">
                  {historialList.map((item) => {
                    let prevBens = [];
                    let newBens = [];
                    try {
                      prevBens = typeof item.beneficiarios_anteriores === 'string'
                        ? JSON.parse(item.beneficiarios_anteriores)
                        : (item.beneficiarios_anteriores || []);
                    } catch (e) {
                      prevBens = [];
                    }
                    try {
                      newBens = typeof item.beneficiarios_nuevos === 'string'
                        ? JSON.parse(item.beneficiarios_nuevos)
                        : (item.beneficiarios_nuevos || []);
                    } catch (e) {
                      newBens = [];
                    }

                    return (
                      <li key={item.id_historial} className="space-y-3 rounded-md border border-line p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="tabular-nums text-ink">{formatDateTime(item.fecha_cambio)}</span>
                          <span className="flex items-center gap-2 text-ink-muted">
                            {item.nombre_usuario || 'Operador'}
                            <Badge>{ROLE_LABELS[item.rol_usuario] || humanize(item.rol_usuario) || 'Operador'}</Badge>
                          </span>
                        </div>
                        {item.motivo && <p className="text-sm text-ink-soft">Motivo: {item.motivo}</p>}
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          {[
                            ['Antes', prevBens, 'Sin beneficiarios'],
                            ['Después', newBens, 'Sin beneficiarios'],
                          ].map(([label, list, empty]) => (
                            <div key={label} className={cn('rounded-md border p-3', label === 'Después' ? 'border-brand-200 bg-brand-50' : 'border-line')}>
                              <p className="mb-1.5 text-xs font-medium text-ink-muted">{label}</p>
                              {list.length === 0 ? (
                                <p className="text-ink-subtle">{empty}</p>
                              ) : (
                                <ul className="space-y-1">
                                  {list.map((b, i) => (
                                    <li key={i} className="flex justify-between gap-2">
                                      <span className="truncate text-ink">{b.nombre_completo}</span>
                                      <span className="shrink-0 tabular-nums text-ink-soft">{parseFloat(b.porcentaje).toFixed(2)} %</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </TabPanel>
      </div>
    </Modal>
  );
};

export default BeneficiariesModal;
