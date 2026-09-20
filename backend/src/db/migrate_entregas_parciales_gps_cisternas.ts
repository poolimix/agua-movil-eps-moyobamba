import { pool } from './index';

export const migrateEntregasParcialesGpsCisternas = async () => {
  console.log('🔄 Ejecutando migración: GPS de Cisternas y Entregas Parciales con Saldo Pendiente...');

  await pool.query(`
    -- 1. Campos de GPS y Geolocalización en cisternas
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS codigo_gps VARCHAR(100);
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS latitud_actual DECIMAL(10, 8);
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS longitud_actual DECIMAL(11, 8);
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS enlace_gps_tracking TEXT;
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS ultima_actualizacion_gps TIMESTAMP;

    -- Semilla referencial de coordenadas en Moyobamba para cisternas existentes si no tienen
    UPDATE cisternas 
    SET codigo_gps = 'GPS-' || placa,
        latitud_actual = -6.03417,
        longitud_actual = -76.97139,
        ultima_actualizacion_gps = CURRENT_TIMESTAMP
    WHERE codigo_gps IS NULL;

    -- 2. Modificaciones en entregas_agua
    -- Asegurar que firma_base64 sea opcional (nullable)
    ALTER TABLE entregas_agua ALTER COLUMN firma_base64 DROP NOT NULL;

    -- Columnas de entregas parciales y saldos pendientes
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS cuota_programada DECIMAL(10, 2);
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS saldo_pendiente DECIMAL(10, 2) DEFAULT 0;
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS estado_entrega VARCHAR(30) DEFAULT 'COMPLETA';
    ALTER TABLE entregas_agua ADD COLUMN IF NOT EXISTS observaciones_entrega TEXT;

    -- Rellenar cuota_programada en entregas históricas si está vacía
    UPDATE entregas_agua 
    SET cuota_programada = litros_entregados,
        saldo_pendiente = 0,
        estado_entrega = 'COMPLETA'
    WHERE cuota_programada IS NULL;
  `);

  console.log('✅ Migración de GPS de Cisternas y Entregas Parciales completada exitosamente.');
};

if (require.main === module) {
  migrateEntregasParcialesGpsCisternas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
