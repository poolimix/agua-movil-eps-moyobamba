import { Request, Response } from 'express';
import { query } from '../db';
import PDFDocument from 'pdfkit';

/**
 * Obtener Balance de Masa Hídrica (Conciliación de Carga en Surtidor vs. Entrega Fiscalizada)
 */
export const getBalanceHidrico = async (req: Request, res: Response) => {
  try {
    const { fecha_inicio, fecha_fin, cisterna_id } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
      cisterna_id?: string;
    };

    let progWhereClauses: string[] = [];
    let progParams: any[] = [];

    if (fecha_inicio && fecha_fin) {
      progParams.push(fecha_inicio, fecha_fin);
      progWhereClauses.push(`p.fecha >= $${progParams.length - 1} AND p.fecha <= $${progParams.length}`);
    } else if (fecha_inicio) {
      progParams.push(fecha_inicio);
      progWhereClauses.push(`p.fecha >= $${progParams.length}`);
    } else if (fecha_fin) {
      progParams.push(fecha_fin);
      progWhereClauses.push(`p.fecha <= $${progParams.length}`);
    }

    if (cisterna_id) {
      progParams.push(cisterna_id);
      progWhereClauses.push(`p.cisterna_id = $${progParams.length}`);
    }

    const progWhere = progWhereClauses.length > 0 ? `WHERE ${progWhereClauses.join(' AND ')}` : '';

    // 1. Balance detallado por programación y cisterna
    const sql = `
      SELECT 
        p.id as programacion_id,
        TO_CHAR(p.fecha, 'YYYY-MM-DD') as fecha,
        p.zona as ruta_sector,
        p.estado as estado_programacion,
        COALESCE(p.viajes_estimados, 1) as viajes_realizados,
        c.id as cisterna_id,
        c.placa as cisterna_placa,
        COALESCE(c.capacidad_m3, 15) as capacidad_m3,
        COALESCE(c.capacidad_litros, 15000) as capacidad_litros,
        CONCAT(cond.nombres, ' ', cond.apellidos) as conductor_nombre,
        -- Volumen Cargado en Surtidor (Viajes * Capacidad de la cisterna)
        (COALESCE(p.viajes_estimados, 1) * COALESCE(c.capacidad_litros, 15000)) as volumen_cargado_litros,
        -- Volumen Fiscalizado Entregado
        COALESCE(SUM(e.litros_entregados), 0) as volumen_entregado_litros,
        COUNT(e.id) as total_entregas_actas
      FROM programaciones p
      JOIN cisternas c ON p.cisterna_id = c.id
      LEFT JOIN personal_operativo cond ON p.conductor_id = cond.id
      LEFT JOIN entregas_agua e ON e.programacion_id = p.id
      ${progWhere}
      GROUP BY p.id, p.fecha, p.zona, p.estado, p.viajes_estimados, c.id, c.placa, c.capacidad_m3, c.capacidad_litros, cond.nombres, cond.apellidos
      ORDER BY p.fecha DESC, p.id DESC
    `;

    const result = await query(sql, progParams);

    // 2. Procesar cálculos de merma técnica y tolerancia
    const balancePorProgramacion = result.rows.map((row) => {
      const cargado = parseFloat(row.volumen_cargado_litros) || 0;
      const entregado = parseFloat(row.volumen_entregado_litros) || 0;
      const diferencial = cargado - entregado;
      const pctMerma = cargado > 0 ? Math.round(((diferencial / cargado) * 100) * 100) / 100 : 0;

      let estadoTecnico = 'OPTIMO';
      if (pctMerma > 8) {
        estadoTecnico = 'ALERTA';
      } else if (pctMerma > 3) {
        estadoTecnico = 'ACEPTABLE';
      } else if (pctMerma < 0) {
        // En caso excepcional donde se reportó más de la capacidad programada
        estadoTecnico = 'SOBRE_DESPACHO';
      }

      return {
        ...row,
        volumen_cargado_m3: Number((cargado / 1000).toFixed(2)),
        volumen_entregado_m3: Number((entregado / 1000).toFixed(2)),
        diferencial_litros: diferencial,
        diferencial_m3: Number((diferencial / 1000).toFixed(2)),
        porcentaje_merma: pctMerma,
        estado_tecnico: estadoTecnico,
      };
    });

    // 3. Agrupación y resumen por Cisterna
    const cisternasMap = new Map<number, any>();
    balancePorProgramacion.forEach((b) => {
      const id = b.cisterna_id;
      if (!cisternasMap.has(id)) {
        cisternasMap.set(id, {
          cisterna_id: id,
          placa: b.cisterna_placa,
          capacidad_m3: b.capacidad_m3,
          viajes_totales: 0,
          total_cargado_litros: 0,
          total_entregado_litros: 0,
          total_actas: 0,
        });
      }
      const item = cisternasMap.get(id);
      item.viajes_totales += parseInt(b.viajes_realizados, 10);
      item.total_cargado_litros += parseFloat(b.volumen_cargado_litros);
      item.total_entregado_litros += parseFloat(b.volumen_entregado_litros);
      item.total_actas += parseInt(b.total_entregas_actas, 10);
    });

    const balancePorCisterna = Array.from(cisternasMap.values()).map((c) => {
      const dif = c.total_cargado_litros - c.total_entregado_litros;
      const pct = c.total_cargado_litros > 0 ? Math.round(((dif / c.total_cargado_litros) * 100) * 100) / 100 : 0;
      let est = 'OPTIMO';
      if (pct > 8) est = 'ALERTA';
      else if (pct > 3) est = 'ACEPTABLE';

      return {
        ...c,
        total_cargado_m3: Number((c.total_cargado_litros / 1000).toFixed(2)),
        total_entregado_m3: Number((c.total_entregado_litros / 1000).toFixed(2)),
        diferencial_litros: dif,
        diferencial_m3: Number((dif / 1000).toFixed(2)),
        porcentaje_merma: pct,
        estado_tecnico: est,
      };
    });

    // 4. Totales Globales
    const totCargado = balancePorProgramacion.reduce((acc, b) => acc + parseFloat(b.volumen_cargado_litros), 0);
    const totEntregado = balancePorProgramacion.reduce((acc, b) => acc + parseFloat(b.volumen_entregado_litros), 0);
    const totDif = totCargado - totEntregado;
    const globalPctMerma = totCargado > 0 ? Math.round(((totDif / totCargado) * 100) * 100) / 100 : 0;

    let globalEstado = 'OPTIMO';
    if (globalPctMerma > 8) globalEstado = 'ALERTA';
    else if (globalPctMerma > 3) globalEstado = 'ACEPTABLE';

    res.json({
      filtros: {
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null,
        cisterna_id: cisterna_id || null,
      },
      resumenGlobal: {
        total_volumen_cargado_litros: totCargado,
        total_volumen_cargado_m3: Number((totCargado / 1000).toFixed(2)),
        total_volumen_entregado_litros: totEntregado,
        total_volumen_entregado_m3: Number((totEntregado / 1000).toFixed(2)),
        diferencial_merma_litros: totDif,
        diferencial_merma_m3: Number((totDif / 1000).toFixed(2)),
        porcentaje_merma_global: globalPctMerma,
        estado_balance: globalEstado,
        tolerancia_normativa_pct: 5.0,
        total_rutas_evaluadas: balancePorProgramacion.length,
      },
      balancePorCisterna,
      balancePorProgramacion,
    });
  } catch (error: any) {
    console.error('Error calculando balance hídrico:', error);
    res.status(500).json({ message: 'Error interno en balance hídrico', error: error.message });
  }
};

