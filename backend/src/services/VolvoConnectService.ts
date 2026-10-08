import axios from 'axios';
import { query } from '../db';

interface VolvoVehicleInfo {
  vin: string;
  name: string;
  brand: string;
  model: string;
  emissionLevel?: string;
  type?: string;
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
  private intervalTimer: NodeJS.Timeout | null = null;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private cachedVehicles: VolvoVehicleInfo[] = [];

  public isEnabled(): boolean {
    return process.env.VOLVO_CONNECT_ENABLED === 'true';
  }

  public getCredentials() {
    return {
      clientId: process.env.VOLVO_CONNECT_CLIENT_ID || '',
      clientSecret: process.env.VOLVO_CONNECT_CLIENT_SECRET || '',
      baseUrl: (process.env.VOLVO_CONNECT_API_URL || 'https://api.volvotrucks.com/rfms').replace(/\/+$/, ''),
    };
  }

  public getStatus() {
    const creds = this.getCredentials();
    return {
      enabled: this.isEnabled(),
      hasCredentials: Boolean(creds.clientId && creds.clientSecret),
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      apiUrl: creds.baseUrl,
      vehiclesDiscovered: this.cachedVehicles.length,
      vehicles: this.cachedVehicles,
    };
  }

  /**
   * Generar cabecera de autenticación HTTP Basic (Estándar rFMS v2.1 de Volvo Trucks)
   */
  private getAuthHeaders(acceptContentType: string) {
    const { clientId, clientSecret } = this.getCredentials();
    if (!clientId || !clientSecret) {
      throw new Error('Credenciales de Volvo Connect no configuradas (CLIENT_ID y CLIENT_SECRET requeridos).');
    }

    const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      Accept: acceptContentType,
      'User-Agent': 'AguaTrack-EPS-Moyobamba/1.0',
    };
  }

  /**
   * Consultar lista de camiones registrados en Volvo Connect / rFMS
   */
  public async fetchVehicles(): Promise<VolvoVehicleInfo[]> {
    const { baseUrl } = this.getCredentials();
    const headers = this.getAuthHeaders('application/vnd.fmsstandard.com.vehicles.v2.1+json');

    const res = await axios.get(`${baseUrl}/vehicles`, {
      headers,
      timeout: 10000,
    });

    const rawList = res.data?.Vehicle || [];
    this.cachedVehicles = rawList.map((v: any) => ({
      vin: v.VIN,
      name: v.CustomerVehicleName || v.VIN,
      brand: v.Brand || 'VOLVO TRUCKS',
      model: v.Model ? `VOLVO ${v.Model}` : 'VOLVO TRUCK',
      emissionLevel: v.EmissionLevel,
      type: v.Type,
    }));

    return this.cachedVehicles;
  }

  /**
   * Consultar posiciones satelitales GPS recientes de la flota
   */
  public async fetchFleetPositions(): Promise<VolvoVehiclePosition[]> {
    const { baseUrl } = this.getCredentials();
    const headers = this.getAuthHeaders('application/vnd.fmsstandard.com.vehiclepositions.v2.1+json');

    try {
      const res = await axios.get(`${baseUrl}/vehiclepositions?latestOnly=true`, {
        headers,
        timeout: 12000,
      });

      const positions = res.data?.VehiclePosition || [];
      return positions.map((p: any) => {
        const pos = p.Position || p;
        return {
          vin: p.VIN,
          latitude: Number(pos.Latitude || pos.latitude),
          longitude: Number(pos.Longitude || pos.longitude),
          altitude: pos.Altitude || pos.altitude,
          heading: pos.Heading || pos.heading,
          speedKilometersPerHour: pos.WheelBasedSpeed || pos.speed,
          timestamp: p.TriggerDateTime || pos.PositionDateTime || new Date().toISOString(),
          odometerKilometers: p.TotalDistance ? Number(p.TotalDistance) / 1000 : undefined,
          fuelLevelPercent: p.FuelLevel1,
          ignitionState: p.EngineStatus === 'RUNNING' ? 'RUNNING' : 'OFF',
        };
      });
    } catch (err: any) {
      // Si Volvo rFMS devuelve 404 o no hay posiciones activas en este instante
      if (err.response?.status === 404 || err.response?.status === 204) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Sincronizar flota y coordenadas satelitales con PostgreSQL de AguaTrack
   */
  public async syncWithDatabase(): Promise<{
    vehiclesSynced: number;
    positionsUpdated: number;
    details: Array<{ placa: string; vin: string; lat?: number; lng?: number; estado: string }>;
  }> {
    if (!this.isEnabled()) {
      return { vehiclesSynced: 0, positionsUpdated: 0, details: [] };
    }

    try {
      // 1. Obtener lista oficial de camiones de la cuenta Volvo
      const vehicles = await this.fetchVehicles();
      const details: Array<{ placa: string; vin: string; lat?: number; lng?: number; estado: string }> = [];

      // 2. Asegurar que los camiones existan en la tabla cisternas
      for (const v of vehicles) {
        // La placa puede venir en el nombre del vehículo (ej: 'CAT-849') o usamos el VIN
        const placaSugerida = (v.name && v.name.length <= 15 && v.name !== v.vin) ? v.name : v.vin.substring(0, 10);

        // Verificar si ya existe por VIN o por placa
        const existingRes = await query(
          `SELECT id, placa, codigo_gps FROM cisternas WHERE codigo_gps = $1 OR placa = $2 LIMIT 1;`,
          [v.vin, placaSugerida]
        );

        if (existingRes.rows.length === 0) {
          // Registrar la cisterna automáticamente con datos de Volvo
          await query(
            `INSERT INTO cisternas (placa, marca_modelo, capacidad_m3, capacidad_litros, estado, codigo_gps, enlace_gps_tracking)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (placa) DO UPDATE SET codigo_gps = EXCLUDED.codigo_gps;`,
            [
              placaSugerida,
              `${v.model} (${v.emissionLevel || 'EURO_V'})`,
              15.00,
              15000.00,
              'OPERATIVO',
              v.vin,
              'https://volvoconnect.com/',
            ]
          );
          console.log(`🚛 [Volvo Connect] Cisterna registrada automáticamente: ${placaSugerida} (VIN: ${v.vin})`);
        } else {
          // Actualizar código GPS si aún no estaba asignado
          await query(
            `UPDATE cisternas 
             SET codigo_gps = COALESCE(codigo_gps, $1),
                 enlace_gps_tracking = COALESCE(enlace_gps_tracking, 'https://volvoconnect.com/')
             WHERE id = $2;`,
            [v.vin, existingRes.rows[0].id]
          );
        }
      }

      // Pequeña pausa para respetar el rate-limiting de Volvo (1 seg)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 3. Consultar posiciones GPS en tiempo real
      let positionsUpdated = 0;
      try {
        const positions = await this.fetchFleetPositions();
        for (const pos of positions) {
          if (!pos.latitude || !pos.longitude || isNaN(pos.latitude) || isNaN(pos.longitude)) {
            continue;
          }

          const updateRes = await query(
            `UPDATE cisternas
             SET latitud_actual = $1,
                 longitud_actual = $2,
                 ultima_actualizacion_gps = $3,
                 enlace_gps_tracking = COALESCE(enlace_gps_tracking, 'https://volvoconnect.com/')
             WHERE codigo_gps = $4 OR placa = $4
             RETURNING placa;`,
            [pos.latitude, pos.longitude, pos.timestamp, pos.vin]
          );

          if (updateRes.rows.length > 0) {
            positionsUpdated++;
            details.push({
              placa: updateRes.rows[0].placa,
              vin: pos.vin,
              lat: pos.latitude,
              lng: pos.longitude,
              estado: 'GPS Actualizado',
            });
          }
        }
      } catch (posErr: any) {
        console.warn('⚠️ [Volvo Connect] Consulta de posiciones en espera:', posErr.message);
      }

      this.lastSyncTime = new Date().toISOString();
      this.lastError = null;

      console.log(`📡 [Volvo Connect] Sincronización exitosa: ${vehicles.length} vehículos validados, ${positionsUpdated} posiciones GPS actualizadas.`);

      return {
        vehiclesSynced: vehicles.length,
        positionsUpdated,
        details,
      };
    } catch (err: any) {
      this.lastError = err.message || 'Error en sincronización con Volvo Connect';
      console.warn('⚠️ [Volvo Connect] Error de sincronización:', this.lastError);
      throw err;
    }
  }

  /**
   * Iniciar temporizador de sincronización en segundo plano (cada 2 minutos)
   */
  public startBackgroundSync(intervalMs = 120000) {
    if (!this.isEnabled()) {
      console.log('ℹ️ [Volvo Connect] Integración deshabilitada en configuración (.env).');
      return;
    }

    console.log(`🛰️ [Volvo Connect] Demonio de telemetría activo (Frecuencia: ${intervalMs / 1000}s).`);

    // Primera sincronización
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
