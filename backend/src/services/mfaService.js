const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

/**
 * Servicio de Seguridad: Autenticación Multifactor (MFA / 2FA - TOTP RFC 6238)
 */
class MfaService {
  /**
   * Genera un secreto criptográfico Base32 y su correspondiente código QR en DataURL
   * para aplicaciones de autenticación estándar (Google Authenticator, Microsoft Authenticator, Authy).
   *
   * @param {string} userIdentifier - Código corporativo o correo del usuario para rotular la cuenta.
   * @returns {Promise<{ base32: string, otpauth_url: string, qr_code_url: string }>}
   */
  async generateMfaSecret(userIdentifier) {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `Cooperativa (${userIdentifier})`,
      issuer: 'Cooperativa Corporación Bancaria',
    });

    // Generar imagen QR en formato Data URL PNG (base64)
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 250,
      color: {
        dark: '#0c4a6e',
        light: '#ffffff',
      },
    });

    return {
      base32: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_code_url: qrCodeUrl,
    };
  }

  /**
   * Valida el código de 6 dígitos ingresado por el usuario contra su secreto Base32.
   *
   * @param {string} secret - Secreto Base32 almacenado en la base de datos.
   * @param {string} token - Código de 6 dígitos enviado por el usuario.
   * @returns {boolean} true si el token es válido y vigente, false en caso contrario.
   */
  verifyTotp(secret, token) {
    if (!secret || !token) return false;

    const tokenLimpio = String(token).trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(tokenLimpio)) return false;

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: tokenLimpio,
      window: 1,
    });
  }
}

module.exports = new MfaService();
