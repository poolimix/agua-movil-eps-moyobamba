import { pool } from './index';

export const migrateNombresApellidos = async () => {
  console.log('🔄 Ejecutando migración: Separación de Nombres y Apellidos en Beneficiarios...');

  await pool.query(`
    ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS nombres VARCHAR(150);
    ALTER TABLE beneficiarios ADD COLUMN IF NOT EXISTS apellidos VARCHAR(150);

    -- Poblar nombres y apellidos desde nombres_apellidos si están vacíos
    UPDATE beneficiarios 
    SET 
      nombres = COALESCE(NULLIF(nombres, ''), SPLIT_PART(nombres_apellidos, ' ', 1)),
      apellidos = COALESCE(NULLIF(apellidos, ''), SUBSTRING(nombres_apellidos FROM LENGTH(SPLIT_PART(nombres_apellidos, ' ', 1)) + 2))
    WHERE (nombres IS NULL OR nombres = '') AND nombres_apellidos IS NOT NULL AND nombres_apellidos != '';
  `);

  console.log('✅ Migración de nombres y apellidos completada exitosamente.');
};

if (require.main === module) {
  migrateNombresApellidos()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
