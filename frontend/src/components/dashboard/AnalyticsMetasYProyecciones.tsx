import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

interface SectorItem {
  sector_nombre: string;
  litros_entregados: number;
  m3_entregados: number;
  meta_m3: number;
  total_beneficiarios: number;
  cumplimiento_pct: number;
}

interface MetasBeneficiarios {
  total: number;
  cumplidos: number;
  parciales: number;
  pendientes: number;
  pct_cumplimiento: number;
  volumen_entregado_semana_lts: number;
  volumen_meta_semana_lts: number;
}

interface ObjetivoGlobal {
  meta_convenio_m3: number;
  total_entregado_m3: number;
  saldo_m3: number;
  avance_pct: number;
  presupuesto_total_soles: number;
  dotacion_diaria_litros?: number;
  dias_entrega_semanal?: number;
}

interface ProgramacionAvance {
  id: number;
  fecha_label: string;
  zona: string;
  estado_display: string;
  cisterna_placa: string;
  conductor_nombre: string;
  m3_programados: number;
  m3_entregados: number;
  cumplimiento_pct: number;
  viajes_estimados: number;
  familias_atendidas: number;
  es_proyeccion: boolean;
}

interface Props {
  sectoresSemanal?: SectorItem[];
  sectoresMensual?: SectorItem[];
  metasBeneficiarios?: MetasBeneficiarios;
  objetivoGlobal?: ObjetivoGlobal;
  programacionesAvance?: ProgramacionAvance[];
}

