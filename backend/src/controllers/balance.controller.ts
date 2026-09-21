import { Request, Response } from 'express';
import { query } from '../db';
import PDFDocument from 'pdfkit';
import * as xlsx from 'xlsx';

/**
 * Función compartida para calcular el Balance de Masa Hídrica
 */
async function calcularBalanceData(fecha_inicio?: string, fecha_fin?: string, cisterna_id?: string) {
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

  const sql = `
    SELECT 
      p.id as programacion_id,
      TO_CHAR(p.fecha, 'YYYY-MM-DD') as fecha,
      p.zona as ruta_sector,
      p.estado as estado_programacion,
      COALESCE(p.viajes_estimados, 1) as viajes_realizados,
      c.id as cisterna_id,
      c.placa as cisterna_placa,
      c.marca_modelo as cisterna_marca,
      COALESCE(c.capacidad_m3, 15) as capacidad_m3,
      COALESCE(c.capacidad_litros, 15000) as capacidad_litros,
      CONCAT(cond.nombres, ' ', cond.apellidos) as conductor_nombre,
      (COALESCE(p.viajes_estimados, 1) * COALESCE(c.capacidad_litros, 15000)) as volumen_cargado_litros,
      COALESCE((
        SELECT SUM(e.litros_entregados)
        FROM entregas_agua e
        WHERE e.programacion_id = p.id
      ), 0) as volumen_entregado_litros,
      COALESCE((
        SELECT COUNT(e.id)
        FROM entregas_agua e
        WHERE e.programacion_id = p.id
      ), 0) as total_entregas_actas
    FROM programaciones p
    LEFT JOIN cisternas c ON p.cisterna_id = c.id
    LEFT JOIN personal_operativo cond ON p.conductor_id = cond.id
    ${progWhere}
    ORDER BY p.fecha DESC, p.id DESC
  `;

  const result = await query(sql, progParams);

  const balancePorProgramacion = result.rows.map((row) => {
    const cargadoL = parseFloat(row.volumen_cargado_litros);
    const entregadoL = parseFloat(row.volumen_entregado_litros);
    const difL = cargadoL - entregadoL;
    const pctMerma = cargadoL > 0 ? Math.round(((difL / cargadoL) * 100) * 100) / 100 : 0;

    let estado = 'OPTIMO';
    if (pctMerma > 8) estado = 'ALERTA';
    else if (pctMerma > 3) estado = 'ACEPTABLE';

    return {
      ...row,
      volumen_cargado_m3: Number((cargadoL / 1000).toFixed(2)),
      volumen_entregado_m3: Number((entregadoL / 1000).toFixed(2)),
      diferencial_litros: difL,
      diferencial_m3: Number((difL / 1000).toFixed(2)),
      porcentaje_merma: pctMerma,
      estado_tecnico: estado,
    };
  });

  // Agrupación por cisterna
  const cisternasMap = new Map<number, any>();
  balancePorProgramacion.forEach((b) => {
    const cId = b.cisterna_id || 0;
    if (!cisternasMap.has(cId)) {
      cisternasMap.set(cId, {
        cisterna_id: cId,
        placa: b.cisterna_placa || 'Sin asignar',
        marca_modelo: b.cisterna_marca || 'Mercedes-Benz',
        capacidad_m3: b.capacidad_m3,
        viajes_totales: 0,
        total_cargado_litros: 0,
        total_entregado_litros: 0,
        total_actas: 0,
      });
    }
    const item = cisternasMap.get(cId);
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

  const totCargado = balancePorProgramacion.reduce((acc, b) => acc + parseFloat(b.volumen_cargado_litros), 0);
  const totEntregado = balancePorProgramacion.reduce((acc, b) => acc + parseFloat(b.volumen_entregado_litros), 0);
  const totDif = totCargado - totEntregado;
  const globalPctMerma = totCargado > 0 ? Math.round(((totDif / totCargado) * 100) * 100) / 100 : 0;

  let globalEstado = 'OPTIMO';
  if (globalPctMerma > 8) globalEstado = 'ALERTA';
  else if (globalPctMerma > 3) globalEstado = 'ACEPTABLE';

  return {
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
  };
}

/**
 * Obtener Balance de Masa Hídrica (JSON)
 */
export const getBalanceHidrico = async (req: Request, res: Response) => {
  try {
    const { fecha_inicio, fecha_fin, cisterna_id } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
      cisterna_id?: string;
    };

    const data = await calcularBalanceData(fecha_inicio, fecha_fin, cisterna_id);
    res.json(data);
  } catch (error: any) {
    console.error('Error calculando balance hídrico:', error);
    res.status(500).json({ message: 'Error interno en balance hídrico', error: error.message });
  }
};

/**
 * Exportar Excel Oficial del Balance Hídrico
 */
export const exportarBalanceExcel = async (req: Request, res: Response) => {
  try {
    const { fecha_inicio, fecha_fin, cisterna_id } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
      cisterna_id?: string;
    };

    const data = await calcularBalanceData(fecha_inicio, fecha_fin, cisterna_id);
    const wb = xlsx.utils.book_new();

    // 1. Resumen de Auditoría
    const wsResumenData = [
      ['AUDITORÍA TÉCNICA DE BALANCE DE MASA HÍDRICA — EPS MOYOBAMBA S.A.'],
      ['CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE'],
      [`RANGO DE AUDITORÍA: ${fecha_inicio || 'Inicio'} HASTA ${fecha_fin || 'Fin'}`],
      [],
      ['INDICADOR TÉCNICO', 'VALOR CONSOLIDADO', 'UNIDAD / CRITERIO'],
      ['Volumen Total Cargado en Planta', data.resumenGlobal.total_volumen_cargado_m3, 'm³ (100%)'],
      ['Volumen Total Entregado y Fiscalizado', data.resumenGlobal.total_volumen_entregado_m3, 'm³'],
      ['Diferencial Físico (Merma / Retención)', data.resumenGlobal.diferencial_merma_m3, 'm³'],
      ['Porcentaje de Merma Global', `${data.resumenGlobal.porcentaje_merma_global}%`, 'Tolerancia admisible: <= 5.0%'],
      ['Dictamen Técnico Global', data.resumenGlobal.estado_balance, 'Conforme a norma técnica PNSU'],
      ['Rutas y Viajes Auditados', data.resumenGlobal.total_rutas_evaluadas, 'Programaciones en campo']
    ];
    const wsResumen = xlsx.utils.aoa_to_sheet(wsResumenData);
    wsResumen['!cols'] = [{ wch: 38 }, { wch: 24 }, { wch: 32 }];
    xlsx.utils.book_append_sheet(wb, wsResumen, 'Resumen_Auditoria');

    // 2. Balance por Cisterna
    const rowsCisterna: any[][] = [
      ['BALANCE CONSOLIDADO POR UNIDAD VEHICULAR (CAMIONES CISTERNA)'],
      [],
      ['PLACA', 'MARCA / MODELO', 'CAP. (m³)', 'TOTAL VIAJES', 'CARGADO (m³)', 'ENTREGADO (m³)', 'MERMA (m³)', '% MERMA', 'ESTADO AUDITORÍA']
    ];
    data.balancePorCisterna.forEach((c) => {
      rowsCisterna.push([
        c.placa,
        c.marca_modelo,
        Number(c.capacidad_m3),
        Number(c.viajes_totales),
        Number(c.total_cargado_m3),
        Number(c.total_entregado_m3),
        Number(c.diferencial_m3),
        `${c.porcentaje_merma}%`,
        c.estado_tecnico
      ]);
    });
    const wsCisterna = xlsx.utils.aoa_to_sheet(rowsCisterna);
    wsCisterna['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    xlsx.utils.book_append_sheet(wb, wsCisterna, 'Balance_Cisternas');

    // 3. Detalle por Ruta
    const rowsRutas: any[][] = [
      ['AUDITORÍA DETALLADA POR RUTA / PROGRAMACIÓN DE CAMPO'],
      [],
      ['ID PROG.', 'FECHA', 'PLACA', 'CONDUCTOR', 'SECTOR / RUTA', 'VIAJES', 'CARGADO (L)', 'ENTREGADO (L)', 'DIFERENCIAL (L)', '% MERMA', 'ACTAS FIRMADAS', 'ESTADO']
    ];
    data.balancePorProgramacion.forEach((p) => {
      rowsRutas.push([
        p.programacion_id,
        p.fecha,
        p.cisterna_placa,
        p.conductor_nombre,
        p.ruta_sector,
        Number(p.viajes_realizados),
        Number(p.volumen_cargado_litros),
        Number(p.volumen_entregado_litros),
        Number(p.diferencial_litros),
        `${p.porcentaje_merma}%`,
        Number(p.total_entregas_actas),
        p.estado_tecnico
      ]);
    });
    const wsRutas = xlsx.utils.aoa_to_sheet(rowsRutas);
    wsRutas['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
    xlsx.utils.book_append_sheet(wb, wsRutas, 'Detalle_Rutas');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Auditoria_Balance_Hidrico_EPS_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando Excel de balance hídrico:', error);
    res.status(500).json({ message: 'Error exportando Excel', error: error.message });
  }
};

/**
 * Exportar Acta de Conciliación de Balance de Masa Hídrica en PDF Profesional
 */
export const exportarBalancePdf = async (req: Request, res: Response) => {
  try {
    const { fecha_inicio, fecha_fin, cisterna_id } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
      cisterna_id?: string;
    };

    const data = await calcularBalanceData(fecha_inicio, fecha_fin, cisterna_id);

    const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Acta_Balance_Masa_Hidrica_EPS.pdf"');
    doc.pipe(res);

    const pageWidth = 595.28;
    const margin = 36;
    const contentWidth = pageWidth - (margin * 2);

    // Cabecera institucional
    doc.fontSize(7.5).fillColor('#64748b').text('PERÚ • MINISTERIO DE VIVIENDA, CONSTRUCCIÓN Y SANEAMIENTO • PNSU', margin, 24, { align: 'center', width: contentWidth });
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0284c7').text('EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.', margin, 34, { align: 'center', width: contentWidth });
    doc.fontSize(7).font('Helvetica').fillColor('#64748b').text('CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE', margin, 44, { align: 'center', width: contentWidth });
    doc.moveTo(margin, 54).lineTo(pageWidth - margin, 54).strokeColor('#cbd5e1').lineWidth(0.75).stroke();

    doc.rect(margin, 62, contentWidth, 22).fill('#1e3a8a');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('ACTA TÉCNICA DE CONCILIACIÓN Y BALANCE DE MASA HÍDRICA', margin, 68, { align: 'center', width: contentWidth });
    doc.y = 90;

    // Resumen Ejecutivo en cajas
    const kpiY = doc.y + 4;
    doc.rect(margin, kpiY, contentWidth, 54).fillAndStroke('#eff6ff', '#bfdbfe');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e40af').text('RESULTADOS GENERALES DE CONCILIACIÓN DE VOLUMEN', margin + 10, kpiY + 8);
    
    const boxW = (contentWidth - 20) / 4;
    const boxY = kpiY + 22;

    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('VOLUMEN CARGADO', margin + 10, boxY);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0369a1').text(`${data.resumenGlobal.total_volumen_cargado_m3} m³`, margin + 10, boxY + 10);

    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('VOLUMEN ENTREGADO', margin + 10 + boxW, boxY);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#166534').text(`${data.resumenGlobal.total_volumen_entregado_m3} m³`, margin + 10 + boxW, boxY + 10);

    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('DIFERENCIAL / MERMA', margin + 10 + (boxW * 2), boxY);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#b45309').text(`${data.resumenGlobal.diferencial_merma_m3} m³ (${data.resumenGlobal.porcentaje_merma_global}%)`, margin + 10 + (boxW * 2), boxY + 10);

    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('DICTAMEN TÉCNICO', margin + 10 + (boxW * 3), boxY);
    const estadoColor = data.resumenGlobal.estado_balance === 'OPTIMO' ? '#15803d' : data.resumenGlobal.estado_balance === 'ACEPTABLE' ? '#0369a1' : '#b91c1c';
    doc.font('Helvetica-Bold').fontSize(11).fillColor(estadoColor).text(data.resumenGlobal.estado_balance, margin + 10 + (boxW * 3), boxY + 10);

    doc.y = kpiY + 68;

    // Tabla 1: Balance por Cisterna
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('1. CONCILIACIÓN CONSOLIDADA POR CAMIÓN CISTERNA', margin, doc.y);
    doc.moveDown(0.4);

    const cColWidths = [65, 105, 55, 55, 65, 65, 55, 58];
    const cHeaders = ['PLACA', 'MARCA / MODELO', 'CAPACIDAD', 'VIAJES', 'CARGADO', 'ENTREGADO', 'MERMA %', 'ESTADO'];
    const cRows = data.balancePorCisterna.map((c) => [
      c.placa,
      c.marca_modelo,
      `${c.capacidad_m3} m³`,
      c.viajes_totales,
      `${c.total_cargado_m3} m³`,
      `${c.total_entregado_m3} m³`,
      `${c.porcentaje_merma}%`,
      c.estado_tecnico
    ]);

    let curY = doc.y;
    doc.rect(margin, curY, contentWidth, 18).fill('#1e3a8a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    let curX = margin;
    cHeaders.forEach((h, i) => {
      doc.text(h, curX + 2, curY + 5, { width: cColWidths[i] - 4, align: 'center' });
      curX += cColWidths[i];
    });
    curY += 18;

    cRows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      doc.rect(margin, curY, contentWidth, 16).fill(isEven ? '#ffffff' : '#f8fafc');
      doc.rect(margin, curY, contentWidth, 16).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      curX = margin;
      doc.font('Helvetica').fontSize(7).fillColor('#1e293b');
      r.forEach((val, i) => {
        doc.text(String(val), curX + 2, curY + 4, { width: cColWidths[i] - 4, align: 'center' });
        curX += cColWidths[i];
      });
      curY += 16;
    });

    doc.y = curY + 14;

    // Tabla 2: Detalle por Programación (Top 8 rutas representativas)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('2. AUDITORÍA DE RUTAS Y ENTREGAS EN CAMPO', margin, doc.y);
    doc.moveDown(0.4);

    const pColWidths = [45, 65, 60, 160, 65, 65, 63];
    const pHeaders = ['ID', 'FECHA', 'PLACA', 'SECTOR / RUTA', 'CARGADO', 'ENTREGADO', 'ESTADO'];
    const pRows = data.balancePorProgramacion.slice(0, 10).map((p) => [
      `#${p.programacion_id}`,
      p.fecha,
      p.cisterna_placa,
      p.ruta_sector,
      `${p.volumen_cargado_m3} m³`,
      `${p.volumen_entregado_m3} m³`,
      p.estado_tecnico
    ]);

    curY = doc.y;
    doc.rect(margin, curY, contentWidth, 18).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    curX = margin;
    pHeaders.forEach((h, i) => {
      doc.text(h, curX + 2, curY + 5, { width: pColWidths[i] - 4, align: 'center' });
      curX += pColWidths[i];
    });
    curY += 18;

    pRows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      doc.rect(margin, curY, contentWidth, 16).fill(isEven ? '#ffffff' : '#f8fafc');
      doc.rect(margin, curY, contentWidth, 16).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

      curX = margin;
      doc.font('Helvetica').fontSize(7).fillColor('#1e293b');
      r.forEach((val, i) => {
        doc.text(String(val), curX + 2, curY + 4, { width: pColWidths[i] - 4, align: 'center' });
        curX += pColWidths[i];
      });
      curY += 16;
    });

    doc.y = curY + 16;

    // Dictamen técnico y firmas
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a').text('DICTAMEN TÉCNICO DE CONCILIACIÓN', margin, doc.y);
    doc.font('Helvetica').fontSize(7).fillColor('#334155');
    doc.moveDown(0.3);
    doc.text(
      'Se certifica la conciliación física entre el volumen extraído y transportado desde la captación / surtidor y el volumen recepcionado por la población beneficiaria. El porcentaje de variación volumétrica se encuentra dentro de los márgenes admisibles de pérdida técnica (hasta 5.0% reglamentario).',
      margin,
      doc.y,
      { width: contentWidth, align: 'justify' }
    );

    const signY = doc.y + 40;
    doc.fontSize(8).font('Helvetica');
    
    doc.moveTo(margin + 40, signY).lineTo(margin + 200, signY).strokeColor('#64748b').lineWidth(0.75).stroke();
    doc.text('Ing. Responsable de Operaciones', margin + 40, signY + 6, { width: 160, align: 'center' });
    doc.fontSize(7).text('EPS Moyobamba S.A.', margin + 40, signY + 17, { width: 160, align: 'center' });

    doc.fontSize(8);
    doc.moveTo(pageWidth - margin - 200, signY).lineTo(pageWidth - margin - 40, signY).stroke();
    doc.text('Supervisor de Distribución Móvil', pageWidth - margin - 200, signY + 6, { width: 160, align: 'center' });
    doc.fontSize(7).text('Convenio PNSU - MVCS', pageWidth - margin - 200, signY + 17, { width: 160, align: 'center' });

    doc.end();
  } catch (error: any) {
    console.error('Error generando PDF de balance:', error);
    res.status(500).json({ message: 'Error generando PDF de balance', error: error.message });
  }
};
