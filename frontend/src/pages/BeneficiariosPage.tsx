import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importSectorMode, setImportSectorMode] = useState<'auto' | 'custom'>('auto');
  const [importCustomSector, setImportCustomSector] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [qrModalBeneficiario, setQrModalBeneficiario] = useState<Beneficiario | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parámetros de dotación configurables
  const [dotacionModalOpen, setDotacionModalOpen] = useState(false);
  const [dotacionDiariaActual, setDotacionDiariaActual] = useState(50);
  const [diasSemanaActual, setDiasSemanaActual] = useState(7);
  const [savingDotacion, setSavingDotacion] = useState(false);

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
    fetchConfigDotacion();
  }, []);

  const fetchConfigDotacion = async () => {
    try {
      const res = await api.get('/configuracion');
      if (res.data?.config) {
        setDotacionDiariaActual(Number(res.data.config.dotacion_diaria_litros) || 50);
        setDiasSemanaActual(Number(res.data.config.dias_entrega_semanal) || 7);
      }
    } catch (_) {}
  };

  const handleSaveDotacionConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingDotacion(true);
      await api.put('/configuracion', {
        dotacion_diaria_litros: dotacionDiariaActual,
        dias_entrega_semanal: diasSemanaActual,
        recalcular_vales: true
      });
      await dialogAlert({
        title: 'Dotación Actualizada',
        message: `✅ La dotación diaria se actualizó a ${dotacionDiariaActual} L/hab/día (${dotacionDiariaActual * diasSemanaActual} L/semana por vale).`,
        type: 'success'
      });
      setDotacionModalOpen(false);
      fetchBeneficiarios();
    } catch (err: any) {
      dialogAlert({
        title: 'Error',
        message: err.response?.data?.message || 'Error al actualizar dotación.',
        type: 'danger'
      });
    } finally {
      setSavingDotacion(false);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBeneficiario) {
        await api.put(`/beneficiarios/${editingBeneficiario.id}`, formData);
        await dialogAlert({
          title: 'Beneficiario actualizado',
          message: '✅ Beneficiario actualizado exitosamente',
          type: 'success',
        });
      } else {
        await api.post('/beneficiarios', formData);
        await dialogAlert({
          title: 'Beneficiario registrado',
          message: '✅ Beneficiario registrado exitosamente',
          type: 'success',
        });
      }
      setModalOpen(false);
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al guardar beneficiario',
        message: `❌ Error al guardar: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleSubmitBeneficiario = handleSubmit;

  const handleDeleteBeneficiario = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar beneficiario?',
      message: '¿Estás seguro de eliminar este beneficiario? Esta acción removerá sus registros asociados.',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/beneficiarios/${id}`);
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar el beneficiario. Verifique que no posea entregas históricas.',
        type: 'danger',
      });
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
      await dialogAlert({
        title: 'Sector Agregado',
        message: `✅ Sector "${res.data.nombre}" agregado exitosamente`,
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al agregar sector',
        message: `❌ Error al agregar sector: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSector) {
        await api.put(`/sectores/${editingSector.id}`, newSectorForm);
        await dialogAlert({
          title: 'Sector actualizado',
          message: '✅ Sector actualizado correctamente',
          type: 'success',
        });
      } else {
        await api.post('/sectores', newSectorForm);
        await dialogAlert({
          title: 'Sector creado',
          message: '✅ Sector creado correctamente',
          type: 'success',
        });
      }
      setNewSectorForm({ nombre: '', distrito: 'Moyobamba', descripcion: '' });
      setEditingSector(null);
      fetchSectores();
      fetchBeneficiarios();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error en sector',
        message: `❌ Error: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleDeleteSector = async (id: number, nombre: string) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar sector?',
      message: `¿Estás seguro de eliminar el sector "${nombre}"?`,
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/sectores/${id}`);
      fetchSectores();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar sector',
        message: 'No se pudo eliminar el sector porque contiene beneficiarios asignados.',
        type: 'danger',
      });
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
      setImportSummary(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExecuteImport = async () => {
    if (selectedFiles.length === 0) {
      await dialogAlert({
        title: 'Sin archivos seleccionados',
        message: 'Por favor selecciona al menos un archivo Excel del Padrón de Beneficiarios.',
        type: 'warning',
      });
      return;
    }

    const data = new FormData();
    selectedFiles.forEach((file) => {
      data.append('files', file);
    });

    if (importSectorMode === 'custom' && importCustomSector.trim()) {
      data.append('sector', importCustomSector.trim());
    }

    try {
      setImporting(true);
      const res = await api.post('/beneficiarios/import-excel', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportSummary(res.data);
      setSelectedFiles([]);
      await dialogAlert({
        title: 'Padrón Importado',
        message: `✅ ${res.data.message}\nTotal Volumen Asignado: ${res.data.totalM3} m³ (${res.data.totalLitros} Litros)`,
        type: 'success',
      });
      fetchBeneficiarios();
      fetchSectores();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al importar padrón',
        message: `❌ Error al importar: ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Calcular conteo de beneficiarios por sector
  const sectorCounts: { [sec: string]: number } = {};
  beneficiarios.forEach((b) => {
    const sec = (b.sector_aahh || b.sector || '').trim();
    if (sec) {
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    }
  });

  const uniqueSectores = Array.from(
    new Set([
      ...sectores.map((s) => s.nombre.trim()),
      ...Object.keys(sectorCounts),
    ])
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const filtered = beneficiarios.filter((b) => {
    const sec = (b.sector_aahh || b.sector || '').trim();
    const matchesSector = !selectedSector || sec.toLowerCase() === selectedSector.toLowerCase();

    const matchesSearch =
      !searchTerm ||
      b.nombres_apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.dni?.includes(searchTerm) ||
      sec.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.calle_direccion || b.direccion || '').toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSector && matchesSearch;
  });

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Totales para el sector seleccionado o activos
  const totalHabitantesFiltrados = filtered.reduce(
    (acc, b) => acc + (Number(b.num_miembros) || 1),
    0
  );
  const totalLitrosFiltrados = totalHabitantesFiltrados * 50;
  const totalM3Filtrados = (totalLitrosFiltrados / 1000).toFixed(2);

  const exportUrl = `${API_BASE_URL}/api/v1/beneficiarios/export-excel?${new URLSearchParams({
    ...(searchTerm ? { search: searchTerm } : {}),
    ...(selectedSector ? { sector: selectedSector } : {}),
  }).toString()}`;

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Padrón de Beneficiarios - EPS Moyobamba</h1>
          <p>Gestión integral, sectores/AA.HH., carnets QR y dotación oficial (50 Lts/habitante)</p>
        </div>
        <div className="module-actions">
          <button
            className="btn-primary"
            onClick={() => {
              setImportSummary(null);
              setImportModalOpen(true);
            }}
            style={{
              background: '#0284c7',
              borderColor: '#0369a1',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
            }}
          >
            📥 Importar Padrón Excel
          </button>
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#15803d',
              background: '#f0fdf4',
              borderColor: '#bbf7d0',
              fontWeight: 700,
            }}
            title={selectedSector ? `Descargar Padrón Oficial filtrado por sector "${selectedSector}"` : 'Descargar Padrón Oficial Catastral (ANEXO 1) en Excel'}
          >
            📊 Exportar Excel {selectedSector ? `(${filtered.length})` : ''}
          </a>
          <button className="btn-secondary" onClick={() => setSectoresModalOpen(true)}>
            📍 Gestionar Sectores ({sectores.length})
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => setDotacionModalOpen(true)}
            style={{ 
              background: '#f0f9ff', 
              borderColor: '#bae6fd', 
              color: '#0369a1', 
              fontWeight: 700, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6 
            }}
            title="Configurar Dotación Diaria por Persona y Días de Entrega"
          >
            ⚙️ Dotación: {dotacionDiariaActual} L/hab ({dotacionDiariaActual * diasSemanaActual} L/sem)
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

      {/* Barra de Filtros con Búsqueda y Selector de Sector */}
      <div
        className="filters-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          background: '#ffffff',
          padding: '12px 18px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 18,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Buscador de Texto */}
        <input
          type="text"
          placeholder="🔍 Buscar por DNI, Nombres, Apellidos o Calle..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ minWidth: 260, flex: '1 1 260px' }}
        />

        {/* Filtro Dropdown de Sector con Conteo Integrado */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
            📍 Sector:
          </span>
          <select
            value={selectedSector}
            onChange={(e) => {
              setSelectedSector(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 12.5,
              color: '#0f172a',
              fontWeight: 700,
              background: '#f8fafc',
              cursor: 'pointer',
              minWidth: 220,
              maxWidth: 320,
            }}
          >
            <option value="">-- Todos los Sectores ({beneficiarios.length}) --</option>
            {uniqueSectores.map((sec) => {
              const count = sectorCounts[sec] || 0;
              return (
                <option key={sec} value={sec}>
                  {sec} ({count} {count === 1 ? 'beneficiario' : 'beneficiarios'})
                </option>
              );
            })}
          </select>

          {selectedSector ? (
            <button
              type="button"
              onClick={() => {
                setSelectedSector('');
                setCurrentPage(1);
              }}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Quitar filtro de sector y mostrar todos"
            >
              ✕ Limpiar
            </button>
          ) : null}
        </div>

        {/* Badge Dinámico de Cantidad y Dotación Hídrica */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {selectedSector ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              <span style={{ color: '#1e40af', fontWeight: 800 }}>📍 {selectedSector}:</span>
              <strong style={{ fontSize: 13.5, color: '#1d4ed8' }}>
                {filtered.length} {filtered.length === 1 ? 'familia' : 'familias'}
              </strong>
              <span style={{ color: '#3b82f6', fontWeight: 700 }}>
                • {totalHabitantesFiltrados} hab. ({totalM3Filtrados} m³ / {totalLitrosFiltrados.toLocaleString('es-PE')} Lts)
              </span>
            </div>
          ) : (
            <span
              className="badge-count"
              style={{
                background: '#f1f5f9',
                color: '#334155',
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              Total: {filtered.length} beneficiarios
            </span>
          )}
        </div>
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
              <th>Personas (Titular+Fam)</th>
              <th>Dotación Semanal (Vale)</th>
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
                  <td style={{ whiteSpace: 'nowrap' }}><strong style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{b.dni}</strong></td>
                  <td><div style={{ minWidth: 170, fontWeight: 600, color: '#0f172a' }}>{b.nombres_apellidos}</div></td>
                  <td>
                    <span className="badge-count" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                      📍 {b.sector_aahh || b.sector || 'Moyobamba'}
                    </span>
                  </td>
                  <td>
                    <div style={{ minWidth: 120 }}>
                      {b.num_vivienda ? `Viv. ${b.num_vivienda} ` : ''}
                      {b.mz ? `(Mz ${b.mz} Lt ${b.lt})` : ''}
                    </div>
                  </td>
                  <td><div style={{ minWidth: 140, color: '#475569' }}>{b.calle_direccion || b.direccion || '-'}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ color: '#0f172a' }}>{b.num_miembros} pers.</strong>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>Titular + Fam.</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 700 }}>
                      💧 {b.litros_sugeridos || (b.num_miembros * 350)} Lts/sem
                    </span>
                    <div style={{ fontSize: 10.5, color: '#0369a1', marginTop: 2 }}>
                      {((b.num_miembros || 1) * 50)} L/día × 7d
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setQrModalBeneficiario(b)}
                    >
                      📷 Ver QR
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
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
                  <label>Total Personas en Vivienda (Titular + Familiares) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="form-input"
                    value={formData.num_miembros}
                    onChange={(e) => setFormData({ ...formData, num_miembros: parseInt(e.target.value) || 1 })}
                  />
                  <div style={{ marginTop: 4, fontSize: 11, color: '#0369a1', background: '#f0f9ff', padding: '4px 8px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                    💧 Dotación: <strong>{formData.num_miembros || 1} pers. × 50 L/día = {(formData.num_miembros || 1) * 50} L/día</strong> → Vale Semanal (7 días): <strong style={{ color: '#0284c7' }}>{((formData.num_miembros || 1) * 350).toLocaleString()} Lts/sem</strong>
                  </div>
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
              <div style={{ marginTop: 10, background: '#f0fdf4', padding: 10, borderRadius: 8, border: '1px solid #bbf7d0', textAlign: 'left' }}>
                <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                  💧 Dotación Diaria: {(qrModalBeneficiario.num_miembros || 1) * 50} Lts/día ({qrModalBeneficiario.num_miembros} personas × 50 L)
                </div>
                <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 800, marginTop: 4 }}>
                  📅 Vale Semanal (7 días): {((qrModalBeneficiario.num_miembros || 1) * 350).toLocaleString()} Litros
                </div>
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

      {/* MODAL DE IMPORTACIÓN MASIVA DE PADRÓN POR SECTORES / AA.HH. */}
      {importModalOpen && (
        <div className="modal-overlay" onClick={() => setImportModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>📥 Importar Padrón de Beneficiarios</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12.5 }}>
                  Sube los archivos Excel del Padrón Oficial por Sector o Asentamiento Humano (AA.HH.)
                </p>
              </div>
              <button className="close-btn" onClick={() => setImportModalOpen(false)}>✕</button>
            </div>

            {/* Banner de Guía de Estructura Reconocida */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>📋</span>
                <strong style={{ fontSize: 12, color: '#0f172a' }}>Formato Oficial de Ficha Reconocido:</strong>
              </div>
              <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                <div><strong>DISTRITO:</strong> Moyobamba &nbsp;&nbsp;|&nbsp;&nbsp; <strong>AA.HH:</strong> SOL DE INDAÑE</div>
                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 4 }}>
                  N° | <strong>SECTOR / AA.HH.</strong> | N° VIV. | MIEMBROS | Mz | Lt | DIRECCIÓN | NOMBRES Y APELLIDOS | DNI | TELÉFONO
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                  💡 Puedes pegar todos tus sectores juntos en una sola hoja usando la columna <strong>SECTOR / AA.HH.</strong>
                </p>
                <a
                  href="/Plantilla_Padron_Beneficiarios_EPS_Moyobamba.xlsx"
                  download="Plantilla_Padron_Beneficiarios_EPS_Moyobamba.xlsx"
                  style={{
                    padding: '5px 12px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    borderRadius: 6,
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    color: '#15803d',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                  }}
                  title="Descargar archivo Excel con formato de ejemplo listo para rellenar o pegar"
                >
                  <span>📥</span> Descargar Plantilla de Ejemplo (.xlsx)
                </a>
              </div>
            </div>

            {/* Zona de Arrastre / Selección de Archivos */}
            <div
              style={{
                border: '2px dashed #38bdf8',
                background: '#f0f9ff',
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 16,
                transition: 'border 0.2s',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFilesSelected}
                accept=".xlsx, .xls"
                multiple
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: 32 }}>📁</span>
              <h4 style={{ margin: '8px 0 4px', fontSize: 14, color: '#0369a1', fontWeight: 800 }}>
                Haz clic para seleccionar uno o varios archivos Excel (.xlsx, .xls)
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                Puedes seleccionar todos los archivos de tus sectores a la vez para cargarlos en bloque
              </p>
            </div>

            {/* Lista de Archivos Seleccionados */}
            {selectedFiles.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Archivos a procesar ({selectedFiles.length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Quitar todos
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <span style={{ color: '#10b981' }}>📊</span>
                        <strong style={{ color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {file.name}
                        </strong>
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
                        title="Quitar archivo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selector de Modo de Asignación de Sector */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>
                Asignación de Sector / AA.HH.:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sectorMode"
                    value="auto"
                    checked={importSectorMode === 'auto'}
                    onChange={() => setImportSectorMode('auto')}
                  />
                  <span>
                    <strong>Detección automática de cada archivo</strong> (Recomendado: lee el campo <code>AA.HH:</code> de cada hoja)
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sectorMode"
                    value="custom"
                    checked={importSectorMode === 'custom'}
                    onChange={() => setImportSectorMode('custom')}
                  />
                  <span>Asignar todos los registros de esta carga a un sector específico:</span>
                </label>
                {importSectorMode === 'custom' && (
                  <div style={{ marginLeft: 22, marginTop: 4 }}>
                    <select
                      value={importCustomSector}
                      onChange={(e) => setImportCustomSector(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, width: '100%', maxWidth: 320 }}
                    >
                      <option value="">-- Seleccionar Sector Existente --</option>
                      {sectores.map((s) => (
                        <option key={s.id} value={s.nombre}>
                          {s.nombre} ({s.distrito})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Resultado de Importación Reciente */}
            {importSummary && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 14, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065f46', marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <strong style={{ fontSize: 13 }}>{importSummary.message}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Total Familias</div>
                    <strong style={{ fontSize: 16, color: '#059669' }}>{importSummary.importedCount}</strong>
                  </div>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Volumen Diario</div>
                    <strong style={{ fontSize: 16, color: '#0284c7' }}>{importSummary.totalM3} m³</strong>
                  </div>
                </div>

                {importSummary.sectores && Object.keys(importSummary.sectores).length > 0 && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', display: 'block', marginBottom: 4 }}>
                      Desglose por Sector / AA.HH. registrado:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(importSummary.sectores).map(([secName, secData]: [string, any]) => (
                        <div key={secName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, background: '#ffffff', padding: '4px 8px', borderRadius: 4, border: '1px solid #d1fae5' }}>
                          <strong>📍 {secName}</strong>
                          <span>{secData.beneficiarios} familias • {secData.miembros} hab. ({secData.m3} m³)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setImportModalOpen(false)}
              >
                {importSummary ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExecuteImport}
                disabled={importing || selectedFiles.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {importing ? (
                  <><span>⏳</span> Procesando Padrón...</>
                ) : (
                  <><span>🚀</span> Iniciar Importación ({selectedFiles.length} archivos)</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN RÁPIDA DE PARÁMETROS DE DOTACIÓN */}
      {dotacionModalOpen && (
        <div className="modal-overlay" onClick={() => setDotacionModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>💧</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a', fontWeight: 800 }}>
                    Parámetros de Dotación Familiar
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                    Configuración de volumen por persona y ciclo de entrega para el padrón
                  </p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setDotacionModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveDotacionConfig} style={{ marginTop: 12 }}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                  Dotación Diaria por Persona (L/hab/día):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    required
                    className="form-input"
                    style={{ fontSize: 16, fontWeight: 700, width: 130 }}
                    value={dotacionDiariaActual}
                    onChange={(e) => setDotacionDiariaActual(parseFloat(e.target.value) || 0)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Litros / persona / día</span>
                </div>
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 3, display: 'block' }}>
                  Norma SUNASS: 50 L. Puedes cambiarlo a cualquier otro monto (ej. 40, 60, 80).
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                  Días de Abastecimiento por Ciclo de Vale:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    required
                    className="form-input"
                    style={{ fontSize: 16, fontWeight: 700, width: 130 }}
                    value={diasSemanaActual}
                    onChange={(e) => setDiasSemanaActual(parseInt(e.target.value, 10) || 1)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Días por vale</span>
                </div>
              </div>

              <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, border: '1px solid #bae6fd', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0369a1', marginBottom: 4 }}>
                  📊 Fórmula de Cálculo Resultante:
                </div>
                <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.5 }}>
                  • Dotación semanal por persona: <strong>{dotacionDiariaActual * diasSemanaActual} Litros</strong><br />
                  • Para 5 integrantes (1 titular + 4 fam): 5 × {dotacionDiariaActual} × {diasSemanaActual} = <strong style={{ color: '#0284c7' }}>{(dotacionDiariaActual * diasSemanaActual * 5).toLocaleString()} Litros semanales</strong>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDotacionModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingDotacion}
                >
                  {savingDotacion ? 'Guardando...' : '💾 Guardar y Actualizar Padrón'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
