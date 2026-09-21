import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import { query } from '../db';
import { DOTACION_POR_HABITANTE, LITROS_POR_M3 } from '../config/constants';

export const getAllBeneficiarios = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, sector } = req.query;

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
      const offset = (pageNum - 1) * limitNum;

      let whereClauses: string[] = [];
      let params: any[] = [];

      if (search) {
        params.push(`%${String(search).trim()}%`);
        whereClauses.push(`(dni ILIKE $${params.length} OR nombres_apellidos ILIKE $${params.length} OR calle_direccion ILIKE $${params.length})`);
      }

      if (sector) {
        params.push(String(sector).trim());
        whereClauses.push(`COALESCE(sector_aahh, sector) = $${params.length}`);
      }

      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countRes = await query(`SELECT COUNT(*) as total FROM beneficiarios ${whereStr}`, params);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const dataQuery = `
        SELECT 
          id,
          dni,
          COALESCE(nombres, SPLIT_PART(nombres_apellidos, ' ', 1), '') as nombres,
          COALESCE(apellidos, SUBSTRING(nombres_apellidos FROM LENGTH(SPLIT_PART(nombres_apellidos, ' ', 1)) + 2), '') as apellidos,
          nombres_apellidos,
          COALESCE(distrito, 'Moyobamba') as distrito,
          COALESCE(sector_aahh, sector, '') as sector_aahh,
          COALESCE(sector_aahh, sector, '') as sector,
          COALESCE(num_vivienda, '') as num_vivienda,
          COALESCE(num_miembros, 1) as num_miembros,
          COALESCE(mz, '') as mz,
          COALESCE(lt, '') as lt,
          COALESCE(calle_direccion, direccion, '') as calle_direccion,
          COALESCE(calle_direccion, direccion, '') as direccion,
          COALESCE(telefono, '') as telefono,
          COALESCE(email, '') as email,
          (COALESCE(num_miembros, 1) * ${DOTACION_POR_HABITANTE}) as litros_sugeridos
        FROM beneficiarios 
        ${whereStr}
        ORDER BY id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const result = await query(dataQuery, [...params, limitNum, offset]);

      return res.json({
        data: result.rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        }
      });
    }

    // Retorno estándar completo sin paginación (para compatibilidad total)
    const result = await query(`
      SELECT 
        id,
        dni,
        COALESCE(nombres, SPLIT_PART(nombres_apellidos, ' ', 1), '') as nombres,
        COALESCE(apellidos, SUBSTRING(nombres_apellidos FROM LENGTH(SPLIT_PART(nombres_apellidos, ' ', 1)) + 2), '') as apellidos,
        nombres_apellidos,
        COALESCE(distrito, 'Moyobamba') as distrito,
        COALESCE(sector_aahh, sector, '') as sector_aahh,
        COALESCE(sector_aahh, sector, '') as sector,
        COALESCE(num_vivienda, '') as num_vivienda,
        COALESCE(num_miembros, 1) as num_miembros,
        COALESCE(mz, '') as mz,
        COALESCE(lt, '') as lt,
        COALESCE(calle_direccion, direccion, '') as calle_direccion,
        COALESCE(calle_direccion, direccion, '') as direccion,
        COALESCE(telefono, '') as telefono,
        COALESCE(email, '') as email,
        (COALESCE(num_miembros, 1) * ${DOTACION_POR_HABITANTE}) as litros_sugeridos
      FROM beneficiarios 
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching beneficiarios:', error);
    res.status(500).json({ message: 'Error fetching beneficiarios', error: error.message });
  }
};

