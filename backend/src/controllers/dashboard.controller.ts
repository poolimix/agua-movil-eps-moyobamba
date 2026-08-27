import { Request, Response } from 'express';
import { query } from '../db';

export const getStats = async (req: Request, res: Response) => {
  try {
    const beneficiariosRes = await query('SELECT COUNT(*) as total FROM beneficiarios');
    const programacionesRes = await query("SELECT COUNT(*) as total FROM programaciones WHERE estado = 'Activa'");
    const entregasRes = await query('SELECT COUNT(*) as total, COALESCE(SUM(litros_entregados), 0) as total_litros FROM entregas_agua');

    res.json({
      totalBeneficiarios: parseInt(beneficiariosRes.rows[0].total, 10),
      programacionesActivas: parseInt(programacionesRes.rows[0].total, 10),
      entregasRealizadas: parseInt(entregasRes.rows[0].total, 10),
      totalLitros: parseFloat(entregasRes.rows[0].total_litros),
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
  }
};
