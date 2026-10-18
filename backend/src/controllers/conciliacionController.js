const db = require('../config/db');
const bancoApiService = require('../services/bancoApiService');
const { reintentarReversion } = require('../services/reversionesService');
const { esAutoatencion } = require('../services/segregacionService');
const { RESPUESTA_AUTOATENCION } = require('../middlewares/segregacion');
const { FINANCIERO } = require('../config/constants');
const { respuestaDeError } = require('../utils/errores');

/**
 * Conciliación con el banco (issues #64 y #66): el administrador revisa los depósitos en ventanilla y las
 * reversiones que quedaron pendientes, y los cierra según lo que diga el banco.
 */

const ESTADOS_DEPOSITO = ['PENDIENTE', 'ACREDITADO', 'RECHAZADO', 'SIN_CONFIRMAR', 'REVERTIDO'];
const LIMITE = 200;
// Un depósito se concilia pasado este tiempo: antes, su llamada al banco puede seguir en curso (el banco no lo
// tiene todavía y quedaría rechazado aunque luego entre)
const { MINUTOS_PARA_CONCILIAR } = FINANCIERO;

/** Fecha AAAA-MM-DD que existe en el calendario (no 2026-02-30). */
const fechaValida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
};
const ETIQUETA_ESTADO = {
  PENDIENTE: 'pendiente',
  SIN_CONFIRMAR: 'sin confirmar',
  ACREDITADO: 'acreditado',
  RECHAZADO: 'rechazado',
  REVERTIDO: 'revertido',
};

/**
 * Lista los depósitos en ventanilla a cuentas del banco, los que esperan conciliación primero.
 *
 * @async
 * @route GET /api/conciliacion/depositos
 * @param {import('express').Request} req - `req.query`: `estado`, `desde` y `hasta` (AAAA-MM-DD) y `texto`
 *   (DPI, cuenta, referencia, código o nombre del operador).
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con los depósitos (hasta 200, `limitado` si hay más) y el
 *   resumen por estado; 400; 500.
 */
const listarDepositos = async (req, res) => {
  try {
    const { estado, desde, hasta, texto } = req.query;
    const filtros = [];
    const params = [];
    if (estado) {
      if (!ESTADOS_DEPOSITO.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Ese estado no existe.' });
      }
      params.push(estado);
      filtros.push(`d.estado = $${params.length}`);
    }
    for (const [valor, operador] of [[desde, '>='], [hasta, '<']]) {
      if (!valor) continue;
      if (!fechaValida(valor)) {
        return res.status(400).json({ success: false, message: 'Revise las fechas (AAAA-MM-DD).' });
      }
      params.push(valor);
      // Días completos en hora de Guatemala; «hasta» incluye ese día
      filtros.push(`d.fecha_deposito ${operador} ($${params.length}::date ${operador === '<' ? "+ INTERVAL '1 day'" : ''})::timestamp AT TIME ZONE 'America/Guatemala'`);
    }
    if (texto && String(texto).trim()) {
      // % y _ se buscan como texto, no como comodines
      params.push(`%${String(texto).trim().toLowerCase().replace(/[\\%_]/g, '\\$&')}%`);
      filtros.push(`(d.titular_cui LIKE $${params.length} ESCAPE '\\' OR LOWER(d.numero_cuenta_bancaria) LIKE $${params.length} ESCAPE '\\'
                     OR LOWER(d.referencia) LIKE $${params.length} ESCAPE '\\' OR LOWER(u.codigo_corporativo) LIKE $${params.length} ESCAPE '\\'
                     OR LOWER(CONCAT(p.primer_nombre, ' ', p.primer_apellido)) LIKE $${params.length} ESCAPE '\\')`);
    }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const depositos = await db.query(
      `SELECT d.id_deposito, d.referencia, d.numero_cuenta_bancaria, d.titular_cui, d.monto, d.estado, d.fecha_deposito,
              u.codigo_corporativo AS operador_codigo,
              TRIM(CONCAT(p.primer_nombre, ' ', p.primer_apellido)) AS operador_nombre,
              uc.codigo_corporativo AS concilia_codigo, d.fecha_conciliacion
       FROM depositos_ventanilla_banco d
       JOIN usuarios u ON u.id_usuario = d.id_usuario_operador
       JOIN personas p ON p.id_persona = u.id_persona
       LEFT JOIN usuarios uc ON uc.id_usuario = d.id_usuario_concilia
       ${where}
       ORDER BY (d.estado IN ('PENDIENTE', 'SIN_CONFIRMAR')) DESC, d.fecha_deposito DESC
       LIMIT ${LIMITE + 1}`,
      params
    );
    const resumen = await db.query(
      `SELECT estado, COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0) AS monto
       FROM depositos_ventanilla_banco GROUP BY estado`
    );

    return res.status(200).json({
      success: true,
      data: depositos.rows.slice(0, LIMITE).map((d) => ({ ...d, monto: Number(d.monto) })),
      limitado: depositos.rows.length > LIMITE,
      resumen: resumen.rows.map((r) => ({ ...r, monto: Number(r.monto) })),
    });
  } catch (error) {
    console.error('[ERROR] conciliacionController.listarDepositos:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar los depósitos. Intente de nuevo.' });
  }
};

