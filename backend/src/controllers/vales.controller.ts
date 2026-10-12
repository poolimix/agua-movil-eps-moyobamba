import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import { query } from '../db';
import { DOTACION_POR_HABITANTE, DIAS_ENTREGA_SEMANAL, DOTACION_SEMANAL_POR_HABITANTE } from '../config/constants';
import { MultichannelNotificationService } from '../services/MultichannelNotificationService';
import { getConfiguracion } from '../services/configuracion.service';

const BATCH_SIZE = 15; // Controlled batch size for rate-limit protection

export const buscarVale = async (req: Request, res: Response) => {
  try {
    const rawQuery = String(req.params.query || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ message: 'Parámetro de búsqueda requerido' });
    }

    // Parse potential structured QR content like "VALE-20260826-001|47891234|1750L"
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

    const config = await getConfiguracion();
    const row = result.rows[0];
    const numMiembros = row.num_miembros || 1;
    const dotacionDiaria = numMiembros * config.dotacion_diaria_litros;
    const dotacionSemanal = numMiembros * config.dotacion_semanal_por_habitante;

    res.json({
      ...row,
      litros_sugeridos: row.litros_sugeridos ? parseFloat(row.litros_sugeridos) : dotacionSemanal,
      dotacion_diaria_litros: dotacionDiaria,
      dotacion_semanal_litros: dotacionSemanal,
      dias_abastecimiento: config.dias_entrega_semanal,
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

    // 2. Fetch beneficiaries (matching sector/zone if specific, or all padrón)
    let sectoresProg: string[] = [];
    if (programacion.sectores_seleccionados) {
      if (Array.isArray(programacion.sectores_seleccionados)) {
        sectoresProg = programacion.sectores_seleccionados;
      } else if (typeof programacion.sectores_seleccionados === 'string') {
        try {
          const parsed = JSON.parse(programacion.sectores_seleccionados);
          if (Array.isArray(parsed)) sectoresProg = parsed;
        } catch {
          sectoresProg = programacion.sectores_seleccionados.split(',').map((s: string) => s.trim());
        }
      }
    }
    if (sectoresProg.length === 0 && programacion.zona) {
      sectoresProg = programacion.zona.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    let benefRes;
    if (sectoresProg.length > 0) {
      benefRes = await query(`
        SELECT 
          id, dni, nombres_apellidos, distrito, sector_aahh, sector,
          num_vivienda, COALESCE(num_miembros, 1) as num_miembros,
          calle_direccion, direccion, telefono, email
        FROM beneficiarios
        WHERE UPPER(TRIM(COALESCE(sector_aahh, sector, ''))) = ANY($1::text[])
        ORDER BY id ASC
      `, [sectoresProg.map(s => s.toUpperCase().trim())]);
    }

    // Si no se encontró por sector específico, tomar todo el padrón de beneficiarios
    if (!benefRes || benefRes.rows.length === 0) {
      benefRes = await query(`
        SELECT 
          id, dni, nombres_apellidos, distrito, sector_aahh, sector,
          num_vivienda, COALESCE(num_miembros, 1) as num_miembros,
          calle_direccion, direccion, telefono, email
        FROM beneficiarios
        ORDER BY id ASC
      `);
    }

    let beneficiarios = benefRes.rows;

    if (beneficiarios.length === 0) {
      return res.status(400).json({ message: 'No hay beneficiarios en el padrón para despachar vales.' });
    }

    const fechaObj = programacion.fecha ? new Date(programacion.fecha) : new Date();
    const fechaFormateada = !isNaN(fechaObj.getTime())
      ? fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const dateSlug = !isNaN(fechaObj.getTime())
      ? fechaObj.toISOString().slice(0, 10).replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Asegurar esquema seguro de vales_entrega en tiempo de ejecución
    await query(`
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS codigo_unico VARCHAR(50);
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS codigo_vale VARCHAR(50);
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS litros_sugeridos NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS litros_asignados NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS qr_data TEXT;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS whatsapp_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS sms_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS correo_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_despacho TIMESTAMP;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_emision DATE DEFAULT CURRENT_DATE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_canje TIMESTAMP;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS errores_notificacion JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'EMITIDO';
      ALTER TABLE vales_entrega ALTER COLUMN fecha_emision DROP NOT NULL;
      ALTER TABLE vales_entrega ALTER COLUMN fecha_emision SET DEFAULT CURRENT_DATE;
      ALTER TABLE vales_entrega ALTER COLUMN fecha_canje DROP NOT NULL;
      ALTER TABLE vales_entrega ALTER COLUMN codigo_vale DROP NOT NULL;
      ALTER TABLE vales_entrega ALTER COLUMN litros_asignados DROP NOT NULL;
      ALTER TABLE vales_entrega DROP CONSTRAINT IF EXISTS vales_entrega_codigo_vale_key;
    `).catch(() => {});

    // 3. Generate or retrieve Vouchers (vales_entrega)
    const valesToProcess: any[] = [];
    const config = await getConfiguracion();
    const dotacionSemanal = config.dotacion_semanal_por_habitante || 350;

    for (const b of beneficiarios) {
      // Regla de Negocio: Dotación familiar semanal según configuración del sistema
      const litros = (b.num_miembros || 1) * dotacionSemanal;
      const codigoUnico = `VALE-P${programacion.id}-${dateSlug}-${String(b.id).padStart(3, '0')}`;
      const qrData = `${codigoUnico}|${b.dni}|${litros}L|${programacion.id}`;

      // Check if already exists for this programming and beneficiary or matching code
      const existing = await query(
        `SELECT * FROM vales_entrega 
         WHERE (programacion_id = $1 AND beneficiario_id = $2) 
            OR codigo_unico = $3
         LIMIT 1`,
        [programacion.id, b.id, codigoUnico]
      );

      let vale;
      if (existing.rows.length > 0) {
        vale = existing.rows[0];
        const upd = await query(
          `UPDATE vales_entrega 
           SET programacion_id = $1,
               beneficiario_id = $2,
               litros_sugeridos = $3,
               litros_asignados = $3,
               qr_data = $4,
               codigo_unico = $5,
               codigo_vale = $5,
               estado = 'EMITIDO',
               fecha_emision = COALESCE(fecha_emision, CURRENT_DATE)
           WHERE id = $6 
           RETURNING *`,
          [programacion.id, b.id, litros, qrData, codigoUnico, vale.id]
        );
        vale = upd.rows[0];
      } else {
        try {
          const ins = await query(
            `INSERT INTO vales_entrega (
              programacion_id, beneficiario_id, codigo_unico, codigo_vale, 
              litros_sugeridos, litros_asignados, qr_data, estado, fecha_emision
            )
            VALUES ($1, $2, $3, $3, $4, $4, $5, 'EMITIDO', CURRENT_DATE)
            RETURNING *`,
            [programacion.id, b.id, codigoUnico, litros, qrData]
          );
          vale = ins.rows[0];
        } catch (insErr: any) {
          // Si ya existía por ejecución paralela, recuperar el vale existente
          const recovery = await query(
            `SELECT * FROM vales_entrega 
             WHERE (programacion_id = $1 AND beneficiario_id = $2) 
                OR codigo_unico = $3 
             LIMIT 1`,
            [programacion.id, b.id, codigoUnico]
          );
          if (recovery.rows.length > 0) {
            vale = recovery.rows[0];
          } else {
            throw insErr;
          }
        }
      }

      valesToProcess.push({
        vale,
        beneficiario: b,
        litros,
        codigoUnico: vale.codigo_unico || codigoUnico,
        qrData: vale.qr_data || qrData,
      });
    }

    // 4. Batch Dispatch
    // Regla: WhatsApp y SMS quedan en espera (no se paga a proveedores terceros).
    // Correo se envía a los usuarios que tengan e-mail registrado.
    let emailSuccessCount = 0;
    let emailSinRegistroCount = 0;
    let emailErrorCount = 0;

    for (let i = 0; i < valesToProcess.length; i += BATCH_SIZE) {
      const chunk = valesToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          let isEmailOk = false;
          let emailStatusDetail: string | null = null;
          const tieneEmail = Boolean(item.beneficiario.email && item.beneficiario.email.includes('@'));

          if (tieneEmail) {
            try {
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

              const dispatchResult = await MultichannelNotificationService.dispatchAll(payload, {
                channels: {
                  whatsapp: false,
                  sms: false,
                  email: true,
                },
              });

              if (dispatchResult.email.success) {
                isEmailOk = true;
                emailSuccessCount++;
              } else {
                emailErrorCount++;
                emailStatusDetail = dispatchResult.email.error || 'Error SMTP al enviar correo';
              }
            } catch (err: any) {
              emailErrorCount++;
              emailStatusDetail = err.message || 'Excepción enviando correo';
            }
          } else {
            emailSinRegistroCount++;
            emailStatusDetail = 'Sin correo electrónico registrado';
          }

          const erroresJson = {
            whatsapp: 'En espera (sin cobro a terceros)',
            sms: 'En espera (sin cobro a terceros)',
            email: emailStatusDetail,
          };

          await query(
            `UPDATE vales_entrega 
             SET whatsapp_enviado = FALSE,
                 sms_enviado = FALSE,
                 correo_enviado = $1,
                 fecha_despacho = CURRENT_TIMESTAMP,
                 errores_notificacion = $2
             WHERE id = $3`,
            [isEmailOk, JSON.stringify(erroresJson), item.vale.id]
          );
        })
      );
    }

    res.status(200).json({
      message: `Se emitieron ${valesToProcess.length} vales listos para impresión. Correo enviado a ${emailSuccessCount} beneficiarios.`,
      totalBeneficiarios: valesToProcess.length,
      valesGenerados: valesToProcess.length,
      resumen: {
        whatsappEnviados: 0,
        smsEnviados: 0,
        correoEnviados: emailSuccessCount,
        sinCorreo: emailSinRegistroCount,
        erroresCorreo: emailErrorCount,
      },
      politicaTerceros: 'WhatsApp y SMS permanecen en espera sin cobros de terceros.',
    });
  } catch (error: any) {
    console.error('Error despachando vales:', error);
    res.status(500).json({ 
      message: `Error al despachar vales: ${error.message || 'Error interno'}`, 
      error: error.message 
    });
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
        AND v.correo_enviado = FALSE
        AND b.email IS NOT NULL
        AND b.email LIKE '%@%'
    `, [id]);

    if (valesFallidos.rows.length === 0) {
      return res.status(200).json({
        message: 'No existen beneficiarios con correo pendiente o fallido en esta programación.',
        reintentadosCount: 0,
      });
    }

    const fechaObj = programacion.fecha ? new Date(programacion.fecha) : new Date();
    const fechaFormateada = !isNaN(fechaObj.getTime())
      ? fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let reintentados = 0;
    let ultimoError = '';

    for (let i = 0; i < valesFallidos.rows.length; i += BATCH_SIZE) {
      const chunk = valesFallidos.rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        chunk.map(async (v) => {
          let isEmailOk = false;
          let emailError: string | null = null;

          try {
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
                whatsapp: false,
                sms: false,
                email: true,
              },
            });

            if (dispatchResult.email.success) {
              isEmailOk = true;
              reintentados++;
            } else {
              emailError = dispatchResult.email.error || 'Error al reintentar correo';
              ultimoError = emailError;
            }
          } catch (err: any) {
            emailError = err.message || 'Excepción al reintentar correo';
            ultimoError = emailError;
          }

          const updatedErrores = {
            whatsapp: 'En espera (sin cobro a terceros)',
            sms: 'En espera (sin cobro a terceros)',
            email: isEmailOk ? null : emailError,
          };

          await query(`
            UPDATE vales_entrega
            SET correo_enviado = $1,
                fecha_despacho = CURRENT_TIMESTAMP,
                errores_notificacion = $2
            WHERE id = $3
          `, [isEmailOk, JSON.stringify(updatedErrores), v.id]);
        })
      );
    }

    if (valesFallidos.rows.length > 0 && reintentados === 0) {
      return res.status(400).json({
        message: `No se pudo enviar el correo a los ${valesFallidos.rows.length} beneficiarios. Detalle SMTP: ${ultimoError || 'Fallo de autenticación o conexión SMTP'}. Verifique la configuración en .env.`,
        error: ultimoError,
        reintentadosCount: 0,
      });
    }

    res.status(200).json({
      message: `Reintento de correo completado. ${reintentados} de ${valesFallidos.rows.length} correos enviados exitosamente.`,
      reintentadosCount: reintentados,
    });
  } catch (error: any) {
    console.error('Error reintentando vales:', error);
    res.status(500).json({ message: 'Error al reintentar envío de vales', error: error.message });
  }
};

export const despacharCorreoIndividual = async (req: Request, res: Response) => {
  try {
    const { valeId } = req.params;

    const valeRes = await query(`
      SELECT 
        v.*,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.sector_aahh, b.sector, '') as sector_aahh,
        b.telefono,
        b.email,
        p.fecha as programacion_fecha
      FROM vales_entrega v
      INNER JOIN beneficiarios b ON v.beneficiario_id = b.id
      LEFT JOIN programaciones p ON v.programacion_id = p.id
      WHERE v.id = $1
    `, [valeId]);

    if (valeRes.rows.length === 0) {
      return res.status(404).json({ message: 'Vale no encontrado' });
    }

    const v = valeRes.rows[0];
    if (!v.email || !v.email.includes('@')) {
      return res.status(400).json({ message: `El beneficiario ${v.nombres_apellidos} no cuenta con un correo electrónico válido registrado en el padrón.` });
    }

    const fechaObj = v.programacion_fecha ? new Date(v.programacion_fecha) : new Date();
    const fechaFormateada = !isNaN(fechaObj.getTime())
      ? fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

    const qrBuffer = await MultichannelNotificationService.generateQrBuffer(
      v.qr_data || `${v.codigo_unico}|${v.dni}|${v.litros_sugeridos}L`
    );

    const emailResult = await MultichannelNotificationService.sendEmail(payload, qrBuffer);

    if (!emailResult.success) {
      const errDetail = emailResult.error || 'Fallo de entrega SMTP';
      await query(`
        UPDATE vales_entrega 
        SET errores_notificacion = jsonb_set(COALESCE(errores_notificacion, '{}'::jsonb), '{email}', $1::jsonb)
        WHERE id = $2
      `, [JSON.stringify(errDetail), v.id]);

      return res.status(400).json({ 
        message: `Fallo al enviar correo a ${v.email}: ${errDetail}`,
        error: errDetail
      });
    }

    await query(`
      UPDATE vales_entrega 
      SET correo_enviado = TRUE,
          fecha_despacho = CURRENT_TIMESTAMP,
          errores_notificacion = jsonb_set(COALESCE(errores_notificacion, '{}'::jsonb), '{email}', 'null'::jsonb)
      WHERE id = $1
    `, [v.id]);

    res.json({ 
      message: `¡Correo enviado exitosamente a ${v.email}! (Vale: ${v.codigo_unico})`,
      messageId: emailResult.messageId 
    });
  } catch (err: any) {
    console.error('Error enviando correo individual:', err);
    res.status(500).json({ message: `Error en envío de correo: ${err.message}`, error: err.message });
  }
};

export const getAllVales = async (req: Request, res: Response) => {
  try {
    const { estado, search, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT 
        v.*,
        b.dni as beneficiario_dni,
        b.nombres_apellidos as beneficiario_nombre,
        COALESCE(b.sector_aahh, b.sector, '') as sector,
        b.telefono as beneficiario_telefono,
        p.fecha as programacion_fecha,
        p.zona as programacion_zona
      FROM vales_entrega v
      LEFT JOIN beneficiarios b ON v.beneficiario_id = b.id
      LEFT JOIN programaciones p ON v.programacion_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (estado) {
      sql += ` AND v.estado = $${pIdx++}`;
      params.push(estado);
    }
    if (search) {
      sql += ` AND (v.codigo_unico ILIKE $${pIdx} OR b.dni ILIKE $${pIdx} OR b.nombres_apellidos ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }

    sql += ` ORDER BY v.id DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const statsRes = await query(`
      SELECT 
        COUNT(*) as total_vales,
        COUNT(CASE WHEN estado = 'Emitido' OR estado = 'Pendiente' THEN 1 END) as pendientes,
        COUNT(CASE WHEN estado = 'Entregado' OR estado = 'Canjeado' THEN 1 END) as entregados,
        COUNT(CASE WHEN estado = 'Vencido' THEN 1 END) as vencidos,
        COUNT(CASE WHEN estado = 'Anulado' THEN 1 END) as anulados,
        COALESCE(SUM(litros_sugeridos), 0) as total_litros
      FROM vales_entrega
    `);

    res.json({
      vales: result.rows,
      stats: statsRes.rows[0] || {}
    });
  } catch (error: any) {
    console.error('Error al listar todos los vales:', error);
    res.status(500).json({ message: 'Error interno al consultar vales', error: error.message });
  }
};

export const cambiarEstadoVale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ message: 'El campo estado es requerido' });
    }

    const result = await query(
      `UPDATE vales_entrega SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vale no encontrado' });
    }

    res.json({ message: 'Estado del vale actualizado con éxito', vale: result.rows[0] });
  } catch (error: any) {
    console.error('Error al cambiar estado del vale:', error);
    res.status(500).json({ message: 'Error al cambiar estado del vale', error: error.message });
  }
};

