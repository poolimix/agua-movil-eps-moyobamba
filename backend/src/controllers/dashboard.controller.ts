import { Request, Response } from 'express';
import { query } from '../db';

export const getStats = async (req: Request, res: Response) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query as { fecha_inicio?: string; fecha_fin?: string };

    let entregasWhere = '';
    let calidadWhere = '';
    let valesWhere = '';
    const paramsEntregas: any[] = [];
    const paramsCalidad: any[] = [];
    const paramsVales: any[] = [];

    if (fecha_inicio && fecha_fin) {
      entregasWhere = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
      calidadWhere = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
      valesWhere = 'WHERE created_at >= $1 AND created_at <= $2';
      paramsEntregas.push(`${fecha_inicio} 00:00:00`, `${fecha_fin} 23:59:59`);
      paramsCalidad.push(`${fecha_inicio} 00:00:00`, `${fecha_fin} 23:59:59`);
      paramsVales.push(`${fecha_inicio} 00:00:00`, `${fecha_fin} 23:59:59`);
    } else if (fecha_inicio) {
      entregasWhere = 'WHERE fecha_hora >= $1';
      calidadWhere = 'WHERE fecha_hora >= $1';
      valesWhere = 'WHERE created_at >= $1';
      paramsEntregas.push(`${fecha_inicio} 00:00:00`);
      paramsCalidad.push(`${fecha_inicio} 00:00:00`);
      paramsVales.push(`${fecha_inicio} 00:00:00`);
    } else if (fecha_fin) {
      entregasWhere = 'WHERE fecha_hora <= $1';
      calidadWhere = 'WHERE fecha_hora <= $1';
      valesWhere = 'WHERE created_at <= $1';
      paramsEntregas.push(`${fecha_fin} 23:59:59`);
      paramsCalidad.push(`${fecha_fin} 23:59:59`);
      paramsVales.push(`${fecha_fin} 23:59:59`);
    }

    // 1. Conteo de beneficiarios y miembros de familia
    const beneficiariosRes = await query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(num_miembros), 0) as total_personas
      FROM beneficiarios
    `);

    // 2. Programaciones activas
    const programacionesRes = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado = 'Activa' THEN 1 END) as activas,
        COUNT(CASE WHEN estado = 'Completada' THEN 1 END) as completadas
      FROM programaciones
    `);

    // 3. Entregas de agua y volumen fiscalizado con filtro de fechas
    const entregasRes = await query(`
      SELECT 
        COUNT(*) as total, 
        COALESCE(SUM(litros_entregados), 0) as total_litros 
      FROM entregas_agua
      ${entregasWhere}
    `, paramsEntregas);

    // 4. Estadísticas de Vales de Consumo con filtro
    let valesStats = { total_vales: 0, entregados: 0, pendientes: 0, anulados: 0, tasa_canje: 0 };
    try {
      const valesRes = await query(`
        SELECT 
          COUNT(*) as total_vales,
          COUNT(CASE WHEN estado = 'CANJEADO' THEN 1 END) as entregados,
          COUNT(CASE WHEN estado = 'PENDIENTE' THEN 1 END) as pendientes,
          COUNT(CASE WHEN estado = 'ANULADO' THEN 1 END) as anulados
        FROM vales_consumo
        ${valesWhere}
      `, paramsVales);
      if (valesRes.rows.length > 0) {
        const totalV = parseInt(valesRes.rows[0].total_vales, 10) || 0;
        const canjeados = parseInt(valesRes.rows[0].entregados, 10) || 0;
        valesStats = {
          total_vales: totalV,
          entregados: canjeados,
          pendientes: parseInt(valesRes.rows[0].pendientes, 10) || 0,
          anulados: parseInt(valesRes.rows[0].anulados, 10) || 0,
          tasa_canje: totalV > 0 ? Math.round((canjeados / totalV) * 100) : 0
        };
      }
    } catch (e) {
      console.warn('Vales table query skipped or empty:', e);
    }

    // 5. Estadísticas de Control de Calidad del Agua con filtro
    let calidadStats = {
      total_controles: 0,
      conformes: 0,
      no_conformes: 0,
      promedio_cloro_ppm: 1.2,
      promedio_turbiedad_ntu: 1.5,
      cumplimiento_pct: 100,
      ultima_medicion: null
    };
    try {
      const calRes = await query(`
        SELECT 
          COUNT(*) as total_controles,
          COUNT(CASE WHEN conforme_sanitario = true THEN 1 END) as conformes,
          COUNT(CASE WHEN conforme_sanitario = false THEN 1 END) as no_conformes,
          ROUND(AVG(cloro_residual_ppm)::numeric, 2) as promedio_cloro_ppm,
          ROUND(AVG(turbiedad_ntu)::numeric, 2) as promedio_turbiedad_ntu,
          MAX(fecha_hora) as ultima_medicion
        FROM control_calidad
        ${calidadWhere}
      `, paramsCalidad);
      if (calRes.rows.length > 0 && parseInt(calRes.rows[0].total_controles, 10) > 0) {
        const tot = parseInt(calRes.rows[0].total_controles, 10);
        const conf = parseInt(calRes.rows[0].conformes, 10);
        calidadStats = {
          total_controles: tot,
          conformes: conf,
          no_conformes: parseInt(calRes.rows[0].no_conformes, 10),
          promedio_cloro_ppm: parseFloat(calRes.rows[0].promedio_cloro_ppm) || 1.2,
          promedio_turbiedad_ntu: parseFloat(calRes.rows[0].promedio_turbiedad_ntu) || 1.5,
          cumplimiento_pct: tot > 0 ? Math.round((conf / tot) * 100) : 100,
          ultima_medicion: calRes.rows[0].ultima_medicion
        };
      }
    } catch (e) {
      console.warn('Calidad table query skipped or empty:', e);
    }

    // 6. Estado de la Flota de Cisternas
    let flotaStats = { total: 0, operativas: 0, capacidad_total_litros: 0 };
    try {
      const cisRes = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN estado = 'OPERATIVO' THEN 1 END) as operativas,
          COALESCE(SUM(capacidad_litros), 0) as capacidad_total
        FROM cisternas
      `);
      if (cisRes.rows.length > 0) {
        flotaStats = {
          total: parseInt(cisRes.rows[0].total, 10) || 0,
          operativas: parseInt(cisRes.rows[0].operativas, 10) || 0,
          capacidad_total_litros: parseFloat(cisRes.rows[0].capacidad_total) || 0
        };
      }
    } catch (e) {
      console.warn('Cisternas query skipped:', e);
    }

    // 7. Desglose y Cumplimiento por Sector (con entregas filtradas)
    let sectoresData: any[] = [];
    try {
      let secSql = `
        SELECT 
          COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe') as sector_nombre,
          COALESCE(SUM(e.litros_entregados), 0) as litros_entregados,
          COUNT(DISTINCT e.id) as total_entregas,
          COUNT(DISTINCT b.id) as total_beneficiarios,
          COALESCE(MAX(s.meta_semanal_litros), 1200) as meta_litros
        FROM beneficiarios b
        LEFT JOIN entregas_agua e ON e.beneficiario_id = b.id
      `;

      const secParams: any[] = [];
      if (fecha_inicio && fecha_fin) {
        secSql += ` AND e.fecha_hora >= $1 AND e.fecha_hora <= $2 `;
        secParams.push(`${fecha_inicio} 00:00:00`, `${fecha_fin} 23:59:59`);
      } else if (fecha_inicio) {
        secSql += ` AND e.fecha_hora >= $1 `;
        secParams.push(`${fecha_inicio} 00:00:00`);
      } else if (fecha_fin) {
        secSql += ` AND e.fecha_hora <= $1 `;
        secParams.push(`${fecha_fin} 23:59:59`);
      }

      secSql += `
        LEFT JOIN sectores s ON (s.nombre = b.sector_aahh OR s.nombre = b.sector)
        GROUP BY COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe')
        ORDER BY litros_entregados DESC, total_beneficiarios DESC
        LIMIT 6
      `;

      const secRes = await query(secSql, secParams);
      sectoresData = secRes.rows.map(r => {
        const litros = parseFloat(r.litros_entregados) || 0;
        const meta = parseFloat(r.meta_litros) || 1200;
        return {
          sector_nombre: r.sector_nombre,
          litros_entregados: litros,
          total_entregas: parseInt(r.total_entregas, 10) || 0,
          total_beneficiarios: parseInt(r.total_beneficiarios, 10) || 0,
          meta_litros: meta,
          cumplimiento_pct: Math.min(100, Math.round((litros / (meta || 1)) * 100))
        };
      });
    } catch (e) {
      console.warn('Sectores stats query error:', e);
    }

    // 8. Tendencia Temporal de Entregas (filtrada si aplica)
    let tendenciaData: any[] = [];
    try {
      const tenRes = await query(`
        SELECT 
          TO_CHAR(fecha_hora, 'YYYY-MM-DD') as fecha_raw,
          TO_CHAR(fecha_hora, 'DD Mon') as fecha_label,
          COALESCE(SUM(litros_entregados), 0) as litros,
          COUNT(*) as entregas
        FROM entregas_agua
        ${entregasWhere}
        GROUP BY TO_CHAR(fecha_hora, 'YYYY-MM-DD'), TO_CHAR(fecha_hora, 'DD Mon')
        ORDER BY fecha_raw ASC
        LIMIT 14
      `, paramsEntregas);
      tendenciaData = tenRes.rows.map(r => ({
        fecha: r.fecha_label,
        litros: parseFloat(r.litros) || 0,
        entregas: parseInt(r.entregas, 10) || 0
      }));
    } catch (e) {
      console.warn('Tendencia query error:', e);
    }

    // 9. Histórico Reciente de Calidad con filtro
    let calidadHistorico: any[] = [];
    try {
      const calHistRes = await query(`
        SELECT 
          cc.id,
          TO_CHAR(cc.fecha_hora, 'DD/MM HH24:MI') as fecha,
          cc.cloro_residual_ppm,
          cc.turbiedad_ntu,
          cc.conforme_sanitario,
          cc.aspecto_organoleptico,
          COALESCE(c.placa, 'Cisterna 01') as cisterna_placa,
          COALESCE(cc.conductor_nombre, 'Conductor') as conductor
        FROM control_calidad cc
        LEFT JOIN cisternas c ON cc.cisterna_id = c.id
        ${calidadWhere}
        ORDER BY cc.fecha_hora DESC
        LIMIT 8
      `, paramsCalidad);
      calidadHistorico = calHistRes.rows;
    } catch (e) {
      console.warn('Calidad historico query error:', e);
    }

    // 10. Últimas 5 Entregas Fiscalizadas en Tiempo Real con filtro
    let ultimasEntregas: any[] = [];
    try {
      const ultEntRes = await query(`
        SELECT 
          e.id,
          e.litros_entregados,
          TO_CHAR(e.fecha_hora, 'DD/MM HH24:MI') as fecha_hora,
          COALESCE(b.nombres_apellidos, 'Beneficiario') as beneficiario,
          COALESCE(b.dni, '-') as dni,
          COALESCE(b.sector_aahh, b.sector, 'Moyobamba') as sector,
          e.sincronizado,
          e.foto_url
        FROM entregas_agua e
        LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
        ${entregasWhere}
        ORDER BY e.fecha_hora DESC
        LIMIT 6
      `, paramsEntregas);
      ultimasEntregas = ultEntRes.rows;
    } catch (e) {
      console.warn('Ultimas entregas query error:', e);
    }

    const totalLitros = parseFloat(entregasRes.rows[0]?.total_litros) || 0;
    const metaMensualLitros = 10000;
    const avanceMetaPct = Math.min(100, Math.round((totalLitros / metaMensualLitros) * 100));

    res.json({
      timestamp: new Date().toISOString(),
      filtrosAplicados: {
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null,
        activo: Boolean(fecha_inicio || fecha_fin)
      },
      kpis: {
        totalBeneficiarios: parseInt(beneficiariosRes.rows[0].total, 10) || 0,
        totalPersonas: parseInt(beneficiariosRes.rows[0].total_personas, 10) || 0,
        programacionesActivas: parseInt(programacionesRes.rows[0].activas, 10) || 0,
        programacionesTotal: parseInt(programacionesRes.rows[0].total, 10) || 0,
        entregasRealizadas: parseInt(entregasRes.rows[0]?.total, 10) || 0,
        totalLitros: totalLitros,
        totalM3: Number((totalLitros / 1000).toFixed(2)),
        metaMensualLitros: metaMensualLitros,
        avanceMetaPct: avanceMetaPct
      },
      vales: valesStats,
      calidad: calidadStats,
      flota: flotaStats,
      sectores: sectoresData,
      tendencia: tendenciaData,
      calidadHistorico: calidadHistorico,
      ultimasEntregas: ultimasEntregas,
      totalBeneficiarios: parseInt(beneficiariosRes.rows[0].total, 10) || 0,
      programacionesActivas: parseInt(programacionesRes.rows[0].activas, 10) || 0,
      entregasRealizadas: parseInt(entregasRes.rows[0]?.total, 10) || 0,
      totalLitros: totalLitros
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats with filter:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
  }
};

