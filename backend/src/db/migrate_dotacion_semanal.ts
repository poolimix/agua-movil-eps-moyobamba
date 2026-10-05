import { pool } from './index';
import { DOTACION_SEMANAL_POR_HABITANTE, DOTACION_POR_HABITANTE, DIAS_ENTREGA_SEMANAL } from '../config/constants';

export const migrateDotacionSemanal = async () => {
  console.log(`🔄 Actualizando dotación de agua a ciclo semanal (${DOTACION_POR_HABITANTE} L/hab/día × ${DIAS_ENTREGA_SEMANAL} días = ${DOTACION_SEMANAL_POR_HABITANTE} L/hab)...`);

  const result = await pool.query(`
    UPDATE vales_entrega v
    SET litros_sugeridos = (COALESCE(b.num_miembros, 1) * ${DOTACION_SEMANAL_POR_HABITANTE}),
        qr_data = v.codigo_unico || '|' || b.dni || '|' || (COALESCE(b.num_miembros, 1) * ${DOTACION_SEMANAL_POR_HABITANTE}) || 'L|' || v.programacion_id
    FROM beneficiarios b
    WHERE v.beneficiario_id = b.id
    RETURNING v.id, v.codigo_unico, b.dni, b.nombres_apellidos, b.num_miembros, v.litros_sugeridos;
  `);

  console.log(`✅ Se actualizaron ${result.rowCount} vales emitidos a la nueva dotación semanal:`);
  result.rows.forEach(r => {
    console.log(`   - Vale ${r.codigo_unico} (${r.nombres_apellidos}, ${r.num_miembros} personas): ${r.litros_sugeridos} Litros`);
  });
};

if (require.main === module) {
  migrateDotacionSemanal()
    .then(() => {
      console.log('✅ Migración de dotación semanal finalizada con éxito.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error en migración de dotación semanal:', err);
      process.exit(1);
    });
}