/**
 * Recalcular y sincronizar todos los vales emitidos con la dotación semanal reglamentaria (50 L/hab/día × 7 días = 350 L/hab)
 */
export const recalcularValesSemana = async (_req: Request, res: Response) => {
  try {
    const config = await getConfiguracion();
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

    const result = await query(`
      UPDATE vales_entrega v
      SET litros_sugeridos = (COALESCE(b.num_miembros, 1) * ${dotacionSemanal}),
          qr_data = v.codigo_unico || '|' || b.dni || '|' || (COALESCE(b.num_miembros, 1) * ${dotacionSemanal}) || 'L|' || v.programacion_id
      FROM beneficiarios b
      WHERE v.beneficiario_id = b.id
      RETURNING v.id, v.codigo_unico, v.litros_sugeridos;
    `);

    res.json({
      message: `Se actualizaron ${result.rowCount} vales a la dotación reglamentaria de ${config.dias_entrega_semanal} días (${dotacionSemanal} L/hab/semana).`,
      actualizados: result.rowCount,
      dotacionDiaria: config.dotacion_diaria_litros,
      diasEntrega: config.dias_entrega_semanal,
      dotacionSemanalPorHabitante: dotacionSemanal,
      vales: result.rows
    });
  } catch (error: any) {
    console.error('Error recalculando vales:', error);
    res.status(500).json({ message: 'Error al recalcular vales a dotación semanal', error: error.message });
  }
};

