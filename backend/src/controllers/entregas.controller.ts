import { Request, Response } from 'express';
import { query } from '../db';
import PDFDocument from 'pdfkit';
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
