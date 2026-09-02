import { pool } from './index';

export const migrateCalidadEtapas = async () => {
  console.log('🔄 Ejecutando migración: Etapas de Control de Calidad (Carga, Ruta, Adicional)...');

  await pool.query(`
    ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS etapa_control VARCHAR(50) DEFAULT 'CARGA';
    ALTER TABLE control_calidad ADD COLUMN IF NOT EXISTS punto_muestreo VARCHAR(150) DEFAULT 'Surtidor / Planta de Carga';

    -- Actualizar registros de prueba si existen
    UPDATE control_calidad 
    SET etapa_control = 'CARGA', punto_muestreo = 'Punto de Carga / Reservorio Central'
    WHERE etapa_control IS NULL OR etapa_control = '';

    UPDATE control_calidad
    SET etapa_control = 'RUTA', punto_muestreo = 'En Ruta - Grifo Cisterna Sol de Indañe'
    WHERE id % 2 = 0;
  `);

  console.log('✅ Migración de etapas de calidad completada con éxito.');
};

if (require.main === module) {
  migrateCalidadEtapas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración de etapas de calidad:', err);
      process.exit(1);
    });
}
