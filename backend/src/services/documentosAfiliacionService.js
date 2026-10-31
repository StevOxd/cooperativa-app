const db = require('../config/db');
const { DOCUMENTOS } = require('../config/constants');
const { errorDeNegocio } = require('../utils/errores');
const { userAgentDe } = require('../utils/ipCliente');
const { leerDocumento, guardarDocumento, eliminarDocumentoSinUso, SUBCARPETA } = require('../utils/documentoArchivo');

/**
 * Documentos de afiliación: carga, versiones y revisión.
 *
 * Los documentos de un trámite viven en un expediente (`expedientes_documentos`). Cada carga es una versión nueva;
 * la que reemplaza deja a la anterior como REEMPLAZADO. Solo se revisa un documento PENDIENTE, nunca quien lo subió
 * (cuatro ojos), y la revisión queda en `revisiones_documento`. Bloqueos, siempre en este orden: expediente y luego
 * documento, con FOR NO KEY UPDATE (no frenan las inserciones de accesos y revisiones, que solo toman la llave).
 */

const ETIQUETAS = Object.freeze({
  DPI_FRENTE: 'DPI (frente)',
  DPI_REVERSO: 'DPI (reverso)',
  RECIBO_SERVICIOS: 'Recibo de servicios',
  FOTO_CON_DPI: 'Foto sosteniendo el DPI',
  CONSTANCIA_INGRESOS: 'Constancia de ingresos o laboral',
});

const ESTADOS_BANDEJA = ['PENDIENTE', 'RECHAZADO', 'ACEPTADO'];

/** Quien sube su propio documento (en línea, el personal que se afilia o el asociado) y quien lo escanea. */
const CANALES_DEL_INTERESADO = ['EN_LINEA', 'PERSONAL', 'PORTAL'];
const CANALES = [...CANALES_DEL_INTERESADO, 'VENTANILLA'];

/**
 * URL protegida de un documento (`secureUploads`): solo el personal y el dueño lo abren.
 *
 * @param {string} archivo
 * @returns {string}
 */
const urlDocumento = (archivo) => `/api/uploads/${SUBCARPETA}/${archivo}`;

/**
 * Lo que se devuelve de un documento. El motivo solo acompaña a un rechazo.
 *
 * @param {Object} fila - Fila con las columnas de `documentos_afiliacion` y de su revisión.
 * @param {{ conUrl?: boolean, idUsuarioActual?: number }} [opciones] - `conUrl` para el personal y el dueño (nunca
 *   en rutas públicas); `idUsuarioActual` agrega `cargado_por_mi` (quien lo subió no lo revisa).
 * @returns {Object}
 */
const formatearDocumento = (fila, { conUrl = false, idUsuarioActual } = {}) => ({
  id_documento: fila.id_documento,
  tipo_documento: fila.tipo_documento,
  estado: fila.estado,
  tamano_bytes: fila.tamano_bytes,
  canal_carga: fila.canal_carga,
  fecha_carga: fila.fecha_carga,
  motivo_rechazo: fila.estado === 'RECHAZADO' ? fila.motivo : null,
  fecha_revision: fila.fecha_revision || null,
  ...(conUrl ? { url: urlDocumento(fila.archivo) } : {}),
  ...(idUsuarioActual ? { cargado_por_mi: Number(fila.id_usuario_carga) === Number(idUsuarioActual) } : {}),
});

/**
 * Documentos vigentes de un expediente (uno por tipo), en el orden de `DOCUMENTOS.TIPOS`.
 *
 * @param {{ query: Function }} cliente - Pool o cliente de una transacción.
 * @param {number|null} idExpediente
 * @param {{ conUrl?: boolean, idUsuarioActual?: number }} [opciones] - Ver `formatearDocumento`.
 * @returns {Promise<Object[]>}
 */
const listarDocumentos = async (cliente, idExpediente, opciones = {}) => {
  if (!idExpediente) return [];
  const { rows } = await cliente.query(
    `SELECT d.id_documento, d.tipo_documento, d.estado, d.tamano_bytes, d.canal_carga, d.fecha_carga, d.archivo,
            d.id_usuario_carga, r.motivo, r.fecha_revision
     FROM documentos_afiliacion d
     LEFT JOIN revisiones_documento r ON r.id_documento = d.id_documento
     WHERE d.id_expediente = $1 AND d.estado <> 'REEMPLAZADO'
     ORDER BY array_position($2::text[], d.tipo_documento::text)`,
    [idExpediente, DOCUMENTOS.TIPOS]
  );
  return rows.map((fila) => formatearDocumento(fila, opciones));
};

