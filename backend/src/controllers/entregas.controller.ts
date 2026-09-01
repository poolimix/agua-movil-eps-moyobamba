import { Request, Response } from 'express';
import { query } from '../db';
import PDFDocument from 'pdfkit';

export const getAllEntregas = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        e.*, 
        b.nombres_apellidos, 
        b.dni, 
        COALESCE(b.calle_direccion, b.direccion, '') as direccion, 
        COALESCE(b.sector_aahh, b.sector, '') as sector, 
        b.num_miembros, 
        b.telefono,
        p.zona, 
        p.fecha as fecha_programacion
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
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
        litros_entregados,
        firma_base64,
        foto_evidencia,
        latitud,
        longitud,
        fecha_hora
      } = entrega;

      const insertQuery = `
        INSERT INTO entregas_agua (
          beneficiario_id, programacion_id, litros_entregados, 
          firma_base64, foto_evidencia, latitud, longitud, fecha_hora, sincronizado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
      `;

      await query(insertQuery, [
        beneficiario_id,
        programacion_id,
        litros_entregados,
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
        COALESCE(b.calle_direccion, b.direccion, 'No especificada') as direccion, 
        COALESCE(b.sector_aahh, b.sector, 'Moyobamba') as sector, 
        COALESCE(b.num_miembros, 1) as num_miembros, 
        b.telefono,
        p.zona, 
        p.fecha as fecha_programacion
      FROM entregas_agua e
      LEFT JOIN beneficiarios b ON e.beneficiario_id = b.id
      LEFT JOIN programaciones p ON e.programacion_id = p.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entrega no encontrada' });
    }

    const entrega = result.rows[0];
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Acta_Entrega_${entrega.dni || entrega.id}.pdf"`);

    doc.pipe(res);

    // Header Institutional
    doc.fontSize(14).font('Helvetica-Bold').text('EPS MOYOBAMBA S.A.', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('OFICINA DE DISTRIBUCIÓN Y RECOLECCIÓN', { align: 'center' });
    doc.fontSize(9).text('PROGRAMA NACIONAL DE SANEAMIENTO URBANO (PNSU)', { align: 'center' });
    doc.text('CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE - R.M. N° 084-2026-VIVIENDA', { align: 'center' });
    doc.moveDown(1);

    // Title
    doc.rect(40, doc.y, 515, 24).fill('#0284c7');
    doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text(
      `ACTA DE CONFORMIDAD DE ENTREGA DE AGUA POTABLE N° ACT-${String(entrega.id).padStart(6, '0')}`,
      45, doc.y - 18, { align: 'center' }
    );
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    // Beneficiary details box
    const startY = doc.y;
    doc.rect(40, startY, 515, 140).stroke('#cbd5e1');

    doc.fontSize(10).font('Helvetica-Bold').text('I. DATOS DEL BENEFICIARIO Y PREDIO', 50, startY + 10);
    doc.font('Helvetica').fontSize(9);

    doc.text(`Beneficiario / Jefe de Hogar: `, 50, startY + 30, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.nombres_apellidos || 'No registrado'}`);
    
    doc.font('Helvetica').text(`Documento de Identidad (DNI): `, 50, startY + 50, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.dni || 'Sin DNI'}`);

    doc.font('Helvetica').text(`Sector / AA.HH.: `, 50, startY + 70, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.sector || 'Moyobamba'}`);

    doc.font('Helvetica').text(`Dirección / Predio: `, 50, startY + 90, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.direccion || 'S/N'}`);

    doc.font('Helvetica').text(`N° de Habitantes en el Hogar: `, 50, startY + 110, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.num_miembros} personas`);

    doc.moveDown(3);

    // Delivery details box
    const deliveryY = doc.y + 10;
    doc.rect(40, deliveryY, 515, 110).stroke('#cbd5e1');
    doc.fontSize(10).font('Helvetica-Bold').text('II. DETALLE DEL ABASTECIMIENTO', 50, deliveryY + 10);
    doc.font('Helvetica').fontSize(9);

    const fechaFormateada = new Date(entrega.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima' });

    doc.text(`Fecha y Hora de Entrega: `, 50, deliveryY + 30, { continued: true })
       .font('Helvetica-Bold').text(fechaFormateada);

    doc.font('Helvetica').text(`Volumen Entregado: `, 50, deliveryY + 50, { continued: true })
       .font('Helvetica-Bold').text(`${entrega.litros_entregados} LITROS (${(Number(entrega.litros_entregados) / 1000).toFixed(2)} m³)`);

    doc.font('Helvetica').text(`Geolocalización GPS: `, 50, deliveryY + 70, { continued: true })
       .font('Helvetica-Bold').text(`Lat: ${entrega.latitud || 'N/A'}, Long: ${entrega.longitud || 'N/A'}`);

    doc.font('Helvetica').text(`Modalidad: `, 50, deliveryY + 90, { continued: true })
       .font('Helvetica-Bold').text(`Abastecimiento Gratuito mediante Camión Cisterna (Convenio PNSU)`);

    doc.moveDown(3);

    // Signatures section
    const signY = doc.y + 20;
    doc.fontSize(10).font('Helvetica-Bold').text('III. CONFORMIDAD Y FEHACIENCIA', 40, signY);

    // Render signature if exists
    if (entrega.firma_base64 && entrega.firma_base64.startsWith('data:image')) {
      try {
        const base64Data = entrega.firma_base64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, 70, signY + 25, { width: 140, height: 60 });
      } catch (err) {
        console.error('Error dibujando firma en PDF:', err);
      }
    }

    // Lines for signatures
    doc.lineCap('butt').moveTo(50, signY + 95).lineTo(230, signY + 95).stroke('#475569');
    doc.fontSize(8).font('Helvetica-Bold').text('FIRMA / HUELLA DEL BENEFICIARIO', 50, signY + 100, { width: 180, align: 'center' });
    doc.font('Helvetica').text(`DNI: ${entrega.dni || ''}`, 50, signY + 112, { width: 180, align: 'center' });

    doc.moveTo(320, signY + 95).lineTo(500, signY + 95).stroke('#475569');
    doc.fontSize(8).font('Helvetica-Bold').text('OPERADOR DE CISTERNA / SUPERVISOR', 320, signY + 100, { width: 180, align: 'center' });
    doc.font('Helvetica').text('EPS MOYOBAMBA S.A.', 320, signY + 112, { width: 180, align: 'center' });

    // Footer
    doc.fontSize(7).fillColor('#64748b').text(
      `Documento emitido electrónicamente por el Sistema de Acreditación Fehaciente EPS Moyobamba S.A. | ID Entrega: ${entrega.id} | Hash Verificación: ${Buffer.from(String(entrega.id + entrega.fecha_hora)).toString('hex').slice(0, 16).toUpperCase()}`,
      40, 780, { align: 'center', width: 515 }
    );

    doc.end();
  } catch (error: any) {
    console.error('Error generando acta PDF:', error);
    res.status(500).json({ message: 'Error al generar acta en PDF', error: error.message });
  }
};
