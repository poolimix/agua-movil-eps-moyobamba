import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import DaysOfWeekSelector from '../components/DaysOfWeekSelector';
import MultiSectorSelector, { type SectorItem } from '../components/MultiSectorSelector';
import axios from 'axios';
import './Modules.css';

interface Programacion {
  id: number;
  fecha: string;
  zona: string;
  sectores_seleccionados?: string;
  estado: string;
  cisterna_id?: number;
  cisterna_placa?: string;
  cisterna_marca?: string;
  cisterna_capacidad_m3?: number | string;
  cisterna_capacidad_litros?: number | string;
  conductor_id?: number;
  conductor_nombre?: string;
  conductor_telefono?: string;
  conductor_licencia?: string;
  ayudante_id?: number | string;
  ayudante_nombre?: string;
  ayudante_telefono?: string;
  ayudante_dni?: string;
  litros_programados?: number;
  viajes_estimados?: number;
  dias_semana?: string;
  total_entregas: string | number;
  total_litros: string | number;
  total_calidad?: string | number;
  calidad_carga?: string | number;
  calidad_ruta?: string | number;
  calidad_adicional?: string | number;
}

interface Cisterna {
  id: number;
  placa: string;
  marca_modelo: string;
  capacidad_m3: number | string;
  capacidad_litros: number | string;
  conductor_habitual_id?: number | null;
  conductor_habitual_nombre?: string | null;
  estado: string;
}

interface Conductor {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  licencia_conducir?: string;
  telefono?: string;
  tipo_personal: string;
}

interface Vale {
  id: number;
  programacion_id: number;
  beneficiario_id: number;
  codigo_unico: string;
  litros_sugeridos: number | string;
  qr_data: string;
  whatsapp_enviado: boolean;
  sms_enviado: boolean;
  correo_enviado: boolean;
  fecha_despacho: string | null;
  errores_notificacion: any;
  estado: string;
  dni: string;
  nombres_apellidos: string;
  sector_aahh: string;
  direccion: string;
  telefono: string | null;
  email: string | null;
}

