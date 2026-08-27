import { pool } from './index';

export const seedTestData = async () => {
  console.log('🌱 Insertando datos de prueba para EPS Moyobamba...');

  // 1. Usuarios con diversos roles
  await pool.query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES 
      ('vallessaavedrapa@gmail.com', 'Pool Antony Valles', 'ADMIN', 'ACTIVO'),
      ('poolimix@gmail.com', 'Pool Valles (Supervisor)', 'SUPERVISOR', 'ACTIVO'),
      ('supervisor.campo@epsmoyobamba.gob.pe', 'Ing. Roberto Dávila', 'SUPERVISOR', 'ACTIVO'),
      ('operador1@epsmoyobamba.gob.pe', 'Pedro Castillo Huamán', 'OPERADOR_CAMPO', 'ACTIVO'),
      ('carlos.mendoza@gmail.com', 'Carlos Mendoza Ríos', 'CONDUCTOR', 'ACTIVO'),
      ('manuel.rojas@gmail.com', 'Manuel Rojas Tapia', 'CONDUCTOR', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE SET rol = EXCLUDED.rol, estado = EXCLUDED.estado;
  `);

  // 2. Programaciones de Reparto
  await pool.query(`
    INSERT INTO programaciones (id, fecha, zona, estado)
    VALUES 
      (1, '2026-08-26', 'AA.HH. Sol de Indañe - Sector Alto', 'Activa'),
      (2, '2026-08-26', 'Sector Santiago 8 Valles - Mz A y B', 'Activa'),
      (3, '2026-08-27', 'AA.HH. San Borja - Sector Los Eucaliptos', 'Pendiente'),
      (4, '2026-08-27', 'Barrio San Lorenzo - Sector Cococho', 'Pendiente'),
      (5, '2026-08-25', 'AA.HH. Brisas del Mayo', 'Completada')
    ON CONFLICT (id) DO UPDATE SET fecha = EXCLUDED.fecha, zona = EXCLUDED.zona, estado = EXCLUDED.estado;
    
    SELECT setval('programaciones_id_seq', (SELECT MAX(id) FROM programaciones));
  `);

  // 3. Beneficiarios de prueba en dichos sectores
  await pool.query(`
    INSERT INTO beneficiarios (dni, nombres_apellidos, distrito, sector_aahh, sector, num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono)
    VALUES 
      ('47891234', 'Segundo Juan Pérez García', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '01', 4, 'A', '01', 'Jr. Los Cedros s/n', 'Jr. Los Cedros s/n', '942111222'),
      ('45123987', 'María Elena Flores Silva', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '02', 5, 'A', '02', 'Pasaje Las Flores 140', 'Pasaje Las Flores 140', '942333444'),
      ('48901234', 'Jorge Luis Tapia Delgado', 'Moyobamba', 'Sol de Indañe', 'Sol de Indañe', '03', 3, 'B', '05', 'Jr. San Francisco Mz B Lt 5', 'Jr. San Francisco Mz B Lt 5', '942555666'),
      ('70123456', 'Rosa Amelia Mori Vásquez', 'Moyobamba', 'Santiago 8 Valles', 'Santiago 8 Valles', '12', 6, 'C', '08', 'Av. Principal s/n', 'Av. Principal s/n', '942777888'),
      ('72345678', 'Víctor Raúl Chávez Rengifo', 'Moyobamba', 'Santiago 8 Valles', 'Santiago 8 Valles', '15', 4, 'C', '09', 'Calle Los Laureles 210', 'Calle Los Laureles 210', '942999000'),
      ('41234567', 'Carmen Rosa Alarcón Díaz', 'Moyobamba', 'San Borja', 'San Borja', '05', 2, 'D', '03', 'Jr. Amazonas 450', 'Jr. Amazonas 450', '942123789'),
      ('43890123', 'Manuel Antonio Ríos Gómez', 'Moyobamba', 'San Lorenzo', 'San Lorenzo', '08', 5, 'E', '11', 'Sector Cococho s/n', 'Sector Cococho s/n', '942987654')
    ON CONFLICT (dni) DO UPDATE 
    SET nombres_apellidos = EXCLUDED.nombres_apellidos,
        sector_aahh = EXCLUDED.sector_aahh,
        sector = EXCLUDED.sector,
        num_miembros = EXCLUDED.num_miembros,
        calle_direccion = EXCLUDED.calle_direccion;
  `);

  // 4. Entregas de agua con firmas y GPS de Moyobamba (-6.0341, -76.9717)
  const sampleSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAAA8CAYAAADyqF71AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAJ/SURBVHgB7d0xbtswGAZgwB06dO0BsgdpD9AeIC/QG7S3';

  await pool.query(`
    INSERT INTO entregas_agua (beneficiario_id, programacion_id, litros_entregados, firma_base64, latitud, longitud, fecha_hora, sincronizado)
    VALUES 
      (1, 1, 200.00, '${sampleSignature}', -6.03412000, -76.97175000, '2026-08-26 09:15:00', 1),
      (2, 1, 250.00, '${sampleSignature}', -6.03425000, -76.97182000, '2026-08-26 09:40:00', 1),
      (3, 1, 150.00, '${sampleSignature}', -6.03440000, -76.97190000, '2026-08-26 10:05:00', 1),
      (4, 2, 300.00, '${sampleSignature}', -6.03150000, -76.96820000, '2026-08-26 10:30:00', 1)
    ON CONFLICT DO NOTHING;
  `);

  console.log('✅ Datos de prueba insertados con éxito!');
};

if (require.main === module) {
  seedTestData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en seed:', err);
      process.exit(1);
    });
}