/**
 * Estado de los documentos de un expediente. Un obligatorio rechazado cuenta como faltante.
 *
 * @param {Array<{tipo_documento: string, estado: string}>} documentos - Los vigentes (`listarDocumentos`).
 * @returns {{ estado: 'INCOMPLETO'|'EN_REVISION'|'COMPLETO', faltantes: string[], rechazados: string[],
 *   pendientes: string[] }} INCOMPLETO si falta un obligatorio; EN_REVISION si alguno espera revisión; COMPLETO si
 *   todos los obligatorios están aceptados.
 */
const resumirDocumentos = (documentos) => {
  const estadoPorTipo = new Map(documentos.map((d) => [d.tipo_documento, d.estado]));
  const faltantes = DOCUMENTOS.OBLIGATORIOS.filter((tipo) => !['PENDIENTE', 'ACEPTADO'].includes(estadoPorTipo.get(tipo)));
  const rechazados = documentos.filter((d) => d.estado === 'RECHAZADO').map((d) => d.tipo_documento);
  const pendientes = documentos.filter((d) => d.estado === 'PENDIENTE').map((d) => d.tipo_documento);
  let estado = 'COMPLETO';
  if (faltantes.length > 0) estado = 'INCOMPLETO';
  else if (DOCUMENTOS.OBLIGATORIOS.some((tipo) => estadoPorTipo.get(tipo) === 'PENDIENTE')) estado = 'EN_REVISION';
  return { estado, faltantes, rechazados, pendientes };
};

/**
 * Documentos vigentes de un expediente con su resumen.
 *
 * @param {{ query: Function }} cliente
 * @param {number|null} idExpediente
 * @param {{ conUrl?: boolean, idUsuarioActual?: number }} [opciones]
 * @returns {Promise<{ documentos: Object[], resumen: Object }>}
 */
const documentosConResumen = async (cliente, idExpediente, opciones = {}) => {
  const lista = await listarDocumentos(cliente, idExpediente, opciones);
  return { documentos: lista, resumen: resumirDocumentos(lista) };
};

/**
 * Expediente de documentos de una persona; si no tiene y se indica quién lo crea, se le crea uno (asociado actual
 * que completa sus documentos, o alguien del personal que se afilia).
 *
 * @param {{ query: Function }} cliente
 * @param {number} idPersona
 * @param {{ crearPor?: number|null, canalOrigen?: 'ASOCIADO_ACTUAL'|'PERSONAL' }} [opciones] - Usuario que lo crea
 *   (el asociado, el operador o el colaborador) y por qué canal.
 * @returns {Promise<number|null>} El id del expediente, o null si no tiene y no se pidió crearlo.
 */
const expedienteDePersona = async (cliente, idPersona, { crearPor = null, canalOrigen = 'ASOCIADO_ACTUAL' } = {}) => {
  const buscar = () => cliente.query('SELECT id_expediente FROM expedientes_documentos WHERE id_persona = $1', [idPersona]);
  const existente = await buscar();
  if (existente.rows[0] || !crearPor) return existente.rows[0]?.id_expediente ?? null;
  const creado = await cliente.query(
    `INSERT INTO expedientes_documentos (cui_dpi, id_persona, canal_origen, id_usuario_crea, fecha_vinculacion)
     SELECT cui_dpi, id_persona, $3, $2, CURRENT_TIMESTAMP FROM personas WHERE id_persona = $1
     ON CONFLICT (id_persona) WHERE id_persona IS NOT NULL DO NOTHING
     RETURNING id_expediente`,
    [idPersona, crearPor, canalOrigen]
  );
  if (creado.rows[0]) return creado.rows[0].id_expediente;
  // Otra petición lo creó al mismo tiempo
  return (await buscar()).rows[0]?.id_expediente ?? null;
};

/**
 * Expediente con que se afilia un DPI, sin crearlo. En este orden: el de la solicitud de agencia (si se indica), el de
 * la persona con ese DPI (por ejemplo, alguien del personal que ya subió los suyos) y la carga previa vigente.
 *
 * @param {{ query: Function }} cliente
 * @param {string} cui - DPI de 13 dígitos.
 * @param {{ idSolicitud?: number|null }} [opciones]
 * @returns {Promise<number|null>}
 */
