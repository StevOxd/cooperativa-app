const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { errorDeNegocio } = require('./errores');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

/**
 * Guarda un archivo codificado en Base64 en el sistema de archivos del servidor.
 * Arquitectura escalable: el archivo reside en disco y la BD almacena la URL/ruta y metadatos.
 * 
 * @param {string} base64Data - Cadena Base64 pura o Data URI ('data:application/pdf;base64,...')
 * @param {string} subfolder - Subdirectorio dentro de uploads (ej. 'creditos')
 * @param {string} originalName - Nombre del archivo original proporcionado por el usuario
 * @param {string} prefix - Prefijo para el archivo generado (ej. 'solicitud')
 * @returns {Promise<{ relativeUrl: string, filename: string, sizeBytes: number }>}
 */
const saveBase64File = async (base64Data, subfolder = 'creditos', originalName = 'formulario.pdf', prefix = 'doc') => {
  if (!base64Data || typeof base64Data !== 'string') {
    throw errorDeNegocio(400, 'Datos de archivo inválidos o vacíos.');
  }

  // Extraer extensión del nombre original o del tipo MIME
  let extension = path.extname(originalName).toLowerCase();
  let cleanBase64 = base64Data;

  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mime = matches[1].toLowerCase();
      cleanBase64 = matches[2];
      if (!extension) {
        if (mime.includes('pdf')) extension = '.pdf';
        else if (mime.includes('png')) extension = '.png';
        else if (mime.includes('jpeg') || mime.includes('jpg')) extension = '.jpg';
      }
    }
  }

  if (!extension) {
    extension = '.pdf';
  }

  // Normalizar extensiones permitidas
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  if (!allowedExtensions.includes(extension)) {
    throw errorDeNegocio(400, `Extensión de archivo "${extension}" no permitida. Solo se aceptan PDF o imágenes.`);
  }

  const targetDir = path.join(UPLOADS_ROOT, subfolder);
  await fs.promises.mkdir(targetDir, { recursive: true });

  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanPrefix}_${timestamp}_${randomSuffix}${extension}`;
  const fullPath = path.join(targetDir, filename);

  const buffer = Buffer.from(cleanBase64, 'base64');
  await fs.promises.writeFile(fullPath, buffer);

  const relativeUrl = `/api/uploads/${subfolder}/${filename}`;

  return {
    relativeUrl,
    filename,
    sizeBytes: buffer.length,
    fullPath,
  };
};

/**
 * Borra un archivo que se guardó para una operación que no se completó (issue #63), para no dejar documentos que
 * ninguna solicitud usa. Si ya no existe, no hace nada.
 *
 * @param {{ fullPath?: string }|null} archivo - Lo que devolvió `saveBase64File`.
 * @returns {Promise<void>}
 */
const eliminarArchivoGuardado = async (archivo) => {
  if (!archivo?.fullPath) return;
  await fs.promises.unlink(archivo.fullPath).catch((error) => {
    if (error.code !== 'ENOENT') console.warn(`[WARN] No se pudo borrar ${archivo.fullPath}:`, error.message);
  });
};

/**
 * Borra el PDF de una solicitud de crédito que no se completó, salvo que una solicitud lo tenga: un UPDATE o un
 * COMMIT que informó un error pudo aplicarse igual. Sin poder comprobarlo, el archivo se conserva.
 *
 * @param {{ relativeUrl: string, fullPath: string }|null} archivo - El resultado de `saveBase64File`.
 * @returns {Promise<void>}
 */
const eliminarPdfDeCreditoSinUso = async (archivo) => {
  if (!archivo) return;
  const enUso = await db.query('SELECT 1 FROM solicitudes_credito WHERE documento_firmado_url = $1', [archivo.relativeUrl])
    .then((r) => r.rowCount > 0)
    .catch(() => true);
  if (!enUso) await eliminarArchivoGuardado(archivo);
};

module.exports = {
  saveBase64File,
  eliminarArchivoGuardado,
  eliminarPdfDeCreditoSinUso,
  UPLOADS_ROOT,
};