export const getBeneficiarioByDni = async (req: Request, res: Response) => {
  try {
    const { dni } = req.params;
    const { programacion_id } = req.query;

    const result = await query(`
      SELECT 
        id,
        dni,
        COALESCE(nombres, SPLIT_PART(nombres_apellidos, ' ', 1), '') as nombres,
        COALESCE(apellidos, SUBSTRING(nombres_apellidos FROM LENGTH(SPLIT_PART(nombres_apellidos, ' ', 1)) + 2), '') as apellidos,
        nombres_apellidos,
        COALESCE(distrito, 'Moyobamba') as distrito,
        COALESCE(sector_aahh, sector, '') as sector_aahh,
        COALESCE(sector_aahh, sector, '') as sector,
        COALESCE(num_vivienda, '') as num_vivienda,
        COALESCE(num_miembros, 1) as num_miembros,
        COALESCE(mz, '') as mz,
        COALESCE(lt, '') as lt,
        COALESCE(calle_direccion, direccion, '') as calle_direccion,
        COALESCE(calle_direccion, direccion, '') as direccion,
        COALESCE(telefono, '') as telefono,
        COALESCE(email, '') as email,
        (COALESCE(num_miembros, 1) * ${DOTACION_POR_HABITANTE}) as litros_sugeridos
      FROM beneficiarios 
      WHERE dni = $1
      LIMIT 1
    `, [String(dni).trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `Beneficiario con DNI ${dni} no encontrado en el sistema.` });
    }

    const benef = result.rows[0];

    // Si se pasa programacion_id, consultar entregas previas y calcular saldo
    if (programacion_id) {
      const progIdNum = parseInt(String(programacion_id), 10);
      const prevEntregasRes = await query(`
        SELECT 
          COALESCE(SUM(litros_entregados), 0) as total_entregado,
          COUNT(*) as num_entregas
        FROM entregas_agua 
        WHERE beneficiario_id = $1 AND programacion_id = $2
      `, [benef.id, progIdNum]);

      const totalEntregado = parseFloat(prevEntregasRes.rows[0]?.total_entregado || '0');
      const cuotaTotal = parseFloat(benef.litros_sugeridos || '50');
      const saldoRestante = Math.max(0, cuotaTotal - totalEntregado);

      benef.total_entregado_programacion = totalEntregado;
      benef.saldo_pendiente_programacion = saldoRestante;
      benef.tiene_entrega_previa = totalEntregado > 0;
      benef.es_parcial_previa = saldoRestante > 0 && totalEntregado > 0;
    }

    res.json(benef);
  } catch (error: any) {
    console.error('Error searching beneficiario by DNI:', error);
    res.status(500).json({ message: 'Error al buscar beneficiario', error: error.message });
  }
};

