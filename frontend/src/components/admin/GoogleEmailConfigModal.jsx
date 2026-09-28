import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Send,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  X,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

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
      toast.warning('Ingresa la cuenta de Google y la Contraseña de Aplicación de 16 caracteres.');
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
        toast.success('¡Servicio de Google Mail conectado y verificado exitosamente!');
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
      toast.warning('Ingresa un correo electrónico de destino válido.');
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
        toast.success(res.data.message || 'Correo de prueba despachado.');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Error al enviar correo de prueba.';
      toast.error(errorMsg);
      setTestResult({
        success: false,
        message: errorMsg,
      });
    } finally {
      setSendingTest(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-brand-900 to-teal-950 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Mail className="w-5 h-5 text-brand-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Servicio de Correo Google (Gmail)</h2>
              <p className="text-xs text-brand-200/80">
                Despacho automatizado de credenciales, contraseñas temporales y códigos 2FA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Tarjeta de Estado del Servicio */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Estado Actual del Servicio
              </span>
              {fetchingStatus ? (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={fetchStatus}
                  className="text-xs text-brand-700 hover:text-brand-800 font-medium underline"
                >
                  Actualizar Estado
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3">
              {serviceStatus?.provider === 'google' && serviceStatus?.verified ? (
                <div className="flex items-center gap-2 text-brand-700 font-bold text-sm bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200">
                  <CheckCircle2 className="w-4 h-4 text-brand-600" />
                  Google Mail Activo y Conectado
                </div>
              ) : serviceStatus?.provider === 'google' && !serviceStatus?.verified ? (
                <div className="flex items-center gap-2 text-warning-700 font-bold text-sm bg-warning-50 px-3 py-1.5 rounded-lg border border-warning-200">
                  <AlertCircle className="w-4 h-4 text-warning-600" />
                  Google Mail Configurado (Requiere Verificación)
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-700 font-bold text-sm bg-slate-200/70 px-3 py-1.5 rounded-lg border border-slate-300">
                  <Sparkles className="w-4 h-4 text-slate-600" />
                  Modo Demostrativo / Local (Sin credenciales externas)
                </div>
              )}
            </div>

            {serviceStatus?.userMasked && (
              <div className="mt-2 text-xs text-slate-600">
                Cuenta remitente: <code className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{serviceStatus.userMasked}</code>
              </div>
            )}

            {serviceStatus?.lastError && (
              <div className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                <strong>Advertencia previa:</strong> {serviceStatus.lastError}
              </div>
            )}
          </div>

          {/* Formulario de Configuración de Google */}
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-600" />
                Configurar Credenciales de Google
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-xs text-brand-700 hover:text-brand-800 flex items-center gap-1 font-medium"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showHelp ? 'Ocultar Guía' : '¿Cómo obtener la contraseña de aplicación?'}
              </button>
            </div>

            {/* Guía Explicativa */}
            {showHelp && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-xs text-brand-950 space-y-2 animate-in fade-in duration-150">
                <p className="font-semibold text-brand-900">
                  Pasos para habilitar el envío con tu cuenta de Google (Gmail):
                </p>
                <ol className="list-decimal pl-4 space-y-1.5 text-brand-800">
                  <li>
                    Ingresa a tu cuenta Google y asegúrate de tener activada la <strong>Verificación en 2 pasos</strong>.
                  </li>
                  <li>
                    Visita:{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 font-bold underline inline-flex items-center gap-1"
                    >
                      myaccount.google.com/apppasswords <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>En el campo <em>"Nombre de la app"</em> escribe: <strong>Cooperativa</strong> y presiona <em>Crear</em>.</li>
                  <li>Google te mostrará un código amarillo de <strong>16 caracteres</strong> (ej. <code>abcd efgh ijkl mnop</code>).</li>
                  <li>Copia esa clave y pégala en el campo <em>"Contraseña de Aplicación"</em> a continuación.</li>
                </ol>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cuenta de Google (Gmail) *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={gmailUser}
                    onChange={(e) => setGmailUser(e.target.value)}
                    placeholder="ej. mi-cooperativa@gmail.com"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contraseña de Aplicación (16 dígitos) *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={gmailAppPassword}
                    onChange={(e) => setGmailAppPassword(e.target.value)}
                    placeholder="16 caracteres de Google"
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre de Remitente Visible (Opcional)
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="ej. Cooperativa Corporativa Financiera"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-md shadow-brand-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validando con Google...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Guardar y Conectar con Google
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Sección de Prueba de Envío */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Send className="w-4 h-4 text-teal-600" />
              Probar Despacho de Correo en Vivo
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Ingresa una dirección de correo para enviar un mensaje de comprobación y certificar que la entrega funciona correctamente.
            </p>

            <form onSubmit={handleSendTest} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="ej. usuario@dominio.com"
                required
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={sendingTest}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {sendingTest ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Despachando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar Correo de Prueba
                  </>
                )}
              </button>
            </form>

            {testResult && (
              <div
                className={`mt-3 p-3.5 rounded-xl border text-xs ${
                  testResult.success
                    ? 'bg-brand-50 border-brand-200 text-brand-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-brand-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  {testResult.message}
                </div>
                {testResult.data?.messageId && (
                  <div className="mt-1 text-slate-600">
                    ID de Transacción SMTP: <code className="font-mono">{testResult.data.messageId}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GoogleEmailConfigModal;
