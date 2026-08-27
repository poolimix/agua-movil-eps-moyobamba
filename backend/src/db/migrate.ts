import { pool } from './index';

export const runMigrations = async () => {
  console.log('🔄 Ejecutando migraciones de base de datos...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      nombres VARCHAR(255) NOT NULL,
      rol VARCHAR(50) DEFAULT 'OPERADOR_CAMPO', -- 'ADMIN', 'SUPERVISOR', 'OPERADOR_CAMPO', 'CONDUCTOR'
      estado VARCHAR(50) DEFAULT 'ACTIVO',
      google_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cisternas (
      id SERIAL PRIMARY KEY,
      placa VARCHAR(20) UNIQUE NOT NULL,
      marca_modelo VARCHAR(150) NOT NULL,
      capacidad_m3 DECIMAL(10,2) NOT NULL,
      capacidad_litros DECIMAL(12,2) NOT NULL,
      soat_vencimiento DATE,
      revision_tecnica_vencimiento DATE,
      estado VARCHAR(50) DEFAULT 'OPERATIVO', -- 'OPERATIVO', 'MANTENIMIENTO', 'INACTIVO'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_operativo (
      id SERIAL PRIMARY KEY,
      dni VARCHAR(15) UNIQUE NOT NULL,
      nombres VARCHAR(150) NOT NULL,
      apellidos VARCHAR(150) NOT NULL,
      tipo_personal VARCHAR(50) NOT NULL, -- 'CONDUCTOR', 'AYUDANTE', 'SUPERVISOR'
      licencia_conducir VARCHAR(50),
      categoria_licencia VARCHAR(30),
      telefono VARCHAR(50),
      email VARCHAR(255),
      estado VARCHAR(50) DEFAULT 'ACTIVO',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed admin user
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES 
      ('vallessaavedrapa@gmail.com', 'Pool Antony Valles', 'ADMIN', 'ACTIVO'),
      ('admin@epsmoyobamba.gob.pe', 'Administrador General EPS', 'ADMIN', 'ACTIVO'),
      ('supervisor@epsmoyobamba.gob.pe', 'Supervisor de Campo', 'SUPERVISOR', 'ACTIVO'),
      ('operador@epsmoyobamba.gob.pe', 'Operador Reparto', 'OPERADOR_CAMPO', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE SET rol = EXCLUDED.rol, estado = EXCLUDED.estado;

    -- Seed sample cisternas if empty
    INSERT INTO cisternas (placa, marca_modelo, capacidad_m3, capacidad_litros, soat_vencimiento, revision_tecnica_vencimiento, estado)
    VALUES 
      ('EGA-401', 'Mercedes-Benz Actros 3331', 15.00, 15000.00, '2027-01-15', '2026-12-20', 'OPERATIVO'),
      ('EGB-502', 'Volvo FMX 440 6x4', 20.00, 20000.00, '2026-11-30', '2026-10-15', 'OPERATIVO'),
      ('EGC-108', 'Hino 500 FG 1726', 10.00, 10000.00, '2026-09-20', '2026-09-10', 'MANTENIMIENTO')
    ON CONFLICT (placa) DO NOTHING;

    -- Seed sample personal if empty
    INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, licencia_conducir, categoria_licencia, telefono, email, estado)
    VALUES 
      ('45892134', 'Carlos', 'Mendoza Ríos', 'CONDUCTOR', 'Q45892134', 'A-IIIc', '942123456', 'carlos.mendoza@gmail.com', 'ACTIVO'),
      ('72109845', 'Manuel', 'Rojas Tapia', 'CONDUCTOR', 'Q72109845', 'A-IIIb', '942789123', 'manuel.rojas@gmail.com', 'ACTIVO'),
      ('41238976', 'Segundo', 'Vásquez Gómez', 'AYUDANTE', NULL, NULL, '942456789', 'segundo.vasquez@gmail.com', 'ACTIVO'),
      ('48901234', 'Jorge', 'Flores Silva', 'SUPERVISOR', 'Q48901234', 'A-IIb', '942999888', 'jorge.flores@epsmoyobamba.gob.pe', 'ACTIVO')
    ON CONFLICT (dni) DO NOTHING;
  `);

  console.log('✅ Migraciones y semillas completadas exitosamente!');
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migraciones:', err);
      process.exit(1);
    });
}
