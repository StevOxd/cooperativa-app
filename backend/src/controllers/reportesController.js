const db = require('../config/db');
const { ESTADOS_ASOCIADO: ESTADOS, REPORTES: LIMITES } = require('../config/constants');
const { REPORTES, datosDelReporte } = require('../services/reportesService');
const { errorDeNegocio, respuestaDeError } = require('../utils/errores');
const { fechaValida, diasEntre } = require('../utils/fechas');
const { ipDelCliente, userAgentDe } = require('../utils/ipCliente');

const FORMATOS = ['PDF', 'CSV'];
const ESTADOS_ASOCIADO = Object.values(ESTADOS);

/**
 * Filtros del reporte según su tipo, validados. Un valor repetido en la URL (`?desde=…&desde=…`) llega como arreglo
 * y no pasa la validación.
 *
 * @param {'periodo'|'dia'|'estado'} filtro
 * @param {Object} query - `req.query`.
 * @returns {Object} Los filtros tal como se guardan en `reportes_generados.parametros`.
 * @throws {Error} 400 con el motivo.
 */
const leerFiltros = (filtro, query) => {
  if (filtro === 'dia') {
    if (!fechaValida(query.fecha)) throw errorDeNegocio(400, 'Indique el día del reporte (AAAA-MM-DD).');
    return { fecha: query.fecha };
  }
  if (filtro === 'estado') {
    if (query.estado === undefined || query.estado === '') return {};
    if (!ESTADOS_ASOCIADO.includes(query.estado)) throw errorDeNegocio(400, 'Ese estado de asociado no existe.');
    return { estado: query.estado };
  }
  const { desde, hasta } = query;
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    throw errorDeNegocio(400, 'Indique el período del reporte (desde y hasta, AAAA-MM-DD).');
  }
  if (desde > hasta) throw errorDeNegocio(400, 'La fecha inicial es posterior a la final.');
  if (diasEntre(desde, hasta) > LIMITES.MAX_DIAS_PERIODO) {
    throw errorDeNegocio(400, 'El período de un reporte es de un año como máximo.');
  }
  return { desde, hasta };
};

/**
 * Datos de un reporte de gestión (issue #85). Antes de entregarlo queda registrado en `reportes_generados` (quién,
 * cuál, formato, filtros, filas, IP y navegador): si no se puede registrar, no se entrega.
 *
 * @async
 * @route GET /api/reportes/:tipo
 * @param {import('express').Request} req - `req.params.tipo` (p. ej. `cartera-creditos`); `req.query.formato`
 *   (PDF o CSV: el que declara el navegador, que es quien arma el archivo) y los filtros del reporte: `desde` y
 *   `hasta`, `fecha` o `estado`.
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>} 200 con `reporte` (tipo, folio, filtros, fecha de generación,
 *   filas y resumen); 400 si los filtros no son válidos; 403 si el rol no saca ese reporte; 404 si no existe; 422 si pasa
 *   del máximo de filas; 500.
 */
const generar = async (req, res) => {
  try {
    const { tipo } = req.params;
    const reporte = Object.hasOwn(REPORTES, tipo) ? REPORTES[tipo] : null;
    if (!reporte) return res.status(404).json({ success: false, message: 'Ese reporte no existe.' });
    if (!reporte.roles.includes(req.user.rol)) {
      // Queda en el registro del servidor: varios seguidos son alguien tanteando reportes ajenos
      console.warn(`[REPORTES] ${req.user.codigo_corporativo} (${req.user.rol}) pidió «${tipo}» sin permiso desde ${ipDelCliente(req)}`);
      return res.status(403).json({ success: false, message: 'Su rol no tiene acceso a este reporte.' });
    }
    const formato = typeof req.query.formato === 'string' ? req.query.formato.toUpperCase() : '';
    if (!FORMATOS.includes(formato)) {
      return res.status(400).json({ success: false, message: 'Indique el formato del reporte (PDF o CSV).' });
    }

    const filtros = leerFiltros(reporte.filtro, req.query);
    const { filas, resumen } = await datosDelReporte(db, tipo, { ...filtros, idUsuario: req.user.id_usuario });

    const registro = await db.query(
      `INSERT INTO reportes_generados (id_usuario, id_rol, tipo_reporte, formato, parametros, filas, ip_origen, user_agent)
       VALUES ($1, (SELECT id_rol FROM usuarios WHERE id_usuario = $1), $2, $3, $4, $5, $6, $7)
       RETURNING id_reporte, fecha_generacion`,
      [req.user.id_usuario, reporte.codigo, formato, filtros, filas.length, ipDelCliente(req), userAgentDe(req)]
    );
    const { id_reporte: idReporte, fecha_generacion: generadoEn } = registro.rows[0];

    return res.status(200).json({
      success: true,
      reporte: {
        tipo,
        // El folio va en el PDF y en el nombre del archivo: con él se encuentra el registro de quién lo sacó
        folio: `REP-${String(idReporte).padStart(6, '0')}`,
        filtros,
        generado_en: generadoEn,
        generado_por: req.user.codigo_corporativo,
        filas,
        resumen,
      },
    });
  } catch (error) {
    const { status, message } = respuestaDeError(error, 'No se pudo generar el reporte. Intente de nuevo.');
    if (status === 500) console.error('[ERROR] reportesController.generar:', error);
    return res.status(status).json({ success: false, message });
  }
};

module.exports = { generar };
