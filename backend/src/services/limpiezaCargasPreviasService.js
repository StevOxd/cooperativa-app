const db = require('../config/db');
const { eliminarDocumentoSinUso } = require('../utils/documentoArchivo');

/**
 * Borra los documentos que ya no sirven para afiliar: cargas previas de una afiliación que se empezó y no se completó en
 * `DOCUMENTOS.DIAS_CARGA_PREVIA` días (Fase 6), y los de solicitudes de agencia canceladas, expiradas o pendientes por
 * más de 30 días (H-84). Las filas las borra la función `purgar_cargas_previas_vencidas` del rol
 * dueño (el de la aplicación no borra en esas tablas); después se borran sus archivos. Si el proceso se detiene entre
 * los dos pasos, el archivo queda sin registro y nadie lo puede abrir (`secureUploads` busca primero en la base).
 */

const UN_DIA_MS = 24 * 60 * 60 * 1000;
// Candado de la purga (espacio 3; el 1 son los códigos corporativos y el 2 el efectivo de ventanilla): dos procesos
// del backend no la corren a la vez
const CANDADO_PURGA = 3;

/**
 * Una pasada de la purga.
 *
 * @async
 * @returns {Promise<number>} Documentos borrados (0 si otro proceso la estaba corriendo).
 */
const purgarCargasPreviasVencidas = async () => {
  const client = await db.pool.connect();
  let archivos = [];
  try {
    await client.query('BEGIN');
    const candado = await client.query("SELECT pg_try_advisory_xact_lock($1, hashtext('purga-cargas-previas')) AS tomado", [CANDADO_PURGA]);
    if (!candado.rows[0].tomado) {
      await client.query('ROLLBACK');
      return 0;
    }
    archivos = (await client.query('SELECT archivo FROM purgar_cargas_previas_vencidas()')).rows.map((fila) => fila.archivo);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  for (const archivo of archivos) await eliminarDocumentoSinUso(archivo);
  return archivos.length;
};

/**
 * Corre la purga al arrancar y luego una vez al día. Un fallo se registra y se reintenta al día siguiente.
 *
 * @returns {NodeJS.Timeout} El temporizador (no mantiene vivo el proceso).
 */
const programarPurgaDiaria = () => {
  const correr = async () => {
    try {
      const borrados = await purgarCargasPreviasVencidas();
      if (borrados > 0) console.log(`[INFO] Purga diaria: ${borrados} documentos de afiliaciones no completadas borrados.`);
    } catch (error) {
      console.error('[ERROR] No se pudo purgar las cargas previas vencidas:', error.message);
    }
  };
  correr();
  return setInterval(correr, UN_DIA_MS).unref();
};

module.exports = { purgarCargasPreviasVencidas, programarPurgaDiaria };
