import axios from 'axios';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

export interface DispatchNotificationPayload {
  beneficiario: {
    nombres_apellidos: string;
    dni: string;
    telefono?: string | null;
    email?: string | null;
    sector?: string | null;
  };
  codigo_unico: string;
  fecha_programada: string;
  litros: number | string;
  qr_data?: string;
}

export interface ChannelResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DispatchResult {
  whatsapp: ChannelResult;
  sms: ChannelResult;
  email: ChannelResult;
  qr_buffer?: Buffer;
}

export class MultichannelNotificationService {
  /**
   * Generates a high resolution PNG QR Buffer
   */
  public static async generateQrBuffer(qrContent: string): Promise<Buffer> {
    return await QRCode.toBuffer(qrContent, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  }

  /**
   * 1. WhatsApp Cloud API (Meta Oficial)
   */
  public static async sendWhatsApp(
    payload: DispatchNotificationPayload,
    qrBuffer: Buffer
  ): Promise<ChannelResult> {
    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WA_ACCESS_TOKEN;
    const rawPhone = payload.beneficiario.telefono?.replace(/\D/g, '');

    if (!rawPhone || rawPhone.length < 8) {
      return { success: false, error: 'Teléfono no registrado o inválido para WhatsApp' };
    }

    // Format to international (Peru +51 if 9 digits)
    const toPhone = rawPhone.length === 9 ? `51${rawPhone}` : rawPhone;

    // Check if Meta credentials exist in environment
    if (!phoneNumberId || !accessToken || accessToken.includes('your_')) {
      console.log(`[WhatsApp SIMULADO] Enviar a +${toPhone} | Vale: ${payload.codigo_unico} (${payload.litros}L)`);
      return {
        success: true,
        messageId: `wamid.simulated.${Date.now()}`,
        error: undefined,
      };
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: `💧 *EPS MOYOBAMBA - PROGRAMA AGUA MÓVIL*\n\nHola *${payload.beneficiario.nombres_apellidos}*, se ha emitido su vale oficial de abastecimiento de agua potable.\n\n📅 *Fecha Programada:* ${payload.fecha_programada}\n🎟️ *Código Único:* *${payload.codigo_unico}*\n🚰 *Dotación Asignada:* ${payload.litros} Litros\n📍 *Sector:* ${payload.beneficiario.sector || 'Moyobamba'}\n\n_Muestre este código al conductor de la cisterna al momento del reparto._`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id || 'wamid.ok',
      };
    } catch (error: any) {
      const errDetail = error.response?.data?.error?.message || error.message;
      console.error('Error Meta WhatsApp API:', errDetail);
      return {
        success: false,
        error: `Meta WA Error: ${errDetail}`,
      };
    }
  }

  /**
   * 2. SMS Gateway (Twilio / Standard SMS)
   */
  public static async sendSms(payload: DispatchNotificationPayload): Promise<ChannelResult> {
    const rawPhone = payload.beneficiario.telefono?.replace(/\D/g, '');

    if (!rawPhone || rawPhone.length < 8) {
      return { success: false, error: 'Teléfono no registrado para SMS' };
    }

    const toPhone = rawPhone.length === 9 ? `+51${rawPhone}` : `+${rawPhone}`;
    const messageBody = `EPS Moyobamba: Su codigo de agua para el ${payload.fecha_programada} es: ${payload.codigo_unico} (${payload.litros}L). Muestre este codigo al camion.`;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || accountSid.includes('your_')) {
      console.log(`[SMS SIMULADO] Enviar a ${toPhone}: "${messageBody}"`);
      return {
        success: true,
        messageId: `sms.simulated.${Date.now()}`,
      };
    }

    try {
      // Basic Twilio REST API request via Axios
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('To', toPhone);
      params.append('From', fromPhone || '');
      params.append('Body', messageBody);

      const response = await axios.post(twilioUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        timeout: 10000,
      });

