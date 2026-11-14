import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Alert, Badge, Button, cn, Field, Input, Modal, PasswordInput, Select, TabPanel, Tabs } from '../ui';

const CONFIG_FORM_ID = 'config-correo';
const TEST_FORM_ID = 'prueba-correo';
const SMTP_FORM_ID = 'config-correo-smtp';
const PROVEEDOR_TABS_ID = 'proveedor-correo';
const SMTP_SSL_ID = 'smtp-ssl';
const PROVEEDORES = [
  { id: 'google', label: 'Gmail' },
  { id: 'smtp', label: 'Otro servidor (SMTP)' },
];
// Mismos puertos que acepta el backend (PUERTOS_SMTP_PERMITIDOS en mailerService)
const PUERTOS_SMTP = [
  { valor: 587, etiqueta: '587 (recomendado)' },
  { valor: 465, etiqueta: '465 (SSL)' },
  { valor: 25, etiqueta: '25' },
  { valor: 2525, etiqueta: '2525' },
  { valor: 1025, etiqueta: '1025 (solo pruebas)' },
];
const PUERTO_SMTP_POR_DEFECTO = 587;
const PUERTO_SMTP_SSL = 465;
const REMITENTE_POR_DEFECTO = 'Cooperativa Corporativa';
const NOMBRES_PROVEEDOR = { google: 'Gmail', smtp: 'el servidor SMTP' };
const LARGO_CODIGO_2FA = 6;

/**
 * Campos para confirmar la identidad antes de cambiar el correo: por ese correo salen las contraseñas temporales y
 * los códigos, así que se pide la contraseña del administrador y su código 2FA si lo tiene activo.
 */
const ConfirmacionIdentidad = ({ conMfa, password, onPassword, codigo, onCodigo, visible, onVisible, error, passwordRef }) => (
  <fieldset className="space-y-3 rounded-md border border-line bg-surface-muted p-4">
    <legend className="px-1 text-sm font-semibold text-ink">Confirme que es usted</legend>
    <p className="!mt-0 text-sm text-ink-muted">
      Por seguridad: por este correo salen las contraseñas temporales y los códigos de verificación. Para cambiarlo,
      escriba la contraseña con la que ingresa a la cooperativa
      {conMfa ? ' y el código de su aplicación de autenticación' : ''}. Se le pedirá en cada intento.
    </p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Su contraseña de ingreso" error={error} required>
        <PasswordInput
          ref={passwordRef}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          visible={visible}
          onVisibleChange={onVisible}
          autoComplete="current-password"
          required
        />
      </Field>
      {conMfa && (
        <Field
          label="Código de verificación"
          hint="6 dígitos de su aplicación de autenticación (Google o Microsoft Authenticator)."
          required
        >
          <Input
            value={codigo}
            maxLength={LARGO_CODIGO_2FA}
            pattern="\d{6}"
            title="Escriba los 6 dígitos."
            onChange={(e) => onCodigo(e.target.value.replace(/\D/g, '').slice(0, LARGO_CODIGO_2FA))}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="font-mono"
            required
          />
        </Field>
      )}
    </div>
  </fieldset>
);

/** «Nombre <correo>» con un nombre sin los caracteres que cambian cómo se lee el remitente. */
const armarRemitente = (nombre, correo) =>
  `${nombre.replace(/[,;"<>@\r\n]/g, '').trim() || REMITENTE_POR_DEFECTO} <${correo}>`;

/** Separa «Nombre <correo>» en sus dos partes; un correo solo queda sin nombre. */
const separarRemitente = (from) => {
  const partes = /^(.*)<([^<>]+)>$/.exec(from || '');
  return partes ? { nombre: partes[1].trim(), correo: partes[2].trim() } : { nombre: '', correo: (from || '').trim() };
};

/**
 * Configuración del correo del sistema y prueba de envío: Gmail con contraseña
 * de aplicación u otro servidor SMTP (issue #126). Por aquí salen las
 * credenciales, contraseñas temporales y códigos de verificación de los asociados.
 */
