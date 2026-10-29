import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import { imprimirValeIndividual, imprimirValesLote } from '../utils/printVouchers';
import './Modules.css';

interface Vale {
  id: number;
  codigo_unico: string;
  beneficiario_id: number;
  beneficiario_dni?: string;
  beneficiario_nombre?: string;
  sector?: string;
  beneficiario_telefono?: string;
  programacion_id: number;
  programacion_fecha?: string;
  programacion_zona?: string;
  litros_sugeridos: number;
  estado: string;
  num_miembros?: number | string;
  direccion?: string;
  calle_direccion?: string;
  whatsapp_enviado?: boolean;
  sms_enviado?: boolean;
  correo_enviado?: boolean;
  fecha_emision?: string;
}

interface StatsVales {
  total_vales: string;
  pendientes: string;
  entregados: string;
  vencidos: string;
  anulados: string;
  total_litros: string;
}

export default function ValesPage() {
  const [vales, setVales] = useState<Vale[]>([]);
  const [stats, setStats] = useState<StatsVales | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSector, setFiltroSector] = useState('');
  const [selectedVale, setSelectedVale] = useState<Vale | null>(null);
  const [configSistema, setConfigSistema] = useState({
    dotacion_diaria_litros: 50,
    dias_entrega_semanal: 7
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchVales = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '10000');
      if (filtroEstado) params.append('estado', filtroEstado);
      if (search) params.append('search', search);

      const res = await api.get(`/vales?${params.toString()}`);
      let loadedVales: Vale[] = res.data.vales || [];
      const loadedStats: StatsVales | null = res.data.stats || null;

      // Garantía total sin límite de 100: si por paginación previa quedaron más registros (ej. 153 o más en el futuro), traer todas las páginas restantes automáticamente
      const totalEsperado = Number(loadedStats?.total_vales || 0);
      if (!filtroEstado && !search && loadedVales.length > 0 && loadedVales.length < totalEsperado) {
        let currentOffset = loadedVales.length;
        while (currentOffset < totalEsperado) {
          const nextParams = new URLSearchParams();
          nextParams.append('limit', '500');
          nextParams.append('offset', String(currentOffset));
          const nextRes = await api.get(`/vales?${nextParams.toString()}`);
          const extra: Vale[] = nextRes.data?.vales || [];
          if (extra.length === 0) break;
          const existingIds = new Set(loadedVales.map((v) => v.id));
          for (const item of extra) {
            if (!existingIds.has(item.id)) {
              loadedVales.push(item);
            }
          }
          currentOffset += extra.length;
        }
      }

      setVales(loadedVales);
      setStats(loadedStats);
    } catch (error) {
      console.error('Error al cargar vales:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await api.get('/configuracion');
      if (res.data?.config) {
        setConfigSistema({
          dotacion_diaria_litros: Number(res.data.config.dotacion_diaria_litros) || 50,
          dias_entrega_semanal: Number(res.data.config.dias_entrega_semanal) || 7
        });
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchVales();
    fetchConfig();
  }, [filtroEstado]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVales();
  };

  const handleCambiarEstado = async (id: number, nuevoEstado: string) => {
    const ok = await dialogConfirm({
      title: 'Cambiar estado del vale',
      message: `¿Está seguro de cambiar el estado del vale a "${nuevoEstado}"?`,
      type: 'warning',
      confirmText: 'Sí, cambiar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.patch(`/vales/${id}/estado`, { estado: nuevoEstado });
      await dialogAlert({
        title: 'Estado actualizado',
        message: '✅ Estado del vale actualizado correctamente',
        type: 'success',
      });
      fetchVales();
      if (selectedVale) setSelectedVale(null);
    } catch (err) {
      await dialogAlert({
        title: 'Error',
        message: 'No se pudo actualizar el estado del vale.',
        type: 'danger',
      });
    }
  };

  const handleRecalcularSemana = async () => {
    const ok = await dialogConfirm({
      title: 'Recalcular Dotación Semanal',
      message: '¿Desea actualizar todos los vales emitidos a la dotación semanal reglamentaria de 7 días (50 L/hab/día × 7 días = 350 L/hab)?',
      type: 'warning',
      confirmText: 'Sí, Sincronizar',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      const res = await api.post('/vales/recalcular-semana');
      await dialogAlert({
        title: 'Sincronización Exitosa',
        message: res.data.message || 'Vales actualizados con éxito.',
        type: 'success'
      });
      fetchVales();
    } catch (e: any) {
      await dialogAlert({
        title: 'Error',
        message: e.response?.data?.message || 'Error al recalcular vales',
        type: 'danger'
      });
    }
  };

  const getEstadoBadge = (estado: string) => {
    const estUpper = (estado || '').toUpperCase().trim();
    switch (estUpper) {
      case 'ENTREGADO':
      case 'CANJEADO':
        return <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>✓ ENTREGADO</span>;
      case 'EMITIDO':
      case 'PENDIENTE':
        return <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>⏳ PENDIENTE</span>;
      case 'VENCIDO':
        return <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>⚠ VENCIDO</span>;
      case 'ANULADO':
        return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>✕ ANULADO</span>;
      default:
        return <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}>{estado}</span>;
    }
  };

  const imprimirValeTicket = async (v: Vale) => {
    await imprimirValeIndividual({
      codigo_unico: v.codigo_unico,
      beneficiario_dni: v.beneficiario_dni,
      beneficiario_nombre: v.beneficiario_nombre,
      sector: v.sector,
      direccion: v.direccion || v.calle_direccion,
      num_miembros: v.num_miembros,
      litros_sugeridos: v.litros_sugeridos,
      estado: v.estado,
      programacion_fecha: v.programacion_fecha,
      programacion_zona: v.programacion_zona
    }, configSistema);
  };

  // Lista de sectores únicos con sus conteos para filtrar o imprimir por sector
  const sectoresSummary = (() => {
    const map = new Map<string, Vale[]>();
    for (const v of vales) {
      const sec = (v.sector || 'SIN SECTOR').trim().toUpperCase();
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(v);
    }
    return Array.from(map.entries())
      .map(([sectorName, items]) => ({
        sector: sectorName,
        count: items.length,
        litros: items.reduce((acc, cur) => acc + (Number(cur.litros_sugeridos) || 0), 0),
        items,
      }))
      .sort((a, b) => a.sector.localeCompare(b.sector));
  })();

  const filteredVales = vales.filter((v) => {
    if (filtroSector) {
      const sec = (v.sector || 'SIN SECTOR').trim().toUpperCase();
      if (sec !== filtroSector.toUpperCase()) return false;
    }
    if (filtroEstado) {
      const est = (v.estado || 'EMITIDO').toUpperCase().trim();
      const target = filtroEstado.toUpperCase().trim();
      if (target === 'EMITIDO' || target === 'PENDIENTE') {
        if (est !== 'EMITIDO' && est !== 'PENDIENTE') return false;
      } else if (target === 'ENTREGADO' || target === 'CANJEADO') {
        if (est !== 'ENTREGADO' && est !== 'CANJEADO') return false;
      } else if (est !== target) {
        return false;
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchCodigo = (v.codigo_unico || '').toLowerCase().includes(q);
      const matchDni = (v.beneficiario_dni || '').toLowerCase().includes(q);
      const matchNombre = (v.beneficiario_nombre || '').toLowerCase().includes(q);
      const matchSector = (v.sector || '').toLowerCase().includes(q);
      if (!matchCodigo && !matchDni && !matchNombre && !matchSector) return false;
    }
    return true;
  });

  const paginatedVales = filteredVales.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalEmitidosKpi = Math.max(Number(stats?.total_vales || 0), vales.length);
  const pendientesCalculados = vales.filter((v) =>
    ['EMITIDO', 'PENDIENTE'].includes((v.estado || 'EMITIDO').toUpperCase().trim())
  ).length;
  const entregadosCalculados = vales.filter((v) =>
    ['ENTREGADO', 'CANJEADO'].includes((v.estado || '').toUpperCase().trim())
  ).length;
  const totalPendientesKpi = Number(stats?.pendientes || 0) > 0 ? Number(stats?.pendientes) : pendientesCalculados;
  const totalEntregadosKpi = Number(stats?.entregados || 0) > 0 ? Number(stats?.entregados) : entregadosCalculados;
  const totalLitrosKpi =
    Number(stats?.total_litros || 0) > 0
      ? Number(stats?.total_litros)
      : vales.reduce((acc, v) => acc + (Number(v.litros_sugeridos) || 0), 0);

  return (
    <Layout>
      <div className="module-container">
        {/* Header */}
        <div className="module-header">
          <div>
            <h1 className="module-title">🎟️ Gestión y Emisión de Vales de Consumo</h1>
            <p className="module-subtitle">Control de vales físicos y digitales con número de serie único y cálculo automático de dotación (PNSU)</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 18 }}>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TOTAL VALES EMITIDOS</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{totalEmitidosKpi}</div>
            <div style={{ fontSize: 11, color: '#0284c7', marginTop: 4 }}>Serie oficial asignada</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>PENDIENTES DE CANJE</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{totalPendientesKpi}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Por entregar en ruta</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>VALES CANJEADOS (ENTREGADOS)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{totalEntregadosKpi}</div>
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>Con firma y foto auditada</div>
          </div>
          <div className="stat-card" style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>VOLUMEN TOTAL ASIGNADO</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
              {(totalLitrosKpi / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} m³
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{totalLitrosKpi.toLocaleString('es-PE')} Litros</div>
          </div>
        </div>

        {/* BARRA DE IMPRESIÓN RÁPIDA DE VALES POR SECTOR */}
        {sectoresSummary.length > 0 && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🖨️ IMPRIMIR VALES POR SECTOR (TALONARIO A4):</span>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: '#64748b' }}>
                  Haz clic en un sector para imprimir todos los vales de ese sector o filtrarlos en la tabla
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  imprimirValesLote(
                    vales,
                    configSistema,
                    `Padrón Completo de Vales (${vales.length} Beneficiarios) - EPS Moyobamba`
                  )
                }
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: '1px solid #0284c7',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                🖨️ Imprimir Todos los Sectores ({vales.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sectoresSummary.map((s) => {
                const isSelected = filtroSector.toUpperCase() === s.sector;
                return (
                  <div
                    key={s.sector}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                      background: isSelected ? '#e0f2fe' : '#ffffff',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroSector(isSelected ? '' : s.sector);
                        setCurrentPage(1);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: isSelected ? '#0369a1' : '#334155',
                        cursor: 'pointer',
                      }}
                      title={`Filtrar tabla por el sector ${s.sector}`}
                    >
                      📍 {s.sector} <strong>({s.count})</strong>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        imprimirValesLote(
                          s.items,
                          configSistema,
                          `Vales del Sector: ${s.sector} (${s.count} Beneficiarios) - EPS Moyobamba`
                        )
                      }
                      style={{
                        background: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        borderLeft: '1px solid #cbd5e1',
                        padding: '6px 9px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title={`Imprimir directamente los ${s.count} vales del sector ${s.sector} en formato A4`}
                    >
                      🖨️ Imprimir
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 260 }}>
            <input 
              type="text" 
              placeholder="Buscar por serie (VAL-...), DNI o Nombre de Beneficiario..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
              🔍 Buscar
            </button>
          </form>

          <select
            value={filtroSector}
            onChange={(e) => {
              setFiltroSector(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', fontWeight: 700, fontSize: 13 }}
          >
            <option value="">📍 Todos los Sectores ({vales.length})</option>
            {sectoresSummary.map((s) => (
              <option key={s.sector} value={s.sector}>
                📍 {s.sector} ({s.count} vales)
              </option>
            ))}
          </select>

          <select 
            value={filtroEstado} 
            onChange={(e) => {
              setFiltroEstado(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="">Todos los Estados</option>
            <option value="Emitido">Pendientes / Emitidos</option>
            <option value="Entregado">Entregados / Canjeados</option>
            <option value="Vencido">Vencidos</option>
            <option value="Anulado">Anulados</option>
          </select>

          <button
            className="btn-secondary"
            onClick={() => {
              setSearch('');
              setFiltroEstado('');
              setFiltroSector('');
              setCurrentPage(1);
              fetchVales();
            }}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Limpiar Filtros
          </button>

          <a 
            href={`${API_BASE_URL}/api/v1/vales/export-excel?${new URLSearchParams({
              ...(filtroEstado ? { estado: filtroEstado } : {}),
              ...(filtroSector ? { sector: filtroSector } : {}),
              ...(search ? { search } : {}),
            }).toString()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ 
              textDecoration: 'none', 
              padding: '8px 14px', 
              fontSize: 13, 
              background: '#f0fdf4', 
              borderColor: '#86efac', 
              color: '#166534', 
              fontWeight: 700, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6 
            }}
            title="Descargar padrón oficial de vales emitidos en Excel (.xlsx)"
          >
            📊 Exportar Excel ({filteredVales.length})
          </a>

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              imprimirValesLote(
                filteredVales,
                configSistema,
                filtroSector
                  ? `Vales del Sector ${filtroSector} (${filteredVales.length}) - EPS Moyobamba`
                  : `Vales de Consumo (${filteredVales.length}) - EPS Moyobamba`
              )
            }
            disabled={filteredVales.length === 0}
            style={{ 
              padding: '8px 14px', 
              fontSize: 13, 
              background: '#f8fafc', 
              borderColor: '#cbd5e1', 
              color: '#0f172a', 
              fontWeight: 700, 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 6 
            }}
            title="Imprimir todos los vales filtrados en formato talonario A4 listo para corte"
          >
            🖨️ Imprimir Lote A4{filtroSector ? ` - ${filtroSector}` : ''} ({filteredVales.length})
          </button>

          <button 
            className="btn-secondary" 
            onClick={handleRecalcularSemana} 
            title="Recalcular todos los vales emitidos a la dotación reglamentaria de 7 días (50 L/hab/día × 7d = 350 L/hab)"
            style={{ padding: '8px 14px', fontSize: 13, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            🔄 Sincronizar Dotación ({configSistema.dotacion_diaria_litros * configSistema.dias_entrega_semanal} L/sem)
          </button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Cargando vales de consumo...</div>
          ) : vales.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No se encontraron vales con los filtros seleccionados.</div>
          ) : (
            <>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '12px 16px' }}>SERIE Y CORRELATIVO</th>
                    <th style={{ padding: '12px 16px' }}>BENEFICIARIO (PUB)</th>
                    <th style={{ padding: '12px 16px' }}>SECTOR</th>
                    <th style={{ padding: '12px 16px' }}>DOTACIÓN SEMANAL</th>
                    <th style={{ padding: '12px 16px' }}>PROGRAMACIÓN</th>
                    <th style={{ padding: '12px 16px' }}>ESTADO</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVales.map((v) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0284c7', background: '#f0f9ff', padding: '2px 6px', borderRadius: 4 }}>
                          {v.codigo_unico}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{v.beneficiario_nombre || 'Beneficiario no asignado'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          DNI: {v.beneficiario_dni || 'S/N'} • 👥 {v.num_miembros || 1} hab.
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569' }}>
                        {v.sector || 'Moyobamba'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <strong style={{ color: '#0284c7' }}>{Number(v.litros_sugeridos).toLocaleString('es-PE')} Lts</strong>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>{v.num_miembros || 1} hab. × 350 L/sem</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                        {v.programacion_fecha ? new Date(v.programacion_fecha).toLocaleDateString('es-PE') : 'Programación Genérica'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {getEstadoBadge(v.estado)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button 
                            onClick={() => imprimirValeTicket(v)}
                            title="Imprimir Ticket de Vale con QR"
                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                          >
                            🖨️ Imprimir
                          </button>
                          {!['ENTREGADO', 'CANJEADO', 'ANULADO'].includes((v.estado || '').toUpperCase()) && (
                            <button 
                              onClick={() => handleCambiarEstado(v.id, 'ANULADO')}
                              title="Anular Vale"
                              style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* PAGINATION */}
              <Pagination
                currentPage={currentPage}
                totalItems={vales.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[5, 10, 20, 50, 100, 200]}
              />
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
