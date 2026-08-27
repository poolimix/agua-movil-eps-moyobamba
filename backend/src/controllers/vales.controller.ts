import { Request, Response } from 'express';
import { query } from '../db';
import { DOTACION_POR_HABITANTE } from '../config/constants';
import { MultichannelNotificationService } from '../services/MultichannelNotificationService';

const BATCH_SIZE = 15; // Controlled batch size for rate-limit protection

export const buscarVale = async (req: Request, res: Response) => {
  try {
    const rawQuery = String(req.params.query || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ message: 'Parámetro de búsqueda requerido' });
    }

    // Parse potential structured QR content like "VALE-20260826-001|47891234|200L"
    let codigo = rawQuery;
    let dni = rawQuery;

    if (rawQuery.includes('|')) {
      const parts = rawQuery.split('|');
      codigo = parts[0].trim();
      if (parts.length > 1) dni = parts[1].trim();
    }

    const result = await query(`
      SELECT 
        v.id as vale_id,
        v.codigo_unico,
        v.litros_sugeridos,
        v.estado as estado_vale,
        v.programacion_id,
        b.id,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.distrito, 'Moyobamba') as distrito,
        COALESCE(b.sector_aahh, b.sector, '') as sector_aahh,
        COALESCE(b.sector_aahh, b.sector, '') as sector,
        COALESCE(b.num_vivienda, '') as num_vivienda,
        COALESCE(b.num_miembros, 1) as num_miembros,
        COALESCE(b.mz, '') as mz,
        COALESCE(b.lt, '') as lt,
        COALESCE(b.calle_direccion, b.direccion, '') as calle_direccion,
        COALESCE(b.calle_direccion, b.direccion, '') as direccion,
        COALESCE(b.telefono, '') as telefono
      FROM beneficiarios b
      LEFT JOIN vales_entrega v ON (v.beneficiario_id = b.id AND (v.codigo_unico = $1 OR v.codigo_unico ILIKE $1))
      WHERE v.codigo_unico = $1 
         OR v.codigo_unico ILIKE $1
         OR b.dni = $2
         OR b.dni = $1
      ORDER BY v.id DESC NULLS LAST
      LIMIT 1
    `, [codigo, dni]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `No se encontró vale ni beneficiario para: ${rawQuery}` });
    }

    const row = result.rows[0];
    res.json({
      ...row,
      litros_sugeridos: row.litros_sugeridos ? parseFloat(row.litros_sugeridos) : ((row.num_miembros || 1) * DOTACION_POR_HABITANTE),
      vale_codigo: row.codigo_unico || null,
    });
  } catch (error: any) {
    console.error('Error buscando vale/beneficiario:', error);
    res.status(500).json({ message: 'Error interno al buscar vale', error: error.message });
  }
};

export const despacharValesProgramacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Get Programacion
    const progRes = await query('SELECT * FROM programaciones WHERE id = $1', [id]);
    if (progRes.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada' });
    }
    const programacion = progRes.rows[0];

    // 2. Fetch beneficiaries (matching sector/zone or all available)
    const benefRes = await query(`
      SELECT 
        id, dni, nombres_apellidos, distrito, sector_aahh, sector,
        num_vivienda, COALESCE(num_miembros, 1) as num_miembros,
        calle_direccion, direccion, telefono, email
      FROM beneficiarios
      ORDER BY id ASC
    `);

    let beneficiarios = benefRes.rows;

    if (beneficiarios.length === 0) {
      return res.status(400).json({ message: 'No hay beneficiarios en el padrón para despachar vales.' });
    }

    const fechaFormateada = new Date(programacion.fecha).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const dateSlug = new Date(programacion.fecha).toISOString().slice(0, 10).replace(/-/g, '');

    // 3. Generate or retrieve Vouchers (vales_entrega)
    const valesToProcess: any[] = [];

    for (const b of beneficiarios) {
      const litros = (b.num_miembros || 1) * DOTACION_POR_HABITANTE;
      const codigoUnico = `VALE-${dateSlug}-${String(b.id).padStart(3, '0')}`;
      const qrData = `${codigoUnico}|${b.dni}|${litros}L|${programacion.id}`;

      // Check if already exists for this programming and beneficiary
      const existing = await query(
        'SELECT * FROM vales_entrega WHERE programacion_id = $1 AND beneficiario_id = $2',
        [programacion.id, b.id]
      );

      let vale;
      if (existing.rows.length > 0) {
        vale = existing.rows[0];
      } else {
        const ins = await query(
          `INSERT INTO vales_entrega (
            programacion_id, beneficiario_id, codigo_unico, litros_sugeridos, qr_data, estado
          )
          VALUES ($1, $2, $3, $4, $5, 'EMITIDO')
          RETURNING *`,
          [programacion.id, b.id, codigoUnico, litros, qrData]
        );
        vale = ins.rows[0];
      }

      valesToProcess.push({
        vale,
        beneficiario: b,
        litros,
        codigoUnico: vale.codigo_unico,
        qrData: vale.qr_data,
      });
    }

    // 4. Batch Dispatch in chunks of 15
    let waSuccessCount = 0;
    let smsSuccessCount = 0;
    let emailSuccessCount = 0;

    for (let i = 0; i < valesToProcess.length; i += BATCH_SIZE) {
      const chunk = valesToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          const payload = {
            beneficiario: {
              nombres_apellidos: item.beneficiario.nombres_apellidos,
              dni: item.beneficiario.dni,
              telefono: item.beneficiario.telefono,
              email: item.beneficiario.email,
              sector: item.beneficiario.sector_aahh || item.beneficiario.sector,
            },
            codigo_unico: item.codigoUnico,
            fecha_programada: fechaFormateada,
            litros: item.litros,
            qr_data: item.qrData,
          };

          const dispatchResult = await MultichannelNotificationService.dispatchAll(payload);

          const isWaOk = dispatchResult.whatsapp.success;
          const isSmsOk = dispatchResult.sms.success;
          const isEmailOk = dispatchResult.email.success;

          if (isWaOk) waSuccessCount++;
          if (isSmsOk) smsSuccessCount++;
          if (isEmailOk) emailSuccessCount++;

          const erroresJson = {
            whatsapp: dispatchResult.whatsapp.error || null,
            sms: dispatchResult.sms.error || null,
            email: dispatchResult.email.error || null,
          };

          await query(
            `UPDATE vales_entrega 
             SET whatsapp_enviado = $1,
                 sms_enviado = $2,
                 correo_enviado = $3,
                 fecha_despacho = CURRENT_TIMESTAMP,
                 errores_notificacion = $4
             WHERE id = $5`,
            [isWaOk, isSmsOk, isEmailOk, JSON.stringify(erroresJson), item.vale.id]
          );
        })
      );
    }

    res.status(200).json({
      message: `Despacho multicanal completado para ${valesToProcess.length} beneficiarios.`,
      totalBeneficiarios: valesToProcess.length,
      resumen: {
        whatsappEnviados: waSuccessCount,
        smsEnviados: smsSuccessCount,
        correoEnviados: emailSuccessCount,
      },
    });
  } catch (error: any) {
    console.error('Error despachando vales:', error);
    res.status(500).json({ message: 'Error interno en el despacho masivo de vales', error: error.message });
  }
};

