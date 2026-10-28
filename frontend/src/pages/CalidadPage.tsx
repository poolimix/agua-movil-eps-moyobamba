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
  sector?: string;
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
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form State
  const [formData, setFormData] = useState({
    programacion_id: '',
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

  // Configuration Normativa State
  const [configCalidad, setConfigCalidad] = useState({
    turbiedad_max_ntu: 5.0,
    cloro_min_ppm: 0.5,
    cloro_max_ppm: 2.0,
    ph_min: 6.5,
    ph_max: 8.5
  });
  const [normasModalOpen, setNormasModalOpen] = useState(false);
  const [savingNormas, setSavingNormas] = useState(false);
  const [normasForm, setNormasForm] = useState({
    turbiedad_max_ntu: 5.0,
    cloro_min_ppm: 0.5,
    cloro_max_ppm: 2.0,
    ph_min: 6.5,
    ph_max: 8.5
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [calidadRes, statsRes, cisternasRes, programacionesRes, configRes] = await Promise.all([
        api.get('/calidad/calidad' + (filtroCisterna ? `?cisterna_id=${filtroCisterna}` : '')).catch(err => {
          console.warn('Advertencia cargando controles de calidad:', err);
          return { data: [] };
        }),
        api.get('/calidad/calidad/stats').catch(err => {
          console.warn('Advertencia cargando estadísticas de calidad:', err);
          return { data: null };
        }),
        api.get('/cisternas').catch(err => {
          console.warn('Advertencia cargando cisternas:', err);
          return { data: [] };
        }),
        api.get('/programaciones').catch(err => {
          console.warn('Advertencia cargando programaciones:', err);
          return { data: [] };
        }),
        api.get('/configuracion').catch(() => null)
      ]);

      setControles(Array.isArray(calidadRes?.data) ? calidadRes.data : []);
      if (statsRes?.data) setStats(statsRes.data);
      setCisternas(Array.isArray(cisternasRes?.data) ? cisternasRes.data : []);
      setProgramaciones(Array.isArray(programacionesRes?.data) ? programacionesRes.data : []);

      if (configRes?.data?.config) {
        const c = configRes.data.config;
        const loadedCfg = {
          turbiedad_max_ntu: Number(c.turbiedad_max_ntu) || 5.0,
          cloro_min_ppm: Number(c.cloro_min_ppm) || 0.5,
          cloro_max_ppm: Number(c.cloro_max_ppm) || 2.0,
          ph_min: Number(c.ph_min) || 6.5,
          ph_max: Number(c.ph_max) || 8.5
        };
        setConfigCalidad(loadedCfg);
        setNormasForm(loadedCfg);
      }
    } catch (error) {
      console.error('Error cargando datos de calidad:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNormas = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingNormas(true);
      await api.put('/configuracion', {
        turbiedad_max_ntu: Number(normasForm.turbiedad_max_ntu),
        cloro_min_ppm: Number(normasForm.cloro_min_ppm),
        cloro_max_ppm: Number(normasForm.cloro_max_ppm),
        ph_min: Number(normasForm.ph_min),
        ph_max: Number(normasForm.ph_max),
      });
      await dialogAlert({
        title: 'Límites Normativos Actualizados',
        message: '✅ Los parámetros de control de agua (turbiedad, cloro y pH) se han actualizado exitosamente.',
        type: 'success'
      });
      setConfigCalidad({ ...normasForm });
      setNormasModalOpen(false);
      fetchData();
    } catch (err: any) {
      dialogAlert({
        title: 'Error',
        message: err.response?.data?.message || 'Error al guardar parámetros normativos.',
        type: 'danger'
      });
    } finally {
      setSavingNormas(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filtroCisterna]);

  // Si se pasa ?programacion_id=X por la URL, abrir el modal vinculado a esa programación
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('programacion_id');
    if (pId && programaciones.length > 0) {
      handleOpenModal(pId);
    }
  }, [programaciones]);

  const handleOpenModal = async (targetProgId?: string | number | any) => {
    const cleanProgId = (typeof targetProgId === 'string' || typeof targetProgId === 'number') ? targetProgId : undefined;
    let currentCisternas = cisternas;
    let currentProgs = programaciones;

    if (!currentCisternas || currentCisternas.length === 0) {
      try {
        const cRes = await api.get('/cisternas');
        if (Array.isArray(cRes.data) && cRes.data.length > 0) {
          currentCisternas = cRes.data;
          setCisternas(currentCisternas);
        }
      } catch (err) {
        console.warn('No se pudieron recargar cisternas al abrir modal:', err);
      }
    }

    if (!currentProgs || currentProgs.length === 0) {
      try {
        const pRes = await api.get('/programaciones');
        if (Array.isArray(pRes.data)) {
          currentProgs = pRes.data;
          setProgramaciones(currentProgs);
        }
      } catch (err) {
        console.warn('No se pudieron recargar programaciones al abrir modal:', err);
      }
    }

    const defaultProg = cleanProgId 
      ? currentProgs.find(p => String(p.id) === String(cleanProgId))
      : (currentProgs.length > 0 ? currentProgs[0] : null);

    const defaultCisterna = defaultProg?.cisterna_id
      ? currentCisternas.find(c => String(c.id) === String(defaultProg.cisterna_id))
      : (currentCisternas && currentCisternas.length > 0 ? currentCisternas[0] : null);

    setFormData({
      programacion_id: defaultProg ? String(defaultProg.id) : '',
      cisterna_id: defaultCisterna ? String(defaultCisterna.id) : (defaultProg?.cisterna_id ? String(defaultProg.cisterna_id) : ''),
      conductor_nombre: defaultProg?.conductor_nombre || defaultCisterna?.conductor_habitual_nombre || '',
      cloro_residual_ppm: '1.20',
      turbiedad_ntu: '1.50',
      aspecto_organoleptico: 'Límpido / Incoloro',
      etapa_control: 'CARGA',
      punto_muestreo: 'Surtidor / Planta de Carga EPS Moyobamba',
      observaciones: '',
      registrado_por: 'Ing. Supervisor de Calidad'
    });
    setModalOpen(true);
  };

  const handleProgramacionChange = (progId: string) => {
    const selectedProg = programaciones.find(p => String(p.id) === String(progId));
    if (selectedProg) {
      const cisternaEncontrada = cisternas.find(c => String(c.id) === String(selectedProg.cisterna_id));
      setFormData(prev => ({
        ...prev,
        programacion_id: progId,
        cisterna_id: selectedProg.cisterna_id ? String(selectedProg.cisterna_id) : prev.cisterna_id,
        conductor_nombre: selectedProg.conductor_nombre || cisternaEncontrada?.conductor_habitual_nombre || prev.conductor_nombre,
        punto_muestreo: prev.etapa_control === 'CARGA'
          ? 'Surtidor / Planta de Carga EPS Moyobamba'
          : `En Ruta - Sector ${selectedProg.zona ? String(selectedProg.zona).split(',')[0].trim() : 'Asignado'}`
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        programacion_id: '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await api.post('/calidad/calidad', {
        ...formData,
        programacion_id: formData.programacion_id ? parseInt(formData.programacion_id, 10) : null,
        cisterna_id: formData.cisterna_id ? parseInt(formData.cisterna_id, 10) : null,
      });

      await dialogAlert({
        title: 'Control de Calidad Registrado',
        message: res.data.message || '✅ Control sanitario registrado exitosamente',
        type: 'success',
      });
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      await dialogAlert({
        title: 'Error en control de calidad',
        message: serverMsg || 'Error registrando control sanitario',
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getCloroBadge = (cloro: number) => {
    const val = Number(cloro);
    const isOptimo = val >= configCalidad.cloro_min_ppm && val <= configCalidad.cloro_max_ppm;
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
    const isApto = val <= configCalidad.turbiedad_max_ntu;
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

  const totalControlesNum = Number(stats?.total_controles) || 0;
  const conformesNum = Number(stats?.conformes) || 0;
  const pctConformidad = totalControlesNum > 0 
    ? Math.round((conformesNum / totalControlesNum) * 100) 
    : 100;
  const cloroPromedio = parseFloat(stats?.promedio_cloro_ppm || '0.00');
  const turbiedadPromedio = parseFloat(stats?.promedio_turbiedad_ntu || '0.00');
  const isCloroOptimo = cloroPromedio >= configCalidad.cloro_min_ppm && cloroPromedio <= configCalidad.cloro_max_ppm;
  const isTurbiedadOptima = turbiedadPromedio <= configCalidad.turbiedad_max_ntu;

  return (
    <Layout>
      <div className="module-container">
        {/* Header con Badge Normativo y Acción */}
        <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              <span>🛡️ D.S. 031-2010-SA</span>
              <span>•</span>
              <span>FISCALIZACIÓN SANITARIA EPS MOYOBAMBA</span>
            </div>
            <h1 className="module-title" style={{ margin: 0 }}>🧪 Control de Calidad del Agua (Cloro y Turbiedad)</h1>
            <p className="module-subtitle" style={{ margin: '4px 0 0' }}>
              Monitoreo organoléptico y fisicoquímico fehaciente en surtidor, ruta y punto de entrega
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              className="btn-secondary"
              onClick={() => {
                setNormasForm({ ...configCalidad });
                setNormasModalOpen(true);
              }}
              style={{
                background: '#f8fafc',
                borderColor: '#cbd5e1',
                color: '#334155',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700
              }}
              title="Configurar Límite Máximo Permisible (LMP) de Turbiedad y Cloro Residual"
            >
              <span>⚙️ Parámetros Normativos (Turbiedad ≤ {configCalidad.turbiedad_max_ntu} NTU)</span>
            </button>
            <button 
              type="button" 
              className="btn-primary"
              onClick={() => handleOpenModal()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}
            >
              <span style={{ fontSize: 16 }}>➕</span>
              <span>Registrar Ensayo Sanitario</span>
            </button>
          </div>
        </div>

        {/* Modern High-End Stats Cards */}
        <div className="stats-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          {/* CARD 1: TOTAL REGISTROS */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Total Ensayos
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  📋
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {totalControlesNum}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>muestras evaluadas</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pctConformidad}%`, height: '100%', background: '#10b981', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>✓</span>
                <span>{conformesNum} Aptos para consumo</span>
              </div>
            </div>
          </div>

          {/* CARD 2: PROMEDIO CLORO RESIDUAL */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #0284c7, #38bdf8)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Cloro Residual Libre
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0f9ff', border: '1px solid #e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  💧
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#0284c7', lineHeight: 1 }}>
                  {stats?.promedio_cloro_ppm || '0.00'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0369a1' }}>ppm</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${Math.min(100, (cloroPromedio / Math.max(configCalidad.cloro_max_ppm, 0.1)) * 100)}%`, height: '100%', background: isCloroOptimo ? '#0284c7' : '#ef4444', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isCloroOptimo ? '#f0f9ff' : '#fef2f2', color: isCloroOptimo ? '#0369a1' : '#991b1b', border: `1px solid ${isCloroOptimo ? '#bae6fd' : '#fecaca'}`, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>{isCloroOptimo ? '✓' : '⚠️'}</span>
                <span>Rango óptimo: {configCalidad.cloro_min_ppm} - {configCalidad.cloro_max_ppm} ppm</span>
              </div>
            </div>
          </div>

          {/* CARD 3: PROMEDIO TURBIEDAD */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Turbiedad Promedio
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  🔬
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#4f46e5', lineHeight: 1 }}>
                  {stats?.promedio_turbiedad_ntu || '0.00'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#4338ca' }}>NTU</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${Math.min(100, (turbiedadPromedio / Math.max(configCalidad.turbiedad_max_ntu, 0.1)) * 100)}%`, height: '100%', background: isTurbiedadOptima ? '#6366f1' : '#ef4444', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>{isTurbiedadOptima ? '✓' : '⚠️'}</span>
                <span>Límite reglamentario: ≤ {configCalidad.turbiedad_max_ntu} NTU</span>
              </div>
            </div>
          </div>

          {/* CARD 4: CONFORMIDAD SANITARIA */}
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Conformidad Sanitaria
                </span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', border: '1px solid #d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  🛡️
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#059669', lineHeight: 1 }}>
                  {pctConformidad}%
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Apto PNSU</span>
              </div>
            </div>
            <div>
              <div style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pctConformidad}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: 999 }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <span>🏅</span>
                <span>Acreditado ante PNSU y MINSA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar Modernizado */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          background: '#ffffff',
          padding: '12px 18px',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔍</span> Filtrar por Unidad:
            </span>
            <select 
              value={filtroCisterna} 
              onChange={(e) => {
                setFiltroCisterna(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                background: '#f8fafc',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas las Cisternas del Parque</option>
              {cisternas.map((c) => (
                <option key={c.id} value={c.id}>🚛 Cisterna {c.placa} ({c.capacidad_m3} m³)</option>
              ))}
            </select>

            {filtroCisterna && (
              <button
                type="button"
                onClick={() => { setFiltroCisterna(''); setCurrentPage(1); }}
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✕ Limpiar Filtro
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Mostrando <strong>{controles.length}</strong> ensayos
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setCurrentPage(1); fetchData(); }}
              style={{ padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              🔄 Actualizar Datos
            </button>
          </div>
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
          <div 
            className="modal-overlay" 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(15, 23, 42, 0.65)', 
              backdropFilter: 'blur(5px)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 1000,
              padding: '16px'
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div 
              style={{ 
                background: '#fff', 
                borderRadius: 16, 
                width: '100%', 
                maxWidth: 860, 
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden'
              }}
            >
              {/* Header Fijo */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '18px 24px', 
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc'
              }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🧪 Nuevo Registro de Control de Calidad del Agua
                  </h2>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                    Control Sanitario según TDR y D.S. N.° 031-2010-SA (Convenio PNSU N.° 023-2026/VIVIENDA)
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setModalOpen(false)} 
                  style={{ 
                    background: '#f1f5f9', 
                    border: 'none', 
                    width: 32, 
                    height: 32, 
                    borderRadius: 8, 
                    fontSize: 16, 
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Formulario con Scroll interno */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', 
                    gap: '16px 24px' 
                  }}>
                    {/* Columna Izquierda: Información de Operación & Cisterna */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        📍 1. Datos Operativos y Muestreo
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            PROGRAMACIÓN / RUTA EVALUADA (TDR PNSU):
                          </label>
                          {formData.programacion_id && (
                            <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                              Ruta #{formData.programacion_id}
                            </span>
                          )}
                        </div>
                        <select
                          value={formData.programacion_id}
                          onChange={(e) => handleProgramacionChange(e.target.value)}
                          style={{ 
                            width: '100%', 
                            padding: '9px 12px', 
                            borderRadius: 8, 
                            border: '1.5px solid #0284c7', 
                            fontWeight: 700, 
                            fontSize: 13, 
                            background: '#f0f9ff', 
                            color: '#0369a1',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <option value="">-- Control Libre / Sin Programación Específica --</option>
                          {programaciones.map((p) => {
                            const fechaCorta = p.fecha ? String(p.fecha).slice(0, 10) : '';
                            const cisternaTxt = p.cisterna_placa ? `Cisterna ${p.cisterna_placa}` : 'Cisterna Asignada';
                            return (
                              <option key={p.id} value={p.id}>
                                📅 Prog #{p.id} ({fechaCorta}) — {cisternaTxt}
                              </option>
                            );
                          })}
                        </select>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                          {formData.programacion_id 
                            ? '✅ Vinculado a la Ruta. Este ensayo sumará al cumplimiento 2/2 (Carga y Ruta).'
                            : 'ℹ️ Seleccione la ruta programada para que el control se compute en la programación.'}
                        </div>
                      </div>

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
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #0284c7', fontWeight: 600, fontSize: 13 }}
                        >
                          <option value="CARGA">💧 1. Al Cargar Cisterna (Surtidor / Planta) [MÍNIMO 1]</option>
                          <option value="RUTA">🚚 2. En Entrega de Ruta (Grifo Cisterna) [MÍNIMO 2]</option>
                          <option value="ADICIONAL">➕ 3. Control Adicional / Muestreo Libre [OPCIONAL]</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                          SECTOR / LUGAR EXACTO DEL CONTROL SANITARIO:
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          {[
                            'Surtidor / Planta EPS Moyobamba',
                            'SOL DE INDAÑE',
                            'SANTIAGO DE LOS 8 VALLES',
                            'SAN BORJA',
                            'LOS EUCALIPTOS',
                            'LAS BRISAS DEL MAYO',
                          ].map((secOpt) => {
                            const active = formData.punto_muestreo.toUpperCase().includes(secOpt.toUpperCase());
                            return (
                              <button
                                key={secOpt}
                                type="button"
                                onClick={() =>
                                  setFormData({
                                    ...formData,
                                    punto_muestreo:
                                      secOpt.includes('Surtidor')
                                        ? secOpt
                                        : formData.etapa_control === 'CARGA'
                                        ? `Surtidor / Planta (${secOpt})`
                                        : `Sector: ${secOpt}`,
                                  })
                                }
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: active ? 800 : 600,
                                  border: `1px solid ${active ? '#0284c7' : '#cbd5e1'}`,
                                  background: active ? '#e0f2fe' : '#f8fafc',
                                  color: active ? '#0369a1' : '#475569',
                                  cursor: 'pointer',
                                }}
                              >
                                📍 {secOpt}
                              </button>
                            );
                          })}
                        </div>
                        <input 
                          type="text"
                          value={formData.punto_muestreo}
                          onChange={(e) => setFormData({ ...formData, punto_muestreo: e.target.value })}
                          placeholder="Ej: Sector Sol de Indañe o Surtidor Central"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            CISTERNA EVALUADA:
                          </label>
                          {cisternas.length === 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await api.get('/cisternas');
                                  if (Array.isArray(res.data) && res.data.length > 0) {
                                    setCisternas(res.data);
                                    setFormData(prev => ({
                                      ...prev,
                                      cisterna_id: String(res.data[0].id),
                                      conductor_nombre: res.data[0].conductor_habitual_nombre || prev.conductor_nombre
                                    }));
                                  }
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              style={{ fontSize: 11, color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                            >
                              🔄 Reintentar Cargar
                            </button>
                          )}
                        </div>
                        <select 
                          value={formData.cisterna_id} 
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const found = cisternas.find(c => String(c.id) === String(selectedId));
                            setFormData(prev => ({ 
                              ...prev, 
                              cisterna_id: selectedId,
                              conductor_nombre: found?.conductor_habitual_nombre || prev.conductor_nombre
                            }));
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #0284c7', fontSize: 13, fontWeight: 700, background: '#f8fafc' }}
                          required
                        >
                          <option value="">{cisternas.length === 0 ? '⚠️ No hay cisternas disponibles' : '-- Seleccionar Cisterna --'}</option>
                          {cisternas.map((c) => (
                            <option key={c.id} value={c.id}>
                              🚛 Placa {c.placa} — {c.marca_modelo} ({c.capacidad_m3} m³ / {Number(c.capacidad_m3) * 1000} Lts)
                            </option>
                          ))}
                        </select>
                        {cisternas.length === 0 && (
                          <div style={{ marginTop: 6, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                            ⚠️ No se detectaron cisternas registradas en la base de datos.
                          </div>
                        )}
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          CONDUCTOR / CHOFER DE LA CISTERNA:
                        </label>
                        <input 
                          type="text" 
                          value={formData.conductor_nombre} 
                          onChange={(e) => setFormData({ ...formData, conductor_nombre: e.target.value })}
                          placeholder="Ej: Manuel Rojas Tapia / Conductor Operativo"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                    </div>

                    {/* Columna Derecha: Parámetros Fisicoquímicos y Ensayo */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                        💧 2. Parámetros Fisicoquímicos y Sanitarios
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                            CLORO RESIDUAL (ppm):
                          </label>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            max="5"
                            value={formData.cloro_residual_ppm} 
                            onChange={(e) => setFormData({ ...formData, cloro_residual_ppm: e.target.value })}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #059669', fontSize: 14, fontWeight: 700 }}
                            required 
                          />
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Rango: {configCalidad.cloro_min_ppm} a {configCalidad.cloro_max_ppm} ppm</div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                            TURBIEDAD (NTU):
                          </label>
                          <input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            max="20"
                            value={formData.turbiedad_ntu} 
                            onChange={(e) => setFormData({ ...formData, turbiedad_ntu: e.target.value })}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #059669', fontSize: 14, fontWeight: 700 }}
                            required 
                          />
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Máximo: &lt; {configCalidad.turbiedad_max_ntu} NTU</div>
                        </div>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          ASPECTO ORGANOLÉPTICO:
                        </label>
                        <select 
                          value={formData.aspecto_organoleptico} 
                          onChange={(e) => setFormData({ ...formData, aspecto_organoleptico: e.target.value })}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                        >
                          <option value="Límpido / Incoloro">Límpido / Incoloro (Óptimo)</option>
                          <option value="Aceptable">Aceptable</option>
                          <option value="Ligeramente turbio">Ligeramente turbio</option>
                          <option value="Con olor / sabor perceptible">Con olor / sabor perceptible</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          SUPERVISOR / EVALUADOR:
                        </label>
                        <input 
                          type="text" 
                          value={formData.registrado_por} 
                          onChange={(e) => setFormData({ ...formData, registrado_por: e.target.value })}
                          placeholder="Ej: Ing. Supervisor de Calidad"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                          required 
                        />
                      </div>

                      <div style={{ marginBottom: 6 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          OBSERVACIONES / LUGAR DE MUESTRA:
                        </label>
                        <textarea 
                          value={formData.observaciones} 
                          onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                          placeholder="Ej. Muestra tomada en el grifo de salida de la cisterna en planta de captación..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, minHeight: 62, resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Fijo con Botones */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: 12, 
                  padding: '16px 24px', 
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc'
                }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => setModalOpen(false)}
                    style={{ padding: '9px 18px', fontSize: 13 }}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={submitting}
                    style={{ padding: '9px 20px', fontSize: 13, fontWeight: 700 }}
                  >
                    {submitting ? 'Guardando...' : '✓ Guardar Test de Calidad'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Configuración Normativa de Calidad de Agua */}
        {normasModalOpen && (
          <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}>
            <div className="modal-content" style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 540,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    ⚙️ Configuración de Normas de Calidad de Agua
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                    Ajuste los Límites Máximos Permisibles (LMP) según el D.S. 031-2010-SA o directivas EPS
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNormasModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveNormas}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      Límite Máximo de Turbiedad (NTU):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="50"
                      value={normasForm.turbiedad_max_ntu}
                      onChange={(e) => setNormasForm({ ...normasForm, turbiedad_max_ntu: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                      required
                    />
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                      Norma SUNASS / MINSA habitual: 5.0 NTU. Cualquier ensayo superior se marcará como "No Apto".
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                      Rango de Cloro Residual Libre (ppm):
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Mínimo (ppm):</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          max="5"
                          value={normasForm.cloro_min_ppm}
                          onChange={(e) => setNormasForm({ ...normasForm, cloro_min_ppm: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                          required
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Máximo (ppm):</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.5"
                          max="10"
                          value={normasForm.cloro_max_ppm}
                          onChange={(e) => setNormasForm({ ...normasForm, cloro_max_ppm: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                          required
                        />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                      Valor habitual: 0.5 a 2.0 ppm para desinfección efectiva sin sabor residual.
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                      Rango de Potencial de Hidrógeno (pH):
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>pH Mínimo:</span>
                        <input
                          type="number"
                          step="0.1"
                          min="4"
                          max="10"
                          value={normasForm.ph_min}
                          onChange={(e) => setNormasForm({ ...normasForm, ph_min: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                          required
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>pH Máximo:</span>
                        <input
                          type="number"
                          step="0.1"
                          min="6"
                          max="12"
                          value={normasForm.ph_max}
                          onChange={(e) => setNormasForm({ ...normasForm, ph_max: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setNormasModalOpen(false)}
                    disabled={savingNormas}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingNormas}
                    style={{ background: '#0284c7', borderColor: '#0369a1' }}
                  >
                    {savingNormas ? 'Guardando...' : '💾 Guardar Límites de Calidad'}
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
