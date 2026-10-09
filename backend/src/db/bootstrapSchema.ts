import { query } from './index';

/**
 * Auto-inicialización del esquema de base de datos en producción
 * Garantiza que todas las tablas, columnas normativas y parámetros existan sin requerir scripts manuales.
 */
export const bootstrapSchema = async () => {
  try {
    console.log('🔄 [DB Bootstrap] Verificando tablas y parámetros normativos...');

    // 1. Tabla de Configuración y Parámetros Operativos
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

      INSERT INTO configuracion_sistema (clave, valor, descripcion, unidad, categoria)
      VALUES 
        ('DOTACION_DIARIA_LITROS', 50.00, 'Dotación de agua potable diaria por habitante/familiar (Norma SUNASS)', 'L/hab/día', 'DOTACION'),
        ('DIAS_ENTREGA_SEMANAL', 7.00, 'Días de abastecimiento continuo por ciclo periódico semanal', 'días', 'DOTACION'),
        ('TURBIEDAD_MAX_NTU', 5.00, 'Límite Máximo Permisible (LMP) de Turbiedad (D.S. 031-2010-SA)', 'NTU', 'CALIDAD'),
        ('CLORO_MIN_PPM', 0.50, 'Límite mínimo de Cloro Residual Libre en entrega', 'mg/L (ppm)', 'CALIDAD'),
        ('CLORO_MAX_PPM', 2.00, 'Límite máximo recomendado de Cloro Residual Libre', 'mg/L (ppm)', 'CALIDAD'),
        ('PH_MIN', 6.50, 'Límite mínimo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD'),
        ('PH_MAX', 8.50, 'Límite máximo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD')
      ON CONFLICT (clave) DO NOTHING;
    `);

    // 2. Tabla de Sectores y Asentamientos Humanos (AA.HH.)
    await query(`
      CREATE TABLE IF NOT EXISTS sectores (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(150) UNIQUE NOT NULL,
        descripcion TEXT,
        meta_semanal_litros NUMERIC(12,2) DEFAULT 25000,
        coordenadas_centro JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Tabla de Control de Calidad Sanitaria
    await query(`
      CREATE TABLE IF NOT EXISTS control_calidad (
        id SERIAL PRIMARY KEY,
        cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL,
        conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL,
        conductor_nombre VARCHAR(150),
        punto_muestreo VARCHAR(50) DEFAULT 'CISTERNA_SALIDA',
        cloro_residual_ppm NUMERIC(5,2) NOT NULL,
        turbiedad_ntu NUMERIC(5,2) NOT NULL,
        ph NUMERIC(4,2) DEFAULT 7.20,
        aspecto_organoleptico VARCHAR(50) DEFAULT 'LIMPIDO_INCOLORO',
        conforme_sanitario BOOLEAN DEFAULT TRUE,
        observaciones TEXT,
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Tabla de Vales de Consumo
    await query(`
      CREATE TABLE IF NOT EXISTS vales_entrega (
        id SERIAL PRIMARY KEY,
        codigo_vale VARCHAR(50) UNIQUE NOT NULL,
        beneficiario_id INT REFERENCES beneficiarios(id) ON DELETE CASCADE,
        litros_asignados NUMERIC(10,2) NOT NULL,
        estado VARCHAR(30) DEFAULT 'PENDIENTE',
        fecha_emision DATE DEFAULT CURRENT_DATE,
        fecha_canje TIMESTAMP,
        programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Asegurar columnas normativas y padrón en beneficiarios, sectores, cisternas y entregas
    await query(`
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS nombres_apellidos VARCHAR(255);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS nombres VARCHAR(150);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS apellidos VARCHAR(150);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS distrito VARCHAR(100) DEFAULT 'Moyobamba';
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS sector VARCHAR(100);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS sector_aahh VARCHAR(150);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS num_vivienda VARCHAR(50);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS num_miembros INT DEFAULT 1;
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS mz VARCHAR(50);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS lt VARCHAR(50);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS calle_direccion TEXT;
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS direccion TEXT;
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS email VARCHAR(150);
      ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS litros_sugeridos NUMERIC(10,2);

      -- Sincronizar nombres_apellidos en registros existentes si estaba en null
      UPDATE beneficiarios 
      SET nombres_apellidos = TRIM(CONCAT(COALESCE(nombres, ''), ' ', COALESCE(apellidos, '')))
      WHERE (nombres_apellidos IS NULL OR nombres_apellidos = '') AND (nombres IS NOT NULL OR apellidos IS NOT NULL);

      -- Asegurar columnas en sectores
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS distrito VARCHAR(100) DEFAULT 'Moyobamba';
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_litros NUMERIC(12,2) DEFAULT 25000;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_m3 NUMERIC(10,2) DEFAULT 25.00;
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS dias_entrega VARCHAR(150) DEFAULT 'Lunes, Miércoles, Viernes';
      ALTER TABLE sectores ADD COLUMN IF NOT EXISTS coordenadas_centro JSONB;

      -- Sincronizar automáticamente sectores desde beneficiarios si aún no existen en el catálogo
      INSERT INTO sectores (nombre, distrito, descripcion, meta_semanal_litros, meta_semanal_m3, dias_entrega)
      SELECT 
        b.sector_aahh, 
        COALESCE(b.distrito, 'Moyobamba'), 
        'Sector registrado automáticamente desde Padrón de Beneficiarios',
        COALESCE(SUM(b.num_miembros) * 50 * 7, 25000),
        COALESCE((SUM(b.num_miembros) * 50 * 7) / 1000.0, 25.0),
        'Lunes, Miércoles, Viernes'
      FROM beneficiarios b
      WHERE b.sector_aahh IS NOT NULL AND TRIM(b.sector_aahh) <> ''
        AND NOT EXISTS (SELECT 1 FROM sectores s WHERE LOWER(TRIM(s.nombre)) = LOWER(TRIM(b.sector_aahh)))
      GROUP BY b.sector_aahh, b.distrito
      ON CONFLICT (nombre) DO NOTHING;

      -- Asegurar indice unico en dni para que ON CONFLICT (dni) opere sin fallos
      CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiarios_dni_unique ON beneficiarios (dni);

      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS codigo_gps VARCHAR(100);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS latitud_actual NUMERIC(10, 8);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS longitud_actual NUMERIC(11, 8);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS enlace_gps_tracking TEXT;
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS ultima_actualizacion_gps TIMESTAMP;
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS conductor_habitual_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;

      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS foto_url TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS firma_url TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS observaciones TEXT;

      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS litros_programados INT DEFAULT 0;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS viajes_estimados INT DEFAULT 1;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS dias_semana VARCHAR(100);
    `);

    console.log('✅ [DB Bootstrap] Todas las tablas y parámetros operativos verificados con éxito.');
  } catch (err: any) {
    console.warn('⚠️ [DB Bootstrap] Advertencia durante la inicialización:', err.message);
  }
};
