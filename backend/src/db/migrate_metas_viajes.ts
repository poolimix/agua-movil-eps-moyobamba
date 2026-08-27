import { pool } from './index';

export const migrateMetasYViajes = async () => {
  console.log('🔄 Ejecutando migración: Metas Semanales, Días de Reparto, Cisternas y Cálculo de Viajes...');

  await pool.query(`
    -- 1. Actualizar tabla de sectores con metas y días de entrega
    ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_litros INT DEFAULT 0;
    ALTER TABLE sectores ADD COLUMN IF NOT EXISTS meta_semanal_m3 NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE sectores ADD COLUMN IF NOT EXISTS dias_entrega VARCHAR(100) DEFAULT 'Lunes, Miércoles, Viernes';

    -- Calcular y asignar metas iniciales para cada sector basadas en la dotación del padrón (50 Lts/persona * 7 días o dotación calculada)
    UPDATE sectores s
    SET 
      meta_semanal_litros = COALESCE((
        SELECT SUM(COALESCE(num_miembros, 1) * 50 * 7)
        FROM beneficiarios b
        WHERE b.sector_aahh = s.nombre OR b.sector = s.nombre
      ), 0),
      meta_semanal_m3 = ROUND(COALESCE((
        SELECT SUM(COALESCE(num_miembros, 1) * 50 * 7) / 1000.0
        FROM beneficiarios b
        WHERE b.sector_aahh = s.nombre OR b.sector = s.nombre
      ), 0), 2)
    WHERE s.meta_semanal_litros = 0 OR s.meta_semanal_litros IS NULL;

    -- 2. Actualizar tabla de programaciones con cisterna_id, conductor_id, viajes_estimados y días
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS cisterna_id INT REFERENCES cisternas(id) ON DELETE SET NULL;
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS conductor_id INT REFERENCES personal_operativo(id) ON DELETE SET NULL;
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS litros_programados INT DEFAULT 0;
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS viajes_estimados INT DEFAULT 1;
    ALTER TABLE programaciones ADD COLUMN IF NOT EXISTS dias_semana VARCHAR(100) DEFAULT 'Lunes a Viernes';

    -- Asignar una cisterna y conductor por defecto a programaciones existentes si no tienen
    UPDATE programaciones
    SET 
      cisterna_id = (SELECT id FROM cisternas LIMIT 1),
      conductor_id = (SELECT id FROM personal_operativo WHERE tipo_personal = 'CONDUCTOR' LIMIT 1),
      viajes_estimados = 2
    WHERE cisterna_id IS NULL;
  `);

  console.log('✅ Migración de metas semanales y asignación logística de cisternas completada.');
};

if (require.main === module) {
  migrateMetasYViajes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración de metas y viajes:', err);
      process.exit(1);
    });
}
