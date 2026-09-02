import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DaysOfWeekSelector from '../components/DaysOfWeekSelector';
import Pagination from '../components/Pagination';
import axios from 'axios';
import './Modules.css';

interface SectorMeta {
  id: number;
  nombre: string;
  distrito: string;
  descripcion?: string;
  dias_entrega: string;
  total_beneficiarios: number | string;
  total_habitantes: number | string;
  meta_semanal_litros: number;
  meta_semanal_m3: number;
  litros_entregados_semana: number;
  m3_entregados_semana: number;
  porcentaje_cumplimiento: number;
  estado_cumplimiento: 'CUMPLIDO' | 'EN_PROGRESO' | 'PENDIENTE';
}

export default function MetasPage() {
  const [sectores, setSectores] = useState<SectorMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [editingSector, setEditingSector] = useState<SectorMeta | null>(null);
  const [editFormData, setEditFormData] = useState({
    meta_semanal_litros: 0,
    dias_entrega: 'Lunes, Miércoles, Viernes',
    descripcion: '',
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchMetas();
  }, []);

  const fetchMetas = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:3000/api/v1/sectores');
      setSectores(res.data);
    } catch (error) {
      console.error('Error fetching metas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (s: SectorMeta) => {
    setEditingSector(s);
    setEditFormData({
      meta_semanal_litros: s.meta_semanal_litros,
      dias_entrega: s.dias_entrega || 'Lunes, Miércoles, Viernes',
      descripcion: s.descripcion || '',
    });
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSector) return;

    try {
      await axios.put(`http://localhost:3000/api/v1/sectores/${editingSector.id}`, {
        nombre: editingSector.nombre,
        distrito: editingSector.distrito,
        descripcion: editFormData.descripcion,
        meta_semanal_litros: editFormData.meta_semanal_litros,
        dias_entrega: editFormData.dias_entrega,
      });
      alert('✅ Meta y días de entrega actualizados correctamente');
      setEditingSector(null);
      fetchMetas();
    } catch (error: any) {
      alert(`❌ Error al actualizar: ${error.response?.data?.message || error.message}`);
    }
  };

  // Aggregated calculations
  const totalMetaLitros = sectores.reduce((acc, s) => acc + (s.meta_semanal_litros || 0), 0);
  const totalMetaM3 = parseFloat((totalMetaLitros / 1000).toFixed(2));

  const totalEntregadoLitros = sectores.reduce((acc, s) => acc + (s.litros_entregados_semana || 0), 0);
  const totalEntregadoM3 = parseFloat((totalEntregadoLitros / 1000).toFixed(2));

  const cumplimientoGlobal = totalMetaLitros > 0 ? Math.min(100, Math.round((totalEntregadoLitros / totalMetaLitros) * 100)) : 0;

  const totalCumplidos = sectores.filter((s) => s.estado_cumplimiento === 'CUMPLIDO').length;
  const totalEnProgreso = sectores.filter((s) => s.estado_cumplimiento === 'EN_PROGRESO').length;
  const totalPendientes = sectores.filter((s) => s.estado_cumplimiento === 'PENDIENTE').length;

  const filtered = sectores.filter((s) => {
    const matchesSearch = s.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.dias_entrega?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEstado = filterEstado ? s.estado_cumplimiento === filterEstado : true;
    return matchesSearch && matchesEstado;
  });

  const paginatedSectores = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'CUMPLIDO':
        return <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>🟢 CUMPLIDO (100%)</span>;
      case 'EN_PROGRESO':
        return <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>🟡 EN PROGRESO</span>;
      default:
        return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>🔴 PENDIENTE</span>;
    }
  };

  const getProgressBarColor = (pct: number) => {
    if (pct >= 100) return '#10b981'; // Green
    if (pct >= 40) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Metas Semanales y Control de Cumplimiento</h1>
          <p>Supervisión de dotación asignada por sector, frecuencia de reparto y avance en tiempo real</p>
        </div>
        <div className="module-actions">
          <button className="btn-secondary" onClick={fetchMetas}>
            🔄 Actualizar Datos
          </button>
        </div>
      </div>

      {/* STATS METRIC CARDS */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTopColor: '#0284c7' }}>
          <div className="stat-icon">🎯</div>
          <div>
            <span className="stat-value">{totalMetaM3} m³</span>
            <span className="stat-label">Meta Global Semanal ({totalMetaLitros.toLocaleString()} Lts)</span>
          </div>
        </div>

        <div className="stat-card" style={{ borderTopColor: '#10b981' }}>
          <div className="stat-icon">💧</div>
          <div>
            <span className="stat-value">{totalEntregadoM3} m³</span>
            <span className="stat-label">Entregado esta Semana ({totalEntregadoLitros.toLocaleString()} Lts)</span>
          </div>
        </div>

        <div className="stat-card" style={{ borderTopColor: '#f59e0b' }}>
          <div className="stat-icon">📊</div>
          <div>
            <span className="stat-value">{cumplimientoGlobal}%</span>
            <span className="stat-label">Avance Global de Cumplimiento</span>
          </div>
        </div>

        <div className="stat-card" style={{ borderTopColor: '#8b5cf6' }}>
          <div className="stat-icon">🏘️</div>
          <div>
            <span className="stat-value">{totalCumplidos} / {sectores.length}</span>
            <span className="stat-label">Sectores Abastecidos al 100%</span>
          </div>
        </div>
      </div>

      {/* GLOBAL PROGRESS BAR */}
      <div style={{ background: '#ffffff', padding: 20, borderRadius: 16, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            Progreso Semanal EPS Moyobamba ({totalEntregadoM3} m³ de {totalMetaM3} m³)
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: getProgressBarColor(cumplimientoGlobal) }}>
            {cumplimientoGlobal}% Cumplido
          </span>
        </div>
        <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${cumplimientoGlobal}%`,
              background: getProgressBarColor(cumplimientoGlobal),
              borderRadius: 6,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12.5, color: '#64748b' }}>
          <span>🟢 Cumplidos: <strong>{totalCumplidos}</strong></span>
          <span>🟡 En Progreso: <strong>{totalEnProgreso}</strong></span>
          <span>🔴 Pendientes: <strong>{totalPendientes}</strong></span>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="filters-card">
        <input
          type="text"
          placeholder="🔍 Buscar sector o días de reparto..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ width: 340 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="pagination-select"
            value={filterEstado}
            onChange={(e) => {
              setFilterEstado(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Todos los Estados</option>
            <option value="CUMPLIDO">🟢 Cumplidos</option>
            <option value="EN_PROGRESO">🟡 En Progreso</option>
            <option value="PENDIENTE">🔴 Pendientes</option>
          </select>
          <span className="badge-count">Total: {filtered.length} sectores</span>
        </div>
      </div>

      {/* SECTORS TABLE WITH REAL-TIME COMPLIANCE */}
      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Sector / AA.HH</th>
              <th>Padrón (Habitantes)</th>
              <th>Días de Reparto</th>
              <th>Meta Semanal</th>
              <th>Entregado (Semana)</th>
              <th>Avance (%)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>⏳</span> Cargando metas por sector...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>🎯</span> No se encontraron sectores registrados.
                </td>
              </tr>
            ) : (
              paginatedSectores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.nombre}</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.distrito}</div>
                  </td>
                  <td>
                    <strong>{s.total_habitantes} hab.</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>({s.total_beneficiarios} viviendas)</div>
                  </td>
                  <td>
                    <span className="badge-count" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 600 }}>
                      🗓️ {s.dias_entrega || 'Lunes, Miércoles, Viernes'}
                    </span>
                  </td>
                  <td>
                    <strong>{s.meta_semanal_m3} m³</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.meta_semanal_litros.toLocaleString()} Lts</div>
                  </td>
                  <td>
                    <span className="badge-count" style={{ background: s.litros_entregados_semana > 0 ? '#dcfce7' : '#f1f5f9', color: s.litros_entregados_semana > 0 ? '#15803d' : '#64748b', fontWeight: 700 }}>
                      {s.m3_entregados_semana} m³ ({s.litros_entregados_semana.toLocaleString()} Lts)
                    </span>
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${s.porcentaje_cumplimiento}%`,
                            background: getProgressBarColor(s.porcentaje_cumplimiento),
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: getProgressBarColor(s.porcentaje_cumplimiento), width: 35 }}>
                        {s.porcentaje_cumplimiento}%
                      </span>
                    </div>
                  </td>
                  <td>{getStatusBadge(s.estado_cumplimiento)}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleOpenEdit(s)}
                      title="Configurar Meta y Días"
                    >
                      ⚙️ Configurar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* PAGINATION */}
        <Pagination
          currentPage={currentPage}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>

      {/* MODAL CONFIGURAR META Y DÍAS */}
      {editingSector && (
        <div className="modal-overlay" onClick={() => setEditingSector(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Configurar Meta Semanal - {editingSector.nombre}</h2>
              <button className="close-btn" onClick={() => setEditingSector(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveMeta}>
              <div className="form-group">
                <label>Población Actual del Sector</label>
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }}>
                  <strong>{editingSector.total_habitantes} habitantes</strong> ({editingSector.total_beneficiarios} viviendas).<br />
                  <span style={{ color: '#0284c7', fontSize: 12 }}>
                    Dotación estándar SUNASS: {Number(editingSector.total_habitantes) * 50 * 7} Litros/semana ({((Number(editingSector.total_habitantes) * 50 * 7) / 1000).toFixed(2)} m³)
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label>Meta Semanal Asignada (Litros) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  className="form-input"
                  value={editFormData.meta_semanal_litros}
                  onChange={(e) => setEditFormData({ ...editFormData, meta_semanal_litros: parseInt(e.target.value) || 0 })}
                />
                <small style={{ color: '#64748b', fontSize: 11 }}>
                  Equivale a: <strong>{((editFormData.meta_semanal_litros || 0) / 1000).toFixed(2)} m³ de agua</strong>
                </small>
              </div>

              {/* INTERACTIVE DAYS OF THE WEEK SELECTOR */}
              <DaysOfWeekSelector
                label="Días de Reparto y Abastecimiento Semanal"
                value={editFormData.dias_entrega}
                onChange={(newDays) => setEditFormData({ ...editFormData, dias_entrega: newDays })}
              />

              <div className="form-group">
                <label>Descripción / Observaciones</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Notas operativas del sector..."
                  value={editFormData.descripcion}
                  onChange={(e) => setEditFormData({ ...editFormData, descripcion: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingSector(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Guardar Configuración
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
