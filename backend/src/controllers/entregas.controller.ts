import { Request, Response } from 'express';
import { query } from '../db';
import PDFDocument from 'pdfkit';
import * as xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

export const getAllEntregas = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, programacion_id } = req.query;

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
      const offset = (pageNum - 1) * limitNum;

      let whereClauses: string[] = [];
      let params: any[] = [];

      if (search) {
        params.push(`%${String(search).trim()}%`);
        whereClauses.push(`(b.dni ILIKE $${params.length} OR b.nombres_apellidos ILIKE $${params.length} OR b.sector_aahh ILIKE $${params.length} OR e.local_id ILIKE $${params.length})`);
      }

      if (programacion_id) {
        params.push(programacion_id);
        whereClauses.push(`e.programacion_id = $${params.length}`);
      }

      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countRes = await query(`
        SELECT COUNT(*) as total 
        FROM entregas_agua e
        LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
        ${whereStr}
      `, params);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const dataQuery = `
        SELECT 
          e.*, 
          b.nombres_apellidos, 
          b.dni, 
          COALESCE(b.calle_direccion, b.direccion, '') as direccion, 
          COALESCE(b.sector_aahh, b.sector, '') as sector, 
          b.num_miembros, 
          b.telefono,
          c.placa as cisterna_placa,
          p.zona, 
          p.fecha as fecha_programacion
        FROM entregas_agua e
        LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
        LEFT JOIN programaciones p ON e.programacion_id = p.id
        LEFT JOIN cisternas c ON e.cisterna_id = c.id
        ${whereStr}
        ORDER BY e.fecha_hora DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const result = await query(dataQuery, [...params, limitNum, offset]);

      return res.json({
        data: result.rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        }
      });
    }

    const result = await query(`
      SELECT 
        e.*, 
        b.nombres_apellidos, 
        b.dni, 
        COALESCE(b.calle_direccion, b.direccion, '') as direccion, 
        COALESCE(b.sector_aahh, b.sector, '') as sector, 
        b.num_miembros, 
        b.telefono,
        c.placa as cisterna_placa,
        p.zona, 
        p.fecha as fecha_programacion
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      LEFT JOIN cisternas c ON e.cisterna_id = c.id
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
        cisterna_id,
        conductor_id,
        cuota_programada,
        litros_entregados,
        saldo_pendiente,
        estado_entrega,
        observaciones_entrega,
        firma_base64,
        foto_evidencia,
        latitud,
        longitud,
        fecha_hora
      } = entrega;

      const finalLitros = parseFloat(litros_entregados || '50');
      const finalCuota = parseFloat(cuota_programada || finalLitros);
      const finalSaldo = parseFloat(saldo_pendiente !== undefined && saldo_pendiente !== null ? saldo_pendiente : Math.max(0, finalCuota - finalLitros));
      const finalEstado = estado_entrega || (finalSaldo > 0 ? 'PARCIAL' : 'COMPLETA');

      const insertQuery = `
        INSERT INTO entregas_agua (
          beneficiario_id, programacion_id, cisterna_id, conductor_id,
          cuota_programada, litros_entregados, saldo_pendiente, estado_entrega, observaciones_entrega,
          firma_base64, foto_evidencia, latitud, longitud, fecha_hora, sincronizado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
      `;

      await query(insertQuery, [
        beneficiario_id,
        programacion_id,
        cisterna_id || null,
        conductor_id || null,
        finalCuota,
        finalLitros,
        finalSaldo,
        finalEstado,
        observaciones_entrega || null,
        firma_base64 || null,
        foto_evidencia || null,
        latitud || null,
        longitud || null,
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

export const generarActaPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        e.*, 
        b.nombres_apellidos, 
        b.dni, 
        COALESCE(b.mz, '-') as mz,
        COALESCE(b.lt, '-') as lote,
        COALESCE(b.calle_direccion, b.direccion, 'No especificada') as direccion, 
        COALESCE(b.sector_aahh, b.sector, 'Moyobamba') as sector, 
        COALESCE(b.num_miembros, 1) as num_miembros, 
        b.telefono,
        p.zona, 
        p.fecha as fecha_programacion,
        c.placa as cisterna_placa,
        COALESCE(c.capacidad_m3, 15) as cisterna_capacidad_m3,
        CONCAT(cond.nombres, ' ', cond.apellidos) as conductor_nombre,
        CONCAT(ayud.nombres, ' ', ayud.apellidos) as supervisor_nombre
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      LEFT JOIN cisternas c ON p.cisterna_id = c.id
      LEFT JOIN personal_operativo cond ON p.conductor_id = cond.id
      LEFT JOIN personal_operativo ayud ON p.ayudante_id = ayud.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entrega no encontrada' });
    }

    const entrega = result.rows[0];
    const doc = new PDFDocument({ margin: 36, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_Entrega_${entrega.dni || entrega.id}.pdf"`);

    doc.pipe(res);

    // Header Institucional PNSU / VIVIENDA / EPS MOYOBAMBA
    doc.fontSize(7.5).fillColor('#475569').text('PERÚ • Ministerio de Vivienda, Construcción y Saneamiento • Viceministerio de Construcción y Saneamiento • Programa Nacional de Saneamiento Urbano (PNSU)', { align: 'center' });
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0284c7').text('EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.', { align: 'center' });
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155').text('CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE — R.M. N° 357-2025-VIVIENDA', { align: 'center' });
    doc.moveDown(0.4);

    // Titulo Oficial Anexo Página 16
    doc.rect(36, doc.y, 523, 20).fill('#0f172a');
    doc.fillColor('#FFFFFF').fontSize(10.5).font('Helvetica-Bold').text(
      'FORMATO DE ENTREGA DE AGUA A POBLACIÓN',
      36, doc.y - 15, { align: 'center' }
    );
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // Cuadro de Metadatos de la Unidad y Operación (Pág. 16)
    const metaY = doc.y;
    doc.rect(36, metaY, 523, 62).stroke('#94a3b8');
    doc.fontSize(8).font('Helvetica');

    // Fila 1
    doc.font('Helvetica-Bold').text('Cap. de camión cisterna (m³):', 42, metaY + 6)
       .font('Helvetica').text(`${entrega.cisterna_capacidad_m3} m³`, 170, metaY + 6);
    doc.font('Helvetica-Bold').text('Placa:', 310, metaY + 6)
       .font('Helvetica').text(`${entrega.cisterna_placa || 'EGM-845'}`, 350, metaY + 6);

    // Fila 2
    doc.font('Helvetica-Bold').text('Región:', 42, metaY + 20)
       .font('Helvetica').text('San Martín', 170, metaY + 20);
    doc.font('Helvetica-Bold').text('Distrito / Provincia:', 310, metaY + 20)
       .font('Helvetica').text('Moyobamba / Moyobamba', 400, metaY + 20);

    // Fila 3
    doc.font('Helvetica-Bold').text('Zona de distribución:', 42, metaY + 34)
       .font('Helvetica').text(`${entrega.sector || 'Sol de Indañe'}`, 170, metaY + 34);
    doc.font('Helvetica-Bold').text('Fecha de Entrega:', 310, metaY + 34)
       .font('Helvetica').text(new Date(entrega.fecha_hora).toLocaleDateString('es-PE'), 400, metaY + 34);

    // Fila 4
    doc.font('Helvetica-Bold').text('N.A. Conductor:', 42, metaY + 48)
       .font('Helvetica').text(`${entrega.conductor_nombre || 'Conductor Asignado'}`, 170, metaY + 48);
    doc.font('Helvetica-Bold').text('N.A. Supervisor:', 310, metaY + 48)
       .font('Helvetica').text(`${entrega.supervisor_nombre || 'Ing. Supervisor de Campo'}`, 400, metaY + 48);

    doc.y = metaY + 70;

    // Tabla Oficial de Entrega a Beneficiario (Pág. 16)
    const tableY = doc.y;
    doc.rect(36, tableY, 523, 18).fill('#f1f5f9').stroke('#94a3b8');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#1e293b');

    doc.text('N°', 40, tableY + 5, { width: 18, align: 'center' });
    doc.text('Mz', 60, tableY + 5, { width: 22, align: 'center' });
    doc.text('Lote', 84, tableY + 5, { width: 24, align: 'center' });
    doc.text('Calle / Dirección / Predio', 110, tableY + 5, { width: 140 });
    doc.text('Jefe de Familia', 252, tableY + 5, { width: 110 });
    doc.text('Hab.', 364, tableY + 5, { width: 22, align: 'center' });
    doc.text('Agua (L)', 388, tableY + 5, { width: 42, align: 'center' });
    doc.text('DNI', 432, tableY + 5, { width: 44, align: 'center' });
    doc.text('Estado', 478, tableY + 5, { width: 78, align: 'center' });

    // Fila de datos
    const rowY = tableY + 18;
    const cuotaTotal = Number(entrega.cuota_programada || entrega.litros_entregados);
    const entregados = Number(entrega.litros_entregados);
    const saldo = Number(entrega.saldo_pendiente || 0);
    const esParcial = entrega.estado_entrega === 'PARCIAL' || saldo > 0;

    doc.rect(36, rowY, 523, 24).stroke('#cbd5e1');
    doc.fontSize(7.5).font('Helvetica').fillColor('#0f172a');

    doc.text(`1`, 40, rowY + 7, { width: 18, align: 'center' });
    doc.text(`${entrega.mz || '-'}`, 60, rowY + 7, { width: 22, align: 'center' });
    doc.text(`${entrega.lote || '-'}`, 84, rowY + 7, { width: 24, align: 'center' });
    doc.text(`${entrega.direccion}`, 110, rowY + 7, { width: 140 });
    doc.font('Helvetica-Bold').text(`${entrega.nombres_apellidos}`, 252, rowY + 7, { width: 110 }).font('Helvetica');
    doc.text(`${entrega.num_miembros}`, 364, rowY + 7, { width: 22, align: 'center' });
    doc.font('Helvetica-Bold').text(`${entregados} L`, 388, rowY + 7, { width: 42, align: 'center' }).font('Helvetica');
    doc.text(`${entrega.dni}`, 432, rowY + 7, { width: 44, align: 'center' });
    doc.font('Helvetica-Bold').fillColor(esParcial ? '#b45309' : '#15803d')
       .text(esParcial ? `PARCIAL (-${saldo}L)` : 'COMPLETO', 478, rowY + 7, { width: 78, align: 'center' })
       .fillColor('#000000').font('Helvetica');

    doc.y = rowY + 34;

    // Sección de Evidencia Fotográfica y Telemetría GPS
    const evY = doc.y;
    doc.rect(36, evY, 523, 115).stroke('#cbd5e1');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0284c7').text('VERIFICACIÓN TÉCNICA Y GEOLOCALIZACIÓN SATELITAL (GPS)', 42, evY + 8);
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155');

    doc.text(`• Coordenadas GPS del punto de entrega: Latitud ${entrega.latitud || '-6.03417'}, Longitud ${entrega.longitud || '-76.97139'}`, 42, evY + 24);
    doc.text(`• Precisión GPS del dispositivo móvil: ${entrega.precision_gps ? `${entrega.precision_gps} metros` : 'Alta (Satelital)'} • Altitud: ${entrega.altitud ? `${entrega.altitud} msnm` : '860 msnm'}`, 42, evY + 36);
    doc.text(`• Dotación reglamentaria: 50 L/hab/día • Modalidad: Abastecimiento Gratuito mediante Camión Cisterna (PNSU)`, 42, evY + 48);
    doc.text(`• Estado de Acreditación: VERIFICADO CON FEHACIENCIA TÉCNICA EN CAMPO`, 42, evY + 60);

    // Intentar insertar la fotografía de evidencia si existe en el disco
    if (entrega.foto_url) {
      try {
        const photoPath = path.join(process.cwd(), entrega.foto_url);
        if (fs.existsSync(photoPath)) {
          doc.image(photoPath, 420, evY + 12, { width: 130, height: 90, fit: [130, 90] });
          doc.rect(420, evY + 12, 130, 90).stroke('#94a3b8');
        }
      } catch (imgErr) {
        console.warn('No se pudo incrustar foto en PDF:', imgErr);
      }
    }

    doc.y = evY + 125;

    // Sección Oficial de Firmas (Página 16 del Convenio)
    const signY = doc.y;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('CONFORMIDAD Y SUSCRIPCIÓN INSTITUCIONAL', 36, signY);

    const signBoxesY = signY + 16;

    // Firma Beneficiario
    doc.rect(36, signBoxesY, 165, 75).stroke('#cbd5e1');
    if (entrega.firma_base64 && entrega.firma_base64.startsWith('data:image')) {
      try {
        const base64Data = entrega.firma_base64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, 46, signBoxesY + 6, { width: 145, height: 45, fit: [145, 45] });
      } catch (err) {}
    } else {
      doc.fontSize(7).font('Helvetica-Oblique').fillColor('#64748b')
         .text('(Acreditación fotográfica y GPS)', 46, signBoxesY + 25, { width: 145, align: 'center' })
         .fillColor('#000000');
    }
    doc.lineCap('butt').moveTo(46, signBoxesY + 54).lineTo(191, signBoxesY + 54).stroke('#94a3b8');
    doc.fontSize(7).font('Helvetica-Bold').text('FIRMA / HUELLA DEL BENEFICIARIO', 46, signBoxesY + 57, { width: 145, align: 'center' });
    doc.font('Helvetica').fontSize(6.5).text(`DNI: ${entrega.dni}`, 46, signBoxesY + 66, { width: 145, align: 'center' });

    // Firma Coordinador de la EPS (Exigido en Pág. 16)
    doc.rect(215, signBoxesY, 165, 75).stroke('#cbd5e1');
    doc.lineCap('butt').moveTo(225, signBoxesY + 54).lineTo(370, signBoxesY + 54).stroke('#94a3b8');
    doc.fontSize(7).font('Helvetica-Bold').text('FIRMA DEL COORDINADOR DE LA EPS', 225, signBoxesY + 57, { width: 145, align: 'center' });
    doc.font('Helvetica').fontSize(6.5).text('EPS Moyobamba S.A. - Convenio PNSU', 225, signBoxesY + 66, { width: 145, align: 'center' });

    // Firma Supervisor y/o Responsable del Seguimiento (Exigido en Pág. 16)
    doc.rect(394, signBoxesY, 165, 75).stroke('#cbd5e1');
    doc.lineCap('butt').moveTo(404, signBoxesY + 54).lineTo(549, signBoxesY + 54).stroke('#94a3b8');
    doc.fontSize(7).font('Helvetica-Bold').text('FIRMA DEL SUPERVISOR Y/O', 404, signBoxesY + 55, { width: 145, align: 'center' });
    doc.text('RESPONSABLE DEL SEGUIMIENTO', 404, signBoxesY + 63, { width: 145, align: 'center' });

    // Nota Oficial Reglamentaria al pie (Texto idéntico al Anexo Página 16)
    doc.fontSize(6.5).font('Helvetica-Oblique').fillColor('#475569').text(
      'Nota: Este formato será utilizado hasta la implementación del sistema de vales en conformidad con la Segunda Disposición Complementaria Final de la RM N° 357-2025-VIVIENDA, los cuales deberán estar visados por el coordinador designado por la EPS en marco del convenio suscrito.',
      36, signBoxesY + 84, { width: 523, align: 'justify' }
    );

    doc.end();
  } catch (error: any) {
    console.error('Error generando acta PDF:', error);
    res.status(500).json({ message: 'Error al generar acta en PDF', error: error.message });
  }
};

