/**
 * @file asociadoAfiliacionService.js
 * @description Servicio de dominio para la formalización presencial de afiliaciones a la cooperativa.
 * Desacopla la lógica de negocio, validaciones estatutarias, débito ACH y auditoría del controlador HTTP.
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const constants = require('../config/constants');
const mailerService = require('./mailerService');
const bancoApiService = require('./bancoApiService');
const { getNextCorporateCode, resolvePrefix, generateSecureRandomPassword } = require('../utils/codeGenerator');
const { validateCui, validateAge18, validatePositiveAmount } = require('../middlewares/validationMiddleware');
const { decidirAccesoPortal } = require('../utils/accesoPortal');

class AsociadoAfiliacionService {
  /**
   * Procesa la afiliación presencial de un asociado en ventanilla,
   * incluyendo la creación de persona, asociado, usuario, MFA, cuenta y depósito inicial.
   *
   * @async
   * @param {object} params
   * @param {object} params.payload - Datos del formulario de afiliación.
   * @param {number} params.operadorId - ID de persona del operador que registra la afiliación.
   * @returns {Promise<object>} Datos del asociado y cuenta creados.
   */
  async registrarAfiliacionPresencial({ payload, operadorId }) {
    const {
      cui_dpi,
      primer_nombre,
      segundo_nombre,
      primer_apellido,
      segundo_apellido,
      telefono,
      direccion,
      fecha_nacimiento,
      email,
      monto_aportacion,
      metodo_pago,
      banco_nombre,
      numero_cuenta_bancaria,
      tipo_asociado,
      crear_acceso_portal,
    } = payload;

    // 1. Validaciones perimetrales
    if (!cui_dpi || !primer_nombre || !primer_apellido || !monto_aportacion) {
      const error = new Error('Los campos CUI/DPI, Nombres, Apellidos y Monto de Aportación son obligatorios.');
      error.statusCode = 400;
      throw error;
    }

    const cuiCheck = validateCui(cui_dpi);
    if (!cuiCheck.valid) {
      const error = new Error('El CUI / DPI debe tener exactamente 13 dígitos numéricos.');
      error.statusCode = 400;
      throw error;
    }
    const cuiLimpio = cuiCheck.clean;

    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!nameRegex.test(primer_nombre.trim()) || primer_nombre.trim().length < 2) {
      const error = new Error('El primer nombre es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).');
      error.statusCode = 400;
      throw error;
    }
    if (segundo_nombre && !nameRegex.test(segundo_nombre.trim())) {
      const error = new Error('El segundo nombre solo puede contener letras y espacios.');
      error.statusCode = 400;
      throw error;
    }
    if (!nameRegex.test(primer_apellido.trim()) || primer_apellido.trim().length < 2) {
      const error = new Error('El primer apellido es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).');
      error.statusCode = 400;
      throw error;
    }
    if (segundo_apellido && !nameRegex.test(segundo_apellido.trim())) {
      const error = new Error('El segundo apellido solo puede contener letras y espacios.');
      error.statusCode = 400;
      throw error;
    }

    if (!telefono) {
      const error = new Error('El número de teléfono es obligatorio.');
      error.statusCode = 400;
      throw error;
    }
    const cleanTel = telefono.trim().replace(/\D/g, '');
    if (cleanTel.length !== 8) {
      const error = new Error('El número de teléfono debe contener exactamente 8 dígitos numéricos.');
      error.statusCode = 400;
      throw error;
    }

    if (!fecha_nacimiento) {
      const error = new Error('La fecha de nacimiento es obligatoria.');
      error.statusCode = 400;
      throw error;
    }
    const ageCheck = validateAge18(fecha_nacimiento);
    if (!ageCheck.valid) {
      const error = new Error('Debe ser mayor de edad (mínimo 18 años cumplidos) para afiliarse como asociado titular.');
      error.statusCode = 400;
      throw error;
    }

    // Acceso al portal (issue #26): solo si el correo de la cooperativa funciona. Sin acceso, el correo es opcional.
    const acceso = await decidirAccesoPortal(crear_acceso_portal, email);
    const cleanEmail = acceso.email;

    const montoCheck = validatePositiveAmount(monto_aportacion, constants.FINANCIERO.MONTO_MINIMO_APORTACION, 'monto_aportacion');
    if (!montoCheck.valid) {
      const error = new Error(`La aportación inicial de membresía no puede ser inferior a Q${constants.FINANCIERO.MONTO_MINIMO_APORTACION.toFixed(2)}.`);
      error.statusCode = 400;
      throw error;
    }
    const montoAporte = montoCheck.value;

    // 2. Verificar unicidad de CUI
    const checkCui = await pool.query('SELECT cui_dpi FROM personas WHERE cui_dpi = $1', [cuiLimpio]);
    if (checkCui.rows.length > 0) {
      const error = new Error('Ya existe una persona registrada con este CUI / DPI.');
      error.statusCode = 409;
      throw error;
    }

    // 2.1 Verificar unicidad de Correo Electrónico en usuarios (solo si se crea el acceso: sin usuario no se guarda)
    if (acceso.crear) {
      const checkEmail = await pool.query('SELECT email FROM usuarios WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
      if (checkEmail.rows.length > 0) {
        const error = new Error('El correo electrónico ya se encuentra registrado en el sistema. Ingrese un correo diferente.');
        error.statusCode = 409;
        throw error;
      }

      // 2.2 Verificar si existe solicitud en trámite con este correo
      const checkSolEmail = await pool.query(
        "SELECT numero_caso FROM solicitudes_afiliacion_agencia WHERE LOWER(email) = LOWER($1) AND estado IN ('PENDIENTE_AGENCIA', 'EN_PROCESO')",
        [cleanEmail]
      );
      if (checkSolEmail.rows.length > 0) {
        const error = new Error(`Ya existe una solicitud de afiliación en trámite con este correo (${checkSolEmail.rows[0].numero_caso}).`);
        error.statusCode = 409;
        throw error;
      }
    }

    // 3. Transacción ACID para persistir el asociado completo
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 3.1 Detección automática por DPI en Core Bancario (EB para Empleado Bancario, EX para Externo)
      let tipoAsociadoDeterminado = 'EX';
      try {
        const bcoDpiCheck = await bancoApiService.verificarDpi(cuiLimpio);
        if (bcoDpiCheck.success && bcoDpiCheck.existe_en_banco && bcoDpiCheck.cliente?.tipo_cliente === 'EMPLEADO_PLANILLA') {
          tipoAsociadoDeterminado = 'EB';
        }
      } catch (checkErr) {
        console.warn('[AFILIACION] Error al verificar tipo de cliente en banco:', checkErr.message);
      }

      // 3.2 El depósito no entra a la cooperativa en efectivo (issue #26, criterio del negocio):
      //     - EX (externo): el efectivo se deposita en una cuenta de ahorro nueva del banco, que se abre
      //       obligatoriamente. La cuenta de la cooperativa se abre después desde el resumen o en ventanilla.
      //     - EB (empleado del banco): no se abre otra cuenta en el banco; el aporte se debita de una de sus
      //       cuentas y se acredita a una cuenta de la cooperativa.
      //     La operación con el banco va al final, justo antes del COMMIT.
      const cuentaBancoEb = typeof numero_cuenta_bancaria === 'string' ? numero_cuenta_bancaria.trim() : '';
      if (tipoAsociadoDeterminado === 'EB' && !cuentaBancoEb) {
        const error = new Error('Elija la cuenta del banco del asociado de la que se debitará el aporte.');
        error.statusCode = 400;
        throw error;
      }

      // 4.2 Inserción de Persona
      const personaRes = await client.query(
        `INSERT INTO personas (
           cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
           telefono, direccion, fecha_nacimiento
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_persona, nombre_completo`,
        [
          cuiLimpio,
          primer_nombre.trim(),
          segundo_nombre?.trim() || null,
          primer_apellido.trim(),
          segundo_apellido?.trim() || null,
          cleanTel,
          direccion?.trim() || null,
          fecha_nacimiento || null,
        ]
      );
      const persona = personaRes.rows[0];

      // 4.3 Inserción de Membresía de Asociado
      const asociadoRes = await client.query(
        `INSERT INTO asociados (id_persona, fecha_ingreso, estado_asociado)
         VALUES ($1, CURRENT_DATE, 'ACTIVO')
         RETURNING id_asociado`,
        [persona.id_persona]
      );
      const asociado = asociadoRes.rows[0];

      // 4.4 Aprovisionamiento de Usuario y Credenciales (solo con acceso al portal)
      const emailFinal = cleanEmail;
      let nextCode = null;
      let generatedPassword = null;
      if (acceso.crear) {
        const prefix = resolvePrefix('ASOCIADO', tipoAsociadoDeterminado);
        nextCode = await getNextCorporateCode(client, prefix);

        generatedPassword = generateSecureRandomPassword(12);
        const defaultSalt = await bcrypt.genSalt(10);
        const defaultPasswordHash = await bcrypt.hash(generatedPassword, defaultSalt);

        await client.query(
          `INSERT INTO usuarios (id_persona, id_rol, codigo_corporativo, email, password_hash, estado, debe_cambiar_password)
           VALUES ($1, 3, $2, $3, $4, 'ACTIVO', TRUE)
           ON CONFLICT (id_persona) DO UPDATE SET password_hash = $4, debe_cambiar_password = TRUE`,
          [persona.id_persona, nextCode, emailFinal, defaultPasswordHash]
        );
      }

      // 4.7 EB: cuenta de ahorro en la cooperativa con el aporte debitado del banco
      let cuentaAhorro = null;
      const referenciaBanco = `AFIL-VENT-${asociado.id_asociado}-${Date.now()}`;
      if (tipoAsociadoDeterminado === 'EB') {
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const numeroCuentaAhorro = `CTA-AHORR-${String(asociado.id_asociado).padStart(3, '0')}${randomSuffix}`;
        const cuentaRes = await client.query(
          `INSERT INTO cuentas (numero_cuenta, id_asociado, id_tipo_cuenta, saldo_disponible, saldo_reserva, estado)
           VALUES ($1, $2, 2, $3, 0.00, 'ACTIVA')
           RETURNING id_cuenta, numero_cuenta, saldo_disponible`,
          [numeroCuentaAhorro, asociado.id_asociado, montoAporte]
        );
        cuentaAhorro = cuentaRes.rows[0];
        await client.query(
          `INSERT INTO transacciones (
             id_cuenta, tipo_transaccion, monto, saldo_anterior, saldo_nuevo,
             referencia, id_usuario_registra
           ) VALUES ($1, 'DEPOSITO', $2, 0.00, $2, $3, $4)`,
          [cuentaAhorro.id_cuenta, montoAporte, `Aporte inicial debitado de la cuenta del banco ${cuentaBancoEb}`, operadorId || null]
        );
      }

      // 4.8 Operación con el banco (al final): EX abre su cuenta con el efectivo; EB debita el aporte.
      let cuentaBancariaAperturada = null;
      let debitoRealizado = false;
      if (tipoAsociadoDeterminado === 'EX') {
        const bcoRes = await bancoApiService.aperturarCuentaBancaria({
          cui_dpi: cuiLimpio,
          primer_nombre: primer_nombre.trim(),
          segundo_nombre: segundo_nombre?.trim() || null,
          primer_apellido: primer_apellido.trim(),
          segundo_apellido: segundo_apellido?.trim() || null,
          telefono: cleanTel,
          direccion: direccion?.trim() || null,
          email: cleanEmail,
          fecha_nacimiento: fecha_nacimiento,
          tipo_cuenta: 'AHORRO',
          monto_inicial: montoAporte,
          referencia: referenciaBanco,
        });
        if (!bcoRes.success || !bcoRes.data) {
          const error = new Error(bcoRes.message || 'No se pudo abrir la cuenta de ahorro en el banco. No se registró la afiliación.');
          error.statusCode = 502;
          throw error;
        }
        cuentaBancariaAperturada = bcoRes.data.numero_cuenta;
      } else {
        const debitRes = await bancoApiService.debitarCuenta({
          numero_cuenta: cuentaBancoEb,
          cui_dpi: cuiLimpio, // el banco rechaza cuentas de otra persona
          monto: montoAporte,
          concepto: 'Aporte inicial de afiliación a la cooperativa',
          referencia: referenciaBanco,
        });
        if (!debitRes.success || debitRes.status !== 200) {
          const error = new Error(
            debitRes.status === 403
              ? 'La cuenta del banco no pertenece a este asociado.'
              : debitRes.message || 'No se pudo debitar la cuenta del banco. No se registró la afiliación.'
          );
          error.statusCode = debitRes.status === 403 ? 403 : 400;
          throw error;
        }
        debitoRealizado = true;
      }

      try {
        await client.query('COMMIT');
      } catch (commitError) {
        // El débito ya salió del banco: se devuelve para no dejar el dinero en el aire (mismo problema del issue #31)
        if (debitoRealizado) {
          await bancoApiService.acreditarCuenta({
            numero_cuenta: cuentaBancoEb,
            monto: montoAporte,
            concepto: 'Reversión de aporte: la afiliación no se completó',
            referencia: `REV-${referenciaBanco}`,
          }).catch((revError) => console.error('[AFILIACION] No se pudo revertir el débito:', revError.message));
        }
        throw commitError;
      }

      // 4.9 Despacho de Correo Institucional con Credenciales y QR de 2FA, después del COMMIT:
      // si no sale, el asociado queda registrado y se avisa al operador.
      let correoEnviado = false;
      if (acceso.crear) try {
        const mailRes = await mailerService.sendAccountCredentialsEmail({
          to: emailFinal,
          nombre: persona.nombre_completo,
          codigoCorporativo: nextCode,
          password: generatedPassword,
          rolNombre: 'ASOCIADO COOPERATIVISTA',
        });
        correoEnviado = mailerService.wasSent(mailRes);
      } catch (mailErr) {
        console.warn('Aviso: No se pudo enviar el correo de credenciales:', mailErr.message);
      }

      return {
        acceso_portal: acceso.crear,
        correo_enviado: correoEnviado,
        id_asociado: asociado.id_asociado,
        id_persona: persona.id_persona,
        cui_dpi: cuiLimpio,
        nombre_completo: persona.nombre_completo,
        usuario: nextCode,
        email: emailFinal,
        numero_cuenta: cuentaAhorro ? cuentaAhorro.numero_cuenta : null,
        saldo_inicial: montoAporte,
        metodo_pago: tipoAsociadoDeterminado === 'EB' ? 'DEBITO_BANCO' : 'EFECTIVO_VENTANILLA',
        mfa_enabled: false,
        cuenta_bancaria_creada: cuentaBancariaAperturada,
        numero_cuenta_bancaria_asociada: tipoAsociadoDeterminado === 'EB' ? cuentaBancoEb : null,
        tipo_asociado: tipoAsociadoDeterminado,
      };
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  }
}

module.exports = new AsociadoAfiliacionService();
