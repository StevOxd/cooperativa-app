import React, { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Field, Input, Modal, PasswordInput } from '../ui';

const CONFIG_FORM_ID = 'config-correo';
const TEST_FORM_ID = 'prueba-correo';

/**
 * Configuración del correo del sistema (Gmail con contraseña de aplicación) y
 * prueba de envío. Por aquí salen las credenciales, contraseñas temporales y
 * códigos de verificación de los asociados.
 */
export const GoogleEmailConfigModal = ({ isOpen, onClose, onConfigSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [serviceStatus, setServiceStatus] = useState(null);
  const [gmailUser, setGmailUser] = useState('');
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  const [senderName, setSenderName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [testRecipient, setTestRecipient] = useState('');
  const [testResult, setTestResult] = useState(null);

  const fetchStatus = async () => {
    try {
      setFetchingStatus(true);
      const res = await api.get('/usuarios/email/status');
      if (res.data?.success) {
        setServiceStatus(res.data.data);
        if (res.data.data.rawUser) {
          setGmailUser(res.data.data.rawUser);
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
      fetchStatus();
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!gmailUser.trim() || !gmailAppPassword.trim()) {
      toast.warning('Escriba la cuenta de Gmail y la contraseña de aplicación de 16 caracteres.');
      return;
    }

    try {
      setLoading(true);
      const formattedFrom = senderName.trim()
        ? `${senderName.trim()} <${gmailUser.trim()}>`
        : `Cooperativa Corporativa <${gmailUser.trim()}>`;

      const res = await api.post('/usuarios/email/config', {
        gmail_user: gmailUser.trim(),
        gmail_app_password: gmailAppPassword.trim(),
        email_from: formattedFrom,
      });

      if (res.data?.success) {
        toast.success('Gmail quedó conectado y verificado.');
        setServiceStatus(res.data.data);
        setGmailAppPassword(''); // Limpiar contraseña del formulario por seguridad
        if (onConfigSaved) onConfigSaved(res.data.data);
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        'Error al conectar con Google Mail. Verifica que la contraseña de aplicación sea correcta.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
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
        toast.success(res.data.message || 'Correo de prueba enviado.');
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

  const conectado = serviceStatus?.provider === 'google' && serviceStatus?.verified;
  const sinVerificar = serviceStatus?.provider === 'google' && !serviceStatus?.verified;
  const pruebaSimulada = testResult?.success && (testResult.simulado || testResult.data?.simulado);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Correo de notificaciones"
      description="Cuenta de Google desde la que el sistema envía credenciales, contraseñas temporales y códigos de verificación."
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
          {conectado ? (
            <Badge tone="success" dot>Conectado con Google</Badge>
          ) : sinVerificar ? (
            <Badge tone="warning" dot>Configurado, pero sin verificar</Badge>
          ) : (
            <Alert tone="warning" title="Los correos no se están enviando">
              No hay una cuenta de Google configurada. Mientras tanto, los asociados nuevos no reciben su contraseña
              temporal por correo.
            </Alert>
          )}
          {serviceStatus?.userMasked && (
            <p className="text-sm text-ink-muted">
              Remitente: <span className="font-mono text-ink">{serviceStatus.userMasked}</span>
            </p>
          )}
          {serviceStatus?.lastError && <Alert tone="danger" title="Último error">{serviceStatus.lastError}</Alert>}
        </section>

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
          <div className="flex justify-end">
            <Button type="submit" loading={loading} loadingText="Verificando con Google…">
              Guardar y conectar
            </Button>
          </div>
        </form>

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
                El servicio está en modo de prueba, así que el mensaje no llegó a un buzón real. Configure la cuenta de
                Google arriba.
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
