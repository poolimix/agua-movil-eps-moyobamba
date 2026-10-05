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

    const result = await query(`
      INSERT INTO control_calidad (
        programacion_id, cisterna_id, conductor_nombre, cloro_residual_ppm, 
        turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, observaciones, 
        foto_muestra_url, latitud, longitud, registrado_por, etapa_control, punto_muestreo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      programacion_id || null,
      cisterna_id || null,
      conductor_nombre || null,
      cloro,
      turbiedad,
      aspecto_organoleptico,
      conforme,
      observaciones,
      foto_muestra_url,
      latitud,
      longitud,
      registrado_por,
      etapa_control,
      punto_muestreo
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
    res.status(500).json({ message: 'Error interno al registrar control de calidad', error: error.message });
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
