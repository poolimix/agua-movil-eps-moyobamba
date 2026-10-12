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

    // 4. Tabla de Vales de Consumo y Notificaciones
    await query(`
      CREATE TABLE IF NOT EXISTS vales_entrega (
        id SERIAL PRIMARY KEY,
        codigo_vale VARCHAR(50),
        codigo_unico VARCHAR(50),
        beneficiario_id INT REFERENCES beneficiarios(id) ON DELETE CASCADE,
        litros_asignados NUMERIC(10,2) DEFAULT 0,
        litros_sugeridos NUMERIC(10,2) DEFAULT 0,
        qr_data TEXT,
        whatsapp_enviado BOOLEAN DEFAULT FALSE,
        sms_enviado BOOLEAN DEFAULT FALSE,
        correo_enviado BOOLEAN DEFAULT FALSE,
        fecha_despacho TIMESTAMP,
        errores_notificacion JSONB DEFAULT '{}'::jsonb,
        estado VARCHAR(30) DEFAULT 'EMITIDO',
        fecha_emision DATE DEFAULT CURRENT_DATE,
        fecha_canje TIMESTAMP,
        programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Asegurar todas las columnas en vales_entrega si la tabla fue creada previamente
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS codigo_unico VARCHAR(50);
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS codigo_vale VARCHAR(50);
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS litros_sugeridos NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS litros_asignados NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS qr_data TEXT;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS whatsapp_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS sms_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS correo_enviado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_despacho TIMESTAMP;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS errores_notificacion JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'EMITIDO';
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_emision DATE DEFAULT CURRENT_DATE;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS fecha_canje TIMESTAMP;
      ALTER TABLE vales_entrega ADD COLUMN IF NOT EXISTS programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL;

      -- Flexibilizar columnas heredadas para evitar conflictos de constraint
      ALTER TABLE vales_entrega ALTER COLUMN codigo_vale DROP NOT NULL;
      ALTER TABLE vales_entrega ALTER COLUMN litros_asignados DROP NOT NULL;
      ALTER TABLE vales_entrega ALTER COLUMN estado SET DEFAULT 'EMITIDO';
      ALTER TABLE vales_entrega DROP CONSTRAINT IF EXISTS vales_entrega_codigo_vale_key;

      CREATE INDEX IF NOT EXISTS idx_vales_prog ON vales_entrega(programacion_id);
      CREATE INDEX IF NOT EXISTS idx_vales_benef ON vales_entrega(beneficiario_id);
      CREATE INDEX IF NOT EXISTS idx_vales_cod_unico ON vales_entrega(codigo_unico);
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

      -- Asegurar existencia de tablas base de personal operativo y cisternas
      CREATE TABLE IF NOT EXISTS personal_operativo (
        id SERIAL PRIMARY KEY,
        dni VARCHAR(15) UNIQUE NOT NULL,
        nombres VARCHAR(150) NOT NULL,
        apellidos VARCHAR(150) NOT NULL,
        tipo_personal VARCHAR(50) NOT NULL,
        licencia_conducir VARCHAR(50),
        categoria_licencia VARCHAR(30),
        telefono VARCHAR(50),
        email VARCHAR(255),
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, licencia_conducir, categoria_licencia, telefono, email, estado)
      VALUES 
        ('45892134', 'Carlos', 'Mendoza Ríos', 'CONDUCTOR', 'Q45892134', 'A-IIIc', '942123456', 'carlos.mendoza@gmail.com', 'ACTIVO'),
        ('72109845', 'Manuel', 'Rojas Tapia', 'CONDUCTOR', 'Q72109845', 'A-IIIb', '942789123', 'manuel.rojas@gmail.com', 'ACTIVO'),
        ('41238976', 'Segundo', 'Vásquez Gómez', 'AYUDANTE', NULL, NULL, '942456789', 'segundo.vasquez@gmail.com', 'ACTIVO')
      ON CONFLICT (dni) DO NOTHING;

      CREATE TABLE IF NOT EXISTS cisternas (
        id SERIAL PRIMARY KEY,
        placa VARCHAR(20) UNIQUE NOT NULL,
        marca_modelo VARCHAR(150) NOT NULL,
        capacidad_m3 DECIMAL(10,2) NOT NULL,
        capacidad_litros DECIMAL(12,2) NOT NULL,
        soat_vencimiento DATE,
        revision_tecnica_vencimiento DATE,
        estado VARCHAR(50) DEFAULT 'OPERATIVO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS codigo_gps VARCHAR(100);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS latitud_actual NUMERIC(10, 8);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS longitud_actual NUMERIC(11, 8);
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS enlace_gps_tracking TEXT;
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS ultima_actualizacion_gps TIMESTAMP;
      ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS conductor_habitual_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;

      -- Purgar cisternas no deseadas o de prueba para dejar exclusivamente la cisterna oficial CAT-849
      DELETE FROM control_calidad WHERE cisterna_id IN (SELECT id FROM cisternas WHERE placa IN ('EGA-401', 'EGB-502', 'EGC-108') OR placa LIKE '93KP0S1D8%');
      DELETE FROM programaciones WHERE cisterna_id IN (SELECT id FROM cisternas WHERE placa IN ('EGA-401', 'EGB-502', 'EGC-108') OR placa LIKE '93KP0S1D8%');
      DELETE FROM cisternas WHERE placa IN ('EGA-401', 'EGB-502', 'EGC-108') OR placa LIKE '93KP0S1D8%' OR codigo_gps LIKE '93KP0S1D8%';

      -- Asegurar exclusivamente la cisterna oficial de EPS Moyobamba: CAT-849
      INSERT INTO cisternas (placa, marca_modelo, capacidad_m3, capacidad_litros, soat_vencimiento, revision_tecnica_vencimiento, estado)
      VALUES 
        ('CAT-849', 'VOLVO VM (EURO_V)', 19.00, 19000.00, '2027-01-15', '2026-12-20', 'OPERATIVO')
      ON CONFLICT (placa) DO NOTHING;

      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS local_id VARCHAR(100);
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS cuota_programada NUMERIC(10,2);
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10,2);
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS estado_entrega VARCHAR(50) DEFAULT 'COMPLETA';
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS observaciones_entrega TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS firma_base64 TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS precision_gps NUMERIC(10,2);
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS altitud NUMERIC(10,2);
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_ubicacion TIMESTAMP;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_captura TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS foto_url TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS firma_url TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS observaciones TEXT;
      ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS sincronizado INT DEFAULT 1;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entregas_agua_local_id ON entregas_agua (local_id) WHERE local_id IS NOT NULL;

      -- Asegurar tabla y columnas en programaciones
      CREATE TABLE IF NOT EXISTS programaciones (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        zona TEXT,
        estado VARCHAR(100) DEFAULT 'Activa'
      );
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS zona TEXT;
      ALTER TABLE programaciones ALTER COLUMN zona TYPE TEXT;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS estado VARCHAR(100) DEFAULT 'Activa';
      ALTER TABLE programaciones ALTER COLUMN estado TYPE VARCHAR(100);
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS ayudante_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS litros_programados INT DEFAULT 0;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS viajes_estimados INT DEFAULT 1;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS dias_semana TEXT DEFAULT 'Lunes, Miércoles, Viernes';
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS sectores_seleccionados TEXT;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS fecha_fin DATE DEFAULT CURRENT_DATE;
      ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS es_anual BOOLEAN DEFAULT TRUE;
      UPDATE programaciones SET fecha_inicio = fecha WHERE fecha_inicio IS NULL;
      UPDATE programaciones SET fecha_fin = fecha WHERE fecha_fin IS NULL;

      -- Asegurar todas las columnas en control_calidad
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS cloro_residual_ppm NUMERIC(5,2) DEFAULT 1.20;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS turbiedad_ntu NUMERIC(5,2) DEFAULT 1.50;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS ph NUMERIC(4,2) DEFAULT 7.20;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS programacion_id INT REFERENCES programaciones(id) ON DELETE SET NULL;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS etapa_control VARCHAR(50) DEFAULT 'CARGA';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conductor_nombre VARCHAR(150);
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS punto_muestreo VARCHAR(50) DEFAULT 'CISTERNA_SALIDA';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS aspecto_organoleptico VARCHAR(50) DEFAULT 'LIMPIDO_INCOLORO';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS conforme_sanitario BOOLEAN DEFAULT TRUE;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS observaciones TEXT;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS foto_muestra_url TEXT;
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS latitud NUMERIC(10, 8);
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS longitud NUMERIC(11, 8);
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS registrado_por VARCHAR(150) DEFAULT 'Operador / Supervisor';
      ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE control_calidad ALTER COLUMN punto_muestreo TYPE TEXT;
      ALTER TABLE control_calidad ALTER COLUMN aspecto_organoleptico TYPE TEXT;
      ALTER TABLE control_calidad ALTER COLUMN etapa_control TYPE TEXT;
      ALTER TABLE control_calidad ALTER COLUMN conductor_nombre TYPE TEXT;

      -- Auto-reparar cisterna_id en entregas_agua si es nulo
      UPDATE entregas_agua e
      SET cisterna_id = COALESCE(
        p.cisterna_id,
        (SELECT id FROM cisternas WHERE placa = 'CAT-849' LIMIT 1),
        (SELECT id FROM cisternas WHERE estado = 'Activa' ORDER BY id ASC LIMIT 1)
      )
      FROM programaciones p
      WHERE e.programacion_id = p.id AND e.cisterna_id IS NULL;

      UPDATE entregas_agua
      SET cisterna_id = COALESCE(
        (SELECT id FROM cisternas WHERE placa = 'CAT-849' LIMIT 1),
        (SELECT id FROM cisternas WHERE estado = 'Activa' ORDER BY id ASC LIMIT 1)
      )
      WHERE cisterna_id IS NULL;
    `);

    console.log('✅ [DB Bootstrap] Todas las tablas y parámetros operativos verificados con éxito.');
  } catch (err: any) {
    console.warn('⚠️ [DB Bootstrap] Advertencia durante la inicialización:', err.message);
  }
};