export default function AnalyticsMetasYProyecciones({
  sectoresSemanal = [],
  sectoresMensual = [],
  metasBeneficiarios,
  objetivoGlobal,
  programacionesAvance = []
}: Props) {
  const [sectorViewMode, setSectorViewMode] = useState<'semanal' | 'mensual'>('semanal');

  const currentSectoresData = sectorViewMode === 'semanal' ? sectoresSemanal : sectoresMensual;

  // Beneficiary Goal pie data
  const totalBens = metasBeneficiarios?.total || 0;
  const cumplidosCount = metasBeneficiarios?.cumplidos || 0;
  const parcialesCount = metasBeneficiarios?.parciales || 0;
  const pendientesCount = metasBeneficiarios ? metasBeneficiarios.pendientes : 0;

  const pieData = [
    { name: 'Meta Semanal Cumplida (100%)', value: cumplidosCount, color: '#10b981' },
    { name: 'Entrega Parcial / En Curso', value: parcialesCount, color: '#f59e0b' },
    { name: 'Pendientes por Abastecer', value: Math.max(0, pendientesCount), color: '#3b82f6' }
  ].filter(d => d.value > 0);

  // Global Goal calculation
  const metaGlobalM3 = Number(objetivoGlobal?.meta_convenio_m3 ?? 15000);
  const entregadoGlobalM3 = Number(objetivoGlobal?.total_entregado_m3 ?? 0);
  const saldoGlobalM3 = Math.max(0, metaGlobalM3 - entregadoGlobalM3);
  const avanceGlobalPct = metaGlobalM3 > 0 ? Math.min(100, Math.round((entregadoGlobalM3 / metaGlobalM3) * 100)) : 0;

  // Programaciones advance data (Cero o datos reales)
  const progData = programacionesAvance;

  return (
    <div style={{ marginTop: 24, marginBottom: 28 }}>
      {/* ─── BANNER SUPERIOR: OBJETIVO GLOBAL DEL CONVENIO ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%)',
        borderRadius: 16,
        padding: '22px 26px',
        color: '#ffffff',
        marginBottom: 24,
        boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.25)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', padding: '4px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
              <span>🎯 METAS Y PROYECCIONES OPERATIVAS</span>
              <span>•</span>
              <span>CONVENIO PNSU N° 023-2026/VIVIENDA</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff' }}>
              Objetivo Global de Distribución y Abastecimiento Gratuito
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#cbd5e1' }}>
              Meta reglamentaria: <strong>50 L/hab/día</strong> (350 L/semana por vale de 7 días) • Total Presupuestado: <strong>S/. 586,912.74</strong>
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase' }}>Avance Acumulado del Convenio</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#38bdf8', lineHeight: 1 }}>{avanceGlobalPct}%</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>{entregadoGlobalM3.toLocaleString()} m³ de {metaGlobalM3.toLocaleString()} m³ meta</div>
          </div>
        </div>

        {/* Barra de Progreso Dinámica con Marcadores */}
        <div style={{ background: 'rgba(255,255,255,0.15)', height: 14, borderRadius: 999, overflow: 'hidden', position: 'relative', marginBottom: 16 }}>
          <div style={{
            width: `${avanceGlobalPct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 70%, #60a5fa 100%)',
            borderRadius: 999,
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
          }} />
        </div>

        {/* Grid de 4 KPIs Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>VOLUMEN EJECUTADO</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399' }}>{entregadoGlobalM3.toLocaleString()} m³</div>
            <div style={{ fontSize: 11, color: '#cbd5e1' }}>{(entregadoGlobalM3 * 1000).toLocaleString()} Litros certificados</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>SALDO POR DISTRIBUIR</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>{saldoGlobalM3.toLocaleString()} m³</div>
            <div style={{ fontSize: 11, color: '#cbd5e1' }}>{(saldoGlobalM3 * 1000).toLocaleString()} Litros pendientes</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>FAMILIAS BENEFICIARIAS</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#60a5fa' }}>{totalBens} Hogares</div>
            <div style={{ fontSize: 11, color: '#cbd5e1' }}>Moyobamba Focos Vulnerables</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>DOTACIÓN VIGENTE</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#a78bfa' }}>350 L / semana / hab</div>
            <div style={{ fontSize: 11, color: '#cbd5e1' }}>50 Litros diarios × 7 días</div>
          </div>
        </div>
      </div>

      {/* ─── FILA DE 2 GRÁFICOS: SECTORES (SEMANAL/MENSUAL) + DONUT CUMPLIMIENTO SEMANAL ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* GRÁFICO 1: ENTREGAS POR SECTORES CON TOGGLE SEMANAL / MENSUAL */}
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 4px 15px -2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                📊 Entregas Realizadas por Sectores / AA.HH.
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                Comparativa de volumen entregado (m³) vs Meta de abastecimiento
              </p>
            </div>

            {/* Selector interactivo Semanal / Mensual */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => setSectorViewMode('semanal')}
                style={{
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: sectorViewMode === 'semanal' ? '#0284c7' : 'transparent',
                  color: sectorViewMode === 'semanal' ? '#ffffff' : '#64748b',
                  transition: 'all 0.2s ease'
                }}
              >
                📅 Semanal
              </button>
              <button
                type="button"
                onClick={() => setSectorViewMode('mensual')}
                style={{
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: sectorViewMode === 'mensual' ? '#0284c7' : 'transparent',
                  color: sectorViewMode === 'mensual' ? '#ffffff' : '#64748b',
                  transition: 'all 0.2s ease'
                }}
              >
                📆 Mensual
              </button>
            </div>
          </div>

          <div style={{ height: 290, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentSectoresData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="sector_nombre"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  unit=" m³"
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    `${Number(val).toLocaleString()} m³ (${(Number(val) * 1000).toLocaleString()} L)`,
                    name === 'm3_entregados' ? 'Volumen Entregado' : 'Meta Asignada'
                  ]}
                  contentStyle={{ borderRadius: 10, border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
                  formatter={(v) => v === 'm3_entregados' ? 'Entregado (m³)' : 'Meta (m³)'}
                />
                <Bar dataKey="m3_entregados" fill="#0284c7" radius={[6, 6, 0, 0]} name="m3_entregados" />
                <Bar dataKey="meta_m3" fill="#cbd5e1" radius={[6, 6, 0, 0]} name="meta_m3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 2: CUMPLIMIENTO DE METAS SEMANALES DE BENEFICIARIOS */}
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 4px 15px -2px rgba(0,0,0,0.04)' }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              🎯 Cumplimiento de Metas Semanales por Familia
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Estado del padrón de beneficiarios según dotación semanal (350 L/hab)
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ height: 260, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} Familias (${Math.round((Number(val) / totalBens) * 100)}%)`, 'Cantidad']}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centro de la Dona con % Global */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {totalBens > 0 ? Math.round((cumplidosCount / totalBens) * 100) : 0}%
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>CUMPLIMIENTO</div>
              </div>
            </div>

            {/* Desglose Numérico Detallado */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>🟢 Meta Cumplida:</span>
                  <strong style={{ fontSize: 15, color: '#047857' }}>{cumplidosCount} fam.</strong>
                </div>
                <span style={{ fontSize: 10.5, color: '#059669' }}>Recibieron el 100% de la cuota semanal</span>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>🟡 Entrega Parcial:</span>
                  <strong style={{ fontSize: 15, color: '#b45309' }}>{parcialesCount} fam.</strong>
                </div>
                <span style={{ fontSize: 10.5, color: '#d97706' }}>En ruta de cisterna o saldo pendiente</span>
              </div>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>🔵 Por Atender:</span>
                  <strong style={{ fontSize: 15, color: '#1d4ed8' }}>{pendientesCount} fam.</strong>
                </div>
                <span style={{ fontSize: 10.5, color: '#2563eb' }}>Programadas para las siguientes jornadas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── GRÁFICO 3: CUMPLIMIENTO POR PROGRAMACIÓN Y PROYECCIONES SIGUIENTES ─── */}
      <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 4px 15px -2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              🚚 Cumplimiento por Programación y Proyección de Siguientes Entregas
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Seguimiento exacto de avance de cada jornada de cisterna y demanda proyectada a cubrir
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              ● Completadas
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              ● En Ruta
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f3e8ff', color: '#7e22ce', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              ● Proyectadas
            </span>
          </div>
        </div>

        {progData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
            <strong style={{ fontSize: 14, color: '#334155', display: 'block' }}>Sin programaciones de reparto registradas aún</strong>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 14px' }}>
              En cuanto crees la primera jornada en el módulo <strong>Programaciones</strong>, aquí se graficará automáticamente el avance (m³) de cada cisterna.
            </p>
            <a
              href="/programaciones"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                background: '#0284c7',
                color: '#ffffff',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              ➕ Ir a Crear Programación
            </a>
          </div>
        ) : (
          <>
            {/* Gráfico de Barras Agrupadas: Programado vs Entregado */}
            <div style={{ height: 260, width: '100%', marginBottom: 18 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="fecha_label"
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    unit=" m³"
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      `${Number(val).toLocaleString()} m³ (${(Number(val) * 1000).toLocaleString()} L)`,
                      name === 'm3_programados' ? 'Volumen Programado' : 'Volumen Entregado'
                    ]}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item ? `Prog #${item.id} (${item.fecha_label}) - ${item.zona}` : '';
                    }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
                    formatter={(v) => v === 'm3_programados' ? 'Meta Programada (m³)' : 'Real Entregado (m³)'}
                  />
                  <Bar dataKey="m3_programados" fill="#818cf8" radius={[4, 4, 0, 0]} name="m3_programados" />
                  <Bar dataKey="m3_entregados" fill="#10b981" radius={[4, 4, 0, 0]} name="m3_entregados" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla Dinámica de Avance y Proyección */}
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px' }}>PROGRAMACIÓN</th>
                    <th style={{ padding: '10px 14px' }}>SECTOR / ZONA</th>
                    <th style={{ padding: '10px 14px' }}>CISTERNA & CHOFER</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>PROGRAMADO</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>ENTREGADO</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>AVANCE</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {progData.map((p) => {
                    const isCompl = p.cumplimiento_pct >= 100 || p.estado_display === 'Completada';
                    const isProy = p.es_proyeccion;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                          Prog #{p.id} ({p.fecha_label})
                        </td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>
                          {p.zona}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>
                          <strong>{p.cisterna_placa}</strong> • {p.conductor_nombre}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                          {p.m3_programados} m³ ({p.viajes_estimados} v.)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: isCompl ? '#16a34a' : '#0284c7' }}>
                          {p.m3_entregados} m³
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                            <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{
                                width: `${p.cumplimiento_pct}%`,
                                height: '100%',
                                background: isCompl ? '#10b981' : (isProy ? '#a855f7' : '#0284c7')
                              }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{p.cumplimiento_pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {isCompl ? (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              ✓ Completada
                            </span>
                          ) : isProy ? (
                            <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              🔮 Proyectada
                            </span>
                          ) : (
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              🚚 En Ruta ({p.familias_atendidas} fam)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
