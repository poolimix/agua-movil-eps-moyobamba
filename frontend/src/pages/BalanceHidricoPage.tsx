import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api, { API_BASE_URL } from '../config/api';
import './BalanceHidricoPage.css';

interface BalanceCisterna {
  cisterna_id: number;
  placa: string;
  capacidad_m3: number;
  viajes_totales: number;
  total_cargado_litros: number;
  total_cargado_m3: number;
  total_entregado_litros: number;
  total_entregado_m3: number;
  total_actas: number;
  diferencial_litros: number;
  diferencial_m3: number;
  porcentaje_merma: number;
  estado_tecnico: 'OPTIMO' | 'ACEPTABLE' | 'ALERTA';
}

interface BalanceProgramacion {
  programacion_id: number;
  fecha: string;
  ruta_sector: string;
  estado_programacion: string;
  viajes_realizados: number;
  cisterna_placa: string;
  capacidad_m3: number;
  conductor_nombre: string;
  volumen_cargado_litros: number;
  volumen_cargado_m3: number;
  volumen_entregado_litros: number;
  volumen_entregado_m3: number;
  diferencial_litros: number;
  diferencial_m3: number;
  porcentaje_merma: number;
  estado_tecnico: 'OPTIMO' | 'ACEPTABLE' | 'ALERTA' | 'SOBRE_DESPACHO';
  total_entregas_actas: number;
}

