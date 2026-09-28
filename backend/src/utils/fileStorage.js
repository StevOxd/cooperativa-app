const fs = require('fs');
const path = require('path');

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
    throw new Error('Datos de archivo inválidos o vacíos.');
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
    throw new Error(`Extensión de archivo "${extension}" no permitida. Solo se aceptan PDF o imágenes.`);
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

module.exports = {
  saveBase64File,
  UPLOADS_ROOT,
};
