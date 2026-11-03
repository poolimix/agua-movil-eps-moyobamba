import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export interface WatermarkData {
  beneficiario?: string;
  dni?: string;
  sector?: string;
  direccion?: string;
  latitud?: string | number | null;
  longitud?: string | number | null;
  precision?: string | number | null;
  fechaHora?: string;
  cisterna?: string;
}

function escapeXml(unsafe: string): string {
  return String(unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Convierte cualquier imagen a formato WEBP ultraligero garantizado
 */
export async function convertToWebp(imagePath: string, quality = 80): Promise<string> {
  if (!fs.existsSync(imagePath)) return imagePath;
  const webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
  try {
    const buffer = await sharp(imagePath)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
    fs.writeFileSync(webpPath, buffer);
    if (webpPath !== imagePath && fs.existsSync(imagePath)) {
      try { fs.unlinkSync(imagePath); } catch (_) {}
    }
    return webpPath;
  } catch (err) {
    console.error('Error convirtiendo imagen a WEBP:', err);
    return imagePath;
  }
}

/**
 * Estampa permanentemente la franja de fehaciencia y georreferenciación en los píxeles de la imagen
 * y la comprime en formato WEBP ultra-ligero para optimizar almacenamiento y velocidad de carga.
 * Retorna siempre la ruta absoluta del archivo .webp generado.
 */
export async function stampWatermarkOnImage(imagePath: string, data: WatermarkData): Promise<string> {
  const webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
  try {
    if (!fs.existsSync(imagePath)) return imagePath;

    const inputBuffer = fs.readFileSync(imagePath);
    // Auto-rotar según orientación EXIF de la cámara del móvil
    const baseSharp = sharp(inputBuffer).rotate();
    const metadata = await baseSharp.metadata();

    const origWidth = metadata.width || 1024;
    const origHeight = metadata.height || 768;

    // Calcular dimensiones proporcionales exactas para evitar fallos de composite en Sharp
    const maxDimension = 1280;
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > maxDimension || origHeight > maxDimension) {
      if (origWidth >= origHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.max(1, Math.round((origHeight * maxDimension) / origWidth));
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.max(1, Math.round((origWidth * maxDimension) / origHeight));
      }
    }

    // Si la imagen es sumamente pequeña, convertir directo a WEBP sin estampar
    if (targetWidth < 150 || targetHeight < 150) {
      return await convertToWebp(imagePath);
    }

    // Proporción del banner calculada estrictamente sobre las dimensiones de salida (targetHeight)
    const bannerHeight = Math.min(
      targetHeight - 10,
      Math.max(90, Math.min(220, Math.round(targetHeight * 0.18)))
    );
    const fontSizeTitle = Math.max(13, Math.round(bannerHeight * 0.135));
    const fontSizeBody = Math.max(11, Math.round(bannerHeight * 0.11));
    const fontSizeSmall = Math.max(9, Math.round(bannerHeight * 0.092));

    const benText = `👤 ${escapeXml(data.beneficiario || 'Beneficiario Acreditado')} • DNI: ${escapeXml(data.dni || '-')}`;
    const dirText = `📍 SECTOR: ${escapeXml(data.sector || 'Moyobamba')} • DIR: ${escapeXml(data.direccion || '-')}`;
    const gpsText = `🌐 GPS: Lat ${data.latitud || '-6.034172'}, Long ${data.longitud || '-76.971391'}${data.precision ? ` (±${data.precision}m)` : ''}`;
    const timeText = `🕒 ${escapeXml(data.fechaHora || new Date().toLocaleString('es-PE'))}`;
    const cisternaText = data.cisterna ? `🚛 ${escapeXml(data.cisterna)}` : '';

    const svgOverlay = `
      <svg width="${targetWidth}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.90)" />
        <rect width="100%" height="4" fill="#0284c7" />
        <text x="24" y="${Math.round(bannerHeight * 0.22)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeTitle}" font-weight="bold" fill="#38bdf8">
          🏢 EPS MOYOBAMBA
        </text>
        ${cisternaText ? `<text x="${targetWidth - 24}" y="${Math.round(bannerHeight * 0.22)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall}" font-weight="bold" fill="#f8fafc">${cisternaText}</text>` : ''}
        <text x="24" y="${Math.round(bannerHeight * 0.43)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeBody}" font-weight="bold" fill="#ffffff">
          ${benText}
        </text>
        <text x="24" y="${Math.round(bannerHeight * 0.62)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall}" fill="#cbd5e1">
          ${dirText}
        </text>
        <text x="24" y="${Math.round(bannerHeight * 0.81)}" font-family="monospace, Courier" font-size="${fontSizeSmall}" font-weight="bold" fill="#4ade80">
          ${gpsText}
        </text>
        <text x="24" y="${Math.round(bannerHeight * 0.95)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall - 1}" fill="#94a3b8">
          ${timeText}
        </text>
        <text x="${targetWidth - 24}" y="${Math.round(bannerHeight * 0.95)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall - 1}" font-weight="bold" fill="#38bdf8">
          FEHACIENTE
        </text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svgOverlay);

    // Redimensionar exactamente a targetWidth x targetHeight y estampar
    const stampedBuffer = await baseSharp
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .composite([
        {
          input: svgBuffer,
          top: targetHeight - bannerHeight,
          left: 0,
        },
      ])
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    fs.writeFileSync(webpPath, stampedBuffer);

    // Si el archivo original era .jpg/.png diferente al .webp, eliminar el original para liberar espacio
    if (webpPath !== imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch (_) {}
    }

    return webpPath;
  } catch (err) {
    console.error('Error estampando marca de agua con Sharp, aplicando fallback a WEBP puro:', err);
    try {
      // Garantizar que la imagen se convierta a WEBP aún si el SVG fallase
      const fallbackBuffer = await sharp(imagePath)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer();

      fs.writeFileSync(webpPath, fallbackBuffer);
      if (webpPath !== imagePath && fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (_) {}
      }
      return webpPath;
    } catch (fallbackErr) {
      console.error('Error crítico convirtiendo a WEBP:', fallbackErr);
      return imagePath;
    }
  }
}
