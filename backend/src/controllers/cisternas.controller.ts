import { Request, Response } from 'express';
import { query } from '../db';
import { LITROS_POR_M3 } from '../config/constants';
import { volvoConnectService } from '../services/VolvoConnectService';

export const getAllCisternas = async (req: Request, res: Response) => {
  try {
    const { estado } = req.query;
    let sql = `
      SELECT 
        c.*,
        c.conductor_habitual_id,
        CONCAT(p.nombres, ' ', p.apellidos) as conductor_habitual_nombre,
        p.telefono as conductor_habitual_telefono,
        p.licencia_conducir as conductor_habitual_licencia
      FROM cisternas c
      LEFT JOIN personal_operativo p ON c.conductor_habitual_id = p.id
    `;
    const params: any[] = [];

    if (estado) {
      sql += ' WHERE c.estado = $1';
      params.push(String(estado).toUpperCase());
    }

    sql += ' ORDER BY c.id ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching cisternas:', error);
    res.status(500).json({ message: 'Error al consultar cisternas', error: error.message });
  }
};

export const createCisterna = async (req: Request, res: Response) => {
  try {
    const {
      placa,
      marca_modelo,
      capacidad_m3,
      soat_vencimiento,
      revision_tecnica_vencimiento,
      conductor_habitual_id,
      codigo_gps,
      latitud_actual,
      longitud_actual,
      enlace_gps_tracking,
      estado = 'OPERATIVO',
    } = req.body;

    if (!placa || !marca_modelo || !capacidad_m3) {
      return res.status(400).json({ message: 'Placa, marca/modelo y capacidad en m³ son obligatorios.' });
    }

    const m3 = parseFloat(capacidad_m3);
    const litros = m3 * LITROS_POR_M3;
    const lat = latitud_actual ? parseFloat(latitud_actual) : null;
    const lng = longitud_actual ? parseFloat(longitud_actual) : null;

    const sql = `
      INSERT INTO cisternas (
        placa, marca_modelo, capacidad_m3, capacidad_litros, 
        soat_vencimiento, revision_tecnica_vencimiento, conductor_habitual_id, 
        codigo_gps, latitud_actual, longitud_actual, enlace_gps_tracking, 
        ultima_actualizacion_gps, estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, $12)
      RETURNING *;
    `;

    const result = await query(sql, [
      placa.toUpperCase().trim(),
      marca_modelo.trim(),
      m3,
      litros,
      soat_vencimiento || null,
      revision_tecnica_vencimiento || null,
      conductor_habitual_id ? parseInt(conductor_habitual_id, 10) : null,
      codigo_gps ? codigo_gps.trim() : `GPS-${placa.toUpperCase().trim()}`,
      lat,
      lng,
      enlace_gps_tracking || null,
      estado.toUpperCase(),
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating cisterna:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ya existe una cisterna registrada con esa placa.' });
    }
    res.status(500).json({ message: 'Error al registrar cisterna', error: error.message });
  }
};

export const updateCisterna = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      placa,
      marca_modelo,
      capacidad_m3,
      soat_vencimiento,
      revision_tecnica_vencimiento,
      conductor_habitual_id,
      codigo_gps,
      latitud_actual,
      longitud_actual,
      enlace_gps_tracking,
      estado,
    } = req.body;

    const m3 = parseFloat(capacidad_m3);
    const litros = m3 * LITROS_POR_M3;
    const lat = latitud_actual !== undefined && latitud_actual !== '' ? parseFloat(latitud_actual) : null;
    const lng = longitud_actual !== undefined && longitud_actual !== '' ? parseFloat(longitud_actual) : null;

    const sql = `
      UPDATE cisternas 
      SET placa = $1,
          marca_modelo = $2,
          capacidad_m3 = $3,
          capacidad_litros = $4,
          soat_vencimiento = $5,
          revision_tecnica_vencimiento = $6,
          conductor_habitual_id = $7,
          codigo_gps = $8,
          latitud_actual = $9,
          longitud_actual = $10,
          enlace_gps_tracking = $11,
          ultima_actualizacion_gps = CURRENT_TIMESTAMP,
          estado = $12
      WHERE id = $13
      RETURNING *;
    `;

    const result = await query(sql, [
      placa.toUpperCase().trim(),
      marca_modelo.trim(),
      m3,
      litros,
      soat_vencimiento || null,
      revision_tecnica_vencimiento || null,
      conductor_habitual_id ? parseInt(conductor_habitual_id, 10) : null,
      codigo_gps ? codigo_gps.trim() : null,
      lat,
      lng,
      enlace_gps_tracking || null,
      estado.toUpperCase(),
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cisterna no encontrada.' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating cisterna:', error);
    res.status(500).json({ message: 'Error al actualizar cisterna', error: error.message });
  }
};

