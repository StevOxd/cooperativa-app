const { pool } = require('../config/db');

/**
 * 1. Verifica si un DPI pertenece a un cliente de la Entidad Bancaria
 */
const verificarDpi = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi } = req.body;

    if (!cui_dpi) {
      return res.status(400).json({
        success: false,
        message: 'Debe ingresar el CUI/DPI a verificar.',
      });
    }

    const cleanCui = String(cui_dpi).trim().replace(/\s+/g, '');

    const query = `
      SELECT 
        c.id_cliente, c.cui_dpi, c.nombre_completo, c.tipo_cliente, c.estado,
        u.nombre_usuario, u.codigo_bancario,
        COUNT(cb.id_cuenta_bancaria) FILTER (WHERE cb.estado = 'ACTIVA') AS cuentas_activas_count
      FROM clientes_banco c
      LEFT JOIN usuarios_banca_en_linea u ON c.id_cliente = u.id_cliente
      LEFT JOIN cuentas_bancarias cb ON c.id_cliente = cb.id_cliente
      WHERE c.cui_dpi = $1
      GROUP BY c.id_cliente, c.cui_dpi, c.nombre_completo, c.tipo_cliente, c.estado, u.nombre_usuario, u.codigo_bancario
    `;
    const result = await client.query(query, [cleanCui]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        existe_en_banco: false,
        message: 'El CUI / DPI no se encuentra registrado como cliente en la Entidad Bancaria.',
      });
    }

    const row = result.rows[0];
    const cuentasActivas = parseInt(row.cuentas_activas_count, 10);

    return res.status(200).json({
      success: true,
      existe_en_banco: true,
      cliente: {
        id_cliente: row.id_cliente,
        cui_dpi: row.cui_dpi,
        nombre_completo: row.nombre_completo,
        tipo_cliente: row.tipo_cliente,
      },
      tiene_cuentas_activas: cuentasActivas > 0,
      cuentas_activas_count: cuentasActivas,
      message: cuentasActivas > 0 
        ? 'Cliente bancario verificado con cuentas activas.' 
        : 'El cliente existe pero no posee cuentas activas en la entidad bancaria.',
    });
  } catch (error) {
    console.error('[BANCO CLIENTES ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al consultar cliente en la Entidad Bancaria.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

/**
 * 2. Obtiene las cuentas bancarias de un cliente por su CUI/DPI
 */
const obtenerCuentasCliente = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi } = req.params;
    const cleanCui = String(cui_dpi).trim().replace(/\s+/g, '');

    const query = `
      SELECT 
        cb.id_cuenta_bancaria, cb.numero_cuenta, cb.tipo_cuenta, cb.saldo_disponible, cb.estado,
        c.cui_dpi, c.nombre_completo, c.tipo_cliente
      FROM cuentas_bancarias cb
      JOIN clientes_banco c ON cb.id_cliente = c.id_cliente
      WHERE c.cui_dpi = $1 AND cb.estado = 'ACTIVA'
      ORDER BY CASE WHEN cb.tipo_cuenta = 'MONETARIA' THEN 1 ELSE 2 END, cb.id_cuenta_bancaria ASC
    `;
    const result = await client.query(query, [cleanCui]);

    return res.status(200).json({
      success: true,
      data: result.rows.map((r) => ({
        id_cuenta_bancaria: r.id_cuenta_bancaria,
        numero_cuenta_bancaria: r.numero_cuenta,
        tipo_cuenta: r.tipo_cuenta,
        saldo_disponible: parseFloat(r.saldo_disponible),
        estado: r.estado,
        titular_cui: r.cui_dpi,
        titular_nombre: r.nombre_completo,
        tipo_cliente: r.tipo_cliente,
      })),
    });
  } catch (error) {
    console.error('[BANCO CLIENTES CUENTAS ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener cuentas del cliente en la Entidad Bancaria.',
    });
  } finally {
    client.release();
  }
};

/**
 * 3. Obtiene el historial financiero de un cliente para evaluación de Credit Scoring
 */
const obtenerHistorialFinanciero = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi } = req.params;
    const cleanCui = String(cui_dpi).trim().replace(/\s+/g, '');

    // Cuentas y saldo total
    const cuentasRes = await client.query(`
      SELECT cb.id_cuenta_bancaria, cb.numero_cuenta, cb.tipo_cuenta, cb.saldo_disponible, cb.estado
      FROM cuentas_bancarias cb
      JOIN clientes_banco c ON cb.id_cliente = c.id_cliente
      WHERE c.cui_dpi = $1 AND cb.estado = 'ACTIVA'
    `, [cleanCui]);

    // Movimientos recientes
    const movsRes = await client.query(`
      SELECT 
        m.id_movimiento, cb.numero_cuenta, cb.tipo_cuenta, m.tipo_movimiento,
        m.monto, m.saldo_anterior, m.saldo_posterior, m.concepto, m.referencia, m.fecha_movimiento
      FROM movimientos_bancarios m
      JOIN cuentas_bancarias cb ON m.id_cuenta_bancaria = cb.id_cuenta_bancaria
      JOIN clientes_banco c ON cb.id_cliente = c.id_cliente
      WHERE c.cui_dpi = $1
      ORDER BY m.fecha_movimiento DESC
      LIMIT 50
    `, [cleanCui]);

    return res.status(200).json({
      success: true,
      cuentas: cuentasRes.rows.map((r) => ({
        ...r,
        saldo_disponible: parseFloat(r.saldo_disponible),
      })),
      movimientos: movsRes.rows.map((m) => ({
        ...m,
        monto: parseFloat(m.monto),
        saldo_anterior: parseFloat(m.saldo_anterior),
        saldo_posterior: parseFloat(m.saldo_posterior),
      })),
    });
  } catch (error) {
    console.error('[BANCO HISTORIAL ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener historial financiero en la Entidad Bancaria.',
    });
  } finally {
    client.release();
  }
};

module.exports = {
  verificarDpi,
  obtenerCuentasCliente,
  obtenerHistorialFinanciero,
};
