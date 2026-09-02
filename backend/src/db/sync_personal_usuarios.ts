import { pool } from './index';

export const syncPersonalUsuarios = async () => {
  console.log('🔄 Sincronizando Personal Operativo con Usuarios de Autenticación...');

  // 1. Sincronizar todos los registros de personal_operativo en la tabla usuarios
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    SELECT 
      LOWER(TRIM(p.email)),
      CONCAT(TRIM(p.nombres), ' ', TRIM(p.apellidos)),
      p.tipo_personal,
      p.estado
    FROM personal_operativo p
    WHERE p.email IS NOT NULL AND TRIM(p.email) != ''
    ON CONFLICT (email) DO UPDATE
    SET nombres = EXCLUDED.nombres,
        rol = EXCLUDED.rol,
        estado = EXCLUDED.estado;
  `);

  // 2. Limpiar usuarios ficticios o que no pertenecen a EPS Moyobamba ni son administradores
  // Mantener administradores oficiales y el personal operativo
  await pool.query(`
    DELETE FROM usuarios 
    WHERE email NOT IN (
      SELECT LOWER(TRIM(email)) FROM personal_operativo WHERE email IS NOT NULL
    )
    AND email NOT IN (
      'vallessaavedrapa@gmail.com',
      'pavalless@alumno.unsm.edu.pe',
      'poolimix@gmail.com'
    );
  `);

  const users = await pool.query('SELECT id, email, nombres, rol, estado FROM usuarios ORDER BY rol, id');
  console.log('✅ Usuarios sincronizados en la base de datos:');
  console.table(users.rows);
};

if (require.main === module) {
  syncPersonalUsuarios()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en sincronización:', err);
      process.exit(1);
    });
}
