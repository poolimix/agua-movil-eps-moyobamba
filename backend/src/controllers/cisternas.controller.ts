import { Request, Response } from 'express';
import { query } from '../db';
import { LITROS_POR_M3 } from '../config/constants';

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
    await query('DELETE FROM cisternas WHERE id = $1', [id]);
    res.json({ message: 'Cisterna eliminada correctamente' });
  } catch (error: any) {
    console.error('Error deleting cisterna:', error);
    res.status(500).json({ message: 'Error al eliminar cisterna', error: error.message });
  }
};