      return {
        success: true,
        messageId: response.data.sid,
      };
    } catch (error: any) {
      const errDetail = error.response?.data?.message || error.message;
      console.error('Error SMS Gateway:', errDetail);
      return {
        success: false,
        error: `SMS Error: ${errDetail}`,
      };
    }
  }

  /**
   * 3. Correo Electrónico Corporativo (Nodemailer)
   */
  public static async sendEmail(
    payload: DispatchNotificationPayload,
    qrBuffer: Buffer
  ): Promise<ChannelResult> {
    const toEmail = payload.beneficiario.email?.trim();

    if (!toEmail || !toEmail.includes('@')) {
      return { success: false, error: 'Correo no registrado o inválido' };
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';
    const from = process.env.SMTP_FROM || '"EPS Moyobamba - Agua Móvil" <notificaciones@epsmoyobamba.gob.pe>';

    if (!host || !user || !pass || host.includes('smtp.example.com')) {
      console.log(`[EMAIL SIMULADO] Enviar a ${toEmail} | Vale: ${payload.codigo_unico}`);
      return {
        success: true,
        messageId: `email.simulated.${Date.now()}`,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
            .header { background: #0284c7; padding: 24px; text-align: center; color: #ffffff; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
            .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
            .body { padding: 24px; color: #1e293b; }
            .code-box { background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0; }
            .code-title { font-size: 12px; color: #166534; text-transform: uppercase; font-weight: 700; }
            .code-val { font-size: 26px; font-weight: 800; color: #15803d; letter-spacing: 2px; margin: 6px 0; }
            .qr-container { text-align: center; margin: 16px 0; }
            .qr-img { width: 180px; height: 180px; border-radius: 8px; border: 1px solid #cbd5e1; }
            .info-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 8px 0; font-size: 14px; }
            .info-label { color: #64748b; font-weight: 600; }
            .info-val { font-weight: 700; color: #0f172a; }
            .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>💧 EPS MOYOBAMBA S.A.</h1>
              <p>Programa Oficial de Distribución Gratuita "Agua Móvil"</p>
            </div>
            <div class="body">
              <p>Estimado(a) <strong>${payload.beneficiario.nombres_apellidos}</strong>,</p>
              <p>Se ha emitido su vale de abastecimiento correspondiente a la programación de reparto.</p>
              
              <div class="code-box">
                <div class="code-title">Código Único de Canje</div>
                <div class="code-val">${payload.codigo_unico}</div>
                <small style="color: #166534;">Presente este código o el código QR al camión cisterna</small>
              </div>

              <div class="qr-container">
                <img src="cid:qrcode_vale" alt="Código QR Vale" class="qr-img" />
              </div>

              <div class="info-row">
                <span class="info-label">Fecha Programada:</span>
                <span class="info-val">${payload.fecha_programada}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Dotación de Agua:</span>
                <span class="info-val">${payload.litros} Litros</span>
              </div>
              <div class="info-row">
                <span class="info-label">Sector / AA.HH:</span>
                <span class="info-val">${payload.beneficiario.sector || 'Moyobamba'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">DNI Titular:</span>
                <span class="info-val">${payload.beneficiario.dni}</span>
              </div>
            </div>
            <div class="footer">
              EPS Moyobamba S.A. • Gerencia de Operaciones • Moyobamba, San Martín
            </div>
          </div>
        </body>
        </html>
      `;

      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `💧 Vale de Agua Móvil: ${payload.codigo_unico} (${payload.litros}L) - EPS Moyobamba`,
        html: htmlContent,
        attachments: [
          {
            filename: `vale_${payload.codigo_unico}.png`,
            content: qrBuffer,
            cid: 'qrcode_vale',
          },
        ],
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error('Error Nodemailer SMTP:', error);
      return {
        success: false,
        error: `Email Error: ${error.message}`,
      };
    }
  }

  /**
   * Dispatch simultaneously to all 3 channels in parallel using Promise.allSettled
   */
  public static async dispatchAll(
    payload: DispatchNotificationPayload,
    options: {
      retryOnlyFailed?: boolean;
      channels?: { whatsapp?: boolean; sms?: boolean; email?: boolean };
    } = {}
  ): Promise<DispatchResult> {
    const qrContent = payload.qr_data || `${payload.codigo_unico}|${payload.beneficiario.dni}|${payload.litros}L`;
    const qrBuffer = await this.generateQrBuffer(qrContent);

    const sendWA = options.channels?.whatsapp !== false;
    const sendSMS = options.channels?.sms !== false;
    const sendEmail = options.channels?.email !== false;

    const [waSettled, smsSettled, emailSettled] = await Promise.allSettled([
      sendWA
        ? this.sendWhatsApp(payload, qrBuffer)
        : Promise.resolve({ success: false, error: 'Canal omitido' }),
      sendSMS
        ? this.sendSms(payload)
        : Promise.resolve({ success: false, error: 'Canal omitido' }),
      sendEmail
        ? this.sendEmail(payload, qrBuffer)
        : Promise.resolve({ success: false, error: 'Canal omitido' }),
    ]);

    const whatsappResult: ChannelResult =
      waSettled.status === 'fulfilled'
        ? waSettled.value
        : { success: false, error: waSettled.reason?.message || 'Fallo inesperado WA' };

    const smsResult: ChannelResult =
      smsSettled.status === 'fulfilled'
        ? smsSettled.value
        : { success: false, error: smsSettled.reason?.message || 'Fallo inesperado SMS' };

    const emailResult: ChannelResult =
      emailSettled.status === 'fulfilled'
        ? emailSettled.value
        : { success: false, error: emailSettled.reason?.message || 'Fallo inesperado Email' };

    return {
      whatsapp: whatsappResult,
      sms: smsResult,
      email: emailResult,
      qr_buffer: qrBuffer,
    };
  }
}
