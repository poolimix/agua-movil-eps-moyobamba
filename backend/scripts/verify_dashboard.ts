import { getStats } from '../src/controllers/dashboard.controller';

const run = async () => {
  const req: any = { query: {} };
  const res: any = {
    json: (data: any) => {
      console.log('====================================');
      console.log('✅ ESTADO EN PRODUCCIÓN VERIFICADO:');
      console.log('====================================');
      console.log('💧 Volumen Total Entregado:', `${data.kpis.totalLitros.toLocaleString('es-PE')} Litros (${data.kpis.totalM3} m³)`);
      console.log('🎯 Meta Convenio Meta 228:', `${data.objetivo_global.meta_convenio_m3} m³`);
      console.log('📊 Avance Físico Global:', `${data.objetivo_global.avance_pct}%`);
      console.log('💰 Presupuesto Total Programado:', `S/ ${data.objetivo_global.presupuesto_total_soles.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`);
      console.log('💰 Presupuesto Total Devengado:', `S/ ${data.objetivo_global.presupuesto_girado_soles.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`);
      console.log('💰 Saldo Presupuestal por Ejecutar:', `S/ ${data.objetivo_global.presupuesto_saldo_soles.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`);
      console.log('👥 Familias / Población Atendida:', `${data.kpis.poblacionBeneficiada} habitantes (${data.kpis.familiasAtendidas} familias)`);
      console.log('------------------------------------');
      console.log('📍 Entregas Oficiales por Sector:');
      data.sectores.forEach((s: any) => {
        console.log(`   • ${s.sector_nombre}: ${s.litros_entregados.toLocaleString('es-PE')} L (${s.m3_entregados} m³) | Meta: ${s.meta_m3} m³ (${s.cumplimiento_pct}%)`);
      });
      console.log('------------------------------------');
      console.log('🚚 Programación Oficial con Personal Asignado:');
      data.programaciones_avance.slice(0, 2).forEach((p: any) => {
        console.log(`   • Prog #${p.id}: ${p.zona.substring(0, 45)}...`);
        console.log(`     Conductor: ${p.conductor_nombre} | Cisterna: ${p.cisterna_placa} | Estado: ${p.estado_display}`);
      });
      console.log('====================================');
      process.exit(0);
    },
    status: () => res
  };

  await getStats(req, res);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
