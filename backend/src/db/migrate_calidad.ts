import { pool } from './index';

export async function migrateCalidad() {
  console.log('🔄 Ejecutando migración para Módulo de Control de Calidad del Agua...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS control_calidad (
        id SERIAL PRIMARY KEY,
        programacion_id INTEGER REFERENCES programaciones(id) ON DELETE SET NULL,
        cisterna_id INTEGER REFERENCES cisternas(id) ON DELETE SET NULL,
        conductor_nombre VARCHAR(150),
        cloro_residual_ppm DECIMAL(4,2) NOT NULL,
        turbiedad_ntu DECIMAL(4,2) NOT NULL,
        aspecto_organoleptico VARCHAR(50) DEFAULT 'Aceptable',
        conforme_sanitario BOOLEAN DEFAULT true,
        observaciones TEXT,
        foto_muestra_url TEXT,
        latitud DECIMAL(10,8),
        longitud DECIMAL(11,8),
        registrado_por VARCHAR(100) DEFAULT 'Operador Cisterna',
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_calidad_fecha ON control_calidad(fecha_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_calidad_cisterna ON control_calidad(cisterna_id);
    `);

    // Insert sample baseline tests if empty
    const check = await pool.query('SELECT COUNT(*) FROM control_calidad');
    if (parseInt(check.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO control_calidad (cloro_residual_ppm, turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, observaciones, registrado_por, fecha_hora)
        VALUES 
        (1.20, 1.40, 'Límpido / Incoloro', true, 'Medición previa en cisterna N° 1 - Punto de captación Planta Moyobamba', 'Ing. Calidad EPS', CURRENT_TIMESTAMP - INTERVAL '1 day'),
        (0.95, 2.10, 'Aceptable', true, 'Medición previa en cisterna N° 2 - Tanque Central', 'Operador de Campo', CURRENT_TIMESTAMP - INTERVAL '3 hours'),
        (1.40, 1.10, 'Límpido / Óptimo', true, 'Control organoléptico y DPD-1 conforme según D.S. 031-2010-SA', 'Supervisor de Campo', CURRENT_TIMESTAMP);
      `);
      console.log('✅ Datos iniciales de control de calidad insertados.');
    }

    console.log('✅ Migración de tabla control_calidad completada.');
  } catch (error) {
    console.error('❌ Error en migración de control_calidad:', error);
  }
}

if (require.main === module) {
  migrateCalidad().then(() => pool.end());
}
