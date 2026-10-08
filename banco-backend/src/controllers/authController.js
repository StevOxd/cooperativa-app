const bcrypt = require('bcryptjs');

// Hash de relleno: se compara cuando el DPI no existe para que la respuesta tarde lo mismo.
const HASH_DE_RELLENO = bcrypt.hashSync('cuenta-inexistente', 10);
const { pool } = require('../config/db');

/**
 * Valida las credenciales de la Banca en Línea para un cliente:
 * Recibe: { cui_dpi, nombre_usuario, codigo, password }
 */
const validarCredenciales = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cui_dpi, nombre_usuario, codigo, password } = req.body;

    if (!cui_dpi || !nombre_usuario || !codigo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Debe ingresar CUI/DPI, Nombre de Usuario, Código de Cliente y Contraseña bancaria.',
      });
    }

    const cleanCui = String(cui_dpi).trim().replace(/\s+/g, '');
    const cleanUser = String(nombre_usuario).trim().toLowerCase();
    const cleanCod = String(codigo).trim().toUpperCase();

    // 1. Buscar cliente y usuario de banca web
    const query = `
      SELECT 
        c.id_cliente, c.cui_dpi, c.nombre_completo, c.primer_nombre, c.primer_apellido,
        c.email, c.telefono, c.direccion, c.fecha_nacimiento, c.tipo_cliente, c.estado AS estado_cliente,
        u.id_usuario_banca, u.nombre_usuario, u.codigo_bancario, u.password_hash, u.estado AS estado_usuario
      FROM clientes_banco c
      JOIN usuarios_banca_en_linea u ON c.id_cliente = u.id_cliente
      WHERE c.cui_dpi = $1
    `;
    const result = await client.query(query, [cleanCui]);

    // 2-4. Usuario, código y contraseña se validan juntos y fallan con el mismo mensaje: así no se puede
    //      averiguar, dato por dato, si el DPI tiene Banca en Línea ni cuál de los tres está mal.
    //      Si el DPI no existe se compara un hash de relleno para que la respuesta tarde lo mismo.
    const record = result.rows[0];
    const passwordValida = await bcrypt.compare(password, record ? record.password_hash : HASH_DE_RELLENO);
    const credencialesValidas = Boolean(record)
      && record.nombre_usuario.toLowerCase() === cleanUser
      && record.codigo_bancario.toUpperCase() === cleanCod
      && passwordValida;

    if (!credencialesValidas) {
      return res.status(401).json({
        success: false,
        message: 'Los datos de la Banca en Línea no son correctos. Revise su usuario, su código y su contraseña.',
      });
    }

    // El estado solo se informa a quien ya demostró ser el titular.
    if (record.estado_cliente !== 'ACTIVO' || record.estado_usuario !== 'ACTIVO') {
      return res.status(403).json({
        success: false,
        message: 'El usuario o cliente bancario se encuentra bloqueado o inactivo. Comuníquese con la Entidad Bancaria.',
      });
    }

    // Actualizar último acceso
    await client.query(
      'UPDATE usuarios_banca_en_linea SET ultimo_acceso = CURRENT_TIMESTAMP, intentos_fallidos = 0 WHERE id_usuario_banca = $1',
      [record.id_usuario_banca]
    );

    // 5. Consultar cuentas monetarias y de ahorro activas del cliente
    const cuentasRes = await client.query(
      `SELECT id_cuenta_bancaria, numero_cuenta, tipo_cuenta, saldo_disponible, estado
       FROM cuentas_bancarias
       WHERE id_cliente = $1 AND estado = 'ACTIVA'
       ORDER BY CASE WHEN tipo_cuenta = 'MONETARIA' THEN 1 ELSE 2 END, id_cuenta_bancaria ASC`,
      [record.id_cliente]
    );

    return res.status(200).json({
      success: true,
      message: 'Autenticación con la Entidad Bancaria exitosa.',
      cliente: {
        id_cliente: record.id_cliente,
        cui_dpi: record.cui_dpi,
        nombre_completo: record.nombre_completo,
        primer_nombre: record.primer_nombre,
        primer_apellido: record.primer_apellido,
        email: record.email,
        telefono: record.telefono,
        direccion: record.direccion,
        fecha_nacimiento: record.fecha_nacimiento,
        tipo_cliente: record.tipo_cliente,
        codigo_bancario: record.codigo_bancario,
        nombre_usuario: record.nombre_usuario,
      },
      cuentas: cuentasRes.rows.map((cta) => ({
        id_cuenta_bancaria: cta.id_cuenta_bancaria,
        numero_cuenta_bancaria: cta.numero_cuenta,
        tipo_cuenta: cta.tipo_cuenta,
        saldo_disponible: parseFloat(cta.saldo_disponible),
        estado: cta.estado,
      })),
    });
  } catch (error) {
    console.error('[BANCO AUTH ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno en el servicio de autenticación de la Entidad Bancaria.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  validarCredenciales,
};
