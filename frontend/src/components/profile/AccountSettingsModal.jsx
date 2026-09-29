import React, { useState, useEffect } from 'react';
import { Check, Copy, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import {
  Alert, Badge, Button, Field, Input, Modal, PasswordInput, TabPanel, Tabs,
} from '../ui';
import { PasswordRequirement } from '../auth/PasswordRequirement';
import { PASSWORD_MIN_LENGTH, checkPassword } from '../../utils/passwordPolicy';
import { ROLE_LABELS } from '../layout/navigation';

const TABS_ID = 'cuenta';

/**
 * Modal "Mi cuenta":
 * - Verificación en dos pasos (2FA TOTP con código QR)
 * - Cambio de contraseña
 * - Datos personales (solo el teléfono es editable)
 */
export const AccountSettingsModal = ({ isOpen, onClose, initialTab = '2fa' }) => {
  const { user, updateUserData } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState(initialTab);

  // Estados 2FA
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [isConfiguring2fa, setIsConfiguring2fa] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [isDisabling2fa, setIsDisabling2fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disablingLoading, setDisablingLoading] = useState(false);

  // Estados Cambio de Contraseña
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [showPasswordActual, setShowPasswordActual] = useState(false);
  const [showNuevaPassword, setShowNuevaPassword] = useState(false);
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Estados Perfil
  const [telefono, setTelefono] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Mensajes y alertas por pestaña
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sincronizar tab inicial cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || '2fa');
      setErrorMsg('');
      setSuccessMsg('');
      setIsConfiguring2fa(false);
      setIsDisabling2fa(false);
      setTotpCode('');
      setDisablePassword('');
      setPasswordActual('');
      setNuevaPassword('');
      setConfirmarPassword('');
      setGeneratingQr(false);
      setVerifyingCode(false);

      if (user) {
        setTelefono(user.telefono || '');
        setMfaEnabled(Boolean(user.mfa_enabled));
      }

      // Verificación silenciosa del estado de 2FA en el servidor sin bloquear la UI
      let isMounted = true;
      api.get('/auth/2fa/status')
        .then((response) => {
          if (isMounted && response.data?.success) {
            const enabled = Boolean(response.data.mfa_enabled);
            setMfaEnabled(enabled);
            if (user && Boolean(user.mfa_enabled) !== enabled) {
              updateUserData({ mfa_enabled: enabled });
            }
          }
        })
        .catch((err) => {
          console.error('Error al consultar estado 2FA:', err);
        });

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        isMounted = false;
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen, initialTab]);

  // Cierre con Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Solicitar QR y Secreto para iniciar configuración 2FA (a petición explícita del usuario)
  const handleStart2faSetup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setGeneratingQr(true);
    try {
      const response = await api.post('/auth/2fa/setup');
      if (response.data?.success) {
        setQrCodeUrl(response.data.qr_code_url);
        setSecretKey(response.data.secret);
        setIsConfiguring2fa(true);
        setTotpCode('');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo iniciar la configuración de 2FA.');
      }
    } catch (err) {
      console.error('Error al generar configuración 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Error al comunicarse con el servidor.');
    } finally {
      setGeneratingQr(false);
    }
  };

  // Copiar clave secreta al portapapeles
  const handleCopySecret = async () => {
    if (!secretKey) return;
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  // Confirmar y Activar 2FA con código de 6 dígitos
  const handleEnable2faSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanCode = totpCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('Por favor ingrese un código numérico válido de 6 dígitos.');
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await api.post('/auth/2fa/enable', {
        secret: secretKey,
        totp_code: cleanCode,
      });

      if (response.data?.success) {
        setMfaEnabled(true);
        setIsConfiguring2fa(false);
        setQrCodeUrl('');
        setSecretKey('');
        setTotpCode('');
        updateUserData({ mfa_enabled: true });
        setSuccessMsg('¡Doble Factor de Autenticación (2FA) activado con éxito! Su cuenta ahora está protegida.');
        toast?.success('Doble Factor de Autenticación (2FA) activado exitosamente.');
      } else {
        setErrorMsg(response.data?.message || 'Código incorrecto. Intente de nuevo.');
      }
    } catch (err) {
      console.error('Error al activar 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Código de seguridad incorrecto o expirado.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Desactivar 2FA con confirmación de contraseña
  const handleDisable2faSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!disablePassword) {
      setErrorMsg('Debe ingresar su contraseña actual para confirmar la desactivación.');
      return;
    }

    setDisablingLoading(true);
    try {
      const response = await api.post('/auth/2fa/disable', {
        password: disablePassword,
      });

      if (response.data?.success) {
        setMfaEnabled(false);
        setIsDisabling2fa(false);
        setDisablePassword('');
        updateUserData({ mfa_enabled: false });
        setSuccessMsg('Doble factor de autenticación desactivado.');
        toast?.success('2FA desactivado.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo desactivar el 2FA.');
      }
    } catch (err) {
      console.error('Error al desactivar 2FA:', err);
      setErrorMsg(err.response?.data?.message || 'Contraseña incorrecta.');
    } finally {
      setDisablingLoading(false);
    }
  };

  // Guardar Cambio de Contraseña
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!passwordActual || !nuevaPassword || !confirmarPassword) {
      setErrorMsg('Todos los campos son obligatorios.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setErrorMsg('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    const reglas = checkPassword(nuevaPassword);
    if (!reglas.hasMinLength) {
      setErrorMsg(`La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }

    if (nuevaPassword === passwordActual) {
      setErrorMsg('La nueva contraseña no puede ser idéntica a la anterior.');
      return;
    }

    if (!reglas.hasLetters || !reglas.hasNumbers) {
      setErrorMsg('La nueva contraseña debe contener al menos una letra y un número.');
      return;
    }

    if (!reglas.hasSpecial) {
      setErrorMsg('La nueva contraseña debe contener al menos un carácter especial (!@#$%^&*...).');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await api.post('/auth/cambiar-password', {
        password_actual: passwordActual,
        nueva_password: nuevaPassword,
        confirmar_password: confirmarPassword,
      });

      if (response.data?.success) {
        setPasswordActual('');
        setNuevaPassword('');
        setConfirmarPassword('');
        setSuccessMsg('Contraseña actualizada exitosamente.');
        toast?.success('Contraseña actualizada exitosamente.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo actualizar la contraseña.');
      }
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      setErrorMsg(err.response?.data?.message || 'Error al procesar la actualización de contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  // Guardar Cambios de Perfil (Teléfono)
  const handleUpdateProfileSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanTel = telefono.trim();
    if (!cleanTel) {
      setErrorMsg('El número de teléfono no puede estar vacío.');
      return;
    }

    if (!/^\d{8}$/.test(cleanTel)) {
      setErrorMsg('El número de teléfono debe contener exactamente 8 dígitos.');
      return;
    }

    setSavingProfile(true);
    try {
      const response = await api.patch('/auth/perfil', { telefono: cleanTel });
      if (response.data?.success) {
        updateUserData({ telefono: cleanTel });
        setSuccessMsg('Datos de contacto actualizados correctamente.');
        toast?.success('Teléfono actualizado correctamente.');
      } else {
        setErrorMsg(response.data?.message || 'No se pudo actualizar el teléfono.');
      }
    } catch (err) {
      console.error('Error al actualizar perfil:', err);
      setErrorMsg(err.response?.data?.message || 'Error al comunicarse con el servidor.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (!isOpen) return null;

  const changeTab = (id) => {
    setActiveTab(id);
    setErrorMsg('');
    setSuccessMsg('');
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      lockScroll={false}
      size="lg"
      title="Mi cuenta"
      description="Seguridad de su acceso y datos de contacto."
    >
      <div className="space-y-5">
        <Tabs
          label="Secciones de la cuenta"
          idPrefix={TABS_ID}
          value={activeTab}
          onChange={changeTab}
          items={[
            { id: '2fa', label: 'Verificación en dos pasos' },
            { id: 'password', label: 'Contraseña' },
            { id: 'profile', label: 'Datos personales' },
          ]}
        />

        {errorMsg && <Alert tone="danger">{errorMsg}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        <TabPanel id={activeTab} idPrefix={TABS_ID}>
          {/* ============ VERIFICACIÓN EN DOS PASOS (2FA) ============ */}
          {activeTab === '2fa' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 rounded-md border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">Verificación en dos pasos</h3>
                    <Badge tone={mfaEnabled ? 'success' : 'neutral'} dot>{mfaEnabled ? 'Activa' : 'Inactiva'}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {mfaEnabled
                      ? 'Al iniciar sesión le pedimos el código de 6 dígitos de su aplicación de autenticación (Google Authenticator o Microsoft Authenticator).'
                      : 'Además de su contraseña, le pediremos un código de 6 dígitos que genera su teléfono. Así nadie puede entrar solo con su contraseña.'}
                  </p>
                </div>

                {!isConfiguring2fa && !isDisabling2fa && (
                  <div className="shrink-0">
                    {mfaEnabled ? (
                      <Button
                        variant="secondaryDanger"
                        onClick={() => {
                          setIsDisabling2fa(true);
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                      >
                        Desactivar
                      </Button>
                    ) : (
                      <Button icon={QrCode} onClick={handleStart2faSetup} loading={generatingQr} loadingText="Generando código…">
                        Activar
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Desactivar: confirma con la contraseña actual */}
              {isDisabling2fa && (
                <form onSubmit={handleDisable2faSubmit} className="space-y-4 rounded-md border border-line bg-surface-muted p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Desactivar la verificación en dos pasos</h4>
                    <p className="text-sm text-ink-muted">Para confirmar, escriba su contraseña actual.</p>
                  </div>
                  <Field label="Contraseña actual">
                    <PasswordInput
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      visible={showDisablePassword}
                      onVisibleChange={setShowDisablePassword}
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsDisabling2fa(false);
                        setDisablePassword('');
                        setErrorMsg('');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" variant="danger" loading={disablingLoading} loadingText="Desactivando…">
                      Desactivar
                    </Button>
                  </div>
                </form>
              )}

              {/* Activar: QR, clave manual y código de confirmación */}
              {isConfiguring2fa && (
                <div className="space-y-4 rounded-md border border-line bg-surface-muted p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-ink">Configure su aplicación de autenticación</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsConfiguring2fa(false);
                        setQrCodeUrl('');
                        setSecretKey('');
                        setTotpCode('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12">
                    <div className="flex justify-center rounded-md border border-line bg-white p-3 md:col-span-5">
                      {qrCodeUrl ? (
                        <img
                          src={qrCodeUrl}
                          alt="Código QR para agregar la cuenta a su aplicación de autenticación"
                          className="h-44 w-44 object-contain"
                        />
                      ) : (
                        <div className="h-44 w-44" aria-hidden="true" />
                      )}
                    </div>

                    <ol className="space-y-4 text-sm md:col-span-7">
                      <li>
                        <p className="font-medium text-ink">1. Escanee el código</p>
                        <p className="text-ink-muted">Abra Google Authenticator o Microsoft Authenticator y escanee el código QR.</p>
                      </li>
                      <li className="space-y-1.5">
                        <p className="font-medium text-ink">2. O escriba la clave a mano</p>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-white px-3 py-2">
                          <code className="break-all font-mono text-sm tracking-wider text-ink select-all">
                            {secretKey || 'Cargando…'}
                          </code>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={copiedSecret ? Check : Copy}
                            onClick={handleCopySecret}
                            aria-live="polite"
                          >
                            {copiedSecret ? 'Copiada' : 'Copiar'}
                          </Button>
                        </div>
                      </li>
                      <li>
                        <form onSubmit={handleEnable2faSubmit} className="space-y-3">
                          <Field label="3. Escriba el código de 6 dígitos que muestra la aplicación">
                            <Input
                              inputMode="numeric"
                              maxLength={6}
                              value={totpCode}
                              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="000000"
                              autoComplete="one-time-code"
                              autoFocus
                              required
                              className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                            />
                          </Field>
                          <Button
                            type="submit"
                            fullWidth
                            loading={verifyingCode}
                            loadingText="Verificando…"
                            disabled={totpCode.length !== 6}
                          >
                            Activar verificación en dos pasos
                          </Button>
                        </form>
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ CONTRASEÑA ============ */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <Field label="Contraseña actual">
                <PasswordInput
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  visible={showPasswordActual}
                  onVisibleChange={setShowPasswordActual}
                  autoComplete="current-password"
                  required
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nueva contraseña">
                  <PasswordInput
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    visible={showNuevaPassword}
                    onVisibleChange={setShowNuevaPassword}
                    autoComplete="new-password"
                    aria-describedby="requisitos-cambio-password"
                    required
                  />
                </Field>
                <Field label="Confirme la nueva contraseña">
                  <PasswordInput
                    value={confirmarPassword}
                    onChange={(e) => setConfirmarPassword(e.target.value)}
                    visible={showConfirmarPassword}
                    onVisibleChange={setShowConfirmarPassword}
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </div>

              <ul id="requisitos-cambio-password" className="space-y-1 text-xs" aria-label="Requisitos de la contraseña">
                <PasswordRequirement met={checkPassword(nuevaPassword).hasMinLength}>
                  Al menos {PASSWORD_MIN_LENGTH} caracteres
                </PasswordRequirement>
                <PasswordRequirement met={checkPassword(nuevaPassword).hasLetters && checkPassword(nuevaPassword).hasNumbers}>
                  Letras y números
                </PasswordRequirement>
                <PasswordRequirement met={checkPassword(nuevaPassword).hasSpecial}>Un símbolo (!@#$…)</PasswordRequirement>
                <PasswordRequirement met={Boolean(nuevaPassword) && nuevaPassword === confirmarPassword}>
                  Las dos contraseñas coinciden
                </PasswordRequirement>
              </ul>

              <div className="flex justify-end">
                <Button type="submit" loading={savingPassword} loadingText="Guardando…">
                  Cambiar contraseña
                </Button>
              </div>
            </form>
          )}

          {/* ============ DATOS PERSONALES ============ */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfileSubmit} className="space-y-5">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-md border border-line p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-muted">Nombre</dt>
                  <dd className="mt-0.5 text-ink">{user?.nombre_completo || user?.nombre || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">DPI</dt>
                  <dd className="mt-0.5 font-mono text-ink">{user?.cui_dpi || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Código de usuario</dt>
                  <dd className="mt-0.5 font-mono text-ink">{user?.codigo_corporativo || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Rol</dt>
                  <dd className="mt-0.5 text-ink">{user?.rol_nombre || ROLE_LABELS[user?.rol] || user?.rol || '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-muted">Correo electrónico</dt>
                  <dd className="mt-0.5 text-ink">{user?.email || '—'}</dd>
                </div>
              </dl>

              <Field label="Teléfono" hint="8 dígitos, sin espacios ni guiones.">
                <Input
                  inputMode="numeric"
                  maxLength={8}
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
                  autoComplete="tel-national"
                  required
                  className="sm:max-w-xs"
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" loading={savingProfile} loadingText="Guardando…">
                  Guardar teléfono
                </Button>
              </div>
            </form>
          )}
        </TabPanel>
      </div>
    </Modal>
  );
};

export default AccountSettingsModal;
