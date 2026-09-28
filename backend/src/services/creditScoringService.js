const db = require('../config/db');
const bancoApiService = require('./bancoApiService');

/**
 * Matriz de apalancamiento y capacidad de endeudamiento cooperativo.
 * Calcula el límite máximo de crédito según el saldo total consolidado en cuentas.
 *
 * @param {number} saldoTotal - Saldo consolidado en todas las cuentas activas del asociado.
 * @returns {object} Información de nivel, límite máximo y descripción.
 */
const calcularCapacidadCrediticia = (saldoTotal) => {
  const saldo = Math.max(0, parseFloat(saldoTotal) || 0);

  if (saldo < 1000) {
    return {
      nivel: 'Inicial',
      rangoTexto: 'Q0.00 a Q999.99',
      limiteMaximo: 10000.0,
      descripcion: 'Microcrédito de iniciación (hasta Q10,000.00)',
    };
  }

  if (saldo <= 2500) {
    return {
      nivel: 'Básico',
      rangoTexto: 'Q1,000.00 a Q2,500.00',
      limiteMaximo: 25000.0,
      descripcion: 'Crédito personal básico (hasta Q25,000.00)',
    };
  }

  if (saldo <= 7500) {
    return {
      nivel: 'Intermedio',
      rangoTexto: 'Q2,500.01 a Q7,500.00',
      limiteMaximo: 60000.0,
      descripcion: 'Crédito de consumo y consolidación (hasta Q60,000.00)',
    };
  }

  if (saldo <= 20000) {
    return {
      nivel: 'Avanzado',
      rangoTexto: 'Q7,500.01 a Q20,000.00',
      limiteMaximo: 150000.0,
      descripcion: 'Crédito de inversión y capital de trabajo (hasta Q150,000.00)',
    };
  }

  return {
    nivel: 'Preferencial',
    rangoTexto: 'Más de Q20,000.00',
    limiteMaximo: 500000.0,
    descripcion: 'Crédito preferencial corporativo (hasta Q500,000.00)',
  };
};

/**
 * Evalúa integralmente la capacidad crediticia de un asociado para una solicitud.
 * Consulta cuentas, deudas activas, transacciones recientes y emite dictamen.
 *
 * @param {object} params
 * @param {number} params.idAsociado
 * @param {number} params.idPersona
 * @param {number} params.montoSolicitado
 * @returns {Promise<object>} Evaluación detallada con scoring y dictamen.
 */