/**
 * Cierra un depósito PENDIENTE o SIN_CONFIRMAR según el banco: ACREDITADO si el banco tiene la acreditación con
 * esa referencia (y el mismo monto), RECHAZADO si no la tiene. Queda a nombre de quien concilia.
 *
 * @async
 * @route POST /api/conciliacion/depositos/:referencia/verificar
 * @returns {Promise<import('express').Response>} 200 con el estado nuevo; 404 si no existe; 409 si ya estaba
 *   cerrado, es muy reciente (su llamada al banco puede seguir en curso) o el monto del banco no coincide; 502 si
 *   el banco no responde; 500.
 */
const verificarDeposito = async (req, res) => {
  try {
    const { referencia } = req.params;
    const deposito = (await db.query(
      `SELECT d.referencia, d.monto, d.estado, d.numero_cuenta_bancaria, d.titular_cui, u.codigo_corporativo AS operador_codigo,
              d.fecha_deposito < now() - make_interval(mins => $2) AS se_puede_conciliar
       FROM depositos_ventanilla_banco d JOIN usuarios u ON u.id_usuario = d.id_usuario_operador
       WHERE d.referencia = $1`,
      [referencia, MINUTOS_PARA_CONCILIAR]
    )).rows[0];
    if (!deposito) return res.status(404).json({ success: false, message: 'No encontramos ese depósito.' });
    // Nadie concilia una operación propia (segregación de funciones)
    if (await esAutoatencion(req.user, 'dpi', deposito.titular_cui)) return res.status(403).json(RESPUESTA_AUTOATENCION);
    if (!['PENDIENTE', 'SIN_CONFIRMAR'].includes(deposito.estado)) {
      return res.status(409).json({ success: false, message: `Ese depósito ya está ${ETIQUETA_ESTADO[deposito.estado] || deposito.estado}.` });
    }
    if (!deposito.se_puede_conciliar) {
      return res.status(409).json({
        success: false,
        message: `Ese depósito es muy reciente: su operación con el banco puede seguir en curso. Concílielo pasados ${MINUTOS_PARA_CONCILIAR} minutos.`,
      });
    }

    const movimiento = await bancoApiService.consultarMovimiento(referencia, 'CREDITO');
    let estadoNuevo;
    if (movimiento.success && movimiento.data) {
      const mismaCuenta = String(movimiento.data.numero_cuenta).trim().toLowerCase() === String(deposito.numero_cuenta_bancaria).trim().toLowerCase();
      if (!mismaCuenta || Number(movimiento.data.monto) !== Number(deposito.monto)) {
        return res.status(409).json({
          success: false,
          message: 'El banco tiene esa referencia con otra cuenta u otro monto. Revíselo con el banco antes de cerrarlo.',
        });
      }
      estadoNuevo = 'ACREDITADO';
    } else if (movimiento.status === 404) {
      estadoNuevo = 'RECHAZADO';
    } else {
      return res.status(502).json({ success: false, message: 'No se pudo consultar el banco. Intente de nuevo en unos minutos.' });
    }

    const actualizado = await db.query(
      `UPDATE depositos_ventanilla_banco
       SET estado = $2, id_usuario_concilia = $3, fecha_conciliacion = CURRENT_TIMESTAMP
       WHERE referencia = $1 AND estado IN ('PENDIENTE', 'SIN_CONFIRMAR')
         AND fecha_deposito < now() - make_interval(mins => $4)
       RETURNING referencia, estado`,
      [referencia, estadoNuevo, req.user.id_usuario, MINUTOS_PARA_CONCILIAR]
    );
    if (actualizado.rowCount === 0) {
      return res.status(409).json({ success: false, message: 'Otra persona ya cerró ese depósito.' });
    }
    return res.status(200).json({
      success: true,
      message: estadoNuevo === 'ACREDITADO'
        ? 'El banco confirma el depósito: queda acreditado.'
        : `El banco no tiene ese depósito: queda rechazado. Coordine con ${deposito.operador_codigo} qué pasó con el efectivo recibido.`,
      data: actualizado.rows[0],
    });
  } catch (error) {
    console.error('[ERROR] conciliacionController.verificarDeposito:', error);
    return res.status(500).json({ success: false, message: 'No se pudo conciliar el depósito. Intente de nuevo.' });
  }
};

