import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import { query } from '../db';
import { DOTACION_POR_HABITANTE, DIAS_ENTREGA_SEMANAL, DOTACION_SEMANAL_POR_HABITANTE, LITROS_POR_M3 } from '../config/constants';
import { getConfiguracion } from '../services/configuracion.service';

export const getAllBeneficiarios = async (req: Request, res: Response) => {
  try {
    const config = await getConfiguracion();
    const dotacionDiaria = config.dotacion_diaria_litros;
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

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
          (COALESCE(num_miembros, 1) * ${dotacionDiaria}) as dotacion_diaria_litros,
          (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as dotacion_semanal_litros,
          (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as litros_sugeridos
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
        (COALESCE(num_miembros, 1) * ${dotacionDiaria}) as dotacion_diaria_litros,
        (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as dotacion_semanal_litros,
        (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as litros_sugeridos
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
    const config = await getConfiguracion();
    const dotacionDiaria = config.dotacion_diaria_litros;
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

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
        (COALESCE(num_miembros, 1) * ${dotacionDiaria}) as dotacion_diaria_litros,
        (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as dotacion_semanal_litros,
        (COALESCE(num_miembros, 1) * ${dotacionSemanal}) as litros_sugeridos
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
      const cuotaTotal = parseFloat(benef.litros_sugeridos || String(dotacionSemanal));
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

    const config = await getConfiguracion();
    const dotacionDiaria = config.dotacion_diaria_litros;
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

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
      RETURNING *, 
        (num_miembros * ${dotacionDiaria}) as dotacion_diaria_litros,
        (num_miembros * ${dotacionSemanal}) as dotacion_semanal_litros,
        (num_miembros * ${dotacionSemanal}) as litros_sugeridos;
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

    const config = await getConfiguracion();
    const dotacionDiaria = config.dotacion_diaria_litros;
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

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
      RETURNING *, 
        (num_miembros * ${dotacionDiaria}) as dotacion_diaria_litros,
        (num_miembros * ${dotacionSemanal}) as dotacion_semanal_litros,
        (num_miembros * ${dotacionSemanal}) as litros_sugeridos;
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
    const files: Express.Multer.File[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      files.push(...(req.files as Express.Multer.File[]));
    } else if (req.file) {
      files.push(req.file);
    }

    if (files.length === 0) {
      return res.status(400).json({ message: 'No se subió ningún archivo Excel para importar.' });
    }

    let importedCount = 0;
    const sectorsSummary: { [sector: string]: { beneficiarios: number; miembros: number; m3: number; litros: number } } = {};
    const customSectorOverride = req.body.sector ? String(req.body.sector).trim() : '';

    for (const file of files) {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });

      // Procesar todas las pestañas/hojas del libro Excel
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rawRows = xlsx.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' });
        if (!rawRows || rawRows.length < 2) continue;

        let detectedSector = '';
        let detectedDistrito = 'Moyobamba';

        // 1. Escaneo de cabecera superior (Filas 0 a 12) para DISTRITO y AA.HH. / SECTOR
        for (let r = 0; r < Math.min(12, rawRows.length); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellText = String(row[c] || '').trim();
            if (!cellText) continue;

            // Extraer DISTRITO
            const distMatch = cellText.match(/^DISTRITO\s*[:\-]?\s*(.*)/i);
            if (distMatch) {
              let distVal = distMatch[1].trim();
              if (!distVal && row[c + 1]) distVal = String(row[c + 1]).trim();
              if (distVal && !distVal.includes('N° Formato') && !distVal.includes('Formato')) {
                detectedDistrito = distVal;
              }
            }

            // Extraer AA.HH. o SECTOR
            const secMatch = cellText.match(/^(?:AA\.?HH\.?|SECTOR|ASENTAMIENTO\s*HUMANO|BARRIO|URB\.?)\s*[:\-]?\s*(.*)/i);
            if (secMatch) {
              let secVal = secMatch[1].trim();
              if (!secVal && row[c + 1]) secVal = String(row[c + 1]).trim();
              secVal = secVal.replace(/^[_\-\s]+|[_\-\s]+$/g, '');
              if (secVal && secVal.length > 1) {
                detectedSector = secVal;
              }
            }
          }
        }

        // Si no se detectó en texto, verificar nombre de la pestaña (si no es 'Sheet1' o similar)
        if (!detectedSector && sheetName && !/^(SHEET|HOJA)\s*\d*$/i.test(sheetName.trim())) {
          detectedSector = sheetName.trim();
        }

        // Si aún no se detectó, extraer del nombre del archivo
        if (!detectedSector && file.originalname) {
          const baseName = file.originalname
            .replace(/\.[^/.]+$/, '')
            .replace(/^(PADRON|BENEFICIARIOS|ANEXO\s*\d*)[_\-\s]*/i, '')
            .trim();
          if (baseName && baseName.length > 2) {
            detectedSector = baseName;
          }
        }

        const finalSector = customSectorOverride || detectedSector || 'Sector General';

        // Auto-crear el sector en el catálogo si aún no existe
        try {
          const secCheck = await query('SELECT id FROM sectores WHERE LOWER(nombre) = LOWER($1)', [finalSector]);
          if (secCheck.rows.length === 0) {
            await query(
              'INSERT INTO sectores (nombre, distrito, descripcion) VALUES ($1, $2, $3)',
              [finalSector, detectedDistrito, `Sector / AA.HH. importado del Padrón Oficial (${detectedDistrito})`]
            );
          }
        } catch (secErr) {
          console.warn('Advertencia registrando nuevo sector:', secErr);
        }

        // 2. Mapeo de Columnas (Manejo de Cabecera Simple o con DIRECCIÓN Combinada en 2 filas)
        let headerRowIdx = -1;
        let dataStartRow = -1;
        let colMap: { [key: string]: number } = {};

        for (let r = 0; r < Math.min(18, rawRows.length); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          const hasDni = row.some((cell) => /DNI|DOCUMENTO/i.test(String(cell || '')));
          const hasNombres = row.some((cell) => /NOMBRE|APELLIDO|TITULAR/i.test(String(cell || '')));
          const hasVivienda = row.some((cell) => /VIVIENDA|CASA/i.test(String(cell || '')));
          const hasMiembros = row.some((cell) => /MIEMBRO|HABITANTE/i.test(String(cell || '')));

          if ((hasDni && hasNombres) || (hasVivienda && hasDni) || (hasMiembros && hasDni)) {
            headerRowIdx = r;
            dataStartRow = r + 1;

            // Fila principal
            row.forEach((cellVal, colIdx) => {
              const val = String(cellVal || '').toUpperCase().trim();
              if (/DNI|DOCUMENTO/i.test(val)) colMap['dni'] = colIdx;
              else if (/NOMBRE|APELLIDO|TITULAR/i.test(val)) colMap['nombres'] = colIdx;
              else if (/SECTOR|AA\.?HH|BARRIO|URBANIZACI[OÓ]N/i.test(val)) colMap['sector'] = colIdx;
              else if (/VIVIENDA|CASA|N[°º]\s*VIV/i.test(val)) colMap['num_vivienda'] = colIdx;
              else if (/MIEMBRO|HABITANTE|PERSONA/i.test(val)) colMap['num_miembros'] = colIdx;
              else if (/TEL[EÉ]FONO|CELULAR|MOVIL/i.test(val)) colMap['telefono'] = colIdx;
              else if (/^MZ|^MANZANA/i.test(val)) colMap['mz'] = colIdx;
              else if (/^LT|^LOTE/i.test(val)) colMap['lt'] = colIdx;
              else if (/CALLE|DIRECCI[OÓ]N|CUADRA/i.test(val)) colMap['direccion'] = colIdx;
            });

            // Verificar si hay subcabecera en fila r + 1 (Mz | Lt | calle/dirección/cuadra/N°)
            if (r + 1 < rawRows.length && Array.isArray(rawRows[r + 1])) {
              const subRow = rawRows[r + 1];
              const hasSubMz = subRow.some((cell) => /^MZ|^MANZANA/i.test(String(cell || '').trim()));
              const hasSubLt = subRow.some((cell) => /^LT|^LOTE/i.test(String(cell || '').trim()));
              const hasSubCalle = subRow.some((cell) => /CALLE|DIRECCI[OÓ]N|CUADRA/i.test(String(cell || '').trim()));

              if (hasSubMz || hasSubLt || hasSubCalle) {
                dataStartRow = r + 2;
                subRow.forEach((cellVal, colIdx) => {
                  const val = String(cellVal || '').toUpperCase().trim();
                  if (/^MZ|^MANZANA/i.test(val)) colMap['mz'] = colIdx;
                  else if (/^LT|^LOTE/i.test(val)) colMap['lt'] = colIdx;
                  else if (/CALLE|DIRECCI[OÓ]N|CUADRA/i.test(val)) colMap['direccion'] = colIdx;
                });
              }
            }
            break;
          }
        }

        // Si no se identificó por texto, aplicar orden posicional del formato oficial estándar
        // [0: N°, 1: Vivienda, 2: Miembros, 3: Mz, 4: Lt, 5: Dirección, 6: Nombres, 7: DNI, 8: Teléfono]
        if (colMap['dni'] === undefined) {
          colMap = {
            num_vivienda: 1,
            num_miembros: 2,
            mz: 3,
            lt: 4,
            direccion: 5,
            nombres: 6,
            dni: 7,
            telefono: 8,
          };
          if (dataStartRow === -1) dataStartRow = 5;
        }

        // 3. Procesamiento e Inserción de Beneficiarios
        for (let r = dataStartRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          // Verificar si esta fila es un separador de bloque "AA.HH: [Nuevo Sector]"
          const rowText = row.map((c) => String(c || '').trim()).join(' ');
          const blockSecMatch = rowText.match(/^(?:AA\.?HH\.?|SECTOR)\s*[:\-]?\s*([A-Za-z0-9\sÁÉÍÓÚáéíóúÑñ]+)/i);
          if (blockSecMatch && !rowText.includes('DNI') && !rowText.includes('NOMBRES')) {
            detectedSector = blockSecMatch[1].trim().replace(/^[_\-\s]+|[_\-\s]+$/g, '');
            continue;
          }

          const rawDniVal = colMap['dni'] !== undefined ? String(row[colMap['dni']] || '').trim() : '';
          const rawNombresVal = colMap['nombres'] !== undefined ? String(row[colMap['nombres']] || '').trim() : '';

          let dni = rawDniVal.replace(/\D/g, '');
          if (dni.length === 7) dni = '0' + dni;

          if (!dni || dni.length < 6 || !rawNombresVal || rawNombresVal.toUpperCase() === 'NOMBRES Y APELLIDOS') {
            continue;
          }

          // Resolver el sector de la fila (columna dedicada o sector detectado)
          let rowSector = customSectorOverride || detectedSector || 'Sector General';
          if (colMap['sector'] !== undefined && row[colMap['sector']]) {
            const sVal = String(row[colMap['sector']]).trim();
            if (sVal && !/^(SECTOR|AA\.?HH\.?)$/i.test(sVal)) {
              rowSector = sVal;
            }
          }

          // Asegurar registro de sector
          try {
            const secCheck = await query('SELECT id FROM sectores WHERE LOWER(nombre) = LOWER($1)', [rowSector]);
            if (secCheck.rows.length === 0) {
              await query(
                'INSERT INTO sectores (nombre, distrito, descripcion) VALUES ($1, $2, $3)',
                [rowSector, detectedDistrito, `Sector / AA.HH. importado del Padrón Oficial (${detectedDistrito})`]
              );
            }
          } catch (e) {}

          const nombresApellidos = rawNombresVal.toUpperCase().trim();

          let nombres = '';
          let apellidos = '';
          if (nombresApellidos.includes(',')) {
            const parts = nombresApellidos.split(',');
            apellidos = parts[0].trim();
            nombres = parts.slice(1).join(' ').trim();
          } else {
            const parts = nombresApellidos.split(/\s+/);
            if (parts.length >= 3) {
              apellidos = parts.slice(0, 2).join(' ');
              nombres = parts.slice(2).join(' ');
            } else if (parts.length === 2) {
              apellidos = parts[0];
              nombres = parts[1];
            } else {
              nombres = nombresApellidos;
            }
          }

          const numVivienda = colMap['num_vivienda'] !== undefined ? String(row[colMap['num_vivienda']] || '').trim() : '';

          let numMiembros = 4;
          if (colMap['num_miembros'] !== undefined) {
            const parsed = parseInt(String(row[colMap['num_miembros']]).replace(/\D/g, ''), 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 30) {
              numMiembros = parsed;
            }
          }

          const mz = colMap['mz'] !== undefined ? String(row[colMap['mz']] || '-').trim() : '-';
          const lt = colMap['lt'] !== undefined ? String(row[colMap['lt']] || '-').trim() : '-';
          const direccion = colMap['direccion'] !== undefined ? String(row[colMap['direccion']] || '').trim() : '';
          const telefono = colMap['telefono'] !== undefined ? String(row[colMap['telefono']] || '').trim().replace(/[^\d\s\-\+]/g, '') : '';

          const insertQuery = `
            INSERT INTO beneficiarios (
              dni, nombres_apellidos, distrito, sector_aahh, sector,
              num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono,
              nombres, apellidos
            )
            VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12)
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
                telefono = EXCLUDED.telefono,
                nombres = EXCLUDED.nombres,
                apellidos = EXCLUDED.apellidos;
          `;

          await query(insertQuery, [
            dni,
            nombresApellidos,
            detectedDistrito,
            rowSector,
            numVivienda,
            numMiembros,
            mz,
            lt,
            direccion,
            telefono,
            nombres,
            apellidos,
          ]);

          importedCount++;

          if (!sectorsSummary[rowSector]) {
            sectorsSummary[rowSector] = { beneficiarios: 0, miembros: 0, m3: 0, litros: 0 };
          }
          sectorsSummary[rowSector].beneficiarios += 1;
          sectorsSummary[rowSector].miembros += numMiembros;
          const litros = numMiembros * DOTACION_SEMANAL_POR_HABITANTE;
          sectorsSummary[rowSector].litros += litros;
          sectorsSummary[rowSector].m3 = parseFloat((sectorsSummary[rowSector].litros / LITROS_POR_M3).toFixed(2));
        }
      }
    }

    const totalLitros = Object.values(sectorsSummary).reduce((acc, s) => acc + s.litros, 0);
    const totalM3 = parseFloat((totalLitros / LITROS_POR_M3).toFixed(2));

    res.status(200).json({
      message: `Padrón procesado con éxito: ${importedCount} beneficiarios importados/actualizados.`,
      importedCount,
      totalArchivos: files.length,
      dotacionDiariaPorHabitante: DOTACION_POR_HABITANTE,
      diasEntregaSemanal: DIAS_ENTREGA_SEMANAL,
      dotacionSemanalPorHabitante: DOTACION_SEMANAL_POR_HABITANTE,
      totalLitrosSemanal: totalLitros,
      totalM3Semanal: totalM3,
      sectores: sectorsSummary,
    });
  } catch (error: any) {
    console.error('Error importing excel:', error);
    res.status(500).json({ message: 'Error interno al procesar archivo Excel', error: error.message });
  }
};

/**
 * Descargar Plantilla Excel Oficial de Padrón Multissectorial
 */
export const descargarPlantillaExcel = async (_req: Request, res: Response) => {
  try {
    const wb = xlsx.utils.book_new();

    // Hoja 1: Todos los sectores en una sola hoja
    const rowsHoja1 = [
      ['PADRÓN GENERAL DE BENEFICIARIOS — PROGRAMA AGUA MÓVIL EPS MOYOBAMBA'],
      ['INSTRUCCIONES: Puedes pegar aquí todos los beneficiarios de todos los sectores juntos. Cada fila especifica su SECTOR o AA.HH.'],
      ['N°', 'SECTOR / AA.HH.', 'N° DE VIVIENDA', 'N° DE MIEMBROS', 'Mz', 'Lt', 'DIRECCIÓN (calle/cuadra/N°)', 'NOMBRES Y APELLIDOS', 'DNI', 'NUMERO DE TELEFONO'],
      [1, 'SOL DE INDAÑE', '1', 4, 'A', '01', 'Jr. Los Cedros s/n', 'PÉREZ GARCÍA SEGUNDO JUAN', '47891234', '942123456'],
      [2, 'SOL DE INDAÑE', '2', 3, 'A', '02', 'Jr. Los Cedros s/n', 'VASQUEZ GÓMEZ MARÍA ELENA', '76089503', '976543210'],
      [3, 'ALTO BELEN', '1', 5, 'B', '05', 'Alto Belén Cdra. 1', 'GONZALES MEDINA CENAIDA', '74066841', '951234567'],
      [4, 'ALTO BELEN', '2', 4, 'B', '06', 'Alto Belén Cdra. 1', 'FERNANDEZ TOMOSH JOSÉ G.', '44048771', '961234567'],
      [5, 'COCOCHO', '14', 4, 'C', '12', 'Sector Cococho Parte Alta', 'RÍOS GÓMEZ MANUEL ANTONIO', '43890123', '981234567'],
      [6, 'LOS EUCALIPTOS', '5', 2, 'D', '08', 'Los Eucaliptos Mz D Lt 8', 'TAPIA DELGADO JORGE LUIS', '48901234', '942987654']
    ];

    const ws1 = xlsx.utils.aoa_to_sheet(rowsHoja1);
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }
    ];
    ws1['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 8 },
      { wch: 8 },
      { wch: 32 },
      { wch: 34 },
      { wch: 14 },
      { wch: 18 }
    ];
    xlsx.utils.book_append_sheet(wb, ws1, 'Todos_Los_Sectores');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Padron_Beneficiarios_EPS_Moyobamba.xlsx"');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error generando plantilla Excel:', error);
    res.status(500).json({ message: 'Error al generar plantilla', error: error.message });
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

    const config = await getConfiguracion();
    const dotacionDiaria = config.dotacion_diaria_litros;
    const dotacionSemanal = config.dotacion_semanal_por_habitante;

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
        (COALESCE(b.num_miembros, 1) * ${dotacionDiaria}) as dotacion_diaria_litros,
        (COALESCE(b.num_miembros, 1) * ${dotacionSemanal}) as dotacion_semanal_litros,
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
      ['N°', 'DNI', 'APELLIDOS Y NOMBRES', 'SECTOR / AA.HH.', 'MZ', 'LOTE', 'DIRECCIÓN / REFERENCIA', 'N° MIEMBROS (TOTAL)', 'DOTACIÓN DIARIA (L/DÍA)', 'DOTACIÓN SEMANAL VALE (L/SEM)', 'TELÉFONO', 'LATITUD', 'LONGITUD', 'ESTADO']
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
        Number(b.dotacion_semanal_litros || 350),
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
