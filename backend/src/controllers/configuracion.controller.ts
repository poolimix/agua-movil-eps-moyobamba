import { Request, Response } from 'express';
import { query } from '../db';
import { 
  getConfiguracion, 
  updateParametrosConfiguracion,
  ensureConfiguracionSchema
} from '../services/configuracion.service';

/**
 * Obtener todos los parámetros operativos y normativos del sistema
 */
export const getConfiguracionHandler = async (_req: Request, res: Response) => {
  try {
    await ensureConfiguracionSchema();
    const config = await getConfiguracion();
    let rows: any[] = [];
    try {
      const rowsRes = await query(`
        SELECT id, clave, valor, descripcion, unidad, categoria, updated_at, updated_by 
        FROM configuracion_sistema 
        ORDER BY categoria ASC, id ASC
      `);
      rows = rowsRes.rows;
    } catch {
      await ensureConfiguracionSchema();
      // Auto-inicializar la tabla si aún no existía
      await query(`
        CREATE TABLE IF NOT EXISTS configuracion_sistema (
          id SERIAL PRIMARY KEY,
          clave VARCHAR(100) UNIQUE NOT NULL,
          valor NUMERIC(10,2) NOT NULL,
          descripcion TEXT,
          unidad VARCHAR(30),
          categoria VARCHAR(50) DEFAULT 'GENERAL',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(150) DEFAULT 'SISTEMA'
        );
        INSERT INTO configuracion_sistema (clave, valor, descripcion, unidad, categoria)
        VALUES 
          ('DOTACION_DIARIA_LITROS', 50.00, 'Dotación de agua potable diaria por habitante/familiar', 'L/hab/día', 'DOTACION'),
          ('DIAS_ENTREGA_SEMANAL', 7.00, 'Días de abastecimiento continuo por ciclo periódico semanal', 'días', 'DOTACION'),
          ('TURBIEDAD_MAX_NTU', 5.00, 'Límite Máximo Permisible (LMP) de Turbiedad', 'NTU', 'CALIDAD'),
          ('CLORO_MIN_PPM', 0.50, 'Límite mínimo reglamentario de Cloro Residual Libre', 'mg/L (ppm)', 'CALIDAD'),
          ('CLORO_MAX_PPM', 2.00, 'Límite máximo recomendado de Cloro Residual Libre', 'mg/L (ppm)', 'CALIDAD'),
          ('PH_MIN', 6.50, 'Límite mínimo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD'),
          ('PH_MAX', 8.50, 'Límite máximo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD')
        ON CONFLICT (clave) DO NOTHING;
      `);
      const rowsRes = await query(`
        SELECT id, clave, valor, descripcion, unidad, categoria, updated_at, updated_by 
        FROM configuracion_sistema 
        ORDER BY categoria ASC, id ASC
      `);
      rows = rowsRes.rows;
    }

    res.json({
      config,
      parametros: rows
    });
  } catch (error: any) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ message: 'Error interno al consultar configuración', error: error.message });
  }
};

/**
 * Actualizar parámetros de dotación y/o control de calidad
 */
export const updateConfiguracionHandler = async (req: Request, res: Response) => {
  try {
    const {
      dotacion_diaria_litros,
      dias_entrega_semanal,
      turbiedad_max_ntu,
      cloro_min_ppm,
      cloro_max_ppm,
      ph_min,
      ph_max,
      recalcular_vales = true, // Por defecto sincronizar vales activos con la nueva dotación
    } = req.body;

    const userEmail = (req as any).user?.email || 'ADMIN';

    const updatedConfig = await updateParametrosConfiguracion({
      dotacion_diaria_litros,
      dias_entrega_semanal,
      turbiedad_max_ntu,
      cloro_min_ppm,
      cloro_max_ppm,
      ph_min,
      ph_max,
    }, userEmail);

    let valesActualizadosCount = 0;

    // Si se modificó la dotación o los días y recalcular_vales está activo, sincronizar vales emitidos
    if (recalcular_vales && (dotacion_diaria_litros !== undefined || dias_entrega_semanal !== undefined)) {
      try {
        const dotacionSemanal = updatedConfig.dotacion_semanal_por_habitante;
        const updVales = await query(`
          UPDATE vales_entrega v
          SET litros_sugeridos = (COALESCE(b.num_miembros, 1) * ${dotacionSemanal}),
              qr_data = v.codigo_unico || '|' || b.dni || '|' || (COALESCE(b.num_miembros, 1) * ${dotacionSemanal}) || 'L|' || v.programacion_id
          FROM beneficiarios b
          WHERE v.beneficiario_id = b.id AND (v.estado = 'EMITIDO' OR v.estado = 'PENDIENTE' OR v.estado = 'Emitido' OR v.estado = 'Pendiente')
          RETURNING v.id;
        `);
        valesActualizadosCount = updVales.rowCount || 0;
      } catch (valesErr) {
        console.warn('Sincronización opcional de vales omitida (sin tabla o datos):', valesErr);
      }
    }

    res.json({
      message: '✅ Parámetros de configuración actualizados exitosamente.',
      config: updatedConfig,
      vales_sincronizados: valesActualizadosCount
    });
  } catch (error: any) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ message: 'Error interno al actualizar configuración', error: error.message });
  }
};
