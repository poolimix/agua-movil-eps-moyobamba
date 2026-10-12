import { Request, Response } from 'express';
import { query } from '../db';
import { getConfiguracion } from '../services/configuracion.service';

export const getControlesCalidad = async (req: Request, res: Response) => {
  try {
    const { cisterna_id, programacion_id, fecha_inicio, fecha_fin, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        cc.*,
        c.placa as cisterna_placa,
        c.marca_modelo as cisterna_marca,
        c.capacidad_m3 as cisterna_capacidad,
        p.fecha as programacion_fecha,
        p.zona as programacion_zona
      FROM control_calidad cc
      LEFT JOIN cisternas c ON cc.cisterna_id = c.id
      LEFT JOIN programaciones p ON cc.programacion_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (cisterna_id) {
      sql += ` AND cc.cisterna_id = $${pIdx++}`;
      params.push(cisterna_id);
    }
    if (programacion_id) {
      sql += ` AND cc.programacion_id = $${pIdx++}`;
      params.push(programacion_id);
    }
    if (fecha_inicio) {
      sql += ` AND cc.fecha_hora >= $${pIdx++}`;
      params.push(`${fecha_inicio} 00:00:00`);
    }
    if (fecha_fin) {
      sql += ` AND cc.fecha_hora <= $${pIdx++}`;
      params.push(`${fecha_fin} 23:59:59`);
    }

    sql += ` ORDER BY cc.fecha_hora DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error al listar controles de calidad:', error);
    res.status(500).json({ message: 'Error interno al consultar controles de calidad', error: error.message });
  }
};

export const createControlCalidad = async (req: Request, res: Response) => {
  try {
    const {
      programacion_id,
      cisterna_id,
      conductor_nombre,
      cloro_residual_ppm,
      turbiedad_ntu,
      aspecto_organoleptico = 'Aceptable',
      etapa_control = 'CARGA', // 'CARGA', 'RUTA', 'ADICIONAL'
      punto_muestreo = 'Surtidor / Planta de Carga',
      observaciones = '',
      foto_muestra_url = null,
      latitud = null,
      longitud = null,
      registrado_por = 'Operador / Supervisor'
    } = req.body;

    const cloro = parseFloat(cloro_residual_ppm);
    const turbiedad = parseFloat(turbiedad_ntu);

    if (isNaN(cloro) || isNaN(turbiedad)) {
      return res.status(400).json({ message: 'Valores numéricos de Cloro (ppm) y Turbiedad (NTU) son obligatorios.' });
    }

    // Obtener límites sanitarios configurables (Turbiedad LMP, Cloro min-max)
    const config = await getConfiguracion();

    const cloroValido = cloro >= config.cloro_min_ppm && cloro <= config.cloro_max_ppm;
    const turbiedadValida = turbiedad <= config.turbiedad_max_ntu;
    const conforme = cloroValido && turbiedadValida;

    const finalCisternaId = cisterna_id && !isNaN(parseInt(String(cisterna_id), 10)) 
      ? parseInt(String(cisterna_id), 10) 
      : null;
    let finalProgId = programacion_id && !isNaN(parseInt(String(programacion_id), 10)) 
      ? parseInt(String(programacion_id), 10) 
      : null;

    // Si no se envió programacion_id pero sí cisterna, auto-vincular a la programación activa de la cisterna
    if (!finalProgId && finalCisternaId) {
      try {
        const progRes = await query(`
          SELECT id FROM programaciones 
          WHERE cisterna_id = $1 AND fecha >= CURRENT_DATE - INTERVAL '2 days'
          ORDER BY fecha DESC, id DESC LIMIT 1
        `, [finalCisternaId]);
        if (progRes.rows.length > 0) {
          finalProgId = progRes.rows[0].id;
        }
      } catch (err) {
        console.warn('No se pudo auto-vincular programación:', err);
      }
    }

    let finalConductor = conductor_nombre && String(conductor_nombre).trim() 
      ? String(conductor_nombre).trim() 
      : null;

    if (finalCisternaId && !finalConductor) {
      const cRes = await query(`
        SELECT CONCAT(p.nombres, ' ', p.apellidos) as chofer 
        FROM cisternas c 
        LEFT JOIN personal_operativo p ON c.conductor_habitual_id = p.id 
        WHERE c.id = $1
      `, [finalCisternaId]);
      if (cRes.rows[0]?.chofer && cRes.rows[0].chofer.trim()) {
        finalConductor = cRes.rows[0].chofer.trim();
      }
    }

    // Auto-curación de tabla y columnas en control_calidad si faltasen en producción
    await query(`
      CREATE TABLE IF NOT EXISTS control_calidad (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS cloro_residual_ppm NUMERIC(5,2) DEFAULT 1.20;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS turbiedad_ntu NUMERIC(5,2) DEFAULT 1.50;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS ph NUMERIC(4,2) DEFAULT 7.20;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS etapa_control TEXT DEFAULT 'CARGA';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conductor_nombre TEXT;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS punto_muestreo TEXT DEFAULT 'CISTERNA_SALIDA';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS aspecto_organoleptico TEXT DEFAULT 'LIMPIDO_INCOLORO';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conforme_sanitario BOOLEAN DEFAULT TRUE;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS observaciones TEXT;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS foto_muestra_url TEXT;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS latitud NUMERIC(10, 8);
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS longitud NUMERIC(11, 8);
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS registrado_por VARCHAR(150) DEFAULT 'Operador / Supervisor';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `).catch((e) => {
      console.warn('Auto-curación control_calidad:', e.message);
    });

    const result = await query(`
      INSERT INTO control_calidad (
        programacion_id, cisterna_id, conductor_nombre, cloro_residual_ppm, 
        turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, observaciones, 
        foto_muestra_url, latitud, longitud, registrado_por, etapa_control, punto_muestreo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      finalProgId,
      finalCisternaId,
      finalConductor,
      cloro,
      turbiedad,
      aspecto_organoleptico || 'Aceptable',
      conforme,
      observaciones || '',
      foto_muestra_url || null,
      latitud || null,
      longitud || null,
      registrado_por || 'Operador / Supervisor',
      etapa_control || 'CARGA',
      punto_muestreo || 'Surtidor / Planta de Carga'
    ]);

    res.status(201).json({
      message: conforme 
        ? 'Control de calidad registrado conforme a la norma sanitaria.' 
        : '¡ALERTA SANITARIA! Parámetros fuera de rango (Cloro o Turbiedad no conformes).',
      conforme_sanitario: conforme,
      control: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error al registrar control de calidad:', error);
    res.status(500).json({ 
      message: error.message || 'Error interno al registrar control de calidad', 
      error: error.message 
    });
  }
};

export const getCalidadStats = async (req: Request, res: Response) => {
  try {
    const statsRes = await query(`
      SELECT 
        COUNT(*) as total_controles,
        COUNT(CASE WHEN conforme_sanitario = true THEN 1 END) as conformes,
        COUNT(CASE WHEN conforme_sanitario = false THEN 1 END) as no_conformes,
        ROUND(AVG(cloro_residual_ppm)::numeric, 2) as promedio_cloro_ppm,
        ROUND(AVG(turbiedad_ntu)::numeric, 2) as promedio_turbiedad_ntu,
        MAX(fecha_hora) as ultima_medicion
      FROM control_calidad
    `);

    res.json(statsRes.rows[0]);
  } catch (error: any) {
    console.error('Error al obtener estadísticas de calidad:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas de calidad', error: error.message });
  }
};