export default function BalanceHidricoPage() {
  const [fechaInicio, setFechaInicio] = useState('2026-08-01');
  const [fechaFin, setFechaFin] = useState('2026-09-30');
  const [cisternaId, setCisternaId] = useState('');
  const [cisternasList, setCisternasList] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCisternas();
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fechaInicio, fechaFin, cisternaId]);

  const fetchCisternas = async () => {
    try {
      const res = await api.get('/cisternas');
      setCisternasList(res.data);
    } catch (err) {
      console.error('Error cargando cisternas:', err);
    }
  };

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fechaInicio) params.append('fecha_inicio', fechaInicio);
      if (fechaFin) params.append('fecha_fin', fechaFin);
      if (cisternaId) params.append('cisterna_id', cisternaId);

      const res = await api.get(`/balance?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error('Error cargando balance hídrico:', err);
    } finally {
      setLoading(false);
    }
  };

  const resumen = data?.resumenGlobal || {
    total_volumen_cargado_litros: 0,
    total_volumen_cargado_m3: 0,
    total_volumen_entregado_litros: 0,
    total_volumen_entregado_m3: 0,
    diferencial_merma_litros: 0,
    diferencial_merma_m3: 0,
    porcentaje_merma_global: 0,
    estado_balance: 'OPTIMO',
    tolerancia_normativa_pct: 5.0,
    total_rutas_evaluadas: 0,
  };

  const balanceCisternas: BalanceCisterna[] = data?.balancePorCisterna || [];
  const balanceRutas: BalanceProgramacion[] = data?.balancePorProgramacion || [];

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'OPTIMO':
        return <span className="merma-tag tag-optimo">🟢 ÓPTIMO (&le; 3%)</span>;
      case 'ACEPTABLE':
        return <span className="merma-tag tag-aceptable">🟡 TOLERABLE (3-8%)</span>;
      case 'ALERTA':
        return <span className="merma-tag tag-alerta">🔴 ALERTA MERMA (&gt; 8%)</span>;
      default:
        return <span className="merma-tag tag-optimo">🟢 CONFORME</span>;
    }
  };

  return (
    <Layout>
      <div className="balance-page-container">
        {/* Cabecera Principal */}
        <header className="balance-header">
          <div className="balance-title-block">
            <div className="balance-badge-top">
              <span className="badge-pns">CONCILIACIÓN FÍSICA Y AUDITORÍA DE AGUA NO CONTABILIZADA</span>
              <span className="badge-eps">EPS MOYOBAMBA S.A.</span>
            </div>
            <h1 className="balance-title">⚖️ Balance de Masa Hídrica</h1>
            <p className="balance-subtitle">
              Conciliación matemática entre agua cargada en surtidor/planta y volumen fiscalizado entregado en actas de campo.
            </p>
          </div>

          <div className="balance-controls">
            <div className="date-inputs-group">
              <div className="date-field">
                <label>Desde:</label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="input-date"
                />
              </div>
              <div className="date-field">
                <label>Hasta:</label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="input-date"
                />
              </div>
              <div className="date-field">
                <label>Cisterna:</label>
                <select
                  value={cisternaId}
                  onChange={(e) => setCisternaId(e.target.value)}
                  className="select-cisterna"
                >
                  <option value="">Todas las unidades</option>
                  {cisternasList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.placa} ({c.capacidad_m3} m³)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="action-btns">
              <a
                href={`${API_BASE_URL}/api/v1/balance/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pdf-acta"
                title="Descargar Acta Técnica de Conciliación en PDF"
              >
                📄 Descargar Acta PDF
              </a>
              <button type="button" className="btn-print" onClick={() => window.print()}>
                🖨️ Imprimir
              </button>
              <button type="button" className="btn-refresh" onClick={fetchBalance}>
                🔄
              </button>
            </div>
          </div>
        </header>

        {/* Tarjetas KPI de Balance */}
        <section className="balance-kpi-grid">
          <div className="bal-card card-cargado">
            <div className="bal-icon">🚰</div>
            <div className="bal-info">
              <span className="bal-label">Volumen Cargado en Surtidor</span>
              <div className="bal-value font-mono">
                {resumen.total_volumen_cargado_m3.toLocaleString('es-PE')} <span className="unit">m³</span>
              </div>
              <span className="bal-sub font-mono">
                {resumen.total_volumen_cargado_litros.toLocaleString('es-PE')} Litros
              </span>
            </div>
          </div>

          <div className="bal-card card-entregado">
            <div className="bal-icon">✅</div>
            <div className="bal-info">
              <span className="bal-label">Volumen Entregado Fiscalizado</span>
              <div className="bal-value font-mono">
                {resumen.total_volumen_entregado_m3.toLocaleString('es-PE')} <span className="unit">m³</span>
              </div>
              <span className="bal-sub font-mono">
                {resumen.total_volumen_entregado_litros.toLocaleString('es-PE')} Litros
              </span>
            </div>
          </div>

          <div className="bal-card card-diferencial">
            <div className="bal-icon">📉</div>
            <div className="bal-info">
              <span className="bal-label">Diferencial / Merma en Ruta</span>
              <div className="bal-value font-mono">
                {resumen.diferencial_merma_m3.toLocaleString('es-PE')} <span className="unit">m³</span>
              </div>
              <span className="bal-sub font-mono">
                {resumen.diferencial_merma_litros.toLocaleString('es-PE')} Litros
              </span>
            </div>
          </div>

          <div className="bal-card card-eficiencia">
            <div className="bal-icon">🎯</div>
            <div className="bal-info">
              <span className="bal-label">Índice de Pérdida Técnica</span>
              <div className="bal-value font-mono">
                {resumen.porcentaje_merma_global}%
              </div>
              <div className="bal-sub">
                {getStatusBadge(resumen.estado_balance)}
              </div>
            </div>
          </div>
        </section>

        {/* Sección 1: Conciliación por Camión Cisterna */}
        <section className="balance-section-card">
          <div className="section-card-header">
            <div>
              <h3>Conciliación de Balance por Camión Cisterna</h3>
              <p>Comportamiento individual de cada unidad vehicular y su merma operativa acumulada</p>
            </div>
            <span className="count-pill">{balanceCisternas.length} cisternas evaluadas</span>
          </div>

          <div className="table-responsive">
            <table className="bal-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Placa / Unidad</th>
                  <th>Capacidad Nominal</th>
                  <th>Viajes Realizados</th>
                  <th>Volumen Cargado</th>
                  <th>Volumen Entregado</th>
                  <th>Diferencial (m³)</th>
                  <th>% Merma</th>
                  <th>Evaluación Técnica</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center">Cargando balance de flota...</td>
                  </tr>
                ) : balanceCisternas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center">No hay registros de balance para este filtro</td>
                  </tr>
                ) : (
                  balanceCisternas.map((c, idx) => (
                    <tr key={c.cisterna_id}>
                      <td>{idx + 1}</td>
                      <td><strong>🚛 {c.placa}</strong></td>
                      <td className="font-mono">{c.capacidad_m3} m³</td>
                      <td className="font-mono font-bold">{c.viajes_totales}</td>
                      <td className="font-mono">{c.total_cargado_m3} m³ ({c.total_cargado_litros.toLocaleString('es-PE')} L)</td>
                      <td className="font-mono font-bold text-cyan">{c.total_entregado_m3} m³ ({c.total_entregado_litros.toLocaleString('es-PE')} L)</td>
                      <td className="font-mono">{c.diferencial_m3} m³</td>
                      <td className="font-mono font-bold">{c.porcentaje_merma}%</td>
                      <td>{getStatusBadge(c.estado_tecnico)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sección 2: Detalle por Ruta y Programación */}
        <section className="balance-section-card">
          <div className="section-card-header">
            <div>
              <h3>Auditoría de Balance por Ruta y Programación</h3>
              <p>Trazabilidad viaje por viaje entre carga en surtidor y firmas en actas de entrega</p>
            </div>
            <span className="count-pill">{balanceRutas.length} rutas programadas</span>
          </div>

          <div className="table-responsive">
            <table className="bal-table">
              <thead>
                <tr>
                  <th>Prog. ID</th>
                  <th>Fecha</th>
                  <th>Ruta / Sectores</th>
                  <th>Cisterna</th>
                  <th>Chofer</th>
                  <th>Viajes</th>
                  <th>Cargado (L)</th>
                  <th>Entregado (L)</th>
                  <th>Diferencial (L)</th>
                  <th>% Merma</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="text-center">Calculando balances de rutas...</td>
                  </tr>
                ) : balanceRutas.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center">No hay rutas programadas en el periodo seleccionado</td>
                  </tr>
                ) : (
                  balanceRutas.map((r) => (
                    <tr key={r.programacion_id}>
                      <td><strong>#{r.programacion_id}</strong></td>
                      <td className="font-mono">{r.fecha}</td>
                      <td><strong>📍 {r.ruta_sector}</strong></td>
                      <td>🚛 {r.cisterna_placa}</td>
                      <td>{r.conductor_nombre || 'No asignado'}</td>
                      <td className="font-mono text-center">{r.viajes_realizados}</td>
                      <td className="font-mono">{Number(r.volumen_cargado_litros).toLocaleString('es-PE')} L</td>
                      <td className="font-mono font-bold text-cyan">{Number(r.volumen_entregado_litros).toLocaleString('es-PE')} L</td>
                      <td className="font-mono">{Number(r.diferencial_litros).toLocaleString('es-PE')} L</td>
                      <td className="font-mono font-bold">{r.porcentaje_merma}%</td>
                      <td>{getStatusBadge(r.estado_tecnico)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
