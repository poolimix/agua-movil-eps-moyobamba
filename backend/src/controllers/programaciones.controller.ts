import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import * as xlsx from 'xlsx';
import { query } from '../db';
import { getConfiguracion } from '../services/configuracion.service';

const ensureProgramacionesSchema = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS programaciones (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        zona TEXT,
        estado VARCHAR(100) DEFAULT 'Activa'
      );
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS zona TEXT;
      ALTER TABLE programaciones ALTER COLUMN zona TYPE TEXT;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS estado VARCHAR(100) DEFAULT 'Activa';
      ALTER TABLE programaciones ALTER COLUMN estado TYPE VARCHAR(100);
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS ayudante_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS litros_programados INT DEFAULT 0;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS viajes_estimados INT DEFAULT 1;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS dias_semana TEXT DEFAULT 'Lunes, Miércoles, Viernes';
      ALTER TABLE programaciones ALTER COLUMN dias_semana TYPE TEXT;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS sectores_seleccionados TEXT;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha_fin DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS es_anual BOOLEAN DEFAULT TRUE;
      UPDATE programaciones SET fecha_inicio = fecha WHERE fecha_inicio IS NULL;
      UPDATE programaciones SET fecha_fin = fecha WHERE fecha_fin IS NULL;

      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS etapa_control VARCHAR(50) DEFAULT 'CARGA';
    `);
  } catch (err) {
    console.warn('Auto-reparación programaciones:', err);
  }
};

export const getAllProgramaciones = async (req: Request, res: Response) => {
  try {
    await ensureProgramacionesSchema();
    const result = await query(`
      SELECT 
        p.*,
        COALESCE(p.fecha_inicio, p.fecha) as fecha_inicio,
        COALESCE(p.fecha_fin, p.fecha) as fecha_fin,
        COALESCE(p.es_anual, TRUE) as es_anual,
        c.placa as cisterna_placa,
        c.marca_modelo as cisterna_marca,
        c.capacidad_m3 as cisterna_capacidad_m3,
        c.capacidad_litros as cisterna_capacidad_litros,
        CONCAT(pers.nombres, ' ', pers.apellidos) as conductor_nombre,
        pers.dni as conductor_dni,
        pers.licencia_conducir as conductor_licencia,
        pers.telefono as conductor_telefono,
        pers.email as conductor_email,
        CONCAT(ayud.nombres, ' ', ayud.apellidos) as ayudante_nombre,
        ayud.dni as ayudante_dni,
        ayud.telefono as ayudante_telefono,
        ayud.email as ayudante_email,
        (SELECT COUNT(*) FROM entregas_agua e WHERE e.programacion_id = p.id) as total_entregas,
        (SELECT COALESCE(SUM(litros_entregados), 0) FROM entregas_agua e WHERE e.programacion_id = p.id) as total_litros,
        (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(litros_entregados), 0) / COUNT(*), 0) ELSE 0 END FROM entregas_agua e WHERE e.programacion_id = p.id) as volumen_promedio,
        (SELECT COALESCE(SUM(b.num_miembros), 0) FROM entregas_agua e JOIN beneficiarios b ON e.beneficiario_id = b.id WHERE e.programacion_id = p.id) as poblacion_beneficiada,
        (SELECT ROUND((COALESCE(SUM(litros_entregados), 0)::numeric / 1000.0) * 39.13, 2) FROM entregas_agua e WHERE e.programacion_id = p.id) as monto_valorizado,
        ROUND((COALESCE(p.litros_programados, 15000)::numeric / 1000.0) * 39.13, 2) as monto_programado,
        ROUND(COALESCE(p.litros_programados, 15000)::numeric / 350.0 * 4) as poblacion_programada,
        (SELECT COALESCE(SUM(litros_entregados), 0) FROM entregas_agua e WHERE e.programacion_id = p.id AND e.fecha_hora >= date_trunc('week', CURRENT_DATE)) as litros_esta_semana,
        (SELECT COALESCE(SUM(litros_entregados), 0) FROM entregas_agua e WHERE e.programacion_id = p.id AND e.fecha_hora >= date_trunc('month', CURRENT_DATE)) as litros_este_mes,
        (SELECT COUNT(DISTINCT e.beneficiario_id) FROM entregas_agua e WHERE e.programacion_id = p.id AND e.fecha_hora >= date_trunc('week', CURRENT_DATE)) as familias_esta_semana,
        (SELECT COUNT(*) FROM control_calidad cc WHERE cc.programacion_id = p.id) as total_calidad,
        (SELECT COUNT(*) FROM control_calidad cc WHERE cc.programacion_id = p.id AND cc.etapa_control = 'CARGA') as calidad_carga,
        (SELECT COUNT(*) FROM control_calidad cc WHERE cc.programacion_id = p.id AND cc.etapa_control = 'RUTA') as calidad_ruta,
        (SELECT COUNT(*) FROM control_calidad cc WHERE cc.programacion_id = p.id AND cc.etapa_control = 'ADICIONAL') as calidad_adicional
      FROM programaciones p 
      LEFT JOIN cisternas c ON p.cisterna_id = c.id
      LEFT JOIN personal_operativo pers ON p.conductor_id = pers.id
      LEFT JOIN personal_operativo ayud ON p.ayudante_id = ayud.id
      ORDER BY p.id DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching programaciones:', error);
    res.status(500).json({ message: 'Error fetching programaciones', error: error.message });
  }
};

