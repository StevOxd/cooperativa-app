import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UpdateProfileModal } from '../profile/UpdateProfileModal';
import { ChangePasswordModal } from '../profile/ChangePasswordModal';
import { AccountSettingsModal } from '../profile/AccountSettingsModal';
import { GoogleEmailConfigModal } from '../admin/GoogleEmailConfigModal';

/**
 * Acciones de la cuenta (seguridad, correo del sistema, cerrar sesión) y los
 * modales que abren. La barra lateral y la barra superior comparten este hook
 * para que el comportamiento sea el mismo en ambas.
 *
 * `modals` debe renderizarse una sola vez dentro del contenedor que use el hook.
 */
export const useAccountActions = () => {
  const { user, logout } = useAuth();

  const [isUpdateProfileOpen, setIsUpdateProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountSettingsInitialTab, setAccountSettingsInitialTab] = useState('2fa');
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);

  const isAdmin = user?.rol === 'ADMINISTRADOR';

  const openSecurity = () => {
    setAccountSettingsInitialTab('2fa');
    setIsAccountSettingsOpen(true);
  };

  const openEmailConfig = () => setIsEmailConfigOpen(true);

  const modals = (
    <>
      {/* Configuración de la cuenta (2FA, contraseña, perfil) */}
      <AccountSettingsModal
        isOpen={isAccountSettingsOpen}
        onClose={() => setIsAccountSettingsOpen(false)}
        initialTab={accountSettingsInitialTab}
      />

      {/* Configuración y prueba del correo del sistema (solo ADMINISTRADOR) */}
      {isAdmin && (
        <GoogleEmailConfigModal
          isOpen={isEmailConfigOpen}
          onClose={() => setIsEmailConfigOpen(false)}
        />
      )}

      {/* Modales de perfil y contraseña legados (por compatibilidad) */}
      <UpdateProfileModal
        isOpen={isUpdateProfileOpen}
        onClose={() => setIsUpdateProfileOpen(false)}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );

  return { user, isAdmin, logout, openSecurity, openEmailConfig, modals };
};

export default useAccountActions;
