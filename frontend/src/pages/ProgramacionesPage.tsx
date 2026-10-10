import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import DaysOfWeekSelector from '../components/DaysOfWeekSelector';
import MultiSectorSelector, { type SectorItem } from '../components/MultiSectorSelector';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import { imprimirValeIndividual, imprimirValesLote } from '../utils/printVouchers';
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
  volumen_promedio?: string | number;
  poblacion_beneficiada?: string | number;
  poblacion_programada?: string | number;
  monto_valorizado?: string | number;
  monto_programado?: string | number;
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
      const res = await api.get('/programaciones');
      setProgramaciones(res.data);
    } catch (error) {
      console.error('Error fetching programaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSectores = async () => {
    try {
      const res = await api.get('/sectores');
      setSectores(res.data);
    } catch (error) {
      console.error('Error fetching sectores:', error);
    }
  };

  const fetchCisternas = async () => {
    try {
      const res = await api.get('/cisternas?estado=OPERATIVO');
      setCisternas(res.data);
    } catch (error) {
      console.error('Error fetching cisternas:', error);
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

  const fetchAyudantes = async () => {
    try {
      const res = await api.get('/personal?tipo=GESTOR_ENTREGA');
      setAyudantes(res.data);
    } catch (error) {
      console.error('Error fetching gestores de entrega:', error);
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
    const habitualDriver = conductores.find((c) => c.id === Number(selectedCis?.conductor_habitual_id));
    const currentDriver = conductores.find((c) => c.id === Number(formData.conductor_id));
    const autoDriverId = habitualDriver ? habitualDriver.id : (currentDriver ? currentDriver.id : (conductores[0]?.id || ''));

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
    const habitualDriver = conductores.find((c) => c.id === Number(defaultCis?.conductor_habitual_id));
    const defaultDriverId = habitualDriver ? habitualDriver.id : (conductores[0]?.id || '');
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
      const res = await api.get(`/programaciones/${progId}/vales`);
      setValesList(res.data);
    } catch (error) {
      console.error('Error fetching vales:', error);
    } finally {
      setValesLoading(false);
    }
  };

  const handleDespacharVales = async () => {
    if (!selectedProgForVales) return;
    const ok = await dialogConfirm({
      title: '¿Despachar vales digitales?',
      message: `¿Confirmas el despacho masivo multicanal (WhatsApp + SMS + Email) para la programación #${selectedProgForVales.id}?`,
      type: 'info',
      confirmText: 'Sí, despachar',
    });
    if (!ok) return;

    try {
      setDispatching(true);
      const res = await api.post(`/programaciones/${selectedProgForVales.id}/despachar-vales`);
      await dialogAlert({
        title: 'Despacho Completado',
        message: `✅ ${res.data.message}\nResumen:\n• WhatsApp: ${res.data.resumen.whatsappEnviados}\n• SMS: ${res.data.resumen.smsEnviados}\n• Correo: ${res.data.resumen.correoEnviados}`,
        type: 'success',
      });
      fetchVales(selectedProgForVales.id);
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al despachar vales',
        message: `❌ ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    } finally {
      setDispatching(false);
    }
  };

  const handleReintentarFallidos = async () => {
    if (!selectedProgForVales) return;

    try {
      setRetrying(true);
      const res = await api.post(`/programaciones/${selectedProgForVales.id}/reintentar-vales-fallidos`);
      await dialogAlert({
        title: 'Reintento Exitoso',
        message: `✅ ${res.data.message}`,
        type: 'success',
      });
      fetchVales(selectedProgForVales.id);
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al reintentar',
        message: `❌ ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.selectedSectores.length === 0) {
      await dialogAlert({
        title: 'Sector requerido',
        message: 'Debe marcar al menos un sector / AA.HH. para la programación.',
        type: 'warning',
      });
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
        await api.put(`/programaciones/${editingProg.id}`, payload);
        await dialogAlert({
          title: 'Programación actualizada',
          message: '✅ Programación actualizada exitosamente',
          type: 'success',
        });
      } else {
        await api.post('/programaciones', payload);
        await dialogAlert({
          title: 'Programación creada',
          message: '✅ Programación creada exitosamente con los sectores seleccionados',
          type: 'success',
        });
      }
      setModalOpen(false);
      fetchProgramaciones();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al guardar programación',
        message: `❌ Error: ${error.response?.data?.error || error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar programación?',
      message: '¿Estás seguro de eliminar esta programación? Esta acción cancelará las asignaciones correspondientes.',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/programaciones/${id}`);
      fetchProgramaciones();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar la programación. Verifique que no tenga entregas asociadas.',
        type: 'danger',
      });
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
        <table className="custom-table" style={{ minWidth: 1260 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>ID / Fecha</th>
              <th style={{ minWidth: 260 }}>Sectores Asignados</th>
              <th style={{ minWidth: 220 }}>Cisterna y Cuadrilla</th>
              <th style={{ minWidth: 140 }}>Viajes Programados</th>
              <th style={{ minWidth: 110 }}>Estado</th>
              <th style={{ minWidth: 175 }}>Vol. Repartido y Población</th>
              <th style={{ minWidth: 150 }}>Control Sanitario</th>
              <th style={{ textAlign: 'center', minWidth: 220 }}>Acciones y Gestión</th>
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
                  <td style={{ minWidth: 260 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {p.zona.split(',').map((sec, idx) => (
                          <span
                            key={idx}
                            className="badge-count"
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              fontSize: 11.5,
                              fontWeight: 700,
                              whiteSpace: 'normal',
                              lineHeight: 1.35,
                              display: 'inline-flex',
                              alignItems: 'center',
                              maxWidth: '100%',
                              wordBreak: 'break-word',
                              padding: '4px 10px'
                            }}
                          >
                            📍 {sec.trim()}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        🗓️ {p.dias_semana || 'Lunes, Miércoles, Viernes'}
                      </div>
                    </div>
                  </td>
                  <td style={{ minWidth: 220 }}>
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
                          <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, marginTop: 1 }}>
                            🤝 Gestor de Entrega: {p.ayudante_nombre}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 }}>
                            (Sin gestor asignado)
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
                  <td style={{ minWidth: 175 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                        🚰 {Number(p.total_litros || 0).toLocaleString()} Lts
                      </span>
                      <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 700 }}>
                        📊 Prom: {p.volumen_promedio ? `${Number(p.volumen_promedio).toLocaleString()} L/fam` : '350 L/fam'}
                      </span>
                      <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                        👥 {p.poblacion_beneficiada ? `${p.poblacion_beneficiada} hab. atendidos` : `${p.poblacion_programada || 140} hab. proy.`}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>
                        💰 S/. {Number(p.monto_valorizado || p.monto_programado || 0).toFixed(2)}
                      </span>
                    </div>
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
                        href={`${API_BASE_URL}/api/v1/programaciones/${p.id}/pdf`}
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

                      <a
                        href={`${API_BASE_URL}/api/v1/programaciones/${p.id}/excel`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-action-compact"
                        style={{
                          padding: '5px 9px',
                          fontSize: 11.5,
                          borderRadius: 6,
                          fontWeight: 700,
                          textDecoration: 'none',
                          color: '#15803d',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0'
                        }}
                        title="Descargar Hoja de Ruta ANEXO 2 (Excel)"
                      >
                        📊 Excel
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => imprimirValesLote(filteredVales, undefined, `Vales de Consumo - Programación N° ${selectedProgForVales?.id} (${selectedProgForVales?.zona})`)}
                  disabled={filteredVales.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 700,
                    background: '#f0fdf4',
                    borderColor: '#86efac',
                    color: '#166534'
                  }}
                  title="Imprimir todos los vales de esta programación en formato A4 para reparto en campo"
                >
                  🖨️ Imprimir Todos los Vales ({filteredVales.length})
                </button>
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
                        <td>
                          <strong style={{ color: '#0369a1' }}>{v.litros_sugeridos} Lts</strong>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Semanal (7d)</span>
                        </td>
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
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => setSelectedValeQr(v)}
                              title="Ver código QR digital"
                            >
                              📷 QR
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11, background: '#f8fafc' }}
                              onClick={() => imprimirValeIndividual({
                                codigo_unico: v.codigo_unico,
                                beneficiario_dni: v.dni,
                                beneficiario_nombre: v.nombres_apellidos,
                                telefono: v.telefono,
                                litros_sugeridos: v.litros_sugeridos,
                                programacion_fecha: selectedProgForVales?.fecha,
                                programacion_zona: selectedProgForVales?.zona
                              })}
                              title="Imprimir vale individual"
                            >
                              🖨️
                            </button>
                          </div>
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
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>DNI: {selectedValeQr.dni} • <strong style={{ color: '#0369a1' }}>{selectedValeQr.litros_sugeridos} Litros Semanales (7 días)</strong></p>
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
          <div
            className="modal-content modal-large"
            style={{ maxWidth: 1100, width: '95vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Planificación Logística EPS Moyobamba
                </span>
                <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>
                  {editingProg ? `Editar Programación #${editingProg.id}` : 'Crear Nueva Programación de Abastecimiento'}
                </h2>
              </div>
              <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              <div className="modal-grid-2col">
                {/* COLUMNA 1: SECTORES Y CALENDARIO */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 16 }}>📍</span>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        1. Sectores a Abastecer en la Ruta
                      </h3>
                    </div>
                    {/* MULTI-SECTOR SELECTOR */}
                    <MultiSectorSelector
                      sectores={sectores}
                      selectedSectores={formData.selectedSectores}
                      onChange={handleMultiSectorChange}
                    />
                  </div>

                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 16 }}>🗓️</span>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        2. Frecuencia y Fechas
                      </h3>
                    </div>
                    {/* INTERACTIVE DAYS OF THE WEEK SELECTOR */}
                    <DaysOfWeekSelector
                      label="Días de Atención y Reparto Semanal"
                      value={formData.dias_semana}
                      onChange={(newDays) => setFormData({ ...formData, dias_semana: newDays })}
                    />

                    <div className="form-group" style={{ marginTop: 12 }}>
                      <label style={{ fontWeight: 700, fontSize: 13 }}>Fecha de Inicio / Reparto *</label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={formData.fecha}
                        onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* COLUMNA 2: ASIGNACIÓN OPERATIVA, FLOTA Y CÁLCULOS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 16 }}>🚚</span>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        3. Asignación de Cisterna y Tripulación
                      </h3>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: 12.5 }}>Cisterna Asignada *</label>
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
                        <label style={{ fontWeight: 700, fontSize: 12.5 }}>Conductor Asignado *</label>
                        <select
                          required
                          className="form-input"
                          value={formData.conductor_id}
                          onChange={(e) => setFormData({ ...formData, conductor_id: e.target.value })}
                        >
                          <option value="">-- Seleccionar Conductor --</option>
                          {conductores.map((cond) => (
                            <option key={cond.id} value={cond.id}>
                              {cond.nombres} {cond.apellidos} ({cond.licencia_conducir || 'Licencia'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* GESTOR DE ENTREGA (REPARTO / RUTAS) */}
                    <div className="form-group" style={{ marginTop: 6 }}>
                      <label style={{ fontWeight: 700, fontSize: 12.5, color: '#0369a1' }}>
                        🤝 Gestor de Entrega (Reparto / Rutas):
                      </label>
                      <select
                        className="form-input"
                        value={formData.ayudante_id}
                        onChange={(e) => setFormData({ ...formData, ayudante_id: e.target.value })}
                        style={{ borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }}
                      >
                        <option value="">-- Sin Gestor de Entrega (Operación Unipersonal) --</option>
                        {ayudantes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombres} {a.apellidos} {a.telefono ? `(📞 ${a.telefono})` : ''} - Gestor de Entrega
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 11, color: '#64748b', marginTop: 3, display: 'block' }}>
                        El Gestor de Entrega registrará firmas, fotos con marca de agua y canje de vales en campo.
                      </span>
                    </div>

                    <div className="form-row" style={{ marginTop: 6 }}>
                      <div className="form-group">
                        <label style={{ fontWeight: 700, fontSize: 12.5 }}>Litros Totales a Distribuir</label>
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
                        <label style={{ fontWeight: 700, fontSize: 12.5 }}>Viajes Estimados</label>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={formData.viajes_estimados}
                          onChange={(e) => setFormData({ ...formData, viajes_estimados: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: 6 }}>
                      <label style={{ fontWeight: 700, fontSize: 12.5 }}>Estado de la Programación</label>
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
                  </div>

                  {/* LOGISTICS CALCULATOR CARD */}
                  <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', padding: 14, borderRadius: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0369a1' }}>
                        🚚 Resumen Operativo y Capacidad SUNASS
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 12 }}>
                        Logística Móvil
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                      • <strong>Sectores a Cubrir:</strong> {formData.selectedSectores.length > 0 ? formData.selectedSectores.join(' + ') : 'Ninguno seleccionado'}<br />
                      • 💧 <strong>Demanda Total:</strong> {formData.litros_programados.toLocaleString()} Lts ({(formData.litros_programados / 1000).toFixed(2)} m³)<br />
                      • 🚛 <strong>Cisterna:</strong> {currentSelectedCisterna?.placa || 'Seleccionada'} ({currentSelectedCisterna?.capacidad_litros || 15000} Lts)<br />
                      • 👤 <strong>Conductor:</strong> {conductores.find(c => c.id === Number(formData.conductor_id)) ? `${conductores.find(c => c.id === Number(formData.conductor_id))?.nombres} ${conductores.find(c => c.id === Number(formData.conductor_id))?.apellidos}` : (formData.conductor_id ? `Conductor asignado` : 'Sin chofer')}<br />
                      • 🤝 <strong>Gestor de Entrega:</strong> {ayudantes.find(a => a.id === Number(formData.ayudante_id)) ? `${ayudantes.find(a => a.id === Number(formData.ayudante_id))?.nombres} ${ayudantes.find(a => a.id === Number(formData.ayudante_id))?.apellidos}` : (formData.ayudante_id ? `Gestor asignado` : 'Sin gestor asignado')}<br />
                      • 🏁 <strong>Total de Viajes Calculados:</strong> <strong style={{ color: '#0284c7', fontSize: 15 }}>{formData.viajes_estimados} {formData.viajes_estimados === 1 ? 'Viaje' : 'Viajes'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}>
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