export const createProgramacion = async (req: Request, res: Response) => {
  try {
    await ensureProgramacionesSchema();
    const {
      fecha,
      fecha_inicio,
      fecha_fin,
      es_anual = true,
      zona,
      sectores_seleccionados,
      estado = 'Activa',
      cisterna_id,
      conductor_id,
      ayudante_id,
      litros_programados,
      viajes_estimados,
      dias_semana = 'Lunes, Miércoles, Viernes',
    } = req.body;

    const fInicio = fecha_inicio || fecha || new Date().toISOString().split('T')[0];
    const fFin = fecha_fin || fInicio;

    const parsedCisternaId = cisterna_id && !isNaN(parseInt(String(cisterna_id), 10)) && parseInt(String(cisterna_id), 10) > 0 
      ? parseInt(String(cisterna_id), 10) 
      : null;
    let parsedConductorId = conductor_id && !isNaN(parseInt(String(conductor_id), 10)) && parseInt(String(conductor_id), 10) > 0 
      ? parseInt(String(conductor_id), 10) 
      : null;
    let parsedAyudanteId = ayudante_id && !isNaN(parseInt(String(ayudante_id), 10)) && parseInt(String(ayudante_id), 10) > 0 
      ? parseInt(String(ayudante_id), 10) 
      : null;

    if (parsedConductorId) {
      const condCheck = await query('SELECT id FROM personal_operativo WHERE id = $1', [parsedConductorId]);
      if (condCheck.rows.length === 0) parsedConductorId = null;
    }

    if (parsedAyudanteId) {
      const ayudCheck = await query('SELECT id FROM personal_operativo WHERE id = $1', [parsedAyudanteId]);
      if (ayudCheck.rows.length === 0) parsedAyudanteId = null;
    }

    let viajes = parseInt(String(viajes_estimados), 10);

    if (!viajes || isNaN(viajes) || viajes <= 0) {
      if (parsedCisternaId && litros_programados) {
        const cisternaRes = await query('SELECT capacidad_litros FROM cisternas WHERE id = $1', [parsedCisternaId]);
        const cap = cisternaRes.rows[0]?.capacidad_litros || 15000;
        viajes = Math.max(1, Math.ceil(parseInt(String(litros_programados), 10) / cap));
      } else {
        viajes = 1;
      }
    }

    const insertQuery = `
      INSERT INTO programaciones (
        fecha, fecha_inicio, fecha_fin, es_anual, zona, sectores_seleccionados, estado, cisterna_id, conductor_id, ayudante_id, litros_programados, viajes_estimados, dias_semana
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const result = await query(insertQuery, [
      fInicio,
      fInicio,
      fFin,
      es_anual === true || es_anual === 'true',
      zona || sectores_seleccionados || 'Sector General',
      sectores_seleccionados || zona || null,
      estado || 'Activa',
      parsedCisternaId,
      parsedConductorId,
      parsedAyudanteId,
      parseInt(String(litros_programados), 10) || 0,
      viajes,
      dias_semana || 'Lunes, Miércoles, Viernes',
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating programacion:', error);
    res.status(500).json({ message: 'Error al crear la programación', error: error.message });
  }
};

export const updateProgramacion = async (req: Request, res: Response) => {
  try {
    await ensureProgramacionesSchema();
    const { id } = req.params;
    const {
      fecha,
      fecha_inicio,
      fecha_fin,
      es_anual,
      zona,
      sectores_seleccionados,
      estado,
      cisterna_id,
      conductor_id,
      ayudante_id,
      litros_programados,
      viajes_estimados,
      dias_semana,
    } = req.body;

    const fInicio = fecha_inicio || fecha;
    const fFin = fecha_fin || fInicio;

    const parsedCisternaId = cisterna_id && !isNaN(parseInt(String(cisterna_id), 10)) && parseInt(String(cisterna_id), 10) > 0 
      ? parseInt(String(cisterna_id), 10) 
      : null;
    let parsedConductorId = conductor_id && !isNaN(parseInt(String(conductor_id), 10)) && parseInt(String(conductor_id), 10) > 0 
      ? parseInt(String(conductor_id), 10) 
      : null;
    let parsedAyudanteId = ayudante_id && !isNaN(parseInt(String(ayudante_id), 10)) && parseInt(String(ayudante_id), 10) > 0 
      ? parseInt(String(ayudante_id), 10) 
      : null;

    if (parsedConductorId) {
      const condCheck = await query('SELECT id FROM personal_operativo WHERE id = $1', [parsedConductorId]);
      if (condCheck.rows.length === 0) parsedConductorId = null;
    }

    if (parsedAyudanteId) {
      const ayudCheck = await query('SELECT id FROM personal_operativo WHERE id = $1', [parsedAyudanteId]);
      if (ayudCheck.rows.length === 0) parsedAyudanteId = null;
    }

    let viajes = parseInt(String(viajes_estimados), 10);

    if (!viajes || isNaN(viajes) || viajes <= 0) {
      if (parsedCisternaId && litros_programados) {
        const cisternaRes = await query('SELECT capacidad_litros FROM cisternas WHERE id = $1', [parsedCisternaId]);
        const cap = cisternaRes.rows[0]?.capacidad_litros || 15000;
        viajes = Math.max(1, Math.ceil(parseInt(String(litros_programados), 10) / cap));
      } else {
        viajes = 1;
      }
    }

    const sql = `
      UPDATE programaciones
      SET fecha = COALESCE($1, fecha),
          fecha_inicio = COALESCE($2, fecha_inicio, fecha),
          fecha_fin = COALESCE($3, fecha_fin, fecha),
          es_anual = COALESCE($4, es_anual, TRUE),
          zona = $5,
          sectores_seleccionados = $6,
          estado = $7,
          cisterna_id = $8,
          conductor_id = $9,
          ayudante_id = $10,
          litros_programados = $11,
          viajes_estimados = $12,
          dias_semana = $13
      WHERE id = $14
      RETURNING *;
    `;

    const result = await query(sql, [
      fInicio || null,
      fInicio || null,
      fFin || null,
      es_anual !== undefined ? (es_anual === true || es_anual === 'true') : null,
      zona,
      sectores_seleccionados || zona || null,
      estado,
      parsedCisternaId,
      parsedConductorId,
      parsedAyudanteId,
      parseInt(String(litros_programados), 10) || 0,
      viajes,
      dias_semana || 'Lunes, Miércoles, Viernes',
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada.' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating programacion:', error);
    res.status(500).json({ message: 'Error al actualizar programación', error: error.message });
  }
};

export const deleteProgramacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM vales_consumo WHERE programacion_id = $1', [id]).catch(() => {});
    await query('DELETE FROM vales_entrega WHERE programacion_id = $1', [id]).catch(() => {});
    await query('DELETE FROM entregas_agua WHERE programacion_id = $1', [id]).catch(() => {});
    await query('UPDATE control_calidad SET programacion_id = NULL WHERE programacion_id = $1', [id]).catch(() => {});
    await query('DELETE FROM programaciones WHERE id = $1', [id]);
    res.json({ message: 'Programación eliminada correctamente' });
  } catch (error: any) {
    console.error('Error deleting programacion:', error);
    res.status(500).json({ message: 'Error deleting programacion', error: error.message });
  }
};

export const generatePdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const progResult = await query(`
      SELECT 
        p.*,
        c.placa as cisterna_placa,
        c.marca_modelo as cisterna_marca,
        c.capacidad_m3 as cisterna_capacidad_m3,
        CONCAT(pers.nombres, ' ', pers.apellidos) as conductor_nombre,
        pers.licencia_conducir as conductor_licencia
      FROM programaciones p
      LEFT JOIN cisternas c ON p.cisterna_id = c.id
      LEFT JOIN personal_operativo pers ON p.conductor_id = pers.id
      WHERE p.id = $1
    `, [id]);

    if (progResult.rows.length === 0) {
      return res.status(404).json({ message: 'Programacion no encontrada' });
    }
    const programacion = progResult.rows[0];

    const entregasResult = await query(`
      SELECT e.*, b.nombres_apellidos, b.dni, b.direccion, b.num_miembros 
      FROM entregas_agua e
      JOIN beneficiarios b ON e.beneficiario_id = b.id
      WHERE e.programacion_id = $1
      ORDER BY b.nombres_apellidos ASC
    `, [id]);
    const entregas = entregasResult.rows;

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Anexo2_Prog${id}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold')
      .text('FORMATO DE ENTREGA DE AGUA - ANEXO 2', { align: 'center' });
    doc.fontSize(8.5).font('Helvetica')
      .text(`EPS MOYOBAMBA S.A.  |  Región: SAN MARTIN  |  Provincia: MOYOBAMBA  |  Distrito: MOYOBAMBA  |  Zona: ${programacion.zona}`, { align: 'center' });
    doc.fontSize(8).text(
      `Fecha: ${new Date(programacion.fecha).toLocaleDateString('es-PE')}  |  Cap. Cisterna: ${programacion.cisterna_capacidad_m3 || 15} m³ (${programacion.cisterna_placa || 'EGA-902'})  |  Conductor: ${programacion.conductor_nombre || 'Asignado'}  |  Supervisor: ING. SANDRO SORIA CHUQUIZUTA`,
      { align: 'center' }
    );
    doc.moveDown(0.8);

    const colWidths = [25, 175, 65, 150, 50, 65, 65, 125];
    const headers  = ['N°', 'Jefe de Familia', 'DNI', 'Dirección', 'Hab.', 'Otorgado', 'Saldo Pend.', 'Firma / Evidencia'];
    const startX   = 40;
    let   curX     = startX;
    const rowH     = 22;

    doc.rect(startX, doc.y, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#1E40AF');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8.5);

    headers.forEach((h, i) => {
      doc.text(h, curX + 2, doc.y - rowH + 6, { width: colWidths[i] - 4, align: 'center' });
      curX += colWidths[i];
    });

    doc.fillColor('black').font('Helvetica').fontSize(8);
    doc.moveDown(0.3);

    entregas.forEach((entrega, index) => {
      const rowY = doc.y;
      curX = startX;

      if (index % 2 === 0) {
        doc.rect(startX, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#EFF6FF');
      }
      doc.fillColor('black');

      const saldoNum = Number(entrega.saldo_pendiente || 0);
      const cells = [
        (index + 1).toString(),
        entrega.nombres_apellidos,
        entrega.dni,
        entrega.direccion || '-',
        entrega.num_miembros?.toString() || '-',
        `${entrega.litros_entregados} L`,
        saldoNum > 0 ? `${saldoNum} L (Parcial)` : '0 L (Completa)',
        ''
      ];

      cells.forEach((cell, i) => {
        if (i < cells.length - 1) {
          doc.text(cell, curX + 2, rowY + 6, { width: colWidths[i] - 4, align: 'center' });
        } else if (entrega.firma_base64 && entrega.firma_base64.startsWith('data:image')) {
          const base64Data = entrega.firma_base64.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          try {
            doc.image(imgBuffer, curX + 3, rowY + 2, { width: colWidths[i] - 10, height: rowH - 4 });
          } catch (_) {
            doc.text('Firma registrada', curX + 2, rowY + 6, { width: colWidths[i] - 4, align: 'center' });
          }
        } else {
          doc.fontSize(7.5).fillColor('#64748b')
             .text('Foto Acreditada', curX + 2, rowY + 6, { width: colWidths[i] - 4, align: 'center' })
             .fontSize(8).fillColor('#000000');
        }
        curX += colWidths[i];
      });

      doc.rect(startX, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).stroke('#CBD5E1');
      doc.y = rowY + rowH;
    });

    doc.moveDown(1.5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(
      `Total de familias atendidas: ${entregas.length}  |  Total volumen entregado: ${entregas.reduce((acc, e) => acc + Number(e.litros_entregados || 0), 0).toLocaleString()} Litros`,
      { align: 'right' }
    );

    const finalY = doc.y + 15;
    if (finalY < 490) {
      doc.fontSize(8).font('Helvetica');
      doc.moveTo(100, finalY + 30).lineTo(320, finalY + 30).strokeColor('#64748b').stroke();
      doc.text('Firma del Conductor de Cisterna', 100, finalY + 34, { width: 220, align: 'center' });
      doc.fontSize(7).text(`Conductor: ${programacion.conductor_nombre || 'EPS Moyobamba'}`, 100, finalY + 44, { width: 220, align: 'center' });

      doc.fontSize(8);
      doc.moveTo(520, finalY + 30).lineTo(740, finalY + 30).strokeColor('#64748b').stroke();
      doc.text('Firma del Supervisor de Campo / EPS', 520, finalY + 34, { width: 220, align: 'center' });
      doc.fontSize(7).text('Convenio N° 023-2026/VIVIENDA/VMCS/PNSU/DE', 520, finalY + 44, { width: 220, align: 'center' });
    }

    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font('Helvetica').fillColor('#94a3b8');
      doc.text(`EPS MOYOBAMBA S.A. • Anexo N° 2 (Hoja de Ruta de Campo) • Página ${i + 1} de ${totalPages}`, 40, 560, { align: 'center', width: 760 });
    }

    doc.end();
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
};

/**
 * Exportar Hoja de Ruta ANEXO 2 en formato Excel (.xlsx)
 */
export const exportarProgramacionExcel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const progResult = await query(`
      SELECT 
        p.*,
        c.placa as cisterna_placa,
        c.marca_modelo as cisterna_marca,
        c.capacidad_m3 as cisterna_capacidad_m3,
        CONCAT(pers.nombres, ' ', pers.apellidos) as conductor_nombre,
        pers.licencia_conducir as conductor_licencia
      FROM programaciones p
      LEFT JOIN cisternas c ON p.cisterna_id = c.id
      LEFT JOIN personal_operativo pers ON p.conductor_id = pers.id
      WHERE p.id = $1
    `, [id]);

    if (progResult.rows.length === 0) {
      return res.status(404).json({ message: 'Programacion no encontrada' });
    }
    const prog = progResult.rows[0];

    const entregasResult = await query(`
      SELECT e.*, b.nombres_apellidos, b.dni, b.direccion, b.num_miembros, b.telefono, b.sector_aahh 
      FROM entregas_agua e
      JOIN beneficiarios b ON e.beneficiario_id = b.id
      WHERE e.programacion_id = $1
      ORDER BY b.nombres_apellidos ASC
    `, [id]);
    const entregas = entregasResult.rows;

    const wb = xlsx.utils.book_new();

    const rows: any[][] = [
      ['HOJA DE RUTA Y PLANILLA DE ENTREGA DE AGUA — ANEXO 2 (PNSU / EPS MOYOBAMBA)'],
      [`PROGRAMACIÓN N°: #${id} • FECHA: ${new Date(prog.fecha).toLocaleDateString('es-PE')}`],
      [`ZONA / SECTOR: ${prog.zona} • CISTERNA: ${prog.cisterna_placa || '-'} (${prog.cisterna_capacidad_m3 || 15} m³)`],
      [`CONDUCTOR: ${prog.conductor_nombre || 'Asignado'} (Lic: ${prog.conductor_licencia || '-'}) • VIAJES PROGRAMADOS: ${prog.viajes_estimados || 1}`],
      [],
      ['N°', 'JEFE DE FAMILIA', 'DNI', 'SECTOR / AA.HH.', 'DIRECCIÓN', 'HABITANTES', 'VOLUMEN (L)', 'SALDO (L)', 'ESTADO', 'HORA ENTREGA', 'VERIFICACIÓN']
    ];

    let totalLitros = 0;
    entregas.forEach((e: any, idx: number) => {
      const litros = Number(e.litros_entregados || 0);
      totalLitros += litros;
      const saldo = Number(e.saldo_pendiente || 0);
      rows.push([
        idx + 1,
        e.nombres_apellidos,
        e.dni,
        e.sector_aahh || prog.zona,
        e.direccion || '-',
        Number(e.num_miembros || 1),
        litros,
        saldo,
        saldo > 0 ? 'PARCIAL' : 'COMPLETO',
        e.fecha_hora ? new Date(e.fecha_hora).toLocaleTimeString('es-PE') : '-',
        e.foto_url ? 'FOTO Y GPS' : (e.firma_base64 ? 'FIRMA DIGITAL' : 'REGISTRADO')
      ]);
    });

    rows.push([]);
    rows.push(['TOTALES', `${entregas.length} Familias Atendidas`, '', '', '', '', totalLitros, '', '', '', '']);

    const ws = xlsx.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 14 },
      { wch: 25 },
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
      { wch: 18 }
    ];
    xlsx.utils.book_append_sheet(wb, ws, `HojaRuta_Prog_${id}`);

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Hoja_Ruta_Anexo2_Prog_${id}.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando Excel de programación:', error);
    res.status(500).json({ message: 'Error exportando Excel', error: error.message });
  }
};