export const createBeneficiario = async (req: Request, res: Response) => {
  try {
    const {
      dni,
      nombres,
      apellidos,
      nombres_apellidos,
      distrito = 'Moyobamba',
      sector_aahh,
      sector,
      num_vivienda,
      num_miembros = 1,
      mz,
      lt,
      calle_direccion,
      direccion,
      telefono,
      email,
    } = req.body;

    const nombresVal = nombres ? nombres.trim() : '';
    const apellidosVal = apellidos ? apellidos.trim() : '';
    const fullName = (nombresVal && apellidosVal)
      ? `${nombresVal} ${apellidosVal}`
      : (nombres_apellidos ? nombres_apellidos.trim() : `${nombresVal}${apellidosVal}`);

    const sectorVal = sector_aahh || sector || '';
    const direccionVal = calle_direccion || direccion || '';
    const miembrosNum = parseInt(num_miembros, 10) || 1;

    const insertQuery = `
      INSERT INTO beneficiarios (
        dni, nombres, apellidos, nombres_apellidos, distrito, sector_aahh, sector,
        num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono, email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $11, $12, $13)
      ON CONFLICT (dni) DO UPDATE 
      SET nombres = EXCLUDED.nombres,
          apellidos = EXCLUDED.apellidos,
          nombres_apellidos = EXCLUDED.nombres_apellidos,
          distrito = EXCLUDED.distrito,
          sector_aahh = EXCLUDED.sector_aahh,
          sector = EXCLUDED.sector,
          num_vivienda = EXCLUDED.num_vivienda,
          num_miembros = EXCLUDED.num_miembros,
          mz = EXCLUDED.mz,
          lt = EXCLUDED.lt,
          calle_direccion = EXCLUDED.calle_direccion,
          direccion = EXCLUDED.direccion,
          telefono = EXCLUDED.telefono,
          email = EXCLUDED.email
      RETURNING *, (num_miembros * ${DOTACION_POR_HABITANTE}) as litros_sugeridos;
    `;

    const result = await query(insertQuery, [
      dni.trim(),
      nombresVal,
      apellidosVal,
      fullName,
      distrito,
      sectorVal,
      num_vivienda || '',
      miembrosNum,
      mz || '',
      lt || '',
      direccionVal,
      telefono || '',
      email ? email.trim().toLowerCase() : null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating beneficiario:', error);
    res.status(500).json({ message: 'Error creating beneficiario', error: error.message });
  }
};

export const updateBeneficiario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      dni,
      nombres,
      apellidos,
      nombres_apellidos,
      distrito = 'Moyobamba',
      sector_aahh,
      sector,
      num_vivienda,
      num_miembros = 1,
      mz,
      lt,
      calle_direccion,
      direccion,
      telefono,
      email,
    } = req.body;

    const nombresVal = nombres ? nombres.trim() : '';
    const apellidosVal = apellidos ? apellidos.trim() : '';
    const fullName = (nombresVal && apellidosVal)
      ? `${nombresVal} ${apellidosVal}`
      : (nombres_apellidos ? nombres_apellidos.trim() : `${nombresVal}${apellidosVal}`);

    const sectorVal = sector_aahh || sector || '';
    const direccionVal = calle_direccion || direccion || '';
    const miembrosNum = parseInt(num_miembros, 10) || 1;

    const updateQuery = `
      UPDATE beneficiarios
      SET dni = $1,
          nombres = $2,
          apellidos = $3,
          nombres_apellidos = $4,
          distrito = $5,
          sector_aahh = $6,
          sector = $6,
          num_vivienda = $7,
          num_miembros = $8,
          mz = $9,
          lt = $10,
          calle_direccion = $11,
          direccion = $11,
          telefono = $12,
          email = $13
      WHERE id = $14
      RETURNING *, (num_miembros * ${DOTACION_POR_HABITANTE}) as litros_sugeridos;
    `;

    const result = await query(updateQuery, [
      dni.trim(),
      nombresVal,
      apellidosVal,
      fullName,
      distrito,
      sectorVal,
      num_vivienda || '',
      miembrosNum,
      mz || '',
      lt || '',
      direccionVal,
      telefono || '',
      email ? email.trim().toLowerCase() : null,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Beneficiario no encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating beneficiario:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ya existe otro beneficiario registrado con ese DNI.' });
    }
    res.status(500).json({ message: 'Error updating beneficiario', error: error.message });
  }
};

export const deleteBeneficiario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM entregas_agua WHERE beneficiario_id = $1', [id]);
    await query('DELETE FROM beneficiarios WHERE id = $1', [id]);
    res.json({ message: 'Beneficiario eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting beneficiario:', error);
    res.status(500).json({ message: 'Error deleting beneficiario', error: error.message });
  }
};

