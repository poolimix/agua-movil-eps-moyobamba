import { Request, Response } from 'express';
import { query } from '../db';

export const getAllPersonal = async (req: Request, res: Response) => {
  try {
    // Sincronizar automáticamente usuarios creados con rol CONDUCTOR o GESTOR_ENTREGA en personal_operativo
    try {
      await query(`
        INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, email, estado)
        SELECT 
          COALESCE(u.dni, LPAD((u.id * 1000 + 100)::text, 8, '0')),
          SPLIT_PART(u.nombres, ' ', 1),
          COALESCE(NULLIF(SUBSTRING(u.nombres FROM POSITION(' ' IN u.nombres) + 1), ''), 'EPS'),
          u.rol,
          u.email,
          COALESCE(u.estado, 'ACTIVO')
        FROM usuarios u
        WHERE u.rol IN ('CONDUCTOR', 'GESTOR_ENTREGA')
          AND NOT EXISTS (
            SELECT 1 FROM personal_operativo p 
            WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(u.email))
          )
        ON CONFLICT DO NOTHING;
      `);
    } catch (_) {}

    const { tipo, estado } = req.query;
    let sql = 'SELECT * FROM personal_operativo WHERE 1=1';
    const params: any[] = [];

    if (tipo) {
      const upperTipo = String(tipo).toUpperCase();
      if (upperTipo === 'AYUDANTE' || upperTipo === 'GESTOR_ENTREGA') {
        sql += ` AND tipo_personal IN ('GESTOR_ENTREGA', 'AYUDANTE')`;
      } else {
        params.push(upperTipo);
        sql += ` AND tipo_personal = $${params.length}`;
      }
    }

    if (estado) {
      params.push(String(estado).toUpperCase());
      sql += ` AND estado = $${params.length}`;
    }

    sql += ' ORDER BY nombres ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching personal:', error);
    res.status(500).json({ message: 'Error al consultar personal operativo', error: error.message });
  }
};

export const createPersonal = async (req: Request, res: Response) => {
  try {
    const {
      dni,
      nombres,
      apellidos,
      tipo_personal = 'CONDUCTOR',
      licencia_conducir,
      categoria_licencia,
      telefono,
      email,
      estado = 'ACTIVO',
    } = req.body;

    if (!dni || !nombres || !apellidos || !tipo_personal) {
      return res.status(400).json({ message: 'DNI, nombres, apellidos y tipo de personal son obligatorios.' });
    }

    if (dni.trim().length !== 8) {
      return res.status(400).json({ message: 'El DNI debe contener exactamente 8 dígitos.' });
    }

    const cleanTipo = tipo_personal.toUpperCase() === 'AYUDANTE' ? 'GESTOR_ENTREGA' : tipo_personal.toUpperCase();

    const sql = `
      INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, licencia_conducir, categoria_licencia, telefono, email, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await query(sql, [
      dni.trim(),
      nombres.trim(),
      apellidos.trim(),
      cleanTipo,
      licencia_conducir ? licencia_conducir.trim().toUpperCase() : null,
      categoria_licencia ? categoria_licencia.trim().toUpperCase() : null,
      telefono ? telefono.trim() : null,
      email ? email.trim().toLowerCase() : null,
      estado.toUpperCase(),
    ]);

    // If user has email, also register in usuarios table so they can log in if needed
    if (email && email.trim()) {
      await query(
        `INSERT INTO usuarios (email, nombres, rol, estado)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET rol = EXCLUDED.rol, estado = EXCLUDED.estado`,
        [email.trim().toLowerCase(), `${nombres.trim()} ${apellidos.trim()}`, cleanTipo, 'ACTIVO']
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating personal:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ya existe un personal registrado con ese DNI.' });
    }
    res.status(500).json({ message: 'Error al registrar personal', error: error.message });
  }
};

export const updatePersonal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      dni,
      nombres,
      apellidos,
      tipo_personal,
      licencia_conducir,
      categoria_licencia,
      telefono,
      email,
      estado,
    } = req.body;

    const sql = `
      UPDATE personal_operativo
      SET dni = $1,
          nombres = $2,
          apellidos = $3,
          tipo_personal = $4,
          licencia_conducir = $5,
          categoria_licencia = $6,
          telefono = $7,
          email = $8,
          estado = $9
      WHERE id = $10
      RETURNING *;
    `;

    const cleanTipo = tipo_personal ? (tipo_personal.toUpperCase() === 'AYUDANTE' ? 'GESTOR_ENTREGA' : tipo_personal.toUpperCase()) : undefined;

    const result = await query(sql, [
      dni.trim(),
      nombres.trim(),
      apellidos.trim(),
      cleanTipo,
      licencia_conducir ? licencia_conducir.trim().toUpperCase() : null,
      categoria_licencia ? categoria_licencia.trim().toUpperCase() : null,
      telefono ? telefono.trim() : null,
      email ? email.trim().toLowerCase() : null,
      estado.toUpperCase(),
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Personal no encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating personal:', error);
    res.status(500).json({ message: 'Error al actualizar personal', error: error.message });
  }
};

export const deletePersonal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM personal_operativo WHERE id = $1', [id]);
    res.json({ message: 'Personal eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting personal:', error);
    res.status(500).json({ message: 'Error al eliminar personal', error: error.message });
  }
};
