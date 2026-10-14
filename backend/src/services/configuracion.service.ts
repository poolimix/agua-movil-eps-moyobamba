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

export interface AppVersionConfig {
  version_actual: string;
  version_minima: string;
  force_update: boolean;
  update_url: string;
  release_notes: string;
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
        valor TEXT NOT NULL,
        descripcion TEXT,
        unidad VARCHAR(30),
        categoria VARCHAR(50) DEFAULT 'GENERAL',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(150) DEFAULT 'SISTEMA'
      );
      ALTER TABLE configuracion_sistema ALTER COLUMN valor TYPE TEXT;
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS updated_by VARCHAR(150) DEFAULT 'SISTEMA';
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS unidad VARCHAR(30);
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'GENERAL';
      ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

      INSERT INTO configuracion_sistema (clave, valor, descripcion, unidad, categoria)
      VALUES 
        ('DOTACION_DIARIA_LITROS', '50.00', 'Dotación de agua potable diaria por habitante/familiar', 'L/hab/día', 'DOTACION'),
        ('DIAS_ENTREGA_SEMANAL', '7.00', 'Días de abastecimiento continuo por ciclo periódico semanal', 'días', 'DOTACION'),
        ('TURBIEDAD_MAX_NTU', '5.00', 'Límite Máximo Permisible (LMP) de Turbiedad', 'NTU', 'CALIDAD'),
        ('CLORO_MIN_PPM', '0.50', 'Límite mínimo reglamentario de Cloro Residual Libre', 'mg/L (ppm)', 'CALIDAD'),
        ('CLORO_MAX_PPM', '2.00', 'Límite máximo recomendado de Cloro Residual Libre', 'mg/L (ppm)', 'CALIDAD'),
        ('PH_MIN', '6.50', 'Límite mínimo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD'),
        ('PH_MAX', '8.50', 'Límite máximo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD'),
        ('APP_VERSION_ACTUAL', '1.0.1', 'Versión más reciente de la aplicación móvil AguaTrack', 'v', 'MOVIL'),
        ('APP_VERSION_MINIMA', '1.0.1', 'Versión mínima obligatoria requerida para ingresar a la app', 'v', 'MOVIL'),
        ('APP_FORCE_UPDATE', '1', 'Forzar actualización obligatoria al ingresar (1=Sí, 0=No)', 'flag', 'MOVIL'),
        ('APP_UPDATE_URL', 'https://expo.dev/artifacts/eas/aguatrack.apk', 'URL de descarga del nuevo APK o enlace a Play Store', 'url', 'MOVIL'),
        ('APP_UPDATE_NOTAS', 'Versión obligatoria con mejoras en sincronización de reparto y geolocalización.', 'texto', 'MOVIL')
      ON CONFLICT (clave) DO NOTHING;
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
      const num = parseFloat(row.valor);
      if (!isNaN(num)) {
        map[row.clave] = num;
      }
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

export const getAppVersionConfig = async (): Promise<AppVersionConfig> => {
  try {
    await ensureConfiguracionSchema();
    const res = await query(`
      SELECT clave, valor, updated_at, updated_by 
      FROM configuracion_sistema 
      WHERE categoria = 'MOVIL' OR clave LIKE 'APP_%'
    `);

    const map: Record<string, string> = {};
    let latestUpdatedAt: string | undefined;
    let latestUpdatedBy: string | undefined;

    for (const row of res.rows) {
      map[row.clave] = row.valor;
      if (row.updated_at) latestUpdatedAt = row.updated_at;
      if (row.updated_by) latestUpdatedBy = row.updated_by;
    }

    return {
      version_actual: map['APP_VERSION_ACTUAL'] || '1.0.1',
      version_minima: map['APP_VERSION_MINIMA'] || '1.0.1',
      force_update: map['APP_FORCE_UPDATE'] === '1' || map['APP_FORCE_UPDATE'] === 'true',
      update_url: map['APP_UPDATE_URL'] || 'https://expo.dev/artifacts/eas/aguatrack.apk',
      release_notes: map['APP_UPDATE_NOTAS'] || 'Actualización obligatoria disponible.',
      updated_at: latestUpdatedAt,
      updated_by: latestUpdatedBy,
    };
  } catch (err) {
    console.error('Error obteniendo versión de app móvil:', err);
    return {
      version_actual: '1.0.1',
      version_minima: '1.0.1',
      force_update: true,
      update_url: 'https://expo.dev/artifacts/eas/aguatrack.apk',
      release_notes: 'Actualización obligatoria requerida.',
    };
  }
};

export const updateAppVersionConfig = async (
  data: Partial<{
    version_actual: string;
    version_minima: string;
    force_update: boolean | string | number;
    update_url: string;
    release_notes: string;
  }>,
  updatedBy: string = 'ADMIN'
): Promise<AppVersionConfig> => {
  await ensureConfiguracionSchema();

  const updates: Array<{ clave: string; valor: string }> = [];

  if (data.version_actual !== undefined) {
    updates.push({ clave: 'APP_VERSION_ACTUAL', valor: String(data.version_actual).trim() });
  }
  if (data.version_minima !== undefined) {
    updates.push({ clave: 'APP_VERSION_MINIMA', valor: String(data.version_minima).trim() });
  }
  if (data.force_update !== undefined) {
    const isTrue = data.force_update === true || data.force_update === '1' || data.force_update === 1 || data.force_update === 'true';
    updates.push({ clave: 'APP_FORCE_UPDATE', valor: isTrue ? '1' : '0' });
  }
  if (data.update_url !== undefined) {
    updates.push({ clave: 'APP_UPDATE_URL', valor: String(data.update_url).trim() });
  }
  if (data.release_notes !== undefined) {
    updates.push({ clave: 'APP_UPDATE_NOTAS', valor: String(data.release_notes).trim() });
  }

  for (const item of updates) {
    await query(
      `INSERT INTO configuracion_sistema (clave, valor, categoria, updated_at, updated_by)
       VALUES ($1, $2, 'MOVIL', CURRENT_TIMESTAMP, $3)
       ON CONFLICT (clave) DO UPDATE 
       SET valor = EXCLUDED.valor, 
           categoria = 'MOVIL',
           updated_at = CURRENT_TIMESTAMP, 
           updated_by = EXCLUDED.updated_by`,
      [item.clave, item.valor, updatedBy]
    );
  }

  return await getAppVersionConfig();
};

