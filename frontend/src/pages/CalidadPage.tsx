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

  return (
    <Layout>
      <div className="module-container">
        {/* Header */}
        <div className="module-header">
          <div>
            <h1 className="module-title">🧪 Control de Calidad del Agua (Cloro Residual y Turbiedad)</h1>
            <p className="module-subtitle">Monitoreo organoléptico y fisicoquímico</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TOTAL REGISTROS</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{stats?.total_controles || 0}</div>
            <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>✓ {stats?.conformes || 0} Aptos para consumo</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>PROMEDIO CLORO RESIDUAL</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{stats?.promedio_cloro_ppm || '0.00'} ppm</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Rango óptimo: 0.5 - 2.0 ppm</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>PROMEDIO TURBIEDAD</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>{stats?.promedio_turbiedad_ntu || '0.00'} NTU</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Límite máximo: &lt; 5.0 NTU</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>CONFORMIDAD SANITARIA</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {stats?.total_controles && Number(stats.total_controles) > 0 
                ? `${Math.round((Number(stats.conformes) / Number(stats.total_controles)) * 100)}%` 
                : '100%'}
            </div>
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>Acreditado ante PNSU</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <select 
            value={filtroCisterna} 
            onChange={(e) => {
              setFiltroCisterna(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="">Todas las Cisternas</option>
            {cisternas.map((c) => (
              <option key={c.id} value={c.id}>Cisterna: {c.placa} ({c.capacidad_m3} m³)</option>
            ))}
          </select>
          <button className="btn-secondary" onClick={() => { setCurrentPage(1); fetchData(); }} style={{ padding: '8px 14px', fontSize: 13 }}>
            🔄 Actualizar
          </button>
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