export const updateEstadoProgramacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ message: 'El campo estado es requerido.' });
    }

    const result = await query(
      `UPDATE programaciones SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada.' });
    }

    res.json({ message: `Estado actualizado a ${estado}`, programacion: result.rows[0] });
  } catch (error: any) {
    console.error('Error actualizando estado de programacion:', error);
    res.status(500).json({ message: 'Error al actualizar estado', error: error.message });
  }
};

/**
 * Obtener avances y desglose de calendario (Lunes a Domingo, semanas y meses)
 */
export const getAvancesCalendario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const anio = parseInt(req.query.anio as string, 10) || 2026;
    const mes = parseInt(req.query.mes as string, 10) || (new Date().getMonth() + 1);

    const progRes = await query('SELECT * FROM programaciones WHERE id = $1', [id]);
    if (progRes.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada' });
    }
    const prog = progRes.rows[0];

    // Entregas por día de la semana (1 = Lunes ... 7 = Domingo)
    const diasSemanaRes = await query(`
      SELECT 
        EXTRACT(ISODOW FROM fecha_hora)::int as dia_num,
        COUNT(id)::int as total_entregas,
        COALESCE(SUM(litros_entregados), 0)::numeric as total_litros,
        COUNT(DISTINCT beneficiario_id)::int as familias_atendidas
      FROM entregas_agua
      WHERE programacion_id = $1
        AND EXTRACT(YEAR FROM fecha_hora) = $2
        AND EXTRACT(MONTH FROM fecha_hora) = $3
      GROUP BY EXTRACT(ISODOW FROM fecha_hora)
      ORDER BY dia_num ASC
    `, [id, anio, mes]);

    // Entregas por semanas del mes
    const semanasRes = await query(`
      SELECT 
        EXTRACT(WEEK FROM fecha_hora)::int as semana_anio,
        COUNT(id)::int as total_entregas,
        COALESCE(SUM(litros_entregados), 0)::numeric as total_litros,
        COUNT(DISTINCT beneficiario_id)::int as familias_atendidas,
        MIN(fecha_hora)::date as fecha_inicio_semana,
        MAX(fecha_hora)::date as fecha_fin_semana
      FROM entregas_agua
      WHERE programacion_id = $1
        AND EXTRACT(YEAR FROM fecha_hora) = $2
        AND EXTRACT(MONTH FROM fecha_hora) = $3
      GROUP BY EXTRACT(WEEK FROM fecha_hora)
      ORDER BY semana_anio ASC
    `, [id, anio, mes]);

    // Entregas por meses del año
    const mesesAnioRes = await query(`
      SELECT 
        EXTRACT(MONTH FROM fecha_hora)::int as mes_num,
        COUNT(id)::int as total_entregas,
        COALESCE(SUM(litros_entregados), 0)::numeric as total_litros,
        COUNT(DISTINCT beneficiario_id)::int as familias_atendidas
      FROM entregas_agua
      WHERE programacion_id = $1
        AND EXTRACT(YEAR FROM fecha_hora) = $2
      GROUP BY EXTRACT(MONTH FROM fecha_hora)
      ORDER BY mes_num ASC
    `, [id, anio]);

    // Resumen acumulado
    const totalProgRes = await query(`
      SELECT 
        COUNT(id)::int as total_entregas,
        COALESCE(SUM(litros_entregados), 0)::numeric as total_litros,
        COUNT(DISTINCT beneficiario_id)::int as familias_atendidas
      FROM entregas_agua
      WHERE programacion_id = $1
    `, [id]);

    const totalLitros = parseFloat(totalProgRes.rows[0]?.total_litros || '0');
    const metaLitros = parseFloat(prog.litros_programados || '15000');
    const pctAvance = metaLitros > 0 ? Math.min(100, Math.round((totalLitros / metaLitros) * 100)) : 0;

    res.json({
      programacion: prog,
      mesSeleccionado: mes,
      anioSeleccionado: anio,
      diasSemana: diasSemanaRes.rows,
      semanasMes: semanasRes.rows,
      mesesAnio: mesesAnioRes.rows,
      resumenAcumulado: {
        totalLitros,
        metaLitros,
        pctAvance,
        totalEntregas: parseInt(totalProgRes.rows[0]?.total_entregas || '0', 10),
        familiasAtendidas: parseInt(totalProgRes.rows[0]?.familias_atendidas || '0', 10)
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo avances de calendario:', error);
    res.status(500).json({ message: 'Error interno al obtener avances', error: error.message });
  }
};

/**
 * Listar beneficiarios correspondientes al sector programado
 */
export const getBeneficiariosProgramados = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const progRes = await query('SELECT * FROM programaciones WHERE id = $1', [id]);
    if (progRes.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada' });
    }
    const prog = progRes.rows[0];

    let sectores: string[] = [];
    if (prog.sectores_seleccionados) {
      try {
        const parsed = JSON.parse(prog.sectores_seleccionados);
        if (Array.isArray(parsed)) sectores = parsed;
      } catch {
        sectores = prog.sectores_seleccionados.split(',').map((s: string) => s.trim());
      }
    }
    if (sectores.length === 0 && prog.zona) {
      sectores = prog.zona.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    let queryStr = `
      SELECT 
        b.id,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.sector_aahh, b.sector, 'Moyobamba') as sector,
        COALESCE(b.calle_direccion, b.direccion, '-') as direccion,
        COALESCE(b.num_miembros, 1) as num_miembros,
        b.telefono,
        b.email,
        (SELECT COALESCE(SUM(litros_entregados), 0) 
         FROM entregas_agua e 
         WHERE e.beneficiario_id = b.id 
           AND e.programacion_id = $1 
           AND e.fecha_hora >= date_trunc('week', CURRENT_DATE)
        ) as litros_entregados_semana,
        (SELECT COUNT(*) 
         FROM entregas_agua e 
         WHERE e.beneficiario_id = b.id 
           AND e.programacion_id = $1 
           AND e.fecha_hora >= date_trunc('week', CURRENT_DATE)
        ) as entregas_esta_semana,
        (SELECT v.codigo_unico 
         FROM vales_entrega v 
         WHERE v.beneficiario_id = b.id AND v.programacion_id = $1 
         ORDER BY v.id DESC LIMIT 1
        ) as vale_codigo
      FROM beneficiarios b
    `;

    const params: any[] = [id];

    if (sectores.length > 0) {
      params.push(sectores.map(s => s.toUpperCase().trim()));
      queryStr += ` WHERE UPPER(TRIM(COALESCE(b.sector_aahh, b.sector, ''))) = ANY($2::text[])`;
    }

    queryStr += ` ORDER BY b.nombres_apellidos ASC`;

    const result = await query(queryStr, params);
    const config = await getConfiguracion();
    const dotSemanal = config.dotacion_semanal_por_habitante || 350;

    const beneficiariosConEstado = result.rows.map((row: any) => {
      const miembros = Number(row.num_miembros || 1);
      const cuotaSemanal = miembros * dotSemanal;
      const litrosRecibidos = parseFloat(row.litros_entregados_semana || '0');
      const saldoSemanal = Math.max(0, cuotaSemanal - litrosRecibidos);
      const entregasSemana = parseInt(row.entregas_esta_semana || '0', 10);

      return {
        ...row,
        cuota_semanal: cuotaSemanal,
        saldo_semanal: saldoSemanal,
        ha_recibido_esta_semana: entregasSemana > 0,
        estado_semanal: saldoSemanal <= 0 ? 'COMPLETA' : (litrosRecibidos > 0 ? 'PARCIAL' : 'PENDIENTE')
      };
    });

    res.json({
      success: true,
      programacion_id: prog.id,
      zona: prog.zona,
      sectores,
      total: beneficiariosConEstado.length,
      data: beneficiariosConEstado,
      beneficiarios: beneficiariosConEstado
    });
  } catch (error: any) {
    console.error('Error obteniendo beneficiarios programados:', error);
    res.status(500).json({ message: 'Error interno al obtener beneficiarios', error: error.message });
  }
};