/**
 * Exportar Acta de Conciliación de Balance de Masa Hídrica en PDF
 */
export const exportarBalancePdf = async (req: Request, res: Response) => {
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Acta_Balance_Masa_Hidrica_EPS.pdf"');
    doc.pipe(res);

    doc.fontSize(8).fillColor('#475569').text('PERÚ • Ministerio de Vivienda, Construcción y Saneamiento • Programa Nacional de Saneamiento Urbano (PNSU)', { align: 'center' });
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0284c7').text('EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.', { align: 'center' });
    doc.fontSize(8).font('Helvetica').text('CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE', { align: 'center' });
    doc.moveDown(0.6);

    doc.rect(40, doc.y, 515, 22).fill('#0f172a');
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('INFORME TÉCNICO DE CONCILIACIÓN Y BALANCE DE MASA HÍDRICA', 40, doc.y - 16, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    doc.fontSize(9).font('Helvetica').text(
      'El presente documento certifica la conciliación física entre el volumen de agua potable cargado en planta/surtidor de EPS Moyobamba y el volumen fiscalizado y entregado a la población beneficiaria.',
      { align: 'justify' }
    );
    doc.moveDown(1);

    doc.fontSize(9).font('Helvetica-Bold').text('1. CRITERIO TÉCNICO DE TOLERANCIA Y MERMAS');
    doc.font('Helvetica').fontSize(8.5);
    doc.text('• Tolerancia técnica admisible de transporte y manipulación en mangueras: hasta 5.0% de merma.');
    doc.text('• Toda variación superior al 8.0% es sujeta a auditoría técnica y fiscalización de válvulas.');
    doc.moveDown(1.5);

    doc.fontSize(9).font('Helvetica-Bold').text('2. SUSCRIPCIÓN TÉCNICA');
    doc.moveDown(2);

    const y = doc.y;
    doc.fontSize(8).font('Helvetica');
    doc.text('____________________________________', 60, y);
    doc.text('Ing. Responsable de Operaciones', 60, y + 12);
    doc.text('EPS Moyobamba S.A.', 60, y + 22);

    doc.text('____________________________________', 330, y);
    doc.text('Supervisor de Distribución Móvil', 330, y + 12);
    doc.text('Convenio PNSU', 330, y + 22);

    doc.end();
  } catch (error: any) {
    res.status(500).json({ message: 'Error generando PDF de balance', error: error.message });
  }
};
