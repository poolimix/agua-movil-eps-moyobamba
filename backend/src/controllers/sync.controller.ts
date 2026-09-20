import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db';

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
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo inválido. Solo se admiten imágenes JPG, PNG o WEBP.'));
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
});

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
    } = req.body;

    const finalLocalId = localId || local_id || `gen-${Date.now()}`;
    const finalBeneficiarioId = beneficiarioId || beneficiario_id;
    const finalProgramacionId = programacionId || programacion_id || 1;
    const finalCisternaId = cisternaId || cisterna_id || null;
    const finalConductorId = conductorId || conductor_id || null;
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

    // 1. Idempotency validation
    const existing = await query('SELECT * FROM entregas_agua WHERE local_id = $1', [finalLocalId]);
    if (existing.rows.length > 0) {
      return res.status(200).json({
        message: 'Entrega ya registrada previamente (idempotencia confirmada).',
        entrega: existing.rows[0],
        status: 'EXISTING',
      });
    }

    // 2. Foto URL
    let fotoUrl: string | null = null;
    if (req.file) {
      fotoUrl = `/uploads/registros/${req.file.filename}`;
    }

    // 3. Insert into PostgreSQL
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
        sincronizado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18, 1)
      RETURNING *;
    `;

    const result = await query(insertQuery, [
      finalLocalId,
      finalBeneficiarioId,
      finalProgramacionId,
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
    ]);

    // 4. Si viene con GPS y cisterna_id, actualizar la última ubicación de la cisterna en tiempo real
    if (finalCisternaId && finalLat && finalLng) {
      query(`
        UPDATE cisternas 
        SET latitud_actual = $1, longitud_actual = $2, ultima_actualizacion_gps = CURRENT_TIMESTAMP 
        WHERE id = $3
      `, [finalLat, finalLng, finalCisternaId]).catch(() => {});
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
