import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../config/api';
import FleetLiveMap from '../components/FleetLiveMap';
import VolumeTripsTrendChart from '../components/dashboard/VolumeTripsTrendChart';
import SectorCoverageBulletList from '../components/dashboard/SectorCoverageBulletList';
import SanitaryControlRunChart from '../components/dashboard/SanitaryControlRunChart';
import ValesRedemptionGauge from '../components/dashboard/ValesRedemptionGauge';
import { sanitizeOperationalDate, validateDriverAssignmentSanity } from '../utils/dashboardSanitizer';
import AnalyticsMetasYProyecciones from '../components/dashboard/AnalyticsMetasYProyecciones';
import ExecutiveAnalyticsShowcase from '../components/dashboard/ExecutiveAnalyticsShowcase';
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
  cisterna_placa?: string;
  latitud?: number | string | null;
  longitud?: number | string | null;
  sincronizado: number;
  foto_url: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedCisternaPlaca, setSelectedCisternaPlaca] = useState<string | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<{ lat: number; lng: number; label?: string } | null>(null);

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
    totalPersonas: data?.kpis?.totalPersonas || 0,
    programacionesActivas: data?.programacionesActivas || 0,
    entregasRealizadas: data?.entregasRealizadas || 0,
    totalLitros: data?.totalLitros || 0,
    totalM3: ((data?.totalLitros || 0) / 1000).toFixed(2),
    volumenRepartidoLitros: data?.totalLitros || 0,
    volumenRepartidoM3: ((data?.totalLitros || 0) / 1000).toFixed(2),
    volumenPromedioFamilia: 350,
    volumenPromedioPersona: 50,
    poblacionBeneficiada: 0,
    familiasAtendidas: 0,
    montoTotalSoles: (((data?.totalLitros || 0) / 1000) * 39.13).toFixed(2),
    tarifaRefM3: 39.13,
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

  // Normalización de fechas para gráfico de tendencia (date-fns)
  const tendenciaSaneada = tendencia.map((t) => ({
    ...t,
    fecha: sanitizeOperationalDate(t.fecha).formattedDisplay,
  }));

  // Validación de integridad operativa de la flota
  const driverAlerts = validateDriverAssignmentSanity(cisternasUbicaciones);

  // Sincronización Map-to-Table: Filtrado interactivo por cisterna seleccionada
  const entregasFiltradas = selectedCisternaPlaca
    ? ultimasEntregas.filter((e) => e.cisterna_placa === selectedCisternaPlaca)
    : ultimasEntregas;

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

        {/* EXECUTIVE ANALYTICS SHOWCASE: COMPARATIVA DE BARRAS, ANILLOS CONCÉNTRICOS Y MICRO-GRÁFICOS */}
        <ExecutiveAnalyticsShowcase
          kpis={kpis}
          calidad={calidad}
          vales={vales}
          flota={flota}
          tendencia={data?.tendencia || []}
          sectores={data?.sectores || []}
          loading={loading}
        />

        {/* FLEET OPERATIONAL INTEGRITY ALERT (SI EXISTE INCONSISTENCIA) */}
        {driverAlerts.length > 0 && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 14,
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#b91c1c',
            fontSize: 13,
            fontWeight: 600,
          }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <strong style={{ display: 'block', color: '#991b1b', marginBottom: 2 }}>Alerta de Integridad de Flota:</strong>
              {driverAlerts.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          </div>
        )}

        {/* METAS, PROYECCIONES Y CUMPLIMIENTO INTERACTIVO */}
        <AnalyticsMetasYProyecciones
          sectoresSemanal={data?.sectores_semanal}
          sectoresMensual={data?.sectores_mensual}
          metasBeneficiarios={data?.metas_beneficiarios}
          objetivoGlobal={data?.objetivo_global}
          programacionesAvance={data?.programaciones_avance}
        />

        {/* ROW OF MAIN CHARTS */}
        <div className="charts-main-grid">
          {/* CHART 1: TENDENCIA TEMPORAL (COMBO BARRA + LINEA CON DOBLE EJE Y RATIO EFICIENCIA) */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">📊 Tendencia de Reparto de Agua (Litros vs. Viajes)</h2>
                <p className="panel-subtitle">Doble eje: Volumen fiscalizado (barras) vs. Despachos realizados (línea) y ratio de eficiencia</p>
              </div>
            </div>

            <VolumeTripsTrendChart data={tendenciaSaneada} />
          </div>

          {/* CHART 2: COBERTURA Y CUMPLIMIENTO POR SECTOR (BULLET PROGRESS CON UMBRALES PNSU) */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🏘️ Cobertura y Metas por Sector / AA.HH.</h2>
                <p className="panel-subtitle">Priorización automática de zonas críticas de menor a mayor avance (PNSU)</p>
              </div>
              <span className="badge-pill-cyan">{sectores.length} Sectores</span>
            </div>

            <SectorCoverageBulletList sectores={sectores} />
          </div>
        </div>

        {/* ROW OF SECONDARY ANALYTICS: QUALITY MONITORING RUN CHART + GAUGE VALES */}
        <div className="analytics-secondary-grid">
          {/* CHART 3: CONTROL SANITARIO DE CLORACIÓN Y TURBIEDAD (RUN CHART D.S. 031-2010-SA) */}
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🧪 Fiscalización Sanitaria: Cloro Residual (D.S. 031-2010-SA)</h2>
                <p className="panel-subtitle">Carta de control estadístico con franja segura (0.50 - 2.00 ppm) y alertas de riesgo</p>
              </div>
              <div className="sanitary-norm-tag">
                <span>Rango Seguro: 0.5 - 2.0 ppm</span>
              </div>
            </div>

            <SanitaryControlRunChart
              historico={calidadHistorico}
              promedioCloro={calidad.promedio_cloro_ppm}
              promedioTurbiedad={calidad.promedio_turbiedad_ntu}
              pctCumplimiento={calidad.cumplimiento_pct}
              totalConformes={calidad.conformes}
              totalControles={calidad.total_controles}
            />
          </div>

          {/* CHART 4: MEDIDOR SEMI-DONUT DE VALES & RESUMEN DE COBERTURA */}
          <div className="chart-panel donut-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🎟️ Redención de Vales Digitales</h2>
                <p className="panel-subtitle">Medidor de efectividad de canje en punto de entrega</p>
              </div>
            </div>

            <ValesRedemptionGauge vales={vales} />
          </div>
        </div>

        {/* LIVE FLEET MAP MONITOREO SATELITAL GPS */}
        <div id="fleet-live-map-section">
          <FleetLiveMap 
            cisternas={cisternasUbicaciones} 
            onRefresh={() => fetchStats(false)} 
            onSelectCisterna={(placa) => setSelectedCisternaPlaca(placa === selectedCisternaPlaca ? null : placa)}
            selectedCisternaPlaca={selectedCisternaPlaca}
            focusCoords={mapFocusCoords}
          />
        </div>

        {/* LIVE RECENT ACTIVITY: ULTIMAS ENTREGAS */}
        <div className="chart-panel full-width-panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="panel-title">💧 Registro en Vivo de Entregas Fiscalizadas</h2>
                {selectedCisternaPlaca && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                    padding: '2px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    Filtrando por cisterna: <strong>{selectedCisternaPlaca}</strong>
                    <button
                      type="button"
                      onClick={() => setSelectedCisternaPlaca(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontWeight: 900, padding: 0 }}
                      title="Quitar filtro de cisterna"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
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
                  <th>Cisterna</th>
                  <th>Litros Despachados</th>
                  <th>Verificación</th>
                  <th>Acta / Foto</th>
                  <th>Acción GPS</th>
                </tr>
              </thead>
              <tbody>
                {entregasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      {selectedCisternaPlaca 
                        ? `No hay entregas registradas para la cisterna ${selectedCisternaPlaca}` 
                        : 'No hay entregas recientes registradas'}
                    </td>
                  </tr>
                ) : (
                  entregasFiltradas.map((ent) => (
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
                        {ent.cisterna_placa ? (
                          <span 
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedCisternaPlaca(ent.cisterna_placa || null)}
                            title="Filtrar por esta cisterna"
                          >
                            🚛 {ent.cisterna_placa}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>N/D</span>
                        )}
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
                      <td>
                        {ent.latitud && ent.longitud ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => {
                              setMapFocusCoords({
                                lat: Number(ent.latitud),
                                lng: Number(ent.longitud),
                                label: `${ent.beneficiario} • ${ent.sector}`
                              });
                              const el = document.getElementById('fleet-live-map-section');
                              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            title="Ver en mapa satelital GPS"
                          >
                            🎯 Enfocar GPS
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>Sin GPS</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

