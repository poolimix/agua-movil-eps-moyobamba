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
      estado = 'OPERATIVO',
    } = req.body;

    if (!placa || !marca_modelo || !capacidad_m3) {
      return res.status(400).json({ message: 'Placa, marca/modelo y capacidad en m³ son obligatorios.' });
    }

    const m3 = parseFloat(capacidad_m3);
    const litros = m3 * LITROS_POR_M3;

    const sql = `
      INSERT INTO cisternas (placa, marca_modelo, capacidad_m3, capacidad_litros, soat_vencimiento, revision_tecnica_vencimiento, conductor_habitual_id, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
      estado,
    } = req.body;

    const m3 = parseFloat(capacidad_m3);
    const litros = m3 * LITROS_POR_M3;

    const sql = `
      UPDATE cisternas 
      SET placa = $1,
          marca_modelo = $2,
          capacidad_m3 = $3,
          capacidad_litros = $4,
          soat_vencimiento = $5,
          revision_tecnica_vencimiento = $6,
          conductor_habitual_id = $7,
          estado = $8
      WHERE id = $9
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
