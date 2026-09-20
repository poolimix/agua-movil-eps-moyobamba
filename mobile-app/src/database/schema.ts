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

  // Insert initial seed data
  await database.execAsync(`
    INSERT OR REPLACE INTO cisternas (id, placa, marca_modelo, capacidad_m3, capacidad_litros, estado)
    VALUES 
      (1, 'EGA-401', 'Mercedes-Benz Actros 3331', 15.0, 15000.0, 'OPERATIVO'),
      (2, 'EGB-502', 'Volvo FMX 440 6x4', 20.0, 20000.0, 'OPERATIVO'),
      (3, 'EGC-108', 'Hino 500 FG 1726', 10.0, 10000.0, 'MANTENIMIENTO');

    INSERT OR REPLACE INTO personal_operativo (id, dni, nombres, apellidos, tipo_personal, licencia_conducir, estado)
    VALUES 
      (1, '45892134', 'Carlos', 'Mendoza Ríos', 'CONDUCTOR', 'Q45892134', 'ACTIVO'),
      (2, '72109845', 'Manuel', 'Rojas Tapia', 'CONDUCTOR', 'Q72109845', 'ACTIVO');

    INSERT OR REPLACE INTO programaciones (id, fecha, zona, estado)
    VALUES 
      (1, '2026-08-26', 'AA.HH. Sol de Indañe - Sector Alto', 'Activa'),
      (2, '2026-08-26', 'Sector Santiago 8 Valles - Mz A y B', 'Activa'),
      (3, '2026-08-27', 'AA.HH. San Borja - Sector Los Eucaliptos', 'Pendiente'),
      (4, '2026-08-27', 'Barrio San Lorenzo - Sector Cococho', 'Pendiente'),
      (5, '2026-08-25', 'AA.HH. Brisas del Mayo', 'Completada');

    INSERT OR REPLACE INTO beneficiarios (id, dni, nombres_apellidos, distrito, sector_aahh, sector, num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono)
    VALUES 
      (1, '47891234', 'Segundo Juan Pérez García', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '01', 4, 'A', '01', 'Jr. Los Cedros s/n', 'Jr. Los Cedros s/n', '942111222'),
      (2, '45123987', 'María Elena Flores Silva', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '02', 5, 'A', '02', 'Pasaje Las Flores 140', 'Pasaje Las Flores 140', '942333444'),
      (3, '48901234', 'Jorge Luis Tapia Delgado', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '03', 3, 'B', '05', 'Jr. San Francisco Mz B Lt 5', 'Jr. San Francisco Mz B Lt 5', '942555666'),
      (4, '70123456', 'Rosa Amelia Mori Vásquez', 'Moyobamba', 'Santiago 8 Valles', 'Santiago 8 Valles', '12', 6, 'C', '08', 'Av. Principal s/n', 'Av. Principal s/n', '942777888'),
      (5, '72345678', 'Víctor Raúl Chávez Rengifo', 'Moyobamba', 'Santiago 8 Valles', 'Santiago 8 Valles', '15', 4, 'C', '09', 'Calle Los Laureles 210', 'Calle Los Laureles 210', '942999000'),
      (6, '41234567', 'Carmen Rosa Alarcón Díaz', 'Moyobamba', 'San Borja', 'San Borja', '05', 2, 'D', '03', 'Jr. Amazonas 450', 'Jr. Amazonas 450', '942123789'),
      (7, '43890123', 'Manuel Antonio Ríos Gómez', 'Moyobamba', 'San Lorenzo', 'San Lorenzo', '08', 5, 'E', '11', 'Sector Cococho s/n', 'Sector Cococho s/n', '942987654');

    INSERT OR REPLACE INTO vales_consumo (id, codigo_unico, beneficiario_id, programacion_id, litros_sugeridos, estado, fecha_emision)
    VALUES 
      (1, 'VALE-20260826-001', 1, 1, 200.0, 'Emitido', '2026-08-26'),
      (2, 'VALE-20260826-002', 2, 1, 250.0, 'Emitido', '2026-08-26'),
      (3, 'VALE-20260826-003', 3, 1, 150.0, 'Emitido', '2026-08-26'),
      (4, 'VALE-20260826-004', 4, 2, 300.0, 'Emitido', '2026-08-26'),
      (5, 'VALE-20260826-005', 5, 2, 200.0, 'Emitido', '2026-08-26'),
      (6, 'VALE-20260826-006', 6, 3, 100.0, 'Emitido', '2026-08-27'),
      (7, 'VALE-20260825-007', 7, 4, 250.0, 'Emitido', '2026-08-25');
  `);
  
  console.log('✅ SQLite Database Initialized with Vales, Calidad, Photo Evidence & GPS');
};