const evaluarSolicitudCrediticia = async ({ idAsociado, idPersona, montoSolicitado }) => {
  const monto = Math.max(0, parseFloat(montoSolicitado) || 0);

  // 1. Obtener cuentas bancarias activas (consultando al Core Banking API)
  let cuentasBancarias = [];
  let userCui = null;
  try {
    const cuiRes = await db.query('SELECT cui_dpi FROM personas WHERE id_persona = $1', [idPersona]);
    if (cuiRes.rows.length > 0 && cuiRes.rows[0].cui_dpi) {
      userCui = cuiRes.rows[0].cui_dpi;
      const bcoCuentas = await bancoApiService.obtenerCuentasCliente(userCui);
      if (bcoCuentas.success && Array.isArray(bcoCuentas.data) && bcoCuentas.data.length > 0) {
        cuentasBancarias = bcoCuentas.data.map((c) => ({
          id_cuenta_bancaria: c.id_cuenta_bancaria,
          numero_cuenta_bancaria: c.numero_cuenta_bancaria,
          tipo_cuenta: c.tipo_cuenta,
          saldo_disponible: parseFloat(c.saldo_disponible),
          estado: c.estado,
          etiqueta_tipo: `Cuenta Bancaria de ${c.tipo_cuenta}`,
          origen: 'BANCO',
        }));
      }
    }
  } catch (err) {
    console.warn('[CREDIT SCORING] Aviso al consultar cuentas bancarias en Core Banking API:', err.message);
  }

  // 2. Obtener cuentas cooperativas activas
  const coopRes = await db.query(
    `SELECT 
       c.id_cuenta, 
       c.numero_cuenta, 
       tc.nombre AS tipo_cuenta, 
       c.saldo_disponible, 
       c.estado,
       tc.nombre AS etiqueta_tipo,
       'COOPERATIVA' AS origen
     FROM cuentas c
     JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
     WHERE c.id_asociado = $1 AND c.estado = 'ACTIVA'
     ORDER BY c.id_cuenta ASC`,
    [idAsociado]
  );

  const cuentasCooperativa = coopRes.rows.map((r) => ({
    ...r,
    saldo_disponible: parseFloat(r.saldo_disponible),
    saldo: parseFloat(r.saldo_disponible),
    tipo: r.tipo_cuenta,
  }));

  const totalBanco = cuentasBancarias.reduce((sum, c) => sum + c.saldo_disponible, 0);
  const totalCoop = cuentasCooperativa.reduce((sum, c) => sum + c.saldo_disponible, 0);
  const saldoTotal = Math.round((totalBanco + totalCoop) * 100) / 100;

  // 3. Obtener créditos vigentes / activos (Deuda actual)
  const creditosActivosRes = await db.query(
    `SELECT 
       id_solicitud_credito,
       monto_solicitado,
       plazo_meses,
       cuota_mensual_estimada,
       estado,
       fecha_solicitud,
       fecha_resolucion,
       cuenta_destino_info
     FROM solicitudes_credito
     WHERE id_asociado = $1 AND estado IN ('APROBADA', 'DESEMBOLSADA')
     ORDER BY fecha_solicitud DESC`,
    [idAsociado]
  );

  const creditosActivos = creditosActivosRes.rows.map((c) => ({
    ...c,
    monto_solicitado: parseFloat(c.monto_solicitado),
    cuota_mensual_estimada: parseFloat(c.cuota_mensual_estimada),
  }));

  const deudaActiva = Math.round(
    creditosActivos.reduce((sum, c) => sum + c.monto_solicitado, 0) * 100
  ) / 100;

  // 4. Conteo de solicitudes activas en evaluación (máximo 2 simultáneas)
  const pendientesRes = await db.query(
    `SELECT COUNT(*) AS total_pendientes
     FROM solicitudes_credito
     WHERE id_asociado = $1 
       AND estado IN ('PENDIENTE', 'PENDIENTE_FIRMA', 'EN_REVISION_OPERADOR', 'EN_AUTORIZACION_EJECUTIVO', 'DEVUELTA_OPERADOR')`,
    [idAsociado]
  );
  const solicitudesPendientesCount = parseInt(pendientesRes.rows[0]?.total_pendientes || 0, 10);

  // 5. Aplicar matriz de capacidad de endeudamiento
  const capacidad = calcularCapacidadCrediticia(saldoTotal);
  const limiteMaximo = capacidad.limiteMaximo;
  const cupoDisponible = Math.max(0, Math.round((limiteMaximo - deudaActiva) * 100) / 100);
  const deudaProyectada = Math.round((deudaActiva + monto) * 100) / 100;
  const porcentajeEndeudamiento =
    limiteMaximo > 0
      ? Math.round((deudaProyectada / limiteMaximo) * 1000) / 10
      : 100;

  // 6. Determinar dictamen y diagnóstico del sistema
  let dictamen = 'APTO';
  let badgeColor = 'emerald';
  let diagnostico = '';

  if (monto > cupoDisponible || porcentajeEndeudamiento > 100) {
    dictamen = 'NO_APTO';
    badgeColor = 'red';
    diagnostico = `NO APTO: El monto solicitado de Q${monto.toLocaleString('es-GT', { minimumFractionDigits: 2 })} sobrepasa el cupo disponible de endeudamiento (Q${cupoDisponible.toLocaleString('es-GT', { minimumFractionDigits: 2 })}). Su saldo consolidado de Q${saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })} le otorga una capacidad de hasta Q${limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}, y su endeudamiento proyectado alcanzaría el ${porcentajeEndeudamiento}%.`;
  } else if (porcentajeEndeudamiento > 75) {
    dictamen = 'CONDICIONADO';
    badgeColor = 'amber';
    diagnostico = `CONDICIONADO: El crédito solicitado eleva el nivel de endeudamiento al ${porcentajeEndeudamiento}% de su capacidad máxima (Q${limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}). Se recomienda verificar la constancia de ingresos en su historial de transacciones.`;
  } else {
    dictamen = 'APTO';
    badgeColor = 'emerald';
    diagnostico = `APTO: El asociado califica con bajo nivel de endeudamiento (${porcentajeEndeudamiento}% de su capacidad máxima de Q${limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}). Saldo consolidado en cuentas: Q${saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}.`;
  }

  // 7. Historial consolidado de movimientos y transacciones (últimos 30)
  let movsBanco = [];
  if (userCui) {
    try {
      const bcoHist = await bancoApiService.obtenerHistorialFinanciero(userCui);
      if (bcoHist.success && Array.isArray(bcoHist.movimientos)) {
        movsBanco = bcoHist.movimientos.map((m) => ({
          origen: 'BANCO',
          cuenta_etiqueta: `Cuenta ${m.tipo_cuenta} (${m.numero_cuenta})`,
          tipo_movimiento: m.tipo_movimiento,
          tipo: m.tipo_movimiento,
          monto: parseFloat(m.monto),
          saldo_anterior: parseFloat(m.saldo_anterior),
          saldo_nuevo: parseFloat(m.saldo_posterior),
          descripcion: m.concepto,
          referencia: m.referencia,
          fecha: m.fecha_movimiento,
        }));
      }
    } catch (errBco) {
      console.warn('[CREDIT SCORING] Aviso al consultar historial en Core Banking API:', errBco.message);
    }
  }

  const coopTxQuery = `
    SELECT 
      'COOPERATIVA' AS origen,
      ('Cooperativa ' || tc.nombre || ' (' || c.numero_cuenta || ')') AS cuenta_etiqueta,
      CASE WHEN t.tipo_transaccion IN ('DEPOSITO', 'TRANSFERENCIA') THEN 'CREDITO' ELSE 'DEBITO' END AS tipo_movimiento,
      CASE WHEN t.tipo_transaccion IN ('DEPOSITO', 'TRANSFERENCIA') THEN 'CREDITO' ELSE 'DEBITO' END AS tipo,
      t.monto,
      t.saldo_anterior,
      t.saldo_nuevo,
      t.tipo_transaccion AS descripcion,
      t.referencia,
      t.fecha_transaccion AS fecha
    FROM transacciones t
    JOIN cuentas c ON t.id_cuenta = c.id_cuenta
    JOIN tipos_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
    WHERE c.id_asociado = $1
    ORDER BY t.fecha_transaccion DESC
    LIMIT 30;
  `;
  const coopTxRes = await db.query(coopTxQuery, [idAsociado]);
  const movsCoop = coopTxRes.rows.map((t) => ({
    ...t,
    monto: parseFloat(t.monto),
    saldo_anterior: parseFloat(t.saldo_anterior),
    saldo_nuevo: parseFloat(t.saldo_nuevo),
  }));

  const transacciones = [...movsBanco, ...movsCoop]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 30);

  const diagnosticos = [
    `Saldo total consolidado en cuentas: Q${saldoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
    `Capacidad máxima asignada por política: Q${limiteMaximo.toLocaleString('es-GT', { minimumFractionDigits: 2 })} (${capacidad.nivel})`,
    deudaActiva > 0
      ? `Deuda activa en créditos vigentes: Q${deudaActiva.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
      : 'Sin créditos activos registrados.',
    `Cupo disponible para nuevo crédito: Q${cupoDisponible.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
    `Endeudamiento proyectado con esta solicitud: ${porcentajeEndeudamiento}% de su capacidad máxima`,
  ];

  return {
    // Propiedades directas
    saldoTotal,
    totalBanco,
    totalCoop,
    cuentasBancarias,
    cuentasCooperativa,
    deudaActiva,
    creditosActivos,
    solicitudesPendientesCount,
    capacidad: {
      nivel: capacidad.nivel,
      rangoTexto: capacidad.rangoTexto,
      limiteMaximo,
      cupoDisponible,
      descripcion: capacidad.descripcion,
    },
    evaluacion: {
      montoSolicitado: monto,
      deudaProyectada,
      porcentajeEndeudamiento,
      dictamen,
      badgeColor,
      diagnostico,
      diagnosticos,
    },
    transacciones,

    // Aliases para la evaluación y expediente del operador
    solicitante: {
      saldoTotal,
      totalBanco,
      totalCoop,
      deudaActiva,
      solicitudesPendientesCount,
      cuentasBancarias,
      cuentasCooperativa,
      cuentas: cuentasCooperativa,
      creditosActivos,
    },
    analisisSolicitud: {
      montoSolicitado: monto,
      deudaProyectada,
      porcentajeEndeudamiento,
      cupoDisponible,
      dictamen,
      badgeColor,
      diagnostico,
      diagnosticos,
    },
    transaccionesRecientes: transacciones,
  };
};

module.exports = {
  calcularCapacidadCrediticia,
  evaluarSolicitudCrediticia,
};