/**
 * Exportar Registro Oficial de Vales de Consumo a Excel (.xlsx)
 */
export const exportarValesExcel = async (req: Request, res: Response) => {
  try {
    const { estado, search, programacion_id } = req.query;
    const config = await getConfiguracion();

    let sql = `
      SELECT 
        v.id,
        v.codigo_unico,
        v.litros_sugeridos,
        v.estado,
        v.whatsapp_enviado,
        v.sms_enviado,
        v.correo_enviado,
        v.fecha_despacho,
        v.created_at,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.sector_aahh, b.sector, 'Moyobamba') as sector,
        COALESCE(b.calle_direccion, b.direccion, '-') as direccion,
        b.telefono,
        COALESCE(b.num_miembros, 1) as num_miembros,
        p.id as programacion_id,
        p.fecha as programacion_fecha,
        p.zona as programacion_zona
      FROM vales_entrega v
      LEFT JOIN beneficiarios b ON v.beneficiario_id = b.id
      LEFT JOIN programaciones p ON v.programacion_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (estado) {
      sql += ` AND v.estado ILIKE $${pIdx++}`;
      params.push(estado);
    }
    if (programacion_id) {
      sql += ` AND v.programacion_id = $${pIdx++}`;
      params.push(programacion_id);
    }
    if (search) {
      sql += ` AND (v.codigo_unico ILIKE $${pIdx} OR b.dni ILIKE $${pIdx} OR b.nombres_apellidos ILIKE $${pIdx} OR b.sector_aahh ILIKE $${pIdx} OR b.sector ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }

    sql += ` ORDER BY v.id DESC`;

    const result = await query(sql, params);
    const vales = result.rows;

    const wb = xlsx.utils.book_new();

    const rows: any[][] = [
      ['EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.'],
      ['PROGRAMA NACIONAL DE SANEAMIENTO URBANO (PNSU) — CONVENIO N° 023-2026/VIVIENDA'],
      ['PADRÓN OFICIAL DE VALES DE CONSUMO DE AGUA POTABLE DISTRIBUIDA EN CAMIÓN CISTERNA'],
      [`FECHA DE REPORTE: ${new Date().toLocaleDateString('es-PE')} • DOTACIÓN REGLAMENTARIA: ${config.dotacion_diaria_litros} L/HAB/DÍA (${config.dias_entrega_semanal} DÍAS)`],
      [],
      [
        'N°',
        'SERIE / CÓDIGO',
        'DNI',
        'BENEFICIARIO (TITULAR)',
        'TELÉFONO',
        'SECTOR / AA.HH.',
        'DIRECCIÓN / MZ-LT',
        'MIEMBROS',
        'DOT. DIARIA (L)',
        'CICLO (DÍAS)',
        'VALE SEMANAL (L)',
        'VOLUMEN (m³)',
        'FECHA PROG.',
        'ESTADO',
        'WHATSAPP',
        'SMS',
        'CORREO'
      ]
    ];

    let totalLitros = 0;
    let totalHabitantes = 0;

    vales.forEach((v, index) => {
      const litros = Number(v.litros_sugeridos) || 0;
      const miembros = Number(v.num_miembros) || 1;
      const m3 = (litros / 1000);
      totalLitros += litros;
      totalHabitantes += miembros;

      rows.push([
        index + 1,
        v.codigo_unico,
        v.dni || '-',
        v.nombres_apellidos || 'Beneficiario',
        v.telefono || '-',
        v.sector || 'Moyobamba',
        v.direccion || '-',
        miembros,
        miembros * config.dotacion_diaria_litros,
        config.dias_entrega_semanal,
        litros,
        Number(m3.toFixed(2)),
        v.programacion_fecha ? new Date(v.programacion_fecha).toLocaleDateString('es-PE') : '-',
        v.estado || 'Emitido',
        v.whatsapp_enviado ? 'ENVIADO' : 'PENDIENTE',
        v.sms_enviado ? 'ENVIADO' : 'PENDIENTE',
        v.correo_enviado ? 'ENVIADO' : 'PENDIENTE',
      ]);
    });

    // Fila de Resumen
    rows.push([]);
    rows.push([
      'TOTAL GENERAL',
      `${vales.length} Vales`,
      '',
      `${vales.length} Familias`,
      '',
      '',
      '',
      `${totalHabitantes} Personas`,
      '',
      '',
      totalLitros,
      Number((totalLitros / 1000).toFixed(2)),
      '',
      '',
      '',
      '',
      ''
    ]);

    const ws = xlsx.utils.aoa_to_sheet(rows);

    // Ajustar anchos de columnas
    ws['!cols'] = [
      { wch: 6 },
      { wch: 20 },
      { wch: 12 },
      { wch: 34 },
      { wch: 14 },
      { wch: 26 },
      { wch: 28 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 20 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Vales de Consumo');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Vales_Consumo_EPS_Moyobamba_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando vales a Excel:', error);
    res.status(500).json({ message: 'Error interno al exportar vales a Excel', error: error.message });
  }
};