const expedienteDeAfiliacion = async (cliente, cui, { idSolicitud = null } = {}) => {
  // Una consulta por índice (solicitud, persona y carga previa) en lugar de un OR que recorrería toda la tabla
  const { rows } = await cliente.query(
    `SELECT id_expediente FROM (
       SELECT id_expediente, 1 AS prioridad FROM expedientes_documentos WHERE $2::int IS NOT NULL AND id_solicitud = $2
       UNION ALL
       SELECT e.id_expediente, 2 FROM personas p JOIN expedientes_documentos e ON e.id_persona = p.id_persona WHERE p.cui_dpi = $1
       UNION ALL
       SELECT id_expediente, 3 FROM expedientes_documentos
       WHERE cui_dpi = $1 AND id_persona IS NULL AND id_solicitud IS NULL AND expira_en > CURRENT_TIMESTAMP
     ) candidatos
     ORDER BY prioridad
     LIMIT 1`,
    [cui, idSolicitud]
  );
  return rows[0]?.id_expediente ?? null;
};

/**
 * Expediente de una solicitud de agencia (solo el suyo), o null.
 *
 * @param {{ query: Function }} cliente
 * @param {number} idSolicitud
 * @returns {Promise<number|null>}
 */
const expedienteDeSolicitud = async (cliente, idSolicitud) =>
  (await cliente.query('SELECT id_expediente FROM expedientes_documentos WHERE id_solicitud = $1', [idSolicitud])).rows[0]?.id_expediente ?? null;

/**
 * Expediente donde se sube un documento de una afiliación que todavía no termina; si no hay, lo crea. Con una
 * solicitud de agencia, una carga previa del mismo DPI pasa a la solicitud. Sin solicitud ni persona, el expediente es
 * una carga previa que vence en `DOCUMENTOS.DIAS_CARGA_PREVIA` días si la afiliación no se completa.
 *
 * @param {{ query: Function }} cliente - Cliente de la transacción de la carga.
 * @param {{ cui: string, idSolicitud?: number|null, crearPor?: number|null,
 *   canalOrigen: 'EN_LINEA'|'VENTANILLA'|'PERSONAL', soloSolicitud?: boolean }} afiliacion - `crearPor` null solo en
 *   línea. `soloSolicitud`: el permiso de carga de una solicitud pública (el DPI no está comprobado) solo llega al
 *   expediente de esa solicitud, nunca al de la persona ni a una carga previa de ese DPI.
 * @returns {Promise<number>}
 */
const expedienteParaCargar = async (cliente, { cui, idSolicitud = null, crearPor = null, canalOrigen, soloSolicitud = false }) => {
  if (soloSolicitud) {
    const propio = await expedienteDeSolicitud(cliente, idSolicitud);
    if (propio) return propio;
    const creado = await cliente.query(
      `INSERT INTO expedientes_documentos (cui_dpi, id_solicitud, canal_origen, id_usuario_crea)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id_expediente`,
      [cui, idSolicitud, canalOrigen, crearPor]
    );
    return creado.rows[0]?.id_expediente ?? expedienteDeSolicitud(cliente, idSolicitud);
  }
  const existente = await expedienteDeAfiliacion(cliente, cui, { idSolicitud });
  if (existente) {
    if (!idSolicitud) return existente;
    // Una carga previa de este DPI pasa a la solicitud (deja de vencer); uno de la persona o de la solicitud se queda
    const pasada = await cliente.query(
      `UPDATE expedientes_documentos SET id_solicitud = $2, expira_en = NULL
       WHERE id_expediente = $1 AND id_persona IS NULL AND id_solicitud IS NULL
       RETURNING id_expediente`,
      [existente, idSolicitud]
    );
    return pasada.rows[0]?.id_expediente ?? existente;
  }
  // Una carga previa vencida que la purga diaria todavía no borró ocupa el lugar de este DPI: se reutiliza (vuelve a
  // vencer en 30 días; con una solicitud, pasa a ella)
  const renovada = await cliente.query(
    `UPDATE expedientes_documentos
     SET id_solicitud = $2,
         expira_en = CASE WHEN $2::int IS NULL THEN CURRENT_TIMESTAMP + make_interval(days => $3) END
     WHERE cui_dpi = $1 AND id_persona IS NULL AND id_solicitud IS NULL AND expira_en <= CURRENT_TIMESTAMP
     RETURNING id_expediente`,
    [cui, idSolicitud, DOCUMENTOS.DIAS_CARGA_PREVIA]
  );
  if (renovada.rows[0]) return renovada.rows[0].id_expediente;
  const creado = await cliente.query(
    `INSERT INTO expedientes_documentos (cui_dpi, id_solicitud, canal_origen, id_usuario_crea, expira_en)
     VALUES ($1, $2, $3, $4, CASE WHEN $2::int IS NULL THEN CURRENT_TIMESTAMP + make_interval(days => $5) END)
     ON CONFLICT DO NOTHING
     RETURNING id_expediente`,
    [cui, idSolicitud, canalOrigen, crearPor, DOCUMENTOS.DIAS_CARGA_PREVIA]
  );
  if (creado.rows[0]) return creado.rows[0].id_expediente;
  // Otra carga lo creó al mismo tiempo
  const otro = await expedienteDeAfiliacion(cliente, cui, { idSolicitud });
  if (!otro) throw new Error('No se pudo crear el expediente de documentos.');
  return otro;
};

