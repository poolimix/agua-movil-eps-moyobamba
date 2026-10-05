import { Request, Response } from 'express';
import { query } from '../db';
import { getConfiguracion } from '../services/configuracion.service';

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
    const entregasSql = `
      SELECT 
        COUNT(*) as total, 
        COALESCE(SUM(e.litros_entregados), 0) as total_litros,
        COUNT(DISTINCT e.beneficiario_id) as familias_atendidas,
        COALESCE(SUM(b.num_miembros), 0) as poblacion_beneficiada
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      ${entregasWhere.replace(/fecha_hora/g, 'e.fecha_hora')}
    `;
    const entregasRes = await query(entregasSql, paramsEntregas);

    // 4. Estadísticas de Vales de Consumo con filtro
    let valesStats = { total_vales: 0, entregados: 0, pendientes: 0, anulados: 0, tasa_canje: 0 };
    try {
      const valesRes = await query(`
        SELECT 
          COUNT(*) as total_vales,
          COUNT(CASE WHEN estado IN ('CANJEADO', 'ENTREGADO') THEN 1 END) as entregados,
          COUNT(CASE WHEN estado IN ('PENDIENTE', 'EMITIDO') THEN 1 END) as pendientes,
          COUNT(CASE WHEN estado = 'ANULADO' THEN 1 END) as anulados
        FROM vales_entrega
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

    // 6. Estado de la Flota de Cisternas con Ubicaciones GPS
    let flotaStats = { total: 0, operativas: 0, capacidad_total_litros: 0, cisternas: [] as any[] };
    try {
      const cisRes = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN estado = 'OPERATIVO' THEN 1 END) as operativas,
          COALESCE(SUM(capacidad_litros), 0) as capacidad_total
        FROM cisternas
      `);
      const cisListRes = await query(`
        SELECT 
          c.id,
          c.placa,
          c.marca_modelo,
          c.capacidad_m3,
          c.capacidad_litros,
          c.estado,
          c.codigo_gps,
          c.latitud_actual,
          c.longitud_actual,
          c.enlace_gps_tracking,
          c.ultima_actualizacion_gps,
          CONCAT(p.nombres, ' ', p.apellidos) as conductor_habitual_nombre,
          p.telefono as conductor_habitual_telefono
        FROM cisternas c
        LEFT JOIN personal_operativo p ON c.conductor_habitual_id = p.id
        ORDER BY c.id ASC
      `);
      if (cisRes.rows.length > 0) {
        flotaStats = {
          total: parseInt(cisRes.rows[0].total, 10) || 0,
          operativas: parseInt(cisRes.rows[0].operativas, 10) || 0,
          capacidad_total_litros: parseFloat(cisRes.rows[0].capacidad_total) || 0,
          cisternas: cisListRes.rows
        };
      }
    } catch (e) {
      console.warn('Cisternas query skipped:', e);
    }

    // 7. Desglose y Cumplimiento por Sector (Semanal vs Mensual)
    const config = await getConfiguracion();
    let sectoresData: any[] = [];
    let sectoresSemanal: any[] = [];
    let sectoresMensual: any[] = [];

    try {
      // Consulta general por sectores (con filtros si existen)
      let secSql = `
        SELECT 
          COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe') as sector_nombre,
          COALESCE(SUM(e.litros_entregados), 0) as litros_entregados,
          COUNT(DISTINCT e.id) as total_entregas,
          COUNT(DISTINCT b.id) as total_beneficiarios,
          COALESCE(MAX(s.meta_semanal_litros), 25000) as meta_litros
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
        LIMIT 8
      `;

      const secRes = await query(secSql, secParams);
      sectoresData = secRes.rows.map(r => {
        const litros = parseFloat(r.litros_entregados) || 0;
        const meta = parseFloat(r.meta_litros) || 25000;
        return {
          sector_nombre: r.sector_nombre,
          litros_entregados: litros,
          m3_entregados: Number((litros / 1000).toFixed(2)),
          total_entregas: parseInt(r.total_entregas, 10) || 0,
          total_beneficiarios: parseInt(r.total_beneficiarios, 10) || 0,
          meta_litros: meta,
          meta_m3: Number((meta / 1000).toFixed(2)),
          cumplimiento_pct: Math.min(100, Math.round((litros / (meta || 1)) * 100))
        };
      });

      // Vista Semanal Específica (Últimos 7 días / Ciclo semanal)
      const secSemRes = await query(`
        SELECT 
          COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe') as sector_nombre,
          COALESCE(SUM(CASE WHEN e.fecha_hora >= NOW() - INTERVAL '7 days' THEN e.litros_entregados ELSE 0 END), 0) as litros_semana,
          COUNT(DISTINCT CASE WHEN e.fecha_hora >= NOW() - INTERVAL '7 days' THEN e.id END) as entregas_semana,
          COUNT(DISTINCT b.id) as total_beneficiarios,
          COALESCE(SUM(b.num_miembros * ${config.dotacion_semanal_por_habitante}), 25000) as meta_semana_litros
        FROM beneficiarios b
        LEFT JOIN entregas_agua e ON e.beneficiario_id = b.id
        LEFT JOIN sectores s ON (s.nombre = b.sector_aahh OR s.nombre = b.sector)
        GROUP BY COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe')
        ORDER BY total_beneficiarios DESC, litros_semana DESC
        LIMIT 8
      `);
      sectoresSemanal = secSemRes.rows.map(r => {
        const litros = parseFloat(r.litros_semana) || 0;
        const meta = parseFloat(r.meta_semana_litros) || 25000;
        return {
          sector_nombre: r.sector_nombre,
          litros_entregados: litros,
          m3_entregados: Number((litros / 1000).toFixed(2)),
          meta_litros: meta,
          meta_m3: Number((meta / 1000).toFixed(2)),
          total_beneficiarios: parseInt(r.total_beneficiarios, 10) || 0,
          cumplimiento_pct: Math.min(100, Math.round((litros / (meta || 1)) * 100))
        };
      });

      // Vista Mensual Específica (Últimos 30 días / Ciclo mensual)
      const secMesRes = await query(`
        SELECT 
          COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe') as sector_nombre,
          COALESCE(SUM(CASE WHEN e.fecha_hora >= NOW() - INTERVAL '30 days' THEN e.litros_entregados ELSE 0 END), 0) as litros_mes,
          COUNT(DISTINCT CASE WHEN e.fecha_hora >= NOW() - INTERVAL '30 days' THEN e.id END) as entregas_mes,
          COUNT(DISTINCT b.id) as total_beneficiarios,
          COALESCE(SUM(b.num_miembros * ${config.dotacion_semanal_por_habitante} * 4), 100000) as meta_mes_litros
        FROM beneficiarios b
        LEFT JOIN entregas_agua e ON e.beneficiario_id = b.id
        LEFT JOIN sectores s ON (s.nombre = b.sector_aahh OR s.nombre = b.sector)
        GROUP BY COALESCE(s.nombre, b.sector_aahh, b.sector, 'Sol de Indañe')
        ORDER BY total_beneficiarios DESC, litros_mes DESC
        LIMIT 8
      `);
      sectoresMensual = secMesRes.rows.map(r => {
        const litros = parseFloat(r.litros_mes) || 0;
        const meta = parseFloat(r.meta_mes_litros) || 100000;
        return {
          sector_nombre: r.sector_nombre,
          litros_entregados: litros,
          m3_entregados: Number((litros / 1000).toFixed(2)),
          meta_litros: meta,
          meta_m3: Number((meta / 1000).toFixed(2)),
          total_beneficiarios: parseInt(r.total_beneficiarios, 10) || 0,
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

    // 11. Cumplimiento de Metas Semanales por Beneficiario
    let metasBeneficiarios = {
      total: 0,
      cumplidos: 0,
      parciales: 0,
      pendientes: 0,
      pct_cumplimiento: 0,
      volumen_entregado_semana_lts: 0,
      volumen_meta_semana_lts: 0
    };
    try {
      const benMetasRes = await query(`
        SELECT 
          b.id,
          COALESCE(b.num_miembros, 1) as num_miembros,
          COALESCE(b.num_miembros * ${config.dotacion_semanal_por_habitante}, 1750) as meta_semanal_lts,
          COALESCE(SUM(e.litros_entregados), 0) as entregado_lts
        FROM beneficiarios b
        LEFT JOIN entregas_agua e ON e.beneficiario_id = b.id AND (e.fecha_hora >= NOW() - INTERVAL '7 days' OR e.fecha_hora IS NOT NULL)
        GROUP BY b.id, b.num_miembros
      `);

      let cCumplidos = 0;
      let cParciales = 0;
      let cPendientes = 0;
      let volEnt = 0;
      let volMeta = 0;

      benMetasRes.rows.forEach(row => {
        const ent = parseFloat(row.entregado_lts) || 0;
        const meta = parseFloat(row.meta_semanal_lts) || 1750;
        volEnt += ent;
        volMeta += meta;

        if (ent >= meta) {
          cCumplidos++;
        } else if (ent > 0) {
          cParciales++;
        } else {
          cPendientes++;
        }
      });

      const totalBens = benMetasRes.rows.length;
      metasBeneficiarios = {
        total: totalBens,
        cumplidos: cCumplidos,
        parciales: cParciales,
        pendientes: cPendientes,
        pct_cumplimiento: totalBens > 0 ? Math.round((cCumplidos / totalBens) * 100) : 0,
        volumen_entregado_semana_lts: volEnt,
        volumen_meta_semana_lts: volMeta
      };
    } catch (e) {
      console.warn('Metas beneficiarios query error:', e);
    }

    // 12. Cumplimiento y Proyección por Programación
    let programacionesAvance: any[] = [];
    try {
      const progAvanceRes = await query(`
        SELECT 
          p.id,
          p.fecha,
          p.zona,
          p.estado,
          p.litros_programados,
          p.viajes_estimados,
          c.placa as cisterna_placa,
          c.capacidad_litros as cisterna_capacidad,
          CONCAT(pers.nombres, ' ', pers.apellidos) as conductor_nombre,
          COALESCE(SUM(e.litros_entregados), 0) as litros_entregados,
          COUNT(DISTINCT e.id) as entregas_realizadas,
          COUNT(DISTINCT e.beneficiario_id) as familias_atendidas
        FROM programaciones p
        LEFT JOIN cisternas c ON p.cisterna_id = c.id
        LEFT JOIN personal_operativo pers ON p.conductor_id = pers.id
        LEFT JOIN entregas_agua e ON e.programacion_id = p.id
        GROUP BY p.id, p.fecha, p.zona, p.estado, p.litros_programados, p.viajes_estimados, c.placa, c.capacidad_litros, pers.nombres, pers.apellidos
        ORDER BY p.fecha DESC, p.id DESC
        LIMIT 10
      `);

      programacionesAvance = progAvanceRes.rows.map(r => {
        const progLts = parseFloat(r.litros_programados) || 15000;
        const entLts = parseFloat(r.litros_entregados) || 0;
        const pct = Math.min(100, Math.round((entLts / progLts) * 100));
        const fechaObj = new Date(r.fecha);
        const esFutura = fechaObj.getTime() > Date.now();

        return {
          id: r.id,
          fecha: r.fecha,
          fecha_label: fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
          zona: r.zona,
          estado_original: r.estado,
          estado_display: pct >= 100 ? 'Completada' : (entLts > 0 ? 'En Ruta / Parcial' : (esFutura ? 'Proyectada' : 'Pendiente')),
          cisterna_placa: r.cisterna_placa || 'Cisterna 01',
          conductor_nombre: r.conductor_nombre || 'Conductor Asignado',
          litros_programados: progLts,
          m3_programados: Number((progLts / 1000).toFixed(2)),
          litros_entregados: entLts,
          m3_entregados: Number((entLts / 1000).toFixed(2)),
          cumplimiento_pct: pct,
          viajes_estimados: parseInt(r.viajes_estimados, 10) || 1,
          entregas_realizadas: parseInt(r.entregas_realizadas, 10) || 0,
          familias_atendidas: parseInt(r.familias_atendidas, 10) || 0,
          es_proyeccion: entLts === 0 || esFutura
        };
      });
    } catch (e) {
      console.warn('Programaciones avance query error:', e);
    }

    const totalLitros = parseFloat(entregasRes.rows[0]?.total_litros) || 0;
    const totalEntregas = parseInt(entregasRes.rows[0]?.total, 10) || 0;
    const familiasAtendidas = parseInt(entregasRes.rows[0]?.familias_atendidas, 10) || 0;
    const poblacionBeneficiadaAtendida = parseInt(entregasRes.rows[0]?.poblacion_beneficiada, 10) || (familiasAtendidas * 4);
    const totalPersonasPadron = parseInt(beneficiariosRes.rows[0]?.total_personas, 10) || 0;

    const metaConvenioTotalM3 = 15000; // 15,000 m³ meta global convenio PNSU
    const totalM3 = Number((totalLitros / 1000).toFixed(2));
    const saldoConvenioM3 = Math.max(0, Number((metaConvenioTotalM3 - totalM3).toFixed(2)));
    const avanceGlobalPct = Math.min(100, Math.round((totalM3 / metaConvenioTotalM3) * 100));

    // Tarifa operativa de referencia SUNASS / PNSU: S/. 39.13 por m³ distribuido en camión cisterna
    const tarifaRefM3 = 39.13;
    const montoTotalSoles = Number((totalM3 * tarifaRefM3).toFixed(2));
    const volPromedioFamilia = familiasAtendidas > 0 ? Math.round(totalLitros / familiasAtendidas) : 0;
    const volPromedioPersona = poblacionBeneficiadaAtendida > 0 ? Math.round(totalLitros / poblacionBeneficiadaAtendida) : 0;
    const montoPorFamiliaSoles = familiasAtendidas > 0 ? Number((montoTotalSoles / familiasAtendidas).toFixed(2)) : 0;

    res.json({
      timestamp: new Date().toISOString(),
      filtrosAplicados: {
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null,
        activo: Boolean(fecha_inicio || fecha_fin)
      },
      kpis: {
        totalBeneficiarios: parseInt(beneficiariosRes.rows[0].total, 10) || 0,
        totalPersonas: totalPersonasPadron,
        programacionesActivas: parseInt(programacionesRes.rows[0].activas, 10) || 0,
        programacionesTotal: parseInt(programacionesRes.rows[0].total, 10) || 0,
        entregasRealizadas: totalEntregas,
        totalLitros: totalLitros,
        totalM3: totalM3,
        // 4 Métricas clave operativas:
        volumenRepartidoLitros: totalLitros,
        volumenRepartidoM3: totalM3,
        volumenPromedioFamilia: volPromedioFamilia,
        volumenPromedioPersona: volPromedioPersona,
        poblacionBeneficiada: poblacionBeneficiadaAtendida,
        familiasAtendidas: familiasAtendidas,
        montoTotalSoles: montoTotalSoles,
        montoPorFamiliaSoles: montoPorFamiliaSoles,
        tarifaRefM3: tarifaRefM3,
        metaMensualLitros: 100000,
        avanceMetaPct: avanceGlobalPct
      },
      metricas_operativas: {
        volumen_repartido: {
          litros: totalLitros,
          m3: totalM3,
          formato: `${Number(totalLitros).toLocaleString('es-PE')} L (${totalM3} m³)`
        },
        volumen_promedio: {
          litros_familia: volPromedioFamilia,
          litros_persona: volPromedioPersona,
          formato: `${volPromedioFamilia.toLocaleString('es-PE')} L / familia`
        },
        monto_valorizado: {
          total_soles: montoTotalSoles,
          tarifa_m3: tarifaRefM3,
          por_familia_soles: montoPorFamiliaSoles,
          formato: `S/. ${montoTotalSoles.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
        poblacion_beneficiada: {
          personas_atendidas: poblacionBeneficiadaAtendida,
          familias_atendidas: familiasAtendidas,
          total_padron: totalPersonasPadron,
          formato: `${poblacionBeneficiadaAtendida.toLocaleString('es-PE')} habitantes (${familiasAtendidas} familias)`
        }
      },
      vales: valesStats,
      calidad: calidadStats,
      flota: flotaStats,
      cisternas_ubicaciones: flotaStats.cisternas,
      sectores: sectoresData,
      sectores_semanal: sectoresSemanal,
      sectores_mensual: sectoresMensual,
      metas_beneficiarios: metasBeneficiarios,
      objetivo_global: {
        meta_convenio_m3: metaConvenioTotalM3,
        total_entregado_m3: totalM3,
        saldo_m3: saldoConvenioM3,
        avance_pct: avanceGlobalPct,
        presupuesto_total_soles: 586912.74,
        dotacion_diaria_litros: config.dotacion_diaria_litros,
        dias_entrega_semanal: config.dias_entrega_semanal,
        dotacion_semanal_por_habitante: config.dotacion_semanal_por_habitante
      },
      programaciones_avance: programacionesAvance,
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