export const getValesProgramacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        v.id,
        v.programacion_id,
        v.beneficiario_id,
        v.codigo_unico,
        v.litros_sugeridos,
        v.qr_data,
        v.whatsapp_enviado,
        v.sms_enviado,
        v.correo_enviado,
        v.fecha_despacho,
        v.errores_notificacion,
        v.estado,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.sector_aahh, b.sector, '') as sector_aahh,
        COALESCE(b.calle_direccion, b.direccion, '') as direccion,
        b.telefono,
        b.email
      FROM vales_entrega v
      INNER JOIN beneficiarios b ON v.beneficiario_id = b.id
      WHERE v.programacion_id = $1
      ORDER BY v.id ASC
    `, [id]);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching vales:', error);
    res.status(500).json({ message: 'Error al consultar vales de la programación', error: error.message });
  }
};

export const reintentarValesFallidos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const progRes = await query('SELECT * FROM programaciones WHERE id = $1', [id]);
    if (progRes.rows.length === 0) {
      return res.status(404).json({ message: 'Programación no encontrada' });
    }
    const programacion = progRes.rows[0];

    const valesFallidos = await query(`
      SELECT 
        v.*,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.sector_aahh, b.sector, '') as sector_aahh,
        b.telefono,
        b.email
      FROM vales_entrega v
      INNER JOIN beneficiarios b ON v.beneficiario_id = b.id
      WHERE v.programacion_id = $1
        AND (v.whatsapp_enviado = FALSE OR v.sms_enviado = FALSE OR v.correo_enviado = FALSE)
    `, [id]);

    if (valesFallidos.rows.length === 0) {
      return res.status(200).json({
        message: 'No existen vales con canales pendientes o fallidos en esta programación.',
        reintentadosCount: 0,
      });
    }

    const fechaFormateada = new Date(programacion.fecha).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    let reintentados = 0;

    for (let i = 0; i < valesFallidos.rows.length; i += BATCH_SIZE) {
      const chunk = valesFallidos.rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        chunk.map(async (v) => {
          const payload = {
            beneficiario: {
              nombres_apellidos: v.nombres_apellidos,
              dni: v.dni,
              telefono: v.telefono,
              email: v.email,
              sector: v.sector_aahh,
            },
            codigo_unico: v.codigo_unico,
            fecha_programada: fechaFormateada,
            litros: v.litros_sugeridos,
            qr_data: v.qr_data,
          };

          const dispatchResult = await MultichannelNotificationService.dispatchAll(payload, {
            channels: {
              whatsapp: !v.whatsapp_enviado,
              sms: !v.sms_enviado,
              email: !v.correo_enviado,
            },
          });

          const newWa = v.whatsapp_enviado || dispatchResult.whatsapp.success;
          const newSms = v.sms_enviado || dispatchResult.sms.success;
          const newEmail = v.correo_enviado || dispatchResult.email.success;

          const updatedErrores = {
            whatsapp: newWa ? null : (dispatchResult.whatsapp.error || v.errores_notificacion?.whatsapp),
            sms: newSms ? null : (dispatchResult.sms.error || v.errores_notificacion?.sms),
            email: newEmail ? null : (dispatchResult.email.error || v.errores_notificacion?.email),
          };

          await query(`
            UPDATE vales_entrega
            SET whatsapp_enviado = $1,
                sms_enviado = $2,
                correo_enviado = $3,
                fecha_despacho = CURRENT_TIMESTAMP,
                errores_notificacion = $4
            WHERE id = $5
          `, [newWa, newSms, newEmail, JSON.stringify(updatedErrores), v.id]);

          reintentados++;
        })
      );
    }

    res.status(200).json({
      message: `Reintento completado para ${reintentados} vales fallidos.`,
      reintentadosCount: reintentados,
    });
  } catch (error: any) {
    console.error('Error reintentando vales:', error);
    res.status(500).json({ message: 'Error al reintentar envío de vales', error: error.message });
  }
};
