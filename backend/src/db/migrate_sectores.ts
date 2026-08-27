import { pool } from './index';

export const migrateSectores = async () => {
  console.log('🔄 Ejecutando migración: Tabla de Sectores / AA.HH...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sectores (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) UNIQUE NOT NULL,
      distrito VARCHAR(100) DEFAULT 'Moyobamba',
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Insertar sectores base oficiales de Moyobamba si no existen
    INSERT INTO sectores (nombre, distrito, descripcion)
    VALUES 
      ('Sol de Indañe', 'Moyobamba', 'Sector periurbano - Atención prioritaria'),
      ('Cococho', 'Moyobamba', 'Barrio tradicional'),
      ('El Milagro', 'Moyobamba', 'Asentamiento Humano zona norte'),
      ('Zavala', 'Moyobamba', 'Barrio céntrico / periférico'),
      ('Fonavi I y II', 'Moyobamba', 'Urbanización Fonavi'),
      ('Uchuglla', 'Moyobamba', 'Zona alta de Moyobamba'),
      ('Túpac Amaru', 'Moyobamba', 'Asentamiento Humano'),
      ('San Juan de Maynas', 'Moyobamba', 'Sector rural / periurbano'),
      ('Calzada', 'Calzada', 'Distrito aledaño abastecido por cisterna')
    ON CONFLICT (nombre) DO NOTHING;

    -- También insertar los sectores que ya existan en beneficiarios
    INSERT INTO sectores (nombre, distrito)
    SELECT DISTINCT COALESCE(sector_aahh, sector) as nombre, 'Moyobamba' as distrito
    FROM beneficiarios
    WHERE COALESCE(sector_aahh, sector) IS NOT NULL AND COALESCE(sector_aahh, sector) != ''
    ON CONFLICT (nombre) DO NOTHING;
  `);

  console.log('✅ Migración de sectores completada exitosamente.');
};

if (require.main === module) {
  migrateSectores()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración de sectores:', err);
      process.exit(1);
    });
}
