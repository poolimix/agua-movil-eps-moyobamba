import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { pool } from '../db';

/**
 * Migra archivos existentes en uploads/registros de JPG/PNG a WEBP y actualiza la base de datos PostgreSQL.
 */
export async function migrateExistingImagesToWebp(): Promise<void> {
  try {
    const uploadDir = path.join(process.cwd(), 'uploads', 'registros');
    if (!fs.existsSync(uploadDir)) {
      return;
    }

    const files = fs.readdirSync(uploadDir);
    let convertedFiles = 0;

    for (const file of files) {
      if (/\.(jpe?g|png)$/i.test(file)) {
        const origPath = path.join(uploadDir, file);
        const webpName = file.replace(/\.(jpe?g|png)$/i, '.webp');
        const webpPath = path.join(uploadDir, webpName);

        try {
          if (!fs.existsSync(webpPath)) {
            await sharp(origPath)
              .rotate()
              .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80, effort: 4 })
              .toFile(webpPath);
            convertedFiles++;
          }
          // Si el .webp ya existe o se generó exitosamente, eliminar el archivo original .jpg/.png
          if (fs.existsSync(origPath) && origPath !== webpPath) {
            try { fs.unlinkSync(origPath); } catch (_) {}
          }
        } catch (fileErr) {
          console.warn(`[Migración WEBP] Error convirtiendo ${file}:`, fileErr);
        }
      }
    }

    // Actualizar todas las rutas históricas en PostgreSQL
    const dbRes = await pool.query(`
      UPDATE entregas_agua 
      SET foto_url = regexp_replace(foto_url, '\\.(jpe?g|png)(\\?.*)?$', '.webp', 'i')
      WHERE foto_url ~* '\\.(jpe?g|png)(\\?.*)?$'
    `);

    if (convertedFiles > 0 || (dbRes.rowCount && dbRes.rowCount > 0)) {
      console.log(`✅ [Migración WEBP] Completada: ${convertedFiles} archivos convertidos a .webp, ${dbRes.rowCount || 0} registros en BD actualizados.`);
    }
  } catch (err) {
    console.warn('Aviso en migración de imágenes a WEBP:', err);
  }
}

