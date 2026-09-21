import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DaysOfWeekSelector from '../components/DaysOfWeekSelector';
import Pagination from '../components/Pagination';
import api from '../config/api';
import { dialogAlert } from '../context/DialogContext';
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
      const res = await api.get('/sectores');
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
      await api.put(`/sectores/${editingSector.id}`, {
        nombre: editingSector.nombre,
        distrito: editingSector.distrito,
        descripcion: editFormData.descripcion,
        meta_semanal_litros: editFormData.meta_semanal_litros,
        dias_entrega: editFormData.dias_entrega,
      });
      await dialogAlert({
        title: 'Meta Actualizada',
        message: '✅ Meta y días de entrega actualizados correctamente',
        type: 'success',
      });
      setEditingSector(null);
      fetchMetas();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al actualizar',
        message: `❌ Error al actualizar: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
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
        return (
          <span className="status-badge-compact status-cumplido" title="Estado: Cumplido al 100%">
            <span className="status-dot-indicator dot-green" />
            <span>Cumpl.</span>
          </span>
        );
      case 'EN_PROGRESO':
        return (
          <span className="status-badge-compact status-progreso" title="Estado: En Progreso">
            <span className="status-dot-indicator dot-amber" />
            <span>Prog.</span>
          </span>
        );
      default:
        return (
          <span className="status-badge-compact status-pendiente" title="Estado: Pendiente">
            <span className="status-dot-indicator dot-red" />
            <span>Pend.</span>
          </span>
        );
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
      <div className="stats-grid">
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
      <div style={{ background: '#ffffff', padding: 22, borderRadius: 18, marginBottom: 24, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
            Progreso Semanal EPS Moyobamba ({totalEntregadoM3} m³ de {totalMetaM3} m³)
          </span>
          <span style={{ fontSize: 14, fontWeight: 900, color: getProgressBarColor(cumplimientoGlobal) }}>
            {cumplimientoGlobal}% Cumplido
          </span>
        </div>
        <div style={{ height: 12, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${cumplimientoGlobal}%`,
              background: getProgressBarColor(cumplimientoGlobal),
              borderRadius: 999,
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12.5, color: '#64748b', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#10b981', fontSize: 10 }}>●</span> Cumplidos: <strong style={{ color: '#0f172a' }}>{totalCumplidos}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#f59e0b', fontSize: 10 }}>●</span> En Progreso: <strong style={{ color: '#0f172a' }}>{totalEnProgreso}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#ef4444', fontSize: 10 }}>●</span> Pendientes: <strong style={{ color: '#0f172a' }}>{totalPendientes}</strong>
          </span>
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
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="pagination-select"
            value={filterEstado}
            onChange={(e) => {
              setFilterEstado(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Todos los Estados</option>
            <option value="CUMPLIDO">Cumplidos</option>
            <option value="EN_PROGRESO">En Progreso</option>
            <option value="PENDIENTE">Pendientes</option>
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
              <th style={{ textAlign: 'right' }}>Acciones</th>
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
                    <div style={{ minWidth: 140 }}>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>{s.nombre}</strong>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>📍 {s.distrito}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <strong style={{ fontSize: 13.5 }}>{s.total_habitantes} hab.</strong>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>({s.total_beneficiarios} viviendas)</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 210 }}>
                      {(s.dias_entrega || 'Lunes, Miércoles, Viernes')
                        .split(',')
                        .map((dia, dIdx) => (
                          <span
                            key={dIdx}
                            className="badge-count"
                            style={{
                              background: '#f8fafc',
                              color: '#334155',
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderColor: '#e2e8f0',
                            }}
                          >
                            {dia.trim()}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <strong style={{ fontSize: 14 }}>{s.meta_semanal_m3} m³</strong>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{s.meta_semanal_litros.toLocaleString()} Lts</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className="badge-count"
                        style={{
                          background: s.litros_entregados_semana > 0 ? '#dcfce7' : '#f8fafc',
                          color: s.litros_entregados_semana > 0 ? '#15803d' : '#64748b',
                          borderColor: s.litros_entregados_semana > 0 ? '#bbf7d0' : '#e2e8f0',
                          fontWeight: 700,
                        }}
                      >
                        {s.m3_entregados_semana} m³ ({s.litros_entregados_semana.toLocaleString()} L)
                      </span>
                    </div>
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, s.porcentaje_cumplimiento)}%`,
                            background: getProgressBarColor(s.porcentaje_cumplimiento),
                            borderRadius: 999,
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: getProgressBarColor(s.porcentaje_cumplimiento), width: 36, textAlign: 'right' }}>
                        {s.porcentaje_cumplimiento}%
                      </span>
                    </div>
                  </td>
                  <td>{getStatusBadge(s.estado_cumplimiento)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn-action-compact"
                      onClick={() => handleOpenEdit(s)}
                      title={`Configurar Meta y Días de ${s.nombre}`}
                    >
                      <span className="action-icon-wrap">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </span>
                      <span>Config.</span>
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
