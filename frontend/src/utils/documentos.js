/**
 * Documentos de afiliación: catálogo, estados y preparación del archivo antes de subirlo.
 *
 * El servidor vuelve a validar todo (formato por contenido y 5 MB); aquí se valida para avisar antes de enviar.
 */

export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const ACCEPT_DOCUMENTO = 'application/pdf,image/jpeg,image/png';

// En el celular, el selector de archivos ya ofrece tomar la foto o elegirla de la galería
export const TIPOS_DOCUMENTO = [
  {
    id: 'DPI_FRENTE',
    label: 'DPI (frente)',
    hint: 'Foto o escaneo del frente completo, con el número legible y sin reflejos.',
    obligatorio: true,
  },
  {
    id: 'DPI_REVERSO',
    label: 'DPI (reverso)',
    hint: 'El reverso completo, con las cuatro esquinas a la vista.',
    obligatorio: true,
  },
  {
    id: 'RECIBO_SERVICIOS',
    label: 'Recibo de servicios',
    hint: 'Agua, luz o teléfono de los últimos tres meses, donde se lea su dirección.',
    obligatorio: true,
  },
  {
    id: 'FOTO_CON_DPI',
    label: 'Foto sosteniendo el DPI',
    hint: 'Una foto de su rostro sosteniendo el DPI junto a la cara; deben verse los dos.',
    obligatorio: true,
  },
  {
    id: 'CONSTANCIA_INGRESOS',
    label: 'Constancia de ingresos o laboral',
    hint: 'Ayuda a evaluar sus solicitudes de crédito.',
    obligatorio: false,
  },
];

export const OBLIGATORIOS = TIPOS_DOCUMENTO.filter((t) => t.obligatorio).map((t) => t.id);

export const etiquetaDocumento = (tipo) => TIPOS_DOCUMENTO.find((t) => t.id === tipo)?.label || tipo;

export const ESTADO_DOCUMENTO = {
  FALTA: { label: 'Falta', tone: 'neutral' },
  PENDIENTE: { label: 'En revisión', tone: 'warning' },
  ACEPTADO: { label: 'Aceptado', tone: 'success' },
  RECHAZADO: { label: 'Rechazado', tone: 'danger' },
  REEMPLAZADO: { label: 'Reemplazado', tone: 'neutral' },
};

export const CANAL_CARGA = {
  EN_LINEA: 'En línea',
  PERSONAL: 'Perfil del colaborador',
  PORTAL: 'Portal del asociado',
  VENTANILLA: 'Ventanilla',
};

/**
 * Tamaño legible de un archivo.
 *
 * @param {number} bytes
 * @returns {string}
 */
export const formatoTamano = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Formato real del archivo según sus primeros bytes.
 *
 * @param {Blob} archivo
 * @returns {Promise<'application/pdf'|'image/jpeg'|'image/png'|null>}
 */
const detectarFormato = async (archivo) => {
  const b = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  return null;
};

const LADO_MAXIMO_FOTO = 2000;

/**
 * Vuelve a codificar una foto como JPEG de hasta 2000 px por lado: pesa menos (las del celular suelen pasar de
 * 5 MB) y pierde los metadatos, como la ubicación donde se tomó. Si el navegador no puede, se usa el original.
 *
 * @param {Blob} archivo - JPG o PNG.
 * @returns {Promise<Blob>}
 */
const reducirFoto = async (archivo) => {
  try {
    const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    const contexto = lienzo.getContext('2d');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close?.();
    const reducida = await new Promise((resolve) => lienzo.toBlob(resolve, 'image/jpeg', 0.85));
    return reducida && reducida.size > 0 ? reducida : archivo;
  } catch {
    return archivo;
  }
};

const leerComoDataUrl = (archivo) =>
  new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo. Vuelva a seleccionarlo.'));
    lector.readAsDataURL(archivo);
  });

/**
 * Valida el archivo elegido y lo convierte en el Data URI que espera el servidor. Las fotos se reducen antes.
 *
 * @param {File} archivo
 * @returns {Promise<string>} `data:<mime>;base64,…`
 * @throws {Error} con un mensaje para el usuario si no es PDF, JPG o PNG o si pasa de 5 MB.
 */
export const prepararDocumento = async (archivo) => {
  if (!archivo) throw new Error('Seleccione un archivo.');
  const formato = await detectarFormato(archivo);
  if (!formato) throw new Error('Solo se aceptan archivos PDF, JPG o PNG.');
  const final = formato === 'application/pdf' ? archivo : await reducirFoto(archivo);
  if (final.size > TAMANO_MAXIMO_BYTES) {
    throw new Error(`El archivo pesa ${formatoTamano(final.size)}; el máximo es 5 MB.`);
  }
  const tipoFinal = final === archivo ? formato : 'image/jpeg';
  const dataUrl = await leerComoDataUrl(final);
  // El tipo lo decide el contenido, no la extensión ni lo que diga el sistema operativo
  return dataUrl.replace(/^data:[^,]*,/, `data:${tipoFinal};base64,`);
};
