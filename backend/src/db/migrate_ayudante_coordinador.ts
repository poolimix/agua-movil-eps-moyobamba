import { pool } from './index';

export const migrateAyudanteCoordinador = async () => {
  console.log('🔄 Ejecutando migración: Ayudantes en Programaciones y Rol Coordinador...');

  // 1. Agregar ayudante_id a programaciones
  await pool.query(`
    ALTER TABLE programaciones 
    ADD COLUMN IF NOT EXISTS ayudante_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
  `);

  // 2. Asignar ayudante predeterminado a programaciones activas (Segundo Vásquez Gómez)
  await pool.query(`
    UPDATE programaciones 
    SET ayudante_id = (SELECT id FROM personal_operativo WHERE tipo_personal = 'AYUDANTE' LIMIT 1)
    WHERE ayudante_id IS NULL;
  `);

  // 3. Registrar o actualizar usuario con rol COORDINADOR
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ('coordinador@epsmoyobamba.gob.pe', 'Coordinador de Distribución EPS', 'COORDINADOR', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE 
    SET rol = 'COORDINADOR', estado = 'ACTIVO';
  `);

  console.log('✅ Migración de ayudante y rol coordinador completada exitosamente.');
};

if (require.main === module) {
  migrateAyudanteCoordinador()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}
