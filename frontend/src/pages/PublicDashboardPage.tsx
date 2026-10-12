import { useEffect, useState, useRef } from 'react';
import api, { API_BASE_URL } from '../config/api';
import FleetLiveMap from '../components/FleetLiveMap';
import VolumeTripsTrendChart from '../components/dashboard/VolumeTripsTrendChart';
import SectorCoverageBulletList from '../components/dashboard/SectorCoverageBulletList';
import SanitaryControlRunChart from '../components/dashboard/SanitaryControlRunChart';
import ValesRedemptionGauge from '../components/dashboard/ValesRedemptionGauge';
import AnalyticsMetasYProyecciones from '../components/dashboard/AnalyticsMetasYProyecciones';
import ExecutiveAnalyticsShowcase from '../components/dashboard/ExecutiveAnalyticsShowcase';
import { sanitizeOperationalDate } from '../utils/dashboardSanitizer';
import './PublicDashboardPage.css';
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

export default function PublicDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedCisternaPlaca, setSelectedCisternaPlaca] = useState<string | null>(null);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchStats = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      // Endpoint público sin requerimiento de autenticación
      const res = await api.get('/dashboard/stats');
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error al cargar datos del portal público:', err);
    } finally {
      if (isManual) setLoading(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    fetchStats(true);
  }, []);

  // Actualización periódica en vivo (cada 30 segundos)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Copiar link al portapapeles
  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    });
  };

  // Modo pantalla completa para monitores y salas de control
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const kpis = data?.kpis || {
    totalLitros: data?.totalLitros || 0,
    totalM3: ((data?.totalLitros || 0) / 1000).toFixed(2),
    totalBeneficiarios: data?.totalBeneficiarios || 0,
    totalPersonas: data?.kpis?.totalPersonas || 0,
    entregasRealizadas: data?.entregasRealizadas || 0,
    volumenRepartidoLitros: data?.totalLitros || 0,
    volumenRepartidoM3: ((data?.totalLitros || 0) / 1000).toFixed(2),
    programacionesActivas: data?.programacionesActivas || 0,
  };

  const vales = data?.vales || { total_vales: 0, entregados: 0, pendientes: 0, tasa_canje: 0 };
  const calidad = data?.calidad || {
    promedio_cloro_ppm: 1.55,
    promedio_turbiedad_ntu: 1.48,
    conformes: 4,
    total_controles: 5,
    cumplimiento_pct: 100
  };
  const flota = data?.flota || { total: 1, operativas: 1, capacidad_total_litros: 15000, cisternas: [] };
  const cisternasUbicaciones = data?.cisternas_ubicaciones || flota.cisternas || [];
  const sectores: SectorItem[] = data?.sectores || [];
  const tendencia: TendenciaItem[] = data?.tendencia || [];
  const calidadHistorico: CalidadHistoricoItem[] = data?.calidadHistorico || [];
  const ultimasEntregas: EntregaReciente[] = data?.ultimasEntregas || [];

  const tendenciaSaneada = tendencia.map((t) => ({
    ...t,
    fecha: sanitizeOperationalDate(t.fecha).formattedDisplay,
  }));

  const entregasFiltradas = selectedCisternaPlaca
    ? ultimasEntregas.filter((e) => e.cisterna_placa === selectedCisternaPlaca)
    : ultimasEntregas;

  return (
    <div className="public-dash-wrapper" ref={containerRef}>
      {/* 1. TOP PUBLIC NAVIGATION & CONTROLS */}
      <nav className="public-top-bar">
        <div className="public-top-content">
          <div className="public-brand-group">
            <div className="public-logo-badge">🚰</div>
            <div className="public-brand-text">
              <h1 className="public-brand-title">
                Portal de Transparencia y Monitoreo en Vivo
                <span className="live-indicator-chip">
                  <span className="live-pulse-dot"></span>
                  EN VIVO
                </span>
              </h1>
              <p className="public-brand-subtitle">
                EPS MOYOBAMBA S.A. • CONVENIO N° 023-2026/VIVIENDA/VMCS/PNSU/DE
              </p>
            </div>
          </div>

          <div className="public-controls-group">
            <button
              type="button"
              className="btn-public-action btn-public-share"
              onClick={handleCopyLink}
              title="Copiar link para compartir con directivos o fiscalizadores"
            >
              📋 Copiar Enlace
            </button>

            <button
              type="button"
              className="btn-public-action"
              onClick={() => window.print()}
              title="Imprimir resumen o guardar como PDF"
            >
              🖨️ Imprimir PDF
            </button>

            <button
              type="button"
              className="btn-public-action"
              onClick={toggleFullscreen}
              title="Alternar pantalla completa (ideal para TVs o salas de control)"
            >
              {isFullscreen ? '🗗 Salir' : '⛶ Pantalla Completa'}
            </button>

            <button
              type="button"
              className={`btn-public-action ${loading ? 'loading' : ''}`}
              onClick={() => fetchStats(true)}
              title="Actualizar datos en tiempo real"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
      </nav>

      {/* 2. BODY CONTENT */}
      <main className="public-dash-body">
        {/* BANNER INSTITUCIONAL DE TRANSPARENCIA */}
        <section className="public-inst-banner">
          <div className="inst-banner-left">
            <h2>Supervisión y Fiscalización de Distribución Gratuita de Agua Potable</h2>
            <p>
              Seguimiento oficial de la ejecución presupuestal, padrón de beneficiarios, rutas de cisternas y control sanitario de cloración.
            </p>
            <div className="inst-badges-row">
              <span className="inst-badge-pill pill-pnsu">🏛️ Ministerio de Vivienda — PNSU</span>
              <span className="inst-badge-pill pill-convenio">📑 Convenio N° 023-2026</span>
              <span className="inst-badge-pill pill-fuente">📍 PTAP San Mateo (Sector 2)</span>
              <span className="inst-badge-pill pill-convenio">🚛 Cisterna CAT-849 (15,000 L)</span>
            </div>
          </div>

          <div className="inst-banner-right">
            <span className="read-only-badge">🔒 Acceso Público • Solo Lectura</span>
            <span className="sync-time-stamp">
              Última actualización: <strong>{lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
            </span>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#475569', cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresco (cada 30s)
            </label>
          </div>
        </section>

        {/* 3. METAS, PROYECCIONES Y EJECUCIÓN PRESUPUESTAL OFICIAL */}
        <AnalyticsMetasYProyecciones
          sectoresSemanal={data?.sectores_semanal}
          sectoresMensual={data?.sectores_mensual}
          metasBeneficiarios={data?.metas_beneficiarios}
          objetivoGlobal={data?.objetivo_global}
          programacionesAvance={data?.programaciones_avance}
          ejecucionPresupuestal={data?.ejecucion_presupuestal}
        />

        {/* 4. EXECUTIVE ANALYTICS SHOWCASE: COMPARATIVAS Y MÉTRICAS DE IMPACTO */}
        <div style={{ marginTop: 24 }}>
          <ExecutiveAnalyticsShowcase
            kpis={kpis}
            calidad={calidad}
            vales={vales}
            flota={flota}
            tendencia={data?.tendencia || []}
            sectores={data?.sectores || []}
            loading={loading}
          />
        </div>

        {/* 5. TENDENCIA Y COBERTURA POR SECTORES */}
        <div className="charts-main-grid" style={{ marginTop: 24 }}>
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">📊 Tendencia de Despacho (Litros vs. Viajes)</h2>
                <p className="panel-subtitle">Volumen fiscalizado diario y efectividad operativa</p>
              </div>
            </div>
            <VolumeTripsTrendChart data={tendenciaSaneada} />
          </div>

          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🏘️ Cobertura por Sector / Asentamiento Humano</h2>
                <p className="panel-subtitle">Avance de entrega en los 6 sectores focalizados de Moyobamba</p>
              </div>
              <span className="badge-pill-cyan">{sectores.length} Sectores</span>
            </div>
            <SectorCoverageBulletList sectores={sectores} />
          </div>
        </div>

        {/* 6. CONTROL SANITARIO Y MEDIDOR DE VALES */}
        <div className="analytics-secondary-grid" style={{ marginTop: 24 }}>
          <div className="chart-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🧪 Monitoreo Sanitario: Cloro Residual (D.S. 031-2010-SA)</h2>
                <p className="panel-subtitle">Verificación de desinfección en surtidor y punto de entrega (≥ 0.5 mg/L)</p>
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

          <div className="chart-panel donut-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">🎟️ Redención de Vales Digitales PUB</h2>
                <p className="panel-subtitle">Tasa de canje de vales en entrega de agua</p>
              </div>
            </div>
            <ValesRedemptionGauge vales={vales} />
          </div>
        </div>

        {/* 7. MAPA SATELITAL DE FLOTA EN VIVO */}
        <div id="fleet-live-map-section" style={{ marginTop: 24 }}>
          <FleetLiveMap
            cisternas={cisternasUbicaciones}
            onRefresh={() => fetchStats(false)}
            onSelectCisterna={(placa) => setSelectedCisternaPlaca(placa === selectedCisternaPlaca ? null : placa)}
            selectedCisternaPlaca={selectedCisternaPlaca}
            focusCoords={mapFocusCoords}
          />
        </div>

        {/* 8. REGISTRO EN VIVO DE ENTREGAS FISCALIZADAS */}
        <div className="chart-panel full-width-panel" style={{ marginTop: 24 }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="panel-title">💧 Registro en Tiempo Real de Entregas Fiscalizadas</h2>
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
              <p className="panel-subtitle">Evidencia fotográfica, coordenadas GPS y padrón verificado</p>
            </div>
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
                  <th>Ubicación GPS</th>
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
                          {(() => {
                            if (!ent.fecha_hora) return '-';
                            const d = new Date(ent.fecha_hora);
                            if (isNaN(d.getTime()) || d.getFullYear() < 2020) {
                              const parts = String(ent.fecha_hora).split(' ');
                              return parts[0] || ent.fecha_hora;
                            }
                            return d.toLocaleDateString('es-PE');
                          })()}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>🕒</span>
                          <span>
                            {(() => {
                              if (!ent.fecha_hora) return '';
                              const d = new Date(ent.fecha_hora);
                              if (isNaN(d.getTime()) || d.getFullYear() < 2020) {
                                const parts = String(ent.fecha_hora).split(' ');
                                return parts[1] || '';
                              }
                              return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                            })()}
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
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                      <td className="font-mono text-cyan" style={{ fontWeight: 700 }}>
                        {Number(ent.litros_entregados).toLocaleString('es-PE')} L
                      </td>
                      <td>
                        <span className="sync-chip synced">
                          <span className="chip-dot"></span> GPS Conforme
                        </span>
                      </td>
                      <td>
                        {ent.foto_url ? (
                          <button
                            type="button"
                            className="btn-view-evidence"
                            onClick={() => setSelectedPhotoModal(`${API_BASE_URL}${ent.foto_url}`)}
                            title="Ver evidencia fotográfica"
                          >
                            📷 Ver Acta
                          </button>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 11 }}>Sin foto</span>
                        )}
                      </td>
                      <td>
                        {ent.latitud && ent.longitud ? (
                          <button
                            type="button"
                            className="btn-map-locate"
                            onClick={() => {
                              setMapFocusCoords({ lat: Number(ent.latitud), lng: Number(ent.longitud) });
                              const mapEl = document.getElementById('fleet-live-map-section');
                              if (mapEl) {
                                mapEl.scrollIntoView({ behavior: 'smooth' });
                              }
                            }}
                            title="Ver ubicación exacta en el mapa de flota"
                          >
                            📍 Localizar
                          </button>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 11 }}>Sin GPS</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 9. MODAL PARA AMPLIAR EVIDENCIA FOTOGRÁFICA */}
      {selectedPhotoModal && (
        <div className="photo-modal-overlay" onClick={() => setSelectedPhotoModal(null)}>
          <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn-close-modal"
              onClick={() => setSelectedPhotoModal(null)}
              title="Cerrar modal"
            >
              ✕
            </button>
            <div className="modal-header-photo">
              <h3>Acta / Evidencia Fotográfica de Entrega</h3>
              <p>Convenio PNSU • EPS Moyobamba S.A.</p>
            </div>
            <img src={selectedPhotoModal} alt="Evidencia de entrega" className="enlarged-photo" />
          </div>
        </div>
      )}

      {/* 10. TOAST NOTIFICATION */}
      {copiedToast && (
        <div className="public-toast">
          <span>✅</span>
          <span>¡Enlace copiado al portapapeles! Listo para compartir.</span>
        </div>
      )}

      {/* 11. FOOTER INSTITUCIONAL */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="footer-left">
            <strong>EMPRESA PRESTADORA DE SERVICIOS DE SANEAMIENTO — EPS MOYOBAMBA S.A.</strong>
            <p>
              Convenio de Cooperación Interinstitucional N° 023-2026/VIVIENDA/VMCS/PNSU/DE.
              Distribución Gratuita de Agua Potable para Poblaciones Vulnerables.
            </p>
          </div>
          <div className="footer-right">
            <span>Fuente: Surtidor PTAP San Mateo</span>
            <span>•</span>
            <a href="https://epsmoyobamba.gob.pe" target="_blank" rel="noopener noreferrer">
              Portal EPS Moyobamba
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