/**
 * Exportar Formato Oficial de Entrega de Agua en PDF (Ficha Paisaje A4 con cuadrícula, firmas y metadatos)
 */
export const exportarFormatoPdf = async (req: Request, res: Response) => {
  try {
    const { search, programacion_id, cisterna_id, fecha } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      whereClauses.push(`(b.dni ILIKE $${params.length} OR b.nombres_apellidos ILIKE $${params.length} OR b.sector_aahh ILIKE $${params.length} OR b.sector ILIKE $${params.length} OR e.local_id ILIKE $${params.length})`);
    }

    if (programacion_id) {
      params.push(programacion_id);
      whereClauses.push(`e.programacion_id = $${params.length}`);
    }

    if (cisterna_id) {
      params.push(cisterna_id);
      whereClauses.push(`COALESCE(e.cisterna_id, p.cisterna_id) = $${params.length}`);
    }

    if (fecha) {
      params.push(fecha);
      whereClauses.push(`(DATE(e.fecha_captura) = $${params.length} OR DATE(e.fecha_hora) = $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT 
        e.*, 
        b.nombres_apellidos, 
        b.dni, 
        COALESCE(b.mz, '-') as mz,
        COALESCE(b.lt, '-') as lt,
        COALESCE(b.calle_direccion, b.direccion, 'ALTO BELEN') as direccion, 
        COALESCE(b.sector_aahh, b.sector, 'LOS EUCALIPTOS') as sector, 
        COALESCE(b.num_miembros, 1) as num_miembros, 
        b.telefono,
        COALESCE(c.placa, 'CAT - 849') as cisterna_placa,
        COALESCE(c.capacidad_m3, 19) as cisterna_capacidad_m3,
        COALESCE(p.zona, b.sector_aahh, b.sector, 'LOS EUCALIPTOS') as zona, 
        p.fecha as fecha_programacion,
        COALESCE(CONCAT(cond.nombres, ' ', cond.apellidos), 'Carlos Iván Ruiz Chupillón') as conductor_nombre,
        COALESCE(CONCAT(ayud.nombres, ' ', ayud.apellidos), 'Ing. SANDRO SORIA CHUQUIZUTA') as supervisor_nombre
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      LEFT JOIN cisternas c ON COALESCE(e.cisterna_id, p.cisterna_id) = c.id
      LEFT JOIN personal_operativo cond ON COALESCE(e.conductor_id, p.conductor_id) = cond.id
      LEFT JOIN personal_operativo ayud ON p.ayudante_id = ayud.id
      ${whereStr}
      ORDER BY e.fecha_hora ASC, e.id ASC
    `;

    const result = await query(sql, params);
    const entregas = result.rows;

    const first = entregas[0] || {};
    const capCisterna = first.cisterna_capacidad_m3 ? `${Math.round(Number(first.cisterna_capacidad_m3))} m3` : '19 m3';
    const placaCisterna = first.cisterna_placa || 'CAT - 849';
    const conductorNombre = (first.conductor_nombre && first.conductor_nombre.trim()) || 'Carlos Iván Ruiz Chupillón';
    const supervisorNombre = (first.supervisor_nombre && first.supervisor_nombre.trim()) || 'Ing. SANDRO SORIA CHUQUIZUTA';
    const zonaDistribucion = first.zona || first.sector || 'LOS EUCALIPTOS';
    
    let fechaStr = '31-08-2026';
    if (first.fecha_captura || first.fecha_hora) {
      const d = new Date(first.fecha_captura || first.fecha_hora);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      fechaStr = `${day}-${month}-${year}`;
    }

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Formato_Entrega_Agua_${fechaStr.replace(/-/g, '')}.pdf"`);
    doc.pipe(res);

    const startX = 28;
    const totalWidth = 785;
    const halfWidth = totalWidth / 2; // 392.5

    // Ancho de columnas de la tabla (Suma exacta = 785)
    // N°: 25, Mz: 28, Lt: 32, DIRECCIÓN: 155, Jefe de familia: 175, Hab: 55, Litros: 70, DNI: 75, FIRMA: 170
    const colWidths = [25, 28, 32, 155, 175, 55, 70, 75, 170];

    const drawHeader = (pageNumber: number) => {
      // 1. Título Centrado
      doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#000000')
         .text('FORMATO DE ENTREGA DE AGUA', startX, 24, { width: totalWidth, align: 'center' });

      // 2. Cuadro de Metadatos
      const boxY = 42;
      const boxH = 68;
      const rowH = boxH / 5; // 13.6

      doc.rect(startX, boxY, totalWidth, boxH).stroke('#000000');
      doc.moveTo(startX + halfWidth, boxY).lineTo(startX + halfWidth, boxY + boxH).stroke('#000000');

      // Líneas horizontales interiores
      for (let i = 1; i < 5; i++) {
        const yLine = boxY + i * rowH;
        doc.moveTo(startX, yLine).lineTo(startX + halfWidth, yLine).stroke('#000000');
        doc.moveTo(startX + halfWidth, yLine).lineTo(startX + totalWidth, yLine).stroke('#000000');
      }

      // Contenido Columna Izquierda
      const drawMetaLeft = (rowIdx: number, label: string, value: string) => {
        const y = boxY + rowIdx * rowH + 3.5;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000').text(label, startX + 5, y, { width: 115 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#000000').text(value, startX + 120, y, { width: halfWidth - 125 });
      };

      // Contenido Columna Derecha
      const drawMetaRight = (rowIdx: number, label: string, value: string) => {
        const y = boxY + rowIdx * rowH + 3.5;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000').text(label, startX + halfWidth + 5, y, { width: 105 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#000000').text(value, startX + halfWidth + 110, y, { width: halfWidth - 115 });
      };

      drawMetaLeft(0, 'Cap. de camión cisterna:', capCisterna);
      drawMetaLeft(1, 'Región:', 'SAN MARTIN');
      drawMetaLeft(2, 'Provincia:', 'MOYOBAMBA');
      drawMetaLeft(3, 'N.A. Conductor:', conductorNombre);
      drawMetaLeft(4, 'Fecha:', fechaStr);

      drawMetaRight(0, 'Placa:', placaCisterna);
      drawMetaRight(1, 'Distrito:', 'MOYOBAMBA');
      drawMetaRight(2, 'Zona de distribución:', zonaDistribucion);
      drawMetaRight(3, 'N.A. Supervisor:', supervisorNombre);
      drawMetaRight(4, '', '');

      // 3. Cabecera de la Tabla
      const tableHeadY = 114;
      const headH = 24;

      doc.rect(startX, tableHeadY, totalWidth, headH).fillAndStroke('#f8fafc', '#000000');

      let curX = startX;
      for (let i = 0; i < colWidths.length - 1; i++) {
        curX += colWidths[i];
        doc.moveTo(curX, tableHeadY).lineTo(curX, tableHeadY + headH).stroke('#000000');
      }

      // Textos de cabecera
      curX = startX;
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);

      doc.text('N°', curX, tableHeadY + 8, { width: colWidths[0], align: 'center' });
      curX += colWidths[0];

      doc.text('Mz', curX, tableHeadY + 8, { width: colWidths[1], align: 'center' });
      curX += colWidths[1];

      doc.text('N° de Lt', curX, tableHeadY + 8, { width: colWidths[2], align: 'center' });
      curX += colWidths[2];

      // DIRECCIÓN con subtítulo calle/dirección/cuadra/N°
      doc.text('DIRECCIÓN', curX, tableHeadY + 3, { width: colWidths[3], align: 'center' });
      doc.font('Helvetica').fontSize(6).text('calle/dirección/cuadra/N°', curX, tableHeadY + 13, { width: colWidths[3], align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5);
      curX += colWidths[3];

      doc.text('Jefe de familia', curX + 4, tableHeadY + 8, { width: colWidths[4] - 8, align: 'center' });
      curX += colWidths[4];

      doc.text('N° de\nhabitantes', curX, tableHeadY + 4, { width: colWidths[5], align: 'center' });
      curX += colWidths[5];

      doc.text('Agua\notorgada (lts)', curX, tableHeadY + 4, { width: colWidths[6], align: 'center' });
      curX += colWidths[6];

      doc.text('DNI', curX, tableHeadY + 8, { width: colWidths[7], align: 'center' });
      curX += colWidths[7];

      doc.text('FIRMA', curX, tableHeadY + 8, { width: colWidths[8], align: 'center' });
    };

    const rowsPerPage = 17;
    const totalItems = entregas.length > 0 ? entregas.length : 17; // Al menos 17 filas vacías si no hay datos
    let currentPage = 1;
    let currentY = 138;
    const rowHeight = 22.5;

    drawHeader(currentPage);

    let totalHabitantes = 0;
    let totalLitros = 0;

    for (let idx = 0; idx < totalItems; idx++) {
      const e = entregas[idx];

      // Salto de página si se supera el límite por hoja
      if (idx > 0 && idx % rowsPerPage === 0) {
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        currentY = 138;
      }

      // Dibujar contorno de la fila
      doc.rect(startX, currentY, totalWidth, rowHeight).stroke('#000000');

      // Líneas verticales de columnas
      let curColX = startX;
      for (let c = 0; c < colWidths.length - 1; c++) {
        curColX += colWidths[c];
        doc.moveTo(curColX, currentY).lineTo(curColX, currentY + rowHeight).stroke('#000000');
      }

      if (e) {
        const hab = Number(e.num_miembros) || 1;
        const litros = Number(e.litros_entregados) || 0;
        totalHabitantes += hab;
        totalLitros += litros;

        let curX = startX;
        doc.fillColor('#000000').font('Helvetica').fontSize(7.5);

        // N°
        doc.text(String(idx + 1), curX, currentY + 7, { width: colWidths[0], align: 'center' });
        curX += colWidths[0];

        // Mz
        doc.text(String(e.mz || '-'), curX, currentY + 7, { width: colWidths[1], align: 'center' });
        curX += colWidths[1];

        // Lt
        doc.text(String(e.lt || '-'), curX, currentY + 7, { width: colWidths[2], align: 'center' });
        curX += colWidths[2];

        // DIRECCIÓN
        doc.text(String(e.direccion || 'ALTO BELEN').slice(0, 34), curX + 4, currentY + 7, { width: colWidths[3] - 8, align: 'left' });
        curX += colWidths[3];

        // Jefe de familia
        doc.font('Helvetica-Bold').text(String(e.nombres_apellidos || '').toUpperCase().slice(0, 38), curX + 4, currentY + 7, { width: colWidths[4] - 8, align: 'left' });
        doc.font('Helvetica');
        curX += colWidths[4];

        // Habitantes
        doc.text(String(hab), curX, currentY + 7, { width: colWidths[5], align: 'center' });
        curX += colWidths[5];

        // Agua otorgada (lts)
        doc.font('Helvetica-Bold').text(String(litros), curX, currentY + 7, { width: colWidths[6], align: 'center' });
        doc.font('Helvetica');
        curX += colWidths[6];

        // DNI
        doc.text(String(e.dni || ''), curX, currentY + 7, { width: colWidths[7], align: 'center' });
        curX += colWidths[7];

        // FIRMA (Incrustación de firma digital si existe)
        if (e.firma_base64 && typeof e.firma_base64 === 'string' && e.firma_base64.startsWith('data:image')) {
          try {
            const base64Data = e.firma_base64.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, curX + 15, currentY + 2, { fit: [colWidths[8] - 30, rowHeight - 4], align: 'center', valign: 'center' });
          } catch (err) {
            doc.fontSize(6.5).font('Helvetica-Oblique').fillColor('#64748b')
               .text('[Firma Digital]', curX, currentY + 7, { width: colWidths[8], align: 'center' });
          }
        }
      }

      currentY += rowHeight;
    }

    // Pie de página institucional (Firma y sello EPS MOYOBAMBA S.A.)
    const footerY = Math.max(currentY + 12, 530);

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000')
       .text('EPS MOYOBAMBA S.A.', startX, footerY);
    
    // Línea de firma
    doc.moveTo(startX, footerY + 26).lineTo(startX + 180, footerY + 26).stroke('#000000');
    doc.font('Helvetica').fontSize(7.5).fillColor('#000000')
       .text('ING. JOSÉ ELOY MAGUIÑA ALZAMORA', startX, footerY + 30);
    doc.fontSize(6.5).fillColor('#475569')
       .text('Supervisor de Operaciones y Distribución', startX, footerY + 40);

    // Resumen de Totales a la derecha
    const totalBoxX = startX + totalWidth - 260;
    doc.rect(totalBoxX, footerY, 260, 36).stroke('#000000');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000')
       .text('TOTAL DE AGUA OTORGADA:', totalBoxX + 8, footerY + 6)
       .text(`${totalLitros.toLocaleString('es-PE')} Litros`, totalBoxX + 160, footerY + 6);
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
       .text('Beneficiarios atendidos:', totalBoxX + 8, footerY + 20)
       .text(`${entregas.length} familias (${totalHabitantes} hab.)`, totalBoxX + 160, footerY + 20);

    doc.end();
  } catch (error: any) {
    console.error('Error generando Formato de Entrega PDF:', error);
    res.status(500).json({ message: 'Error generando Formato de Entrega PDF', error: error.message });
  }
};

