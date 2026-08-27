import { pool } from './index';

export const migrateMultiSectorCisternaDriver = async () => {
  console.log('🔄 Ejecutando migración: Conductor Habitual en Cisternas y Multi-Sectores...');

  await pool.query(`
    -- 1. Agregar conductor habitual a la tabla cisternas
    ALTER TABLE cisternas ADD COLUMN IF NOT EXISTS conductor_habitual_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;

    -- Asignar conductores existentes a cisternas como predeterminados
    UPDATE cisternas c
    SET conductor_habitual_id = (
      SELECT id FROM personal_operativo 
      WHERE tipo_personal = 'CONDUCTOR' AND estado = 'ACTIVO'
      ORDER BY id ASC
      LIMIT 1 OFFSET (c.id % GREATEST(1, (SELECT COUNT(*) FROM personal_operativo WHERE tipo_personal = 'CONDUCTOR' AND estado = 'ACTIVO')))
    )
    WHERE conductor_habitual_id IS NULL;

    -- 2. Asegurar que programaciones admita múltiples sectores
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS sectores_seleccionados TEXT;
  `);

  console.log('✅ Migración de conductor habitual y multi-sectores completada.');
};

if (require.main === module) {
  migrateMultiSectorCisternaDriver()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