export const updateUbicacionGps = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitud, longitud, codigo_gps } = req.body;

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: 'Latitud y longitud numéricas son requeridas.' });
    }

    const sql = `
      UPDATE cisternas 
      SET latitud_actual = $1,
          longitud_actual = $2,
          codigo_gps = COALESCE($3, codigo_gps),
          ultima_actualizacion_gps = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, placa, latitud_actual, longitud_actual, codigo_gps, ultima_actualizacion_gps;
    `;

    const result = await query(sql, [lat, lng, codigo_gps || null, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cisterna no encontrada.' });
    }

    res.json({ message: 'Ubicación GPS actualizada exitosamente', cisterna: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating GPS cisterna:', error);
    res.status(500).json({ message: 'Error al actualizar GPS', error: error.message });
  }
};

export const deleteCisterna = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Verificar si la cisterna existe
    const cisternaRes = await query('SELECT id, placa, marca_modelo FROM cisternas WHERE id = $1', [id]);
    if (cisternaRes.rows.length === 0) {
      return res.status(404).json({ message: 'La cisterna especificada no existe o ya fue eliminada.' });
    }
    const c = cisternaRes.rows[0];

    // 2. Verificar dependencias operativas asociadas
    const [entregasCount, progCount, calidadCount] = await Promise.all([
      query('SELECT COUNT(*) FROM entregas_agua WHERE cisterna_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] })),
      query('SELECT COUNT(*) FROM programaciones WHERE cisterna_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] })),
      query('SELECT COUNT(*) FROM control_calidad WHERE cisterna_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const numEntregas = parseInt(entregasCount.rows[0]?.count || 0, 10);
    const numProg = parseInt(progCount.rows[0]?.count || 0, 10);
    const numCalidad = parseInt(calidadCount.rows[0]?.count || 0, 10);

    if (numEntregas > 0 || numProg > 0 || numCalidad > 0) {
      const razones: string[] = [];
      if (numEntregas > 0) razones.push(`${numEntregas} entrega(s) de agua`);
      if (numProg > 0) razones.push(`${numProg} programación(es) de ruta`);
      if (numCalidad > 0) razones.push(`${numCalidad} ensayo(s) de control de calidad`);

      return res.status(400).json({
        message: `No se puede eliminar la cisterna ${c.placa} (${c.marca_modelo}) porque está asociada a: ${razones.join(', ')}.`,
        detail: 'Para preservar la trazabilidad del Convenio PNSU y la auditoría SUNASS, no se pueden eliminar unidades con historial. Puede editar sus datos (placa, capacidad, chofer) o cambiar su estado a "MANTENIMIENTO" o "INACTIVO".',
        asociaciones: {
          entregas: numEntregas,
          programaciones: numProg,
          control_calidad: numCalidad,
        }
      });
    }

    await query('DELETE FROM cisternas WHERE id = $1', [id]);
    res.json({ message: `Cisterna ${c.placa} eliminada correctamente.` });
  } catch (error: any) {
    console.error('Error deleting cisterna:', error);
    res.status(500).json({ 
      message: 'No se pudo eliminar la cisterna debido a restricciones de integridad de datos.',
      detail: error.message 
    });
  }
};

/**
 * Obtener estado de la integración con Volvo Connect / rFMS
 */
export const getVolvoIntegrationStatus = async (_req: Request, res: Response) => {
  try {
    res.json(volvoConnectService.getStatus());
  } catch (error: any) {
    res.status(500).json({ message: 'Error consultando estado de Volvo Connect', error: error.message });
  }
};

/**
 * Sincronizar bajo demanda las posiciones de las cisternas Volvo
 */
export const triggerVolvoSync = async (_req: Request, res: Response) => {
  try {
    if (!volvoConnectService.isEnabled()) {
      return res.status(400).json({
        message: 'La integración con Volvo Connect no está habilitada. Configure VOLVO_CONNECT_ENABLED=true y sus credenciales en el archivo .env',
        status: volvoConnectService.getStatus(),
      });
    }

    const syncResult = await volvoConnectService.syncWithDatabase();
    res.json({
      message: 'Sincronización con Volvo Connect completada',
      result: syncResult,
    });
  } catch (error: any) {
    console.error('Error sincronizando con Volvo Connect:', error);
    res.status(500).json({
      message: 'Fallo al sincronizar con Volvo Connect. Verifique conectividad y credenciales de API.',
      error: error.message,
    });
  }
};

