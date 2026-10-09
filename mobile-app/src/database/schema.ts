import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const getDatabase = async () => {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('aguamovil.db');
  return db;
};

export const initDatabase = async () => {
  const database = await getDatabase();
  
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS sesion_usuario (
      id INTEGER PRIMARY KEY DEFAULT 1,
      email TEXT NOT NULL,
      nombres TEXT NOT NULL,
      rol TEXT NOT NULL,
      token TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beneficiarios (
      id INTEGER PRIMARY KEY NOT NULL,
      dni TEXT UNIQUE NOT NULL,
      nombres_apellidos TEXT NOT NULL,
      distrito TEXT DEFAULT 'Moyobamba',
      sector_aahh TEXT,
      sector TEXT,
      num_vivienda TEXT,
      num_miembros INTEGER DEFAULT 1,
      mz TEXT,
      lt TEXT,
      calle_direccion TEXT,
      direccion TEXT,
      telefono TEXT
    );

    CREATE TABLE IF NOT EXISTS cisternas (
      id INTEGER PRIMARY KEY NOT NULL,
      placa TEXT UNIQUE NOT NULL,
      marca_modelo TEXT NOT NULL,
      capacidad_m3 REAL NOT NULL,
      capacidad_litros REAL NOT NULL,
      estado TEXT DEFAULT 'OPERATIVO'
    );

    CREATE TABLE IF NOT EXISTS personal_operativo (
      id INTEGER PRIMARY KEY NOT NULL,
      dni TEXT UNIQUE NOT NULL,
      nombres TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      tipo_personal TEXT NOT NULL,
      licencia_conducir TEXT,
      estado TEXT DEFAULT 'ACTIVO'
    );

    CREATE TABLE IF NOT EXISTS programaciones (
      id INTEGER PRIMARY KEY NOT NULL,
      fecha TEXT NOT NULL,
      zona TEXT NOT NULL,
      estado TEXT DEFAULT 'Activa'
    );

    CREATE TABLE IF NOT EXISTS vales_consumo (
      id INTEGER PRIMARY KEY NOT NULL,
      codigo_unico TEXT UNIQUE NOT NULL,
      beneficiario_id INTEGER NOT NULL,
      programacion_id INTEGER,
      litros_sugeridos REAL NOT NULL,
      estado TEXT DEFAULT 'Emitido',
      fecha_emision TEXT,
      FOREIGN KEY (beneficiario_id) REFERENCES beneficiarios (id)
    );

    CREATE TABLE IF NOT EXISTS control_calidad (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cisterna_id INTEGER,
      conductor_id INTEGER,
      cloro_residual_ppm REAL NOT NULL,
      turbiedad_ntu REAL NOT NULL,
      aspecto_organoleptico TEXT DEFAULT 'Límpido / Incoloro',
      conforme_sanitario INTEGER DEFAULT 1,
      observaciones TEXT,
      latitud REAL,
      longitud REAL,
      fecha_hora TEXT,
      sincronizado INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entregas_agua (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT UNIQUE,
      beneficiario_id INTEGER NOT NULL,
      programacion_id INTEGER NOT NULL,
      cisterna_id INTEGER,
      conductor_id INTEGER,
      cuota_programada REAL,
      litros_entregados REAL NOT NULL,
      saldo_pendiente REAL DEFAULT 0,
      estado_entrega TEXT DEFAULT 'COMPLETA',
      observaciones_entrega TEXT,
      firma_base64 TEXT,
      foto_local_uri TEXT,
      latitud REAL,
      longitud REAL,
      precision_gps REAL,
      altitud REAL,
      fecha_ubicacion TEXT,
      fecha_captura TEXT,
      fecha_hora TEXT,
      sincronizado INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      FOREIGN KEY (beneficiario_id) REFERENCES beneficiarios (id),
      FOREIGN KEY (programacion_id) REFERENCES programaciones (id)
    );
  `);

  // Safe migrations for existing SQLite databases on device
  const migrations = [
    `CREATE TABLE IF NOT EXISTS vales_consumo (
      id INTEGER PRIMARY KEY NOT NULL,
      codigo_unico TEXT UNIQUE NOT NULL,
      beneficiario_id INTEGER NOT NULL,
      programacion_id INTEGER,
      litros_sugeridos REAL NOT NULL,
      estado TEXT DEFAULT 'Emitido',
      fecha_emision TEXT,
      FOREIGN KEY (beneficiario_id) REFERENCES beneficiarios (id)
    );`,
    `CREATE TABLE IF NOT EXISTS control_calidad (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cisterna_id INTEGER,
      conductor_id INTEGER,
      cloro_residual_ppm REAL NOT NULL,
      turbiedad_ntu REAL NOT NULL,
      aspecto_organoleptico TEXT DEFAULT 'Límpido / Incoloro',
      conforme_sanitario INTEGER DEFAULT 1,
      observaciones TEXT,
      latitud REAL,
      longitud REAL,
      fecha_hora TEXT,
      sincronizado INTEGER DEFAULT 0
    );`,
    'ALTER TABLE beneficiarios ADD COLUMN sector_aahh TEXT;',
    'ALTER TABLE beneficiarios ADD COLUMN calle_direccion TEXT;',
    'ALTER TABLE entregas_agua ADD COLUMN cisterna_id INTEGER;',
    'ALTER TABLE entregas_agua ADD COLUMN conductor_id INTEGER;',
    'ALTER TABLE entregas_agua ADD COLUMN local_id TEXT;',
    'ALTER TABLE entregas_agua ADD COLUMN foto_local_uri TEXT;',
    'ALTER TABLE entregas_agua ADD COLUMN precision_gps REAL;',
    'ALTER TABLE entregas_agua ADD COLUMN altitud REAL;',
    'ALTER TABLE entregas_agua ADD COLUMN fecha_ubicacion TEXT;',
    'ALTER TABLE entregas_agua ADD COLUMN fecha_captura TEXT;',
    'ALTER TABLE entregas_agua ADD COLUMN sync_status TEXT DEFAULT "PENDING";',
    'ALTER TABLE entregas_agua ADD COLUMN retry_count INTEGER DEFAULT 0;',
    'ALTER TABLE entregas_agua ADD COLUMN cuota_programada REAL;',
    'ALTER TABLE entregas_agua ADD COLUMN saldo_pendiente REAL DEFAULT 0;',
    'ALTER TABLE entregas_agua ADD COLUMN estado_entrega TEXT DEFAULT "COMPLETA";',
    'ALTER TABLE entregas_agua ADD COLUMN observaciones_entrega TEXT;',
    'ALTER TABLE cisternas ADD COLUMN codigo_gps TEXT;',
    'ALTER TABLE cisternas ADD COLUMN latitud_actual REAL;',
    'ALTER TABLE cisternas ADD COLUMN longitud_actual REAL;',
    'ALTER TABLE cisternas ADD COLUMN enlace_gps_tracking TEXT;',
    'ALTER TABLE cisternas ADD COLUMN ultima_actualizacion_gps TEXT;'
  ];

  for (const sql of migrations) {
    try {
      await database.execAsync(sql);
    } catch (_) {
      // Column/table already exists, ignore
    }
  }

  // Purge any legacy mock seed data to ensure 100% clean production environment
  try {
    await database.execAsync(`
      DELETE FROM beneficiarios WHERE dni IN ('47891234', '45123987', '48901234', '70123456', '72345678', '41234567', '43890123');
      DELETE FROM vales_consumo WHERE codigo_unico LIKE 'VALE-20260826-%' OR codigo_unico LIKE 'VALE-20260825-%';
      DELETE FROM programaciones WHERE zona IN ('AA.HH. Sol de Indañe - Sector Alto', 'Sector Santiago 8 Valles - Mz A y B', 'AA.HH. San Borja - Sector Los Eucaliptos', 'Barrio San Lorenzo - Sector Cococho', 'AA.HH. Brisas del Mayo');
      DELETE FROM personal_operativo WHERE dni IN ('45892134', '72109845');
      DELETE FROM cisternas WHERE placa IN ('EGA-401', 'EGB-502', 'EGC-108');
    `);
  } catch (_) {
    // Ignore cleanup error if tables are fresh
  }
  
  console.log('✅ SQLite Database Initialized with Vales, Calidad, Photo Evidence & GPS');
};
