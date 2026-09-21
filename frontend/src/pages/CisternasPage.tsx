import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import './Modules.css';

interface Cisterna {
  id: number;
  placa: string;
  marca_modelo: string;
  capacidad_m3: number | string;
  capacidad_litros: number | string;
  soat_vencimiento: string | null;
  revision_tecnica_vencimiento: string | null;
  conductor_habitual_id?: number | null;
  conductor_habitual_nombre?: string | null;
  conductor_habitual_telefono?: string | null;
  codigo_gps?: string | null;
  latitud_actual?: number | string | null;
  longitud_actual?: number | string | null;
  enlace_gps_tracking?: string | null;
  ultima_actualizacion_gps?: string | null;
  estado: 'OPERATIVO' | 'MANTENIMIENTO' | 'INACTIVO';
}

interface Conductor {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  licencia_conducir?: string;
  telefono?: string;
}

export default function CisternasPage() {
  const [cisternas, setCisternas] = useState<Cisterna[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [gettingGps, setGettingGps] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [formData, setFormData] = useState({
    placa: '',
    marca_modelo: '',
    capacidad_m3: '15',
    soat_vencimiento: '',
    revision_tecnica_vencimiento: '',
    conductor_habitual_id: '' as string | number,
    codigo_gps: '',
    latitud_actual: '',
    longitud_actual: '',
    enlace_gps_tracking: '',
    estado: 'OPERATIVO' as 'OPERATIVO' | 'MANTENIMIENTO' | 'INACTIVO',
  });

  useEffect(() => {
    fetchCisternas();
    fetchConductores();
  }, [filterEstado]);

  const fetchCisternas = async () => {
    try {
      setLoading(true);
      const url = filterEstado 
        ? `/cisternas?estado=${filterEstado}` 
        : '/cisternas';
      const res = await api.get(url);
      setCisternas(res.data);
    } catch (error) {
      console.error('Error fetching cisternas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConductores = async () => {
    try {
      const res = await api.get('/personal?tipo=CONDUCTOR');
      setConductores(res.data);
    } catch (error) {
      console.error('Error fetching conductores:', error);
    }
  };

  const handleCapturarGpsNavegador = () => {
    if (!navigator.geolocation) {
      dialogAlert({
        title: 'Geolocalización no disponible',
        message: 'La geolocalización no es compatible con este navegador o dispositivo.',
        type: 'warning',
      });
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          latitud_actual: pos.coords.latitude.toFixed(6),
          longitud_actual: pos.coords.longitude.toFixed(6),
        }));
        setGettingGps(false);
      },
      (err) => {
        setGettingGps(false);
        dialogAlert({
          title: 'Error de Ubicación',
          message: 'No se pudo obtener la ubicación GPS: ' + err.message,
          type: 'danger',
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleOpenModal = (cisterna?: Cisterna) => {
    if (cisterna) {
      setEditingId(cisterna.id);
      setFormData({
        placa: cisterna.placa,
        marca_modelo: cisterna.marca_modelo,
        capacidad_m3: String(cisterna.capacidad_m3),
        soat_vencimiento: cisterna.soat_vencimiento ? cisterna.soat_vencimiento.split('T')[0] : '',
        revision_tecnica_vencimiento: cisterna.revision_tecnica_vencimiento ? cisterna.revision_tecnica_vencimiento.split('T')[0] : '',
        conductor_habitual_id: cisterna.conductor_habitual_id || '',
        codigo_gps: cisterna.codigo_gps || '',
        latitud_actual: cisterna.latitud_actual ? String(cisterna.latitud_actual) : '',
        longitud_actual: cisterna.longitud_actual ? String(cisterna.longitud_actual) : '',
        enlace_gps_tracking: cisterna.enlace_gps_tracking || '',
        estado: cisterna.estado,
      });
    } else {
      setEditingId(null);
      setFormData({
        placa: '',
        marca_modelo: '',
        capacidad_m3: '15',
        soat_vencimiento: '',
        revision_tecnica_vencimiento: '',
        conductor_habitual_id: conductores.length > 0 ? conductores[0].id : '',
        codigo_gps: '',
        latitud_actual: '-6.03417',
        longitud_actual: '-76.97139',
        enlace_gps_tracking: '',
        estado: 'OPERATIVO',
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/cisternas/${editingId}`, formData);
        await dialogAlert({
          title: 'Cisterna actualizada',
          message: '✅ Cisterna actualizada exitosamente',
          type: 'success',
        });
      } else {
        await api.post('/cisternas', formData);
        await dialogAlert({
          title: 'Cisterna registrada',
          message: '✅ Cisterna registrada exitosamente',
          type: 'success',
        });
      }
      setModalOpen(false);
      fetchCisternas();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error en cisterna',
        message: `❌ Error: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar cisterna?',
      message: '¿Estás seguro de eliminar esta cisterna del parque automotor?',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/cisternas/${id}`);
      fetchCisternas();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar la cisterna. Verifique que no esté vinculada a programaciones.',
        type: 'danger',
      });
    }
  };

  const filtered = cisternas.filter(
    (c) =>
      c.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.marca_modelo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.conductor_habitual_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'OPERATIVO':
        return <span className="status-badge status-active">OPERATIVO</span>;
      case 'MANTENIMIENTO':
        return <span className="status-badge status-pending">MANTENIMIENTO</span>;
      default:
        return <span className="status-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>INACTIVO</span>;
    }
  };

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Flota de Camiones Cisterna</h1>
          <p>Control de vehículos, capacidades de carga en m³, choferes habituales y mantenimiento - EPS Moyobamba</p>
        </div>
        <div className="module-actions">
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            ➕ Nueva Cisterna
          </button>
        </div>
      </div>

      <div className="filters-card">
        <input
          type="text"
          placeholder="🔍 Buscar por placa, marca o chofer habitual..."
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
            <option value="OPERATIVO">OPERATIVO</option>
            <option value="MANTENIMIENTO">MANTENIMIENTO</option>
            <option value="INACTIVO">INACTIVO</option>
          </select>
          <span className="badge-count">Total: {filtered.length} cisternas</span>
        </div>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Placa</th>
              <th>Marca y Modelo</th>
              <th>Capacidad</th>
              <th>Chofer Asignado</th>
              <th>🛰️ GPS Satelital</th>
              <th>SOAT</th>
              <th>Rev. Técnica</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>⏳</span> Cargando flota de cisternas...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>🚛</span> No se encontraron cisternas registradas.
                </td>
              </tr>
            ) : (
              paginatedData.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ fontSize: 14, color: '#0369a1' }}>{c.placa}</strong>
                  </td>
                  <td>{c.marca_modelo}</td>
                  <td>
                    <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                      {c.capacidad_m3} m³ ({Number(c.capacidad_litros).toLocaleString()} Lts)
                    </span>
                  </td>
                  <td>
                    {c.conductor_habitual_nombre ? (
                      <div>
                        <strong>👤 {c.conductor_habitual_nombre}</strong>
                        {c.conductor_habitual_telefono && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>📞 {c.conductor_habitual_telefono}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin asignar</span>
                    )}
                  </td>
                  <td>
                    {c.latitud_actual && c.longitud_actual ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>
                          🛰️ {c.codigo_gps || 'GPS Conectado'}
                        </div>
                        <a
                          href={`https://www.google.com/maps?q=${c.latitud_actual},${c.longitud_actual}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#0284c7',
                            fontWeight: 600,
                            fontSize: 11.5,
                            textDecoration: 'none',
                            marginTop: 2,
                          }}
                        >
                          📍 {parseFloat(String(c.latitud_actual)).toFixed(4)}, {parseFloat(String(c.longitud_actual)).toFixed(4)}
                        </a>
                        {c.enlace_gps_tracking && (
                          <div>
                            <a
                              href={c.enlace_gps_tracking}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 10.5, color: '#059669', textDecoration: 'underline' }}
                            >
                              🔗 Plataforma Satelital
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>Sin GPS</span>
                    )}
                  </td>
                  <td>
                    {c.soat_vencimiento ? new Date(c.soat_vencimiento).toLocaleDateString('es-PE') : '-'}
                  </td>
                  <td>
                    {c.revision_tecnica_vencimiento ? new Date(c.revision_tecnica_vencimiento).toLocaleDateString('es-PE') : '-'}
                  </td>
                  <td>{getStatusBadge(c.estado)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => handleOpenModal(c)}
                        title="Editar Cisterna"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleDelete(c.id)}
                        title="Eliminar Cisterna"
                      >
                        🗑️
                      </button>
                    </div>
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

      {/* MODAL CREAR / EDITAR CISTERNA */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Cisterna' : 'Registrar Nueva Cisterna'}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Placa del Vehículo *</label>
                  <input
                    required
                    placeholder="Ej. EGA-902"
                    className="form-input"
                    value={formData.placa}
                    onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="form-group">
                  <label>Capacidad en m³ *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    placeholder="15"
                    className="form-input"
                    value={formData.capacidad_m3}
                    onChange={(e) => setFormData({ ...formData, capacidad_m3: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: 11 }}>
                    Equivale a: <strong>{(parseFloat(formData.capacidad_m3 || '0') * 1000).toLocaleString()} Litros</strong>
                  </small>
                </div>
              </div>

              <div className="form-group">
                <label>Marca y Modelo *</label>
                <input
                  required
                  placeholder="Ej. Mercedes Benz Actros 3340"
                  className="form-input"
                  value={formData.marca_modelo}
                  onChange={(e) => setFormData({ ...formData, marca_modelo: e.target.value })}
                />
              </div>

              {/* CONDUCTOR HABITUAL ASIGNADO */}
              <div className="form-group">
                <label>Chofer Habitual Asignado a esta Cisterna</label>
                <select
                  className="form-input"
                  value={formData.conductor_habitual_id}
                  onChange={(e) => setFormData({ ...formData, conductor_habitual_id: e.target.value })}
                >
                  <option value="">-- Sin chofer asignado --</option>
                  {conductores.map((cond) => (
                    <option key={cond.id} value={cond.id}>
                      {cond.nombres} {cond.apellidos} ({cond.licencia_conducir || 'Licencia'})
                    </option>
                  ))}
                </select>
                <small style={{ color: '#0369a1', fontSize: 11 }}>
                  💡 Este chofer se cargará automáticamente al programar esta cisterna.
                </small>
              </div>

              {/* SECCIÓN DEDICADA: GEOLOCALIZACIÓN Y DISPOSITIVO GPS */}
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', margin: '14px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: '#0369a1' }}>
                    🛰️ Geolocalización y Dispositivo GPS
                  </span>
                  <button
                    type="button"
                    onClick={handleCapturarGpsNavegador}
                    disabled={gettingGps}
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  >
                    {gettingGps ? 'Buscando satélites...' : '📍 Capturar GPS Actual'}
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12 }}>Código / ID de Dispositivo GPS</label>
                  <input
                    placeholder="Ej. GPS-EGA-401 o IMEI del módem"
                    className="form-input"
                    value={formData.codigo_gps}
                    onChange={(e) => setFormData({ ...formData, codigo_gps: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>Latitud (GPS)</label>
                    <input
                      placeholder="-6.03417"
                      className="form-input"
                      value={formData.latitud_actual}
                      onChange={(e) => setFormData({ ...formData, latitud_actual: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>Longitud (GPS)</label>
                    <input
                      placeholder="-76.97139"
                      className="form-input"
                      value={formData.longitud_actual}
                      onChange={(e) => setFormData({ ...formData, longitud_actual: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 12 }}>Enlace a Plataforma de Seguimiento Satelital (Opcional)</label>
                  <input
                    placeholder="https://tracking.proveedor.com/live/..."
                    className="form-input"
                    value={formData.enlace_gps_tracking}
                    onChange={(e) => setFormData({ ...formData, enlace_gps_tracking: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Vencimiento SOAT</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.soat_vencimiento}
                    onChange={(e) => setFormData({ ...formData, soat_vencimiento: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Vencimiento Revisión Técnica</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.revision_tecnica_vencimiento}
                    onChange={(e) => setFormData({ ...formData, revision_tecnica_vencimiento: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Estado Operativo</label>
                <select
                  className="form-input"
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value as any })}
                >
                  <option value="OPERATIVO">OPERATIVO</option>
                  <option value="MANTENIMIENTO">MANTENIMIENTO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Guardar Cambios' : 'Registrar Cisterna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
