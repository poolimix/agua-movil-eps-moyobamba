import { query } from '../db';

export interface MesPresupuestoRow {
  id: number;
  anio: number;
  mes: string;
  mes_numero: number;
  programado: number;
  comprometido: number;
  girado: number;
  saldo_pendiente: number;
  pct_comprometido: number;
  pct_girado: number;
  notas?: string | null;
  updated_at?: string;
  updated_by?: string;
}

export interface PartidaPresupuestoRow {
  id: number;
  anio: number;
  codigo_partida?: string | null;
  partida: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
  programado: number;
  devengado: number;
  girado: number;
  saldo_disponible: number;
  pct_ejecutado: number;
  estado: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResumenPresupuesto {
  anio: number;
  total_programado: number;
  total_comprometido: number;
  total_girado: number;
  saldo_por_ejecutar: number;
  pct_comprometido: number;
  pct_girado: number;
  meses: MesPresupuestoRow[];
  partidas: PartidaPresupuestoRow[];
}

export const ensurePresupuestoSchema = async () => {
  try {
    // 1. Tabla de Ejecución Mensual
    await query(`
      CREATE TABLE IF NOT EXISTS presupuesto_mensual (
        id SERIAL PRIMARY KEY,
        anio INT NOT NULL DEFAULT 2026,
        mes VARCHAR(30) NOT NULL,
        mes_numero INT NOT NULL,
        programado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        comprometido NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        girado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        notas TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(150) DEFAULT 'SISTEMA',
        CONSTRAINT uq_presupuesto_anio_mes UNIQUE (anio, mes_numero)
      );
    `);

    // 2. Tabla de Partidas Específicas del Convenio
    await query(`
      CREATE TABLE IF NOT EXISTS presupuesto_partidas (
        id SERIAL PRIMARY KEY,
        anio INT NOT NULL DEFAULT 2026,
        codigo_partida VARCHAR(50),
        partida VARCHAR(255) NOT NULL,
        unidad VARCHAR(30) DEFAULT 'meses',
        cantidad NUMERIC(10,2) DEFAULT 1,
        costo_unitario NUMERIC(14,2) DEFAULT 0,
        programado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        devengado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        girado NUMERIC(14,2) NOT NULL DEFAULT 0.00,
        estado VARCHAR(50) DEFAULT 'EN_EJECUCION',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(150) DEFAULT 'SISTEMA'
      );
    `);

    // Auto-seed si la tabla mensual está vacía
    const countRes = await query('SELECT COUNT(*) as count FROM presupuesto_mensual WHERE anio = 2026');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      await query(`
        INSERT INTO presupuesto_mensual (anio, mes, mes_numero, programado, comprometido, girado, notas)
        VALUES 
          (2026, 'ENERO', 1, 0.00, 0.00, 0.00, 'Sin asignación programada'),
          (2026, 'FEBRERO', 2, 0.00, 0.00, 0.00, 'Sin asignación programada'),
          (2026, 'MARZO', 3, 0.00, 0.00, 0.00, 'Inicio preparativo de convenio PNSU'),
          (2026, 'ABRIL', 4, 0.00, 0.00, 0.00, 'Fase administrativa y logística'),
          (2026, 'MAYO', 5, 4000.00, 4000.00, 0.00, 'Gastos iniciales de inspección de cisternas'),
          (2026, 'JUNIO', 6, 4000.00, 4000.00, 4000.00, 'Pago de suministros e insumos químicos'),
          (2026, 'JULIO', 7, 4000.00, 4000.00, 4000.00, 'Mantenimiento y calibración sanitaria'),
          (2026, 'AGOSTO', 8, 14051.78, 9005.75, 4000.00, 'Arranque oficial de rutas de distribución'),
          (2026, 'SETIEMBRE', 9, 102791.68, 66460.89, 8200.00, 'Pico de distribución y abastecimiento continuo'),
          (2026, 'OCTUBRE', 10, 65645.84, 0.00, 0.00, 'Distribución regular en sectores periurbanos'),
          (2026, 'NOVIEMBRE', 11, 63791.68, 0.00, 0.00, 'Distribución regular programada'),
          (2026, 'DICIEMBRE', 12, 65645.84, 0.00, 0.00, 'Cierre de ciclo anual convenio PNSU')
        ON CONFLICT DO NOTHING;
      `);
    }

    // Auto-seed si la tabla de partidas está vacía
    const countPartidas = await query('SELECT COUNT(*) as count FROM presupuesto_partidas WHERE anio = 2026');
    if (parseInt(countPartidas.rows[0].count, 10) === 0) {
      await query(`
        INSERT INTO presupuesto_partidas (anio, codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado)
        VALUES 
          (2026, '2.3.2.7.11', 'Alquiler de camión cisterna y equipos de bombeo', 'meses', 4, 54882.75, 219531.02, 16000.00, 16000.00, 'EN_EJECUCION'),
          (2026, '2.3.2.1.2', 'Gastos de personal operativo (choferes y ayudantes)', 'meses', 4, 12000.00, 48000.00, 0.00, 0.00, 'EN_EJECUCION'),
          (2026, '2.3.1.3.1', 'Combustible y lubricantes (Diesel B5 para cisternas)', 'galones', 2500, 18.88, 47195.80, 0.00, 0.00, 'PROGRAMADO'),
          (2026, '2.3.1.99.1', 'Repuestos, accesorios e insumos químicos de cloración', 'caja', 3, 1400.00, 4200.00, 4200.00, 4200.00, 'COMPLETADO'),
          (2026, '2.3.2.6.3', 'Seguro contra accidentes, SOAT y pólizas de cisterna', 'póliza', 2, 2500.00, 5000.00, 0.00, 0.00, 'PROGRAMADO')
        ON CONFLICT DO NOTHING;
      `);
    }
  } catch (err) {
    console.error('Error en ensurePresupuestoSchema:', err);
  }
};

