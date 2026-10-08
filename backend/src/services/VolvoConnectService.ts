import axios from 'axios';
import { query } from '../db';

interface VolvoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface VolvoVehiclePosition {
  vin: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  heading?: number;
  speedKilometersPerHour?: number;
  timestamp: string;
  odometerKilometers?: number;
  fuelLevelPercent?: number;
  ignitionState?: 'ON' | 'OFF' | 'RUNNING';
}

class VolvoConnectService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private intervalTimer: NodeJS.Timeout | null = null;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;

  public isEnabled(): boolean {
    return process.env.VOLVO_CONNECT_ENABLED === 'true';
  }

  public getStatus() {
    return {
      enabled: this.isEnabled(),
      hasCredentials: Boolean(
        process.env.VOLVO_CONNECT_CLIENT_ID && process.env.VOLVO_CONNECT_CLIENT_SECRET
      ),
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      authUrl: process.env.VOLVO_CONNECT_AUTH_URL || 'https://identity.volvogroup.com/oauth2/token',
      apiUrl: process.env.VOLVO_CONNECT_API_URL || 'https://api.volvotrucks.com/rfms/v2',
    };
  }

  /**
   * Obtener Token de Acceso OAuth2 desde el Servicio de Identidad de Volvo Group
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const clientId = process.env.VOLVO_CONNECT_CLIENT_ID;
    const clientSecret = process.env.VOLVO_CONNECT_CLIENT_SECRET;
    const authUrl =
      process.env.VOLVO_CONNECT_AUTH_URL || 'https://identity.volvogroup.com/oauth2/token';

    if (!clientId || !clientSecret) {
      throw new Error(
        'Credenciales de Volvo Connect no configuradas. Defina VOLVO_CONNECT_CLIENT_ID y VOLVO_CONNECT_CLIENT_SECRET en .env'
      );
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'rfms:positions:read');

    const response = await axios.post<VolvoTokenResponse>(authUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
    return this.accessToken;
  }

  /**
   * Consultar posiciones de la flota mediante la API de Volvo Connect / rFMS
   */
  public async fetchFleetPositions(): Promise<VolvoVehiclePosition[]> {
    const token = await this.getAccessToken();
    const apiUrl =
      process.env.VOLVO_CONNECT_API_URL || 'https://api.volvotrucks.com/rfms/v2';
    const apiKey = process.env.VOLVO_CONNECT_API_KEY;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Endpoint estándar rFMS v2 para vehículos Volvo Trucks
    const response = await axios.get(`${apiUrl}/vehicles/positions`, {
      headers,
      timeout: 15000,
    });

    const items = Array.isArray(response.data) ? response.data : response.data?.positions || [];
    return items.map((p: any) => ({
      vin: p.vin || p.vehicleIdentificationNumber,
      latitude: Number(p.latitude || p.position?.latitude),
      longitude: Number(p.longitude || p.position?.longitude),
      altitude: p.altitude || p.position?.altitude,
      heading: p.heading || p.position?.heading,
      speedKilometersPerHour: p.speed || p.wheelBasedSpeed,
      timestamp: p.timestamp || p.createdDateTime || new Date().toISOString(),
      odometerKilometers: p.totalDistance ? p.totalDistance / 1000 : undefined,
      fuelLevelPercent: p.fuelLevel,
      ignitionState: p.engineStatus || (p.ignition ? 'ON' : 'OFF'),
    }));
  }

  /**
   * Sincronizar coordenadas en la base de datos de AguaTrack
   */
  public async syncWithDatabase(): Promise<{
    updatedCount: number;
    details: Array<{ placa: string; lat: number; lng: number }>;
  }> {
    if (!this.isEnabled()) {
      return { updatedCount: 0, details: [] };
    }

    try {
      const positions = await this.fetchFleetPositions();
      const updatedDetails: Array<{ placa: string; lat: number; lng: number }> = [];

      for (const pos of positions) {
        if (!pos.latitude || !pos.longitude || isNaN(pos.latitude) || isNaN(pos.longitude)) {
          continue;
        }

        // Buscar cisterna por VIN o por placa vinculada
        const result = await query(
          `UPDATE cisternas
           SET latitud_actual = $1,
               longitud_actual = $2,
               ultima_actualizacion_gps = $3,
               enlace_gps_tracking = COALESCE(enlace_gps_tracking, 'https://volvoconnect.com/')
           WHERE codigo_gps = $4 OR placa = $4 OR marca_modelo ILIKE '%Volvo%'
           RETURNING id, placa;`,
          [pos.latitude, pos.longitude, pos.timestamp, pos.vin]
        );

        if (result.rows.length > 0) {
          updatedDetails.push({
            placa: result.rows[0].placa,
            lat: pos.latitude,
            lng: pos.longitude,
          });
        }
      }

      this.lastSyncTime = new Date().toISOString();
      this.lastError = null;
      console.log(`📡 [Volvo Connect] Sincronización exitosa: ${updatedDetails.length} vehículos actualizados.`);
      return { updatedCount: updatedDetails.length, details: updatedDetails };
    } catch (err: any) {
      this.lastError = err.message || 'Error en sincronización con Volvo Connect';
      console.warn('⚠️ [Volvo Connect] Error de sincronización:', this.lastError);
      throw err;
    }
  }

  /**
   * Iniciar temporizador de sincronización en segundo plano (Cron ligero)
   */
  public startBackgroundSync(intervalMs = 120000) {
    if (!this.isEnabled()) {
      console.log('ℹ️ [Volvo Connect] Integración deshabilitada en configuración (.env).');
      return;
    }

    console.log(`🛰️ [Volvo Connect] Demonio de telemetría activo (Frecuencia: ${intervalMs / 1000}s).`);
    
    // Ejecutar primera sincronización con tolerancia
    this.syncWithDatabase().catch(() => {});

    // Temporizador continuo
    this.intervalTimer = setInterval(() => {
      this.syncWithDatabase().catch(() => {});
    }, intervalMs);
  }

  public stopBackgroundSync() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const volvoConnectService = new VolvoConnectService();
export default volvoConnectService;
