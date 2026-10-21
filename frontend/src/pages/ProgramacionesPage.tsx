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
  fecha_inicio?: string;
  fecha_fin?: string;
  es_anual?: boolean;
  litros_esta_semana?: number | string;
  litros_este_mes?: number | string;
  familias_esta_semana?: number | string;
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
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: `${new Date().getFullYear()}-12-31`,
    es_anual: true,
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

  // Calendar & Progress Breakdown State (Lunes a Domingo por Semanas y por Meses)
  const [viewMode, setViewMode] = useState<'PLANILLA' | 'CALENDARIO'>('PLANILLA');
  const [selectedProgCalendar, setSelectedProgCalendar] = useState<Programacion | null>(null);
  const [calendarData, setCalendarData] = useState<any | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedMesCalendario, setSelectedMesCalendario] = useState<number>(new Date().getMonth() + 1);
  const [selectedAnioCalendario, setSelectedAnioCalendario] = useState<number>(new Date().getFullYear());

  // Vales & Dispatch State
  const [selectedProgForVales, setSelectedProgForVales] = useState<Programacion | null>(null);
  const [valesList, setValesList] = useState<Vale[]>([]);
  const [valesLoading, setValesLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [valesSearchTerm, setValesSearchTerm] = useState('');
  const [selectedValeQr, setSelectedValeQr] = useState<Vale | null>(null);
  const [valesPage, setValesPage] = useState(1);
  const [valesPageSize, setValesPageSize] = useState(15);
  const [sendingEmailValeId, setSendingEmailValeId] = useState<number | null>(null);

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
      fecha_inicio: new Date().toISOString().split('T')[0],
      fecha_fin: '2026-12-31',
      es_anual: true,
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

    // Identify which sectors belong to this programming
    const rawText = `${p.sectores_seleccionados || ''} ${p.zona || ''}`.toUpperCase();

    // Match against official sectors list
    const matchedSectores: string[] = [];
    sectores.forEach((sec) => {
      const secUpper = sec.nombre.toUpperCase();
      // If it's the official Convenio Meta 228 / PNSU multi-sector programming, include the 5 official sectors
      if ((rawText.includes('META 228') || rawText.includes('CONVENIO') || rawText.includes('TODOS')) && !secUpper.includes('SAN LORENZO')) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (rawText.includes(secUpper)) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (secUpper.includes('SANTIAGO') && (rawText.includes('SANTIAGO') || rawText.includes('8 VALLES'))) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (secUpper.includes('EUCALIPTOS') && rawText.includes('EUCALIPTOS')) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (secUpper.includes('BRISAS') && rawText.includes('BRISAS')) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (secUpper.includes('INDAÑE') && (rawText.includes('INDAÑE') || rawText.includes('INDANE'))) {
        matchedSectores.push(sec.nombre);
        return;
      }
      if (secUpper.includes('SAN BORJA') && rawText.includes('SAN BORJA')) {
        matchedSectores.push(sec.nombre);
        return;
      }
    });

    const parsedSectores = matchedSectores.length > 0
      ? matchedSectores
      : (p.zona ? p.zona.split(',').map((s) => s.trim()).filter(Boolean) : []);

    // Calculate total demand of matched sectors
    const totalDemand = parsedSectores.reduce((acc, secName) => {
      const sec = sectores.find((s) => s.nombre === secName);
      return acc + (Number(sec?.meta_semanal_litros) || 0);
    }, 0);

    const progLitros = Number(p.litros_programados) || totalDemand || 894000;
    const trips = p.viajes_estimados || calculateTrips(progLitros, p.cisterna_id || cisternas[0]?.id || 1);

    setFormData({
      fecha: new Date(p.fecha).toISOString().split('T')[0],
      fecha_inicio: p.fecha_inicio ? new Date(p.fecha_inicio).toISOString().split('T')[0] : new Date(p.fecha).toISOString().split('T')[0],
      fecha_fin: p.fecha_fin ? new Date(p.fecha_fin).toISOString().split('T')[0] : '2026-12-31',
      es_anual: p.es_anual !== false,
      selectedSectores: parsedSectores.length > 0 ? parsedSectores : [p.zona],
      estado: p.estado,
      cisterna_id: p.cisterna_id || (cisternas[0]?.id || ''),
      conductor_id: p.conductor_id || (conductores[0]?.id || ''),
      ayudante_id: p.ayudante_id || '',
      litros_programados: progLitros,
      viajes_estimados: trips,
      dias_semana: p.dias_semana || 'Lunes, Martes, Miércoles, Jueves, Viernes, Sábado',
    });
    setModalOpen(true);
  };

  const loadCalendarAvances = async (progId: number, mes?: number, anio?: number) => {
    try {
      setCalendarLoading(true);
      const m = mes !== undefined ? mes : selectedMesCalendario;
      const y = anio !== undefined ? anio : selectedAnioCalendario;
      const res = await api.get(`/programaciones/${progId}/avances-calendario?mes=${m}&anio=${y}`);
      if (res.data?.success && res.data?.data) {
        setCalendarData(res.data.data);
      } else if (res.data?.programacion || res.data?.diasCalendarioMes) {
        setCalendarData(res.data);
      }
    } catch (err) {
      console.error('Error cargando avances calendario:', err);
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'CALENDARIO') {
      const target = selectedProgCalendar || (programaciones.length > 0 ? programaciones[0] : null);
      if (target) {
        if (!selectedProgCalendar) setSelectedProgCalendar(target);
        loadCalendarAvances(target.id, selectedMesCalendario, selectedAnioCalendario);
      }
    }
  }, [viewMode, selectedProgCalendar?.id]);

  const handleOpenCalendarView = (p?: Programacion) => {
    const target = p || selectedProgCalendar || (programaciones.length > 0 ? programaciones[0] : null);
    if (target) {
      setSelectedProgCalendar(target);
      setViewMode('CALENDARIO');
      loadCalendarAvances(target.id, selectedMesCalendario, selectedAnioCalendario);
    }
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
      title: '¿Generar y despachar vales?',
      message: `¿Confirmas la emisión de vales para la programación #${selectedProgForVales.id}? Los vales quedarán generados con QR listos para impresión física y se enviarán por correo a quienes tengan email registrado. (WhatsApp y SMS quedan en espera sin cobro a terceros).`,
      type: 'info',
      confirmText: 'Sí, generar y despachar',
    });
    if (!ok) return;

    try {
      setDispatching(true);
      const res = await api.post(`/programaciones/${selectedProgForVales.id}/despachar-vales`);
      await dialogAlert({
        title: 'Vales Generados y Despachados',
        message: `✅ ${res.data.message}\n\nResumen:\n• Vales generados listos para imprimir: ${res.data.valesGenerados || res.data.totalBeneficiarios}\n• Correos enviados: ${res.data.resumen.correoEnviados}\n• Beneficiarios sin correo: ${res.data.resumen.sinCorreo || 0}\n• WhatsApp / SMS: En espera (sin cobro a terceros)`,
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
        title: 'Reintento de Correos',
        message: `✅ ${res.data.message}`,
        type: 'success',
      });
      fetchVales(selectedProgForVales.id);
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al reintentar correos',
        message: `❌ ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleEnviarCorreoIndividual = async (v: Vale) => {
    if (!v.email || !v.email.includes('@')) {
      await dialogAlert({
        title: 'Sin correo registrado',
        message: `El beneficiario ${v.nombres_apellidos} no cuenta con un correo electrónico en el padrón.`,
        type: 'warning',
      });
      return;
    }

    try {
      setSendingEmailValeId(v.id);
      const res = await api.post(`/vales/${v.id}/enviar-correo`);
      await dialogAlert({
        title: 'Correo Enviado con Éxito',
        message: `✅ ${res.data.message}`,
        type: 'success',
      });
      if (selectedProgForVales) {
        fetchVales(selectedProgForVales.id);
      }
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al enviar correo',
        message: `❌ ${error.response?.data?.message || error.message}`,
        type: 'danger',
      });
    } finally {
      setSendingEmailValeId(null);
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
      fecha_inicio: formData.fecha_inicio || formData.fecha,
      fecha_fin: formData.fecha_fin || formData.fecha,
      es_anual: formData.es_anual,
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
      v.codigo_unico?.toLowerCase().includes(valesSearchTerm.toLowerCase()) ||
      (v.email && v.email.toLowerCase().includes(valesSearchTerm.toLowerCase()))
  );

  const totalValesPages = Math.ceil(filteredVales.length / valesPageSize) || 1;
  const paginatedVales = filteredVales.slice((valesPage - 1) * valesPageSize, valesPage * valesPageSize);

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
        <div className="module-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* TOGGLE VISTA PLANILLA VS VISTA CALENDARIO */}
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              type="button"
              onClick={() => setViewMode('PLANILLA')}
              style={{
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background: viewMode === 'PLANILLA' ? '#0284c7' : 'transparent',
                color: viewMode === 'PLANILLA' ? '#ffffff' : '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              📑 Vista Planilla
            </button>
            <button
              type="button"
              onClick={() => {
                const target = selectedProgCalendar || (programaciones.length > 0 ? programaciones[0] : null);
                if (target) {
                  setSelectedProgCalendar(target);
                  loadCalendarAvances(target.id, selectedMesCalendario, selectedAnioCalendario);
                }
                setViewMode('CALENDARIO');
              }}
              style={{
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background: viewMode === 'CALENDARIO' ? '#0284c7' : 'transparent',
                color: viewMode === 'CALENDARIO' ? '#ffffff' : '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              📅 Vista Calendario & Avances
            </button>
          </div>

          <button className="btn-primary" onClick={handleOpenCreateModal}>
            ➕ Nueva Programación
          </button>
        </div>
      </div>

      {viewMode === 'PLANILLA' ? (
        <>
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
              <th style={{ minWidth: 120 }}>ID / Rango Fechas</th>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <strong>#{p.id}</strong>
                      {p.es_anual && (
                        <span className="badge-count" style={{ background: '#ecfdf5', color: '#047857', fontSize: 10, fontWeight: 800, padding: '1px 6px' }}>
                          🌟 Anual
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 700, marginTop: 3 }}>
                      {p.fecha_inicio ? new Date(p.fecha_inicio).toLocaleDateString('es-PE') : new Date(p.fecha).toLocaleDateString('es-PE')}
                      {p.fecha_fin && p.fecha_fin !== p.fecha_inicio && (
                        <span> al {new Date(p.fecha_fin).toLocaleDateString('es-PE')}</span>
                      )}
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
                    <a 
                      href={`/calidad?programacion_id=${p.id}`} 
                      style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}
                      title="Haga clic para registrar o auditar el control de calidad de esta programación"
                    >
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
                            🧪 Clic para evaluar
                          </div>
                        </div>
                      )}
                    </a>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        style={{
                          background: '#f0f9ff',
                          color: '#0369a1',
                          border: '1.5px solid #bae6fd',
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        onClick={() => handleOpenCalendarView(p)}
                        title="Ver desglose tipo calendario y avances por semana y por mes"
                      >
                        📅 Calendario & Avances
                      </button>

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

                      <a
                        href={`/calidad?programacion_id=${p.id}`}
                        style={{
                          background: '#f0fdf4',
                          color: '#166534',
                          border: '1.5px solid #bbf7d0',
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          textDecoration: 'none'
                        }}
                        title={`Evaluar Control Sanitario (Cloro y Turbiedad) para la Programación #${p.id}`}
                      >
                        🧪 Calidad
                      </a>

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
    </>
  ) : (
    /* VISTA CALENDARIO & AVANCES (LUNES A DOMINGO POR SEMANAS Y MESES) */
    <div className="calendar-advances-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* HEADER SELECTOR DE PROGRAMACIÓN Y MES */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 300 }}>
          <span style={{ fontSize: 20 }}>🚚</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>Programación en Seguimiento</div>
            <select
              className="form-input"
              style={{ minWidth: 320, fontWeight: 700, fontSize: 13, borderColor: '#38bdf8' }}
              value={selectedProgCalendar?.id || ''}
              onChange={(e) => {
                const found = programaciones.find(p => p.id === Number(e.target.value));
                if (found) {
                  setSelectedProgCalendar(found);
                  loadCalendarAvances(found.id, selectedMesCalendario, selectedAnioCalendario);
                }
              }}
            >
              {programaciones.map(p => (
                <option key={p.id} value={p.id}>
                  Prog #{p.id} - {p.zona} ({p.cisterna_placa || 'Cisterna'}) [{p.fecha_inicio ? new Date(p.fecha_inicio).toLocaleDateString('es-PE') : p.fecha} al {p.fecha_fin ? new Date(p.fecha_fin).toLocaleDateString('es-PE') : p.fecha}] {p.es_anual ? '★ Anual' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CONTROL MES ANTERIOR / SIGUIENTE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '6px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}>
          <button
            type="button"
            className="btn-link"
            style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 800, color: '#0369a1' }}
            onClick={() => {
              let prevM = selectedMesCalendario - 1;
              let prevY = selectedAnioCalendario;
              if (prevM < 1) { prevM = 12; prevY--; }
              setSelectedMesCalendario(prevM);
              setSelectedAnioCalendario(prevY);
              if (selectedProgCalendar) loadCalendarAvances(selectedProgCalendar.id, prevM, prevY);
            }}
          >
            ◀ Mes Anterior
          </button>

          <span style={{ fontWeight: 900, fontSize: 15, color: '#0f172a', minWidth: 150, textAlign: 'center' }}>
            {calendarData?.resumenMesActual?.nombreMes || `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][selectedMesCalendario - 1]} ${selectedAnioCalendario}`}
          </span>

          <button
            type="button"
            className="btn-link"
            style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 800, color: '#0369a1' }}
            onClick={() => {
              let nextM = selectedMesCalendario + 1;
              let nextY = selectedAnioCalendario;
              if (nextM > 12) { nextM = 1; nextY++; }
              setSelectedMesCalendario(nextM);
              setSelectedAnioCalendario(nextY);
              if (selectedProgCalendar) loadCalendarAvances(selectedProgCalendar.id, nextM, nextY);
            }}
          >
            Mes Siguiente ▶
          </button>
        </div>
      </div>

      {/* KPI CARDS RESUMEN OPERATIVO DEL PERÍODO */}
      {calendarLoading ? (
        <div style={{ background: '#fff', padding: 40, borderRadius: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 28 }}>⏳</span>
          <div style={{ marginTop: 8, fontWeight: 700, color: '#0369a1' }}>Calculando calendario y avances de distribución...</div>
        </div>
      ) : calendarData ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {/* CARD 1: CUMPLIMIENTO GLOBAL PERÍODO / AÑO */}
            <div style={{ background: '#ffffff', border: '1px solid #bae6fd', borderTop: '4px solid #0284c7', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#0369a1' }}>AVANCE GLOBAL PERÍODO</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6 }}>
                  {calendarData.programacion.es_anual ? '🌟 Período Anual' : 'Cronograma'}
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>
                {Number(calendarData.programacion.totalLitrosEntregados || 0).toLocaleString()} <span style={{ fontSize: 14, color: '#64748b' }}>Lts</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                Meta Total: {Number(calendarData.programacion.metaLitrosTotal || 0).toLocaleString()} Lts ({calendarData.programacion.pctAvanceGlobal}%)
              </div>
              <div style={{ width: '100%', height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, calendarData.programacion.pctAvanceGlobal)}%`, height: '100%', background: '#0284c7', borderRadius: 4 }} />
              </div>
            </div>

            {/* CARD 2: ESTE MES */}
            <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderTop: '4px solid #16a34a', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#166534' }}>DISTRIBUCIÓN ESTE MES</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, background: '#ecfdf5', color: '#15803d', padding: '2px 8px', borderRadius: 6 }}>
                  {calendarData.resumenMesActual?.diasAtencionMes || 0} Días de Reparto
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>
                {Number(calendarData.resumenMesActual?.entregadoMesLitros || 0).toLocaleString()} <span style={{ fontSize: 14, color: '#64748b' }}>Lts</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                {calendarData.resumenMesActual?.familiasAtendidasMes || 0} familias atendidas ({calendarData.resumenMesActual?.pctAvanceMes || 0}% de cuota mes)
              </div>
              <div style={{ width: '100%', height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, calendarData.resumenMesActual?.pctAvanceMes || 0)}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
              </div>
            </div>

            {/* CARD 3: ESTA SEMANA (LUNES A DOMINGO) */}
            <div style={{ background: '#ffffff', border: '1px solid #ddd6fe', borderTop: '4px solid #7c3aed', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9' }}>SEMANA EN CURSO (Lu-Do)</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, background: '#f5f3ff', color: '#6d28d9', padding: '2px 8px', borderRadius: 6 }}>
                  {calendarData.resumenSemanaActual?.inicioSemana} al {calendarData.resumenSemanaActual?.finSemana}
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>
                {Number(calendarData.resumenSemanaActual?.entregadoSemanaLitros || 0).toLocaleString()} <span style={{ fontSize: 14, color: '#64748b' }}>Lts</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                👥 {calendarData.resumenSemanaActual?.familiasSemana || 0} familias registradas esta semana
              </div>
            </div>

            {/* CARD 4: CISTERNA Y CUADRILLA */}
            <div style={{ background: '#ffffff', border: '1px solid #fed7aa', borderTop: '4px solid #f97316', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c' }}>CISTERNA & FRECUENCIA</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>
                🚛 {calendarData.programacion.cisterna_placa || 'EGA-902'}
              </div>
              <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                👤 Chofer: <strong>{calendarData.programacion.conductor_nombre || 'Asignado'}</strong>
              </div>
              <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 700, marginTop: 4 }}>
                🗓️ {calendarData.programacion.dias_semana || 'Lunes a Domingo'}
              </div>
            </div>
          </div>

          {/* MATRIZ DE CALENDARIO: LUNES A DOMINGO */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  📅 Calendario de Distribución (Lunes a Domingo) - {calendarData.resumenMesActual?.nombreMes}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Visualización diaria del avance efectivo de entregas según la frecuencia pactada: {calendarData.programacion.dias_semana}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ecfdf5', border: '1px solid #10b981' }} /> Con Reparto Efectivo
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f0f9ff', border: '1px solid #38bdf8' }} /> Día Programado
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f8fafc', border: '1px solid #cbd5e1' }} /> Sin Ruta
                </span>
              </div>
            </div>

            {/* 7 COLUMNAS: LUNES A DOMINGO */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((diaNom) => (
                <div
                  key={diaNom}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    textAlign: 'center',
                    padding: '8px 4px',
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: 12.5,
                    letterSpacing: 0.3
                  }}
                >
                  {diaNom}
                </div>
              ))}

              {/* LEADING EMPTY CELLS */}
              {(() => {
                const firstDayDate = new Date(selectedAnioCalendario, selectedMesCalendario - 1, 1);
                const leadCount = (firstDayDate.getDay() + 6) % 7;
                const empties = [];
                for (let i = 0; i < leadCount; i++) {
                  empties.push(
                    <div key={`empty-${i}`} style={{ background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0', minHeight: 90, opacity: 0.4 }} />
                  );
                }
                return empties;
              })()}

              {/* DAYS OF THE MONTH */}
              {Array.isArray(calendarData.diasCalendarioMes) && calendarData.diasCalendarioMes.map((dia: any) => {
                const hasDelivery = Number(dia.litrosEntregados || 0) > 0;
                return (
                  <div
                    key={dia.fecha}
                    style={{
                      background: hasDelivery ? '#ecfdf5' : (dia.esDiaAtencion ? '#f0f9ff' : '#ffffff'),
                      border: dia.esHoy ? '2px solid #0284c7' : (hasDelivery ? '1.5px solid #a7f3d0' : (dia.esDiaAtencion ? '1px solid #bae6fd' : '1px solid #e2e8f0')),
                      borderRadius: 10,
                      padding: 8,
                      minHeight: 92,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      boxShadow: dia.esHoy ? '0 0 0 2px rgba(2, 132, 199, 0.2)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: dia.esHoy ? '#0284c7' : '#0f172a' }}>
                        {dia.diaNumero}
                      </span>
                      {dia.esHoy && (
                        <span style={{ fontSize: 9, fontWeight: 800, background: '#0284c7', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>
                          HOY
                        </span>
                      )}
                      {!dia.esHoy && dia.esDiaAtencion && !hasDelivery && (
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '1px 4px', borderRadius: 4 }}>
                          Ruta
                        </span>
                      )}
                    </div>

                    {hasDelivery ? (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#047857' }}>
                          💧 {Number(dia.litrosEntregados).toLocaleString()} L
                        </div>
                        <div style={{ fontSize: 10, color: '#065f46', fontWeight: 700, marginTop: 1 }}>
                          👥 {dia.familiasAtendidas} familias
                        </div>
                        <div style={{ fontSize: 9, color: '#059669', fontWeight: 800, marginTop: 2 }}>
                          ✓ Reparto Realizado
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {dia.esDiaAtencion ? 'Programado' : 'Sin ruta'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* DESGLOSE POR SEMANAS DEL MES (SEMANA A SEMANA) */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
              📊 Avances y Entregas por Semanas del Mes ({calendarData.resumenMesActual?.nombreMes})
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {Array.isArray(calendarData.desgloseSemanasMes) && calendarData.desgloseSemanasMes.map((sem: any) => {
                const pct = Number(sem.pctAvance || 0);
                const cumplida = pct >= 100;
                return (
                  <div
                    key={sem.semana}
                    style={{
                      background: '#f8fafc',
                      border: cumplida ? '1.5px solid #a7f3d0' : '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{sem.semana}</span>
                        <div style={{ fontSize: 11, color: '#64748b' }}>📅 {sem.rango}</div>
                      </div>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          background: cumplida ? '#ecfdf5' : (sem.entregadoLitros > 0 ? '#fef3c7' : '#f1f5f9'),
                          color: cumplida ? '#059669' : (sem.entregadoLitros > 0 ? '#b45309' : '#64748b'),
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {cumplida ? '✅ Cumplida' : (sem.entregadoLitros > 0 ? '🟡 En Proceso' : '⚪ Pendiente')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                        {Number(sem.entregadoLitros || 0).toLocaleString()} <span style={{ fontSize: 11, color: '#64748b' }}>Lts</span>
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Meta: {Number(sem.metaSemanalLitros || 0).toLocaleString()} L ({pct}%)
                      </span>
                    </div>

                    <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: cumplida ? '#10b981' : '#0284c7', borderRadius: 4 }} />
                    </div>

                    <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
                      👥 Familias atendidas: <strong>{sem.familias || 0}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DESGLOSE MES A MES DEL CRONOGRAMA ANUAL */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
              🗓️ Seguimiento Mensual Acumulado del Cronograma Anual
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {Array.isArray(calendarData.desgloseMeses) && calendarData.desgloseMeses.map((mItem: any) => {
                const isSelected = mItem.mes === selectedMesCalendario;
                const pct = Number(mItem.pctAvance || 0);
                return (
                  <div
                    key={`${mItem.anio}-${mItem.mes}`}
                    onClick={() => {
                      setSelectedMesCalendario(mItem.mes);
                      setSelectedAnioCalendario(mItem.anio);
                      if (selectedProgCalendar) loadCalendarAvances(selectedProgCalendar.id, mItem.mes, mItem.anio);
                    }}
                    style={{
                      background: isSelected ? '#eff6ff' : '#f8fafc',
                      border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 12.5, color: isSelected ? '#0369a1' : '#0f172a' }}>
                        {mItem.mesNombre}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: pct >= 100 ? '#059669' : '#0284c7' }}>
                        {pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                      {Number(mItem.entregadoLitros || 0).toLocaleString()} <span style={{ fontSize: 10, color: '#64748b' }}>L</span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: isSelected ? '#0284c7' : '#94a3b8', borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: '#fff', padding: 40, borderRadius: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div style={{ marginTop: 8, fontWeight: 700, color: '#64748b' }}>Seleccione una programación para visualizar el calendario de entregas</div>
        </div>
      )}
    </div>
  )}

      {/* MODAL AUDITORÍA Y DESPACHO DE VALES */}
      {selectedProgForVales && (
        <div className="modal-overlay" onClick={() => setSelectedProgForVales(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 1240, width: '96%', maxHeight: '92vh', overflowY: 'auto' }}
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
                placeholder="🔍 Filtrar beneficiario, correo o código..."
                className="search-input"
                style={{ width: 280 }}
                value={valesSearchTerm}
                onChange={(e) => {
                  setValesSearchTerm(e.target.value);
                  setValesPage(1);
                }}
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
                  🚀 {dispatching ? 'Generando y emitiendo vales...' : 'Generar y Despachar Vales (Email + Impresión)'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleReintentarFallidos}
                  disabled={retrying}
                  title="Reintentar envío para beneficiarios con correo electrónico no entregado"
                >
                  📧 {retrying ? 'Reintentando correos...' : 'Reintentar Correos Fallidos'}
                </button>
              </div>
            </div>

            {/* VALES AUDIT TABLE CON SCROLL HORIZONTAL COMPLETO */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflowX: 'auto', background: '#fff' }}>
              <table className="custom-table" style={{ fontSize: 12.5, minWidth: 1020, width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ minWidth: 145 }}>Código Vale</th>
                    <th style={{ minWidth: 185 }}>Beneficiario</th>
                    <th style={{ minWidth: 100 }}>Teléfono</th>
                    <th style={{ minWidth: 175 }}>Correo Destino</th>
                    <th style={{ minWidth: 95 }}>Dotación</th>
                    <th style={{ textAlign: 'center', minWidth: 80 }}>WhatsApp</th>
                    <th style={{ textAlign: 'center', minWidth: 70 }}>SMS</th>
                    <th style={{ textAlign: 'center', minWidth: 110 }}>Estado Correo</th>
                    <th style={{ textAlign: 'center', minWidth: 160 }}>Acciones</th>
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
                        <span>🎟️</span> No hay vales emitidos aún. Presiona "Generar y Despachar Vales" para crearlos y habilitar la impresión.
                      </td>
                    </tr>
                  ) : (
                    paginatedVales.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <span className="badge-count" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 800, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                            {v.codigo_unico}
                          </span>
                        </td>
                        <td>
                          <strong>{v.nombres_apellidos}</strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>DNI: {v.dni}</div>
                        </td>
                        <td>{v.telefono || '-'}</td>
                        <td style={{ fontSize: 11.5 }}>
                          {v.email ? (
                            <strong style={{ color: '#0369a1' }}>{v.email}</strong>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: '#0369a1' }}>{v.litros_sugeridos} Lts</strong>
                          <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>Semanal (7d)</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.whatsapp_enviado ? (
                            <span title="Enviado con éxito" style={{ fontSize: 14 }}>🟢</span>
                          ) : (
                            <span title={v.errores_notificacion?.whatsapp || 'En espera: no estipulado pago a terceros'} style={{ fontSize: 14, cursor: 'help' }}>⏸️</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.sms_enviado ? (
                            <span title="Enviado con éxito" style={{ fontSize: 14 }}>🟢</span>
                          ) : (
                            <span title={v.errores_notificacion?.sms || 'En espera: no estipulado pago a terceros'} style={{ fontSize: 14, cursor: 'help' }}>⏸️</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {v.correo_enviado ? (
                            <span title="Correo enviado con éxito al beneficiario" style={{ fontSize: 14 }}>🟢</span>
                          ) : !v.email ? (
                            <span title="Sin correo registrado en padrón" style={{ fontSize: 14, opacity: 0.6 }}>⚪</span>
                          ) : (
                            <span title={v.errores_notificacion?.email || 'Fallo de entrega SMTP'} style={{ fontSize: 14, cursor: 'help' }}>🔴</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 7px', fontSize: 11 }}
                              onClick={() => setSelectedValeQr(v)}
                              title="Ver código QR digital"
                            >
                              📷 QR
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 7px', fontSize: 11, background: '#f8fafc' }}
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
                            {v.email && v.email.includes('@') && (
                              <button
                                className="btn-secondary"
                                style={{
                                  padding: '3px 7px',
                                  fontSize: 11,
                                  background: v.correo_enviado ? '#f0fdf4' : '#eff6ff',
                                  color: v.correo_enviado ? '#166534' : '#1d4ed8',
                                  borderColor: v.correo_enviado ? '#86efac' : '#93c5fd',
                                  fontWeight: 700
                                }}
                                disabled={sendingEmailValeId === v.id}
                                onClick={() => handleEnviarCorreoIndividual(v)}
                                title={v.correo_enviado ? "Reenviar correo oficial" : "Enviar correo al beneficiario"}
                              >
                                {sendingEmailValeId === v.id ? '⏳' : '✉️ Correo'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINACIÓN DE VALES */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              padding: '8px 12px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 600 }}>
                Mostrando {filteredVales.length === 0 ? 0 : (valesPage - 1) * valesPageSize + 1} a {Math.min(valesPage * valesPageSize, filteredVales.length)} de {filteredVales.length} vales
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Por página:</span>
                <select
                  value={valesPageSize}
                  onChange={(e) => {
                    setValesPageSize(Number(e.target.value));
                    setValesPage(1);
                  }}
                  className="search-input"
                  style={{ width: 75, padding: '3px 8px', fontSize: 12, height: 30 }}
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button
                  className="btn-secondary"
                  style={{ padding: '3px 10px', fontSize: 12, height: 30 }}
                  onClick={() => setValesPage((p) => Math.max(p - 1, 1))}
                  disabled={valesPage === 1}
                >
                  ◀ Anterior
                </button>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                  Pág {valesPage} de {totalValesPages}
                </span>
                <button
                  className="btn-secondary"
                  style={{ padding: '3px 10px', fontSize: 12, height: 30 }}
                  onClick={() => setValesPage((p) => Math.min(p + 1, totalValesPages))}
                  disabled={valesPage >= totalValesPages}
                >
                  Siguiente ▶
                </button>
              </div>
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

                    {/* DUAL DATE RANGE SELECTOR (INICIO - FIN) CON PRESETS TIPO CALENDARIO */}
                    <div style={{ marginTop: 14, background: '#ffffff', borderRadius: 10, padding: 12, border: '1.5px solid #bae6fd' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                          📅 Rango de Fechas del Cronograma (Inicio y Fin)
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 6 }}>
                          {formData.es_anual ? '🌟 Período Anual Oficial' : 'Rango Personalizado'}
                        </span>
                      </div>

                      {/* QUICK PRESET BUTTONS (COMO EN LA FOTO DE REFERENCIA) */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => {
                            const now = new Date();
                            const y = now.getFullYear();
                            setFormData({
                              ...formData,
                              fecha_inicio: `${y}-03-01`,
                              fecha_fin: `${y}-12-10`,
                              fecha: `${y}-03-01`,
                              es_anual: true,
                            });
                          }}
                        >
                          🌟 Todo el Período Anual (01 Mar - 10 Dic)
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, '0');
                            const firstDay = `${y}-${m}-01`;
                            const lastDay = new Date(y, now.getMonth() + 1, 0).toISOString().split('T')[0];
                            setFormData({
                              ...formData,
                              fecha_inicio: firstDay,
                              fecha_fin: lastDay,
                              fecha: firstDay,
                            });
                          }}
                        >
                          Mes Actual
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11, fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setFormData({
                              ...formData,
                              fecha_inicio: today,
                              fecha_fin: today,
                              fecha: today,
                            });
                          }}
                        >
                          Hoy / Fecha Única
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                            INICIO 🗓️
                          </label>
                          <input
                            type="date"
                            required
                            className="form-input"
                            value={formData.fecha_inicio}
                            onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value, fecha: e.target.value })}
                            style={{ borderColor: '#38bdf8', fontWeight: 700 }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                            FIN 🏁
                          </label>
                          <input
                            type="date"
                            required
                            className="form-input"
                            value={formData.fecha_fin}
                            onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
                            style={{ borderColor: '#38bdf8', fontWeight: 700 }}
                          />
                        </div>
                      </div>

                      {/* CHECKBOX VALE Y QR ANUAL */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 10px', borderRadius: 8 }}>
                        <input
                          type="checkbox"
                          checked={formData.es_anual}
                          onChange={(e) => setFormData({ ...formData, es_anual: e.target.checked })}
                          style={{ width: 18, height: 18, accentColor: '#16a34a', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
                          🌟 Generar un solo vale y QR que dure todo el año (QR Anual permanente para cada beneficiario)
                        </span>
                      </label>
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
