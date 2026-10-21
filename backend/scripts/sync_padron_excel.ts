import * as XLSX from 'xlsx';
import { query } from '../src/db';

export const syncPadron = async () => {
  const filePath = 'C:\\Users\\Usuario\\Downloads\\Padron_Beneficiarios_Anexo1_EPS_2026-10-21.xlsx';
  console.log(`📖 Leyendo Padrón Oficial desde: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Padron_Beneficiarios'] || wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const rows = data.slice(5).filter(r => r[1] && String(r[1]).trim() !== '');
  console.log(`Total registros en Excel: ${rows.length}`);

  let insertCount = 0;
  for (const r of rows) {
    const dni = String(r[1]).trim();
    const nombresApellidos = String(r[2]).trim();
    const sector = String(r[3]).trim().toUpperCase();
    const mz = String(r[4] || '-').trim();
    const lt = String(r[5] || '-').trim();
    const direccion = String(r[6] || '').trim();
    const numMiembros = parseInt(r[7], 10) || 1;
    const dotacionSemanal = parseFloat(r[9]) || (numMiembros * 50 * 7);
    const telefono = String(r[10] || '').trim();
    const lat = r[11] && r[11] !== '-' ? parseFloat(r[11]) : null;
    const lng = r[12] && r[12] !== '-' ? parseFloat(r[12]) : null;

    await query(`
      INSERT INTO beneficiarios (
        dni, nombres_apellidos, sector_aahh, sector, mz, lt, direccion,
        num_miembros, litros_sugeridos, telefono
      )
      VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (dni) DO UPDATE SET
        nombres_apellidos = EXCLUDED.nombres_apellidos,
        sector_aahh = EXCLUDED.sector_aahh,
        sector = EXCLUDED.sector,
        mz = EXCLUDED.mz,
        lt = EXCLUDED.lt,
        direccion = EXCLUDED.direccion,
        num_miembros = EXCLUDED.num_miembros,
        litros_sugeridos = EXCLUDED.litros_sugeridos,
        telefono = EXCLUDED.telefono;
    `, [dni, nombresApellidos, sector, mz, lt, direccion, numMiembros, dotacionSemanal, telefono]);
    insertCount++;
  }

  // Purgar los 6 registros antiguos con DNI desfasado para coincidir al 100% con el Excel exportado (153 familias y 596 hab)
  const dnisObsoletos = ['48901234', '47891234', '417391061', '00482345', '46552369', '23017182'];
  await query('DELETE FROM vales_entrega WHERE beneficiario_id IN (SELECT id FROM beneficiarios WHERE dni = ANY($1::text[]))', [dnisObsoletos]);
  await query('DELETE FROM entregas_agua WHERE beneficiario_id IN (SELECT id FROM beneficiarios WHERE dni = ANY($1::text[]))', [dnisObsoletos]);
  await query('DELETE FROM beneficiarios WHERE dni = ANY($1::text[])', [dnisObsoletos]);

  const finalCheck = await query('SELECT COUNT(*) as count, SUM(num_miembros) as total_hab FROM beneficiarios');
  console.log('✅ Padrón sincronizado con éxito:', finalCheck.rows[0]);
  const secCheck = await query('SELECT sector_aahh, COUNT(*) as fam, SUM(num_miembros) as hab FROM beneficiarios GROUP BY sector_aahh ORDER BY sector_aahh');
  console.log('Desglose por Sector en BD:');
  secCheck.rows.forEach(s => console.log(` • ${s.sector_aahh}: ${s.fam} familias | ${s.hab} habitantes`));
};

syncPadron()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error sincronizando padrón:', err);
    process.exit(1);
  });
