import { Request, Response } from 'express';
import { query } from '../db';

export const getAllEntregas = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT e.*, b.nombres_apellidos, b.dni, b.direccion, b.sector, b.num_miembros, p.zona, p.fecha as fecha_programacion
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      ORDER BY e.fecha_hora DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching entregas:', error);
    res.status(500).json({ message: 'Error fetching entregas', error: error.message });
  }
};

export const deleteEntrega = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM entregas_agua WHERE id = $1', [id]);
    res.json({ message: 'Entrega eliminada correctamente.' });
  } catch (error: any) {
    console.error('Error deleting entrega:', error);
    res.status(500).json({ message: 'Error al eliminar entrega', error: error.message });
  }
};

export const syncEntregas = async (req: Request, res: Response) => {
  try {
    const { entregas } = req.body;

    if (!Array.isArray(entregas) || entregas.length === 0) {
      return res.status(400).json({ message: 'No entregas to sync provided.' });
    }

    let syncedCount = 0;

    for (const entrega of entregas) {
      const {
        beneficiario_id,
        programacion_id,
        litros_entregados,
        firma_base64,
        latitud,
        longitud,
        fecha_hora
      } = entrega;

      const insertQuery = `
        INSERT INTO entregas_agua (beneficiario_id, programacion_id, litros_entregados, firma_base64, latitud, longitud, fecha_hora, sincronizado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
      `;

      await query(insertQuery, [
        beneficiario_id,
        programacion_id,
        litros_entregados,
        firma_base64,
        latitud,
        longitud,
        fecha_hora || new Date()
      ]);
      
      syncedCount++;
    }

    res.status(200).json({ message: `Successfully synced ${syncedCount} entregas.`, syncedCount });
  } catch (error: any) {
    console.error('Error syncing entregas:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