/**
 * Cuántos depósitos y reversiones se pueden conciliar ahora, para el aviso del panel del administrador. Los
 * depósitos cuentan con el mismo criterio que `verificarDeposito`: sin cerrar y con más de MINUTOS_PARA_CONCILIAR.
 *
 * @async
 * @route GET /api/conciliacion/resumen
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con `depositos_por_conciliar` (PENDIENTE o SIN_CONFIRMAR) y
 *   `reversiones_pendientes`; 500.
 */
const resumen = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*)::int FROM depositos_ventanilla_banco
                WHERE estado IN ('PENDIENTE', 'SIN_CONFIRMAR') AND fecha_deposito < now() - make_interval(mins => $1)) AS depositos_por_conciliar,
              (SELECT COUNT(*)::int FROM reversiones_pendientes WHERE estado = 'PENDIENTE') AS reversiones_pendientes`,
      [MINUTOS_PARA_CONCILIAR]
    );
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('[ERROR] conciliacionController.resumen:', error);
    return res.status(500).json({ success: false, message: 'No se pudo cargar el resumen de conciliación. Intente de nuevo.' });
  }
};

/**
 * Lista las reversiones con el banco: las pendientes, o las cerradas (resueltas o descartadas, por el sistema o
 * por un administrador).
 *
 * @async
 * @route GET /api/conciliacion/reversiones
 * @param {import('express').Request} req - `req.query.estado`: PENDIENTE (por defecto) o CERRADA.
 * @returns {Promise<import('express').Response>} 200 con las reversiones (hasta 200, `limitado` si hay más) y el
 *   total de pendientes; 400; 500.
 */
const listarReversiones = async (req, res) => {
  try {
    const estado = req.query.estado || 'PENDIENTE';
    if (!['PENDIENTE', 'CERRADA'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Ese estado no existe.' });
    }
    const reversiones = await db.query(
      `SELECT r.id_reversion, r.origen, r.tipo_movimiento, r.numero_cuenta_bancaria, r.monto,
              r.referencia_reversion, r.detalle, r.estado, r.fecha_registro, r.fecha_resolucion,
              u.codigo_corporativo AS resuelve_codigo
       FROM reversiones_pendientes r
       LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario_resuelve
       WHERE (r.estado = 'PENDIENTE') = $1
       ORDER BY r.fecha_registro DESC
       LIMIT ${LIMITE + 1}`,
      [estado === 'PENDIENTE']
    );
    // El total de pendientes, para el resumen (la lista se corta en el límite)
    const pendientes = await db.query("SELECT COUNT(*)::int AS total FROM reversiones_pendientes WHERE estado = 'PENDIENTE'");
    return res.status(200).json({
      success: true,
      data: reversiones.rows.slice(0, LIMITE).map((r) => ({ ...r, monto: Number(r.monto) })),
      limitado: reversiones.rows.length > LIMITE,
      total_pendientes: pendientes.rows[0].total,
    });
  } catch (error) {
    console.error('[ERROR] conciliacionController.listarReversiones:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron cargar las reversiones. Intente de nuevo.' });
  }
};

/**
 * Hace una reversión pendiente (`reintentarReversion`): antes confirma que la operación no quedó registrada y que
 * el banco tiene el movimiento original. El banco es idempotente por referencia: si ya se había hecho, no se repite.
 *
 * @async
 * @route POST /api/conciliacion/reversiones/:id/reintentar
 * @returns {Promise<import('express').Response>} 200 con la reversión resuelta o descartada; 400; 403 si es de quien
 *   concilia; 404; 409 si ya estaba cerrada, es muy reciente o el banco tiene el original con otros datos; 502 si
 *   el banco no responde o no la hace; 503; 500.
 */
const reintentar = async (req, res) => {
  try {
    if (!/^\d{1,9}$/.test(String(req.params.id))) {
      return res.status(400).json({ success: false, message: 'Esa reversión no existe.' });
    }
    const titular = await db.query('SELECT cui_dpi FROM reversiones_pendientes WHERE id_reversion = $1', [Number(req.params.id)]);
    if (await esAutoatencion(req.user, 'dpi', titular.rows[0]?.cui_dpi)) return res.status(403).json(RESPUESTA_AUTOATENCION);

    const reversion = await reintentarReversion(Number(req.params.id), req.user.id_usuario);
    return res.status(200).json({
      success: true,
      message: reversion.estado === 'RESUELTA'
        ? 'El banco hizo la reversión: queda resuelta.'
        : 'No había nada que revertir (la operación sí quedó registrada o el banco no tiene el movimiento): queda descartada.',
      data: reversion,
    });
  } catch (error) {
    console.error('[ERROR] conciliacionController.reintentar:', error);
    const { status, message } = respuestaDeError(error, 'No se pudo reintentar la reversión. Intente de nuevo.');
    return res.status(status).json({ success: false, message });
  }
};

module.exports = { resumen, listarDepositos, verificarDeposito, listarReversiones, reintentar };