export default function ProgramacionesPage() {
  const [programaciones, setProgramaciones] = useState<Programacion[]>([]);
  const [sectores, setSectores] = useState<SectorItem[]>([]);
  const [cisternas, setCisternas] = useState<Cisterna[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProg, setEditingProg] = useState<Programacion | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Form state
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    selectedSectores: [] as string[],
    estado: 'Activa',
    cisterna_id: '' as string | number,
    conductor_id: '' as string | number,
    ayudante_id: '' as string | number,
    litros_programados: 15000,
    viajes_estimados: 1,
    dias_semana: 'Lunes, Miércoles, Viernes',
  });

  const [ayudantes, setAyudantes] = useState<any[]>([]);

  // Vales & Dispatch State
  const [selectedProgForVales, setSelectedProgForVales] = useState<Programacion | null>(null);
  const [valesList, setValesList] = useState<Vale[]>([]);
  const [valesLoading, setValesLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [valesSearchTerm, setValesSearchTerm] = useState('');
  const [selectedValeQr, setSelectedValeQr] = useState<Vale | null>(null);

  useEffect(() => {
    fetchProgramaciones();
    fetchSectores();
    fetchCisternas();
    fetchConductores();
    fetchAyudantes();
  }, []);

  const fetchProgramaciones = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:3000/api/v1/programaciones');
      setProgramaciones(res.data);
    } catch (error) {
      console.error('Error fetching programaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSectores = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/v1/sectores');
      setSectores(res.data);
    } catch (error) {
      console.error('Error fetching sectores:', error);
    }
  };

  const fetchCisternas = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/v1/cisternas?estado=OPERATIVO');
      setCisternas(res.data);
    } catch (error) {
      console.error('Error fetching cisternas:', error);
    }
  };

  const fetchConductores = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/v1/personal?tipo=CONDUCTOR');
      setConductores(res.data);
    } catch (error) {
      console.error('Error fetching conductores:', error);
    }
  };

  const fetchAyudantes = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/v1/personal?tipo=AYUDANTE');
      setAyudantes(res.data);
    } catch (error) {
      console.error('Error fetching ayudantes:', error);
    }
  };

  // Recalculate trips based on combined liters and cisterna capacity
  const calculateTrips = (litros: number, cId: string | number) => {
    const selectedCisterna = cisternas.find((c) => c.id === Number(cId));
    const capLitros = selectedCisterna ? Number(selectedCisterna.capacidad_litros) : 15000;
    if (capLitros <= 0) return 1;
    return Math.max(1, Math.ceil(litros / capLitros));
  };

  // When multi-sector selection changes
  const handleMultiSectorChange = (selectedNames: string[], totalDemandLitros: number) => {
    const trips = calculateTrips(totalDemandLitros, formData.cisterna_id);
    setFormData({
      ...formData,
      selectedSectores: selectedNames,
      litros_programados: totalDemandLitros,
      viajes_estimados: trips,
    });
  };

  // When cisterna selection changes -> auto-load its default driver!
  const handleCisternaChange = (cisternaId: string) => {
    const selectedCis = cisternas.find((c) => c.id === Number(cisternaId));
    const trips = calculateTrips(formData.litros_programados, cisternaId);

    // If cisterna has a habitual driver, auto-select it! (allow manual change too)
    const autoDriverId = selectedCis?.conductor_habitual_id || formData.conductor_id || (conductores[0]?.id || '');

    setFormData({
      ...formData,
      cisterna_id: cisternaId,
      conductor_id: autoDriverId,
      viajes_estimados: trips,
    });
  };

  const handleOpenCreateModal = () => {
    setEditingProg(null);
    const defaultSec = sectores[0];
    const initialSelectedSectores = defaultSec ? [defaultSec.nombre] : [];
    const demandLitros = defaultSec?.meta_semanal_litros || 15000;
    const defaultCis = cisternas[0];
    const defaultDriverId = defaultCis?.conductor_habitual_id || (conductores[0]?.id || '');
    const trips = calculateTrips(demandLitros, defaultCis?.id || 1);

    setFormData({
      fecha: new Date().toISOString().split('T')[0],
      selectedSectores: initialSelectedSectores,
      estado: 'Activa',
      cisterna_id: defaultCis?.id || '',
      conductor_id: defaultDriverId,
      ayudante_id: ayudantes[0]?.id || '',
      litros_programados: demandLitros,
      viajes_estimados: trips,
      dias_semana: defaultSec?.dias_entrega || 'Lunes, Miércoles, Viernes',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (p: Programacion) => {
    setEditingProg(p);

    // Parse existing sectors from zona string
    const parsedSectores = p.zona
      ? p.zona.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    setFormData({
      fecha: new Date(p.fecha).toISOString().split('T')[0],
      selectedSectores: parsedSectores.length > 0 ? parsedSectores : [p.zona],
      estado: p.estado,
      cisterna_id: p.cisterna_id || (cisternas[0]?.id || ''),
      conductor_id: p.conductor_id || (conductores[0]?.id || ''),
      ayudante_id: p.ayudante_id || '',
      litros_programados: p.litros_programados || 15000,
      viajes_estimados: p.viajes_estimados || 1,
      dias_semana: p.dias_semana || 'Lunes, Miércoles, Viernes',
    });
    setModalOpen(true);
  };

  const handleOpenDespachoModal = async (p: Programacion) => {
    setSelectedProgForVales(p);
    fetchVales(p.id);
  };

  const fetchVales = async (progId: number) => {
    try {
      setValesLoading(true);
      const res = await axios.get(`http://localhost:3000/api/v1/programaciones/${progId}/vales`);
      setValesList(res.data);
    } catch (error) {
      console.error('Error fetching vales:', error);
    } finally {
      setValesLoading(false);
    }
  };

  const handleDespacharVales = async () => {
    if (!selectedProgForVales) return;
    if (!window.confirm(`¿Confirmas el despacho masivo multicanal (WhatsApp + SMS + Email) para la programación #${selectedProgForVales.id}?`)) return;

    try {
      setDispatching(true);
      const res = await axios.post(`http://localhost:3000/api/v1/programaciones/${selectedProgForVales.id}/despachar-vales`);
      alert(`✅ ${res.data.message}\nResumen: WhatsApp: ${res.data.resumen.whatsappEnviados} | SMS: ${res.data.resumen.smsEnviados} | Correo: ${res.data.resumen.correoEnviados}`);
      fetchVales(selectedProgForVales.id);
    } catch (error: any) {
      alert(`❌ Error al despachar vales: ${error.response?.data?.message || error.message}`);
    } finally {
      setDispatching(false);
    }
  };

  const handleReintentarFallidos = async () => {
    if (!selectedProgForVales) return;

    try {
      setRetrying(true);
      const res = await axios.post(`http://localhost:3000/api/v1/programaciones/${selectedProgForVales.id}/reintentar-vales-fallidos`);
      alert(`✅ ${res.data.message}`);
      fetchVales(selectedProgForVales.id);
    } catch (error: any) {
      alert(`❌ Error al reintentar: ${error.response?.data?.message || error.message}`);
    } finally {
      setRetrying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.selectedSectores.length === 0) {
      alert('Debe marcar al menos un sector / AA.HH. para la programación.');
      return;
    }

    const payload = {
      fecha: formData.fecha,
      zona: formData.selectedSectores.join(', '),
      sectores_seleccionados: formData.selectedSectores.join(', '),
      estado: formData.estado,
      cisterna_id: formData.cisterna_id,
      conductor_id: formData.conductor_id,
      ayudante_id: formData.ayudante_id ? formData.ayudante_id : null,
      litros_programados: formData.litros_programados,
      viajes_estimados: formData.viajes_estimados,
      dias_semana: formData.dias_semana,
    };

    try {
      if (editingProg) {
        await axios.put(`http://localhost:3000/api/v1/programaciones/${editingProg.id}`, payload);
        alert('✅ Programación actualizada exitosamente');
      } else {
        await axios.post('http://localhost:3000/api/v1/programaciones', payload);
        alert('✅ Programación creada exitosamente con los sectores seleccionados');
      }
      setModalOpen(false);
      fetchProgramaciones();
    } catch (error: any) {
      alert(`❌ Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta programación?')) return;
    try {
      await axios.delete(`http://localhost:3000/api/v1/programaciones/${id}`);
      fetchProgramaciones();
    } catch (error: any) {
      alert('Error al eliminar');
    }
  };

  const filtered = programaciones.filter((p) =>
    p.zona?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.cisterna_placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.conductor_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const filteredVales = valesList.filter(
    (v) =>
      v.nombres_apellidos?.toLowerCase().includes(valesSearchTerm.toLowerCase()) ||
      v.dni?.includes(valesSearchTerm) ||
      v.codigo_unico?.toLowerCase().includes(valesSearchTerm.toLowerCase())
  );

  const totalWaOk = valesList.filter((v) => v.whatsapp_enviado).length;
  const totalSmsOk = valesList.filter((v) => v.sms_enviado).length;
  const totalMailOk = valesList.filter((v) => v.correo_enviado).length;

  const currentSelectedCisterna = cisternas.find((c) => c.id === Number(formData.cisterna_id));

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Programaciones y Logística de Cisternas</h1>
          <p>Rutas multi-sector, asignación automática de chofer habitual, cálculo de viajes y vales multicanal</p>
        </div>
        <div className="module-actions">
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            ➕ Nueva Programación
          </button>
        </div>
      </div>

      <div className="filters-card">
        <input
          type="text"
          placeholder="🔍 Buscar por Zona, Cisterna o Conductor..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ width: 340 }}
        />
        <span className="badge-count">Total: {filtered.length} programaciones</span>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID / Fecha</th>
              <th>Sectores Asignados</th>
              <th>Cisterna y Cuadrilla</th>
              <th>Viajes Programados</th>
              <th>Estado</th>
              <th>Avance Entregas</th>
              <th>Control Sanitario (TDR)</th>
              <th style={{ textAlign: 'center', minWidth: 230 }}>Acciones y Gestión</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>⏳</span> Cargando programaciones...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  <span>📋</span> No hay programaciones registradas.
                </td>
              </tr>
            ) : (
              paginatedData.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>#{p.id}</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {new Date(p.fecha).toLocaleDateString('es-PE')}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                      {p.zona.split(',').map((sec, idx) => (
                        <span key={idx} className="badge-count" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11.5, fontWeight: 700 }}>
                          📍 {sec.trim()}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      🗓️ {p.dias_semana || 'Lunes, Miércoles, Viernes'}
                    </div>
                  </td>
                  <td>
                    {p.cisterna_placa ? (
                      <div>
                        <span className="badge-count" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 800 }}>
                          🚛 {p.cisterna_placa}
                        </span>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          Cap: {p.cisterna_capacidad_m3} m³ ({Number(p.cisterna_capacidad_litros || 15000).toLocaleString()} Lts)
                        </div>
                        {p.conductor_nombre && (
                          <div style={{ fontSize: 11.5, color: '#1e293b', fontWeight: 700, marginTop: 4 }}>
                            👤 Chofer: {p.conductor_nombre}
                          </div>
                        )}
                        {p.ayudante_nombre ? (
                          <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 1 }}>
                            👷 Ayudante: {p.ayudante_nombre}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 }}>
                            (Sin ayudante)
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin asignar</span>
                    )}
                  </td>
                  <td>
                    <span className="badge-count" style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                      🏁 {p.viajes_estimados || 1} {p.viajes_estimados === 1 ? 'Viaje' : 'Viajes'}
                    </span>
                    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                      Demanda: {(p.litros_programados || 0).toLocaleString()} Lts
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${p.estado === 'Activa' ? 'status-active' : 'status-pending'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td>
                    <strong>{p.total_entregas} atendidos</strong>
                    <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>{p.total_litros} Lts</div>
                  </td>
                  <td>
                    {Number(p.calidad_carga || 0) >= 1 && Number(p.calidad_ruta || 0) >= 1 ? (
                      <div>
                        <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: 11 }}>
                          ✅ 2/2 Conforme
                        </span>
                        <div style={{ fontSize: 10.5, color: '#166534', marginTop: 2 }}>
                          💧 Carga + 🚚 Ruta
                          {Number(p.calidad_adicional || 0) > 0 ? ` (+${p.calidad_adicional})` : ''}
                        </div>
                      </div>
                    ) : Number(p.calidad_carga || 0) >= 1 ? (
                      <div>
                        <span className="badge-count" style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: 11 }}>
                          ⏳ 1/2 Falta en Ruta
                        </span>
                        <div style={{ fontSize: 10.5, color: '#92400e', marginTop: 2 }}>
                          💧 Carga Ok • Pendiente sector
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="badge-count" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 800, fontSize: 11 }}>
                          🔴 0/2 Sin Control
                        </span>
                        <div style={{ fontSize: 10.5, color: '#991b1b', marginTop: 2 }}>
                          Exigido por TDR
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1.5px solid #bfdbfe',
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        onClick={() => handleOpenEditModal(p)}
                        title="Editar los datos de esta Programación"
                      >
                        ✏️ Editar
                      </button>

                      <button
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1.5px solid #fecaca',
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        onClick={() => handleDelete(p.id)}
                        title="Eliminar esta Programación"
                      >
                        🗑️ Eliminar
                      </button>

                      <button
                        className="btn-secondary"
                        style={{
                          padding: '5px 9px',
                          fontSize: 11.5,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          borderColor: '#0284c7',
                          color: '#0284c7',
                          borderRadius: 6,
                          fontWeight: 700
                        }}
                        onClick={() => handleOpenDespachoModal(p)}
                        title="Gestionar Vales y Notificaciones"
                      >
                        📨 Vales
                      </button>

                      <a
                        href={`http://localhost:3000/api/v1/programaciones/${p.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-pdf"
                        style={{
                          padding: '5px 9px',
                          fontSize: 11.5,
                          borderRadius: 6,
                          fontWeight: 700,
                          textDecoration: 'none'
                        }}
                        title="Descargar Hoja de Ruta ANEXO 2 (PDF)"
                      >
                        📄 PDF
                      </a>
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

      {/* MODAL AUDITORÍA Y DESPACHO DE VALES */}
      {selectedProgForVales && (
        <div className="modal-overlay" onClick={() => setSelectedProgForVales(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 960, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Despacho Multicanal de Vales - Prog #{selectedProgForVales.id}</h2>
                <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                  📍 {selectedProgForVales.zona} • Cisterna: {selectedProgForVales.cisterna_placa || 'EGA-902'} • Conductor: {selectedProgForVales.conductor_nombre || 'Asignado'}
                </p>
              </div>
              <button className="close-btn" onClick={() => setSelectedProgForVales(null)}>✕</button>
            </div>

            {/* METRICS ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Vales Emitidos</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{valesList.length}</div>
              </div>
              <div style={{ background: '#ecfdf5', padding: 12, borderRadius: 10, border: '1px solid #a7f3d0', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>💬 WhatsApp Oficial</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>
                  {totalWaOk} / {valesList.length}
                </div>
              </div>
              <div style={{ background: '#eff6ff', padding: 12, borderRadius: 10, border: '1px solid #bfdbfe', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>📱 SMS Celular</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>
                  {totalSmsOk} / {valesList.length}
                </div>
              </div>
              <div style={{ background: '#faf5ff', padding: 12, borderRadius: 10, border: '1px solid #e9d5ff', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: '#6b21a8', fontWeight: 600 }}>📧 Correo Corporativo</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#7e22ce' }}>
                  {totalMailOk} / {valesList.length}
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS & SEARCH BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <input
                type="text"
                placeholder="🔍 Filtrar beneficiario o código..."
                className="search-input"
                style={{ width: 260 }}
                value={valesSearchTerm}
                onChange={(e) => setValesSearchTerm(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={handleDespacharVales}
                  disabled={dispatching}
                  style={{ background: '#059669' }}
                >
                  🚀 {dispatching ? 'Despachando por lotes (15)...' : 'Despachar a Todos (3 Canales)'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleReintentarFallidos}
                  disabled={retrying}
                >
                  🔄 {retrying ? 'Reintentando...' : 'Reintentar Canales Fallidos'}
                </button>
              </div>
            </div>

            {/* VALES AUDIT TABLE */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table className="custom-table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Código Vale</th>
                    <th>Beneficiario</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th>Dotación</th>
                    <th>WhatsApp</th>
                    <th>SMS</th>
                    <th>Correo</th>
                    <th>QR</th>
                  </tr>
                </thead>
                <tbody>
                  {valesLoading ? (
                    <tr>
                      <td colSpan={9} className="empty-state">
                        <span>⏳</span> Cargando vales de la programación...
                      </td>
                    </tr>
                  ) : filteredVales.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-state">
                        <span>🎟️</span> No hay vales emitidos aún. Presiona "Despachar a Todos" para generarlos y enviarlos.
                      </td>
                    </tr>
                  ) : (
                    filteredVales.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <span className="badge-count" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 800, fontSize: 11.5 }}>
                            {v.codigo_unico}
                          </span>
                        </td>
                        <td>
                          <strong>{v.nombres_apellidos}</strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>DNI: {v.dni}</div>
                        </td>
                        <td>{v.telefono || '-'}</td>
                        <td style={{ fontSize: 11.5 }}>{v.email || '-'}</td>
                        <td><strong>{v.litros_sugeridos} Lts</strong></td>
                        <td style={{ textAlign: 'center' }}>
                          {v.whatsapp_enviado ? (
                            <span title="Enviado con éxito" style={{ fontSize: 14 }}>🟢</span>
                          ) : (
                            <span title={v.errores_notificacion?.whatsapp || 'Pendiente / Fallido'} style={{ fontSize: 14, cursor: 'help' }}>🔴</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.sms_enviado ? (
                            <span title="Enviado con éxito" style={{ fontSize: 14 }}>🟢</span>
                          ) : (
                            <span title={v.errores_notificacion?.sms || 'Pendiente / Fallido'} style={{ fontSize: 14, cursor: 'help' }}>🔴</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.correo_enviado ? (
                            <span title="Enviado con éxito" style={{ fontSize: 14 }}>🟢</span>
                          ) : (
                            <span title={v.errores_notificacion?.correo || 'Pendiente / Fallido'} style={{ fontSize: 14, cursor: 'help' }}>🔴</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => setSelectedValeQr(v)}
                          >
                            📷 QR
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setSelectedProgForVales(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VER QR DE VALE */}
      {selectedValeQr && (
        <div className="modal-overlay" onClick={() => setSelectedValeQr(null)}>
          <div className="modal-content" style={{ maxWidth: 380, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vale Digital de Agua</h2>
              <button className="close-btn" onClick={() => setSelectedValeQr(null)}>✕</button>
            </div>
            <div style={{ background: '#ffffff', border: '2px solid #0284c7', borderRadius: 16, padding: 18 }}>
              <span style={{ fontSize: 24 }}>💧</span>
              <h3 style={{ margin: '4px 0', fontSize: 15, fontWeight: 800 }}>EPS MOYOBAMBA S.A.</h3>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#0284c7', fontWeight: 700 }}>VALE OFICIAL DE DISTRIBUCIÓN</p>
              
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(selectedValeQr.qr_data)}&margin=10`}
                alt="QR Vale"
                style={{ width: 170, height: 170, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />

              <div style={{ margin: '12px 0 6px', background: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#166534', letterSpacing: 1 }}>
                  {selectedValeQr.codigo_unico}
                </span>
              </div>

              <h4 style={{ margin: '6px 0 2px', fontSize: 14, color: '#0f172a' }}>{selectedValeQr.nombres_apellidos}</h4>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>DNI: {selectedValeQr.dni} • <strong>{selectedValeQr.litros_sugeridos} Litros</strong></p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => setSelectedValeQr(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR PROGRAMACIÓN MULTI-SECTOR CON CALCULADORA */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProg ? 'Editar Programación' : 'Crear Nueva Programación'}</h2>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              {/* MULTI-SECTOR SELECTOR */}
              <MultiSectorSelector
                sectores={sectores}
                selectedSectores={formData.selectedSectores}
                onChange={handleMultiSectorChange}
              />

              {/* CISTERNA AND CONDUCTOR SELECTORS */}
              <div className="form-row">
                <div className="form-group">
                  <label>Cisterna Asignada *</label>
                  <select
                    required
                    className="form-input"
                    value={formData.cisterna_id}
                    onChange={(e) => handleCisternaChange(e.target.value)}
                  >
                    {cisternas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.placa} - {c.marca_modelo} ({c.capacidad_m3} m³)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Conductor Asignado *</label>
                  <select
                    required
                    className="form-input"
                    value={formData.conductor_id}
                    onChange={(e) => setFormData({ ...formData, conductor_id: e.target.value })}
                  >
                    {conductores.map((cond) => (
                      <option key={cond.id} value={cond.id}>
                        {cond.nombres} {cond.apellidos} ({cond.licencia_conducir || 'Licencia'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CUADRILLA: AYUDANTE DE CAMPO */}
              <div className="form-row">
                <div className="form-group">
                  <label>👷 Ayudante de Campo (Cuadrilla / Reparto):</label>
                  <select
                    className="form-input"
                    value={formData.ayudante_id}
                    onChange={(e) => setFormData({ ...formData, ayudante_id: e.target.value })}
                  >
                    <option value="">-- Sin Ayudante (Operación Unipersonal) --</option>
                    {ayudantes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombres} {a.apellidos} {a.telefono ? `(📞 ${a.telefono})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Fecha de Inicio / Reparto *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.fecha}
                    onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  />
                </div>
              </div>

              {/* INTERACTIVE DAYS OF THE WEEK SELECTOR */}
              <DaysOfWeekSelector
                label="Días de Atención y Reparto Semanal"
                value={formData.dias_semana}
                onChange={(newDays) => setFormData({ ...formData, dias_semana: newDays })}
              />

              {/* LOGISTICS CALCULATOR CARD */}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: 14, borderRadius: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>
                    🚚 Cálculo Logístico Multiruta y Capacidad de Cisterna
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 12 }}>
                    SUNASS Logística
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  • <strong>Sectores a Cubrir:</strong> {formData.selectedSectores.length > 0 ? formData.selectedSectores.join(' + ') : 'Ninguno seleccionado'}<br />
                  • 💧 <strong>Demanda Total Combinada:</strong> {formData.litros_programados.toLocaleString()} Litros ({(formData.litros_programados / 1000).toFixed(2)} m³)<br />
                  • 🚛 <strong>Capacidad de Cisterna ({currentSelectedCisterna?.placa || 'Seleccionada'}):</strong> {currentSelectedCisterna?.capacidad_litros || 15000} Litros ({currentSelectedCisterna?.capacidad_m3 || 15} m³)<br />
                  • 👤 <strong>Conductor Asignado:</strong> {conductores.find(c => c.id === Number(formData.conductor_id)) ? `${conductores.find(c => c.id === Number(formData.conductor_id))?.nombres} ${conductores.find(c => c.id === Number(formData.conductor_id))?.apellidos}` : 'Sin chofer'}<br />
                  • 🏁 <strong>Total de Viajes que debe realizar el Conductor:</strong> <strong style={{ color: '#0284c7', fontSize: 15 }}>{formData.viajes_estimados} {formData.viajes_estimados === 1 ? 'Viaje' : 'Viajes'}</strong>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Litros Totales a Distribuir</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.litros_programados}
                    onChange={(e) => {
                      const lts = parseInt(e.target.value) || 0;
                      const trips = calculateTrips(lts, formData.cisterna_id);
                      setFormData({ ...formData, litros_programados: lts, viajes_estimados: trips });
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>Número de Viajes Estimados</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.viajes_estimados}
                    onChange={(e) => setFormData({ ...formData, viajes_estimados: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Estado de la Programación</label>
                <select
                  className="form-input"
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                >
                  <option value="Activa">Activa</option>
                  <option value="Completada">Completada</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingProg ? 'Guardar Cambios' : 'Crear Programación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
