import { pool } from './index';

export const migrateRolesPermissions = async () => {
  console.log('🔄 Ejecutando migración: Roles del Sistema (SUPER_ADMIN, SUPERVISOR, CONDUCTOR, GESTOR_ENTREGA)...');

  // 1. Asegurar que la tabla usuarios admita los roles oficiales
  await pool.query(`
    -- Actualizar registros existentes de AYUDANTE a GESTOR_ENTREGA
    UPDATE personal_operativo 
    SET tipo_personal = 'GESTOR_ENTREGA' 
    WHERE tipo_personal = 'AYUDANTE';

    UPDATE usuarios 
    SET rol = 'GESTOR_ENTREGA' 
    WHERE rol = 'AYUDANTE';

    -- Asegurar columna apple_id para Sign in with Apple
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255);

    -- Convertir administradores existentes a SUPER_ADMIN si se requiere
    UPDATE usuarios 
    SET rol = 'SUPER_ADMIN' 
    WHERE rol = 'ADMIN' OR email = 'admin@epsmoyobamba.gob.pe' OR email = 'vallessaavedrapa@gmail.com';
  `);

  // 2. Configuración del Super Admin inicial para producción
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@epsmoyobamba.gob.pe').trim().toLowerCase();
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Administrador EPS Moyobamba';

  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ($1, $2, 'SUPER_ADMIN', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE 
    SET rol = 'SUPER_ADMIN', estado = 'ACTIVO';
  `, [superAdminEmail, superAdminName]);

  // Si existe vallessaavedrapa@gmail.com, asegurar también SUPER_ADMIN
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ('vallessaavedrapa@gmail.com', 'Pool Antony Valles (Super Admin)', 'SUPER_ADMIN', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE 
    SET rol = 'SUPER_ADMIN', estado = 'ACTIVO';
  `);

  // 3. Crear o actualizar Supervisor de prueba oficial
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ('supervisor@epsmoyobamba.gob.pe', 'Supervisor de Operaciones EPS', 'SUPERVISOR', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE 
    SET rol = 'SUPERVISOR', estado = 'ACTIVO';
  `);

  // 4. Crear o actualizar Conductor y Gestor de Entrega de prueba
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES 
      ('carlos.mendoza@gmail.com', 'Carlos Mendoza Ríos', 'CONDUCTOR', 'ACTIVO'),
      ('segundo.vasquez@gmail.com', 'Segundo Vásquez Gómez', 'GESTOR_ENTREGA', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE 
    SET rol = EXCLUDED.rol, estado = 'ACTIVO';
  `);

  console.log('✅ Migración de roles y permisos completada exitosamente.');
};

if (require.main === module) {
  migrateRolesPermissions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración de roles:', err);
      process.exit(1);
    });
}
