import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Field, Input, Modal, Select, cn } from '../../ui';

/** Valores guardados en la base de datos → texto en pantalla. */
const PARENTESCOS = [
  ['CÓNYUGE', 'Cónyuge'],
  ['HIJO/A', 'Hijo o hija'],
  ['PADRE', 'Padre'],
  ['MADRE', 'Madre'],
  ['HERMANO/A', 'Hermano o hermana'],
  ['OTRO', 'Otro'],
];

/**
 * Edición de los beneficiarios de una cuenta. La suma de porcentajes debe ser
 * exactamente 100 % para poder guardar.
 */
export const EditBeneficiariesModal = ({
  closeEditarBeneficiariosModal,
  editBeneficiariosList,
  handleAddBeneficiarioAsociado,
  handleRemoveBeneficiarioAsociado,
  handleSaveBeneficiariosSubmit,
  hasAssociateBenChanges,
  modalBenError,
  savingBeneficiarios,
  selectedCuentaParaEditar,
  setEditBeneficiariosList,
  totalPorcentajeAsociado,
}) => {
  if (!selectedCuentaParaEditar) return null;

  const isComplete = Math.abs(totalPorcentajeAsociado - 100.0) < 0.01;
  const isOver = totalPorcentajeAsociado > 100;

  const updateField = (idx, field, value) => {
    const updated = [...editBeneficiariosList];
    updated[idx][field] = value;
    setEditBeneficiariosList(updated);
  };

  return (
    <Modal
      isOpen
      onClose={closeEditarBeneficiariosModal}
      dismissible={!savingBeneficiarios}
      closeOnOverlay={false}
      lockScroll={false}
      size="lg"
      title="Beneficiarios"
      description={
        <>
          {selectedCuentaParaEditar.tipo_cuenta} · <span className="font-mono">{selectedCuentaParaEditar.numero_cuenta}</span>
        </>
      }
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-subtle" aria-live="polite">
            {!hasAssociateBenChanges && isComplete ? 'Sin cambios por guardar.' : ''}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={closeEditarBeneficiariosModal} disabled={savingBeneficiarios}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveBeneficiariosSubmit}
              loading={savingBeneficiarios}
              loadingText="Guardando…"
              disabled={Math.abs(totalPorcentajeAsociado - 100.0) > 0.01 || !hasAssociateBenChanges}
              title={!hasAssociateBenChanges ? 'Cambie algún dato o porcentaje para guardar' : undefined}
            >
              Guardar beneficiarios
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Estas personas recibirán los fondos de la cuenta si el titular fallece. Los porcentajes deben sumar
          exactamente 100 %.
        </p>

        {modalBenError && <Alert tone="danger">{modalBenError}</Alert>}

        <ol className="space-y-3">
          {editBeneficiariosList.map((ben, idx) => (
            <li key={idx} className="rounded-md border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-ink">Beneficiario {idx + 1}</h3>
                {editBeneficiariosList.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-700"
                    icon={Trash2}
                    onClick={() => handleRemoveBeneficiarioAsociado(idx)}
                    aria-label={`Quitar al beneficiario ${idx + 1}`}
                  >
                    Quitar
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre completo" required className="sm:col-span-2">
                  <Input value={ben.nombre_completo} onChange={(e) => updateField(idx, 'nombre_completo', e.target.value)} />
                </Field>
                <Field label="Parentesco" required>
                  <Select value={ben.parentesco} onChange={(e) => updateField(idx, 'parentesco', e.target.value)}>
                    {PARENTESCOS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="DPI" hint="13 dígitos.">
                  <Input
                    inputMode="numeric"
                    value={ben.cui_dpi || ''}
                    onChange={(e) => updateField(idx, 'cui_dpi', e.target.value.replace(/\D/g, '').slice(0, 13))}
                    className="font-mono"
                  />
                </Field>
                <Field label="Teléfono" hint="8 dígitos.">
                  <Input
                    inputMode="numeric"
                    maxLength={8}
                    value={ben.telefono || ''}
                    onChange={(e) => updateField(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="font-mono"
                  />
                </Field>
                <Field label="Porcentaje" required>
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={ben.porcentaje}
                    onChange={(e) => updateField(idx, 'porcentaje', e.target.value)}
                    trailing={<span className="pr-2 text-sm text-ink-subtle" aria-hidden="true">%</span>}
                    className="tabular-nums"
                  />
                </Field>
              </div>
            </li>
          ))}
        </ol>

        <Button
          variant="secondary"
          icon={Plus}
          fullWidth
          onClick={handleAddBeneficiarioAsociado}
          disabled={totalPorcentajeAsociado >= 100}
          className="border-dashed"
        >
          Agregar beneficiario
        </Button>

        {/* Total distribuido */}
        <div className="space-y-2 rounded-md border border-line p-4" aria-live="polite">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">Total asignado</span>
            <span className={cn('font-medium tabular-nums', isComplete ? 'text-success-700' : isOver ? 'text-danger-700' : 'text-warning-800')}>
              {totalPorcentajeAsociado.toFixed(2)} % de 100 %
            </span>
          </div>
          <div className="h-1.5 w-full rounded-sm bg-surface-sunken" aria-hidden="true">
            <div
              className={cn('h-1.5 rounded-sm transition-all', isComplete ? 'bg-success-600' : isOver ? 'bg-danger-600' : 'bg-warning-500')}
              style={{ width: `${Math.min(100, totalPorcentajeAsociado)}%` }}
            />
          </div>
          <p className={cn('text-sm', isComplete ? 'text-success-700' : isOver ? 'text-danger-700' : 'text-warning-800')}>
            {isComplete
              ? 'La distribución está completa.'
              : isOver
              ? `Sobra ${(totalPorcentajeAsociado - 100).toFixed(2)} %. Reduzca algún porcentaje.`
              : `Falta asignar ${(100 - totalPorcentajeAsociado).toFixed(2)} %.`}
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default EditBeneficiariesModal;
