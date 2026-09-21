import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../config/api';
import { dialogAlert } from '../context/DialogContext';
import './Modules.css';

interface ControlCalidad {
  id: number;
  programacion_id?: number;
  cisterna_id?: number;
  cisterna_placa?: string;
  conductor_nombre?: string;
  cloro_residual_ppm: number;
  turbiedad_ntu: number;
  aspecto_organoleptico: string;
  conforme_sanitario: boolean;
  etapa_control?: string; // 'CARGA', 'RUTA', 'ADICIONAL'
  punto_muestreo?: string;
  observaciones?: string;
  foto_muestra_url?: string;
  registrado_por: string;
  fecha_hora: string;
  programacion_zona?: string;
}

interface StatsCalidad {
  total_controles: string;
  conformes: string;
  no_conformes: string;
  promedio_cloro_ppm: string;
  promedio_turbiedad_ntu: string;
  ultima_medicion: string;
}

export default function CalidadPage() {
  const [controles, setControles] = useState<ControlCalidad[]>([]);
  const [stats, setStats] = useState<StatsCalidad | null>(null);
  const [cisternas, setCisternas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form State
  const [formData, setFormData] = useState({
    cisterna_id: '',
    conductor_nombre: '',
    cloro_residual_ppm: '1.20',
    turbiedad_ntu: '1.50',
    aspecto_organoleptico: 'Límpido / Incoloro',
    etapa_control: 'CARGA', // 'CARGA', 'RUTA', 'ADICIONAL'
    punto_muestreo: 'Surtidor / Planta de Carga EPS Moyobamba',
    observaciones: '',
    registrado_por: 'Ing. Supervisor de Calidad'
  });

  const [filtroCisterna, setFiltroCisterna] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [calidadRes, statsRes, cisternasRes] = await Promise.all([
        api.get('/calidad/calidad' + (filtroCisterna ? `?cisterna_id=${filtroCisterna}` : '')),
        api.get('/calidad/calidad/stats'),
        api.get('/cisternas')
      ]);

      setControles(calidadRes.data);
      setStats(statsRes.data);
      setCisternas(cisternasRes.data);
    } catch (error) {
      console.error('Error cargando controles de calidad:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filtroCisterna]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await api.post('/calidad/calidad', formData);

      await dialogAlert({
        title: 'Control de Calidad',
        message: res.data.message || '✅ Control registrado exitosamente',
        type: 'success',
      });
      setModalOpen(false);
      setFormData({
        cisterna_id: '',
        conductor_nombre: '',
        cloro_residual_ppm: '1.20',
        turbiedad_ntu: '1.50',
        aspecto_organoleptico: 'Límpido / Incoloro',
        etapa_control: 'CARGA',
        punto_muestreo: 'Surtidor / Planta de Carga EPS Moyobamba',
        observaciones: '',
        registrado_por: 'Ing. Supervisor de Calidad'
      });
      fetchData();
    } catch (err: any) {
      await dialogAlert({
        title: 'Error en control de calidad',
        message: err.message || 'Error registrando control',
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getCloroBadge = (cloro: number) => {
    const val = Number(cloro);
    const isOptimo = val >= 0.5 && val <= 2.0;
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: isOptimo ? '#0f172a' : '#b91c1c' }}>
          {val.toFixed(2)} ppm
        </strong>
        <span
          className={`status-badge-compact ${isOptimo ? 'status-cumplido' : 'status-pendiente'}`}
          style={{ padding: '2px 8px', fontSize: 11 }}
        >
          <span className={`status-dot-indicator ${isOptimo ? 'dot-green' : 'dot-red'}`} style={{ width: 6, height: 6 }} />
          <span>{isOptimo ? 'Óptimo' : 'Alerta'}</span>
        </span>
      </div>
    );
  };

  const getTurbiedadBadge = (turb: number) => {
    const val = Number(turb);
    const isApto = val <= 5.0;
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: isApto ? '#0f172a' : '#b91c1c' }}>
          {val.toFixed(2)} NTU
        </strong>
        <span
          className={`status-badge-compact ${isApto ? 'status-cumplido' : 'status-pendiente'}`}
          style={{ padding: '2px 8px', fontSize: 11 }}
        >
          <span className={`status-dot-indicator ${isApto ? 'dot-green' : 'dot-red'}`} style={{ width: 6, height: 6 }} />
          <span>{isApto ? 'Apto' : 'No Apto'}</span>
        </span>
      </div>
    );
  };

  const getEtapaBadge = (etapa?: string) => {
    switch (etapa) {
      case 'CARGA':
        return (
          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            💧 1. Al Cargar (Surtidor)
          </span>
        );
      case 'RUTA':
        return (
          <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            🚚 2. En Ruta (Entrega)
          </span>
        );
      case 'ADICIONAL':
        return (
          <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            ➕ Control Adicional
          </span>
        );
      default:
        return (
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
            Punto General
          </span>
        );
    }
  };

  const paginatedControles = controles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalControlesNum = Number(stats?.total_controles) || 0;
  const conformesNum = Number(stats?.conformes) || 0;
  const pctConformidad = totalControlesNum > 0 
    ? Math.round((conformesNum / totalControlesNum) * 100) 
    : 100;
  const cloroPromedio = parseFloat(stats?.promedio_cloro_ppm || '0.00');
  const turbiedadPromedio = parseFloat(stats?.promedio_turbiedad_ntu || '0.00');
  const isCloroOptimo = cloroPromedio >= 0.5 && cloroPromedio <= 2.0;
  const isTurbiedadOptima = turbiedadPromedio < 5.0;

  return (
    <Layout>
      <div className="module-container">
        {/* Header con Badge Normativo y Acción */}
        <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              <span>🛡️ D.S. 031-2010-SA</span>
              <span>•</span>
              <span>FISCALIZACIÓN SANITARIA EPS MOYOBAMBA</span>
            </div>
            <h1 className="module-title" style={{ margin: 0 }}>🧪 Control de Calidad del Agua (Cloro y Turbiedad)</h1>
            <p className="module-subtitle" style={{ margin: '4px 0 0' }}>
              Monitoreo organoléptico y fisicoquímico fehaciente en surtidor, ruta y punto de entrega
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn-primary"
              onClick={() => setModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}
            >
              <span style={{ fontSize: 16 }}>➕</span>
              <span>Registrar Ensayo Sanitario</span>
            </button>
          </div>
        </div>

        {/* Modern High-End Stats Cards */}
        <div className="stats-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          {/* CARD 1: TOTAL REGISTROS */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Total Ensayos
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  📋
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {totalControlesNum}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>muestras evaluadas</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pctConformidad}%`, height: '100%', background: '#10b981', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>✓</span>
                <span>{conformesNum} Aptos para consumo</span>
              </div>
            </div>
          </div>

          {/* CARD 2: PROMEDIO CLORO RESIDUAL */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #0284c7, #38bdf8)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Cloro Residual Libre
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0f9ff', border: '1px solid #e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  💧
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#0284c7', lineHeight: 1 }}>
                  {stats?.promedio_cloro_ppm || '0.00'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0369a1' }}>ppm</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${Math.min(100, (cloroPromedio / 2.0) * 100)}%`, height: '100%', background: isCloroOptimo ? '#0284c7' : '#ef4444', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isCloroOptimo ? '#f0f9ff' : '#fef2f2', color: isCloroOptimo ? '#0369a1' : '#991b1b', border: `1px solid ${isCloroOptimo ? '#bae6fd' : '#fecaca'}`, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>{isCloroOptimo ? '✓' : '⚠️'}</span>
                <span>Rango óptimo: 0.5 - 2.0 ppm</span>
              </div>
            </div>
          </div>

          {/* CARD 3: PROMEDIO TURBIEDAD */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Turbiedad Promedio
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  🔬
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#4f46e5', lineHeight: 1 }}>
                  {stats?.promedio_turbiedad_ntu || '0.00'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#4338ca' }}>NTU</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${Math.min(100, (turbiedadPromedio / 5.0) * 100)}%`, height: '100%', background: isTurbiedadOptima ? '#6366f1' : '#ef4444', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>{isTurbiedadOptima ? '✓' : '⚠️'}</span>
                <span>Límite reglamentario: &lt; 5.0 NTU</span>
              </div>
            </div>
          </div>

          {/* CARD 4: CONFORMIDAD SANITARIA */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Conformidad Sanitaria
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', border: '1px solid #d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  🛡️
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#059669', lineHeight: 1 }}>
                  {pctConformidad}%
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Apto PNSU</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pctConformidad}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>🏅</span>
                <span>Acreditado ante PNSU y MINSA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar Modernizado */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          background: '#ffffff',
          padding: '12px 18px',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔍</span> Filtrar por Unidad:
            </span>
            <select 
              value={filtroCisterna} 
              onChange={(e) => {
                setFiltroCisterna(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                background: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas las Cisternas del Parque</option>
              {cisternas.map((c) => (
                <option key={c.id} value={c.id}>🚛 Cisterna {c.placa} ({c.capacidad_m3} m³)</option>
              ))}
            </select>

            {filtroCisterna && (
              <button
                type="button"
                onClick={() => { setFiltroCisterna(''); setCurrentPage(1); }}
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✕ Limpiar Filtro
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Mostrando <strong>{controles.length}</strong> ensayos
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setCurrentPage(1); fetchData(); }}
              style={{ padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              🔄 Actualizar Datos
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          {loading ? (
            <div className="empty-state">
              <span>⏳</span> Cargando registros de control de calidad...
            </div>
          ) : controles.length === 0 ? (
            <div className="empty-state">
              <span>🧪</span> No se encontraron registros de calidad.
            </div>
          ) : (
            <>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>FECHA Y HORA</th>
                    <th>ETAPA (TDR) / PUNTO</th>
                    <th style={{ whiteSpace: 'nowrap' }}>CISTERNA / CHOFER</th>
                    <th style={{ whiteSpace: 'nowrap', minWidth: 155 }}>CLORO RESIDUAL</th>
                    <th style={{ whiteSpace: 'nowrap', minWidth: 155 }}>TURBIEDAD</th>
                    <th>ASPECTO ORGANOLÉPTICO</th>
                    <th style={{ whiteSpace: 'nowrap' }}>ESTADO SANITARIO</th>
                    <th>SUPERVISOR</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedControles.map((c) => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                          {isNaN(new Date(c.fecha_hora).getTime())
                            ? c.fecha_hora
                            : new Date(c.fecha_hora).toLocaleDateString('es-PE')}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>🕒</span>
                          <span>
                            {isNaN(new Date(c.fecha_hora).getTime())
                              ? ''
                              : new Date(c.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td>
                        {getEtapaBadge(c.etapa_control)}
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, minWidth: 160 }}>
                          📍 {c.punto_muestreo || 'Punto de entrega'}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0284c7' }}>🚛 {c.cisterna_placa || 'Cisterna General'}</div>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{c.conductor_nombre || 'Conductor asignado'}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{getCloroBadge(c.cloro_residual_ppm)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{getTurbiedadBadge(c.turbiedad_ntu)}</td>
                      <td style={{ color: '#475569', minWidth: 120 }}>{c.aspecto_organoleptico}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.conforme_sanitario ? (
                          <span className="status-badge-compact status-cumplido">
                            <span className="status-dot-indicator dot-green" />
                            <span>Conforme</span>
                          </span>
                        ) : (
                          <span className="status-badge-compact status-pendiente">
                            <span className="status-dot-indicator dot-red" />
                            <span>Alerta</span>
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b', minWidth: 120 }}>
                        {c.registrado_por}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* PAGINATION */}
              <Pagination
                currentPage={currentPage}
                totalItems={controles.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[5, 10, 20, 50]}
              />
            </>
          )}
        </div>

        {/* Modal Nuevo Test */}
        {modalOpen && (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🧪 Nuevo Registro de Control de Calidad</h2>
                <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    ETAPA DEL CONTROL SANITARIO (TDR):
                  </label>
                  <select 
                    value={formData.etapa_control} 
                    onChange={(e) => {
                      const etapa = e.target.value;
                      setFormData({ 
                        ...formData, 
                        etapa_control: etapa,
                        punto_muestreo: etapa === 'CARGA' 
                          ? 'Surtidor / Planta de Carga EPS Moyobamba' 
                          : (etapa === 'RUTA' ? 'En Ruta - Grifo Cisterna en Sector' : 'Control Adicional / Muestreo Libre')
                      });
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1.5px solid #0284c7', fontWeight: 600 }}
                  >
                    <option value="CARGA">💧 1. Al Cargar Cisterna (Surtidor / Planta) [MÍNIMO OBLIGATORIO 1]</option>
                    <option value="RUTA">🚚 2. En el Transcurso de la Entrega (En Ruta) [MÍNIMO OBLIGATORIO 2]</option>
                    <option value="ADICIONAL">➕ 3. Control Adicional / Muestreo Libre [OPCIONAL TDR]</option>
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    LUGAR O PUNTO EXACTO DE MUESTREO:
                  </label>
                  <input 
                    type="text"
                    value={formData.punto_muestreo}
                    onChange={(e) => setFormData({ ...formData, punto_muestreo: e.target.value })}
                    placeholder="Ej: Surtidor Central o Grifo Cisterna en Sector Sol de Indañe"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>CISTERNA EVALUADA:</label>
                  <select 
                    value={formData.cisterna_id} 
                    onChange={(e) => setFormData({ ...formData, cisterna_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    <option value="">Seleccionar Cisterna</option>
                    {cisternas.map((c) => (
                      <option key={c.id} value={c.id}>{c.placa} ({c.capacidad_m3} m³)</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>CLORO RESIDUAL (ppm):</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="5"
                      value={formData.cloro_residual_ppm} 
                      onChange={(e) => setFormData({ ...formData, cloro_residual_ppm: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      required 
                    />
                    <span style={{ fontSize: 10, color: '#64748b' }}>Rango: 0.5 a 2.0 ppm</span>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>TURBIEDAD (NTU):</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="20"
                      value={formData.turbiedad_ntu} 
                      onChange={(e) => setFormData({ ...formData, turbiedad_ntu: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      required 
                    />
                    <span style={{ fontSize: 10, color: '#64748b' }}>Máximo: &lt; 5.0 NTU</span>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>ASPECTO ORGANOLÉPTICO:</label>
                  <select 
                    value={formData.aspecto_organoleptico} 
                    onChange={(e) => setFormData({ ...formData, aspecto_organoleptico: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    <option value="Límpido / Incoloro">Límpido / Incoloro (Óptimo)</option>
                    <option value="Aceptable">Aceptable</option>
                    <option value="Ligeramente turbio">Ligeramente turbio</option>
                    <option value="Con olor / sabor perceptible">Con olor / sabor perceptible</option>
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>SUPERVISOR / EVALUADOR:</label>
                  <input 
                    type="text" 
                    value={formData.registrado_por} 
                    onChange={(e) => setFormData({ ...formData, registrado_por: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    required 
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>OBSERVACIONES / LUGAR DE MUESTRA:</label>
                  <textarea 
                    value={formData.observaciones} 
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    placeholder="Ej. Muestra tomada en el grifo de salida de la cisterna en planta de captación..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', minHeight: 60 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Guardando...' : '✓ Guardar Test de Calidad'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