/**
 * Exige los documentos obligatorios (entregados: pendientes de revisión o aceptados) antes de completar una afiliación.
 *
 * @param {{ query: Function }} cliente
 * @param {number|null} idExpediente
 * @returns {Promise<void>}
 * @throws {Error} 400 `DOCUMENTOS_INCOMPLETOS` con los que faltan.
 */
const exigirDocumentosObligatorios = async (cliente, idExpediente) => {
  const { faltantes } = resumirDocumentos(await listarDocumentos(cliente, idExpediente));
  if (faltantes.length === 0) return;
  throw errorDeNegocio(
    400,
    `Faltan documentos para completar la afiliación: ${faltantes.map((tipo) => ETIQUETAS[tipo]).join(', ')}.`,
    'DOCUMENTOS_INCOMPLETOS'
  );
};

/**
 * Al afiliar, el expediente pasa a la persona (deja de vencer y toma su DPI, por si se corrigió en ventanilla). Si la
 * persona ya tenía otro, ese sigue siendo el suyo: un documento no cambia de expediente, y el de la afiliación queda
 * con su solicitud.
 *
 * @param {{ query: Function }} cliente - Cliente de la transacción de la afiliación.
 * @param {number|null} idExpediente
 * @param {number} idPersona
 * @returns {Promise<void>}
 */
const vincularExpedienteAPersona = async (cliente, idExpediente, idPersona) => {
  if (!idExpediente) return;
  const expediente = (await cliente.query(
    'SELECT id_persona FROM expedientes_documentos WHERE id_expediente = $1 FOR NO KEY UPDATE',
    [idExpediente]
  )).rows[0];
  if (!expediente || expediente.id_persona) return;
  const propio = await cliente.query('SELECT 1 FROM expedientes_documentos WHERE id_persona = $1', [idPersona]);
  if (propio.rows[0]) return;
  await cliente.query(
    `UPDATE expedientes_documentos
     SET id_persona = $2, cui_dpi = (SELECT cui_dpi FROM personas WHERE id_persona = $2),
         fecha_vinculacion = CURRENT_TIMESTAMP, expira_en = NULL
     WHERE id_expediente = $1`,
    [idExpediente, idPersona]
  );
};

