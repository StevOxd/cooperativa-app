/**
 * Servicio Cliente HTTP para la Entidad Bancaria Corporativa (Core Banking API)
 * Permite a la Cooperativa interactuar con el Core Bancario de forma desacoplada
 * Incluye resiliencia de red con timeouts preventivos (ARQ-02).
 */

const getBaseUrl = () => {
  return process.env.BANCO_API_URL || 'http://localhost:5002';
};

const DEFAULT_TIMEOUT_MS = parseInt(process.env.BANCO_API_TIMEOUT_MS || '6000', 10);

/**
 * Envoltorio HTTP con timeout preventivo usando AbortController (ARQ-02)
 * Evita la degradación en cascada del backend de la Cooperativa si el Core Bancario experimenta latencia o caídas.
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    // Sin valor por defecto: server.js no arranca si falta BANCO_INTERNAL_API_KEY.
    'x-banco-api-key': process.env.BANCO_INTERNAL_API_KEY,
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutErr = new Error(`Tiempo de espera agotado (${timeoutMs}ms) al comunicar con el Core Bancario.`);
      timeoutErr.name = 'TimeoutError';
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw error;
  }
};

/**
 * Normaliza los errores de red o timeouts para respuestas uniformes de API
 */
const formatCatchError = (error, defaultMsg, extraData = {}) => {
  const isTimeout = error.name === 'TimeoutError' || error.isTimeout;
  const status = isTimeout ? 504 : 503;
  const message = isTimeout
    ? 'Tiempo de espera agotado al conectar con el Core Bancario. Por favor reintente la operación.'
    : defaultMsg;

  return {
    success: false,
    status,
    message,
    error: error.message,
    ...extraData,
  };
};

/**
 * 1. Verifica si un CUI / DPI pertenece a un cliente de la Entidad Bancaria
 */
const verificarDpi = async (cui_dpi) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/clientes/verificar-dpi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cui_dpi }),
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al verificar DPI:', error.message);
    return formatCatchError(error, 'No fue posible conectarse con el Core Bancario de la Entidad Bancaria.');
  }
};

/**
 * 2. Valida las credenciales de Banca en Línea del cliente (3 factores: Usuario, Código, Contraseña)
 */
const validarCredenciales = async ({ cui_dpi, nombre_usuario, codigo, password }) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/auth/validar-credenciales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cui_dpi, nombre_usuario, codigo, password }),
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al validar credenciales bancarias:', error.message);
    return formatCatchError(error, 'Error de comunicación con la plataforma de Banca en Línea de la Entidad Bancaria.');
  }
};

/**
 * 3. Obtiene las cuentas monetarias y de ahorro activas de un cliente por su DPI
 */
const obtenerCuentasCliente = async (cui_dpi) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/clientes/${encodeURIComponent(cui_dpi)}/cuentas`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al obtener cuentas del cliente:', error.message);
    return formatCatchError(error, 'Error al consultar cuentas en la Entidad Bancaria.', { data: [] });
  }
};

/**
 * 4. Consulta el saldo y titular de una cuenta bancaria específica
 */
const consultarCuenta = async (numero_cuenta) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/cuentas/${encodeURIComponent(numero_cuenta)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al consultar cuenta:', error.message);
    return formatCatchError(error, 'Error de conexión con la Entidad Bancaria.');
  }
};

/**
 * 5. Ejecuta un débito atómico en una cuenta bancaria (ej. aportación inicial a la cooperativa o traslados)
 */
const debitarCuenta = async ({ numero_cuenta, cui_dpi, monto, concepto, referencia }) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/cuentas/debitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // cui_dpi (opcional): el banco rechaza el débito si la cuenta no es de ese DPI.
      body: JSON.stringify({ numero_cuenta, cui_dpi, monto, concepto, referencia }),
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al procesar débito en cuenta bancaria:', error.message);
    return formatCatchError(error, 'Error de comunicación al debitar fondos en la Entidad Bancaria.');
  }
};

/**
 * 6. Ejecuta una acreditación atómica en una cuenta bancaria (ej. desembolso de préstamo concedido por cooperativa)
 */
const acreditarCuenta = async ({ numero_cuenta, monto, concepto, referencia }) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/cuentas/acreditar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero_cuenta, monto, concepto, referencia }),
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al acreditar cuenta bancaria:', error.message);
    return formatCatchError(error, 'Error de comunicación al acreditar fondos en la Entidad Bancaria.');
  }
};

/**
 * 7. Obtiene historial financiero para evaluación de Credit Scoring
 */
const obtenerHistorialFinanciero = async (cui_dpi) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/clientes/${encodeURIComponent(cui_dpi)}/historial`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al obtener historial financiero:', error.message);
    return formatCatchError(error, 'Error al consultar historial financiero en la Entidad Bancaria.', { cuentas: [], movimientos: [] });
  }
};

/**
 * 8. Obtiene cuentas demo para pruebas de interfaces
 */
const getCuentasDemo = async () => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/demo/cuentas`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al obtener cuentas demo:', error.message);
    return formatCatchError(error, 'Error al obtener cuentas demo de la Entidad Bancaria.', { data: [] });
  }
};

/**
 * 9. Apertura una cuenta de ahorro o monetaria en el Core Bancario
 */
const aperturarCuentaBancaria = async (datos) => {
  try {
    const res = await fetchWithTimeout(`${getBaseUrl()}/api/banco/v1/cuentas/aperturar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });

    const data = await res.json();
    return {
      status: res.status,
      ...data,
    };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al aperturar cuenta bancaria:', error.message);
    return formatCatchError(error, 'Error de comunicación al aperturar cuenta en la Entidad Bancaria.');
  }
};

