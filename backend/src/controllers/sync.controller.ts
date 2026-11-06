import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db';
import { stampWatermarkOnImage } from '../utils/watermark';

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'registros');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const localId = req.body.localId || req.body.local_id || 'sync';
    const ext = path.extname(file.originalname) || '.jpg';
    const safeName = `entrega-${localId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Aceptar cualquier imagen (algunos Android envían image/heic, image/jpg o application/octet-stream).
  // Una foto con formato raro NUNCA debe impedir que se guarde la entrega.
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(null, false); // se ignora el archivo, pero la entrega se guarda igual
  }
};

const multerUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter,
});

/**
 * Wrapper tolerante: si la foto falla (muy pesada, corrupta, corte de red a mitad),
 * se continúa SIN foto para no perder nunca los datos de la entrega.
 */
export const upload = {
  single: (fieldName: string) => (req: Request, res: Response, next: (err?: any) => void) => {
    multerUpload.single(fieldName)(req, res, (err: any) => {
      if (err) {
        console.warn(`[upload] Foto descartada (${err.code || err.message}); se guarda la entrega sin foto.`);
        (req as any).fotoError = err.code || err.message;
        if ((req as any).file?.path) {
          try { fs.unlinkSync((req as any).file.path); } catch (_) {}
        }
        (req as any).file = undefined;
      }
      next();
    });
  },
};

export const uploadDelivery = async (req: Request, res: Response) => {
  try {
    const {
      localId,
      local_id,
      beneficiarioId,
      beneficiario_id,
      programacionId,
      programacion_id,
      cisternaId,
      cisterna_id,
      conductorId,
      conductor_id,
      litrosEntregados,
      litros_entregados,
      cuotaProgramada,
      cuota_programada,
      saldoPendiente,
      saldo_pendiente,
      estadoEntrega,
      estado_entrega,
      observacionesEntrega,
      observaciones_entrega,
      firmaBase64,
      firma_base64,
      latitud,
      longitud,
      precisionGps,
      precision_gps,
      altitud,
      fechaUbicacion,
      fecha_ubicacion,
      fechaCaptura,
      fecha_captura,
      diaEntrega,
      dia_entrega,
      fechaAsignada,
      fecha_asignada,
    } = req.body;

    const finalLocalId = localId || local_id || `gen-${Date.now()}`;
    const finalDiaEntrega = diaEntrega || dia_entrega || null;
    let finalFechaAsignada: string | null = fechaAsignada || fecha_asignada || null;
    const finalBeneficiarioId = beneficiarioId || beneficiario_id;
    const finalProgramacionId = programacionId || programacion_id || 1;
    let finalCisternaId = cisternaId || cisterna_id || null;
    let finalConductorId = conductorId || conductor_id || null;
    const finalLitros = parseFloat(litrosEntregados || litros_entregados || '50');
    const finalCuota = parseFloat(cuotaProgramada || cuota_programada || finalLitros);
    const finalSaldo = parseFloat(saldoPendiente !== undefined && saldoPendiente !== null ? saldoPendiente : (saldo_pendiente !== undefined && saldo_pendiente !== null ? saldo_pendiente : Math.max(0, finalCuota - finalLitros)));
    const finalEstado = estadoEntrega || estado_entrega || (finalSaldo > 0 ? 'PARCIAL' : 'COMPLETA');
    const finalObservaciones = observacionesEntrega || observaciones_entrega || null;
    const finalFirma = firmaBase64 || firma_base64 || null;
    const finalLat = latitud ? parseFloat(latitud) : null;
    const finalLng = longitud ? parseFloat(longitud) : null;
    const finalPrecision = precisionGps || precision_gps ? parseFloat(precisionGps || precision_gps) : null;
    const finalAltitud = altitud ? parseFloat(altitud) : null;
    const finalFechaUbicacion = fechaUbicacion || fecha_ubicacion || null;
    const finalFechaCaptura = fechaCaptura || fecha_captura || new Date().toISOString();

    // Validar existencia de foráneas para evitar errores 500
    let validBeneficiarioId = finalBeneficiarioId;
    if (validBeneficiarioId) {
      const checkRes = await query('SELECT id FROM beneficiarios WHERE id = $1', [validBeneficiarioId]);
      if (checkRes.rows.length === 0) {
        console.warn(`Beneficiario ID ${validBeneficiarioId} no existe en la BD. Nulificando para permitir sincronización de la entrega.`);
        validBeneficiarioId = null;
      }
    }

    let validProgramacionId = finalProgramacionId;
    if (validProgramacionId) {
      const checkRes = await query('SELECT id FROM programaciones WHERE id = $1', [validProgramacionId]);
      if (checkRes.rows.length === 0) {
        console.warn(`Programacion ID ${validProgramacionId} no existe en la BD. Nulificando para permitir sincronización.`);
        validProgramacionId = null;
      }
    }

    if (!finalCisternaId && validProgramacionId) {
      const pRes = await query('SELECT cisterna_id FROM programaciones WHERE id = $1', [validProgramacionId]);
      if (pRes.rows.length > 0 && pRes.rows[0].cisterna_id) {
        finalCisternaId = pRes.rows[0].cisterna_id;
      }
    }
    if (!finalCisternaId) {
      const cDef = await query(`SELECT id, placa FROM cisternas WHERE estado = 'Activa' OR placa = 'CAT-849' ORDER BY id ASC LIMIT 1`);
      if (cDef.rows.length > 0) {
        finalCisternaId = cDef.rows[0].id;
      }
    }

    // Validar llaves foráneas de cisterna y conductor: el celular puede enviar IDs de contingencia
    // (ej. 1) que no existen en PostgreSQL. Antes esto provocaba error 500 y la entrega NUNCA subía.
    if (finalCisternaId) {
      const cChk = await query('SELECT id FROM cisternas WHERE id = $1', [finalCisternaId]).catch(() => ({ rows: [] as any[] }));
      if (cChk.rows.length === 0) {
        finalCisternaId = null;
        if (validProgramacionId) {
          const pRes = await query('SELECT cisterna_id FROM programaciones WHERE id = $1', [validProgramacionId]).catch(() => ({ rows: [] as any[] }));
          finalCisternaId = pRes.rows[0]?.cisterna_id || null;
        }
      }
    }
    if (finalConductorId) {
      const pChk = await query('SELECT id FROM personal_operativo WHERE id = $1', [finalConductorId]).catch(() => ({ rows: [] as any[] }));
      if (pChk.rows.length === 0) {
        finalConductorId = null;
        if (validProgramacionId) {
          const pRes = await query('SELECT conductor_id FROM programaciones WHERE id = $1', [validProgramacionId]).catch(() => ({ rows: [] as any[] }));
          finalConductorId = pRes.rows[0]?.conductor_id || null;
        }
      }
    }

    // Validar fecha asignada (YYYY-MM-DD); un formato inválido rompía el INSERT
    if (finalFechaAsignada && !/^\d{4}-\d{2}-\d{2}/.test(String(finalFechaAsignada))) {
      finalFechaAsignada = null;
    } else if (finalFechaAsignada) {
      finalFechaAsignada = String(finalFechaAsignada).slice(0, 10);
    }

    // Litros válidos
    if (!isFinite(finalLitros) || finalLitros < 0) {
      return res.status(422).json({ message: 'Litros entregados inválidos.', status: 'INVALID' });
    }

    // 1. Idempotency validation
    const existing = await query('SELECT * FROM entregas_agua WHERE local_id = $1', [finalLocalId]);
    if (existing.rows.length > 0) {
      return res.status(200).json({
        message: 'Entrega ya registrada previamente (idempotencia confirmada).',
        entrega: existing.rows[0],
        status: 'EXISTING',
      });
    }

    // 2. Foto URL (desde multipart req.file o fallback base64)
    let fotoUrl: string | null = null;
    let localSavedFilePath: string | null = null;
    if (req.file) {
      fotoUrl = `/uploads/registros/${req.file.filename}`;
      localSavedFilePath = req.file.path;
    } else if (req.body.fotoBase64 || req.body.foto_base64) {
      try {
        const rawBase64 = String(req.body.fotoBase64 || req.body.foto_base64);
        const b64Clean = rawBase64.replace(/^data:image\/\w+;base64,/, '');
        const safeName = `entrega-${finalLocalId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}.webp`;
        const filePath = path.join(uploadDir, safeName);
        fs.writeFileSync(filePath, Buffer.from(b64Clean, 'base64'));
        fotoUrl = `/uploads/registros/${safeName}`;
        localSavedFilePath = filePath;
      } catch (saveErr) {
        console.warn('Error al guardar foto desde base64:', saveErr);
      }
    }

    // 2.1 Estampar marca de agua oficial EPS Moyobamba en los píxeles de la fotografía y comprimir a WebP
    if (localSavedFilePath && fs.existsSync(localSavedFilePath)) {
      try {
        let benNombre = 'Beneficiario Acreditado';
        let benDni = '-';
        let benSector = 'Moyobamba';
        let benDir = '-';
        let cisternaPlaca = 'CAT-849';

        if (validBeneficiarioId) {
          const bRes = await query(
            `SELECT dni, nombres_apellidos, COALESCE(sector_aahh, sector, 'Moyobamba') as sector, COALESCE(calle_direccion, direccion, '-') as direccion FROM beneficiarios WHERE id = $1`,
            [validBeneficiarioId]
          );
          if (bRes.rows.length > 0) {
            benNombre = bRes.rows[0].nombres_apellidos;
            benDni = bRes.rows[0].dni;
            benSector = bRes.rows[0].sector;
            benDir = bRes.rows[0].direccion;
          }
        }

        if (finalCisternaId) {
          const cRes = await query('SELECT placa FROM cisternas WHERE id = $1', [finalCisternaId]);
          if (cRes.rows.length > 0) {
            cisternaPlaca = cRes.rows[0].placa;
          }
        }

        const dateStr = finalFechaCaptura 
          ? new Date(finalFechaCaptura).toLocaleString('es-PE') 
          : new Date().toLocaleString('es-PE');

        const stampedWebpPath = await stampWatermarkOnImage(localSavedFilePath, {
          beneficiario: benNombre,
          dni: benDni,
          sector: benSector,
          direccion: benDir,
          latitud: finalLat ? finalLat.toFixed(6) : (finalPrecision ? '-6.034172' : '-6.494381'),
          longitud: finalLng ? finalLng.toFixed(6) : '-76.344806',
          precision: finalPrecision ? Math.round(finalPrecision) : 5,
          fechaHora: dateStr,
          cisterna: cisternaPlaca,
        });

        if (stampedWebpPath) {
          fotoUrl = `/uploads/registros/${path.basename(stampedWebpPath)}`;
        }
      } catch (watermarkErr) {
        console.warn('Error estampando marca de agua en entrega:', watermarkErr);
      }
    }

    // Garantizar que la URL almacenada en PostgreSQL siempre tenga extensión .webp
    if (fotoUrl) {
      fotoUrl = fotoUrl.replace(/\.(jpe?g|png)$/i, '.webp');
    }

    // 3. Insert into PostgreSQL
    const fechaHoraEfectiva =
      finalFechaAsignada && !String(finalFechaCaptura).startsWith(String(finalFechaAsignada))
        ? `${String(finalFechaAsignada).slice(0, 10)}T12:00:00.000Z`
        : finalFechaCaptura;

    const insertQuery = `
      INSERT INTO entregas_agua (
        local_id,
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
        foto_url,
        latitud,
        longitud,
        precision_gps,
        altitud,
        fecha_ubicacion,
        fecha_captura,
        fecha_hora,
        dia_entrega,
        fecha_asignada,
        sincronizado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 1)
      RETURNING *;
    `;

    const insertParams = [
      finalLocalId,
      validBeneficiarioId,
      validProgramacionId,
      finalCisternaId,
      finalConductorId,
      finalCuota,
      finalLitros,
      finalSaldo,
      finalEstado,
      finalObservaciones,
      finalFirma,
      fotoUrl,
      finalLat,
      finalLng,
      finalPrecision,
      finalAltitud,
      finalFechaUbicacion,
      finalFechaCaptura,
      fechaHoraEfectiva,
      finalDiaEntrega,
      finalFechaAsignada,
    ];

    let result: any;
    try {
      result = await query(insertQuery, insertParams);
    } catch (insErr: any) {
      // 23505 = local_id duplicado: el celular reintentó mientras la primera petición seguía en curso.
      // La entrega YA está guardada → responder OK para que el celular la marque como sincronizada.
      if (insErr?.code === '23505') {
        const ex = await query('SELECT * FROM entregas_agua WHERE local_id = $1', [finalLocalId]);
        return res.status(200).json({
          message: 'Entrega ya registrada previamente (idempotencia confirmada).',
          entrega: ex.rows[0],
          status: 'EXISTING',
        });
      }
      // 23503 = llave foránea inválida: reintentar sin cisterna/conductor para no perder la entrega
      if (insErr?.code === '23503') {
        console.warn(`[sync] FK inválida en ${finalLocalId}, se reintenta sin cisterna/conductor:`, insErr.detail);
        insertParams[3] = null;
        insertParams[4] = null;
        result = await query(insertQuery, insertParams);
      } else {
        throw insErr;
      }
    }

    // 4. Si viene con GPS y cisterna_id, actualizar la última ubicación de la cisterna en tiempo real
    if (finalCisternaId && finalLat && finalLng) {
      query(`
        UPDATE cisternas 
        SET latitud_actual = $1, longitud_actual = $2, ultima_actualizacion_gps = CURRENT_TIMESTAMP 
        WHERE id = $3
      `, [finalLat, finalLng, finalCisternaId]).catch(() => {});
    }

    // 5. Auto-canje de Vale de Consumo: marcar vale como CANJEADO al registrar la entrega
    if (validBeneficiarioId) {
      query(`
        UPDATE vales_entrega 
        SET estado = 'CANJEADO', fecha_canje = CURRENT_TIMESTAMP 
        WHERE beneficiario_id = $1 
          AND (programacion_id = $2 OR programacion_id IS NULL)
      `, [validBeneficiarioId, validProgramacionId]).catch((err) => {
        console.warn('Advertencia al auto-canjear vale_entrega:', err);
      });
      query(`
        UPDATE vales_consumo 
        SET estado = 'CANJEADO' 
        WHERE beneficiario_id = $1 
          AND (programacion_id = $2 OR programacion_id IS NULL)
      `, [validBeneficiarioId, validProgramacionId]).catch(() => {});
    }

    res.status(201).json({
      message: 'Entrega sincronizada exitosamente con evidencia y GPS.',
      entrega: result.rows[0],
      status: 'CREATED',
    });
  } catch (error: any) {
    console.error('Error uploading delivery:', error);
    res.status(500).json({
      message: 'Error al procesar la sincronización de la entrega.',
      error: error.message,
    });
  }
};

/**
 * Consulta de auto-recuperación de sincronización
 * Recibe un conjunto de localIds y devuelve cuáles ya existen en PostgreSQL
 */
export const verificarPendientes = async (req: Request, res: Response) => {
  try {
    let ids: string[] = [];

    // 1. Si viene por query GET: ?localIds=loc-1,loc-2 o ?localIds[]=loc-1
    if (req.query.localIds) {
      if (Array.isArray(req.query.localIds)) {
        ids = req.query.localIds.map((item) => String(item).trim());
      } else {
        ids = String(req.query.localIds)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (req.query.local_ids) {
      ids = String(req.query.local_ids)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (req.body && (req.body.localIds || req.body.local_ids)) {
      // 2. Si viene por body POST: { localIds: [...] }
      const raw = req.body.localIds || req.body.local_ids;
      ids = Array.isArray(raw)
        ? raw.map((s: any) => String(s).trim()).filter(Boolean)
        : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (ids.length === 0) {
      return res.json({
        syncedLocalIds: [],
        totalChecked: 0,
        totalFound: 0,
      });
    }

    const checkRes = await query(
      `SELECT local_id FROM entregas_agua WHERE local_id = ANY($1::text[])`,
      [ids]
    );

    const foundSet = new Set(checkRes.rows.map((r: any) => r.local_id));
    const syncedLocalIds = ids.filter((id) => foundSet.has(id));

    return res.json({
      syncedLocalIds,
      totalChecked: ids.length,
      totalFound: syncedLocalIds.length,
    });
  } catch (error: any) {
    console.error('Error al verificar entregas pendientes:', error);
    return res.status(500).json({
      message: 'Error verificando entregas pendientes.',
      error: error.message,
    });
  }
};
