import { query } from '../src/db';

export const purgeDemoUsers = async () => {
  console.log('🧹 [Limpieza de Usuarios Demo] Iniciando depuración...');

  // 1. Obtener IDs oficiales del Conductor (Carlos Ivan Ruiz) y Gestor (Carlos Manuel del Aguila)
  const condRes = await query("SELECT id FROM personal_operativo WHERE dni = '43654016' OR email = 'conductor@gmail.com' LIMIT 1");
  const gestRes = await query("SELECT id FROM personal_operativo WHERE dni = '45892100' OR email = 'carlosmanueldelaguilariva@gmail.com' LIMIT 1");

  const officialConductorId = condRes.rows[0]?.id;
  const officialGestorId = gestRes.rows[0]?.id;

  console.log(`Conductor Oficial ID: ${officialConductorId}, Gestor Oficial ID: ${officialGestorId}`);

  // 2. DNIs y Correos Demo a eliminar
  const demoDnis = ['45892134', '72109845', '41238976'];
  const demoEmails = ['carlos.mendoza@gmail.com', 'manuel.rojas@gmail.com', 'segundo.vasquez@gmail.com'];

  // 3. Reasignar cualquier referencia previa en programaciones, cisternas, entregas y control_calidad
  if (officialConductorId) {
    await query(`
      UPDATE cisternas 
      SET conductor_habitual_id = $1 
      WHERE conductor_habitual_id IN (SELECT id FROM personal_operativo WHERE dni = ANY($2::text[]) OR email = ANY($3::text[]));
    `, [officialConductorId, demoDnis, demoEmails]);

    await query(`
      UPDATE programaciones 
      SET conductor_id = $1 
      WHERE conductor_id IN (SELECT id FROM personal_operativo WHERE dni = ANY($2::text[]) OR email = ANY($3::text[]));
    `, [officialConductorId, demoDnis, demoEmails]);

    await query(`
      UPDATE entregas_agua 
      SET conductor_id = $1 
      WHERE conductor_id IN (SELECT id FROM personal_operativo WHERE dni = ANY($2::text[]) OR email = ANY($3::text[]));
    `, [officialConductorId, demoDnis, demoEmails]);

    await query(`
      UPDATE control_calidad 
      SET conductor_id = $1 
      WHERE conductor_id IN (SELECT id FROM personal_operativo WHERE dni = ANY($2::text[]) OR email = ANY($3::text[]));
    `, [officialConductorId, demoDnis, demoEmails]);
  }

  if (officialGestorId) {
    await query(`
      UPDATE programaciones 
      SET ayudante_id = $1 
      WHERE ayudante_id IN (SELECT id FROM personal_operativo WHERE dni = ANY($2::text[]) OR email = ANY($3::text[]));
    `, [officialGestorId, demoDnis, demoEmails]);
  }

  // 4. Eliminar de personal_operativo
  const delPers = await query(`
    DELETE FROM personal_operativo 
    WHERE dni = ANY($1::text[]) OR email = ANY($2::text[])
    RETURNING id, dni, nombres, apellidos, email;
  `, [demoDnis, demoEmails]);
  console.log(`🗑️ Eliminados de personal_operativo (${delPers.rowCount}):`, delPers.rows);

  // 5. Eliminar de usuarios
  const delUsers = await query(`
    DELETE FROM usuarios 
    WHERE email = ANY($1::text[])
    RETURNING id, nombres, email;
  `, [demoEmails]);
  console.log(`🗑️ Eliminados de usuarios (${delUsers.rowCount}):`, delUsers.rows);

  // 6. Corregir y sincronizar a Sandro Soria Chuquizuta (DNI: 71112518)
  await query(`
    UPDATE personal_operativo
    SET nombres = 'SANDRO',
        apellidos = 'SORIA CHUQUIZUTA',
        telefono = '997116735',
        email = 'sandro_2014_9@hotmail.com',
        tipo_personal = 'GESTOR_ENTREGA',
        estado = 'ACTIVO'
    WHERE dni = '71112518' OR email = 'sandro_2014_9@hotmail.com';
  `);

  await query(`
    UPDATE usuarios
    SET nombres = 'SANDRO SORIA CHUQUIZUTA',
        rol = 'GESTOR_ENTREGA',
        estado = 'ACTIVO'
    WHERE email = 'sandro_2014_9@hotmail.com';
  `);

  console.log('✅ Registro de Sandro Soria Chuquizuta alineado en Personal y Usuarios.');

  // 7. Verificación final de los que quedan
  const remainingPers = await query('SELECT id, dni, CONCAT(nombres, \' \', apellidos) as nombre, tipo_personal, email FROM personal_operativo ORDER BY id ASC');
  const remainingUsers = await query('SELECT id, nombres, rol, email FROM usuarios ORDER BY id ASC');

  console.log('\n--- PERSONAL OPERATIVO RESULTANTE ---');
  console.table(remainingPers.rows);
  console.log('\n--- USUARIOS RESULTANTES ---');
  console.table(remainingUsers.rows);
};

purgeDemoUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error al purgar usuarios:', err);
    process.exit(1);
  });