/**
 * Consulta un movimiento del banco por su referencia y tipo (conciliación de operaciones sin confirmar).
 *
 * @param {string} referencia
 * @param {'DEBITO'|'CREDITO'} tipo
 * @returns {Promise<Object>} `{ success, status, data? }`; 404 si el banco no tiene ese movimiento.
 */
const consultarMovimiento = async (referencia, tipo) => {
  try {
    const res = await fetchWithTimeout(
      `${getBaseUrl()}/api/banco/v1/movimientos/${encodeURIComponent(referencia)}?tipo=${encodeURIComponent(tipo)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    const data = await res.json();
    return { status: res.status, ...data };
  } catch (error) {
    console.error('[BANCO API SERVICE] Error al consultar movimiento:', error.message);
    return formatCatchError(error, 'Error de conexión con la Entidad Bancaria.');
  }
};

/**
 * Referencia fija de una operación con el banco: su número (`CASO-2026-0001`, `SOL-CRED-7`) y el segundo en que se
 * creó la solicitud. Se repite en cada intento de la misma operación, pero no en una solicitud con el mismo número
 * de otra instalación de la base de datos (el banco conserva sus movimientos).
 *
 * @param {string} base
 * @param {Date|string} creada - Fecha de creación de la solicitud.
 * @returns {string}
 * @throws {Error} si la fecha no es válida.
 */
const referenciaDeOperacion = (base, creada) => {
  const segundos = Math.floor(new Date(creada).getTime() / 1000);
  if (!creada || !Number.isFinite(segundos)) throw new Error(`La solicitud ${base} no tiene fecha de creación.`);
  return `${base}-${segundos}`;
};

/**
 * Mensaje para una operación que el banco rechazó por su referencia: ya la tiene con otra cuenta u otro monto
 * (`REFERENCIA_USADA`), o se revirtió en todos los intentos (`REFERENCIA_REVERTIDA`).
 *
 * @param {Object} respuesta - Respuesta de `bancoApiService`.
 * @returns {string|null} El mensaje, o null si el rechazo no es por la referencia.
 */
const mensajePorReferencia = (respuesta) => {
  const ref = respuesta?.referencia_usada ? ` (referencia ${respuesta.referencia_usada})` : '';
  if (respuesta?.error === 'REFERENCIA_USADA') {
    return `El banco ya tiene esta operación con otra cuenta o con otro monto${ref}. No la repita: pida al administrador que la revise con el banco.`;
  }
  if (respuesta?.error === 'REFERENCIA_REVERTIDA') {
    return `Esta operación se intentó y se revirtió varias veces en el banco${ref}. Pida al administrador que la revise antes de repetirla.`;
  }
  return null;
};

/**
 * Débito, acreditación o apertura con la referencia fija de una operación (`referenciaDeOperacion`). El banco es
 * idempotente por referencia: un reintento tras un tiempo agotado no mueve el dinero dos veces (la respuesta trae
 * `idempotente: true`). Si responde que esa referencia se revirtió en un intento anterior
 * (`REFERENCIA_REVERTIDA`), se reintenta con un sufijo (`-2`, `-3`…). La respuesta trae `referencia_usada`, la
 * que hay que usar para revertir.
 *
 * Llama a los métodos por `module.exports` para que las pruebas puedan simular el banco.
 *
 * @param {'debitarCuenta'|'acreditarCuenta'|'aperturarCuentaBancaria'} metodo
 * @param {Object} datos - Los del método, con `referencia`.
 * @returns {Promise<Object>} La respuesta del banco más `referencia_usada`.
 */
const conReferenciaDeOperacion = async (metodo, datos) => {
  let respuesta = null;
  for (let intento = 1; intento <= 5; intento += 1) {
    const referencia = intento === 1 ? datos.referencia : `${datos.referencia}-${intento}`;
    respuesta = { ...(await module.exports[metodo]({ ...datos, referencia })), referencia_usada: referencia };
    if (!(respuesta.status === 409 && respuesta.error === 'REFERENCIA_REVERTIDA')) return respuesta;
  }
  return respuesta;
};

/** Débito con la referencia fija de una operación. Ver `conReferenciaDeOperacion`. */
const debitarConReferenciaDeOperacion = (datos) => conReferenciaDeOperacion('debitarCuenta', datos);

/** Acreditación con la referencia fija de una operación. Ver `conReferenciaDeOperacion`. */
const acreditarConReferenciaDeOperacion = (datos) => conReferenciaDeOperacion('acreditarCuenta', datos);

/** Apertura con depósito inicial y la referencia fija de una operación. Ver `conReferenciaDeOperacion`. */
const aperturarConReferenciaDeOperacion = (datos) => conReferenciaDeOperacion('aperturarCuentaBancaria', datos);

module.exports = {
  referenciaDeOperacion,
  mensajePorReferencia,
  debitarConReferenciaDeOperacion,
  acreditarConReferenciaDeOperacion,
  aperturarConReferenciaDeOperacion,
  consultarMovimiento,
  verificarDpi,
  validarCredenciales,
  obtenerCuentasCliente,
  consultarCuenta,
  debitarCuenta,
  acreditarCuenta,
  obtenerHistorialFinanciero,
  getCuentasDemo,
  aperturarCuentaBancaria,
};
