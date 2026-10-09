import { Request, Response } from 'express';
import { query } from '../db';

const ensureSectoresSchema = async () => {
  try {
    await query(`
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS distrito VARCHAR(100) DEFAULT 'Moyobamba';
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_litros NUMERIC(12,2) DEFAULT 25000;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_m3 NUMERIC(10,2) DEFAULT 25.00;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS dias_entrega VARCHAR(150) DEFAULT 'Lunes, Miércoles, Viernes';
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS coordenadas_centro JSONB;

      INSERT INTO sectores (nombre, distrito, descripcion, meta_semanal_litros, meta_semanal_m3, dias_entrega)
      SELECT 
        b.sector_aahh, 
        COALESCE(b.distrito, 'Moyobamba'), 
        'Sector registrado automáticamente desde Padrón de Beneficiarios',
        COALESCE(SUM(b.num_miembros) * 50 * 7, 25000),
        COALESCE((SUM(b.num_miembros) * 50 * 7) / 1000.0, 25.0),
        'Lunes, Miércoles, Viernes'
      FROM beneficiarios b
      WHERE b.sector_aahh IS NOT NULL AND TRIM(b.sector_aahh) <> ''
        AND NOT EXISTS (SELECT 1 FROM sectores s WHERE LOWER(TRIM(s.nombre)) = LOWER(TRIM(b.sector_aahh)))
      GROUP BY b.sector_aahh, b.distrito
      ON CONFLICT (nombre) DO NOTHING;
    `);
  } catch (err) {
    console.warn('Auto-reparación sectores:', err);
  }
};

export const getAllSectores = async (req: Request, res: Response) => {
  try {
    await ensureSectoresSchema();
    const result = await query(`
      SELECT 
        s.id,
        s.nombre,
        s.distrito,
        s.descripcion,
        s.dias_entrega,
        s.created_at,
        COALESCE(s.meta_semanal_litros, 0) as meta_semanal_litros,
        COALESCE(s.meta_semanal_m3, 0) as meta_semanal_m3,
        (SELECT COUNT(*) FROM beneficiarios b WHERE b.sector_aahh = s.nombre OR b.sector = s.nombre) as total_beneficiarios,
        (SELECT COALESCE(SUM(b.num_miembros), 0) FROM beneficiarios b WHERE b.sector_aahh = s.nombre OR b.sector = s.nombre) as total_habitantes,
        (
          SELECT COALESCE(SUM(e.litros_entregados), 0)
          FROM entregas_agua e
          LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
          WHERE (b.sector_aahh = s.nombre OR b.sector = s.nombre)
            AND e.fecha_hora >= date_trunc('week', CURRENT_TIMESTAMP)
        ) as litros_entregados_semana
      FROM sectores s
      ORDER BY s.nombre ASC
    `);

    // Enhance each sector with compliance percentage and status
    const data = result.rows.map((row: any) => {
      const metaLitros = parseInt(row.meta_semanal_litros, 10) || (row.total_habitantes * 50 * 7);
      const entregadoLitros = parseInt(row.litros_entregados_semana, 10) || 0;
      const porcentaje = metaLitros > 0 ? Math.min(100, Math.round((entregadoLitros / metaLitros) * 100)) : 0;
      
      let estado_cumplimiento = 'PENDIENTE'; // 🔴
      if (porcentaje >= 100) {
        estado_cumplimiento = 'CUMPLIDO'; // 🟢
      } else if (porcentaje > 0) {
        estado_cumplimiento = 'EN_PROGRESO'; // 🟡
      }

      return {
        ...row,
        meta_semanal_litros: metaLitros,
        meta_semanal_m3: parseFloat((metaLitros / 1000).toFixed(2)),
        litros_entregados_semana: entregadoLitros,
        m3_entregados_semana: parseFloat((entregadoLitros / 1000).toFixed(2)),
        porcentaje_cumplimiento: porcentaje,
        estado_cumplimiento,
      };
    });

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching sectores:', error);
    res.status(500).json({ message: 'Error al consultar sectores', error: error.message });
  }
};

export const createSector = async (req: Request, res: Response) => {
  try {
    await ensureSectoresSchema();
    const {
      nombre,
      distrito = 'Moyobamba',
      descripcion,
      meta_semanal_litros,
      dias_entrega = 'Lunes, Miércoles, Viernes',
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre del sector es obligatorio.' });
    }

    const metaLitros = parseInt(meta_semanal_litros, 10) || 0;
    const metaM3 = parseFloat((metaLitros / 1000).toFixed(2));

    const sql = `
      INSERT INTO sectores (nombre, distrito, descripcion, meta_semanal_litros, meta_semanal_m3, dias_entrega)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const result = await query(sql, [
      nombre.trim(),
      distrito.trim(),
      descripcion || null,
      metaLitros,
      metaM3,
      dias_entrega.trim(),
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating sector:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ya existe un sector o AA.HH. con ese nombre.' });
    }
    res.status(500).json({ message: 'Error al registrar sector', error: error.message });
  }
};

export const updateSector = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      distrito,
      descripcion,
      meta_semanal_litros,
      dias_entrega,
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre del sector es obligatorio.' });
    }

    const oldRes = await query('SELECT * FROM sectores WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ message: 'Sector no encontrado.' });
    }
    const oldNombre = oldRes.rows[0].nombre;

    const metaLitros = meta_semanal_litros !== undefined ? parseInt(meta_semanal_litros, 10) : oldRes.rows[0].meta_semanal_litros;
    const metaM3 = parseFloat((metaLitros / 1000).toFixed(2));
    const dias = dias_entrega || oldRes.rows[0].dias_entrega || 'Lunes, Miércoles, Viernes';

    const sql = `
      UPDATE sectores
      SET nombre = $1,
          distrito = $2,
          descripcion = $3,
          meta_semanal_litros = $4,
          meta_semanal_m3 = $5,
          dias_entrega = $6
      WHERE id = $7
      RETURNING *;
    `;

    const result = await query(sql, [
      nombre.trim(),
      distrito || 'Moyobamba',
      descripcion || null,
      metaLitros,
      metaM3,
      dias,
      id,
    ]);

    if (oldNombre !== nombre.trim()) {
      await query(
        `UPDATE beneficiarios SET sector_aahh = $1, sector = $1 WHERE sector_aahh = $2 OR sector = $2`,
        [nombre.trim(), oldNombre]
      );
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating sector:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ya existe un sector con ese nombre.' });
    }
    res.status(500).json({ message: 'Error al actualizar sector', error: error.message });
  }
};

export const deleteSector = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM sectores WHERE id = $1', [id]);
    res.json({ message: 'Sector eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting sector:', error);
    res.status(500).json({ message: 'Error al eliminar sector', error: error.message });
  }
};