/**
 * Sube una versión de un documento. Si ya había uno vigente de ese tipo, lo reemplaza.
 *
 * El interesado (en línea, el personal que se afilia o el asociado) no reemplaza un documento ya aceptado ni sube
 * más de `DOCUMENTOS.MAX_VERSIONES_POR_TIPO` versiones propias de un tipo; en ventanilla, el operador sí. Nadie sube
 * el mismo archivo que ya está vigente ni el mismo archivo para dos tipos (por ejemplo, frente y reverso).
 *
 * @async
 * @param {Object} datos
 * @param {number} [datos.idExpediente] - Ya resuelto por quien llama según la sesión o el trámite (nunca del cuerpo).
 * @param {{ idPersona: number, crearPor: number, canalOrigen?: string }} [datos.persona] - En lugar de
 *   `idExpediente`: el expediente de esa persona, que se crea en la misma transacción si no tiene (así una carga
 *   inválida no deja un expediente vacío).
 * @param {Object} [datos.afiliacion] - En lugar de los anteriores: el de una afiliación en curso (ver
 *   `expedienteParaCargar`), también creado en la misma transacción.
 * @param {string} datos.tipo - Uno de `DOCUMENTOS.TIPOS`.
 * @param {string} datos.archivo - Data URI (ver `leerDocumento`).
 * @param {'EN_LINEA'|'PERSONAL'|'PORTAL'|'VENTANILLA'} datos.canal
 * @param {number|null} [datos.idUsuario] - Quien sube; null solo en línea.
 * @param {string|null} [datos.ip]
 * @param {string|null} [datos.userAgent]
 * @returns {Promise<{ idExpediente: number, idDocumento: number, reemplazo: boolean }>}
 * @throws {Error} 400 tipo o archivo inválido, repetido; 404 sin expediente; 409 si ya está aceptado o se llegó al
 *   tope de versiones; 413 si pasa de 5 MB.
 */
