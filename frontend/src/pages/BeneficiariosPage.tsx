import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../config/api';
import './Modules.css';

interface Beneficiario {
  id: number;
  dni: string;
  nombres?: string;
  apellidos?: string;
  nombres_apellidos: string;
  distrito: string;
  sector_aahh: string;
  sector: string;
  num_vivienda: string;
  num_miembros: number;
  mz: string;
  lt: string;
  calle_direccion: string;
  direccion: string;
  telefono: string;
  email?: string;
  litros_sugeridos?: number;
}

interface Sector {
  id: number;
  nombre: string;
  distrito: string;
  descripcion?: string;
  total_beneficiarios?: string | number;
}

export default function BeneficiariosPage() {
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBeneficiario, setEditingBeneficiario] = useState<Beneficiario | null>(null);
  
  // Sectors Management Modal State
  const [sectoresModalOpen, setSectoresModalOpen] = useState(false);
  const [newSectorForm, setNewSectorForm] = useState({ nombre: '', distrito: 'Moyobamba', descripcion: '' });
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [quickSectorOpen, setQuickSectorOpen] = useState(false);
  const [quickSectorName, setQuickSectorName] = useState('');

  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [qrModalBeneficiario, setQrModalBeneficiario] = useState<Beneficiario | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Form state with separate Nombres and Apellidos
  const [formData, setFormData] = useState({
    dni: '',
    nombres: '',
    apellidos: '',
    distrito: 'Moyobamba',
    sector_aahh: '',
    num_vivienda: '',
    num_miembros: 4,
    mz: '',
    lt: '',
    calle_direccion: '',
    telefono: '',
    email: '',
  });

  useEffect(() => {
    fetchBeneficiarios();
    fetchSectores();
  }, []);

  const fetchBeneficiarios = async () => {
    try {
      setLoading(true);
      const res = await api.get('/beneficiarios');
      setBeneficiarios(res.data);
    } catch (error) {
      console.error('Error fetching beneficiarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSectores = async () => {
    try {
      const res = await api.get('/sectores');
      setSectores(res.data);
      if (res.data.length > 0 && !formData.sector_aahh) {
        setFormData((prev) => ({ ...prev, sector_aahh: res.data[0].nombre }));
      }
    } catch (error) {
      console.error('Error fetching sectores:', error);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingBeneficiario(null);
    setFormData({
      dni: '',
      nombres: '',
      apellidos: '',
      distrito: 'Moyobamba',
      sector_aahh: sectores.length > 0 ? sectores[0].nombre : 'Sol de Indañe',
      num_vivienda: '',
      num_miembros: 4,
      mz: '',
      lt: '',
      calle_direccion: '',
      telefono: '',
      email: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (b: Beneficiario) => {
    setEditingBeneficiario(b);

    let nom = b.nombres || '';
    let ape = b.apellidos || '';
    if (!nom && !ape && b.nombres_apellidos) {
      const parts = b.nombres_apellidos.trim().split(/\s+/);
      if (parts.length > 2) {
        nom = parts.slice(0, 2).join(' ');
        ape = parts.slice(2).join(' ');
      } else if (parts.length === 2) {
        nom = parts[0];
        ape = parts[1];
      } else {
        nom = b.nombres_apellidos;
        ape = '';
      }
    }

    setFormData({
      dni: b.dni,
      nombres: nom,
      apellidos: ape,
      distrito: b.distrito || 'Moyobamba',
      sector_aahh: b.sector_aahh || b.sector || (sectores[0]?.nombre || ''),
      num_vivienda: b.num_vivienda || '',
      num_miembros: b.num_miembros || 1,
      mz: b.mz || '',
      lt: b.lt || '',
      calle_direccion: b.calle_direccion || b.direccion || '',
      telefono: b.telefono || '',
      email: b.email || '',
    });
    setModalOpen(true);
  };

  const handleSubmitBeneficiario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBeneficiario) {
        await api.put(`/beneficiarios/${editingBeneficiario.id}`, formData);
        alert('✅ Beneficiario actualizado exitosamente');
      } else {
        await api.post('/beneficiarios', formData);
        alert('✅ Beneficiario registrado exitosamente');
      }
      setModalOpen(false);
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      alert(`❌ Error al guardar: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleDeleteBeneficiario = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este beneficiario?')) return;
    try {
      await api.delete(`/beneficiarios/${id}`);
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      alert('Error al eliminar');
    }
  };

  const handleQuickAddSector = async () => {
    if (!quickSectorName.trim()) return;
    try {
      const res = await api.post('/sectores', {
        nombre: quickSectorName.trim(),
        distrito: 'Moyobamba',
      });
      await fetchSectores();
      setFormData({ ...formData, sector_aahh: res.data.nombre });
      setQuickSectorName('');
      setQuickSectorOpen(false);
      alert(`✅ Sector "${res.data.nombre}" agregado exitosamente`);
    } catch (error: any) {
      alert(`❌ Error al agregar sector: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSector) {
        await api.put(`/sectores/${editingSector.id}`, newSectorForm);
        alert('✅ Sector actualizado correctamente');
      } else {
        await api.post('/sectores', newSectorForm);
        alert('✅ Sector creado correctamente');
      }
      setNewSectorForm({ nombre: '', distrito: 'Moyobamba', descripcion: '' });
      setEditingSector(null);
      fetchSectores();
      fetchBeneficiarios();
    } catch (error: any) {
      alert(`❌ Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleDeleteSector = async (id: number, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el sector "${nombre}"?`)) return;
    try {
      await api.delete(`/sectores/${id}`);
      fetchSectores();
    } catch (error: any) {
      alert('Error al eliminar sector');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.append('file', file);

    try {
      setImporting(true);
      const res = await api.post('/beneficiarios/import-excel', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportSummary(res.data);
      alert(`✅ ${res.data.message}\nTotal Volumen Estimado: ${res.data.totalM3} m³ (${res.data.totalLitros} Litros)`);
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      alert(`❌ Error al importar: ${error.response?.data?.message || error.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = beneficiarios.filter(
    (b) =>
      b.nombres_apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.dni?.includes(searchTerm) ||
      (b.sector_aahh || b.sector)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Padrón de Beneficiarios - EPS Moyobamba</h1>
          <p>Gestión integral, sectores/AA.HH., carnets QR y dotación oficial (50 Lts/habitante)</p>
        </div>
        <div className="module-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
            style={{ display: 'none' }}
          />
          <button
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            📥 {importing ? 'Procesando...' : 'Importar Excel (ANEXO 1)'}
          </button>
          <button className="btn-secondary" onClick={() => setSectoresModalOpen(true)}>
            📍 Gestionar Sectores ({sectores.length})
          </button>
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            ➕ Nuevo Beneficiario
          </button>
        </div>
      </div>

      {importSummary && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 16, borderRadius: 12, marginBottom: 20 }}>
          <h3 style={{ color: '#065f46', fontSize: 15, marginBottom: 6 }}>📊 Resumen de Última Importación Masiva</h3>
          <p style={{ fontSize: 13, color: '#047857' }}>
            <strong>{importSummary.importedCount}</strong> beneficiarios importados. Volumen total asignado: <strong>{importSummary.totalM3} m³</strong> ({importSummary.totalLitros} Litros).
          </p>
        </div>
      )}

      <div className="filters-card">
        <input
          type="text"
          placeholder="🔍 Buscar por DNI, Nombres, Apellidos o Sector..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ width: 380 }}
        />
        <span className="badge-count">Total: {filtered.length} beneficiarios</span>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombres y Apellidos</th>
              <th>Sector / AA.HH</th>
              <th>N° Viv / Mz-Lt</th>
              <th>Dirección / Calle</th>
              <th>Miembros</th>
              <th>Dotación Sugerida</th>
              <th>Carnet QR</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>⏳</span> Cargando beneficiarios...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>👥</span> No se encontraron beneficiarios registrados.
                </td>
              </tr>
            ) : (
              paginatedData.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.dni}</strong></td>
                  <td>{b.nombres_apellidos}</td>
                  <td>
                    <span className="badge-count" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      {b.sector_aahh || b.sector || 'Moyobamba'}
                    </span>
                  </td>
                  <td>
                    {b.num_vivienda ? `Viv. ${b.num_vivienda} ` : ''}
                    {b.mz ? `(Mz ${b.mz} Lt ${b.lt})` : ''}
                  </td>
                  <td>{b.calle_direccion || b.direccion || '-'}</td>
                  <td><strong>{b.num_miembros} hab.</strong></td>
                  <td>
                    <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d' }}>
                      {b.litros_sugeridos || (b.num_miembros * 50)} Lts
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-secondary"
                      style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setQrModalBeneficiario(b)}
                    >
                      📷 Ver QR
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => handleOpenEditModal(b)}
                        title="Editar Beneficiario"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteBeneficiario(b.id)}
                        title="Eliminar Beneficiario"
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

      {/* MODAL CREAR / EDITAR BENEFICIARIO */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingBeneficiario ? 'Editar Beneficiario' : 'Registrar Nuevo Beneficiario'}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmitBeneficiario}>
              <div className="form-row">
                <div className="form-group">
                  <label>DNI *</label>
                  <input
                    required
                    maxLength={12}
                    placeholder="8 dígitos"
                    className="form-input"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>N° de Miembros (Habitantes) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="form-input"
                    value={formData.num_miembros}
                    onChange={(e) => setFormData({ ...formData, num_miembros: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              {/* SEPARATE NOMBRES AND APELLIDOS */}
              <div className="form-row">
                <div className="form-group">
                  <label>Nombres (Jefe de Familia) *</label>
                  <input
                    required
                    placeholder="Ej. Manuel Antonio"
                    className="form-input"
                    value={formData.nombres}
                    onChange={(e) => setFormData({ ...formData, nombres: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Apellidos (Jefe de Familia) *</label>
                  <input
                    required
                    placeholder="Ej. Ríos Gómez"
                    className="form-input"
                    value={formData.apellidos}
                    onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })}
                  />
                </div>
              </div>

              {/* SECTOR SELECT WITH QUICK ADD */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ margin: 0 }}>Sector / Asentamiento Humano *</label>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => setQuickSectorOpen(!quickSectorOpen)}
                  >
                    {quickSectorOpen ? '✕ Cancelar' : '➕ Nuevo Sector'}
                  </button>
                </div>

                {quickSectorOpen ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                      placeholder="Nombre del nuevo sector..."
                      className="form-input"
                      value={quickSectorName}
                      onChange={(e) => setQuickSectorName(e.target.value)}
                    />
                    <button type="button" className="btn-primary" style={{ padding: '6px 14px' }} onClick={handleQuickAddSector}>
                      Guardar
                    </button>
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={formData.sector_aahh}
                    onChange={(e) => setFormData({ ...formData, sector_aahh: e.target.value })}
                    required
                  >
                    {sectores.map((s) => (
                      <option key={s.id} value={s.nombre}>
                        {s.nombre} ({s.distrito})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>N° de Vivienda</label>
                  <input
                    className="form-input"
                    placeholder="Ej. 08"
                    value={formData.num_vivienda}
                    onChange={(e) => setFormData({ ...formData, num_vivienda: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Distrito</label>
                  <input
                    className="form-input"
                    value={formData.distrito}
                    onChange={(e) => setFormData({ ...formData, distrito: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Manzana (Mz)</label>
                  <input
                    className="form-input"
                    placeholder="Ej. E"
                    value={formData.mz}
                    onChange={(e) => setFormData({ ...formData, mz: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Lote (Lt)</label>
                  <input
                    className="form-input"
                    placeholder="Ej. 11"
                    value={formData.lt}
                    onChange={(e) => setFormData({ ...formData, lt: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Calle / Dirección Exacta</label>
                <input
                  className="form-input"
                  placeholder="Ej. Sector Cococho s/n"
                  value={formData.calle_direccion}
                  onChange={(e) => setFormData({ ...formData, calle_direccion: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Teléfono Celular (WhatsApp/SMS)</label>
                  <input
                    className="form-input"
                    placeholder="942987654"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="beneficiario@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingBeneficiario ? 'Guardar Cambios' : 'Registrar Beneficiario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GESTIONAR SECTORES */}
      {sectoresModalOpen && (
        <div className="modal-overlay" onClick={() => setSectoresModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>📍 Gestión de Sectores / Asentamientos Humanos</h2>
              <button className="close-btn" onClick={() => setSectoresModalOpen(false)}>✕</button>
            </div>

            {/* FORM CREAR / EDITAR SECTOR */}
            <form onSubmit={handleCreateSector} style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#0f172a' }}>
                {editingSector ? '✏️ Editar Sector' : '➕ Crear Nuevo Sector / AA.HH.'}
              </h4>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Nombre del Sector / AA.HH *</label>
                  <input
                    required
                    placeholder="Ej. Sol de Indañe, Cococho..."
                    className="form-input"
                    value={newSectorForm.nombre}
                    onChange={(e) => setNewSectorForm({ ...newSectorForm, nombre: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Distrito</label>
                  <input
                    className="form-input"
                    value={newSectorForm.distrito}
                    onChange={(e) => setNewSectorForm({ ...newSectorForm, distrito: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Descripción / Referencia</label>
                <input
                  placeholder="Referencia o notas del sector..."
                  className="form-input"
                  value={newSectorForm.descripcion}
                  onChange={(e) => setNewSectorForm({ ...newSectorForm, descripcion: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {editingSector && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditingSector(null);
                      setNewSectorForm({ nombre: '', distrito: 'Moyobamba', descripcion: '' });
                    }}
                  >
                    Cancelar Edición
                  </button>
                )}
                <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
                  {editingSector ? 'Actualizar Sector' : '➕ Guardar Sector'}
                </button>
              </div>
            </form>

            {/* SECTORES LIST */}
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table className="custom-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Sector / AA.HH</th>
                    <th>Distrito</th>
                    <th>Beneficiarios</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sectores.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.nombre}</strong></td>
                      <td>{s.distrito}</td>
                      <td>
                        <span className="badge-count" style={{ background: '#f0fdf4', color: '#166534' }}>
                          {s.total_beneficiarios || 0} personas
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            onClick={() => {
                              setEditingSector(s);
                              setNewSectorForm({
                                nombre: s.nombre,
                                distrito: s.distrito || 'Moyobamba',
                                descripcion: s.descripcion || '',
                              });
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-danger"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            onClick={() => handleDeleteSector(s.id, s.nombre)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setSectoresModalOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VER CARNET QR BENEFICIARIO */}
      {qrModalBeneficiario && (
        <div className="modal-overlay" onClick={() => setQrModalBeneficiario(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 420, textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Carnet Oficial de Beneficiario</h2>
              <button className="close-btn" onClick={() => setQrModalBeneficiario(null)}>✕</button>
            </div>

            <div style={{
              background: '#ffffff',
              border: '2px solid #0284c7',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>💧</span>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 800 }}>EPS MOYOBAMBA S.A.</h3>
                <p style={{ margin: 0, color: '#0284c7', fontSize: 11, fontWeight: 700 }}>PROGRAMA AGUA MÓVIL</p>
              </div>

              <div style={{ margin: '14px 0' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrModalBeneficiario.dni}&margin=10`}
                  alt={`QR ${qrModalBeneficiario.dni}`}
                  style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              <h4 style={{ fontSize: 16, color: '#0f172a', fontWeight: 800, margin: '6px 0' }}>
                {qrModalBeneficiario.nombres_apellidos}
              </h4>
              <p style={{ fontSize: 13, color: '#334155', margin: '2px 0' }}>
                <strong>DNI:</strong> {qrModalBeneficiario.dni}
              </p>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0' }}>
                📍 {qrModalBeneficiario.sector_aahh || qrModalBeneficiario.sector} • {qrModalBeneficiario.calle_direccion || qrModalBeneficiario.direccion || ''}
              </p>
              <div style={{ marginTop: 10, background: '#f0fdf4', padding: 8, borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                  Dotación: {(qrModalBeneficiario.num_miembros || 1) * 50} Litros ({qrModalBeneficiario.num_miembros} habitantes)
                </span>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn-primary" onClick={() => window.print()}>
                🖨️ Imprimir Carnet
              </button>
              <button className="btn-secondary" onClick={() => setQrModalBeneficiario(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
