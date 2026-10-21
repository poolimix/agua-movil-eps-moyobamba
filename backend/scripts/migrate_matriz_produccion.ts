import { query } from '../src/db';
import { ensurePresupuestoSchema } from '../src/services/presupuesto.service';

export const runMigration = async () => {
  console.log('🚀 [Migración Matriz Quincenal] Iniciando sincronización con producción...');

  // 1. Conductor: Carlos Ivan Ruiz Chupillon
  const condRes = await query(`
    INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, email, licencia_conducir, categoria_licencia, estado)
    VALUES ('43654016', 'CARLOS IVAN', 'RUIZ CHUPILLON', 'CONDUCTOR', 'conductor@gmail.com', 'Q43654016', 'A-IIIc', 'ACTIVO')
    ON CONFLICT (dni) DO UPDATE 
    SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos, tipo_personal = 'CONDUCTOR', email = EXCLUDED.email, estado = 'ACTIVO'
    RETURNING id, dni, nombres, apellidos, tipo_personal, email;
  `);
  const conductorId = condRes.rows[0].id;

  await query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ('conductor@gmail.com', 'CARLOS IVAN RUIZ CHUPILLON', 'CONDUCTOR', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE SET rol = 'CONDUCTOR', estado = 'ACTIVO', nombres = EXCLUDED.nombres;
  `);

  // 2. Gestor de Entrega: Carlos Manuel del Aguila Riva
  const gestRes = await query(`
    INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, email, estado)
    VALUES ('45892100', 'CARLOS MANUEL', 'DEL AGUILA RIVA', 'GESTOR_ENTREGA', 'carlosmanueldelaguilariva@gmail.com', 'ACTIVO')
    ON CONFLICT (dni) DO UPDATE 
    SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos, tipo_personal = 'GESTOR_ENTREGA', email = EXCLUDED.email, estado = 'ACTIVO'
    RETURNING id, dni, nombres, apellidos, tipo_personal, email;
  `);
  const gestorId = gestRes.rows[0].id;

  await query(`
    INSERT INTO usuarios (email, nombres, rol, estado)
    VALUES ('carlosmanueldelaguilariva@gmail.com', 'CARLOS MANUEL DEL AGUILA RIVA', 'GESTOR_ENTREGA', 'ACTIVO')
    ON CONFLICT (email) DO UPDATE SET rol = 'GESTOR_ENTREGA', estado = 'ACTIVO', nombres = EXCLUDED.nombres;
  `);

  // 3. Cisterna CAT-849: Asignar Conductor Habitual
  const cisRes = await query(`
    UPDATE cisternas 
    SET conductor_habitual_id = $1, estado = 'OPERATIVO'
    WHERE placa = 'CAT-849'
    RETURNING id, placa, marca_modelo, capacidad_litros, conductor_habitual_id;
  `, [conductorId]);
  const cisternaId = cisRes.rows[0]?.id || 1;

  console.log(`✅ Personal asignado: Conductor #${conductorId} (${condRes.rows[0].nombres}), Gestor #${gestorId} (${gestRes.rows[0].nombres}) en Cisterna CAT-849`);

  // 4. Actualizar / Homologar Sectores con Coordenadas Oficiales de la Matriz
  const sectoresOficiales = [
    {
      nombre: 'SOL DE INDAÑE',
      nombre_completo: 'Zona 18M AA.HH Sol de Indañe',
      coord: { lat: -6.017905, lng: -76.999416 },
      meta_m3: 249.00,
      meta_litros: 249000,
      hab_programados: 166
    },
    {
      nombre: 'SANTIAGO DE LOS 8 VALLES',
      nombre_completo: 'Zona 18M Sector Santiago de los 8 Valles',
      coord: { lat: -6.014156, lng: -76.999771 },
      meta_m3: 256.50,
      meta_litros: 256500,
      hab_programados: 171
    },
    {
      nombre: 'SAN BORJA',
      nombre_completo: 'AA.HH San Borja',
      coord: { lat: -6.006800, lng: -76.994000 },
      meta_m3: 33.00,
      meta_litros: 33000,
      hab_programados: 22
    },
    {
      nombre: 'SAN LORENZO',
      nombre_completo: 'AA.HH San Lorenzo',
      coord: { lat: -6.052200, lng: -76.936500 },
      meta_m3: 0.00,
      meta_litros: 0,
      hab_programados: 27
    },
    {
      nombre: 'LOS EUCALIPTOS',
      nombre_completo: 'URB Los Eucaliptos',
      coord: { lat: -6.039319, lng: -76.990462 },
      meta_m3: 159.00,
      meta_litros: 159000,
      hab_programados: 106
    },
    {
      nombre: 'LAS BRISAS DEL MAYO',
      nombre_completo: 'URB. Las Brisas del Mayo',
      coord: { lat: -6.074017, lng: -76.973760 },
      meta_m3: 196.50,
      meta_litros: 196500,
      hab_programados: 131
    }
  ];

  for (const sec of sectoresOficiales) {
    await query(`
      INSERT INTO sectores (nombre, descripcion, meta_semanal_litros, meta_semanal_m3, coordenadas_centro)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (nombre) DO UPDATE SET 
        coordenadas_centro = EXCLUDED.coordenadas_centro,
        meta_semanal_litros = EXCLUDED.meta_semanal_litros,
        meta_semanal_m3 = EXCLUDED.meta_semanal_m3,
        descripcion = EXCLUDED.descripcion;
    `, [
      sec.nombre,
      sec.nombre_completo,
      sec.meta_litros,
      sec.meta_m3,
      JSON.stringify(sec.coord)
    ]);
  }
  console.log('✅ 6 Sectores oficiales sincronizados con coordenadas y metas.');

  // 5. Presupuesto Oficial Convenio PNSU Meta 228
  await ensurePresupuestoSchema();

  // A. Actualizar presupuesto_mensual (Año 2026)
  await query('DELETE FROM presupuesto_mensual WHERE anio = 2026');
  const mesesData = [
    { mes: 'ENERO', num: 1, prog: 0.00, comp: 0.00, gir: 0.00, notas: 'Sin asignación programada' },
    { mes: 'FEBRERO', num: 2, prog: 0.00, comp: 0.00, gir: 0.00, notas: 'Sin asignación programada' },
    { mes: 'MARZO', num: 3, prog: 0.00, comp: 0.00, gir: 0.00, notas: 'Fase preparatoria convenio PNSU' },
    { mes: 'ABRIL', num: 4, prog: 0.00, comp: 0.00, gir: 0.00, notas: 'Trámites administrativos y licitación' },
    { mes: 'MAYO', num: 5, prog: 4000.00, comp: 4000.00, gir: 0.00, notas: 'Inicio de inspección y personal de campo' },
    { mes: 'JUNIO', num: 6, prog: 4000.00, comp: 4000.00, gir: 4000.00, notas: 'Devengado personal operativo' },
    { mes: 'JULIO', num: 7, prog: 4000.00, comp: 4000.00, gir: 4000.00, notas: 'Devengado personal operativo' },
    { mes: 'AGOSTO', num: 8, prog: 14051.78, comp: 9005.75, gir: 4000.00, notas: 'Arranque de distribución en campo' },
    { mes: 'SETIEMBRE', num: 9, prog: 102791.68, comp: 66460.89, gir: 8200.00, notas: 'Personal S/. 4,000 + Insumos S/. 4,200' },
    { mes: 'OCTUBRE', num: 10, prog: 65645.84, comp: 0.00, gir: 0.00, notas: 'Distribución regular programada' },
    { mes: 'NOVIEMBRE', num: 11, prog: 63791.68, comp: 0.00, gir: 0.00, notas: 'Distribución regular programada' },
    { mes: 'DICIEMBRE', num: 12, prog: 65645.84, comp: 0.00, gir: 0.00, notas: 'Cierre anual Meta 228' }
  ];

  for (const m of mesesData) {
    await query(`
      INSERT INTO presupuesto_mensual (anio, mes, mes_numero, programado, comprometido, girado, notas, updated_by)
      VALUES (2026, $1, $2, $3, $4, $5, $6, 'MATRIZ_OFICIAL_30-09-2026')
    `, [m.mes, m.num, m.prog, m.comp, m.gir, m.notas]);
  }

  // B. Actualizar presupuesto_partidas con las 9 partidas oficiales
  await query('DELETE FROM presupuesto_partidas WHERE anio = 2026');
  const partidasOficiales = [
    {
      cod: '2.3.2.7.11',
      partida: 'Alquiler de camión cisterna y equipos :',
      unidad: 'M3',
      cant: 3665.40,
      costo: 60.00,
      prog: 219924.00,
      dev: 0.00,
      gir: 0.00,
      estado: 'EN_EJECUCION'
    },
    {
      cod: '2.3.2.1.2',
      partida: 'Gastos de personal:',
      unidad: 'glb',
      cant: 1.00,
      costo: 46000.00,
      prog: 46000.00,
      dev: 16000.00,
      gir: 16000.00,
      estado: 'EN_EJECUCION'
    },
    {
      cod: '2.3.1.3.1',
      partida: 'Combustible y lubricante',
      unidad: 'mensual',
      cant: 0.00,
      costo: 0.00,
      prog: 0.00,
      dev: 0.00,
      gir: 0.00,
      estado: 'NO_APLICA'
    },
    {
      cod: '2.3.1.99.1',
      partida: 'Mantenimiento y reparación de Maq. y Equipo',
      unidad: 'glb',
      cant: 0.00,
      costo: 0.00,
      prog: 0.00,
      dev: 0.00,
      gir: 0.00,
      estado: 'NO_APLICA'
    },
    {
      cod: '2.3.1.99.2',
      partida: 'Repuestos, accesorios e insumos químicos',
      unidad: 'caja',
      cant: 3.00,
      costo: 1400.00,
      prog: 4200.00,
      dev: 4200.00,
      gir: 4200.00,
      estado: 'COMPLETADO'
    },
    {
      cod: '2.3.2.6.3',
      partida: 'Gastos administrativos',
      unidad: 'glb',
      cant: 1.00,
      costo: 42485.62,
      prog: 42485.62,
      dev: 0.00,
      gir: 0.00,
      estado: 'PROGRAMADO'
    },
    {
      cod: '2.3.2.2.4',
      partida: 'Equipos de protección personal (EPP)',
      unidad: 'glb',
      cant: 1.00,
      costo: 3180.00,
      prog: 3180.00,
      dev: 0.00,
      gir: 0.00,
      estado: 'PROGRAMADO'
    },
    {
      cod: '2.3.2.9.1',
      partida: 'Costo de producción de agua',
      unidad: 'm3',
      cant: 3665.40,
      costo: 2.22,
      prog: 8137.19,
      dev: 0.00,
      gir: 0.00,
      estado: 'EN_EJECUCION'
    },
    {
      cod: '2.3.2.9.9',
      partida: 'Saldo presupuestal no ejecutado por reprogramación temporal ',
      unidad: 'glb',
      cant: 1.00,
      costo: 262985.93,
      prog: 262985.93,
      dev: 0.00,
      gir: 0.00,
      estado: 'REPROGRAMADO'
    }
  ];

  for (const p of partidasOficiales) {
    await query(`
      INSERT INTO presupuesto_partidas 
        (anio, codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado, updated_by)
      VALUES (2026, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'MATRIZ_OFICIAL_30-09-2026')
    `, [p.cod, p.partida, p.unidad, p.cant, p.costo, p.prog, p.dev, p.gir, p.estado]);
  }
  console.log('✅ Presupuesto oficial 2026 configurado: S/. 586,912.74 programado, S/. 20,200.00 devengado.');

  // 6. Programaciones Oficiales: Asignar Conductor (Carlos Ivan Ruiz) y Gestor (Carlos Manuel del Aguila)
  // Actualizar programaciones existentes para que tengan los datos oficiales
  await query(`
    UPDATE programaciones
    SET cisterna_id = $1, conductor_id = $2, ayudante_id = $3
  `, [cisternaId, conductorId, gestorId]);

  // Insertar Primera Programación Oficial (Setiembre 2026 - Primera programación intensiva de la matriz: 894 m3 / 894,000 L)
  const checkProgSet = await query(`
    SELECT id FROM programaciones WHERE fecha = '2026-09-01' OR zona LIKE '%OFICIAL MATRIZ%'
  `);

  let programacionOficialId: number;
  if (checkProgSet.rows.length === 0) {
    const insertProg = await query(`
      INSERT INTO programaciones (
        fecha, zona, estado, cisterna_id, conductor_id, ayudante_id,
        litros_programados, viajes_estimados, dias_semana, sectores_seleccionados,
        fecha_inicio, fecha_fin, es_anual
      )
      VALUES (
        '2026-09-01',
        'ZONAS CONVENIO META 228 (SOL DE INDAÑE, SANTIAGO 8 VALLES, SAN BORJA, EUCALIPTOS, BRISAS DEL MAYO)',
        'Completada',
        $1, $2, $3,
        894000,
        47,
        'Lunes, Martes, Miércoles, Jueves, Viernes, Sábado',
        'SOL DE INDAÑE, SANTIAGO DE LOS 8 VALLES, SAN BORJA, LOS EUCALIPTOS, LAS BRISAS DEL MAYO',
        '2026-09-01', '2026-09-30', false
      )
      RETURNING id;
    `, [cisternaId, conductorId, gestorId]);
    programacionOficialId = insertProg.rows[0].id;
  } else {
    programacionOficialId = checkProgSet.rows[0].id;
  }

  // 7. Cargar el agua entregada histórica oficial de la matriz (660.65 m3 = 660,650 L)
  // Se distribuyen en Agosto (12.95 m3) y Setiembre (647.70 m3) por sector
  const entregasMatriz = [
    // Agosto 2026 (12.95 m³ = 12,950 L)
    { sector: 'SOL DE INDAÑE', fecha: '2026-08-28 10:15:00', litros: 2800, lat: -6.017905, lng: -76.999416, obs: 'Matriz Quincenal Ago-26: Despacho inicial Sol de Indañe' },
    { sector: 'SANTIAGO DE LOS 8 VALLES', fecha: '2026-08-28 11:30:00', litros: 2750, lat: -6.014156, lng: -76.999771, obs: 'Matriz Quincenal Ago-26: Despacho inicial Santiago 8 Valles' },
    { sector: 'SAN BORJA', fecha: '2026-08-29 09:45:00', litros: 550, lat: -6.006800, lng: -76.994000, obs: 'Matriz Quincenal Ago-26: Despacho inicial San Borja' },
    { sector: 'SAN LORENZO', fecha: '2026-08-29 11:00:00', litros: 250, lat: -6.052200, lng: -76.936500, obs: 'Matriz Quincenal Ago-26: Despacho inicial San Lorenzo' },
    { sector: 'LOS EUCALIPTOS', fecha: '2026-08-30 10:00:00', litros: 1600, lat: -6.039319, lng: -76.990462, obs: 'Matriz Quincenal Ago-26: Despacho inicial Los Eucaliptos' },
    { sector: 'LAS BRISAS DEL MAYO', fecha: '2026-08-30 14:20:00', litros: 5000, lat: -6.074017, lng: -76.973760, obs: 'Matriz Quincenal Ago-26: Despacho inicial Las Brisas del Mayo' },

    // Setiembre 2026 (647.70 m³ = 647,700 L)
    { sector: 'SOL DE INDAÑE', fecha: '2026-09-25 09:30:00', litros: 170100, lat: -6.017905, lng: -76.999416, obs: 'Matriz Quincenal Set-26: Volumen acumulado Sol de Indañe (170.10 m³)' },
    { sector: 'SANTIAGO DE LOS 8 VALLES', fecha: '2026-09-26 10:00:00', litros: 161600, lat: -6.014156, lng: -76.999771, obs: 'Matriz Quincenal Set-26: Volumen acumulado Santiago 8 Valles (161.60 m³)' },
    { sector: 'SAN BORJA', fecha: '2026-09-27 11:15:00', litros: 24000, lat: -6.006800, lng: -76.994000, obs: 'Matriz Quincenal Set-26: Volumen acumulado San Borja (24.00 m³)' },
    { sector: 'LOS EUCALIPTOS', fecha: '2026-09-28 14:00:00', litros: 95500, lat: -6.039319, lng: -76.990462, obs: 'Matriz Quincenal Set-26: Volumen acumulado Los Eucaliptos (95.50 m³)' },
    { sector: 'LAS BRISAS DEL MAYO', fecha: '2026-09-29 15:30:00', litros: 196500, lat: -6.074017, lng: -76.973760, obs: 'Matriz Quincenal Set-26: Volumen acumulado Las Brisas del Mayo (196.50 m³)' }
  ];

  // Limpiar entregas de prueba previas si existían con local_id MATRIZ_
  await query("DELETE FROM entregas_agua WHERE local_id LIKE 'MATRIZ_HISTORICA_%'");

  for (let i = 0; i < entregasMatriz.length; i++) {
    const ent = entregasMatriz[i];
    // Obtener un beneficiario representativo del sector para vincular la entrega
    const benRes = await query(`
      SELECT id FROM beneficiarios 
      WHERE UPPER(sector_aahh) LIKE '%' || $1 || '%' OR UPPER(sector) LIKE '%' || $1 || '%'
      LIMIT 1;
    `, [ent.sector]);

    const benId = benRes.rows[0]?.id || null;
    const localId = `MATRIZ_HISTORICA_${i + 1}`;

    await query(`
      INSERT INTO entregas_agua (
        local_id, beneficiario_id, programacion_id, cisterna_id, conductor_id,
        litros_entregados, fecha_hora, latitud, longitud, estado_entrega,
        observaciones_entrega, observaciones, sincronizado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETA', $10, $10, 1)
      ON CONFLICT (local_id) DO UPDATE SET
        litros_entregados = EXCLUDED.litros_entregados,
        fecha_hora = EXCLUDED.fecha_hora,
        observaciones = EXCLUDED.observaciones;
    `, [
      localId,
      benId,
      programacionOficialId,
      cisternaId,
      conductorId,
      ent.litros,
      ent.fecha,
      ent.lat,
      ent.lng,
      ent.obs
    ]);
  }

  console.log('✅ 11 Bloques de volumen histórico cargados en entregas_agua (Total: 660,650 L / 660.65 m³).');

  // 8. Resumen de verificación final
  const totalAgua = await query('SELECT SUM(litros_entregados) as total_lts, ROUND(SUM(litros_entregados)/1000.0, 2) as total_m3 FROM entregas_agua');
  const totalPresupuesto = await query('SELECT SUM(programado) as prog, SUM(devengado) as dev FROM presupuesto_partidas WHERE anio = 2026');

  console.log('🎉 [Migración Completada]');
  console.log(`💧 Agua Total en Producción: ${totalAgua.rows[0].total_lts} L (${totalAgua.rows[0].total_m3} m³)`);
  console.log(`💰 Presupuesto en Producción: Programado S/. ${totalPresupuesto.rows[0].prog} | Devengado S/. ${totalPresupuesto.rows[0].dev}`);
  console.log(`🚚 Conductor Asignado: Carlos Ivan Ruiz Chupillon (DNI: 43654016)`);
  console.log(`🤝 Gestor de Entrega Asignado: Carlos Manuel del Aguila Riva (DNI: 45892100)`);
};

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
  });
