import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import './ExecutiveAnalyticsShowcase.css';

interface ExecutiveAnalyticsProps {
  kpis: {
    totalLitros?: number;
    totalM3?: number | string;
    totalBeneficiarios?: number;
    totalPersonas?: number;
    entregasRealizadas?: number;
    avanceMetaPct?: number;
    volumenRepartidoLitros?: number;
    volumenRepartidoM3?: number | string;
    volumenPromedioFamilia?: number;
    volumenPromedioPersona?: number;
    poblacionBeneficiada?: number;
    familiasAtendidas?: number;
    montoTotalSoles?: number;
    programacionesActivas?: number;
  };
  calidad: {
    cumplimiento_pct?: number;
    promedio_cloro_ppm?: string | number;
    promedio_turbiedad_ntu?: string | number;
  };
  vales: {
    entregados?: number;
    pendientes?: number;
    total_vales?: number;
    tasa_canje?: number;
  };
  flota: {
    operativas?: number;
    total?: number;
    capacidad_total_litros?: number;
  };
  tendencia?: Array<{ fecha: string; litros: number; entregas: number }>;
  sectores?: Array<{
    sector_nombre: string;
    litros_entregados: number;
    meta_litros: number;
    cumplimiento_pct: number;
    total_beneficiarios: number;
  }>;
  loading?: boolean;
}

