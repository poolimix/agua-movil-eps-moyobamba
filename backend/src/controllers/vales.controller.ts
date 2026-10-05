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
    const config = await getConfiguracion();
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

    for (const b of beneficiarios) {
      // Regla de Negocio: Dotación familiar semanal según configuración del sistema
      const litros = (b.num_miembros || 1) * dotacionSemanal;
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
        // Si el vale previo tenía el valor diario antiguo (< dotación semanal), actualizarlo a la dotación semanal
        if (parseFloat(vale.litros_sugeridos) < litros) {
          const upd = await query(
            `UPDATE vales_entrega 
             SET litros_sugeridos = $1, qr_data = $2 
             WHERE id = $3 
             RETURNING *`,
            [litros, qrData, vale.id]
          );
          vale = upd.rows[0];
        }
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