const subirDocumento = async ({
  idExpediente, persona, afiliacion, tipo, archivo, canal, idUsuario = null, ip = null, userAgent = null,
}) => {
  if (!CANALES.includes(canal)) throw new Error(`Canal de carga desconocido: ${canal}`);
  if (!DOCUMENTOS.TIPOS.includes(tipo)) throw errorDeNegocio(400, 'Elija qué documento está subiendo.');
  const leido = leerDocumento(archivo);
  const delInteresado = CANALES_DEL_INTERESADO.includes(canal);

  const client = await db.pool.connect();
  let guardado = null;
  try {
    await client.query('BEGIN');
    let id = idExpediente;
    if (persona) id = await expedienteDePersona(client, persona.idPersona, persona);
    else if (afiliacion) id = await expedienteParaCargar(client, afiliacion);
    const expediente = await client.query(
      'SELECT id_expediente FROM expedientes_documentos WHERE id_expediente = $1 FOR NO KEY UPDATE',
      [id]
    );
    if (!expediente.rows[0]) throw errorDeNegocio(404, 'No se encontró el expediente de documentos.');

    const { rows: versiones } = await client.query(
      `SELECT id_documento, estado, sha256, canal_carga FROM documentos_afiliacion
       WHERE id_expediente = $1 AND tipo_documento = $2 ORDER BY id_documento DESC`,
      [id, tipo]
    );
    const vigente = versiones.find((v) => v.estado !== 'REEMPLAZADO') || null;
    if (delInteresado && vigente?.estado === 'ACEPTADO') {
      throw errorDeNegocio(409, 'Este documento ya fue aceptado. Si necesita cambiarlo, pídalo en la agencia.');
    }
    const propias = versiones.filter((v) => CANALES_DEL_INTERESADO.includes(v.canal_carga)).length;
    if (delInteresado && propias >= DOCUMENTOS.MAX_VERSIONES_POR_TIPO) {
      throw errorDeNegocio(409, 'Ya subió este documento varias veces. Llévelo a la agencia para que lo escaneen.');
    }
    if (vigente?.sha256 === leido.sha256) {
      throw errorDeNegocio(400, 'Es el mismo archivo que ya está cargado. Suba uno nuevo.');
    }
    const repetido = await client.query(
      `SELECT tipo_documento FROM documentos_afiliacion
       WHERE id_expediente = $1 AND sha256 = $2 AND estado <> 'REEMPLAZADO' AND tipo_documento <> $3 LIMIT 1`,
      [id, leido.sha256, tipo]
    );
    if (repetido.rows[0]) {
      throw errorDeNegocio(400, `Ese archivo ya está cargado como «${ETIQUETAS[repetido.rows[0].tipo_documento]}».`);
    }

    guardado = await guardarDocumento(leido.buffer, leido.extension);
    if (vigente) {
      await client.query("UPDATE documentos_afiliacion SET estado = 'REEMPLAZADO' WHERE id_documento = $1", [vigente.id_documento]);
    }
    const insertado = await client.query(
      `INSERT INTO documentos_afiliacion
         (id_expediente, tipo_documento, archivo, tamano_bytes, sha256, id_documento_anterior, canal_carga,
          id_usuario_carga, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id_documento`,
      [id, tipo, guardado, leido.buffer.length, leido.sha256, vigente?.id_documento ?? null, canal,
        idUsuario, ip, userAgentDe(userAgent)]
    );
    await client.query('COMMIT');
    return { idExpediente: id, idDocumento: insertado.rows[0].id_documento, reemplazo: Boolean(vigente) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await eliminarDocumentoSinUso(guardado);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Acepta o rechaza un documento pendiente. Quien lo subió no lo revisa: lo hace un colega (cuatro ojos, como en la
 * aprobación de créditos). Una carga previa (de una afiliación que todavía no se envió) no se revisa.
 *
 * @async
 * @param {Object} datos
 * @param {number} datos.idDocumento
 * @param {'ACEPTADO'|'RECHAZADO'} datos.resultado
 * @param {string} [datos.motivo] - Obligatorio al rechazar (5 a 500 caracteres).
 * @param {number} datos.idUsuario - El operador que revisa.
 * @param {string|null} [datos.ip]
 * @param {string|null} [datos.userAgent]
 * @returns {Promise<{ documento: Object, contacto: { email: string|null, nombre: string|null, sinPortal: boolean } }>}
 *   A quién avisar de un rechazo: el usuario de asociado activo de la persona o, si es una solicitud, su correo.
 *   `sinPortal`: no tiene usuario activo del portal, así que no puede volver a subirlo en línea.
 * @throws {Error} 400 datos inválidos; 403 `REVISION_POR_QUIEN_CARGO`; 404 si no existe; 409 si ya se revisó, se
 *   reemplazó o es una carga previa.
 */
const revisarDocumento = async ({ idDocumento, resultado, motivo, idUsuario, ip = null, userAgent = null }) => {
  if (!['ACEPTADO', 'RECHAZADO'].includes(resultado)) {
    throw errorDeNegocio(400, 'Indique si acepta o rechaza el documento.');
  }
  const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
  // Se cuentan caracteres (como char_length en el CHECK), no unidades UTF-16: un emoji es uno
  const caracteres = [...motivoLimpio].length;
  if (resultado === 'RECHAZADO' && caracteres < DOCUMENTOS.MOTIVO_RECHAZO_MIN) {
    throw errorDeNegocio(400, `Escriba el motivo del rechazo (al menos ${DOCUMENTOS.MOTIVO_RECHAZO_MIN} caracteres).`);
  }
  if (caracteres > DOCUMENTOS.MOTIVO_RECHAZO_MAX) {
    throw errorDeNegocio(400, `El motivo no puede pasar de ${DOCUMENTOS.MOTIVO_RECHAZO_MAX} caracteres.`);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const ubicado = await client.query('SELECT id_expediente FROM documentos_afiliacion WHERE id_documento = $1', [idDocumento]);
    if (!ubicado.rows[0]) throw errorDeNegocio(404, 'El documento no existe.');
    const { id_expediente: idExpediente } = ubicado.rows[0];
    const expediente = (await client.query(
      'SELECT id_persona, id_solicitud FROM expedientes_documentos WHERE id_expediente = $1 FOR NO KEY UPDATE',
      [idExpediente]
    )).rows[0];
    if (!expediente.id_persona && !expediente.id_solicitud) {
      throw errorDeNegocio(409, 'Este documento es de una afiliación que todavía no se envió.');
    }
    const documento = (await client.query(
      'SELECT id_documento, tipo_documento, estado, id_usuario_carga FROM documentos_afiliacion WHERE id_documento = $1 FOR NO KEY UPDATE',
      [idDocumento]
    )).rows[0];
    if (documento.estado !== 'PENDIENTE') {
      throw errorDeNegocio(409, 'Este documento ya se revisó o se reemplazó. Actualice la lista.');
    }
    if (Number(documento.id_usuario_carga) === Number(idUsuario)) {
      throw errorDeNegocio(403, 'Usted subió este documento: lo revisa un colega.', 'REVISION_POR_QUIEN_CARGO');
    }

    await client.query('UPDATE documentos_afiliacion SET estado = $2 WHERE id_documento = $1', [idDocumento, resultado]);
    await client.query(
      `INSERT INTO revisiones_documento (id_documento, resultado, motivo, id_usuario_revisa, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idDocumento, resultado, motivoLimpio || null, idUsuario, ip, userAgentDe(userAgent)]
    );
    const contacto = (await client.query(
      `SELECT COALESCE(u.email, s.email) AS email, COALESCE(p.primer_nombre, s.primer_nombre) AS nombre,
              (u.id_usuario IS NULL) AS sin_portal
       FROM expedientes_documentos e
       LEFT JOIN personas p ON p.id_persona = e.id_persona
       LEFT JOIN usuarios u ON u.id_persona = e.id_persona AND u.id_rol = 3 /* ASOCIADO */ AND u.estado = 'ACTIVO'
       LEFT JOIN solicitudes_afiliacion_agencia s ON s.id_solicitud = e.id_solicitud
       WHERE e.id_expediente = $1`,
      [idExpediente]
    )).rows[0];
    await client.query('COMMIT');

    return {
      documento: {
        id_documento: documento.id_documento,
        tipo_documento: documento.tipo_documento,
        estado: resultado,
        motivo_rechazo: resultado === 'RECHAZADO' ? motivoLimpio : null,
      },
      contacto: { email: contacto?.email || null, nombre: contacto?.nombre || null, sinPortal: contacto?.sin_portal !== false },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Bandeja de documentos del operador: los vigentes de asociados y de solicitudes de agencia (no las cargas previas
 * de una afiliación que todavía no se envió).
 *
 * @async
 * @param {Object} filtros
 * @param {string} [filtros.estado] - PENDIENTE, RECHAZADO o ACEPTADO; cualquier otro valor, todos.
 * @param {string} [filtros.search] - Nombre, DPI, código del asociado o número de caso.
 * @param {number} [filtros.limit=20]
 * @param {number} [filtros.offset=0]
 * @param {number} filtros.idPersonaRevisor - Para marcar los documentos propios (`es_propio`).
 * @param {number} filtros.idUsuarioRevisor - Para marcar los que subió el mismo operador (`cargado_por_mi`).
 * @returns {Promise<{ total: number, conteos: Record<string, number>, por_revisar: number, data: Object[] }>}
 *   `por_revisar`: pendientes que este operador sí puede revisar (ni suyos ni subidos por él).
 */
const bandejaDocumentos = async ({ estado, search, limit = 20, offset = 0, idPersonaRevisor, idUsuarioRevisor }) => {
  const base = `
    FROM documentos_afiliacion d
    JOIN expedientes_documentos e ON e.id_expediente = d.id_expediente
    LEFT JOIN personas p ON p.id_persona = e.id_persona
    LEFT JOIN asociados a ON a.id_persona = e.id_persona
    LEFT JOIN usuarios u ON u.id_persona = e.id_persona AND u.id_rol = 3 /* ASOCIADO */
    LEFT JOIN solicitudes_afiliacion_agencia s ON s.id_solicitud = e.id_solicitud`;
  const filtrosBase = ["d.estado <> 'REEMPLAZADO'", '(e.id_persona IS NOT NULL OR e.id_solicitud IS NOT NULL)'];
  const filtros = [...filtrosBase];
  const params = [];
  if (ESTADOS_BANDEJA.includes(estado)) {
    params.push(estado);
    filtros.push(`d.estado = $${params.length}`);
  }
  const texto = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (texto) {
    params.push(`%${texto}%`);
    const n = params.length;
    filtros.push(`(p.nombre_completo ILIKE $${n} OR e.cui_dpi LIKE $${n} OR u.codigo_corporativo ILIKE $${n}
      OR s.numero_caso ILIKE $${n} OR concat_ws(' ', s.primer_nombre, s.primer_apellido) ILIKE $${n})`);
  }
  const donde = `WHERE ${filtros.join(' AND ')}`;
  const total = (await db.query(`SELECT count(*)::int AS total ${base} ${donde}`, params)).rows[0].total;

  const tope = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const desde = Math.max(parseInt(offset, 10) || 0, 0);
  const orden = estado === 'PENDIENTE' ? 'd.fecha_carga ASC' : 'd.fecha_carga DESC';
  const n = params.length;
  // Documento propio: de la persona del revisor o con su DPI (antes de que exista la persona)
  const esPropio = (k) => `COALESCE(e.id_persona = $${k} OR e.cui_dpi = (SELECT cui_dpi FROM personas WHERE id_persona = $${k}), false)`;
  const { rows } = await db.query(
    `SELECT d.id_documento, d.tipo_documento, d.estado, d.tamano_bytes, d.canal_carga, d.fecha_carga, d.archivo,
            d.id_usuario_carga, r.motivo, r.fecha_revision, ur.codigo_corporativo AS revisado_por,
            a.id_asociado, e.cui_dpi, u.codigo_corporativo, s.numero_caso,
            COALESCE(p.nombre_completo,
              concat_ws(' ', s.primer_nombre, s.segundo_nombre, s.primer_apellido, s.segundo_apellido)) AS nombre,
            ${esPropio(n + 1)} AS es_propio
     ${base}
     LEFT JOIN revisiones_documento r ON r.id_documento = d.id_documento
     LEFT JOIN usuarios ur ON ur.id_usuario = r.id_usuario_revisa
     ${donde}
     ORDER BY ${orden}, d.id_documento
     LIMIT $${n + 2} OFFSET $${n + 3}`,
    [...params, idPersonaRevisor, tope, desde]
  );
  const conteos = Object.fromEntries(ESTADOS_BANDEJA.map((e) => [e, 0]));
  const resumen = await db.query(
    `SELECT d.estado, count(*)::int AS cantidad,
            count(*) FILTER (WHERE NOT ${esPropio(1)} AND d.id_usuario_carga IS DISTINCT FROM $2)::int AS revisables
     ${base} WHERE ${filtrosBase.join(' AND ')} GROUP BY d.estado`,
    [idPersonaRevisor, idUsuarioRevisor]
  );
  let porRevisar = 0;
  resumen.rows.forEach((fila) => {
    conteos[fila.estado] = fila.cantidad;
    if (fila.estado === 'PENDIENTE') porRevisar = fila.revisables;
  });

  return {
    total,
    conteos,
    por_revisar: porRevisar,
    data: rows.map((fila) => ({
      ...formatearDocumento(fila, { conUrl: true, idUsuarioActual: idUsuarioRevisor }),
      revisado_por: fila.revisado_por,
      id_asociado: fila.id_asociado,
      cui_dpi: fila.cui_dpi,
      codigo_corporativo: fila.codigo_corporativo,
      numero_caso: fila.numero_caso,
      nombre: fila.nombre,
      es_propio: Boolean(fila.es_propio),
    })),
  };
};

/**
 * Todas las versiones del mismo tipo de documento en su expediente, de la más reciente a la más antigua, con quién
 * las subió y cómo se revisaron.
 *
 * @async
 * @param {number} idDocumento - Cualquier versión.
 * @returns {Promise<Object[]|null>} null si el documento no existe.
 */
const historialDocumento = async (idDocumento) => {
  const { rows } = await db.query(
    `SELECT v.id_documento, v.tipo_documento, v.estado, v.tamano_bytes, v.canal_carga, v.fecha_carga, v.archivo,
            uc.codigo_corporativo AS cargado_por, r.resultado, r.motivo, r.fecha_revision,
            ur.codigo_corporativo AS revisado_por
     FROM documentos_afiliacion d
     JOIN documentos_afiliacion v ON v.id_expediente = d.id_expediente AND v.tipo_documento = d.tipo_documento
     LEFT JOIN usuarios uc ON uc.id_usuario = v.id_usuario_carga
     LEFT JOIN revisiones_documento r ON r.id_documento = v.id_documento
     LEFT JOIN usuarios ur ON ur.id_usuario = r.id_usuario_revisa
     WHERE d.id_documento = $1
     ORDER BY v.fecha_carga DESC, v.id_documento DESC`,
    [idDocumento]
  );
  if (rows.length === 0) return null;
  return rows.map((fila) => ({
    id_documento: fila.id_documento,
    tipo_documento: fila.tipo_documento,
    estado: fila.estado,
    tamano_bytes: fila.tamano_bytes,
    canal_carga: fila.canal_carga,
    fecha_carga: fila.fecha_carga,
    url: urlDocumento(fila.archivo),
    cargado_por: fila.cargado_por,
    resultado: fila.resultado,
    motivo: fila.motivo,
    fecha_revision: fila.fecha_revision,
    revisado_por: fila.revisado_por,
  }));
};

module.exports = {
  ETIQUETAS,
  listarDocumentos,
  resumirDocumentos,
  documentosConResumen,
  expedienteDePersona,
  expedienteDeAfiliacion,
  expedienteDeSolicitud,
  exigirDocumentosObligatorios,
  vincularExpedienteAPersona,
  subirDocumento,
  revisarDocumento,
  bandejaDocumentos,
  historialDocumento,
};
