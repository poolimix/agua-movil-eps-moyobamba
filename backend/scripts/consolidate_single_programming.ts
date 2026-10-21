import { query } from '../src/db';
import { getConfiguracion } from '../src/services/configuracion.service';

export const consolidateSingleProgramming = async () => {
  console.log('🔄 [Consolidación a Programación Única] Iniciando...');

  const config = await getConfiguracion();
  const dotacionSemanal = config.dotacion_semanal_por_habitante || 350;

  // 1. Obtener IDs oficiales del Conductor (Carlos Ivan Ruiz) y Gestor (Carlos Manuel del Aguila)
  const condRes = await query("SELECT id FROM personal_operativo WHERE dni = '43654016' OR email = 'conductor@gmail.com' LIMIT 1");
  const gestRes = await query("SELECT id FROM personal_operativo WHERE dni = '45892100' OR email = 'carlosmanueldelaguilariva@gmail.com' LIMIT 1");
  const cisRes = await query("SELECT id FROM cisternas WHERE placa = 'CAT-849' LIMIT 1");

  const conductorId = condRes.rows[0]?.id;
  const gestorId = gestRes.rows[0]?.id;
  const cisternaId = cisRes.rows[0]?.id || 1;

  // 2. Establecer la Programación #7 como la PROGRAMACIÓN MAESTRA ÚNICA
  const masterProgRes = await query(`
    UPDATE programaciones
    SET zona = 'SOL DE INDAÑE, SANTIAGO DE LOS 8 VALLES, SAN BORJA, LOS EUCALIPTOS, LAS BRISAS DEL MAYO',
        sectores_seleccionados = 'SOL DE INDAÑE, SANTIAGO DE LOS 8 VALLES, SAN BORJA, LOS EUCALIPTOS, LAS BRISAS DEL MAYO',
        litros_programados = 3666750,
        viajes_estimados = 193,
        cisterna_id = $1,
        conductor_id = $2,
        ayudante_id = $3,
        estado = 'Activa',
        es_anual = true,
        dias_semana = 'Lunes, Martes, Miércoles, Jueves, Viernes, Sábado',
        fecha_inicio = '2026-08-01',
        fecha_fin = '2026-12-31'
    WHERE id = 7
    RETURNING *;
  `, [cisternaId, conductorId, gestorId]);

  let masterId = 7;
  if (masterProgRes.rows.length === 0) {
    // Si la 7 no existiera, tomar la primera existente o crearla
    const pFirst = await query('SELECT id FROM programaciones ORDER BY id ASC LIMIT 1');
    masterId = pFirst.rows[0].id;
  }

  console.log(`✅ Programación Maestra Única fijada en ID #${masterId} (Meta Convenio: 3,666.75 m³ / 3,666,750 Litros)`);

  // 3. Vincular todas las entregas históricas y vales a esta Única Programación Maestra
  await query('UPDATE entregas_agua SET programacion_id = $1', [masterId]);
  await query('UPDATE vales_entrega SET programacion_id = $1', [masterId]);

  // 4. Eliminar las otras programaciones duplicadas/borradores (ej: #8 y #11) para que quede SOLO UNA
  await query('DELETE FROM programaciones WHERE id <> $1', [masterId]);
  console.log(`🗑️ Programaciones secundarias eliminadas. Solo queda la Programación #${masterId}`);

  // 5. Asegurar que los 153 beneficiarios del Padrón Oficial tengan su Vale de Consumo emitido en la Programación Maestra
  const allBens = await query(`
    SELECT b.id, b.dni, b.nombres_apellidos, b.num_miembros, COALESCE(b.sector_aahh, b.sector) as sector
    FROM beneficiarios b
    ORDER BY b.id ASC
  `);

  console.log(`Verificando vales para ${allBens.rows.length} beneficiarios del padrón oficial...`);

  let creados = 0;
  let actualizados = 0;

  for (const b of allBens.rows) {
    const numMiembros = b.num_miembros || 1;
    const litros = numMiembros * dotacionSemanal;
    const dniSafe = (b.dni || String(b.id)).trim();
    const codigoUnico = `VALE-ANUAL-2026-${dniSafe}`;
    const qrData = `${codigoUnico}|${dniSafe}|${litros}L|${masterId}`;

    const existing = await query(`
      SELECT id FROM vales_entrega WHERE beneficiario_id = $1 LIMIT 1
    `, [b.id]);

    if (existing.rows.length > 0) {
      await query(`
        UPDATE vales_entrega
        SET programacion_id = $1,
            litros_sugeridos = $2,
            litros_asignados = $2,
            qr_data = $3,
            codigo_unico = COALESCE(codigo_unico, $4),
            codigo_vale = COALESCE(codigo_vale, $4)
        WHERE id = $5
      `, [masterId, litros, qrData, codigoUnico, existing.rows[0].id]);
      actualizados++;
    } else {
      await query(`
        INSERT INTO vales_entrega (
          programacion_id, beneficiario_id, codigo_unico, codigo_vale,
          litros_sugeridos, litros_asignados, qr_data, estado, fecha_emision
        )
        VALUES ($1, $2, $3, $3, $4, $4, $5, 'EMITIDO', CURRENT_DATE)
      `, [masterId, b.id, codigoUnico, litros, qrData]);
      creados++;
    }
  }

  // 6. Resumen de verificación
  const valesTotales = await query('SELECT COUNT(*) as total_vales, COUNT(DISTINCT beneficiario_id) as total_bens FROM vales_entrega WHERE programacion_id = $1', [masterId]);
  const progsFinales = await query('SELECT id, fecha, zona, estado, litros_programados, cisterna_id, conductor_id, ayudante_id FROM programaciones');

  console.log('🎉 [Consolidación Exitosa]');
  console.log(`🎟️ Total Vales disponibles en Programación #${masterId}: ${valesTotales.rows[0].total_vales} vales (1 para cada una de las ${valesTotales.rows[0].total_bens} familias)`);
  console.log(`📋 Programaciones activas en el sistema: ${progsFinales.rows.length} (ID #${masterId})`);
};

consolidateSingleProgramming()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error en consolidación:', err);
    process.exit(1);
  });
