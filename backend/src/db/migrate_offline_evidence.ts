import { pool } from './index';

export const migrateOfflineEvidence = async () => {
  console.log('🔄 Ejecutando migración: Evidencia Fotográfica y GPS Satelital...');

  await pool.query(`
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS cisterna_id INTEGER REFERENCES cisternas(id);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS conductor_id INTEGER REFERENCES personal_operativo(id);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS local_id VARCHAR(100) UNIQUE;
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS foto_url TEXT;
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS latitud DECIMAL(10, 8);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS longitud DECIMAL(11, 8);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS precision_gps DECIMAL(6, 2);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS altitud DECIMAL(8, 2);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_ubicacion TIMESTAMP;
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS fecha_captura TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    -- Actualizar registros existentes sin local_id
    UPDATE entregas_agua 
    SET local_id = 'legacy-' || id,
        fecha_captura = COALESCE(fecha_hora, CURRENT_TIMESTAMP)
    WHERE local_id IS NULL;
  `);

  console.log('✅ Migración de base de datos PostgreSQL completada exitosamente.');
};

if (require.main === module) {
  migrateOfflineEvidence()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
