const db = require('../config/db');

/**
 * Obtener todos los tipos de cuenta disponibles (catálogo informativo)
 * GET /api/catalogo/tipos-cuenta
 */
const getTiposCuenta = async (req, res) => {
  try {
    const query = `
      SELECT 
        id_tipo_cuenta,
        nombre,
        tasa_interes_anual,
        monto_minimo_apertura,
        descripcion,
        beneficios
      FROM tipos_cuenta
      ORDER BY id_tipo_cuenta ASC
    `;
    const result = await db.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en catalogoController.getTiposCuenta:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el catálogo de tipos de cuenta.',
    });
  }
};

module.exports = {
  getTiposCuenta,
};
