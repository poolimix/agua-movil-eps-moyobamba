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
 * Genera el QR como Data URL en base64
 */
async function generateQr(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
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
  const miembros = Number(v.num_miembros) || 1;
  const litros = Number(v.litros_sugeridos) || (miembros * 350);
  const m3 = (litros / 1000).toFixed(2);
  const dotDiaria = config?.dotacion_diaria_litros || 50;
  const dias = config?.dias_entrega_semanal || 7;
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
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            max-width: 480px;
            margin: 0 auto;
            padding: 20px;
          }
          .vale-card {
            border: 2px solid #0284c7;
            border-radius: 12px;
            padding: 20px;
            background: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
            position: relative;
          }
          .header-banner {
            text-align: center;
            border-bottom: 2px dashed #0284c7;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }
          .institution {
            font-size: 16px;
            font-weight: 900;
            color: #0284c7;
            letter-spacing: 0.5px;
          }
          .sub-institution {
            font-size: 10px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .convenio {
            font-size: 9.5px;
            font-weight: 600;
            color: #0369a1;
            background: #e0f2fe;
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            margin-top: 4px;
          }
          .serie-box {
            background: #f8fafc;
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
            margin-bottom: 14px;
          }
          .serie-title {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .serie-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 22px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 2px;
          }
          .info-grid {
            margin-bottom: 14px;
            font-size: 12px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px dotted #e2e8f0;
          }
          .info-label {
            color: #64748b;
            font-weight: 600;
          }
          .info-value {
            color: #0f172a;
            font-weight: 700;
            text-align: right;
            max-width: 60%;
          }
          .dotacion-box {
            background: linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%);
            border: 1.5px solid #7dd3fc;
            border-radius: 10px;
            padding: 12px;
            text-align: center;
            margin-bottom: 14px;
          }
          .dotacion-total {
            font-size: 26px;
            font-weight: 900;
            color: #0369a1;
            line-height: 1.1;
          }
          .dotacion-desc {
            font-size: 11px;
            font-weight: 700;
            color: #0284c7;
            margin-top: 4px;
          }
          .dotacion-formula {
            font-size: 10px;
            color: #475569;
            margin-top: 2px;
          }
          .qr-section {
            text-align: center;
            margin-bottom: 14px;
            padding: 8px 0;
          }
          .qr-img {
            width: 140px;
            height: 140px;
            display: block;
            margin: 0 auto;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 4px;
            background: #fff;
          }
          .qr-hint {
            font-size: 9.5px;
            font-weight: 800;
            color: #0369a1;
            margin-top: 4px;
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
            <div class="serie-title">Vale Oficial de Consumo de Agua</div>
            <div class="serie-code">${v.codigo_unico}</div>
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

  const dotDiaria = config?.dotacion_diaria_litros || 50;
  const dias = config?.dias_entrega_semanal || 7;

  // Generar QRs para todos en paralelo
  const qrs = await Promise.all(
    vales.map((v) => {
      const dni = v.beneficiario_dni || v.dni || '';
      const litros = Number(v.litros_sugeridos) || 350;
      const payload = `${v.codigo_unico}|${dni}|${litros}L`;
      return generateQr(payload);
    })
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const valesHtml = vales.map((v, i) => {
    const dni = v.beneficiario_dni || v.dni || 'S/N';
    const nombre = v.beneficiario_nombre || v.nombres_apellidos || 'Beneficiario';
    const sector = v.sector || v.sector_aahh || 'Moyobamba';
    const direccion = v.calle_direccion || v.direccion || '-';
    const miembros = Number(v.num_miembros) || 1;
    const litros = Number(v.litros_sugeridos) || (miembros * 350);
    const m3 = (litros / 1000).toFixed(2);
    const qrUrl = qrs[i];

    return `
      <div class="vale-ticket">
        <div class="ticket-header">
          <div class="inst-logo">💧 EPS MOYOBAMBA S.A.</div>
          <div class="inst-sub">Convenio PNSU N° 023-2026/VIVIENDA</div>
          <div class="inst-code">${v.codigo_unico}</div>
        </div>

        <div class="ticket-body">
          <div class="ticket-info">
            <div><strong>Titular:</strong> ${nombre}</div>
            <div><strong>DNI:</strong> ${dni} • <strong>Fam:</strong> ${miembros} pers.</div>
            <div><strong>Sector:</strong> ${sector}</div>
            <div><strong>Dir:</strong> ${direccion}</div>
            <div class="ticket-quota">
              <strong>${litros.toLocaleString()} L</strong> (${m3} m³ • ${dias} días @ ${dotDiaria}L/d)
            </div>
          </div>

          <div class="ticket-qr">
            ${qrUrl ? `<img src="${qrUrl}" alt="QR" />` : ''}
            <div class="qr-text">Escanear App</div>
          </div>
        </div>

        <div class="ticket-signatures">
          <div class="sig-col">Firma Beneficiario</div>
          <div class="sig-col">Sello Cisterna EPS</div>
        </div>

        <div class="ticket-footer">
          Distribución Gratuita • Prohibida su Venta
        </div>
      </div>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${tituloLote || 'Vales de Consumo - Impresión por Lote'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          @media print {
            body { margin: 0; padding: 0; background: #fff; }
            .no-print { display: none !important; }
            .vale-ticket { page-break-inside: avoid; break-inside: avoid; }
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 10px;
          }
          .grid-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .vale-ticket {
            border: 2px dashed #0284c7;
            border-radius: 8px;
            padding: 10px 12px;
            background: #ffffff;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            min-height: 250px;
          }
          .ticket-header {
            text-align: center;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .inst-logo {
            font-size: 12px;
            font-weight: 900;
            color: #0284c7;
          }
          .inst-sub {
            font-size: 8.5px;
            color: #64748b;
            font-weight: 600;
          }
          .inst-code {
            font-family: monospace;
            font-size: 14px;
            font-weight: 900;
            color: #0f172a;
            background: #f1f5f9;
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            margin-top: 2px;
          }
          .ticket-body {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin: 4px 0;
          }
          .ticket-info {
            flex: 1;
            line-height: 1.4;
            font-size: 10.5px;
          }
          .ticket-quota {
            margin-top: 4px;
            background: #e0f2fe;
            color: #0369a1;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 11.5px;
          }
          .ticket-qr {
            text-align: center;
            width: 75px;
          }
          .ticket-qr img {
            width: 70px;
            height: 70px;
            display: block;
            margin: 0 auto;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
          }
          .qr-text {
            font-size: 7.5px;
            font-weight: 700;
            color: #64748b;
            margin-top: 2px;
          }
          .ticket-signatures {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin-top: 8px;
            padding-top: 6px;
          }
          .sig-col {
            flex: 1;
            text-align: center;
            border-top: 1px dashed #94a3b8;
            font-size: 8px;
            color: #64748b;
            font-weight: 600;
            padding-top: 2px;
          }
          .ticket-footer {
            text-align: center;
            font-size: 7.5px;
            color: #94a3b8;
            border-top: 1px dotted #e2e8f0;
            margin-top: 6px;
            padding-top: 3px;
          }
        </style>
      </head>
      <body>
        <div class="grid-container">
          ${valesHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
