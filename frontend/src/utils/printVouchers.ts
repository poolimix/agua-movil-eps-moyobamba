import QRCode from 'qrcode';

export interface ValePrintData {
  id?: number;
  codigo_unico: string;
  beneficiario_dni?: string;
  beneficiario_nombre?: string;
  nombres_apellidos?: string;
  dni?: string;
  sector?: string;
  sector_aahh?: string;
  direccion?: string;
  calle_direccion?: string;
  telefono?: string | null;
  num_miembros?: number | string;
  litros_sugeridos: number | string;
  estado?: string;
  programacion_fecha?: string;
  programacion_zona?: string;
}

export interface ConfigPrintData {
  dotacion_diaria_litros?: number;
  dias_entrega_semanal?: number;
}

/**
 * Genera el QR como Data URL en base64 (alta resolución para impresión nítida)
 */
async function generateQr(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Error generando QR para vale:', err);
    return '';
  }
}

/**
 * Imprimir Vale Individual oficial
 */
export async function imprimirValeIndividual(v: ValePrintData, config?: ConfigPrintData) {
  const dni = v.beneficiario_dni || v.dni || 'S/N';
  const nombre = v.beneficiario_nombre || v.nombres_apellidos || 'Beneficiario Empadronado';
  const sector = v.sector || v.sector_aahh || 'Moyobamba';
  const direccion = v.calle_direccion || v.direccion || '-';
  const dotDiaria = Number(config?.dotacion_diaria_litros) || 50;
  const dias = Number(config?.dias_entrega_semanal) || 7;
  const dotPorPersona = dotDiaria * dias;

  const rawMiembros = Number(v.num_miembros) || 0;
  const rawLitros = Number(v.litros_sugeridos) || 0;
  const miembros = rawMiembros > 0 ? rawMiembros : (rawLitros > 0 ? Math.max(1, Math.round(rawLitros / dotPorPersona)) : 1);
  const litros = rawLitros > 0 ? rawLitros : (miembros * dotPorPersona);
  const m3 = (litros / 1000).toFixed(2);
  const qrPayload = `${v.codigo_unico}|${dni}|${litros}L`;
  const qrUrl = await generateQr(qrPayload);

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Vale de Consumo - ${v.codigo_unico}</title>
        <style>
          @media print {
            body { margin: 0; padding: 12px; }
            .no-print { display: none !important; }
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
          }
          .vale-card {
            border: 2.5px solid #0284c7;
            border-radius: 12px;
            padding: 20px;
            background: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
            position: relative;
          }
          .header-banner {
            text-align: center;
            background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
            color: #ffffff;
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 14px;
          }
          .institution {
            font-size: 18px;
            font-weight: 900;
            color: #ffffff;
            letter-spacing: 0.5px;
          }
          .sub-institution {
            font-size: 10.5px;
            font-weight: 800;
            color: #e0f2fe;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .convenio {
            font-size: 10px;
            font-weight: 800;
            color: #0369a1;
            background: #ffffff;
            display: inline-block;
            padding: 2px 10px;
            border-radius: 10px;
            margin-top: 5px;
          }
          .serie-box {
            background: #f0f9ff;
            border: 2px solid #0284c7;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
            margin-bottom: 14px;
          }
          .serie-title {
            font-size: 10.5px;
            font-weight: 900;
            color: #0369a1;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .serie-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 23px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 2px;
          }
          .info-grid {
            margin-bottom: 14px;
            font-size: 13px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px dashed #cbd5e1;
          }
          .info-label {
            color: #0369a1;
            font-weight: 800;
          }
          .info-value {
            color: #0f172a;
            font-weight: 900;
            text-align: right;
            max-width: 62%;
          }
          .dotacion-box {
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
            border: 2px solid #0284c7;
            border-radius: 10px;
            padding: 12px;
            text-align: center;
            margin-bottom: 14px;
          }
          .dotacion-total {
            font-size: 28px;
            font-weight: 900;
            color: #0c4a6e;
            line-height: 1.1;
          }
          .dotacion-desc {
            font-size: 12px;
            font-weight: 800;
            color: #0369a1;
            margin-top: 4px;
          }
          .dotacion-formula {
            font-size: 11px;
            font-weight: 700;
            color: #1e293b;
            margin-top: 2px;
          }
          .qr-section {
            text-align: center;
            margin-bottom: 14px;
            padding: 8px 0;
          }
          .qr-img {
            width: 185px;
            height: 185px;
            display: block;
            margin: 0 auto;
            border: 2.5px solid #0284c7;
            border-radius: 10px;
            padding: 5px;
            background: #fff;
          }
          .qr-hint {
            font-size: 10.5px;
            font-weight: 900;
            color: #ffffff;
            background: #0284c7;
            display: inline-block;
            padding: 3px 12px;
            border-radius: 999px;
            margin-top: 6px;
            letter-spacing: 0.5px;
          }
          .signatures-box {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-top: 24px;
            padding-top: 10px;
          }
          .sig-line {
            flex: 1;
            text-align: center;
            border-top: 1px dashed #64748b;
            padding-top: 4px;
            font-size: 9.5px;
            color: #475569;
            font-weight: 600;
          }
          .footer-note {
            text-align: center;
            font-size: 9px;
            color: #64748b;
            margin-top: 14px;
            border-top: 1px solid #f1f5f9;
            padding-top: 8px;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="vale-card">
          <div class="header-banner">
            <div class="institution">💧 EPS MOYOBAMBA S.A.</div>
            <div class="sub-institution">Programa Nacional de Saneamiento Urbano (PNSU)</div>
            <div class="convenio">Convenio N° 023-2026/VIVIENDA/VMCS/PNSU/DE</div>
          </div>

          <div class="serie-box">
            <div class="serie-title">${v.codigo_unico.includes('ANUAL') ? '🌟 CARNET / VALE ANUAL OFICIAL DE AGUA POTABLE' : 'Vale Oficial de Consumo de Agua'}</div>
            <div class="serie-code">${v.codigo_unico}</div>
            ${v.codigo_unico.includes('ANUAL') ? '<div style="font-size: 10px; font-weight: 800; color: #047857; margin-top: 4px; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px; display: inline-block;">✓ VÁLIDO PARA TODO EL AÑO (QR PERMANENTE EN RUTA)</div>' : ''}
          </div>

          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Beneficiario Titular:</span>
              <span class="info-value">${nombre}</span>
            </div>
            <div class="info-row">
              <span class="info-label">DNI:</span>
              <span class="info-value">${dni}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Sector / AA.HH.:</span>
              <span class="info-value">${sector}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Dirección / Predio:</span>
              <span class="info-value">${direccion}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Miembros Familiares:</span>
              <span class="info-value">${miembros} persona${miembros > 1 ? 's' : ''}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Fecha Programada:</span>
              <span class="info-value">${v.programacion_fecha ? new Date(v.programacion_fecha).toLocaleDateString('es-PE') : 'Semanal Activa'}</span>
            </div>
          </div>

          <div class="dotacion-box">
            <div class="dotacion-total">${litros.toLocaleString()} LITROS</div>
            <div class="dotacion-desc">Equivalente a ${m3} m³ de Agua Potable</div>
            <div class="dotacion-formula">
              Fórmula: ${miembros} hab. × ${dotDiaria} L/día × ${dias} días = ${litros} L/semana
            </div>
          </div>

          ${qrUrl ? `
          <div class="qr-section">
            <img src="${qrUrl}" class="qr-img" alt="Código QR" />
            <div class="qr-hint">📲 ESCANEAR CON APP MÓVIL AL ENTREGAR</div>
          </div>
          ` : ''}

          <div class="signatures-box">
            <div class="sig-line">
              Firma / Huella del Beneficiario<br />
              <span style="font-size: 8.5px; color: #94a3b8;">DNI: ${dni}</span>
            </div>
            <div class="sig-line">
              Firma y Sello Conductor<br />
              <span style="font-size: 8.5px; color: #94a3b8;">Camión Cisterna EPS</span>
            </div>
          </div>

          <div class="footer-note">
            DISTRIBUCIÓN 100% GRATUITA • PROHIBIDA SU VENTA O COMERCIALIZACIÓN<br />
            Fiscalizado por SUNASS y Ministerio de Vivienda.
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 200);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Imprimir Lote Masivo de Vales (por Programación o Selección) en formato Cuadrícula A4 para corte
 */
export async function imprimirValesLote(
  vales: ValePrintData[],
  config?: ConfigPrintData,
  tituloLote?: string
) {
  if (!vales || vales.length === 0) return;

  // Abrir la ventana de inmediato en el evento de clic para evitar bloqueo de popups cuando hay 153+ vales
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head><meta charset="UTF-8" /><title>Generando ${vales.length} vales...</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #0369a1;">
        <h2>⏳ Preparando ${vales.length} Vales Oficiales con Código QR...</h2>
        <p>Por favor espere un momento mientras se generan todos los talonarios A4.</p>
      </body>
    </html>
  `);

  const sortedVales = [...vales].sort((a, b) => {
    const secA = (a.sector || a.sector_aahh || '').toUpperCase();
    const secB = (b.sector || b.sector_aahh || '').toUpperCase();
    if (secA !== secB) return secA.localeCompare(secB);
    const nomA = (a.beneficiario_nombre || a.nombres_apellidos || '').toUpperCase();
    const nomB = (b.beneficiario_nombre || b.nombres_apellidos || '').toUpperCase();
    return nomA.localeCompare(nomB);
  });

  const dotDiaria = Number(config?.dotacion_diaria_litros) || 50;
  const dias = Number(config?.dias_entrega_semanal) || 7;
  const dotPorPersona = dotDiaria * dias;

  // Generar QRs para todos en paralelo
  const qrs = await Promise.all(
    sortedVales.map((v) => {
      const dni = v.beneficiario_dni || v.dni || '';
      const rawMiembros = Number(v.num_miembros) || 0;
      const rawLitros = Number(v.litros_sugeridos) || 0;
      const miembros = rawMiembros > 0 ? rawMiembros : (rawLitros > 0 ? Math.max(1, Math.round(rawLitros / dotPorPersona)) : 1);
      const litros = rawLitros > 0 ? rawLitros : (miembros * dotPorPersona);
      const payload = `${v.codigo_unico}|${dni}|${litros}L`;
      return generateQr(payload);
    })
  );

  const renderTicketHtml = (v: ValePrintData, qrUrl: string) => {
    const dni = v.beneficiario_dni || v.dni || 'S/N';
    const nombre = v.beneficiario_nombre || v.nombres_apellidos || 'Beneficiario';
    const sector = v.sector || v.sector_aahh || 'Moyobamba';
    const direccion = v.calle_direccion || v.direccion || '-';
    const rawMiembros = Number(v.num_miembros) || 0;
    const rawLitros = Number(v.litros_sugeridos) || 0;
    const miembros = rawMiembros > 0 ? rawMiembros : (rawLitros > 0 ? Math.max(1, Math.round(rawLitros / dotPorPersona)) : 1);
    const litros = rawLitros > 0 ? rawLitros : (miembros * dotPorPersona);
    const m3 = (litros / 1000).toFixed(2);

    return `
      <div class="vale-ticket">
        <div class="ticket-header">
          <div class="header-top-bar">
            <div class="inst-logo">💧 EPS MOYOBAMBA S.A. ${v.codigo_unico.includes('ANUAL') ? '• VALE ANUAL' : ''}</div>
            <div class="inst-sub">CONVENIO PNSU N° 023-2026/VIVIENDA • DISTRIBUCIÓN DE AGUA POTABLE</div>
          </div>
          <div class="code-row">
            <span class="inst-code">${v.codigo_unico}</span>
            ${v.codigo_unico.includes('ANUAL') ? '<span class="anual-badge">🌟 VÁLIDO TODO EL AÑO</span>' : ''}
          </div>
        </div>

        <div class="ticket-body">
          <div class="ticket-info">
            <div class="titular-box">
              <span class="field-label">TITULAR BENEFICIARIO:</span>
              <div class="titular-name">${nombre}</div>
            </div>

            <div class="badges-row">
              <span class="dni-pill">🪪 <strong>DNI:</strong> ${dni}</span>
              <span class="fam-pill">👥 <strong>FAMILIA:</strong> ${miembros} pers.</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">📍 SECTOR:</span>
              <span class="detail-val sector-val">${sector}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">🏠 DIRECCIÓN:</span>
              <span class="detail-val">${direccion}</span>
            </div>

            <div class="ticket-quota">
              <div class="quota-main">🚰 ${litros.toLocaleString('es-PE')} LITROS</div>
              <div class="quota-sub"><strong>${m3} m³</strong> Semanal • (${miembros} hab. × ${dias} días @ ${dotDiaria} L/día)</div>
            </div>
          </div>

          <div class="ticket-qr">
            <div class="qr-frame">
              ${qrUrl ? `<img src="${qrUrl}" alt="QR" />` : ''}
            </div>
            <div class="qr-text">📲 ESCANEAR APP</div>
          </div>
        </div>

        <div class="ticket-bottom">
          <div class="ticket-signatures">
            <div class="sig-col">
              <div class="sig-space"></div>
              <div class="sig-line">FIRMA / HUELLA BENEFICIARIO</div>
              <div class="sig-sub">DNI: ${dni}</div>
            </div>
            <div class="sig-col">
              <div class="sig-space"></div>
              <div class="sig-line">FIRMA Y SELLO CISTERNA EPS</div>
              <div class="sig-sub">Control de Reparto</div>
            </div>
          </div>

          <div class="ticket-footer">
            DISTRIBUCIÓN 100% GRATUITA • PROHIBIDA SU VENTA O COMERCIALIZACIÓN • FISCALIZADO POR SUNASS
          </div>
        </div>
      </div>
    `;
  };

  // Agrupar exactamente de 4 en 4 vales por cada hoja A4 (2 filas × 2 columnas ocupando toda la hoja)
  const VALES_POR_HOJA = 4;
  const paginasHtml: string[] = [];
  for (let idx = 0; idx < sortedVales.length; idx += VALES_POR_HOJA) {
    const grupo = sortedVales.slice(idx, idx + VALES_POR_HOJA);
    const itemsHtml = grupo
      .map((v, subIdx) => renderTicketHtml(v, qrs[idx + subIdx]))
      .join('');
    paginasHtml.push(`<div class="sheet-page">${itemsHtml}</div>`);
  }

  const totalHojas = Math.ceil(sortedVales.length / VALES_POR_HOJA);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${tituloLote || 'Vales de Consumo - Impresión por Lote (4 por Hoja)'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
            }
            .no-print { display: none !important; }
            .sheet-page {
              height: 284mm !important;
              page-break-after: always;
              break-after: page;
              margin: 0 !important;
              padding: 0 !important;
            }
            .sheet-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .vale-ticket {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #e2e8f0;
            color: #0f172a;
            margin: 0;
            padding: 12px;
          }
          .sheet-page {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 10px;
            width: 100%;
            max-width: 210mm;
            height: 284mm;
            margin: 0 auto 16px auto;
            background: #ffffff;
          }
          .vale-ticket {
            border: 2.5px dashed #0284c7;
            border-radius: 12px;
            padding: 10px 12px;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 100%;
            overflow: hidden;
          }
          .ticket-header {
            text-align: center;
            border-bottom: 2px solid #bae6fd;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .header-top-bar {
            background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
            color: #ffffff;
            padding: 6px 8px;
            border-radius: 8px;
            margin-bottom: 6px;
          }
          .inst-logo {
            font-size: 14px;
            font-weight: 900;
            color: #ffffff;
            letter-spacing: 0.4px;
          }
          .inst-sub {
            font-size: 8.5px;
            color: #e0f2fe;
            font-weight: 800;
            letter-spacing: 0.3px;
            margin-top: 1px;
          }
          .code-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .inst-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 16.5px;
            font-weight: 900;
            color: #0f172a;
            background: #f0f9ff;
            border: 1.5px solid #0284c7;
            display: inline-block;
            padding: 2px 10px;
            border-radius: 6px;
            letter-spacing: 0.8px;
          }
          .anual-badge {
            font-size: 9.5px;
            font-weight: 900;
            color: #065f46;
            background: #d1fae5;
            border: 1.5px solid #10b981;
            padding: 3px 8px;
            border-radius: 6px;
            letter-spacing: 0.3px;
          }
          .ticket-body {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            flex: 1;
            margin: 2px 0;
          }
          .ticket-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 0;
          }
          .titular-box {
            background: #f8fafc;
            border-left: 4px solid #0284c7;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .field-label {
            display: block;
            font-size: 8.5px;
            font-weight: 900;
            color: #0369a1;
            letter-spacing: 0.4px;
          }
          .titular-name {
            font-size: 13.5px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.2;
            margin-top: 1px;
            text-transform: uppercase;
          }
          .badges-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
          .dni-pill {
            background: #eff6ff;
            border: 1px solid #93c5fd;
            color: #1e3a8a;
            font-size: 11.5px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
          }
          .fam-pill {
            background: #f0fdf4;
            border: 1px solid #86efac;
            color: #14532d;
            font-size: 11.5px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
          }
          .detail-row {
            font-size: 11.5px;
            line-height: 1.25;
            display: flex;
            gap: 4px;
            align-items: baseline;
          }
          .detail-label {
            font-weight: 900;
            color: #0369a1;
            font-size: 10.5px;
            white-space: nowrap;
          }
          .detail-val {
            font-weight: 800;
            color: #1e293b;
          }
          .sector-val {
            color: #0f172a;
            font-weight: 900;
            background: #fef3c7;
            border: 1px solid #fcd34d;
            padding: 1px 6px;
            border-radius: 4px;
          }
          .ticket-quota {
            margin-top: 2px;
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
            border: 2px solid #0284c7;
            color: #0369a1;
            padding: 5px 8px;
            border-radius: 8px;
          }
          .quota-main {
            font-size: 16.5px;
            font-weight: 900;
            color: #0c4a6e;
            line-height: 1.1;
          }
          .quota-sub {
            font-size: 10px;
            font-weight: 800;
            color: #0369a1;
            margin-top: 2px;
          }
          .ticket-qr {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 144px;
            flex-shrink: 0;
          }
          .qr-frame {
            border: 2.5px solid #0284c7;
            border-radius: 10px;
            padding: 4px;
            background: #ffffff;
            box-shadow: 0 2px 6px rgba(2, 132, 199, 0.12);
          }
          .ticket-qr img {
            width: 132px;
            height: 132px;
            display: block;
          }
          .qr-text {
            font-size: 9.5px;
            font-weight: 900;
            color: #ffffff;
            background: #0284c7;
            padding: 2px 10px;
            border-radius: 999px;
            margin-top: 5px;
            letter-spacing: 0.4px;
          }
          .ticket-bottom {
            margin-top: 4px;
          }
          .ticket-signatures {
            display: flex;
            justify-content: space-between;
            gap: 14px;
          }
          .sig-col {
            flex: 1;
            text-align: center;
          }
          .sig-space {
            height: 28px;
          }
          .sig-line {
            border-top: 1.5px dashed #334155;
            font-size: 9px;
            color: #0f172a;
            font-weight: 900;
            padding-top: 3px;
            letter-spacing: 0.3px;
          }
          .sig-sub {
            font-size: 8px;
            font-weight: 700;
            color: #475569;
          }
          .ticket-footer {
            text-align: center;
            font-size: 8px;
            font-weight: 800;
            color: #0369a1;
            background: #f0f9ff;
            border-top: 1.5px solid #bae6fd;
            border-radius: 4px;
            margin-top: 5px;
            padding: 3px 4px;
            letter-spacing: 0.2px;
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="background: #0f172a; color: #fff; padding: 12px 18px; border-radius: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; max-width: 210mm; margin-left: auto; margin-right: auto;">
          <div>
            <strong style="font-size: 14px;">🎟️ ${tituloLote || 'Talonario Oficial de Vales de Consumo (4 Vales por Hoja A4)'}</strong>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Total listos para imprimir: <strong>${sortedVales.length} vales</strong> en <strong>${totalHojas} hoja${totalHojas === 1 ? '' : 's'} A4</strong> (4 vales grandes por hoja con QR ampliado)</div>
          </div>
          <button onclick="window.print()" style="background: #0284c7; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 900; cursor: pointer; font-size: 13px;">
            🖨️ Imprimir Ahora (${sortedVales.length})
          </button>
        </div>
        ${paginasHtml.join('')}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 350);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Imprimir un SOLO QR Oficial Colectivo para todo un Sector (Depósito Único / Entrega Grupal por Sector).
 * Al escanear este QR desde la App Móvil, se abre automáticamente la entrega grupal con todos los beneficiarios del sector marcados.
 */
export async function imprimirValeSectorUnico(
  sectorName: string,
  valesSector: ValePrintData[],
  config?: ConfigPrintData
) {
  await imprimirTodosValesSectorUnico(
    [{ sector: sectorName, items: valesSector }],
    config,
    `Vale Colectivo QR Único - Sector ${sectorName}`
  );
}

/**
 * Imprimir Hojas de QR Único por Sector (1 Hoja Oficial A4 por Sector)
 */
export async function imprimirTodosValesSectorUnico(
  sectoresList: { sector: string; items: ValePrintData[] }[],
  config?: ConfigPrintData,
  titulo?: string
) {
  if (!sectoresList || sectoresList.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head><meta charset="UTF-8" /><title>Generando QR Único por Sector...</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #0369a1;">
        <h2>⏳ Generando Cartilla Oficial con QR Único de Sector...</h2>
      </body>
    </html>
  `);

  const dotDiaria = Number(config?.dotacion_diaria_litros) || 50;
  const dias = Number(config?.dias_entrega_semanal) || 7;
  const dotPorPersona = dotDiaria * dias;

  const paginasHtml: string[] = [];

  for (const secGroup of sectoresList) {
    const sectorLimpio = (secGroup.sector || 'SECTOR GENERAL').trim().toUpperCase();
    const items = secGroup.items || [];
    const totalFamilias = items.length;

    let totalHabitantes = 0;
    let totalLitrosSemanal = 0;

    for (const v of items) {
      const rawMiembros = Number(v.num_miembros) || 0;
      const rawLitros = Number(v.litros_sugeridos) || 0;
      const miembros =
        rawMiembros > 0
          ? rawMiembros
          : rawLitros > 0
          ? Math.max(1, Math.round(rawLitros / dotPorPersona))
          : 1;
      const litros = rawLitros > 0 ? rawLitros : miembros * dotPorPersona;
      totalHabitantes += miembros;
      totalLitrosSemanal += litros;
    }

    const totalLitrosDiario = totalHabitantes * dotDiaria;
    const m3Semanal = (totalLitrosSemanal / 1000).toFixed(2);
    const m3Diario = (totalLitrosDiario / 1000).toFixed(2);

    const sectorSlug = sectorLimpio.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const codigoSerieSector = `VALE-SECTOR-2026-${sectorSlug}`;
    // Payload oficial que lee el escáner QR de la App Móvil para activar entrega a todo el sector:
    const qrPayload = `SECTOR-QR|${sectorLimpio}|${totalFamilias}|${totalHabitantes}|${totalLitrosSemanal}L`;
    const qrUrl = await generateQr(qrPayload);

    const previewBeneficiarios = items
      .slice(0, 18)
      .map((b, i) => {
        const nom = b.beneficiario_nombre || b.nombres_apellidos || 'Beneficiario';
        const dni = b.beneficiario_dni || b.dni || '-';
        const hab = Number(b.num_miembros) || 1;
        return `<div class="benef-chip"><strong>${i + 1}.</strong> ${nom} <span class="benef-meta">(DNI: ${dni} • ${hab} hab.)</span></div>`;
      })
      .join('');

    const restantesCount = Math.max(0, items.length - 18);

    paginasHtml.push(`
      <div class="sector-page">
        <div class="sector-card">
          <div class="sector-banner">
            <div class="banner-top">💧 EPS MOYOBAMBA S.A. • PROGRAMA NACIONAL DE SANEAMIENTO URBANO</div>
            <div class="banner-main">CARTILLA OFICIAL DE ENTREGA COLECTIVA POR SECTOR (QR ÚNICO)</div>
            <div class="banner-sub">CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE • ABASTECIMIENTO GRATUITO EN CAMIÓN CISTERNA</div>
          </div>

          <div class="sector-header-box">
            <div>
              <div class="sector-label">📍 SECTOR / ASENTAMIENTO HUMANO HABILITADO:</div>
              <div class="sector-title">${sectorLimpio}</div>
              <div class="sector-code">SERIE COLECTIVA: ${codigoSerieSector}</div>
            </div>
            <div class="anual-pill">
              🌟 QR ÚNICO DEL SECTOR<br/>
              <span>ENTREGA A TODOS LOS BENEFICIARIOS</span>
            </div>
          </div>

          <div class="sector-body-grid">
            <div class="sector-stats-col">
              <div class="kpi-grid">
                <div class="kpi-box kpi-blue">
                  <div class="kpi-label">👨‍👩‍👧‍👦 FAMILIAS EMPADRONADAS</div>
                  <div class="kpi-val">${totalFamilias} Beneficiarios</div>
                  <div class="kpi-sub">Padrón activo del sector</div>
                </div>
                <div class="kpi-box kpi-green">
                  <div class="kpi-label">👥 POBLACIÓN TOTAL</div>
                  <div class="kpi-val">${totalHabitantes} Habitantes</div>
                  <div class="kpi-sub">Dotación: ${dotDiaria} L/hab/día</div>
                </div>
              </div>

              <div class="quota-highlight-box">
                <div class="quota-row">
                  <div>
                    <div class="quota-tag">📅 DOTACIÓN ESTIMADA SEMANAL (${dias} DÍAS)</div>
                    <div class="quota-big">${totalLitrosSemanal.toLocaleString('es-PE')} LITROS</div>
                    <div class="quota-m3">Equivalente a <strong>${m3Semanal} m³</strong> por semana (${totalHabitantes} hab. × ${dotPorPersona} L/sem)</div>
                  </div>
                  <div class="daily-pill">
                    <div class="daily-label">☀️ RACIÓN DIARIA (1/7)</div>
                    <div class="daily-val">${totalLitrosDiario.toLocaleString('es-PE')} L / día</div>
                    <div class="daily-sub">(${m3Diario} m³ diarios)</div>
                  </div>
                </div>
              </div>

              <div class="instructions-box">
                <div class="inst-title">📲 ¿CÓMO FUNCIONA ESTE QR ÚNICO EN CAMPO?</div>
                <ol class="inst-list">
                  <li>Al escanear este <strong>QR Único</strong> con la App Móvil <strong>AguaTrack</strong>, se seleccionan automáticamente los <strong>${totalFamilias} beneficiarios del sector ${sectorLimpio}</strong>.</li>
                  <li>El operador ingresa el volumen total descargado en el depósito comunal del día (con opción de desmarcar algún caso especial si no recibió).</li>
                  <li>El sistema divide automáticamente los litros entregados entre los beneficiarios marcados y actualiza el saldo restante de la semana.</li>
                </ol>
              </div>
            </div>

            <div class="sector-qr-col">
              <div class="qr-giant-frame">
                ${qrUrl ? `<img src="${qrUrl}" alt="QR Sector ${sectorLimpio}" />` : ''}
              </div>
              <div class="qr-scan-badge">📲 ESCANEAR CON APP AGUATRACK</div>
              <div class="qr-sector-caption">ENTREGA MASIVA: ${sectorLimpio}</div>
            </div>
          </div>

          <div class="padron-preview-box">
            <div class="padron-preview-title">
              📋 BENEFICIARIOS INCLUIDOS AUTOMÁTICAMENTE AL ESCANEAR ESTE QR (${totalFamilias} TITULARES):
            </div>
            <div class="benef-chips-grid">
              ${previewBeneficiarios}
              ${restantesCount > 0 ? `<div class="benef-chip benef-more">+ ${restantesCount} beneficiarios adicionales empadronados en ${sectorLimpio}</div>` : ''}
            </div>
          </div>

          <div class="sector-signatures">
            <div class="sig-block">
              <div class="sig-space"></div>
              <div class="sig-line">FIRMA Y SELLO DIRIGENTE / REPRESENTANTE DEL SECTOR</div>
              <div class="sig-sub">Sector: ${sectorLimpio} (${totalFamilias} Familias)</div>
            </div>
            <div class="sig-block">
              <div class="sig-space"></div>
              <div class="sig-line">FIRMA Y SELLO CONDUCTOR / GESTOR DE ENTREGA EPS</div>
              <div class="sig-sub">EPS Moyobamba S.A. • Control de Cisterna</div>
            </div>
          </div>

          <div class="sector-footer">
            DISTRIBUCIÓN 100% GRATUITA • PROHIBIDA SU VENTA • FISCALIZADO POR SUNASS Y MINISTERIO DE VIVIENDA (PNSU)
          </div>
        </div>
      </div>
    `);
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${titulo || 'QR Único por Sector - EPS Moyobamba'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
            }
            .no-print { display: none !important; }
            .sector-page {
              page-break-after: always;
              break-after: page;
              margin: 0 !important;
            }
            .sector-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #e2e8f0;
            color: #0f172a;
            margin: 0;
            padding: 14px;
          }
          .sector-page {
            max-width: 210mm;
            margin: 0 auto 18px auto;
            background: #ffffff;
          }
          .sector-card {
            border: 3px solid #0284c7;
            border-radius: 16px;
            padding: 18px 20px;
            background: #ffffff;
          }
          .sector-banner {
            background: linear-gradient(135deg, #0c4a6e 0%, #0284c7 100%);
            color: #ffffff;
            text-align: center;
            padding: 14px 16px;
            border-radius: 12px;
            margin-bottom: 14px;
          }
          .banner-top {
            font-size: 11px;
            font-weight: 900;
            color: #bae6fd;
            letter-spacing: 0.6px;
          }
          .banner-main {
            font-size: 19px;
            font-weight: 900;
            color: #ffffff;
            margin-top: 3px;
            letter-spacing: 0.4px;
          }
          .banner-sub {
            font-size: 10px;
            font-weight: 800;
            color: #e0f2fe;
            margin-top: 4px;
          }
          .sector-header-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f0f9ff;
            border: 2px solid #0284c7;
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 14px;
            gap: 12px;
          }
          .sector-label {
            font-size: 10.5px;
            font-weight: 900;
            color: #0369a1;
            letter-spacing: 0.4px;
          }
          .sector-title {
            font-size: 26px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.1;
            margin-top: 2px;
          }
          .sector-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
            font-weight: 900;
            color: #0369a1;
            margin-top: 4px;
          }
          .anual-pill {
            background: #dcfce7;
            border: 2px solid #16a34a;
            color: #14532d;
            font-size: 12px;
            font-weight: 900;
            padding: 8px 14px;
            border-radius: 10px;
            text-align: center;
          }
          .anual-pill span {
            display: block;
            font-size: 9.5px;
            color: #15803d;
            margin-top: 2px;
          }
          .sector-body-grid {
            display: flex;
            gap: 18px;
            align-items: stretch;
            margin-bottom: 14px;
          }
          .sector-stats-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .kpi-box {
            padding: 10px 12px;
            border-radius: 10px;
          }
          .kpi-blue {
            background: #eff6ff;
            border: 1.5px solid #93c5fd;
          }
          .kpi-green {
            background: #f0fdf4;
            border: 1.5px solid #86efac;
          }
          .kpi-label {
            font-size: 10px;
            font-weight: 900;
            color: #1e3a8a;
          }
          .kpi-green .kpi-label {
            color: #14532d;
          }
          .kpi-val {
            font-size: 20px;
            font-weight: 900;
            color: #0f172a;
            margin-top: 2px;
          }
          .kpi-sub {
            font-size: 10.5px;
            font-weight: 700;
            color: #475569;
          }
          .quota-highlight-box {
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
            border: 2px solid #0284c7;
            border-radius: 12px;
            padding: 12px 14px;
          }
          .quota-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
          }
          .quota-tag {
            font-size: 10.5px;
            font-weight: 900;
            color: #0369a1;
          }
          .quota-big {
            font-size: 26px;
            font-weight: 900;
            color: #0c4a6e;
            line-height: 1.1;
            margin-top: 2px;
          }
          .quota-m3 {
            font-size: 11.5px;
            font-weight: 800;
            color: #0369a1;
            margin-top: 3px;
          }
          .daily-pill {
            background: #ffffff;
            border: 1.5px solid #0284c7;
            border-radius: 10px;
            padding: 8px 12px;
            text-align: center;
            flex-shrink: 0;
          }
          .daily-label {
            font-size: 9px;
            font-weight: 900;
            color: #0369a1;
          }
          .daily-val {
            font-size: 15px;
            font-weight: 900;
            color: #0f172a;
            margin-top: 2px;
          }
          .daily-sub {
            font-size: 9.5px;
            font-weight: 700;
            color: #64748b;
          }
          .instructions-box {
            background: #fffbeb;
            border: 1.5px solid #fcd34d;
            border-radius: 10px;
            padding: 10px 14px;
          }
          .inst-title {
            font-size: 11px;
            font-weight: 900;
            color: #92400e;
            margin-bottom: 4px;
          }
          .inst-list {
            margin: 0;
            padding-left: 16px;
            font-size: 11px;
            color: #78350f;
            font-weight: 600;
            line-height: 1.4;
          }
          .inst-list li {
            margin-bottom: 3px;
          }
          .sector-qr-col {
            width: 265px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            border: 2.5px dashed #0284c7;
            border-radius: 14px;
            padding: 12px;
          }
          .qr-giant-frame {
            background: #ffffff;
            border: 3px solid #0284c7;
            border-radius: 12px;
            padding: 6px;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);
          }
          .qr-giant-frame img {
            width: 225px;
            height: 225px;
            display: block;
          }
          .qr-scan-badge {
            background: #0284c7;
            color: #ffffff;
            font-size: 11px;
            font-weight: 900;
            padding: 5px 14px;
            border-radius: 999px;
            margin-top: 8px;
            letter-spacing: 0.4px;
          }
          .qr-sector-caption {
            font-size: 10.5px;
            font-weight: 900;
            color: #0f172a;
            margin-top: 4px;
            text-align: center;
          }
          .padron-preview-box {
            background: #f8fafc;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 14px;
          }
          .padron-preview-title {
            font-size: 10.5px;
            font-weight: 900;
            color: #334155;
            margin-bottom: 6px;
          }
          .benef-chips-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 10px;
          }
          .benef-chip {
            font-size: 10px;
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 2px 0;
            border-bottom: 1px dotted #e2e8f0;
          }
          .benef-meta {
            color: #475569;
            font-weight: 600;
          }
          .benef-more {
            color: #0284c7;
            font-weight: 900;
          }
          .sector-signatures {
            display: flex;
            gap: 24px;
            margin-top: 12px;
            margin-bottom: 12px;
          }
          .sig-block {
            flex: 1;
            text-align: center;
          }
          .sig-space {
            height: 42px;
          }
          .sig-line {
            border-top: 1.5px dashed #334155;
            padding-top: 5px;
            font-size: 10.5px;
            font-weight: 900;
            color: #0f172a;
          }
          .sig-sub {
            font-size: 9.5px;
            font-weight: 700;
            color: #64748b;
            margin-top: 2px;
          }
          .sector-footer {
            text-align: center;
            background: #f0f9ff;
            border: 1.5px solid #bae6fd;
            color: #0369a1;
            font-size: 9.5px;
            font-weight: 900;
            padding: 6px;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="background: #0f172a; color: #fff; padding: 12px 18px; border-radius: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; max-width: 210mm; margin-left: auto; margin-right: auto;">
          <div>
            <strong style="font-size: 14px;">📲 ${titulo || 'Cartilla Oficial con QR Único por Sector'}</strong>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Al escanear este QR en la App Móvil se seleccionan todos los beneficiarios del sector para entrega grupal.</div>
          </div>
          <button onclick="window.print()" style="background: #16a34a; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 900; cursor: pointer; font-size: 13px;">
            🖨️ Imprimir QR de Sector (${sectoresList.length})
          </button>
        </div>
        ${paginasHtml.join('')}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 350);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
