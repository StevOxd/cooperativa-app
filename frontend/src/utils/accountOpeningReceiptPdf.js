import {
  createDoc,
  drawFooters,
  drawHeader,
  fieldsGrid,
  fileSafe,
  highlightBox,
  money,
  noteBox,
  sectionTitle,
  shortDate,
  signatures,
} from './pdf/pdfKit';

/** Cómo entró el dinero de la apertura. */
const MEDIOS = {
  EFECTIVO_VENTANILLA: 'Efectivo en ventanilla',
  CUENTA_INTERNA: 'Débito de otra cuenta del asociado',
  BANCO_EXTERNO: 'Transferencia desde el banco',
};

/**
 * Acepta los datos planos (afiliación en ventanilla) o agrupados en
 * `{ asociado, cuenta, deposito }` (apertura de una cuenta nueva) y los deja planos.
 */
const normalize = (data = {}) => {
  if (!data.cuenta && !data.asociado) return data;
  const { asociado = {}, cuenta = {}, deposito = {} } = data;
  return {
    ...asociado,
    numero_cuenta: cuenta.numero_cuenta,
    tipo_cuenta: cuenta.tipo_cuenta,
    fecha_apertura: cuenta.fecha_apertura,
    saldo_inicial: deposito.monto ?? cuenta.saldo_disponible,
    metodo_pago: deposito.metodo_pago,
    operador_nombre: data.operador_nombre,
  };
};

/** Lo que pasó con el acceso al portal en la afiliación; nunca afirma un envío que no ocurrió. */
const textoAccesoPortal = (d) => {
  if (d.acceso_existente) {
    return 'El titular conserva su acceso al portal con su usuario y su contraseña de siempre.';
  }
  if (!d.usuario || d.acceso_portal === false) {
    return 'Afiliado sin acceso al portal. Cuando lo desee, puede solicitarlo en cualquier agencia con su DPI; se le enviará a su correo.';
  }
  if (d.correo_enviado === false) {
    return 'El correo con la contraseña temporal no se pudo enviar. Puede pedir que se le reenvíe en cualquier agencia con su DPI.';
  }
  return 'La contraseña temporal se envió al correo del titular y nadie más la conoce, tampoco el operador. Al entrar por primera vez, el sistema le pedirá crear una nueva.';
};

/**
 * Genera y descarga el comprobante de apertura de cuenta y depósito inicial.
 *
 * @param {Object} params
 * @param {Object} params.data - Datos de la cuenta y del titular (planos o agrupados).
 * @returns {jsPDF} El documento, ya descargado.
 */
export const generateAccountOpeningReceiptPdf = ({ data }) => {
  const d = normalize(data);
  const doc = createDoc();
  const esAfiliacion = Boolean(d.numero_caso || d.usuario || d.es_afiliacion);

  let y = drawHeader(doc, {
    title: esAfiliacion ? 'Comprobante de afiliación y apertura de cuenta' : 'Comprobante de apertura de cuenta',
    reference: d.numero_caso || d.numero_cuenta,
  });

  y = highlightBox(doc, y, {
    label: 'Cuenta abierta',
    value: d.numero_cuenta,
    mono: true,
    detail: [d.tipo_cuenta, d.fecha_apertura ? `abierta el ${shortDate(d.fecha_apertura)}` : null].filter(Boolean).join(' · '),
    aside: { label: 'Depósito inicial', value: money(d.saldo_inicial) },
  });

  y = sectionTitle(doc, y, 'Titular');
  y = fieldsGrid(doc, y, [
    { label: 'Nombre', value: d.nombre_completo, strong: true },
    { label: 'DPI', value: d.cui_dpi, mono: true },
    { label: 'Correo', value: d.email },
    { label: 'Teléfono', value: d.telefono },
    ...(d.usuario ? [{ label: 'Usuario del portal', value: d.usuario, mono: true }] : []),
  ]);

  y = sectionTitle(doc, y, 'Operación');
  y = fieldsGrid(doc, y, [
    ...(d.numero_caso ? [{ label: 'Número de caso', value: d.numero_caso, mono: true }] : []),
    { label: 'Concepto', value: 'Apertura de cuenta y depósito inicial' },
    { label: 'Medio de pago', value: MEDIOS[d.metodo_pago] || MEDIOS.EFECTIVO_VENTANILLA },
    { label: 'Monto acreditado', value: money(d.saldo_inicial), strong: true },
    { label: 'Atendió', value: d.operador_nombre },
  ]);

  if (esAfiliacion) {
    y = noteBox(doc, y, {
      tone: 'brand',
      title: 'Acceso al portal',
      text: textoAccesoPortal(d),
    });
  }

  signatures(doc, y + 4, [
    { name: d.nombre_completo, role: 'Firma del titular', detail: d.cui_dpi ? `DPI ${d.cui_dpi}` : undefined, mono: true },
    { name: d.operador_nombre || 'Operador de ventanilla', role: 'Firma y sello de ventanilla' },
  ]);

  drawFooters(doc, 'Comprobante de apertura y depósito inicial');
  doc.save(`Comprobante_apertura_${fileSafe(d.numero_cuenta) || 'cuenta'}.pdf`);
  return doc;
};
