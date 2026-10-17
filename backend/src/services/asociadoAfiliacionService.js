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
const { validateCui, validateAge18, validateMinimumAmount } = require('../middlewares/validationMiddleware');
const { decidirAccesoPortal } = require('../utils/accesoPortal');
const { estadoPorFalloDelBanco } = require('../utils/errores');

class AsociadoAfiliacionService {
  /**
   * Valida los nombres y la fecha de nacimiento de una persona que la cooperativa todavía no tiene.
   * A una persona ya registrada (del personal) no se le piden: se usan los suyos.
   *
   * @param {{primer_nombre?: string, segundo_nombre?: string, primer_apellido?: string, segundo_apellido?: string, fecha_nacimiento?: string}} datos
   * @throws {Error} con `statusCode` 400 y el primer dato que no es válido.
   */
  validarIdentidadNueva({ primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento }) {
    const fallar = (mensaje) => {
      throw Object.assign(new Error(mensaje), { statusCode: 400 });
    };
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!primer_nombre || !primer_apellido) {
      fallar('Los campos CUI/DPI, Nombres, Apellidos y Monto de Aportación son obligatorios.');
    }
    if (!nameRegex.test(primer_nombre.trim()) || primer_nombre.trim().length < 2) {
      fallar('El primer nombre es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).');
    }
    if (segundo_nombre && !nameRegex.test(segundo_nombre.trim())) {
      fallar('El segundo nombre solo puede contener letras y espacios.');
    }
    if (!nameRegex.test(primer_apellido.trim()) || primer_apellido.trim().length < 2) {
      fallar('El primer apellido es obligatorio (mínimo 2 letras, solo caracteres alfabéticos).');
    }
    if (segundo_apellido && !nameRegex.test(segundo_apellido.trim())) {
      fallar('El segundo apellido solo puede contener letras y espacios.');
    }
    if (!fecha_nacimiento) fallar('La fecha de nacimiento es obligatoria.');
    if (!validateAge18(fecha_nacimiento).valid) {
      fallar('Debe ser mayor de edad (mínimo 18 años cumplidos) para afiliarse como asociado titular.');
    }
  }

  /**
   * Procesa la afiliación presencial de un asociado en ventanilla,
   * incluyendo la creación de persona, asociado, usuario, MFA, cuenta y depósito inicial.
   *
   * @async
   * @param {object} params
   * @param {object} params.payload - Datos del formulario de afiliación.
   * @param {number} params.operadorId - id_usuario del operador que registra la afiliación.
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
    if (!cui_dpi || !monto_aportacion) {
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

    // 1.1 Un DPI ya registrado solo se afilia si es del personal (issue #32): se usan los datos que ya tiene
    //    la cooperativa y solo se actualiza el teléfono. Un asociado no se afilia dos veces.
    const personaPreviaRes = await pool.query(
      `SELECT p.id_persona, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.direccion,
              TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
              (a.id_asociado IS NOT NULL) AS es_asociado,
              EXISTS (SELECT 1 FROM usuarios u WHERE u.id_persona = p.id_persona AND u.id_rol <> 3) AS es_personal,
              (SELECT u.email FROM usuarios u WHERE u.id_persona = p.id_persona AND u.id_rol <> 3) AS email_personal
       FROM personas p
       LEFT JOIN asociados a ON a.id_persona = p.id_persona
       WHERE p.cui_dpi = $1`,
      [cuiLimpio]
    );
    const personaPrevia = personaPreviaRes.rows[0] || null;
    if (personaPrevia?.es_asociado) {
      const error = new Error('Esta persona ya es asociada de la cooperativa.');
      error.statusCode = 409;
      throw error;
    }
    if (personaPrevia && !personaPrevia.es_personal) {
      const error = new Error('Ya existe una persona registrada con este CUI / DPI. Consulte al administrador.');
      error.statusCode = 409;
      throw error;
    }

    // Nombres y fecha de nacimiento del formulario: solo para una persona nueva. La del personal se afilia
    // con los que ya tiene registrados.
    if (!personaPrevia) {
      this.validarIdentidadNueva({ primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento });
    } else if (!validateAge18(personaPrevia.fecha_nacimiento).valid) {
      const error = new Error('Debe ser mayor de edad (mínimo 18 años cumplidos) para afiliarse como asociado titular.');
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

    // Acceso al portal (issue #26): solo si el correo de la cooperativa funciona. Sin acceso, el correo es opcional.
    const acceso = await decidirAccesoPortal(crear_acceso_portal, email);
    const cleanEmail = acceso.email;

    // Mínimo inclusivo: Q100.00 se acepta
    const montoCheck = validateMinimumAmount(monto_aportacion, constants.FINANCIERO.MONTO_MINIMO_APORTACION);
    if (!montoCheck.valid) {
      const error = new Error(`La aportación inicial de membresía no puede ser inferior a Q${constants.FINANCIERO.MONTO_MINIMO_APORTACION.toFixed(2)}.`);
      error.statusCode = 400;
      throw error;
    }
    const montoAporte = montoCheck.value;

    // Identidad del asociado: la que ya tiene la cooperativa (personal) o la del formulario
    const identidad = personaPrevia
      ? {
          primer_nombre: personaPrevia.primer_nombre,
          segundo_nombre: personaPrevia.segundo_nombre,
          primer_apellido: personaPrevia.primer_apellido,
          segundo_apellido: personaPrevia.segundo_apellido,
          direccion: personaPrevia.direccion,
          fecha_nacimiento: personaPrevia.fecha_nacimiento,
        }
      : {
          primer_nombre: primer_nombre.trim(),
          segundo_nombre: segundo_nombre?.trim() || null,
          primer_apellido: primer_apellido.trim(),
          segundo_apellido: segundo_apellido?.trim() || null,
          direccion: direccion?.trim() || null,
          fecha_nacimiento,
        };

    // 2.1 Verificar unicidad de Correo Electrónico en usuarios (solo si se crea el acceso: sin usuario no se guarda)
    if (acceso.crear) {
      if (personaPrevia && cleanEmail === personaPrevia.email_personal.toLowerCase()) {
        const error = new Error('Ese correo es del usuario del personal de esta persona. Su usuario de asociado lleva un correo distinto.');
        error.statusCode = 409;
        error.code = 'CORREO_DEL_PERSONAL';
        throw error;
      }

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

      // 4.2 Persona: la del personal (solo se actualiza su teléfono) o una nueva
      const personaRes = personaPrevia
        ? await client.query(
          'UPDATE personas SET telefono = $1 WHERE id_persona = $2 RETURNING id_persona, nombre_completo',
          [cleanTel, personaPrevia.id_persona]
        )
        : await client.query(
          `INSERT INTO personas (
             cui_dpi, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
             telefono, direccion, fecha_nacimiento
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id_persona, nombre_completo`,
          [
            cuiLimpio,
            identidad.primer_nombre,
            identidad.segundo_nombre,
            identidad.primer_apellido,
            identidad.segundo_apellido,
            cleanTel,
            identidad.direccion,
            identidad.fecha_nacimiento || null,
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
           VALUES ($1, 3, $2, $3, $4, 'ACTIVO', TRUE)`,
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
          primer_nombre: identidad.primer_nombre,
          segundo_nombre: identidad.segundo_nombre,
          primer_apellido: identidad.primer_apellido,
          segundo_apellido: identidad.segundo_apellido,
          telefono: cleanTel,
          direccion: identidad.direccion,
          email: cleanEmail,
          fecha_nacimiento: identidad.fecha_nacimiento,
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
          error.statusCode = estadoPorFalloDelBanco(debitRes.status);
          throw error;
        }
        debitoRealizado = true;
      }

      try {
        await client.query('COMMIT');
      } catch (commitError) {
        // El débito ya salió del banco: se devuelve para no dejar el dinero en el aire (mismo problema del issue #31)
        if (debitoRealizado) {
          // acreditarCuenta no lanza errores: devuelve success false
          const reversion = await bancoApiService.acreditarCuenta({
            numero_cuenta: cuentaBancoEb,
            monto: montoAporte,
            concepto: 'Reversión de aporte: la afiliación no se completó',
            referencia: `REV-${referenciaBanco}`,
          });
          if (!reversion.success) {
            console.error(`[AFILIACION] No se pudo revertir el débito ${referenciaBanco}:`, reversion.message);
          }
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
