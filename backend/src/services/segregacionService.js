const db = require('../config/db');
const { esId, filtroUsuario } = require('../utils/identificadores');

/**
 * Segregación de funciones (issue #32): quien trabaja en la cooperativa también puede ser asociado,
 * pero nunca atiende sus propios trámites. Se compara la persona (no el usuario), porque su usuario del
 * personal y su usuario de asociado son distintos.
 */

// Cómo llegar a la persona dueña de cada tipo de recurso identificado por un id
const CONSULTAS_POR_ID = {
  asociado: 'SELECT id_persona FROM asociados WHERE id_asociado = $1',
  cuenta: `SELECT a.id_persona FROM cuentas c JOIN asociados a ON a.id_asociado = c.id_asociado
           WHERE c.id_cuenta = $1`,
  solicitudAfiliacion: `SELECT p.id_persona FROM solicitudes_afiliacion_agencia s
                        JOIN personas p ON p.cui_dpi = s.cui_dpi WHERE s.id_solicitud = $1`,
  solicitudTraslado: `SELECT a.id_persona FROM solicitudes_traslado_apertura s
                      JOIN asociados a ON a.id_asociado = s.id_asociado WHERE s.id_solicitud = $1`,
  solicitudCredito: `SELECT a.id_persona FROM solicitudes_credito s
                     JOIN asociados a ON a.id_asociado = s.id_asociado WHERE s.id_solicitud_credito = $1`,
  // Un documento es de la persona de su expediente o, antes de afiliarla, de quien tiene el DPI del trámite
  documento: `SELECT p.id_persona FROM documentos_afiliacion d
              JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
              JOIN personas p ON p.id_persona = e.id_persona OR p.cui_dpi = e.cui_dpi
              WHERE d.id_documento = $1`,
};

/** Tipos de recurso que se pueden revisar. */
const TIPOS = ['dpi', 'usuario', ...Object.keys(CONSULTAS_POR_ID)];

/**
 * Consulta para llegar a la persona dueña del recurso.
 *
 * @param {string} tipo - Uno de `TIPOS`.
 * @param {string} texto - Identificador ya recortado; para los tipos por id, un id válido (`esId`).
 * @returns {{consulta: string, parametro: string|number}}
 */
const consultaPersona = (tipo, texto) => {
  if (tipo === 'dpi') return { consulta: 'SELECT id_persona FROM personas WHERE cui_dpi = $1', parametro: texto.replace(/\D/g, '') };
  if (tipo === 'usuario') {
    // La misma regla que usa userController para decidir si :id es un id o un código
    const filtro = filtroUsuario(texto, '');
    return { consulta: `SELECT id_persona FROM usuarios WHERE ${filtro.condicion}`, parametro: filtro.valor };
  }
  return { consulta: CONSULTAS_POR_ID[tipo], parametro: Number(texto) };
};

/**
 * Indica si el recurso pertenece a la misma persona que el usuario de la sesión.
 *
 * @async
 * @param {{id_persona: number}} usuario - `req.user` (verifyToken toma `id_persona` de la base de datos).
 * @param {string} tipo - `dpi`, `usuario`, `asociado`, `cuenta`, `solicitudAfiliacion`, `solicitudTraslado`,
 *   `solicitudCredito` o `documento`.
 * @param {string|number|null|undefined} valor - Identificador del recurso. Para los tipos por id debe ser un
 *   id válido (`esId`); quien llama decide qué hacer si no lo es.
 * @returns {Promise<boolean>} false si no hay valor o el recurso no existe (de eso se ocupa el controlador).
 * @throws {Error} si el tipo es desconocido.
 */
const esAutoatencion = async (usuario, tipo, valor) => {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de recurso desconocido para segregación: ${tipo}`);
  if (!usuario?.id_persona || valor === undefined || valor === null) return false;
  const texto = String(valor).trim();
  if (!texto) return false;
  if (CONSULTAS_POR_ID[tipo] && !esId(texto)) return false;
  const { consulta, parametro } = consultaPersona(tipo, texto);
  const resultado = await db.query(consulta, [parametro]);
  return resultado.rows.some((fila) => Number(fila.id_persona) === Number(usuario.id_persona));
};

module.exports = { esAutoatencion, TIPOS, TIPOS_POR_ID: Object.keys(CONSULTAS_POR_ID) };