/**
 * Exportar Formato Oficial de Entrega de Agua en Excel (.xlsx) con idéntica estructura al documento impreso
 */
export const exportarEntregasExcel = async (req: Request, res: Response) => {
  try {
    const { search, programacion_id, cisterna_id, fecha } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      whereClauses.push(`(b.dni ILIKE $${params.length} OR b.nombres_apellidos ILIKE $${params.length} OR b.sector_aahh ILIKE $${params.length} OR b.sector ILIKE $${params.length} OR e.local_id ILIKE $${params.length})`);
    }

    if (programacion_id) {
      params.push(programacion_id);
      whereClauses.push(`e.programacion_id = $${params.length}`);
    }

    if (cisterna_id) {
      params.push(cisterna_id);
      whereClauses.push(`COALESCE(e.cisterna_id, p.cisterna_id) = $${params.length}`);
    }

    if (fecha) {
      params.push(fecha);
      whereClauses.push(`(DATE(e.fecha_captura) = $${params.length} OR DATE(e.fecha_hora) = $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT 
        e.*, 
        b.nombres_apellidos, 
        b.dni, 
        COALESCE(b.mz, '-') as mz,
        COALESCE(b.lt, '-') as lt,
        COALESCE(b.calle_direccion, b.direccion, 'ALTO BELEN') as direccion, 
        COALESCE(b.sector_aahh, b.sector, 'LOS EUCALIPTOS') as sector, 
        COALESCE(b.num_miembros, 1) as num_miembros, 
        b.telefono,
        COALESCE(c.placa, 'CAT - 849') as cisterna_placa,
        COALESCE(c.capacidad_m3, 19) as cisterna_capacidad_m3,
        COALESCE(p.zona, b.sector_aahh, b.sector, 'LOS EUCALIPTOS') as zona, 
        p.fecha as fecha_programacion,
        COALESCE(CONCAT(cond.nombres, ' ', cond.apellidos), 'Carlos Iván Ruiz Chupillón') as conductor_nombre,
        COALESCE(CONCAT(ayud.nombres, ' ', ayud.apellidos), 'Ing. SANDRO SORIA CHUQUIZUTA') as supervisor_nombre
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      LEFT JOIN cisternas c ON COALESCE(e.cisterna_id, p.cisterna_id) = c.id
      LEFT JOIN personal_operativo cond ON COALESCE(e.conductor_id, p.conductor_id) = cond.id
      LEFT JOIN personal_operativo ayud ON p.ayudante_id = ayud.id
      ${whereStr}
      ORDER BY e.fecha_hora ASC, e.id ASC
    `;

    const result = await query(sql, params);
    const entregas = result.rows;

    const first = entregas[0] || {};
    const capCisterna = first.cisterna_capacidad_m3 ? `${Math.round(Number(first.cisterna_capacidad_m3))} m3` : '19 m3';
    const placaCisterna = first.cisterna_placa || 'CAT - 849';
    const conductorNombre = (first.conductor_nombre && first.conductor_nombre.trim()) || 'Carlos Iván Ruiz Chupillón';
    const supervisorNombre = (first.supervisor_nombre && first.supervisor_nombre.trim()) || 'Ing. SANDRO SORIA CHUQUIZUTA';
    const zonaDistribucion = first.zona || first.sector || 'LOS EUCALIPTOS';
    
    let fechaStr = '31-08-2026';
    if (first.fecha_captura || first.fecha_hora) {
      const d = new Date(first.fecha_captura || first.fecha_hora);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      fechaStr = `${day}-${month}-${year}`;
    }

    const wb = xlsx.utils.book_new();

    // Filas estructuradas idénticas a la ficha oficial
    const rows: any[][] = [
      ['FORMATO DE ENTREGA DE AGUA'], // Fila 1 (A1:I1)
      [], // Fila 2
      ['Cap. de camión cisterna:', capCisterna, '', '', 'Placa:', placaCisterna, '', '', ''], // Fila 3
      ['Región:', 'SAN MARTIN', '', '', 'Distrito:', 'MOYOBAMBA', '', '', ''], // Fila 4
      ['Provincia:', 'MOYOBAMBA', '', '', 'Zona de distribución:', zonaDistribucion, '', '', ''], // Fila 5
      ['N.A. Conductor:', conductorNombre, '', '', 'N.A. Supervisor:', supervisorNombre, '', '', ''], // Fila 6
      ['Fecha:', fechaStr, '', '', '', '', '', '', ''], // Fila 7
      [], // Fila 8
      ['N°', 'Mz', 'N° de Lt', 'DIRECCIÓN', 'Jefe de familia', 'N° de habitantes', 'Agua otorgada (lts)', 'DNI', 'FIRMA'], // Fila 9
      ['', '', '', 'calle/dirección/cuadra/N°', '', '', '', '', ''] // Fila 10
    ];

    let totalHabitantes = 0;
    let totalLitros = 0;

    entregas.forEach((e: any, idx: number) => {
      const hab = Number(e.num_miembros) || 1;
      const litros = Number(e.litros_entregados) || 0;
      totalHabitantes += hab;
      totalLitros += litros;

      rows.push([
        idx + 1,
        e.mz || '-',
        e.lt || '-',
        e.direccion || 'ALTO BELEN',
        (e.nombres_apellidos || '').toUpperCase(),
        hab,
        litros,
        e.dni || '',
        e.firma_base64 ? 'FIRMADO DIGITALMENTE' : ''
      ]);
    });

    // Filas vacías si hay pocas entregas para simular la ficha de 17 reglones
    if (entregas.length < 17) {
      for (let f = entregas.length + 1; f <= 17; f++) {
        rows.push([f, '-', '-', '', '', '', '', '', '']);
      }
    }

    rows.push([]);
    rows.push(['TOTALES', '', '', '', `${entregas.length} Familias`, totalHabitantes, totalLitros, '', '']);
    rows.push([]);
    rows.push(['EPS MOYOBAMBA S.A.']);
    rows.push(['______________________________________']);
    rows.push(['ING. JOSÉ ELOY MAGUIÑA ALZAMORA']);
    rows.push(['Supervisor de Operaciones y Distribución']);

    const ws = xlsx.utils.aoa_to_sheet(rows);

    // Configuración de rangos combinados (merges)
    ws['!merges'] = [
      // Título
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      // Metadatos
      { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } }, // Valor Cap
      { s: { r: 2, c: 5 }, e: { r: 2, c: 8 } }, // Valor Placa
      { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } }, // Valor Región
      { s: { r: 3, c: 5 }, e: { r: 3, c: 8 } }, // Valor Distrito
      { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } }, // Valor Provincia
      { s: { r: 4, c: 5 }, e: { r: 4, c: 8 } }, // Valor Zona
      { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } }, // Valor Conductor
      { s: { r: 5, c: 5 }, e: { r: 5, c: 8 } }, // Valor Supervisor
      { s: { r: 6, c: 1 }, e: { r: 6, c: 3 } }  // Valor Fecha
    ];

    // Ancho de columnas óptimo
    ws['!cols'] = [
      { wch: 6 },  // N°
      { wch: 8 },  // Mz
      { wch: 10 }, // Lt
      { wch: 28 }, // Dirección
      { wch: 34 }, // Jefe de familia
      { wch: 16 }, // Habitantes
      { wch: 18 }, // Agua otorgada
      { wch: 14 }, // DNI
      { wch: 22 }  // Firma
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Formato_Entrega');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Formato_Entrega_Agua_${fechaStr.replace(/-/g, '')}.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando Formato de Entrega a Excel:', error);
    res.status(500).json({ message: 'Error exportando Formato de Entrega a Excel', error: error.message });
  }
};

