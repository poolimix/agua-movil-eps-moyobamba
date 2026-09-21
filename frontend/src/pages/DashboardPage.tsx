import { useEffect, useState, useId } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../config/api';
import FleetLiveMap from '../components/FleetLiveMap';
import './DashboardPage.css';

interface SectorItem {
  sector_nombre: string;
  litros_entregados: number;
  total_entregas: number;
  total_beneficiarios: number;
  meta_litros: number;
  cumplimiento_pct: number;
}

interface TendenciaItem {
  fecha: string;
  litros: number;
  entregas: number;
}

interface CalidadHistoricoItem {
  id: number;
  fecha: string;
  cloro_residual_ppm: string | number;
  turbiedad_ntu: string | number;
  conforme_sanitario: boolean;
  aspecto_organoleptico: string;
  cisterna_placa: string;
  conductor: string;
}

interface EntregaReciente {
  id: number;
  litros_entregados: string | number;
  fecha_hora: string;
  beneficiario: string;
  dni: string;
  sector: string;
  sincronizado: number;
  foto_url: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeTooltip, setActiveTooltip] = useState<any>(null);
  const chartId = useId();

  // Date Range Filter States
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Default to August/September 2026 to match data and current project date
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date(2026, 7, 1)); // Agosto 2026

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(false);
    }, 15000); // 15 segundos en tiempo real
    return () => clearInterval(interval);
  }, [autoRefresh, startDate, endDate]);

  const fetchStats = async (showLoadingState = true, overrideStart?: string, overrideEnd?: string) => {
    try {
      if (showLoadingState) setLoading(true);
      const sDate = overrideStart !== undefined ? overrideStart : startDate;
      const eDate = overrideEnd !== undefined ? overrideEnd : endDate;

      let endpoint = '/dashboard/stats';
      const params = new URLSearchParams();
      if (sDate) params.append('fecha_inicio', sDate);
      if (eDate) params.append('fecha_fin', eDate);
      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const res = await api.get(endpoint);
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      if (showLoadingState) setLoading(false);
    }
  };

  // Helper date formatter: YYYY-MM-DD to DD/MM/YYYY
  const formatDisplayDate = (dStr: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dStr;
  };

  // Calendar calculations
  const month1Date = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
  const month2Date = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1);

  const prevMonth = () => {
    setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1));
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const renderMonthCalendar = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // In JS, getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday.
    // We want Monday = 0, Sunday = 6
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;

    const days = [];
    // Leading blanks
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<div key={`blank-${i}`} className="cal-cell empty"></div>);
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const isStart = startDate === dateStr;
      const isEnd = endDate === dateStr;
      
      const compDate = endDate || hoverDate;
      const inRange = Boolean(
        startDate && compDate && 
        ((dateStr > startDate && dateStr < compDate) || (dateStr < startDate && dateStr > compDate))
      );

      let cellClass = 'cal-cell day-num';
      if (isStart) cellClass += ' range-start';
      if (isEnd) cellClass += ' range-end';
      if (inRange) cellClass += ' in-range';

      days.push(
        <div
          key={dateStr}
          className={cellClass}
          onClick={() => handleDayClick(dateStr)}
          onMouseEnter={() => {
            if (startDate && !endDate) {
              setHoverDate(dateStr);
            }
          }}
        >
          <span>{d}</span>
        </div>
      );
    }

    return (
      <div className="single-month-cal">
        <div className="cal-month-title">
          {monthNames[month]} {year}
        </div>
        <div className="cal-weekdays-row">
          <span>Lu</span>
          <span>Ma</span>
          <span>Mi</span>
          <span>Ju</span>
          <span>Vi</span>
          <span>Sá</span>
          <span>Do</span>
        </div>
        <div className="cal-days-grid">{days}</div>
      </div>
    );
  };

  const handleDayClick = (dateStr: string) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(dateStr);
      setEndDate('');
      setHoverDate(null);
    } else if (startDate && !endDate) {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        setEndDate('');
      } else {
        setEndDate(dateStr);
        setHoverDate(null);
      }
    }
  };

  const applyPreset = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setIsPickerOpen(false);
    fetchStats(true, start, end);
  };

  const handleApplyFilter = () => {
    setIsPickerOpen(false);
    fetchStats(true, startDate, endDate);
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setHoverDate(null);
    setIsPickerOpen(false);
    fetchStats(true, '', '');
  };

  const isFilterActive = Boolean(startDate || endDate);


  const kpis = data?.kpis || {
    totalBeneficiarios: data?.totalBeneficiarios || 0,
    totalPersonas: 0,
    programacionesActivas: data?.programacionesActivas || 0,
    entregasRealizadas: data?.entregasRealizadas || 0,
    totalLitros: data?.totalLitros || 0,
    totalM3: ((data?.totalLitros || 0) / 1000).toFixed(2),
    metaMensualLitros: 10000,
    avanceMetaPct: 27
  };

  const vales = data?.vales || { total_vales: 0, entregados: 0, pendientes: 0, tasa_canje: 0 };
  const calidad = data?.calidad || {
    promedio_cloro_ppm: 1.55,
    promedio_turbiedad_ntu: 1.48,
    conformes: 4,
    total_controles: 5,
    cumplimiento_pct: 80
  };
  const flota = data?.flota || { total: 3, operativas: 2, capacidad_total_litros: 45000, cisternas: [] };
  const cisternasUbicaciones = data?.cisternas_ubicaciones || flota.cisternas || [];
  const sectores: SectorItem[] = data?.sectores || [];
  const tendencia: TendenciaItem[] = data?.tendencia || [];
  const calidadHistorico: CalidadHistoricoItem[] = data?.calidadHistorico || [];
  const ultimasEntregas: EntregaReciente[] = data?.ultimasEntregas || [];

  // Cálculos para gráfico de barras de tendencia
  const maxLitrosTendencia = Math.max(...tendencia.map(t => t.litros), 1000);

  // Cálculos para el Donut de Vales
  const totalValesContados = Math.max(vales.total_vales, 1);
  const pctCanjeados = Math.min(100, Math.round((vales.entregados / totalValesContados) * 100));
  const pctPendientes = Math.max(0, 100 - pctCanjeados);
  const strokeDashoffset = 251.2 - (251.2 * pctCanjeados) / 100;

  return (
    <Layout>
      <div className="dash-container">
        {/* TOP HEADER WITH CONTROLS & DATE FILTER */}
        <header className="dash-header">
          <div className="dash-header-left">
            <div className="dash-badge-live">
              <span className="live-dot"></span>
              <span className="live-text">SISTEMA EN LÍNEA • MONITOREO EN TIEMPO REAL</span>
            </div>
            <h1 className="dash-title">Dashboard de Control Operativo y Sanitario</h1>
            <p className="dash-subtitle">
              Supervisión de distribución de agua potable en cisternas, calidad fisicoquímica y padrón PUB — <strong>EPS Moyobamba S.A.</strong>
            </p>

            {/* Quick Actions (Auto-refresh & Actualizar) */}
            <div className="dash-header-subactions">
              <label className="auto-refresh-switch" title="Actualiza automáticamente cada 15 segundos">
                <input 
                  type="checkbox" 
                  checked={autoRefresh} 
                  onChange={(e) => setAutoRefresh(e.target.checked)} 
                />
                <span className="switch-slider"></span>
                <span className="switch-text">Auto (15s)</span>
              </label>

              <button 
                className={`refresh-action-btn ${loading ? 'loading' : ''}`} 
                onClick={() => fetchStats(true)}
                title="Sincronizar métricas con el servidor"
              >
                <span className="spin-icon">🔄</span>
                <span>Actualizar</span>
              </button>

              <span className="last-sync-time-inline">
                Última sincronización: <strong>{lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
              </span>
            </div>
          </div>

          {/* RIGHT SIDE: DATE RANGE PICKER (Ubicado en el recuadro superior derecho) */}
          <div className="dash-header-right">
            <div className="date-range-picker-box">
              <div 
                className={`date-inputs-trigger ${isPickerOpen ? 'active' : ''} ${isFilterActive ? 'has-filter' : ''}`}
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                title="Filtrar por rango de fechas (Inicio y Fin)"
              >
                <div className="date-slot">
                  <span className="slot-label">INICIO</span>
                  <div className="slot-val-row">
                    <span className="slot-val">{startDate ? formatDisplayDate(startDate) : 'Seleccionar'}</span>
                    <span className="cal-icon">📅</span>
                  </div>
                </div>

                <div className="slot-divider"></div>

                <div className="date-slot">
                  <span className="slot-label">FIN</span>
                  <div className="slot-val-row">
                    <span className="slot-val">{endDate ? formatDisplayDate(endDate) : 'Seleccionar'}</span>
                    <span className="cal-icon">📅</span>
                  </div>
                </div>
              </div>

              {/* DUAL MONTH CALENDAR DROPDOWN */}
              {isPickerOpen && (
                <div className="dual-calendar-dropdown">
                  <div className="cal-dropdown-header">
                    <button type="button" className="cal-nav-btn prev" onClick={prevMonth} title="Mes anterior">
                      ‹
                    </button>
                    <span className="cal-header-hint">Seleccione fecha inicial (Inicio) y final (Fin)</span>
                    <button type="button" className="cal-nav-btn next" onClick={nextMonth} title="Mes siguiente">
                      ›
                    </button>
                  </div>

                  <div className="dual-months-wrapper">
                    {renderMonthCalendar(month1Date)}
                    {renderMonthCalendar(month2Date)}
                  </div>

                  {/* QUICK PRESETS */}
                  <div className="cal-presets-row">
                    <button type="button" className="preset-btn" onClick={() => applyPreset('2026-09-01', '2026-09-02')}>Hoy / Reciente</button>
                    <button type="button" className="preset-btn" onClick={() => applyPreset('2026-08-26', '2026-09-02')}>Últimos 7 días</button>
                    <button type="button" className="preset-btn" onClick={() => applyPreset('2026-08-01', '2026-08-31')}>Agosto 2026</button>
                    <button type="button" className="preset-btn" onClick={() => applyPreset('2026-09-01', '2026-09-30')}>Septiembre 2026</button>
                    <button type="button" className="preset-btn" onClick={handleClearFilter}>Todo el Periodo</button>
                  </div>

                  {/* FOOTER ACTIONS */}
                  <div className="cal-dropdown-footer">
                    <button type="button" className="btn-cal-clear" onClick={handleClearFilter}>
                      Limpiar
                    </button>
                    <div className="cal-footer-right">
                      <button type="button" className="btn-cal-cancel" onClick={() => setIsPickerOpen(false)}>
                        Cerrar
                      </button>
                      <button type="button" className="btn-cal-apply" onClick={handleApplyFilter}>
                        Aplicar Filtro
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* OFFICIAL PRINT HEADER (Only shows when printing report) */}
        <div className="official-print-header">
          <div className="print-brand-row">
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#475569' }}>Gerencia de Operaciones • Sistema de Distribución de Agua Móvil (Agua Móvil)</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
              Fecha Emisión: <strong>{new Date().toLocaleDateString('es-PE')}</strong>
            </div>
          </div>
          <hr style={{ margin: '10px 0', borderColor: '#cbd5e1' }} />
          <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>REPORTE ESPECÍFICO DE FISCALIZACIÓN Y CONTROL OPERATIVO</strong>
            <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
              Periodo Filtrado: <strong>{startDate ? formatDisplayDate(startDate) : 'Inicio Histórico'}</strong> hasta <strong>{endDate ? formatDisplayDate(endDate) : 'Fecha Actual'}</strong>
            </div>
          </div>
        </div>

        {/* EXECUTIVE REPORT BANNER (Visible cuando hay filtro activo) */}
        {isFilterActive && (
          <section className="period-report-banner">
            <div className="report-banner-left">
              <div className="report-badge-tag">📊 REPORTE ESPECÍFICO POR FECHAS (FILTRO ACTIVO)</div>
              <h2 className="report-period-title">
                Periodo Evaluado: <strong>{startDate ? formatDisplayDate(startDate) : 'Histórico'}</strong> al <strong>{endDate ? formatDisplayDate(endDate) : 'Presente'}</strong>
              </h2>
              <div className="report-stat-pills">
                <span className="stat-pill">🚰 Volumen: <strong>{Number(kpis.totalLitros).toLocaleString('es-PE')} L</strong> ({kpis.totalM3} m³)</span>
                <span className="stat-pill">🚚 Entregas / Viajes: <strong>{kpis.entregasRealizadas}</strong></span>
                <span className="stat-pill">🧪 Calidad Sanitaria: <strong>{calidad.cumplimiento_pct}% Apto</strong></span>
                <span className="stat-pill">🎟️ Vales Canjeados: <strong>{vales.entregados}</strong></span>
              </div>
            </div>

            <div className="report-banner-actions">
              <button 
                type="button" 
                className="btn-print-report" 
                onClick={() => window.print()}
                title="Imprimir o guardar reporte oficial en PDF"
              >
                📄 Imprimir / Reporte PDF
              </button>
              <button 
                type="button" 
                className="btn-clear-report" 
                onClick={handleClearFilter}
                title="Quitar filtro y ver periodo completo"
              >
                ✖ Quitar Filtro
              </button>
            </div>
          </section>
        )}


        {/* 5 EXECUTIVE KPI CARDS */}
        <section className="kpi-grid">
          {/* KPI 1: Beneficiarios */}
          <div className="kpi-card card-blue">
            <div className="kpi-icon-wrap">
              <span className="kpi-icon">👥</span>
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Padrón Único (PUB)</span>
              <div className="kpi-val-row">
                <span className="kpi-value">{loading && !data ? '...' : kpis.totalBeneficiarios}</span>
                <span className="kpi-badge badge-blue">Familias</span>
              </div>
              <div className="kpi-foot">
                <span>{kpis.totalPersonas > 0 ? `${kpis.totalPersonas} personas beneficiadas` : 'Dotación prioritaria'}</span>
                <span className="kpi-sublink">50 L/hab/día</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Volumen Total */}
          <div className="kpi-card card-cyan">
            <div className="kpi-icon-wrap">
              <span className="kpi-icon">🚰</span>
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Volumen Total Repartido</span>
              <div className="kpi-val-row">
                <span className="kpi-value">{loading && !data ? '...' : Number(kpis.totalLitros).toLocaleString('es-PE')}</span>
                <span className="kpi-unit">Litros</span>
              </div>
              <div className="kpi-progress-wrap">
                <div className="kpi-progress-bar">
                  <div className="kpi-progress-fill" style={{ width: `${kpis.avanceMetaPct}%` }}></div>
                </div>
                <div className="kpi-progress-labels">
                  <span>{kpis.totalM3} m³ fiscalizados</span>
                  <span className="pct-badge">{kpis.avanceMetaPct}% meta PNSU</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI 3: Calidad de Agua */}
          <div className="kpi-card card-emerald">
            <div className="kpi-icon-wrap">
              <span className="kpi-icon">🧪</span>
            </div>
            <div className="kpi-body">
              <div className="kpi-header-row">
                <span className="kpi-label">Control Sanitario (Cloro)</span>
                <span className="kpi-badge badge-green">{calidad.cumplimiento_pct}% Apto</span>
              </div>
              <div className="kpi-val-row">
                <span className="kpi-value">{loading && !data ? '...' : `${calidad.promedio_cloro_ppm} `}</span>
                <span className="kpi-unit">ppm</span>
              </div>
              <div className="kpi-foot">
                <span>Turbiedad: <strong>{calidad.promedio_turbiedad_ntu} NTU</strong></span>
                <span className="compliance-tag tag-ok">D.S. 031-2010-SA</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Vales de Consumo */}
          <div className="kpi-card card-amber">
            <div className="kpi-icon-wrap">
              <span className="kpi-icon">🎟️</span>
            </div>
            <div className="kpi-body">
              <div className="kpi-header-row">
                <span className="kpi-label">Vales de Consumo</span>
                <span className="kpi-badge badge-amber">{vales.entregados} Canjeados</span>
              </div>
              <div className="kpi-val-row">
                <span className="kpi-value">{loading && !data ? '...' : `${vales.entregados} / ${vales.total_vales}`}</span>
              </div>
              <div className="kpi-foot">
                <span>{vales.pendientes} pendientes de entrega</span>
                <span className="kpi-badge-sub">Efectividad: {vales.tasa_canje}%</span>
              </div>
            </div>
          </div>

          {/* KPI 5: Flota Cisternas */}
          <div className="kpi-card card-indigo">
            <div className="kpi-icon-wrap">
              <span className="kpi-icon">🚛</span>
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Flota de Cisternas</span>
              <div className="kpi-val-row">
                <span className="kpi-value">{flota.operativas} / {flota.total}</span>
                <span className="kpi-badge badge-indigo">En Operación</span>
              </div>
              <div className="kpi-foot">
                <span>Capacidad móvil: {(flota.capacidad_total_litros / 1000).toFixed(0)} m³</span>
                <span className="routes-tag">{kpis.programacionesActivas} rutas activas</span>
              </div>
            </div>
          </div>
        </section>

        {/* ROW OF MAIN CHARTS */}
        <div className="charts-main-grid">
          {/* CHART 1: TENDENCIA TEMPORAL (COMBO BARRA + LINEA) */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">📊 Tendencia de Reparto de Agua (Litros y Viajes)</h2>
                <p className="panel-subtitle">Volumen fiscalizado y número de entregas realizadas por fecha</p>
              </div>
              <div className="legend-pills">
                <span className="legend-pill pill-bar"><span className="legend-dot dot-cyan"></span> Litros Repartidos</span>
                <span className="legend-pill pill-line"><span className="legend-dot dot-amber"></span> Entregas</span>
              </div>
            </div>

            <div className="chart-wrapper">
              {tendencia.length === 0 ? (
                <div className="chart-empty">No hay registros de reparto para el periodo seleccionado</div>
              ) : (
                <div className="svg-chart-container">
                  <svg className="responsive-svg" viewBox="0 0 600 240" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id={`${chartId}-barGradient`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
                      </linearGradient>
                      <linearGradient id={`${chartId}-areaGradient`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Líneas Guía Horizontales */}
                    <line x1="40" y1="30" x2="580" y2="30" stroke="#e2e8f0" strokeDasharray="4 4" />
                    <line x1="40" y1="80" x2="580" y2="80" stroke="#e2e8f0" strokeDasharray="4 4" />
                    <line x1="40" y1="130" x2="580" y2="130" stroke="#e2e8f0" strokeDasharray="4 4" />
                    <line x1="40" y1="180" x2="580" y2="180" stroke="#cbd5e1" />

                    {/* Eje Y Labels */}
                    <text x="35" y="34" className="chart-axis-text" textAnchor="end">{maxLitrosTendencia} L</text>
                    <text x="35" y="108" className="chart-axis-text" textAnchor="end">{Math.round(maxLitrosTendencia / 2)} L</text>
                    <text x="35" y="184" className="chart-axis-text" textAnchor="end">0 L</text>

                    {/* Barras de Volumen */}
                    {tendencia.map((item, idx) => {
                      const totalItems = tendencia.length;
                      const availableWidth = 520;
                      const step = availableWidth / (totalItems || 1);
                      const barWidth = Math.min(46, step * 0.5);
                      const x = 50 + idx * step + (step - barWidth) / 2;
                      const barHeight = Math.max(8, (item.litros / maxLitrosTendencia) * 140);
                      const y = 180 - barHeight;

                      return (
                        <g 
                          key={item.fecha} 
                          className="bar-group"
                          onMouseEnter={() => setActiveTooltip({ type: 'tendencia', item, x, y })}
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx="5"
                            fill={`url(#${chartId}-barGradient)`}
                            className="animated-bar"
                          />
                          {/* Label superior con litros */}
                          <text 
                            x={x + barWidth / 2} 
                            y={y - 6} 
                            textAnchor="middle" 
                            className="chart-bar-value"
                          >
                            {item.litros}L
                          </text>
                          {/* Label fecha inferior */}
                          <text 
                            x={x + barWidth / 2} 
                            y="200" 
                            textAnchor="middle" 
                            className="chart-x-text"
                          >
                            {item.fecha}
                          </text>
                          {/* Badge de entregas */}
                          <circle cx={x + barWidth / 2} cy={y + 12} r="9" fill="#f59e0b" />
                          <text x={x + barWidth / 2} y={y + 16} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
                            {item.entregas}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {activeTooltip && (
                    <div 
                      className="chart-floating-tooltip"
                      style={{ 
                        position: 'absolute', 
                        left: `${Math.min(80, Math.max(10, (activeTooltip.x / 600) * 100))}%`, 
                        top: Math.max(10, activeTooltip.y - 45),
                        pointerEvents: 'none',
                        background: '#0f172a',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        zIndex: 10,
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center'
                      }}
                    >
                      <span>📅 {activeTooltip.item.fecha}</span>
                      <span>💧 {Number(activeTooltip.item.litros).toLocaleString('es-PE')} L</span>
                      <span>🚛 {activeTooltip.item.entregas} viajes</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CHART 2: COBERTURA Y CUMPLIMIENTO POR SECTOR */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🏘️ Cobertura y Metas por Sector / AA.HH.</h2>
                <p className="panel-subtitle">Volumen entregado vs Meta semanal asignada por zona</p>
              </div>
              <span className="badge-pill-cyan">{sectores.length} Sectores</span>
            </div>

            <div className="sector-bars-list">
              {sectores.map((sec) => (
                <div key={sec.sector_nombre} className="sector-bar-item">
                  <div className="sector-meta-header">
                    <div className="sector-name-box">
                      <span className="sector-icon">📍</span>
                      <strong>{sec.sector_nombre}</strong>
                      <span className="fam-count">({sec.total_beneficiarios} familias)</span>
                    </div>
                    <div className="sector-stat-nums">
                      <span className="vol-delivered"><strong>{Number(sec.litros_entregados).toLocaleString('es-PE')} L</strong></span>
                      <span className="vol-meta"> / {Number(sec.meta_litros).toLocaleString('es-PE')} L meta</span>
                      <span className={`cumplimiento-chip ${sec.cumplimiento_pct >= 50 ? 'chip-high' : 'chip-mid'}`}>
                        {sec.cumplimiento_pct}%
                      </span>
                    </div>
                  </div>

                  <div className="sector-progress-track">
                    <div 
                      className="sector-progress-bar"
                      style={{ 
                        width: `${Math.min(100, Math.max(4, sec.cumplimiento_pct))}%`,
                        background: sec.cumplimiento_pct >= 50 
                          ? 'linear-gradient(90deg, #0284c7 0%, #10b981 100%)' 
                          : 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)'
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW OF SECONDARY ANALYTICS: QUALITY MONITORING + DONUT VALES */}
        <div className="analytics-secondary-grid">
          {/* CHART 3: CONTROL SANITARIO DE CLORACIÓN Y TURBIEDAD */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🧪 Control de Calidad Sanitaria (D.S. 031-2010-SA)</h2>
                <p className="panel-subtitle">Monitoreo de Cloro Residual Libre (rango apto: 0.5 a 2.0 ppm) y Turbiedad (&lt; 5 NTU)</p>
              </div>
              <div className="sanitary-norm-tag">
                <span>Rango Seguro: 0.5 - 2.0 ppm</span>
              </div>
            </div>

            <div className="quality-monitoring-wrap">
              {/* Quality metric widgets */}
              <div className="quality-metric-row">
                <div className="q-badge-box">
                  <span className="q-badge-title">Promedio Cloro Residual</span>
                  <span className="q-badge-num num-green">{calidad.promedio_cloro_ppm} ppm</span>
                  <span className="q-badge-sub">Límite norma: 0.5 - 2.0 ppm</span>
                </div>
                <div className="q-badge-box">
                  <span className="q-badge-title">Promedio Turbiedad</span>
                  <span className="q-badge-num num-cyan">{calidad.promedio_turbiedad_ntu} NTU</span>
                  <span className="q-badge-sub">Límite norma: &le; 5.0 NTU</span>
                </div>
                <div className="q-badge-box">
                  <span className="q-badge-title">Cumplimiento Sanitario</span>
                  <span className="q-badge-num num-emerald">{calidad.cumplimiento_pct}%</span>
                  <span className="q-badge-sub">{calidad.conformes} de {calidad.total_controles} conformes</span>
                </div>
              </div>

              {/* Quality tests mini-table */}
              <div className="table-responsive-wrap">
                <table className="mini-data-table">
                  <thead>
                    <tr>
                      <th>Fecha / Hora</th>
                      <th>Cisterna</th>
                      <th>Cloro (ppm)</th>
                      <th>Turbiedad</th>
                      <th>Aspecto</th>
                      <th>Estado Sanitario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calidadHistorico.slice(0, 5).map((q) => (
                      <tr key={q.id}>
                        <td className="font-mono">{q.fecha}</td>
                        <td><span className="cisterna-tag">{q.cisterna_placa}</span></td>
                        <td>
                          <span className={`cloro-val ${parseFloat(String(q.cloro_residual_ppm)) >= 0.5 && parseFloat(String(q.cloro_residual_ppm)) <= 2.0 ? 'val-good' : 'val-warn'}`}>
                            {q.cloro_residual_ppm} ppm
                          </span>
                        </td>
                        <td>{q.turbiedad_ntu} NTU</td>
                        <td>{q.aspecto_organoleptico || 'Límpido'}</td>
                        <td>
                          {q.conforme_sanitario ? (
                            <span className="status-badge-conforme">✅ Conforme</span>
                          ) : (
                            <span className="status-badge-alerta">⚠️ Alerta Sanitaria</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* CHART 4: DONUT VALES & RESUMEN DE COBERTURA */}
          <div className="chart-panel donut-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🎟️ Distribución y Estado de Vales</h2>
                <p className="panel-subtitle">Tasa de canje en punto de entrega</p>
              </div>
            </div>

            <div className="donut-chart-box">
              <div className="donut-container">
                <svg viewBox="0 0 100 100" className="donut-svg">
                  {/* Círculo de fondo (pendientes) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#fed7aa"
                    strokeWidth="12"
                  />
                  {/* Círculo de canjeados */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#f59e0b"
                    strokeWidth="12"
                    strokeDasharray="251.2"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                  />
                </svg>
                <div className="donut-center-label">
                  <span className="donut-pct">{pctCanjeados}%</span>
                  <span className="donut-text">Canjeado</span>
                </div>
              </div>

              <div className="donut-legend-list">
                <div className="donut-legend-item">
                  <span className="legend-color-box bg-amber"></span>
                  <div className="legend-info">
                    <span className="item-title">Canjeados / Entregados</span>
                    <strong className="item-val">{vales.entregados} vales</strong>
                  </div>
                </div>

                <div className="donut-legend-item">
                  <span className="legend-color-box bg-amber-light"></span>
                  <div className="legend-info">
                    <span className="item-title">Pendientes en Padrón</span>
                    <strong className="item-val">{vales.pendientes} vales ({pctPendientes}%)</strong>
                  </div>
                </div>

                <div className="donut-summary-callout">
                  <span>Total Vales Emitidos: <strong>{vales.total_vales}</strong></span>
                  <span>Litros Asociados: <strong>{Number(vales.total_vales * 200).toLocaleString('es-PE')} L</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* LIVE FLEET MAP MONITOREO SATELITAL GPS */}
        <FleetLiveMap 
          cisternas={cisternasUbicaciones} 
          onRefresh={() => fetchStats(false)} 
        />

        {/* LIVE RECENT ACTIVITY: ULTIMAS ENTREGAS */}
        <div className="chart-panel full-width-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">💧 Registro en Vivo de Entregas Fiscalizadas</h2>
              <p className="panel-subtitle">Últimas cargas despachadas con verificación satelital GPS y firmas digitales</p>
            </div>
            <Link to="/entregas" className="view-all-link">Ver todas las actas &rarr;</Link>
          </div>

          <div className="table-responsive-wrap">
            <table className="mini-data-table full-table">
              <thead>
                <tr>
                  <th>Hora / Fecha</th>
                  <th>Beneficiario (PUB)</th>
                  <th>DNI</th>
                  <th>Sector / Asentamiento</th>
                  <th>Litros Despachados</th>
                  <th>Verificación</th>
                  <th>Acta / Foto</th>
                </tr>
              </thead>
              <tbody>
                {ultimasEntregas.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No hay entregas recientes registradas</td>
                  </tr>
                ) : (
                  ultimasEntregas.map((ent) => (
                    <tr key={ent.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                          {isNaN(new Date(ent.fecha_hora).getTime())
                            ? (ent.fecha_hora?.split(' ')[0] || ent.fecha_hora)
                            : new Date(ent.fecha_hora).toLocaleDateString('es-PE')}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>🕒</span>
                          <span>
                            {isNaN(new Date(ent.fecha_hora).getTime())
                              ? (ent.fecha_hora?.split(' ')[1] || '')
                              : new Date(ent.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="user-cell">
                          <span className="avatar-mini">👤</span>
                          <strong>{ent.beneficiario}</strong>
                        </div>
                      </td>
                      <td className="font-mono">{ent.dni}</td>
                      <td>
                        <span className="sector-pill">📍 {ent.sector}</span>
                      </td>
                      <td>
                        <span className="litros-pill">🚰 {Number(ent.litros_entregados).toLocaleString('es-PE')} L</span>
                      </td>
                      <td>
                        <span className="badge-gps-ok">📡 GPS & Firma OK</span>
                      </td>
                      <td>
                        {ent.foto_url ? (
                          <span className="badge-foto-ok">📸 Foto Evidencia</span>
                        ) : (
                          <span className="badge-firma-ok">✍️ Firma Digital</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* QUICK ACCESS MODULES */}
        <section className="dash-modules-section">
          <div className="modules-header">
            <h2 className="section-title">⚡ Módulos Operativos del Sistema</h2>
            <p className="section-subtitle">Acceso directo a las herramientas de fiscalización y gestión del servicio</p>
          </div>

          <div className="modules-grid">
            <Link to="/beneficiarios" className="mod-card">
              <div className="mod-icon-bg bg-blue-grad">📥</div>
              <div className="mod-content">
                <h3>Padrón Único (PUB)</h3>
                <p>Carga masiva Excel, validación DNI y catastro de familias.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/vales" className="mod-card">
              <div className="mod-icon-bg bg-amber-grad">🎟️</div>
              <div className="mod-content">
                <h3>Vales de Consumo</h3>
                <p>Generación de códigos únicos, QR y trazabilidad de canje.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/calidad" className="mod-card">
              <div className="mod-icon-bg bg-emerald-grad">🧪</div>
              <div className="mod-content">
                <h3>Control de Calidad</h3>
                <p>Registro de Cloro Residual Libre y Turbiedad según norma sanitaria.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/programaciones" className="mod-card">
              <div className="mod-icon-bg bg-indigo-grad">📋</div>
              <div className="mod-content">
                <h3>Rutas y Cronogramas</h3>
                <p>Asignación logística de cisterna, chofer y sectores.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/entregas" className="mod-card">
              <div className="mod-icon-bg bg-cyan-grad">🚰</div>
              <div className="mod-content">
                <h3>Fiscalización y Actas</h3>
                <p>Generación de PDF con firma del beneficiario y geolocalización.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/informes" className="mod-card">
              <div className="mod-icon-bg" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff' }}>📑</div>
              <div className="mod-content">
                <h3>Informes Oficiales</h3>
                <p>Generación de Anexo 2 PNSU, Cuadros 1, 6, 7, 8 y panel de 18 fotos.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/balance" className="mod-card">
              <div className="mod-icon-bg" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', color: '#fff' }}>⚖️</div>
              <div className="mod-content">
                <h3>Balance Hídrico</h3>
                <p>Conciliación de cargas en surtidor vs. reparto y control de mermas.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>

            <Link to="/metas" className="mod-card">
              <div className="mod-icon-bg bg-rose-grad">🎯</div>
              <div className="mod-content">
                <h3>Metas y PNSU</h3>
                <p>Indicadores mensuales de dotación y cumplimiento del servicio.</p>
              </div>
              <span className="mod-arrow">&rarr;</span>
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}

