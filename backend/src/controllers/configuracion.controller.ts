import { Request, Response } from 'express';
import { query } from '../db';
import { 
  getConfiguracion, 
  updateParametrosConfiguracion 
} from '../services/configuracion.service';

/**
 * Obtener todos los parámetros operativos y normativos del sistema
 */
export const getConfiguracionHandler = async (_req: Request, res: Response) => {
  try {
    const config = await getConfiguracion();
    const rowsRes = await query(`
      SELECT id, clave, valor, descripcion, unidad, categoria, updated_at, updated_by 
      FROM configuracion_sistema 
      ORDER BY categoria ASC, id ASC
    `);

    res.json({
      config,
      parametros: rowsRes.rows
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
