import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Button, Field, Input, LoadingState, Modal } from '../ui';
import { formatDate } from '../../utils/format';
import { AffiliationDocumentsPanel } from '../documents';

const FORM_ID = 'afiliacion-personal';

/**
 * Solicitud de afiliación del personal desde su sesión (issue #32).
 *
 * Usa los datos que la cooperativa ya tiene; solo se eligen el correo del futuro usuario de asociado
 * (distinto al del personal) y, si cambió, el teléfono. La solicitud la formaliza un colega en
 * «Afiliaciones», con el depósito inicial.
 */
export const StaffAffiliationModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [errorCorreo, setErrorCorreo] = useState('');
  const [resultado, setResultado] = useState(null);
  const correoRef = useRef(null);
  const cargarDocumentos = useCallback(() => api.get('/afiliacion/personal/documentos').then((r) => r.data.data), []);
  const subirDocumento = useCallback(
    (tipo, archivo) => api.post('/afiliacion/personal/documentos', { tipo_documento: tipo, archivo }).then((r) => r.data.data),
    []
  );
  const resultadoRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let vigente = true;
    setDatos(null);
    setErrorCarga('');
    setError('');
    setErrorCorreo('');
    setResultado(null);
    setEmail('');
    setCargando(true);
    api
      .get('/afiliacion/personal')
      .then((res) => {
        if (!vigente) return;
        setDatos(res.data.data);
        setTelefono((res.data.data?.telefono || '').replace(/\D/g, '').slice(0, 8));
      })
      .catch((err) => {
        if (vigente) setErrorCarga(err.response?.data?.message || 'No se pudieron cargar sus datos. Intente de nuevo.');
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [isOpen]);

  // Al terminar de cargar, el foco va al correo; al registrar, al resultado (el formulario desaparece)
  const puedeSolicitar = datos && !datos.es_asociado && !datos.solicitud_pendiente && !resultado;
  useEffect(() => {
    if (puedeSolicitar) correoRef.current?.focus();
  }, [puedeSolicitar]);
  useEffect(() => {
    if (resultado) resultadoRef.current?.focus();
  }, [resultado]);

  const correoDelPersonal = (user?.email || '').toLowerCase();
  const correoRepetido = email.trim() !== '' && email.trim().toLowerCase() === correoDelPersonal;
  const telefonoInvalido = telefono !== '' && telefono.length !== 8;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (correoRepetido || telefonoInvalido) return;
    setEnviando(true);
    setError('');
    setErrorCorreo('');
    try {
      const res = await api.post('/afiliacion/personal/solicitud', { email: email.trim(), telefono });
      setResultado(res.data.data);
    } catch (err) {
      const mensaje = err.response?.data?.message || 'No se pudo registrar su solicitud. Intente de nuevo.';
      // Los errores del correo se muestran debajo del campo
      if (String(err.response?.data?.error || '').startsWith('CORREO_')) setErrorCorreo(mensaje);
      else setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const footer = puedeSolicitar ? (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
      <Button
        type="submit"
        form={FORM_ID}
        loading={enviando}
        loadingText="Enviando…"
        disabled={!email.trim() || correoRepetido || telefonoInvalido}
      >
        Enviar solicitud
      </Button>
    </div>
  ) : (
    <Button onClick={onClose}>Cerrar</Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!enviando}
      title="Afiliarme a la cooperativa"
      description="Su afiliación como asociado, con los datos que la cooperativa ya tiene."
      footer={footer}
    >
      {cargando && <LoadingState label="Cargando sus datos…" />}
      {errorCarga && <Alert tone="danger">{errorCarga}</Alert>}

      {resultado && (
        <div ref={resultadoRef} tabIndex={-1} className="space-y-4 focus:outline-none">
          <Alert tone="success" title="Solicitud registrada">
            Su número de caso es <span className="font-mono">{resultado.numero_caso}</span>. Pídale a un colega que
            la formalice en «Afiliaciones»: ahí se registra su depósito inicial (mínimo Q100.00) y se crea su usuario
            de asociado, que le llegará a {resultado.email}.
          </Alert>
          {!resultado.correo_enviado && (
            <Alert tone="warning">
              No se pudo enviar el número de caso por correo. Anótelo: su solicitud quedó registrada igual.
            </Alert>
          )}
        </div>
      )}

      {datos && !resultado && datos.es_asociado && (
        <Alert tone="info" title="Ya es asociado de la cooperativa">
          Entre al portal con su usuario de asociado. Si no lo tiene, un colega lo activa desde su expediente.
        </Alert>
      )}

      {datos && !resultado && !datos.es_asociado && datos.solicitud_pendiente && (
        <Alert tone="info" title="Ya tiene una solicitud en trámite">
          Su número de caso es <span className="font-mono">{datos.solicitud_pendiente}</span>. Pídale a un colega que
          la formalice en «Afiliaciones».
        </Alert>
      )}

      {puedeSolicitar && (
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert tone="danger">{error}</Alert>}

          <dl className="divide-y divide-line rounded-md border border-line text-sm">
            {[
              ['Nombre', datos.nombre_completo],
              ['DPI', datos.cui_dpi, 'font-mono'],
              ['Fecha de nacimiento', datos.fecha_nacimiento ? formatDate(`${datos.fecha_nacimiento}T00:00:00`) : 'No registrada'],
              ['Dirección', datos.direccion || 'No registrada'],
            ].map(([label, value, valueClass]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-muted">{label}</dt>
                <dd className={`text-right text-ink ${valueClass || ''}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-subtle">
            Si alguno de estos datos no es correcto, pídale al administrador que lo corrija antes de afiliarse.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Correo para su usuario de asociado"
              hint={correoDelPersonal ? `Distinto al de su usuario del personal (${correoDelPersonal}).` : 'Distinto al de su usuario del personal.'}
              error={correoRepetido ? 'Ese es el correo de su usuario del personal. Use otro.' : errorCorreo || undefined}
              required
            >
              <Input
                ref={correoRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value.toLowerCase().replace(/\s+/g, ''));
                  if (errorCorreo) setErrorCorreo('');
                }}
                invalid={correoRepetido || Boolean(errorCorreo)}
                autoComplete="email"
                required
              />
            </Field>
            <Field
              label="Teléfono"
              hint={`${telefono.length}/8 dígitos. Si lo cambia, se actualiza también en su perfil.`}
              error={telefonoInvalido ? 'El teléfono debe tener 8 dígitos.' : undefined}
            >
              <Input
                inputMode="numeric"
                maxLength={8}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 8))}
                invalid={telefonoInvalido}
                className="font-mono"
              />
            </Field>
          </div>
        </form>
      )}

      {/* Documentos (Fase 6): los puede subir ya; los que falten se escanean al formalizar. Los revisa un colega. */}
      {datos && !datos.es_asociado && (
        <div className="mt-6 border-t border-line pt-5">
          <AffiliationDocumentsPanel
            titulo="Sus documentos de afiliación"
            cargar={cargarDocumentos}
            subir={subirDocumento}
            nota="Puede subirlos ahora o llevarlos cuando un colega formalice su solicitud. Los revisa otro operador."
          />
        </div>
      )}
    </Modal>
  );
};

export default StaffAffiliationModal;