export const importExcel = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se subió ningún archivo Excel.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    
    // Find sheet (Prefer "ANEXO 1", "ANEXO1", "PADRON" or first sheet)
    const targetSheetName = workbook.SheetNames.find(s => 
      s.toUpperCase().includes('ANEXO 1') || 
      s.toUpperCase().includes('ANEXO1') || 
      s.toUpperCase().includes('PADRON') || 
      s.toUpperCase().includes('BENEFICIARIOS')
    ) || workbook.SheetNames[0];

    const sheet = workbook.Sheets[targetSheetName];
    
    // Parse as 2D array or objects
    const rawRows = xlsx.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' });
    
    let currentSector = '';
    let currentDistrito = 'Moyobamba';
    let headerRowIdx = -1;
    let colMap: { [key: string]: number } = {};

    let importedCount = 0;
    const sectorsSummary: { [sector: string]: { beneficiarios: number; miembros: number; m3: number; litros: number } } = {};

    // Analyze rows
    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rowStr = row.map(c => String(c).trim()).join(' ');

      const sectorMatch = rowStr.match(/(?:SECTOR|AA\.?HH\.?|BARRIO|URB\.?)\s*[:\-]?\s*([A-Za-z0-9\sÁÉÍÓÚáéíóúÑñ]+)/i);
      if (sectorMatch && !rowStr.includes('DNI') && !rowStr.includes('NOMBRES')) {
        currentSector = sectorMatch[1].trim();
      }

      const hasDni = row.some((c: any) => /DNI|DOCUMENTO/i.test(String(c)));
      const hasNombres = row.some((c: any) => /NOMBRE|APELLIDO|BENEFICIARIO|TITULAR/i.test(String(c)));

      if (hasDni && hasNombres) {
        headerRowIdx = r;
        colMap = {};
        row.forEach((cellVal: any, colIdx: number) => {
          const val = String(cellVal).toUpperCase().trim();
          if (/DNI|DOCUMENTO/i.test(val)) colMap['dni'] = colIdx;
          else if (/NOMBRE|APELLIDO|BENEFICIARIO|TITULAR/i.test(val)) colMap['nombres'] = colIdx;
          else if (/DISTRITO/i.test(val)) colMap['distrito'] = colIdx;
          else if (/SECTOR|AA\.?HH/i.test(val)) colMap['sector'] = colIdx;
          else if (/VIVIENDA|CASA|N[°º]\s*VIV/i.test(val)) colMap['num_vivienda'] = colIdx;
          else if (/MIEMBRO|HABITANTE|PERSONA|INTEGRANTE/i.test(val)) colMap['num_miembros'] = colIdx;
          else if (/^MZ|^MANZANA/i.test(val)) colMap['mz'] = colIdx;
          else if (/^LT|^LOTE/i.test(val)) colMap['lt'] = colIdx;
          else if (/CALLE|DIRECCI[OÓ]N|JR|AV/i.test(val)) colMap['direccion'] = colIdx;
          else if (/TEL[EÉ]FONO|CELULAR|MOVIL/i.test(val)) colMap['telefono'] = colIdx;
        });
        continue;
      }

      if (headerRowIdx !== -1 && r > headerRowIdx) {
        const dniRaw = colMap['dni'] !== undefined ? String(row[colMap['dni']]).trim() : '';
        const nombresRaw = colMap['nombres'] !== undefined ? String(row[colMap['nombres']]).trim() : '';

        if (!dniRaw || !nombresRaw || dniRaw.toLowerCase() === 'dni') continue;

        const distrito = colMap['distrito'] !== undefined && row[colMap['distrito']] 
          ? String(row[colMap['distrito']]).trim() 
          : currentDistrito;

        const sector = colMap['sector'] !== undefined && row[colMap['sector']] 
          ? String(row[colMap['sector']]).trim() 
          : (currentSector || 'Sector General');

        const numVivienda = colMap['num_vivienda'] !== undefined ? String(row[colMap['num_vivienda']]).trim() : '';
        
        let numMiembros = 1;
        if (colMap['num_miembros'] !== undefined) {
          const parsed = parseInt(String(row[colMap['num_miembros']]).replace(/\D/g, ''), 10);
          if (!isNaN(parsed) && parsed > 0) numMiembros = parsed;
        }

        const mz = colMap['mz'] !== undefined ? String(row[colMap['mz']]).trim() : '';
        const lt = colMap['lt'] !== undefined ? String(row[colMap['lt']]).trim() : '';
        const direccion = colMap['direccion'] !== undefined ? String(row[colMap['direccion']]).trim() : '';
        const telefono = colMap['telefono'] !== undefined ? String(row[colMap['telefono']]).trim() : '';

        const insertQuery = `
          INSERT INTO beneficiarios (
            dni, nombres_apellidos, distrito, sector_aahh, sector,
            num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $9, $10)
          ON CONFLICT (dni) DO UPDATE 
          SET nombres_apellidos = EXCLUDED.nombres_apellidos,
              distrito = EXCLUDED.distrito,
              sector_aahh = EXCLUDED.sector_aahh,
              sector = EXCLUDED.sector,
              num_vivienda = EXCLUDED.num_vivienda,
              num_miembros = EXCLUDED.num_miembros,
              mz = EXCLUDED.mz,
              lt = EXCLUDED.lt,
              calle_direccion = EXCLUDED.calle_direccion,
              direccion = EXCLUDED.direccion,
              telefono = EXCLUDED.telefono;
        `;

        await query(insertQuery, [dniRaw, nombresRaw, distrito, sector, numVivienda, numMiembros, mz, lt, direccion, telefono]);
        importedCount++;

        if (!sectorsSummary[sector]) {
          sectorsSummary[sector] = { beneficiarios: 0, miembros: 0, m3: 0, litros: 0 };
        }
        sectorsSummary[sector].beneficiarios += 1;
        sectorsSummary[sector].miembros += numMiembros;
        const litros = numMiembros * DOTACION_POR_HABITANTE;
        sectorsSummary[sector].litros += litros;
        sectorsSummary[sector].m3 = parseFloat((sectorsSummary[sector].litros / LITROS_POR_M3).toFixed(2));
      }
    }

    if (importedCount === 0) {
      const jsonData = xlsx.utils.sheet_to_json<any>(sheet);
      for (const item of jsonData) {
        const dni = item['DNI'] || item['Dni'] || item['dni'] || item['DOCUMENTO'];
        const nombres = item['Nombres y Apellidos'] || item['NOMBRES Y APELLIDOS'] || item['NOMBRES'] || item['Titular'];
        if (!dni || !nombres) continue;

        const distrito = item['Distrito'] || item['DISTRITO'] || 'Moyobamba';
        const sector = item['AA.HH/Sector'] || item['SECTOR / AA.HH'] || item['Sector'] || item['SECTOR'] || 'Sector General';
        const numVivienda = item['N° de Vivienda'] || item['N° Vivienda'] || item['Vivienda'] || '';
        const numMiembros = parseInt(item['N° de Miembros'] || item['N° Miembros'] || item['Miembros'] || '1', 10) || 1;
        const mz = item['Mz'] || item['MZ'] || '';
        const lt = item['Lt'] || item['LT'] || '';
        const direccion = item['Dirección'] || item['DIRECCION'] || item['Calle'] || item['CALLE / DIRECCIÓN'] || '';
        const telefono = item['Teléfono'] || item['TELEFONO'] || item['Celular'] || '';

        const insertQuery = `
          INSERT INTO beneficiarios (
            dni, nombres_apellidos, distrito, sector_aahh, sector,
            num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $9, $10)
          ON CONFLICT (dni) DO UPDATE 
          SET nombres_apellidos = EXCLUDED.nombres_apellidos,
              distrito = EXCLUDED.distrito,
              sector_aahh = EXCLUDED.sector_aahh,
              sector = EXCLUDED.sector,
              num_vivienda = EXCLUDED.num_vivienda,
              num_miembros = EXCLUDED.num_miembros,
              mz = EXCLUDED.mz,
              lt = EXCLUDED.lt,
              calle_direccion = EXCLUDED.calle_direccion,
              direccion = EXCLUDED.direccion,
              telefono = EXCLUDED.telefono;
        `;

        await query(insertQuery, [String(dni).trim(), String(nombres).trim(), distrito, sector, String(numVivienda), numMiembros, String(mz), String(lt), String(direccion), String(telefono)]);
        importedCount++;

        if (!sectorsSummary[sector]) {
          sectorsSummary[sector] = { beneficiarios: 0, miembros: 0, m3: 0, litros: 0 };
        }
        sectorsSummary[sector].beneficiarios += 1;
        sectorsSummary[sector].miembros += numMiembros;
        const litros = numMiembros * DOTACION_POR_HABITANTE;
        sectorsSummary[sector].litros += litros;
        sectorsSummary[sector].m3 = parseFloat((sectorsSummary[sector].litros / LITROS_POR_M3).toFixed(2));
      }
    }

    const totalLitros = Object.values(sectorsSummary).reduce((acc, s) => acc + s.litros, 0);
    const totalM3 = parseFloat((totalLitros / LITROS_POR_M3).toFixed(2));

    res.status(200).json({
      message: `Padrón ANEXO 1 procesado con éxito: ${importedCount} beneficiarios importados.`,
      importedCount,
      dotacionPorHabitante: DOTACION_POR_HABITANTE,
      totalLitros,
      totalM3,
      sectores: sectorsSummary
    });
  } catch (error: any) {
    console.error('Error importing excel:', error);
    res.status(500).json({ message: 'Error interno al procesar archivo Excel', error: error.message });
  }
};

