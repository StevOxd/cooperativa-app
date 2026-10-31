import React, { useCallback, useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import api from '../../services/api';
import { Alert, Button, Field, Input } from '../ui';
import { AffiliationDocumentsPanel } from '../documents';
import { IdentityBar, StepActions, StepHeader } from './StepHeader';

/**
 * Paso 2 (clientes del banco): documentos de afiliación (Fase 6). Para terminar en línea, los obligatorios se suben
 * antes del débito; quien prefiera no subirlos termina en una agencia, sin débito en línea, con un número de caso.
 * Lo que suba aquí también lo encuentran en la agencia.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.bancoData - Persona verificada y `afiliacion_token`.
 * @param {string} props.email - Correo para el número de caso (y para el portal si termina en línea).
 * @param {(email: string) => void} props.setEmail
 * @param {Function} props.onContinuar - Sigue en línea (cuenta y aporte).
 * @param {(email: string) => void} props.onTerminarEnAgencia - Verifica el correo y registra la solicitud.
 * @param {Function} props.handleReset - Vuelve a la consulta de DPI.
 * @param {boolean} props.loading
 * @param {string} [props.errorAgencia] - Error al pedir terminar en una agencia (se muestra junto a esa opción).
 */
export const BankDocumentsStep = ({
  bancoData, email, setEmail, onContinuar, onTerminarEnAgencia, handleReset, loading, errorAgencia,
}) => {
  const [faltan, setFaltan] = useState(null);
  const token = bancoData.afiliacion_token;

  const cargar = useCallback(
    () => api.post('/afiliacion/documentos/consultar', { afiliacion_token: token }).then((r) => r.data.data),
    [token]
  );
  const subir = useCallback(
    (tipo, archivo) => api.post('/afiliacion/documentos', { afiliacion_token: token, tipo_documento: tipo, archivo }).then((r) => r.data.data),
    [token]
  );
  const onCambio = useCallback((resumen) => setFaltan(resumen ? resumen.faltantes.length : null), []);

  return (
    <div>
      <IdentityBar
        nombre={bancoData.persona.nombre_completo}
        dpi={bancoData.persona.cui_dpi}
        detalle={bancoData.tipo_sujeto === 'EMPLEADO_BANCO' ? 'Colaborador del banco' : 'Cliente del banco'}
        onChange={handleReset}
      />

      <StepHeader
        step={2}
        total={4}
        title="Sus documentos"
        description="Para terminar en línea, suba los documentos obligatorios. Los revisamos en la cooperativa y le avisamos por correo si alguno no se puede aceptar."
      />

      <AffiliationDocumentsPanel
        titulo="Documentos de afiliación"
        cargar={cargar}
        subir={subir}
        onCambio={onCambio}
        nota="PDF, JPG o PNG de hasta 5 MB. Las fotos se reducen y se les quita la ubicación antes de enviarlas."
      />

      <StepActions>
        <p className="text-sm text-ink-muted" role="status">
          {faltan === null && 'Revisando sus documentos… Si no cargan, use «Reintentar».'}
          {faltan > 0 && `Faltan ${faltan} documento${faltan === 1 ? '' : 's'} obligatorio${faltan === 1 ? '' : 's'} para seguir en línea.`}
        </p>
        <Button onClick={onContinuar} disabled={faltan !== 0 || loading}>
          Continuar en línea
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </StepActions>

      <section aria-labelledby="terminar-agencia" className="mt-8 rounded-md border border-line px-4 py-4">
        <h3 id="terminar-agencia" className="flex items-center gap-2 text-sm font-medium text-ink">
          <Building2 className="w-4 h-4 text-ink-muted" aria-hidden="true" />
          ¿Prefiere terminar en una agencia?
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          No se debita nada en línea. Le damos un número de caso; allí escanean los documentos que falten y usted paga
          su aporte en efectivo o con un débito de su cuenta del banco. Le enviaremos un código de 6 dígitos para
          confirmar su correo.
        </p>
        {errorAgencia && <Alert tone="danger" className="mt-3">{errorAgencia}</Alert>}
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onTerminarEnAgencia(email.trim());
          }}
        >
          <Field label="Correo para el número de caso" className="flex-1">
            <Input id="email-agencia" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" variant="secondary" loading={loading} loadingText="Enviando código…">
            Terminar en una agencia
          </Button>
        </form>
      </section>
    </div>
  );
};

export default BankDocumentsStep;
