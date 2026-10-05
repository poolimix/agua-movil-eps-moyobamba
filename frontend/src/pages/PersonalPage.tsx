import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import './Modules.css';

interface Personal {
  id: number;
  dni: string;
  nombres: string;
  apellidos: string;
  tipo_personal: 'CONDUCTOR' | 'GESTOR_ENTREGA' | 'AYUDANTE' | 'SUPERVISOR';
  licencia_conducir: string | null;
  categoria_licencia: string | null;
  telefono: string | null;
  email: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
}

export default function PersonalPage() {
  const [personalList, setPersonalList] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [formData, setFormData] = useState({
    dni: '',
    nombres: '',
    apellidos: '',
    tipo_personal: 'CONDUCTOR' as 'CONDUCTOR' | 'GESTOR_ENTREGA' | 'SUPERVISOR',
    licencia_conducir: '',
    categoria_licencia: 'A-IIIc',
    telefono: '',
    email: '',
    estado: 'ACTIVO' as 'ACTIVO' | 'INACTIVO',
  });

  useEffect(() => {
    fetchPersonal();
  }, [filterTipo, filterEstado]);

  const fetchPersonal = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterTipo) params.append('tipo', filterTipo);
      if (filterEstado) params.append('estado', filterEstado);

      const res = await api.get(`/personal?${params.toString()}`);
      setPersonalList(res.data);
    } catch (error) {
      console.error('Error fetching personal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (p?: Personal) => {
    if (p) {
      setEditingId(p.id);
      setFormData({
        dni: p.dni,
        nombres: p.nombres,
        apellidos: p.apellidos,
        tipo_personal: (p.tipo_personal === 'AYUDANTE' ? 'GESTOR_ENTREGA' : p.tipo_personal) as 'CONDUCTOR' | 'GESTOR_ENTREGA' | 'SUPERVISOR',
        licencia_conducir: p.licencia_conducir || '',
        categoria_licencia: p.categoria_licencia || 'A-IIIc',
        telefono: p.telefono || '',
        email: p.email || '',
        estado: p.estado,
      });
    } else {
      setEditingId(null);
      setFormData({
        dni: '',
        nombres: '',
        apellidos: '',
        tipo_personal: 'CONDUCTOR',
        licencia_conducir: '',
        categoria_licencia: 'A-IIIc',
        telefono: '',
        email: '',
        estado: 'ACTIVO',
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.dni.trim().length !== 8) {
      await dialogAlert({
        title: 'DNI Inválido',
        message: 'El DNI debe tener exactamente 8 dígitos numéricos.',
        type: 'warning',
      });
      return;
    }

    try {
      if (editingId) {
        await api.put(`/personal/${editingId}`, formData);
        await dialogAlert({
          title: 'Personal actualizado',
          message: '✅ Personal actualizado exitosamente',
          type: 'success',
        });
      } else {
        await api.post('/personal', formData);
        await dialogAlert({
          title: 'Personal registrado',
          message: '✅ Personal registrado exitosamente',
          type: 'success',
        });
      }
      setModalOpen(false);
      fetchPersonal();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error en personal',
        message: `❌ Error: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar personal?',
      message: '¿Está seguro de eliminar este registro de personal del padrón?',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/personal/${id}`);
      fetchPersonal();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar el registro de personal.',
        type: 'danger',
      });
    }
  };

  const filtered = personalList.filter(
    (p) =>
      `${p.nombres} ${p.apellidos}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.dni?.includes(searchTerm) ||
      p.licencia_conducir?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'CONDUCTOR':
        return <span className="status-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>🚛 CONDUCTOR</span>;
      case 'SUPERVISOR':
        return <span className="status-badge" style={{ background: '#f3e8ff', color: '#7e22ce' }}>📋 SUPERVISOR</span>;
      case 'GESTOR_ENTREGA':
      case 'AYUDANTE':
        return <span className="status-badge" style={{ background: '#dcfce7', color: '#15803d' }}>🤝 GESTOR DE ENTREGA</span>;
      default:
        return <span className="status-badge">{tipo}</span>;
    }
  };

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Conductores y Personal Operativo</h1>
          <p>Administración de cuadrillas, licencias de conducir y vinculación de cuentas - EPS Moyobamba</p>
        </div>
        <div className="module-actions">
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            ➕ Nuevo Personal
          </button>
        </div>
      </div>

      <div className="filters-card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por DNI, Nombre o Licencia..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="search-input"
          />
          <select
            className="form-input"
            style={{ width: 190, margin: 0 }}
            value={filterTipo}
            onChange={(e) => {
              setFilterTipo(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Todos los cargos</option>
            <option value="CONDUCTOR">Conductores</option>
            <option value="GESTOR_ENTREGA">Gestores de Entrega</option>
            <option value="SUPERVISOR">Supervisores</option>
          </select>
          <select
            className="form-input"
            style={{ width: 150, margin: 0 }}
            value={filterEstado}
            onChange={(e) => {
              setFilterEstado(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
        </div>
        <span className="badge-count">Total: {filtered.length} registrados</span>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombres y Apellidos</th>
              <th>Cargo / Rol</th>
              <th>Licencia / Cat.</th>
              <th>Teléfono</th>
              <th>Email (Google Login)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>⏳</span> Cargando personal operativo...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>👷</span> No se encontró personal registrado.
                </td>
              </tr>
            ) : (
              paginatedData.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.dni}</strong></td>
                  <td><strong>{p.nombres} {p.apellidos}</strong></td>
                  <td>{getTipoBadge(p.tipo_personal)}</td>
                  <td>
                    {p.licencia_conducir ? (
                      <span>{p.licencia_conducir} <small style={{ color: '#0284c7', fontWeight: 'bold' }}>({p.categoria_licencia || 'A-IIIb'})</small></span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </td>
                  <td>{p.telefono || '-'}</td>
                  <td>
                    {p.email ? (
                      <span style={{ fontSize: 12.5, color: '#334155' }}>{p.email}</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin vincular</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${p.estado === 'ACTIVO' ? 'status-active' : ''}`} style={p.estado !== 'ACTIVO' ? { background: '#fee2e2', color: '#dc2626' } : {}}>
                      {p.estado}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleOpenModal(p)}>
                        ✏️
                      </button>
                      <button className="btn-danger" onClick={() => handleDelete(p.id)}>
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

      {/* MODAL PERSONAL */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingId ? 'Editar Personal' : 'Registrar Nuevo Personal'}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>DNI (8 dígitos) *</label>
                  <input
                    required
                    maxLength={8}
                    className="form-input"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="form-group">
                  <label>Cargo / Función *</label>
                  <select
                    className="form-input"
                    value={formData.tipo_personal}
                    onChange={(e) => setFormData({ ...formData, tipo_personal: e.target.value as any })}
                  >
                    <option value="CONDUCTOR">🚛 CONDUCTOR DE CISTERNA</option>
                    <option value="GESTOR_ENTREGA">🤝 GESTOR DE ENTREGA</option>
                    <option value="SUPERVISOR">📋 SUPERVISOR DE REPARTO</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Nombres *</label>
                  <input
                    required
                    className="form-input"
                    value={formData.nombres}
                    onChange={(e) => setFormData({ ...formData, nombres: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Apellidos *</label>
                  <input
                    required
                    className="form-input"
                    value={formData.apellidos}
                    onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })}
                  />
                </div>
              </div>

              {formData.tipo_personal === 'CONDUCTOR' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>N° Licencia de Conducir *</label>
                    <input
                      required
                      placeholder="Ej. Q45892134"
                      className="form-input"
                      value={formData.licencia_conducir}
                      onChange={(e) => setFormData({ ...formData, licencia_conducir: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Categoría</label>
                    <select
                      className="form-input"
                      value={formData.categoria_licencia}
                      onChange={(e) => setFormData({ ...formData, categoria_licencia: e.target.value })}
                    >
                      <option value="A-IIIc">A-IIIc (Pesado Especial / Cisterna)</option>
                      <option value="A-IIIb">A-IIIb (Camiones Pesados)</option>
                      <option value="A-IIb">A-IIb</option>
                      <option value="A-I">A-I</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Teléfono / Celular</label>
                  <input
                    className="form-input"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Estado</label>
                  <select
                    className="form-input"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value as any })}
                  >
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Correo Electrónico (Para Google Sign-In en App Móvil)</label>
                <input
                  type="email"
                  placeholder="ejemplo@gmail.com"
                  className="form-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  * Al registrar el correo, se autoriza su acceso a la App Móvil con su cuenta de Google.
                </span>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Guardar Cambios' : 'Registrar Personal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