/**
 * Exportar Padrón General de Beneficiarios (ANEXO 1) a Excel
 */
export const exportarBeneficiariosExcel = async (req: Request, res: Response) => {
  try {
    const { search, sector } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      whereClauses.push(`(b.dni ILIKE $${params.length} OR b.nombres_apellidos ILIKE $${params.length} OR b.calle_direccion ILIKE $${params.length} OR b.direccion ILIKE $${params.length})`);
    }

    if (sector) {
      params.push(String(sector).trim());
      whereClauses.push(`COALESCE(b.sector_aahh, b.sector) = $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT 
        b.id,
        b.dni,
        b.nombres_apellidos,
        COALESCE(b.distrito, 'Moyobamba') as distrito,
        COALESCE(b.sector_aahh, b.sector, '') as sector,
        COALESCE(b.mz, '') as mz,
        COALESCE(b.lt, '') as lt,
        COALESCE(b.calle_direccion, b.direccion, '') as direccion,
        COALESCE(b.num_miembros, 1) as num_miembros,
        COALESCE(b.telefono, '') as telefono,
        e.latitud,
        e.longitud,
        (COALESCE(b.num_miembros, 1) * ${DOTACION_POR_HABITANTE}) as dotacion_diaria_litros,
        'ACTIVO' as estado_servicio
      FROM beneficiarios b
      LEFT JOIN LATERAL (
        SELECT ea.latitud, ea.longitud 
        FROM entregas_agua ea 
        WHERE ea.beneficiario_id = b.id AND ea.latitud IS NOT NULL 
        ORDER BY ea.id DESC LIMIT 1
      ) e ON TRUE
      ${whereStr}
      ORDER BY COALESCE(b.sector_aahh, b.sector) ASC, b.nombres_apellidos ASC
    `;

    const result = await query(sql, params);
    const beneficiarios = result.rows;

    const wb = xlsx.utils.book_new();

    const rows: any[][] = [
      ['PADRÓN GENERAL DE BENEFICIARIOS — CATASTRO OFICIAL ANEXO 1'],
      ['PROGRAMA NACIONAL DE SANEAMIENTO URBANO (PNSU) • EPS MOYOBAMBA S.A.'],
      [`CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE • TOTAL FAMILIAS EMPADRONADAS: ${beneficiarios.length}`],
      [],
      ['N°', 'DNI', 'APELLIDOS Y NOMBRES', 'SECTOR / AA.HH.', 'MZ', 'LOTE', 'DIRECCIÓN / REFERENCIA', 'N° MIEMBROS', 'DOTACIÓN (L/DÍA)', 'TELÉFONO', 'LATITUD', 'LONGITUD', 'ESTADO']
    ];

    beneficiarios.forEach((b: any, idx: number) => {
      rows.push([
        idx + 1,
        b.dni,
        b.nombres_apellidos,
        b.sector,
        b.mz,
        b.lt,
        b.direccion,
        Number(b.num_miembros || 1),
        Number(b.dotacion_diaria_litros || 50),
        b.telefono || '-',
        b.latitud || '-',
        b.longitud || '-',
        b.estado_servicio || 'ACTIVO'
      ]);
    });

    const ws = xlsx.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 34 },
      { wch: 26 },
      { wch: 8 },
      { wch: 8 },
      { wch: 32 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 }
    ];
    xlsx.utils.book_append_sheet(wb, ws, 'Padron_Beneficiarios');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Padron_Beneficiarios_Anexo1_EPS_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error exportando padrón a Excel:', error);
    res.status(500).json({ message: 'Error exportando Excel', error: error.message });
  }
};