/**
 * Obtener consolidado completo de Ejecución Presupuestal
 */
export const getEjecucionPresupuestal = async (anio: number = 2026): Promise<ResumenPresupuesto> => {
  await ensurePresupuestoSchema();

  // 1. Obtener meses
  const mesesRes = await query(
    `SELECT id, anio, mes, mes_numero, programado, comprometido, girado, notas, updated_at, updated_by
     FROM presupuesto_mensual
     WHERE anio = $1
     ORDER BY mes_numero ASC`,
    [anio]
  );

  let totalProgramado = 0;
  let totalComprometido = 0;
  let totalGirado = 0;

  const meses: MesPresupuestoRow[] = mesesRes.rows.map((r: any) => {
    const prog = parseFloat(r.programado) || 0;
    const comp = parseFloat(r.comprometido) || 0;
    const gir = parseFloat(r.girado) || 0;
    const saldo = Math.max(0, prog - comp);
    const pctComp = prog > 0 ? Number(((comp / prog) * 100).toFixed(1)) : 0;
    const pctGir = prog > 0 ? Number(((gir / prog) * 100).toFixed(1)) : 0;

    totalProgramado += prog;
    totalComprometido += comp;
    totalGirado += gir;

    return {
      id: r.id,
      anio: r.anio,
      mes: r.mes,
      mes_numero: r.mes_numero,
      programado: prog,
      comprometido: comp,
      girado: gir,
      saldo_pendiente: Number(saldo.toFixed(2)),
      pct_comprometido: pctComp,
      pct_girado: pctGir,
      notas: r.notas,
      updated_at: r.updated_at,
      updated_by: r.updated_by,
    };
  });

  // 2. Obtener partidas
  const partidasRes = await query(
    `SELECT id, anio, codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado, created_at, updated_at
     FROM presupuesto_partidas
     WHERE anio = $1
     ORDER BY id ASC`,
    [anio]
  );

  const partidas: PartidaPresupuestoRow[] = partidasRes.rows.map((r: any) => {
    const prog = parseFloat(r.programado) || 0;
    const dev = parseFloat(r.devengado) || 0;
    const gir = parseFloat(r.girado) || 0;
    const saldo = Math.max(0, prog - dev);
    const pct = prog > 0 ? Number(((dev / prog) * 100).toFixed(1)) : 0;

    return {
      id: r.id,
      anio: r.anio,
      codigo_partida: r.codigo_partida,
      partida: r.partida,
      unidad: r.unidad || 'meses',
      cantidad: parseFloat(r.cantidad) || 1,
      costo_unitario: parseFloat(r.costo_unitario) || 0,
      programado: prog,
      devengado: dev,
      girado: gir,
      saldo_disponible: Number(saldo.toFixed(2)),
      pct_ejecutado: pct,
      estado: r.estado || 'EN_EJECUCION',
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  totalProgramado = Number(totalProgramado.toFixed(2));
  totalComprometido = Number(totalComprometido.toFixed(2));
  totalGirado = Number(totalGirado.toFixed(2));
  const saldoPorEjecutar = Math.max(0, Number((totalProgramado - totalComprometido).toFixed(2)));
  const pctComprometido = totalProgramado > 0 ? Number(((totalComprometido / totalProgramado) * 100).toFixed(1)) : 0;
  const pctGirado = totalProgramado > 0 ? Number(((totalGirado / totalProgramado) * 100).toFixed(1)) : 0;

  return {
    anio,
    total_programado: totalProgramado,
    total_comprometido: totalComprometido,
    total_girado: totalGirado,
    saldo_por_ejecutar: saldoPorEjecutar,
    pct_comprometido: pctComprometido,
    pct_girado: pctGirado,
    meses,
    partidas,
  };
};

/**
 * CRUD MES: Crear nuevo mes
 */
export const createMesPresupuesto = async (
  data: {
    anio: number;
    mes: string;
    mes_numero: number;
    programado: number;
    comprometido?: number;
    girado?: number;
    notas?: string;
  },
  userEmail: string = 'ADMIN'
) => {
  await ensurePresupuestoSchema();

  const res = await query(
    `INSERT INTO presupuesto_mensual (anio, mes, mes_numero, programado, comprometido, girado, notas, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)
     RETURNING *`,
    [
      data.anio || 2026,
      String(data.mes).trim().toUpperCase(),
      Number(data.mes_numero),
      Math.max(0, Number(data.programado) || 0),
      Math.max(0, Number(data.comprometido) || 0),
      Math.max(0, Number(data.girado) || 0),
      data.notas || null,
      userEmail,
    ]
  );

  return res.rows[0];
};

/**
 * CRUD MES: Actualizar mes existente
 */
export const updateMesPresupuesto = async (
  id: number,
  data: {
    programado?: number;
    comprometido?: number;
    girado?: number;
    notas?: string;
    mes?: string;
  },
  userEmail: string = 'ADMIN'
) => {
  await ensurePresupuestoSchema();

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP', `updated_by = '${userEmail}'`];
  const values: any[] = [];

  if (data.programado !== undefined) {
    values.push(Math.max(0, Number(data.programado) || 0));
    updates.push(`programado = $${values.length}`);
  }
  if (data.comprometido !== undefined) {
    values.push(Math.max(0, Number(data.comprometido) || 0));
    updates.push(`comprometido = $${values.length}`);
  }
  if (data.girado !== undefined) {
    values.push(Math.max(0, Number(data.girado) || 0));
    updates.push(`girado = $${values.length}`);
  }
  if (data.notas !== undefined) {
    values.push(data.notas);
    updates.push(`notas = $${values.length}`);
  }
  if (data.mes !== undefined) {
    values.push(String(data.mes).trim().toUpperCase());
    updates.push(`mes = $${values.length}`);
  }

  values.push(id);
  const sql = `
    UPDATE presupuesto_mensual
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const res = await query(sql, values);
  return res.rows[0];
};

/**
 * CRUD MES: Eliminar mes
 */
export const deleteMesPresupuesto = async (id: number) => {
  await ensurePresupuestoSchema();
  const res = await query('DELETE FROM presupuesto_mensual WHERE id = $1 RETURNING id, mes, anio', [id]);
  return res.rows[0];
};

/**
 * CRUD PARTIDA: Crear partida de gasto
 */
export const createPartidaPresupuesto = async (
  data: {
    anio?: number;
    codigo_partida?: string;
    partida: string;
    unidad?: string;
    cantidad?: number;
    costo_unitario?: number;
    programado: number;
    devengado?: number;
    girado?: number;
    estado?: string;
  },
  userEmail: string = 'ADMIN'
) => {
  await ensurePresupuestoSchema();

  const res = await query(
    `INSERT INTO presupuesto_partidas 
     (anio, codigo_partida, partida, unidad, cantidad, costo_unitario, programado, devengado, girado, estado, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)
     RETURNING *`,
    [
      data.anio || 2026,
      data.codigo_partida || null,
      String(data.partida).trim(),
      data.unidad || 'meses',
      Math.max(0, Number(data.cantidad) || 1),
      Math.max(0, Number(data.costo_unitario) || 0),
      Math.max(0, Number(data.programado) || 0),
      Math.max(0, Number(data.devengado) || 0),
      Math.max(0, Number(data.girado) || 0),
      data.estado || 'EN_EJECUCION',
      userEmail,
    ]
  );

  return res.rows[0];
};

/**
 * CRUD PARTIDA: Actualizar partida de gasto
 */
export const updatePartidaPresupuesto = async (
  id: number,
  data: Partial<PartidaPresupuestoRow>,
  userEmail: string = 'ADMIN'
) => {
  await ensurePresupuestoSchema();

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP', `updated_by = '${userEmail}'`];
  const values: any[] = [];

  if (data.partida !== undefined) {
    values.push(String(data.partida).trim());
    updates.push(`partida = $${values.length}`);
  }
  if (data.codigo_partida !== undefined) {
    values.push(data.codigo_partida ? String(data.codigo_partida).trim() : null);
    updates.push(`codigo_partida = $${values.length}`);
  }
  if (data.unidad !== undefined) {
    values.push(String(data.unidad).trim());
    updates.push(`unidad = $${values.length}`);
  }
  if (data.cantidad !== undefined) {
    values.push(Math.max(0, Number(data.cantidad) || 0));
    updates.push(`cantidad = $${values.length}`);
  }
  if (data.costo_unitario !== undefined) {
    values.push(Math.max(0, Number(data.costo_unitario) || 0));
    updates.push(`costo_unitario = $${values.length}`);
  }
  if (data.programado !== undefined) {
    values.push(Math.max(0, Number(data.programado) || 0));
    updates.push(`programado = $${values.length}`);
  }
  if (data.devengado !== undefined) {
    values.push(Math.max(0, Number(data.devengado) || 0));
    updates.push(`devengado = $${values.length}`);
  }
  if (data.girado !== undefined) {
    values.push(Math.max(0, Number(data.girado) || 0));
    updates.push(`girado = $${values.length}`);
  }
  if (data.estado !== undefined) {
    values.push(String(data.estado).trim().toUpperCase());
    updates.push(`estado = $${values.length}`);
  }

  values.push(id);
  const sql = `
    UPDATE presupuesto_partidas
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const res = await query(sql, values);
  return res.rows[0];
};

/**
 * CRUD PARTIDA: Eliminar partida
 */
export const deletePartidaPresupuesto = async (id: number) => {
  await ensurePresupuestoSchema();
  const res = await query('DELETE FROM presupuesto_partidas WHERE id = $1 RETURNING id, partida', [id]);
  return res.rows[0];
};

/**
 * Restablecer valores predeterminados del Convenio PNSU
 */
export const restablecerDefaultsPresupuesto = async (anio: number = 2026, userEmail: string = 'ADMIN') => {
  await ensurePresupuestoSchema();
  await query('DELETE FROM presupuesto_mensual WHERE anio = $1', [anio]);
  await query('DELETE FROM presupuesto_partidas WHERE anio = $1', [anio]);
  await ensurePresupuestoSchema();
  return await getEjecucionPresupuestal(anio);
};
