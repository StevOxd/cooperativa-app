import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AccountSettingsModal } from '../profile/AccountSettingsModal';
import { GoogleEmailConfigModal } from '../admin/GoogleEmailConfigModal';
import { StaffAffiliationModal } from '../profile/StaffAffiliationModal';

/**
 * Acciones de la cuenta (seguridad, correo del sistema, afiliarse, cerrar sesión) y los
 * modales que abren. La barra lateral y la barra superior comparten este hook
 * para que el comportamiento sea el mismo en ambas.
 *
 * `modals` debe renderizarse una sola vez dentro del contenedor que use el hook.
 */
export const useAccountActions = () => {
  const { user, logout } = useAuth();

  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountSettingsInitialTab, setAccountSettingsInitialTab] = useState('2fa');
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);
  const [isStaffAffiliationOpen, setIsStaffAffiliationOpen] = useState(false);

  const isAdmin = user?.rol === 'ADMINISTRADOR';

  const openSecurity = () => {
    setAccountSettingsInitialTab('2fa');
    setIsAccountSettingsOpen(true);
  };

  const openEmailConfig = () => setIsEmailConfigOpen(true);
  // Afiliación del personal como asociado (issue #32)
  const openStaffAffiliation = () => setIsStaffAffiliationOpen(true);

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

      <StaffAffiliationModal
        isOpen={isStaffAffiliationOpen}
        onClose={() => setIsStaffAffiliationOpen(false)}
      />
    </>
  );

  return { user, isAdmin, logout, openSecurity, openEmailConfig, openStaffAffiliation, modals };
};

export default useAccountActions;
