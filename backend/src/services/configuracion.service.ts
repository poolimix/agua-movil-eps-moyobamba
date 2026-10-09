import { query } from '../db';
import { 
  DOTACION_POR_HABITANTE as DEFAULT_DOTACION, 
  DIAS_ENTREGA_SEMANAL as DEFAULT_DIAS,
  LITROS_POR_M3
} from '../config/constants';

export interface ConfiguracionSistema {
  dotacion_diaria_litros: number;
  dias_entrega_semanal: number;
  dotacion_semanal_por_habitante: number;
  turbiedad_max_ntu: number;
  cloro_min_ppm: number;
  cloro_max_ppm: number;
  ph_min: number;
  ph_max: number;
  updated_at?: string;
  updated_by?: string;
}

// In-memory cache for ultra-fast response without DB roundtrip on every single row calculation
let configCache: ConfiguracionSistema | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

export const ensureConfiguracionSchema = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS configuracion_sistema (
        id SERIAL PRIMARY KEY,
        clave VARCHAR(100) UNIQUE NOT NULL,
        valor NUMERIC(10,2) NOT NULL,
        descripcion TEXT,
        unidad VARCHAR(30),
        categoria VARCHAR(50) DEFAULT 'GENERAL',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(150) DEFAULT 'SISTEMA'
      );
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS updated_by VARCHAR(150) DEFAULT 'SISTEMA';
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS unidad VARCHAR(30);
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'GENERAL';
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
  } catch (err) {
    console.warn('Auto-reparación configuracion_sistema:', err);
  }
};

export const getConfiguracion = async (): Promise<ConfiguracionSistema> => {
  const now = Date.now();
  if (configCache && (now - lastCacheTime) < CACHE_TTL_MS) {
    return configCache;
  }

  try {
    await ensureConfiguracionSchema();
    const res = await query('SELECT clave, valor, updated_at, updated_by FROM configuracion_sistema');
    if (res.rows.length === 0) {
      return getDefaultConfig();
    }

    const map: Record<string, number> = {};
    let latestUpdatedAt: string | undefined;
    let latestUpdatedBy: string | undefined;

    for (const row of res.rows) {
      map[row.clave] = parseFloat(row.valor);
      if (row.updated_at) latestUpdatedAt = row.updated_at;
      if (row.updated_by) latestUpdatedBy = row.updated_by;
    }

    const dotacionDiaria = map['DOTACION_DIARIA_LITROS'] ?? DEFAULT_DOTACION;
    const diasSemanal = map['DIAS_ENTREGA_SEMANAL'] ?? DEFAULT_DIAS;

    configCache = {
      dotacion_diaria_litros: dotacionDiaria,
      dias_entrega_semanal: diasSemanal,
      dotacion_semanal_por_habitante: dotacionDiaria * diasSemanal,
      turbiedad_max_ntu: map['TURBIEDAD_MAX_NTU'] ?? 5.0,
      cloro_min_ppm: map['CLORO_MIN_PPM'] ?? 0.5,
      cloro_max_ppm: map['CLORO_MAX_PPM'] ?? 2.0,
      ph_min: map['PH_MIN'] ?? 6.5,
      ph_max: map['PH_MAX'] ?? 8.5,
      updated_at: latestUpdatedAt,
      updated_by: latestUpdatedBy,
    };
    lastCacheTime = now;
    return configCache;
  } catch (err) {
    console.error('Error cargando configuracion_sistema, usando defaults:', err);
    return getDefaultConfig();
  }
};

export const getDefaultConfig = (): ConfiguracionSistema => ({
  dotacion_diaria_litros: DEFAULT_DOTACION,
  dias_entrega_semanal: DEFAULT_DIAS,
  dotacion_semanal_por_habitante: DEFAULT_DOTACION * DEFAULT_DIAS,
  turbiedad_max_ntu: 5.0,
  cloro_min_ppm: 0.5,
  cloro_max_ppm: 2.0,
  ph_min: 6.5,
  ph_max: 8.5,
  updated_at: new Date().toISOString(),
  updated_by: 'SISTEMA',
});

export const updateParametrosConfiguracion = async (
  nuevosParametros: Partial<{
    dotacion_diaria_litros: number;
    dias_entrega_semanal: number;
    turbiedad_max_ntu: number;
    cloro_min_ppm: number;
    cloro_max_ppm: number;
    ph_min: number;
    ph_max: number;
  }>,
  updatedBy: string = 'ADMIN'
) => {
  const updates: Array<{ clave: string; valor: number }> = [];

  if (nuevosParametros.dotacion_diaria_litros !== undefined && !isNaN(nuevosParametros.dotacion_diaria_litros)) {
    updates.push({ clave: 'DOTACION_DIARIA_LITROS', valor: Math.max(1, Number(nuevosParametros.dotacion_diaria_litros)) });
  }
  if (nuevosParametros.dias_entrega_semanal !== undefined && !isNaN(nuevosParametros.dias_entrega_semanal)) {
    updates.push({ clave: 'DIAS_ENTREGA_SEMANAL', valor: Math.max(1, Number(nuevosParametros.dias_entrega_semanal)) });
  }
  if (nuevosParametros.turbiedad_max_ntu !== undefined && !isNaN(nuevosParametros.turbiedad_max_ntu)) {
    updates.push({ clave: 'TURBIEDAD_MAX_NTU', valor: Math.max(0.1, Number(nuevosParametros.turbiedad_max_ntu)) });
  }
  if (nuevosParametros.cloro_min_ppm !== undefined && !isNaN(nuevosParametros.cloro_min_ppm)) {
    updates.push({ clave: 'CLORO_MIN_PPM', valor: Math.max(0, Number(nuevosParametros.cloro_min_ppm)) });
  }
  if (nuevosParametros.cloro_max_ppm !== undefined && !isNaN(nuevosParametros.cloro_max_ppm)) {
    updates.push({ clave: 'CLORO_MAX_PPM', valor: Math.max(0, Number(nuevosParametros.cloro_max_ppm)) });
  }
  if (nuevosParametros.ph_min !== undefined && !isNaN(nuevosParametros.ph_min)) {
    updates.push({ clave: 'PH_MIN', valor: Number(nuevosParametros.ph_min) });
  }
  if (nuevosParametros.ph_max !== undefined && !isNaN(nuevosParametros.ph_max)) {
    updates.push({ clave: 'PH_MAX', valor: Number(nuevosParametros.ph_max) });
  }

  await ensureConfiguracionSchema();

  for (const item of updates) {
    await query(
      `INSERT INTO configuracion_sistema (clave, valor, updated_at, updated_by)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (clave) DO UPDATE 
       SET valor = EXCLUDED.valor, 
           updated_at = CURRENT_TIMESTAMP, 
           updated_by = EXCLUDED.updated_by`,
      [item.clave, item.valor, updatedBy]
    );
  }

  // Invalidate memory cache so next read pulls freshly saved values
  configCache = null;
  lastCacheTime = 0;

  return await getConfiguracion();
};
