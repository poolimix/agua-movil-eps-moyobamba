import { pool } from './index';

export const migrateConfiguracion = async () => {
  console.log('🔄 Ejecutando migración: Tabla de Configuración y Parámetros Operativos del Sistema...');

  await pool.query(`
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

    -- Valores iniciales oficiales (Norma SUNASS / D.S. 031-2010-SA / Convenio PNSU)
    INSERT INTO configuracion_sistema (clave, valor, descripcion, unidad, categoria)
    VALUES 
      ('DOTACION_DIARIA_LITROS', 50.00, 'Dotación de agua potable diaria por habitante/familiar', 'L/hab/día', 'DOTACION'),
      ('DIAS_ENTREGA_SEMANAL', 7.00, 'Días de abastecimiento continuo por ciclo periódico semanal', 'días', 'DOTACION'),
      ('TURBIEDAD_MAX_NTU', 5.00, 'Límite Máximo Permisible (LMP) de Turbiedad para agua de consumo humano', 'NTU', 'CALIDAD'),
      ('CLORO_MIN_PPM', 0.50, 'Límite mínimo reglamentario de Cloro Residual Libre en punto de entrega', 'mg/L (ppm)', 'CALIDAD'),
      ('CLORO_MAX_PPM', 2.00, 'Límite máximo recomendado de Cloro Residual Libre en cisterna', 'mg/L (ppm)', 'CALIDAD'),
      ('PH_MIN', 6.50, 'Límite mínimo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD'),
      ('PH_MAX', 8.50, 'Límite máximo de potencial de hidrógeno (pH)', 'pH', 'CALIDAD')
    ON CONFLICT (clave) DO NOTHING;
  `);

  console.log('✅ Migración de configuracion_sistema completada.');
};

if (require.main === module) {
  migrateConfiguracion()
    .then(() => {
      console.log('✅ Finalizado con éxito.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
