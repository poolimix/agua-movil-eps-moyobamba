import sharp from 'sharp';
import fs from 'fs';

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
 * Estampa permanentemente la franja de fehaciencia y georreferenciación en los píxeles de la imagen
 */
export async function stampWatermarkOnImage(imagePath: string, data: WatermarkData): Promise<void> {
  try {
    if (!fs.existsSync(imagePath)) return;

    const inputBuffer = fs.readFileSync(imagePath);
    const metadata = await sharp(inputBuffer).metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 768;

    // Si la imagen es demasiado pequeña para estampar, omitir
    if (width < 150 || height < 150) return;

    // Calcular proporción de altura para el banner (aprox 20% de la altura de la imagen)
    const bannerHeight = Math.min(height - 10, Math.max(120, Math.min(260, Math.round(height * 0.20))));
    const fontSizeTitle = Math.max(14, Math.round(bannerHeight * 0.13));
    const fontSizeBody = Math.max(12, Math.round(bannerHeight * 0.105));
    const fontSizeSmall = Math.max(10, Math.round(bannerHeight * 0.09));

    const benText = `👤 ${escapeXml(data.beneficiario || 'Beneficiario Acreditado')} • DNI: ${escapeXml(data.dni || '-')}`;
    const dirText = `📍 SECTOR: ${escapeXml(data.sector || 'Moyobamba')} • DIR: ${escapeXml(data.direccion || '-')}`;
    const gpsText = `🌐 GPS: Lat ${data.latitud || '-6.034172'}, Long ${data.longitud || '-76.971391'}${data.precision ? ` (±${data.precision}m)` : ''}`;
    const timeText = `🕒 ${escapeXml(data.fechaHora || new Date().toLocaleString('es-PE'))}`;
    const cisternaText = data.cisterna ? `🚛 ${escapeXml(data.cisterna)}` : '';

    const svgOverlay = `
      <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.90)" />
        <rect width="100%" height="4" fill="#0284c7" />
        <text x="24" y="${Math.round(bannerHeight * 0.22)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeTitle}" font-weight="bold" fill="#38bdf8">
          🏢 EPS MOYOBAMBA
        </text>
        ${cisternaText ? `<text x="${width - 24}" y="${Math.round(bannerHeight * 0.22)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall}" font-weight="bold" fill="#f8fafc">${cisternaText}</text>` : ''}
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
        <text x="${width - 24}" y="${Math.round(bannerHeight * 0.95)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSizeSmall - 1}" font-weight="bold" fill="#38bdf8">
          FEHACIENTE
        </text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svgOverlay);

    const stampedBuffer = await sharp(inputBuffer)
      .composite([
        {
          input: svgBuffer,
          top: height - bannerHeight,
          left: 0,
        },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();

    fs.writeFileSync(imagePath, stampedBuffer);
  } catch (err) {
    console.error('Error stamping watermark with Sharp:', err);
  }
}