export const ExecutiveAnalyticsShowcase: React.FC<ExecutiveAnalyticsProps> = ({
  kpis,
  calidad,
  vales,
  flota,
  tendencia = [],
  sectores = [],
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'DIAS' | 'SECTORES'>('DIAS');

  // Valores normalizados
  const volRepartido = Number(kpis.volumenRepartidoLitros || kpis.totalLitros || 80);
  const volRepartidoM3 = kpis.volumenRepartidoM3 || kpis.totalM3 || (volRepartido / 1000).toFixed(2);
  const volPromedio = kpis.volumenPromedioFamilia || (kpis.entregasRealizadas ? Math.round(volRepartido / kpis.entregasRealizadas) : 80);
  const volPromedioPersona = kpis.volumenPromedioPersona || 50;
  const poblacion = kpis.poblacionBeneficiada || kpis.totalPersonas || 586;
  const familias = kpis.familiasAtendidas || kpis.entregasRealizadas || 1;
  const monto = Number(kpis.montoTotalSoles || ((volRepartido / 1000) * 39.13));

  const pctVolumenPNSU = Math.min(100, Number(kpis.avanceMetaPct || Math.round((volRepartido / 150000) * 100)));
  const pctCalidad = Math.min(100, Number(calidad.cumplimiento_pct || 83));
  const pctVales = Math.min(100, Number(vales.tasa_canje || 0));
  const pctFlota = Math.min(100, Math.round(((flota.operativas || 2) / (flota.total || 3)) * 100));
  const pctCobertura = Math.min(100, Math.round((familias / (kpis.totalBeneficiarios || 151)) * 100));

  // Datos para comparativa de barras por día (Lun - Dom)
  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const dailyBarData = diasSemana.map((dia, idx) => {
    // Si hay datos en tendencia, usamos los valores reales, o calculamos distribución proporcional
    const tItem = tendencia[idx];
    const programado = 15000 + (idx % 3) * 2500;
    const entregado = tItem ? tItem.litros : (idx === 0 ? volRepartido : (idx < 3 ? Math.round(volRepartido * 0.4) : 0));
    const saldo = Math.max(0, programado - entregado);

    return {
      name: dia,
      Programado: programado,
      Entregado: entregado,
      Saldo: saldo,
    };
  });

  // Datos para comparativa de barras por Sectores
  const sectoresBarData = (sectores.length > 0 ? sectores : [
    { sector_nombre: 'Sol de Indañe', litros_entregados: 4200, meta_litros: 15000, total_beneficiarios: 165 },
    { sector_nombre: 'Santiago 8 Valles', litros_entregados: 3100, meta_litros: 12000, total_beneficiarios: 168 },
    { sector_nombre: 'San Borja', litros_entregados: 700, meta_litros: 5000, total_beneficiarios: 17 },
    { sector_nombre: 'Las Brisas', litros_entregados: 2500, meta_litros: 8000, total_beneficiarios: 85 },
    { sector_nombre: 'Los Eucaliptos', litros_entregados: 1800, meta_litros: 6500, total_beneficiarios: 42 },
  ]).slice(0, 6).map((s) => ({
    name: s.sector_nombre.length > 12 ? s.sector_nombre.substring(0, 10) + '...' : s.sector_nombre,
    fullName: s.sector_nombre,
    Programado: s.meta_litros || 10000,
    Entregado: s.litros_entregados || 0,
    Saldo: Math.max(0, (s.meta_litros || 10000) - (s.litros_entregados || 0)),
  }));

  // Datos para gráfico circular (Donut de distribución por sectores)
  const donutColors = ['#0284c7', '#0ea5e9', '#38bdf8', '#10b981', '#8b5cf6', '#f59e0b'];
  const pieData = (sectores.length > 0 ? sectores : [
    { sector_nombre: 'Sol de Indañe', litros_entregados: 3200 },
    { sector_nombre: 'Santiago 8 Valles', litros_entregados: 2400 },
    { sector_nombre: 'San Borja', litros_entregados: 1100 },
    { sector_nombre: 'Las Brisas', litros_entregados: 1800 },
    { sector_nombre: 'Otros AA.HH.', litros_entregados: 900 },
  ]).map((s, i) => ({
    name: s.sector_nombre,
    value: s.litros_entregados > 0 ? s.litros_entregados : 1000 + i * 500,
    color: donutColors[i % donutColors.length],
  }));

  // Circunferencia para los 4 anillos concéntricos (SVG Radius)
  // Anillo 1 (Exterior): r=68, Circ=427
  // Anillo 2: r=54, Circ=339
  // Anillo 3: r=40, Circ=251
  // Anillo 4 (Interior): r=26, Circ=163
  const calcDash = (r: number, pct: number) => {
    const c = 2 * Math.PI * r;
    const strokeDash = (pct / 100) * c;
    return `${strokeDash} ${c}`;
  };

  return (
    <div className="executive-showcase-container">
      {/* ─── FILA 1: 4 TARJETAS CLAVE CON MICRO-GRÁFICOS INTEGRADOS ──────────────── */}
      <section className="executive-microcards-grid">
        {/* CARD 1: VOL. REPARTIDO */}
        <div className="microcard microcard-blue">
          <div className="microcard-top">
            <div>
              <span className="microcard-tag">VOL. REPARTIDO TOTAL</span>
              <div className="microcard-val-row">
                <span className="microcard-val">{loading ? '...' : volRepartido.toLocaleString('es-PE')}</span>
                <span className="microcard-unit">Litros</span>
              </div>
            </div>
            <div className="microcard-icon-pill icon-pill-blue">🚰</div>
          </div>

          {/* Sparkline Wave Chart (Inspirado en el primer gráfico curvo de la referencia) */}
          <div className="microcard-sparkline-wrap">
            <svg viewBox="0 0 160 36" className="microcard-sparkline" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveBlueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0,28 Q 25,12 50,22 T 100,8 T 160,18 L 160,36 L 0,36 Z"
                fill="url(#waveBlueGrad)"
              />
              <path
                d="M 0,28 Q 25,12 50,22 T 100,8 T 160,18"
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="160" cy="18" r="3.5" fill="#0284c7" />
            </svg>
          </div>

          <div className="microcard-footer">
            <span className="microcard-foot-text">🚚 {volRepartidoM3} m³ fiscalizados</span>
            <span className="microcard-badge badge-cyan">GPS Satelital</span>
          </div>
        </div>

        {/* CARD 2: VOL. PROMEDIO */}
        <div className="microcard microcard-cyan">
          <div className="microcard-top">
            <div>
              <span className="microcard-tag">VOL. PROMEDIO POR BENEFICIARIO</span>
              <div className="microcard-val-row">
                <span className="microcard-val">{loading ? '...' : volPromedio.toLocaleString('es-PE')}</span>
                <span className="microcard-unit">L / fam</span>
              </div>
            </div>
            <div className="microcard-icon-pill icon-pill-cyan">📊</div>
          </div>

          {/* Micro Comparative Bar: Real vs SUNASS Standard */}
          <div className="microcard-comp-bar-section">
            <div className="comp-bar-labels">
              <span>Entrega Promedio</span>
              <span className="comp-bar-target">Meta: 350 L/sem</span>
            </div>
            <div className="comp-bar-track">
              <div
                className="comp-bar-fill comp-fill-cyan"
                style={{ width: `${Math.min(100, Math.round((volPromedio / 350) * 100))}%` }}
              />
              <div className="comp-bar-marker" style={{ left: '100%' }} title="Norma SUNASS" />
            </div>
          </div>

          <div className="microcard-footer">
            <span className="microcard-foot-text">💧 {volPromedioPersona} L/hab/día estándar</span>
            <span className="microcard-badge badge-teal">Norma SUNASS</span>
          </div>
        </div>

        {/* CARD 3: POBLACIÓN BENEFICIADA */}
        <div className="microcard microcard-purple">
          <div className="microcard-top">
            <div>
              <span className="microcard-tag">POBLACIÓN BENEFICIADA</span>
              <div className="microcard-val-row">
                <span className="microcard-val">{loading ? '...' : poblacion.toLocaleString('es-PE')}</span>
                <span className="microcard-unit">Habitantes</span>
              </div>
            </div>
            <div className="microcard-icon-pill icon-pill-purple">👥</div>
          </div>

          {/* Demographic Multi-progress mini bar */}
          <div className="microcard-comp-bar-section">
            <div className="comp-bar-labels">
              <span>{familias} Familias Atendidas</span>
              <span className="comp-bar-target">{pctCobertura}% Cobertura</span>
            </div>
            <div className="comp-bar-track">
              <div
                className="comp-bar-fill comp-fill-purple"
                style={{ width: `${Math.max(4, pctCobertura)}%` }}
              />
            </div>
          </div>

          <div className="microcard-footer">
            <span className="microcard-foot-text">🏠 {familias} de {kpis.totalBeneficiarios || 151} hogares</span>
            <span className="microcard-badge badge-purple">Padrón PUB</span>
          </div>
        </div>

        {/* CARD 4: MONTO VALORIZADO */}
        <div className="microcard microcard-emerald">
          <div className="microcard-top">
            <div>
              <span className="microcard-tag">MONTO VALORIZADO / SUBSIDIO</span>
              <div className="microcard-val-row">
                <span className="microcard-val">S/. {loading ? '...' : monto.toFixed(2)}</span>
              </div>
            </div>
            <div className="microcard-icon-pill icon-pill-emerald">💰</div>
          </div>

          {/* Sparkline Wave Chart (Green Emerald) */}
          <div className="microcard-sparkline-wrap">
            <svg viewBox="0 0 160 36" className="microcard-sparkline" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0,30 Q 30,26 60,18 T 110,12 T 160,4 L 160,36 L 0,36 Z"
                fill="url(#waveEmeraldGrad)"
              />
              <path
                d="M 0,30 Q 30,26 60,18 T 110,12 T 160,4"
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="160" cy="4" r="3.5" fill="#10b981" />
            </svg>
          </div>

          <div className="microcard-footer">
            <span className="microcard-foot-text">Tarifa Ref: S/. 39.13/m³</span>
            <span className="microcard-badge badge-emerald">Subsidio PNSU</span>
          </div>
        </div>
      </section>

      {/* ─── FILA 2: COMMAND CENTER GRÁFICO VISUAL (INSPIRADO EN LA REFERENCIA) ──────── */}
      <section className="executive-charts-trio">
        {/* PANEL A: COMPARATIVA DE BARRAS AGRUPADAS (PROGRAMADO VS REPARTIDO VS SALDO) */}
        <div className="visual-panel panel-bars-comparative">
          <div className="visual-panel-header">
            <div>
              <div className="panel-badge-kpi">📊 COMPARATIVA OPERATIVA</div>
              <h3 className="visual-panel-title">Distribución y Despacho de Agua</h3>
              <p className="visual-panel-subtitle">Volumen Programado vs. Litros Entregados vs. Saldo Remanente</p>
            </div>

            {/* Toggle Días / Sectores */}
            <div className="panel-tab-pills">
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'DIAS' ? 'tab-pill-active' : ''}`}
                onClick={() => setActiveTab('DIAS')}
              >
                Por Días (Semana)
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'SECTORES' ? 'tab-pill-active' : ''}`}
                onClick={() => setActiveTab('SECTORES')}
              >
                Por Sectores
              </button>
            </div>
          </div>

          {/* Gráfico Recharts de Barras Agrupadas */}
          <div className="comparative-chart-wrapper">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={activeTab === 'DIAS' ? dailyBarData : sectoresBarData}
                margin={{ top: 12, right: 10, left: -15, bottom: 0 }}
                barGap={4}
              >
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k L`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const prog = Number(payload[0]?.value || 0);
                      const ent = Number(payload[1]?.value || 0);
                      const sal = Number(payload[2]?.value || 0);
                      return (
                        <div className="custom-chart-tooltip">
                          <strong className="tooltip-title">{label}</strong>
                          <div className="tooltip-row">
                            <span className="dot dot-prog" />
                            <span>Programado:</span>
                            <strong>{prog.toLocaleString()} L ({(prog / 1000).toFixed(1)} m³)</strong>
                          </div>
                          <div className="tooltip-row">
                            <span className="dot dot-ent" />
                            <span>Entregado:</span>
                            <strong style={{ color: '#0284c7' }}>{ent.toLocaleString()} L ({(ent / 1000).toFixed(1)} m³)</strong>
                          </div>
                          <div className="tooltip-row">
                            <span className="dot dot-sal" />
                            <span>Saldo:</span>
                            <strong style={{ color: '#f59e0b' }}>{sal.toLocaleString()} L</strong>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="Programado" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="Entregado" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="Saldo" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Micro-Pills Inferiores (Idénticas al bloque $55,656.25 de la referencia) */}
          <div className="comparative-bottom-pills">
            <div className="comp-pill-item">
              <span className="comp-pill-dot dot-blue" />
              <div className="comp-pill-info">
                <span className="comp-pill-label">PROGRAMADO</span>
                <strong className="comp-pill-num">15,000 L</strong>
              </div>
            </div>

            <div className="comp-pill-item">
              <span className="comp-pill-dot dot-cyan" />
              <div className="comp-pill-info">
                <span className="comp-pill-label">ENTREGADO</span>
                <strong className="comp-pill-num" style={{ color: '#0284c7' }}>
                  {volRepartido.toLocaleString()} L
                </strong>
              </div>
            </div>

            <div className="comp-pill-item">
              <span className="comp-pill-dot dot-amber" />
              <div className="comp-pill-info">
                <span className="comp-pill-label">POR ENTREGAR</span>
                <strong className="comp-pill-num" style={{ color: '#f59e0b' }}>
                  {Math.max(0, 15000 - volRepartido).toLocaleString()} L
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL B: EFICIENCIA GLOBAL (ESTILO "MAGNA" DE LA REFERENCIA: BARRAS HORIZONTALES + ANILLOS CONCÉNTRICOS) */}
        <div className="visual-panel panel-concentric-radial">
          <div className="visual-panel-header">
            <div>
              <div className="panel-badge-kpi">🎯 RENDIMIENTO GLOBAL</div>
              <h3 className="visual-panel-title">Índices de Gestión Operativa</h3>
              <p className="visual-panel-subtitle">Evaluación simultánea de los 4 ejes PNSU</p>
            </div>
            <div className="efficiency-score-tag">
              <span className="score-num">
                {Math.round((pctCalidad + pctFlota + pctCobertura + (pctVolumenPNSU || 10)) / 4)}%
              </span>
              <span className="score-lbl">GLOBAL</span>
            </div>
          </div>

          <div className="magna-layout-split">
            {/* 1. BARRAS HORIZONTALES RANKING (01, 02, 03, 04) */}
            <div className="magna-bars-column">
              {/* Barra 01: Volumen PNSU */}
              <div className="magna-bar-row">
                <span className="magna-row-num">01</span>
                <div className="magna-bar-content">
                  <div className="magna-bar-header">
                    <span className="magna-bar-title">Volumen PNSU</span>
                    <span className="magna-bar-pct" style={{ color: '#0284c7' }}>{pctVolumenPNSU}%</span>
                  </div>
                  <div className="magna-bar-track">
                    <div className="magna-bar-fill fill-blue" style={{ width: `${Math.max(4, pctVolumenPNSU)}%` }} />
                  </div>
                </div>
              </div>

              {/* Barra 02: Calidad Sanitaria */}
              <div className="magna-bar-row">
                <span className="magna-row-num">02</span>
                <div className="magna-bar-content">
                  <div className="magna-bar-header">
                    <span className="magna-bar-title">Calidad (Cloro)</span>
                    <span className="magna-bar-pct" style={{ color: '#10b981' }}>{pctCalidad}%</span>
                  </div>
                  <div className="magna-bar-track">
                    <div className="magna-bar-fill fill-green" style={{ width: `${pctCalidad}%` }} />
                  </div>
                </div>
              </div>

              {/* Barra 03: Vales Canjeados */}
              <div className="magna-bar-row">
                <span className="magna-row-num">03</span>
                <div className="magna-bar-content">
                  <div className="magna-bar-header">
                    <span className="magna-bar-title">Vales Canjeados</span>
                    <span className="magna-bar-pct" style={{ color: '#8b5cf6' }}>{pctVales}%</span>
                  </div>
                  <div className="magna-bar-track">
                    <div className="magna-bar-fill fill-purple" style={{ width: `${Math.max(4, pctVales)}%` }} />
                  </div>
                </div>
              </div>

              {/* Barra 04: Flota en Ruta */}
              <div className="magna-bar-row">
                <span className="magna-row-num">04</span>
                <div className="magna-bar-content">
                  <div className="magna-bar-header">
                    <span className="magna-bar-title">Flota Operativa</span>
                    <span className="magna-bar-pct" style={{ color: '#06b6d4' }}>{pctFlota}%</span>
                  </div>
                  <div className="magna-bar-track">
                    <div className="magna-bar-fill fill-cyan" style={{ width: `${pctFlota}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. GRÁFICO CIRCULAR CONCÉNTRICO (CONCENTRIC MULTI-RING GAUGE) */}
            <div className="magna-gauge-column">
              <div className="concentric-gauge-wrap">
                <svg viewBox="0 0 160 160" className="concentric-svg">
                  {/* Background Track Rings */}
                  <circle cx="80" cy="80" r="68" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="80" cy="80" r="54" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="80" cy="80" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="80" cy="80" r="26" fill="none" stroke="#f1f5f9" strokeWidth="8" />

                  {/* Anillo 1: Volumen PNSU (Azul #0284c7) */}
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="8"
                    strokeDasharray={calcDash(68, Math.max(5, pctVolumenPNSU))}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />

                  {/* Anillo 2: Calidad Sanitaria (Verde #10b981) */}
                  <circle
                    cx="80"
                    cy="80"
                    r="54"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="8"
                    strokeDasharray={calcDash(54, Math.max(5, pctCalidad))}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />

                  {/* Anillo 3: Flota Operativa (Cyan #06b6d4) */}
                  <circle
                    cx="80"
                    cy="80"
                    r="40"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="8"
                    strokeDasharray={calcDash(40, Math.max(5, pctFlota))}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />

                  {/* Anillo 4: Cobertura Vales (Violeta #8b5cf6) */}
                  <circle
                    cx="80"
                    cy="80"
                    r="26"
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="8"
                    strokeDasharray={calcDash(26, Math.max(5, pctCobertura))}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />
                </svg>

                {/* Centro del radar concéntrico */}
                <div className="concentric-center-label">
                  <span className="center-water-icon">💧</span>
                  <span className="center-title-tag">EPS</span>
                </div>
              </div>

              {/* Leyenda de los 4 Anillos */}
              <div className="concentric-legend-row">
                <span className="c-legend-item"><span className="c-dot dot-blue" />Vol</span>
                <span className="c-legend-item"><span className="c-dot dot-green" />Cal</span>
                <span className="c-legend-item"><span className="c-dot dot-cyan" />Flo</span>
                <span className="c-legend-item"><span className="c-dot dot-purple" />Cob</span>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL C: GRÁFICO CIRCULAR DONUT (DISTRIBUCIÓN POR SECTORES & FLOTA) */}
        <div className="visual-panel panel-donut-sectors">
          <div className="visual-panel-header">
            <div>
              <div className="panel-badge-kpi">⭕ DESGLOSE DE REPARTO</div>
              <h3 className="visual-panel-title">Distribución por Sectores</h3>
              <p className="visual-panel-subtitle">Volumen asignado a AA.HH. atendidos</p>
            </div>
            <div className="donut-total-badge">
              <span>{volRepartidoM3} m³</span>
            </div>
          </div>

          <div className="donut-chart-flex">
            <div className="donut-chart-container">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0];
                        return (
                          <div className="custom-chart-tooltip">
                            <strong style={{ color: item.payload.color }}>{item.name}</strong>
                            <div>{Number(item.value).toLocaleString()} Litros</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-inner-data">
                <span className="donut-inner-num">{pieData.length}</span>
                <span className="donut-inner-label">Sectores</span>
              </div>
            </div>

            {/* Leyenda interactiva de sectores */}
            <div className="donut-legend-list">
              {pieData.map((item, idx) => (
                <div key={idx} className="donut-legend-row">
                  <div className="legend-row-left">
                    <span className="legend-box-color" style={{ backgroundColor: item.color }} />
                    <span className="legend-sector-name" title={item.name}>{item.name}</span>
                  </div>
                  <span className="legend-sector-liters">{Number(item.value).toLocaleString()} L</span>
                </div>
              ))}
            </div>
          </div>

          {/* Micro Pills Inferiores */}
          <div className="donut-footer-pills">
            <div className="d-pill">
              <span className="d-pill-num">{flota.operativas || 2}/{flota.total || 3}</span>
              <span className="d-pill-lbl">Cisternas Ruta</span>
            </div>
            <div className="d-pill">
              <span className="d-pill-num">{vales.entregados || 0}</span>
              <span className="d-pill-lbl">Vales Canjeados</span>
            </div>
            <div className="d-pill">
              <span className="d-pill-num">{calidad.promedio_cloro_ppm || '1.49'}</span>
              <span className="d-pill-lbl">ppm Cloro</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ExecutiveAnalyticsShowcase;
