const crypto = require('crypto');
const { pool } = require('../config/db');
const mailerService = require('./mailerService');

/**
 * Códigos de 6 dígitos para verificar el correo en la afiliación en línea (issue #25).
 *
 * - Se guarda un hash del código, nunca el código, y no se escribe en los registros.
 * - Vence a los 10 minutos, admite 5 intentos y se consume al completar la afiliación.
 * - Reenvío a los 60 segundos y como máximo 5 envíos por hora para el mismo correo.
 * - En desarrollo, sin Gmail, se puede usar un código fijo (CODIGO_VERIFICACION_DEV);
 *   nunca funciona con NODE_ENV=production.
 */
const VIGENCIA_MINUTOS = 10;
const MAX_INTENTOS = 5;
const ESPERA_REENVIO_SEGUNDOS = 60;
const MAX_ENVIOS_POR_HORA = 5;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Error con estado HTTP y código para el frontend. Los códigos empiezan con CODIGO_ o CORREO_. */
class CodigoVerificacionError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const normalizarEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const hashCodigo = (email, codigo) =>
  crypto.createHmac('sha256', `${process.env.JWT_SECRET}:codigo-correo`).update(`${email}:${codigo}`).digest('hex');

const codigoDesarrollo = () => {
  const codigo = process.env.CODIGO_VERIFICACION_DEV;
  if (process.env.NODE_ENV === 'production' || !codigo || !/^\d{6}$/.test(codigo)) return null;
  return codigo;
};

/**
 * Genera un código, lo envía al correo y guarda su hash.
 *
 * @param {string} emailRaw
 * @returns {Promise<{reenviar_en: number}>}
 * @throws {CodigoVerificacionError}
 */
const enviarCodigo = async (emailRaw) => {
  const email = normalizarEmail(emailRaw);
  if (!EMAIL_REGEX.test(email)) {
    throw new CodigoVerificacionError(400, 'CORREO_INVALIDO', 'Revise el correo. Debe verse así: nombre@correo.com.');
  }

  const previoRes = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - enviado_en)) AS segundos_desde_envio,
            (ventana_inicio > CURRENT_TIMESTAMP - INTERVAL '1 hour') AS ventana_vigente,
            envios_hora
     FROM codigos_verificacion_correo WHERE email = $1`,
    [email]
  );
  const previo = previoRes.rows[0];
  if (previo) {
    const segundos = Number(previo.segundos_desde_envio);
    if (segundos < ESPERA_REENVIO_SEGUNDOS) {
      const espera = Math.ceil(ESPERA_REENVIO_SEGUNDOS - segundos);
      throw new CodigoVerificacionError(429, 'CODIGO_ESPERE_REENVIO', `Espere ${espera} segundos para pedir otro código.`, {
        reenviar_en: espera,
      });
    }
    if (previo.ventana_vigente && previo.envios_hora >= MAX_ENVIOS_POR_HORA) {
      throw new CodigoVerificacionError(
        429,
        'CODIGO_DEMASIADOS_ENVIOS',
        'Ya pidió varios códigos para este correo. Intente de nuevo en una hora.'
      );
    }
  }

  const codigoDev = codigoDesarrollo();
  if (!codigoDev && !mailerService.isAvailable()) {
    throw new CodigoVerificacionError(
      503,
      'CORREO_NO_DISPONIBLE',
      'En este momento no podemos enviar el código. Intente más tarde o acuda a una agencia con su DPI.'
    );
  }

  const codigo = codigoDev || String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  if (!codigoDev) {
    const mailRes = await mailerService.sendVerificationCodeEmail({ to: email, codigo, minutos: VIGENCIA_MINUTOS });
    if (!mailerService.wasSent(mailRes)) {
      throw new CodigoVerificacionError(
        502,
        'CORREO_NO_ENVIADO',
        'No pudimos enviar el código a ese correo. Revise que esté bien escrito o intente más tarde.'
      );
    }
  }

  await pool.query(
    `INSERT INTO codigos_verificacion_correo (email, codigo_hash, expira_en, intentos, enviado_en, envios_hora, ventana_inicio)
     VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3), 0, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE SET
       codigo_hash = EXCLUDED.codigo_hash,
       expira_en = EXCLUDED.expira_en,
       intentos = 0,
       enviado_en = CURRENT_TIMESTAMP,
       envios_hora = CASE WHEN codigos_verificacion_correo.ventana_inicio > CURRENT_TIMESTAMP - INTERVAL '1 hour'
                          THEN codigos_verificacion_correo.envios_hora + 1 ELSE 1 END,
       ventana_inicio = CASE WHEN codigos_verificacion_correo.ventana_inicio > CURRENT_TIMESTAMP - INTERVAL '1 hour'
                             THEN codigos_verificacion_correo.ventana_inicio ELSE CURRENT_TIMESTAMP END`,
    [email, hashCodigo(email, codigo), VIGENCIA_MINUTOS]
  );

  // Limpieza de códigos vencidos hace más de una hora (ya no cuentan para el límite de envíos).
  await pool.query(
    `DELETE FROM codigos_verificacion_correo
     WHERE expira_en < CURRENT_TIMESTAMP AND ventana_inicio < CURRENT_TIMESTAMP - INTERVAL '1 hour'`
  );

  return { reenviar_en: ESPERA_REENVIO_SEGUNDOS };
};

/**
 * Comprueba el código sin consumirlo. Un intento fallido queda registrado aunque la solicitud
 * termine con error, por eso se hace fuera de la transacción de la afiliación.
 *
 * @throws {CodigoVerificacionError}
 */
const verificarCodigo = async (emailRaw, codigo) => {
  const email = normalizarEmail(emailRaw);
  const res = await pool.query(
    `SELECT codigo_hash, intentos, (expira_en > CURRENT_TIMESTAMP) AS vigente
     FROM codigos_verificacion_correo WHERE email = $1`,
    [email]
  );
  const registro = res.rows[0];

  if (!registro || !registro.vigente) {
    throw new CodigoVerificacionError(400, 'CODIGO_VENCIDO', 'El código venció o no se ha pedido. Pida un código nuevo.');
  }
  if (registro.intentos >= MAX_INTENTOS) {
    throw new CodigoVerificacionError(400, 'CODIGO_BLOQUEADO', 'Se agotaron los intentos de este código. Pida un código nuevo.');
  }

  const esperado = Buffer.from(registro.codigo_hash, 'hex');
  const recibido = Buffer.from(hashCodigo(email, String(codigo || '').trim()), 'hex');
  if (!crypto.timingSafeEqual(esperado, recibido)) {
    const intentoRes = await pool.query(
      'UPDATE codigos_verificacion_correo SET intentos = intentos + 1 WHERE email = $1 RETURNING intentos',
      [email]
    );
    const restantes = Math.max(MAX_INTENTOS - intentoRes.rows[0].intentos, 0);
    if (restantes === 0) {
      throw new CodigoVerificacionError(400, 'CODIGO_BLOQUEADO', 'El código no es correcto y se agotaron los intentos. Pida un código nuevo.');
    }
    throw new CodigoVerificacionError(
      400,
      'CODIGO_INCORRECTO',
      `El código no es correcto. Le ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`
    );
  }
};

/**
 * Consume el código dentro de la transacción de la afiliación: si la transacción se deshace,
 * el código sigue vigente. Si otra solicitud ya lo usó, falla.
 *
 * @param {import('pg').PoolClient} client - Cliente con la transacción abierta.
 * @throws {CodigoVerificacionError}
 */
const consumirCodigo = async (client, emailRaw) => {
  const res = await client.query(
    `DELETE FROM codigos_verificacion_correo
     WHERE email = $1 AND intentos < $2 AND expira_en > CURRENT_TIMESTAMP
     RETURNING email`,
    [normalizarEmail(emailRaw), MAX_INTENTOS]
  );
  if (res.rows.length === 0) {
    throw new CodigoVerificacionError(400, 'CODIGO_VENCIDO', 'El código venció o ya se usó. Pida un código nuevo.');
  }
};

/** Respuesta JSON para un CodigoVerificacionError. */
const responderError = (res, error) =>
  res.status(error.status).json({ success: false, error: error.code, message: error.message, ...error.extra });

module.exports = {
  CodigoVerificacionError,
  enviarCodigo,
  verificarCodigo,
  consumirCodigo,
  responderError,
};
