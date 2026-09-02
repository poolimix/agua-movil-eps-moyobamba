import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { query } from '../db';

export const getAllProgramaciones = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        p.*,
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
    const {
      fecha,
      zona,
      estado = 'Activa',
      cisterna_id,
      conductor_id,
      ayudante_id,
      litros_programados,
      viajes_estimados,
      dias_semana = 'Lunes, Miércoles, Viernes',
    } = req.body;

    let viajes = parseInt(viajes_estimados, 10);

    // If trips not explicitly provided, calculate based on cisterna capacity and sector demand
    if (!viajes || isNaN(viajes) || viajes <= 0) {
      if (cisterna_id && litros_programados) {
        const cisternaRes = await query('SELECT capacidad_litros FROM cisternas WHERE id = $1', [cisterna_id]);
        const cap = cisternaRes.rows[0]?.capacidad_litros || 15000;
        viajes = Math.max(1, Math.ceil(parseInt(litros_programados, 10) / cap));
      } else {
        viajes = 1;
      }
    }

    const insertQuery = `
      INSERT INTO programaciones (fecha, zona, estado, cisterna_id, conductor_id, ayudante_id, litros_programados, viajes_estimados, dias_semana)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await query(insertQuery, [
      fecha || new Date(),
      zona,
      estado,
      cisterna_id ? parseInt(cisterna_id, 10) : null,
      conductor_id ? parseInt(conductor_id, 10) : null,
      ayudante_id ? parseInt(ayudante_id, 10) : null,
      parseInt(litros_programados, 10) || 0,
      viajes,
      dias_semana,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating programacion:', error);
    res.status(500).json({ message: 'Error creating programacion', error: error.message });
  }
};

export const updateProgramacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      fecha,
      zona,
      estado,
      cisterna_id,
      conductor_id,
      ayudante_id,
      litros_programados,
      viajes_estimados,
      dias_semana,
    } = req.body;

    let viajes = parseInt(viajes_estimados, 10);

    if (!viajes || isNaN(viajes) || viajes <= 0) {
      if (cisterna_id && litros_programados) {
        const cisternaRes = await query('SELECT capacidad_litros FROM cisternas WHERE id = $1', [cisterna_id]);
        const cap = cisternaRes.rows[0]?.capacidad_litros || 15000;
        viajes = Math.max(1, Math.ceil(parseInt(litros_programados, 10) / cap));
      } else {
        viajes = 1;
      }
    }

    const sql = `
      UPDATE programaciones
      SET fecha = $1,
          zona = $2,
          estado = $3,
          cisterna_id = $4,
          conductor_id = $5,
          ayudante_id = $6,
          litros_programados = $7,
          viajes_estimados = $8,
          dias_semana = $9
      WHERE id = $10
      RETURNING *;
    `;

    const result = await query(sql, [
      fecha,
      zona,
      estado,
      cisterna_id ? parseInt(cisterna_id, 10) : null,
      conductor_id ? parseInt(conductor_id, 10) : null,
      ayudante_id ? parseInt(ayudante_id, 10) : null,
      parseInt(litros_programados, 10) || 0,
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
    doc.fontSize(9).font('Helvetica')
      .text(`EPS Moyobamba  |  Zona: ${programacion.zona}  |  Fecha: ${new Date(programacion.fecha).toLocaleDateString('es-PE')}  |  Cisterna: ${programacion.cisterna_placa || 'EGA-902'} (${programacion.cisterna_capacidad_m3 || 15} m³)  |  Conductor: ${programacion.conductor_nombre || 'Asignado'}  |  Viajes: ${programacion.viajes_estimados || 1}`, { align: 'center' });
    doc.moveDown(0.8);

    const colWidths = [30, 180, 70, 160, 70, 80, 200];
    const headers  = ['N°', 'Nombres y Apellidos', 'DNI', 'Dirección', 'Habitantes', 'Litros', 'Firma'];
    const startX   = 40;
    let   curX     = startX;
    const rowH     = 22;

    doc.rect(startX, doc.y, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#1E40AF');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9);

    headers.forEach((h, i) => {
      doc.text(h, curX + 3, doc.y - rowH + 5, { width: colWidths[i] - 6, align: 'center' });
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

      const cells = [
        (index + 1).toString(),
        entrega.nombres_apellidos,
        entrega.dni,
        entrega.direccion || '-',
        entrega.num_miembros?.toString() || '-',
        `${entrega.litros_entregados} Lts`,
        ''
      ];

      cells.forEach((cell, i) => {
        if (i < cells.length - 1) {
          doc.text(cell, curX + 3, rowY + 5, { width: colWidths[i] - 6, align: 'center' });
        } else if (entrega.firma_base64 && entrega.firma_base64.startsWith('data:image')) {
          const base64Data = entrega.firma_base64.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          try {
            doc.image(imgBuffer, curX + 3, rowY + 2, { width: colWidths[i] - 10, height: rowH - 4 });
          } catch (_) {
            doc.text('Firma registrada', curX + 3, rowY + 5, { width: colWidths[i] - 6, align: 'center' });
          }
        } else {
          doc.text('Sin firma', curX + 3, rowY + 5, { width: colWidths[i] - 6, align: 'center' });
        }
        curX += colWidths[i];
      });

      doc.rect(startX, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).stroke('#CBD5E1');
      doc.y = rowY + rowH;
    });

    doc.moveDown(2);
    doc.fontSize(9).text(`Total de beneficiarios atendidos: ${entregas.length}`, { align: 'right' });

    doc.end();
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
};