export const GoogleEmailConfigModal = ({ isOpen, onClose, onConfigSaved }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const conMfa = Boolean(user?.mfa_enabled);
  const [loading, setLoading] = useState(false);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [serviceStatus, setServiceStatus] = useState(null);
  const [gmailUser, setGmailUser] = useState('');
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  const [senderName, setSenderName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [proveedor, setProveedor] = useState('google');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(String(PUERTO_SMTP_POR_DEFECTO));
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  const [passwordActual, setPasswordActual] = useState('');
  const [codigo2fa, setCodigo2fa] = useState('');
  const [showPasswordActual, setShowPasswordActual] = useState(false);
  const [errorConfirmacion, setErrorConfirmacion] = useState('');
  const passwordActualRef = useRef(null);

  const [testRecipient, setTestRecipient] = useState('');
  const [testResult, setTestResult] = useState(null);

  const fetchStatus = async () => {
    try {
      setFetchingStatus(true);
      const res = await api.get('/usuarios/email/status');
      if (res.data?.success) {
        const estado = res.data.data;
        setServiceStatus(estado);
        const remitente = separarRemitente(estado.from);
        if (remitente.nombre) setSenderName(remitente.nombre);
        if (estado.provider === 'smtp' && estado.smtp) {
          setProveedor('smtp');
          setSmtpHost(estado.smtp.host || '');
          setSmtpPort(String(estado.smtp.port || PUERTO_SMTP_POR_DEFECTO));
          setSmtpSecure(Boolean(estado.smtp.secure));
          if (estado.rawUser) setSmtpUser(estado.rawUser);
          if (remitente.correo !== estado.rawUser) setSmtpFrom(remitente.correo);
        } else if (estado.rawUser) {
          setGmailUser(estado.rawUser);
        }
      }
    } catch (err) {
      console.warn('No se pudo consultar el estado del servicio de correo:', err);
    } finally {
      setFetchingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchStatus();
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * Guarda y verifica la configuración con la confirmación de identidad; `limpiar` borra la contraseña del correo si
   * salió bien. La contraseña y el código de confirmación se borran siempre.
   */
  const guardarConfig = async (datos, limpiar) => {
    if (!passwordActual || (conMfa && codigo2fa.length !== LARGO_CODIGO_2FA)) {
      toast.warning(conMfa ? 'Escriba su contraseña y el código de 6 dígitos.' : 'Escriba su contraseña para confirmar.');
      return;
    }
    let limpiarConfirmacion = true;
    try {
      setLoading(true);
      setErrorConfirmacion('');
      const res = await api.post('/usuarios/email/config', {
        ...datos,
        password_actual: passwordActual,
        ...(conMfa ? { codigo_2fa: codigo2fa } : {}),
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'El correo quedó conectado y verificado.');
        setServiceStatus(res.data.data);
        limpiar(); // Limpiar contraseña del formulario por seguridad
        if (onConfigSaved) onConfigSaved(res.data.data);
      }
    } catch (err) {
      const mensaje = err.response?.data?.message || 'No se pudo conectar con el servicio de correo. Revise los datos.';
      if (err.response?.status === 403) {
        // La confirmación falló: el aviso va junto al campo y el foco vuelve a la contraseña
        setErrorConfirmacion(mensaje);
        setTimeout(() => passwordActualRef.current?.focus(), 0);
      } else {
        // Falló el correo, no la identidad: se conserva lo escrito para corregir los datos del servidor
        limpiarConfirmacion = false;
        toast.error(mensaje);
      }
    } finally {
      if (limpiarConfirmacion) {
        setPasswordActual('');
        setCodigo2fa('');
      }
      setLoading(false);
    }
  };

  const confirmacion = (
    <ConfirmacionIdentidad
      conMfa={conMfa}
      password={passwordActual}
      onPassword={setPasswordActual}
      codigo={codigo2fa}
      onCodigo={setCodigo2fa}
      visible={showPasswordActual}
      onVisible={setShowPasswordActual}
      error={errorConfirmacion}
      passwordRef={passwordActualRef}
    />
  );

  const handleSaveConfig = (e) => {
    e.preventDefault();
    if (!gmailUser.trim() || !gmailAppPassword.trim()) {
      toast.warning('Escriba la cuenta de Gmail y la contraseña de aplicación de 16 caracteres.');
      return;
    }
    void guardarConfig(
      {
        provider: 'google',
        gmail_user: gmailUser.trim(),
        gmail_app_password: gmailAppPassword.trim(),
        email_from: armarRemitente(senderName, gmailUser.trim()),
      },
      () => setGmailAppPassword('')
    );
  };

  const handleSaveSmtp = (e) => {
    e.preventDefault();
    if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass) {
      toast.warning('Escriba el servidor, el usuario y la contraseña del correo.');
      return;
    }
    const correoRemitente = smtpFrom.trim() || (smtpUser.includes('@') ? smtpUser.trim() : '');
    if (!correoRemitente) {
      toast.warning('Escriba el correo del remitente: el usuario de este servidor no es un correo.');
      return;
    }
    void guardarConfig(
      {
        provider: 'smtp',
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort),
        smtp_secure: smtpSecure || Number(smtpPort) === PUERTO_SMTP_SSL,
        smtp_user: smtpUser.trim(),
        smtp_pass: smtpPass,
        email_from: armarRemitente(senderName, correoRemitente),
      },
      () => setSmtpPass('')
    );
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testRecipient.trim() || !testRecipient.includes('@')) {
      toast.warning('Escriba un correo de destino válido.');
      return;
    }

    try {
      setSendingTest(true);
      setTestResult(null);
      const res = await api.post('/usuarios/email/test', {
        to: testRecipient.trim(),
      });

      if (res.data?.success) {
        setTestResult(res.data);
        // En modo demostrativo el servidor responde bien, pero el correo no salió (issue #13)
        if (res.data.simulado || res.data.data?.simulado) {
          toast.warning('El correo no salió: el servicio de correo está en modo demostrativo.');
        } else {
          toast.success(res.data.message || 'Correo de prueba enviado.');
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'No se pudo enviar el correo de prueba.';
      toast.error(errorMsg);
      setTestResult({
        success: false,
        message: errorMsg,
      });
    } finally {
      setSendingTest(false);
    }
  };

  const proveedorActivo = serviceStatus?.provider;
  const configurado = proveedorActivo === 'google' || proveedorActivo === 'smtp';
  const conectado = configurado && serviceStatus?.verified;
  const sinVerificar = configurado && !serviceStatus?.verified;
  const servidorActivo =
    proveedorActivo === 'smtp' && serviceStatus?.smtp ? `${serviceStatus.smtp.host}:${serviceStatus.smtp.port}` : null;
  const puertoSsl = Number(smtpPort) === PUERTO_SMTP_SSL;
  // Guardar en la otra pestaña reemplaza el proveedor que está funcionando
  const avisoCambio = (destino) =>
    conectado && proveedorActivo !== destino
      ? `Al guardar, los correos dejarán de salir por ${NOMBRES_PROVEEDOR[proveedorActivo]}.`
      : null;
  const cambiarPuerto = (valor) => {
    // Al salir del 465 la casilla vuelve a su valor normal (sin SSL desde el inicio)
    if (Number(smtpPort) === PUERTO_SMTP_SSL) setSmtpSecure(false);
    setSmtpPort(valor);
  };
  const pruebaSimulada = testResult?.success && (testResult.simulado || testResult.data?.simulado);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Correo de notificaciones"
      description="Cuenta desde la que el sistema envía credenciales, contraseñas temporales y códigos de verificación."
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="space-y-6">
        {/* Estado actual del servicio */}
        <section aria-labelledby="correo-estado" className="space-y-3 rounded-md border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="correo-estado" className="text-sm font-semibold text-ink">Estado</h3>
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={fetchStatus} loading={fetchingStatus} loadingText="Consultando…">
              Actualizar
            </Button>
          </div>
          {serviceStatus?.disabled ? (
            <Alert tone="info" title="El envío de correos está desactivado">
              En este entorno el envío de correos está apagado. Ningún correo sale, aunque haya una cuenta configurada.
              Pida a soporte técnico que lo active.
            </Alert>
          ) : conectado ? (
            <Badge tone="success" dot>{proveedorActivo === 'google' ? 'Conectado con Google' : 'Conectado por SMTP'}</Badge>
          ) : sinVerificar ? (
            <Badge tone="warning" dot>Configurado, pero sin verificar</Badge>
          ) : (
            <Alert tone="warning" title="Los correos no se están enviando">
              No hay un servicio de correo configurado. Mientras tanto, los asociados nuevos no reciben su contraseña
              temporal por correo.
            </Alert>
          )}
          {servidorActivo && (
            <p className="text-sm text-ink-muted">
              Servidor: <span className="font-mono text-ink">{servidorActivo}</span>
            </p>
          )}
          {serviceStatus?.userMasked && (
            <p className="text-sm text-ink-muted">
              {proveedorActivo === 'smtp' ? 'Usuario' : 'Remitente'}:{' '}
              <span className="font-mono text-ink">{serviceStatus.userMasked}</span>
            </p>
          )}
          {serviceStatus?.lastError && <Alert tone="danger" title="Último error">{serviceStatus.lastError}</Alert>}
        </section>

        <Tabs
          items={PROVEEDORES}
          value={proveedor}
          onChange={setProveedor}
          label="Desde dónde salen los correos"
          idPrefix={PROVEEDOR_TABS_ID}
          size="sm"
        />

        {proveedor === 'google' && (
          <TabPanel id="google" idPrefix={PROVEEDOR_TABS_ID}>
            {/* Credenciales de Google */}
            <form id={CONFIG_FORM_ID} onSubmit={handleSaveConfig} aria-labelledby="correo-config" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="correo-config" className="text-sm font-semibold text-ink">Cuenta de Google</h3>
                <Button size="sm" variant="link" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>
                  {showHelp ? 'Ocultar guía' : '¿Cómo obtengo la contraseña de aplicación?'}
                </Button>
              </div>

              {showHelp && (
                <ol className="list-decimal space-y-1.5 rounded-md border border-line bg-surface-muted p-4 pl-8 text-sm text-ink-soft">
                  <li>En la cuenta de Google, active la verificación en dos pasos.</li>
                  <li>
                    Entre a{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline"
                    >
                      myaccount.google.com/apppasswords
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                    .
                  </li>
                  <li>Escriba «Cooperativa» como nombre de la app y pulse Crear.</li>
                  <li>Copie la clave de 16 caracteres que muestra Google (por ejemplo, abcd efgh ijkl mnop) y péguela abajo.</li>
                </ol>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Correo de Gmail" required>
                  <Input type="email" value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} placeholder="cooperativa@gmail.com" required />
                </Field>
                <Field label="Contraseña de aplicación" hint="16 caracteres generados por Google." required>
                  <PasswordInput
                    value={gmailAppPassword}
                    onChange={(e) => setGmailAppPassword(e.target.value)}
                    visible={showPassword}
                    onVisibleChange={setShowPassword}
                    autoComplete="off"
                    className="font-mono"
                    required
                  />
                </Field>
              </div>
              <Field label="Nombre del remitente" hint="Opcional. Es el nombre que verá quien reciba el correo.">
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Cooperativa" />
              </Field>
              {confirmacion}
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
                {avisoCambio('google') && <p className="text-sm text-warning-800">{avisoCambio('google')}</p>}
                <Button type="submit" loading={loading} loadingText="Verificando con Google…">
                  Guardar y conectar
                </Button>
              </div>
            </form>
          </TabPanel>
        )}

        {proveedor === 'smtp' && (
          <TabPanel id="smtp" idPrefix={PROVEEDOR_TABS_ID}>
            <form id={SMTP_FORM_ID} onSubmit={handleSaveSmtp} aria-labelledby="correo-config-smtp" className="space-y-4">
              <div>
                <h3 id="correo-config-smtp" className="text-sm font-semibold text-ink">Servidor de correo (SMTP)</h3>
                <p className="text-sm text-ink-muted">
                  Para Outlook, el correo del hosting u otro proveedor. Los datos los da su proveedor de correo.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Servidor" required className="sm:col-span-2">
                  <Input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.office365.com"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="Puerto" required>
                  <Select value={smtpPort} onChange={(e) => cambiarPuerto(e.target.value)}>
                    {PUERTOS_SMTP.map(({ valor, etiqueta }) => (
                      <option key={valor} value={String(valor)}>
                        {etiqueta}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <input
                  id={SMTP_SSL_ID}
                  type="checkbox"
                  aria-describedby={`${SMTP_SSL_ID}-ayuda`}
                  className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-700"
                  checked={smtpSecure || puertoSsl}
                  disabled={puertoSsl}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                <div>
                  <label
                    htmlFor={SMTP_SSL_ID}
                    className={cn('font-medium', puertoSsl ? 'text-ink-muted' : 'cursor-pointer text-ink')}
                  >
                    Conexión segura desde el inicio (SSL)
                  </label>
                  <p id={`${SMTP_SSL_ID}-ayuda`} className="mt-0.5 text-ink-muted">
                    Con el puerto 465 siempre va activada. Con 587 déjela sin marcar: la conexión se asegura después.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Usuario" required>
                  <Input
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="notificaciones@cooperativa.com"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="Contraseña del servidor de correo" required>
                  <PasswordInput
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    visible={showSmtpPass}
                    onVisibleChange={setShowSmtpPass}
                    autoComplete="off"
                    required
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre del remitente" hint="Opcional. Es el nombre que verá quien reciba el correo.">
                  <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Cooperativa" />
                </Field>
                <Field label="Correo del remitente" hint="Si lo deja vacío, se usa el usuario cuando es un correo.">
                  <Input
                    type="email"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="notificaciones@cooperativa.com"
                  />
                </Field>
              </div>
              {confirmacion}
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
                {avisoCambio('smtp') && <p className="text-sm text-warning-800">{avisoCambio('smtp')}</p>}
                <Button type="submit" loading={loading} loadingText="Verificando el servidor…">
                  Guardar y conectar
                </Button>
              </div>
            </form>
          </TabPanel>
        )}

        {/* Prueba de envío */}
        <section aria-labelledby="correo-prueba" className="space-y-3 border-t border-line pt-5">
          <div>
            <h3 id="correo-prueba" className="text-sm font-semibold text-ink">Enviar un correo de prueba</h3>
            <p className="text-sm text-ink-muted">Compruebe que los correos llegan antes de afiliar asociados.</p>
          </div>
          <form id={TEST_FORM_ID} onSubmit={handleSendTest} className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="usuario@dominio.com"
                aria-label="Correo de destino para la prueba"
                required
              />
            </div>
            <Button type="submit" variant="secondary" icon={Send} loading={sendingTest} loadingText="Enviando…">
              Enviar prueba
            </Button>
          </form>

          {testResult &&
            (pruebaSimulada ? (
              <Alert tone="warning" title="El correo no salió">
                El servicio está en modo de prueba, así que el mensaje no llegó a un buzón real. Configure el correo
                arriba.
              </Alert>
            ) : (
              <Alert tone={testResult.success ? 'success' : 'danger'}>
                {testResult.message}
                {testResult.data?.messageId && (
                  <span className="mt-1 block text-xs">
                    Identificador del envío: <span className="font-mono">{testResult.data.messageId}</span>
                  </span>
                )}
              </Alert>
            ))}
        </section>
      </div>
    </Modal>
  );
};

export default GoogleEmailConfigModal;
