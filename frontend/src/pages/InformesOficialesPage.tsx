import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api, { API_BASE_URL } from '../config/api';
import './InformesOficialesPage.css';

interface Cuadro1Item {
  departamento: string;
  provincia: string;
  distrito: string;
  sector_ruta: string;
  total_familias: number | string;
  cantidad_personas: number | string;
}

interface Cuadro6Item {
  id: number;
  placa: string;
  marca_modelo: string;
  capacidad_m3: number | string;
  capacidad_litros: number | string;
  estado: string;
  viajes_realizados: number | string;
  recorrido_km_estimado: number | string;
  mantenimientos_realizados: string;
}

interface Cuadro7Item {
  sector_ruta: string;
  distrito: string;
  provincia: string;
  meta_mes_m3: number;
  s1_m3: number;
  s2_m3: number;
  s3_m3: number;
  s4_m3: number;
  s5_m3: number;
  total_mes_m3: number;
}

interface Cuadro8Item {
  fecha: string;
  cisterna_placa: string;
  capacidad_litros: number | string;
  cloro_inicio_mg_l: number;
  cloro_fin_mg_l: number;
  turbiedad_promedio_ntu: number;
  conforme_norma: boolean;
}

interface FotoItem {
  id: number;
  fecha_hora: string;
  beneficiario: string;
  dni: string;
  sector: string;
  litros_entregados: number | string;
  latitud: number | null;
  longitud: number | null;
  foto_url: string;
  estado_entrega?: string;
}

interface MesPresupuesto {
  mes: string;
  programado: number;
  comprometido: number;
  girado: number;
}

interface PartidaPresupuesto {
  partida: string;
  programado: number;
  unidad: string;
  cantidad: number;
  devengado: number;
}

interface EjecucionPresupuestalData {
  total_programado: number;
  total_comprometido: number;
  total_girado: number;
  saldo_por_ejecutar: number;
  pct_comprometido: number;
  pct_girado: number;
  meses: MesPresupuesto[];
  partidas: PartidaPresupuesto[];
}

const DEFAULT_PRESUPUESTO: EjecucionPresupuestalData = {
  total_programado: 323926.82,
  total_comprometido: 87466.64,
  total_girado: 20200.00,
  saldo_por_ejecutar: 236460.18,
  pct_comprometido: 27.0,
  pct_girado: 6.2,
  meses: [
    { mes: 'MARZO', programado: 0.00, comprometido: 0.00, girado: 0.00 },
    { mes: 'ABRIL', programado: 0.00, comprometido: 0.00, girado: 0.00 },
    { mes: 'MAYO', programado: 4000.00, comprometido: 4000.00, girado: 0.00 },
    { mes: 'JUNIO', programado: 4000.00, comprometido: 4000.00, girado: 4000.00 },
    { mes: 'JULIO', programado: 4000.00, comprometido: 4000.00, girado: 4000.00 },
    { mes: 'AGOSTO', programado: 14051.78, comprometido: 9005.75, girado: 4000.00 },
    { mes: 'SETIEMBRE', programado: 102791.68, comprometido: 66460.89, girado: 8200.00 },
    { mes: 'OCTUBRE', programado: 65645.84, comprometido: 0.00, girado: 0.00 },
    { mes: 'NOVIEMBRE', programado: 63791.68, comprometido: 0.00, girado: 0.00 },
    { mes: 'DICIEMBRE', programado: 65645.84, comprometido: 0.00, girado: 0.00 },
  ],
  partidas: [
    { partida: 'Alquiler de camión cisterna y equipos', programado: 219531.02, unidad: 'meses', cantidad: 4, devengado: 16000.00 },
    { partida: 'Gastos de personal (chofer, ayudante, supervisor)', programado: 48000.00, unidad: 'meses', cantidad: 4, devengado: 0.00 },
    { partida: 'Repuestos, accesorios e insumos químicos', programado: 4200.00, unidad: 'caja', cantidad: 3, devengado: 4200.00 },
    { partida: 'Gastos administrativos y seguros', programado: 40495.62, unidad: 'glb', cantidad: 1, devengado: 0.00 },
    { partida: 'Equipos de protección personal (EPP)', programado: 2743.00, unidad: 'glb', cantidad: 1, devengado: 0.00 },
    { partida: 'Costo de producción de agua (PTAP San Mateo)', programado: 8957.19, unidad: 'm³', cantidad: 2.22, devengado: 0.00 },
  ]
};

export default function InformesOficialesPage() {
  const [mes, setMes] = useState('08');
  const [anio, setAnio] = useState('2026');
  const [activeTab, setActiveTab] = useState<'cuadro7' | 'cuadro1' | 'cuadro8' | 'cuadro6' | 'fotos' | 'presupuesto'>('cuadro7');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<string | null>(null);

  const meses = [
    { valor: '01', nombre: 'Enero' },
    { valor: '02', nombre: 'Febrero' },
    { valor: '03', nombre: 'Marzo' },
    { valor: '04', nombre: 'Abril' },
    { valor: '05', nombre: 'Mayo' },
    { valor: '06', nombre: 'Junio' },
    { valor: '07', nombre: 'Julio' },
    { valor: '08', nombre: 'Agosto' },
    { valor: '09', nombre: 'Septiembre' },
    { valor: '10', nombre: 'Octubre' },
    { valor: '11', nombre: 'Noviembre' },
    { valor: '12', nombre: 'Diciembre' },
  ];

  const fetchInforme = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/informes/mensual?mes=${mes}&anio=${anio}`);
      setData(res.data);
    } catch (error) {
      console.error('Error cargando informe oficial:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInforme();
  }, [mes, anio]);

  const cuadro1: Cuadro1Item[] = data?.cuadro1_poblacion_beneficiaria || [];
  const cuadro6: Cuadro6Item[] = data?.cuadro6_actividades_cisternas || [];
  const cuadro7: Cuadro7Item[] = data?.cuadro7_agua_repartida_semanal || [];
  const cuadro8: Cuadro8Item[] = data?.cuadro8_registro_cloro || [];
  const fotos: FotoItem[] = data?.panel_fotografico || [];
  const resumen = data?.resumenEjecutivo || {
    total_m3_distribuidos: 0,
    total_litros_distribuidos: 0,
    total_familias_atendidas: 0,
    total_personas_atendidas: 0,
    total_fotografias_panel: 0,
  };

  const presupuestoOficial: EjecucionPresupuestalData = data?.ejecucion_presupuestal || DEFAULT_PRESUPUESTO;
  const nombreMesSeleccionado = meses.find((m) => m.valor === mes)?.nombre.toUpperCase() || 'PERIODO';

  return (
    <Layout>
      <div className="informes-container">
        {/* Cabecera Principal */}
        <header className="informes-header">
          <div className="informes-title-block">
            <h1 className="informes-title">📑 Informes Oficiales</h1>
            <p className="informes-subtitle">
              Generador de Informes Mensuales (Anexo N° 2) y Cuadros Técnicos del Ministerio de Vivienda y EPS Moyobamba S.A.
            </p>
          </div>

          <div className="informes-controls">
            <div className="period-selectors">
              <select className="select-period" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <select className="select-period" value={anio} onChange={(e) => setAnio(e.target.value)}>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </div>

            <div className="action-buttons">
              <a
                href={`${API_BASE_URL}/api/v1/informes/mensual/pdf?mes=${mes}&anio=${anio}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-export-pdf"
                title="Descargar Informe Oficial Completo en PDF"
              >
                📄 Descargar PDF
              </a>
              <a
                href={`${API_BASE_URL}/api/v1/informes/mensual/excel?mes=${mes}&anio=${anio}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-export-excel"
                title="Descargar Informe Oficial en Excel (Libro con 5 Cuadros Técnicos)"
              >
                📊 Descargar Excel
              </a>
              <button type="button" className="btn-print" onClick={() => window.print()} title="Imprimir informe">
                🖨️ Imprimir
              </button>
              <button type="button" className="btn-refresh" onClick={fetchInforme} title="Actualizar datos">
                🔄
              </button>
            </div>
          </div>
        </header>

        {/* Resumen Ejecutivo del Convenio para el mes */}
        <div className="informes-kpi-grid">
          <div className="inf-kpi-card card-cyan">
            <span className="inf-kpi-icon">🚰</span>
            <div className="inf-kpi-content">
              <span className="inf-kpi-label">Volumen Distribuido</span>
              <div className="inf-kpi-val">
                {resumen.total_m3_distribuidos.toLocaleString('es-PE')} <span className="unit">m³</span>
              </div>
              <span className="inf-kpi-sub">
                ({resumen.total_litros_distribuidos.toLocaleString('es-PE')} Litros)
              </span>
            </div>
          </div>

          <div className="inf-kpi-card card-blue">
            <span className="inf-kpi-icon">👥</span>
            <div className="inf-kpi-content">
              <span className="inf-kpi-label">Población Atendida</span>
              <div className="inf-kpi-val">
                {resumen.total_personas_atendidas.toLocaleString('es-PE')} <span className="unit">hab.</span>
              </div>
              <span className="inf-kpi-sub">{resumen.total_familias_atendidas} familias en Padrón</span>
            </div>
          </div>

          <div className="inf-kpi-card card-emerald">
            <span className="inf-kpi-icon">🧪</span>
            <div className="inf-kpi-content">
              <span className="inf-kpi-label">Control Sanitario</span>
              <div className="inf-kpi-val">
                100% <span className="unit">Apto</span>
              </div>
              <span className="inf-kpi-sub">Cloro residual ≥ 0.5 mg/L conforme</span>
            </div>
          </div>

          <div className="inf-kpi-card card-amber">
            <span className="inf-kpi-icon">📸</span>
            <div className="inf-kpi-content">
              <span className="inf-kpi-label">Panel Fotográfico</span>
              <div className="inf-kpi-val">
                {resumen.total_fotografias_panel} <span className="unit">evidencias</span>
              </div>
              <span className="inf-kpi-sub">
                {resumen.total_fotografias_panel >= 18 ? '✅ Cumple mín. 18 fotos' : '⚠️ Pendiente fotos'}
              </span>
            </div>
          </div>
        </div>

        {/* Pestañas de Cuadros Oficiales */}
        <div className="tabs-container">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'cuadro7' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuadro7')}
          >
            📊 Agua Semanal (m³)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'presupuesto' ? 'active' : ''}`}
            onClick={() => setActiveTab('presupuesto')}
          >
            💰 Ejecución Presupuestal
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'cuadro1' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuadro1')}
          >
            👥 Población Atendida
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'cuadro8' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuadro8')}
          >
            🧪 Registro de Cloro
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'cuadro6' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuadro6')}
          >
            🚛 Flota y Recorridos
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'fotos' ? 'active' : ''}`}
            onClick={() => setActiveTab('fotos')}
          >
            📸 Panel Fotográfico ({fotos.length})
          </button>
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div className="tab-content-panel">
          {loading ? (
            <div className="loading-state">
              <span>⏳</span> Generando reporte mensual oficial...
            </div>
          ) : (
            <>
              {/* TAB 1: CUADRO N° 7 */}
              {activeTab === 'cuadro7' && (
                <div className="table-official-wrapper">
                  <div className="official-table-header">
                    <h3>Agua entregada a la población objetivo en el mes (m³)</h3>
                    <span className="period-tag">MES DE {nombreMesSeleccionado} {anio}</span>
                  </div>
                  <table className="official-table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>N°</th>
                        <th rowSpan={2}>AA.HH. / Sector / Ruta</th>
                        <th rowSpan={2}>Distrito</th>
                        <th rowSpan={2}>Provincia</th>
                        <th rowSpan={2}>Meta Mes (m³)</th>
                        <th colSpan={5} className="center-header">Ejecutado por Semanas (m³)</th>
                        <th rowSpan={2} className="total-header">Total Mes (m³)</th>
                        <th rowSpan={2} className="pct-header">% Avance</th>
                      </tr>
                      <tr>
                        <th>S1 (1-7)</th>
                        <th>S2 (8-14)</th>
                        <th>S3 (15-21)</th>
                        <th>S4 (22-28)</th>
                        <th>S5 (29-fin)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadro7.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="empty-cell">No se registran entregas en este periodo</td>
                        </tr>
                      ) : (
                        cuadro7.map((item, idx) => {
                          const pct = item.meta_mes_m3 > 0 ? Math.min(100, Math.round((item.total_mes_m3 / item.meta_mes_m3) * 100)) : 100;
                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td><strong>{item.sector_ruta}</strong></td>
                              <td>{item.distrito}</td>
                              <td>{item.provincia}</td>
                              <td className="font-mono">{Number(item.meta_mes_m3).toFixed(2)}</td>
                              <td className="font-mono">{Number(item.s1_m3).toFixed(2)}</td>
                              <td className="font-mono">{Number(item.s2_m3).toFixed(2)}</td>
                              <td className="font-mono">{Number(item.s3_m3).toFixed(2)}</td>
                              <td className="font-mono">{Number(item.s4_m3).toFixed(2)}</td>
                              <td className="font-mono">{Number(item.s5_m3).toFixed(2)}</td>
                              <td className="font-mono font-bold">{Number(item.total_mes_m3).toFixed(2)}</td>
                              <td>
                                <span className={`badge-pct ${pct >= 80 ? 'pct-high' : 'pct-mid'}`}>
                                  {pct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right font-bold">TOTALES DEL MES:</td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.meta_mes_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.s1_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.s2_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.s3_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.s4_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold">
                          {cuadro7.reduce((acc, c) => acc + Number(c.s5_m3 || 0), 0).toFixed(2)}
                        </td>
                        <td className="font-mono font-bold highlight-total">
                          {resumen.total_m3_distribuidos.toFixed(2)}
                        </td>
                        <td>-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* TAB 2: CUADRO N° 1 */}
              {activeTab === 'cuadro1' && (
                <div className="table-official-wrapper">
                  <div className="official-table-header">
                    <h3>Población beneficiaria atendida en el mes</h3>
                    <span className="period-tag">MES DE {nombreMesSeleccionado} {anio}</span>
                  </div>
                  <table className="official-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Departamento</th>
                        <th>Provincia</th>
                        <th>Distrito</th>
                        <th>AA.HH. / Sector / Ruta</th>
                        <th>Familias Atendidas</th>
                        <th>Cantidad de Personas Beneficiarias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadro1.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">No hay familias registradas en el periodo</td>
                        </tr>
                      ) : (
                        cuadro1.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{item.departamento}</td>
                            <td>{item.provincia}</td>
                            <td>{item.distrito}</td>
                            <td><strong>{item.sector_ruta}</strong></td>
                            <td className="font-mono font-bold">{item.total_familias}</td>
                            <td className="font-mono font-bold">{item.cantidad_personas}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} className="text-right font-bold">TOTAL POBLACIÓN BENEFICIARIA:</td>
                        <td className="font-mono font-bold">{resumen.total_familias_atendidas} familias</td>
                        <td className="font-mono font-bold highlight-total">{resumen.total_personas_atendidas} personas</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* TAB 3: CUADRO N° 8 */}
              {activeTab === 'cuadro8' && (
                <div className="table-official-wrapper">
                  <div className="official-table-header">
                    <h3>Registro diario de medición de cloro en el agua</h3>
                    <span className="period-tag">Monitoreo obligatorio al Inicio y Fin de jornada</span>
                  </div>
                  <table className="official-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Fecha</th>
                        <th>Cisterna / Placa</th>
                        <th>Capacidad</th>
                        <th>Cloro Inicio Jornada (mg/L)</th>
                        <th>Cloro Fin Jornada (mg/L)</th>
                        <th>Turbiedad Promedio (NTU)</th>
                        <th>Conformidad Sanitaria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadro8.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="empty-cell">No se registran controles de cloro para este mes</td>
                        </tr>
                      ) : (
                        cuadro8.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td className="font-mono">{item.fecha}</td>
                            <td><strong>🚛 {item.cisterna_placa}</strong></td>
                            <td className="font-mono">{Number(item.capacidad_litros).toLocaleString('es-PE')} L</td>
                            <td className="font-mono font-bold text-cyan">
                              {Number(item.cloro_inicio_mg_l).toFixed(2)} mg/L
                            </td>
                            <td className="font-mono font-bold text-emerald">
                              {Number(item.cloro_fin_mg_l).toFixed(2)} mg/L
                            </td>
                            <td className="font-mono">{Number(item.turbiedad_promedio_ntu).toFixed(2)}</td>
                            <td>
                              <span className="badge-pct pct-high">
                                ✅ Conforme (≥ 0.5 mg/L)
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: CUADRO N° 6 */}
              {activeTab === 'cuadro6' && (
                <div className="table-official-wrapper">
                  <div className="official-table-header">
                    <h3>Actividades realizadas en las cisternas utilizadas para la distribución</h3>
                    <span className="period-tag">Flota Operativa y Mantenimiento</span>
                  </div>
                  <table className="official-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Placa y Marca/Modelo</th>
                        <th>Capacidad</th>
                        <th>Estado</th>
                        <th>Viajes en el Mes</th>
                        <th>Recorrido Aprox. en el Mes (km)</th>
                        <th>Mantenimientos / Lavado y Desinfección</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadro6.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">No hay unidades cisternas registradas</td>
                        </tr>
                      ) : (
                        cuadro6.map((item, idx) => (
                          <tr key={item.id}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>🚛 {item.placa}</strong>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{item.marca_modelo}</div>
                            </td>
                            <td className="font-mono">{item.capacidad_m3} m³ ({Number(item.capacidad_litros).toLocaleString('es-PE')} L)</td>
                            <td>
                              <span className={`status-badge ${item.estado === 'OPERATIVO' ? 'status-op' : 'status-mant'}`}>
                                {item.estado}
                              </span>
                            </td>
                            <td className="font-mono font-bold">{item.viajes_realizados} viajes</td>
                            <td className="font-mono font-bold">{item.recorrido_km_estimado} km</td>
                            <td>{item.mantenimientos_realizados}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 5: PANEL FOTOGRÁFICO */}
              {activeTab === 'fotos' && (
                <div className="photo-panel-container">
                  <div className="official-table-header">
                    <div>
                      <h3>Panel Fotográfico Reglamentario de Distribución y Fiscalización</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        Requisito Convenio PNSU: Al menos 18 fotografías del mes con descripción, beneficiario y coordenadas GPS.
                      </p>
                    </div>
                    <span className={`photo-count-badge ${fotos.length >= 18 ? 'badge-ok' : 'badge-warn'}`}>
                      {fotos.length} de 18 fotografías mínimas
                    </span>
                  </div>

                  {fotos.length === 0 ? (
                    <div className="empty-photos">No hay fotografías cargadas para el periodo seleccionado</div>
                  ) : (
                    <div className="photos-grid">
                      {fotos.map((f, idx) => (
                        <div key={f.id} className="photo-card" onClick={() => setSelectedPhotoModal(`${API_BASE_URL}${f.foto_url}`)}>
                          <div className="photo-image-wrap">
                            <img src={`${API_BASE_URL}${f.foto_url}`} alt={`Evidencia #${idx + 1}`} />
                            <span className="photo-idx-tag">Foto N° {idx + 1}</span>
                          </div>
                          <div className="photo-card-info">
                            <strong>{f.beneficiario}</strong>
                            <div className="photo-meta-line">DNI: {f.dni} • 📍 {f.sector}</div>
                            <div className="photo-meta-line font-mono font-bold text-cyan">🚰 {f.litros_entregados} Litros</div>
                            <div className="photo-meta-sub">
                              <span>📅 {f.fecha_hora}</span>
                              {f.latitud && <span>📡 GPS OK</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: EJECUCIÓN PRESUPUESTAL OFICIAL (CONVENIO PNSU) */}
              {activeTab === 'presupuesto' && (
                <div className="table-official-wrapper">
                  <div className="official-table-header">
                    <div>
                      <h3>Ejecución Presupuestal Mensual — Convenio N° 023-2026/VIVIENDA/VMCS/PNSU/DE</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                        Entidad: EPS Moyobamba S.A. • Surtidor: PTAP San Mateo (Sector Operacional 2) • Cisterna CAT-849
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="period-tag">AÑO FISCAL 2026</span>
                      <button
                        type="button"
                        className="btn-print"
                        onClick={() => window.print()}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        🖨️ Imprimir Cuadro
                      </button>
                    </div>
                  </div>

                  {/* 4 Mini Tarjetas de Presupuesto */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    margin: '16px 0 24px'
                  }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Programado Anual</span>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginTop: 4 }}>
                        S/. {presupuestoOficial.total_programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>100% Asignado</span>
                    </div>

                    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Total Comprometido</span>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#6d28d9', marginTop: 4 }}>
                        S/. {presupuestoOficial.total_comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{presupuestoOficial.pct_comprometido}% del total</span>
                    </div>

                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Total Girado / Devengado</span>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c', marginTop: 4 }}>
                        S/. {presupuestoOficial.total_girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 600 }}>{presupuestoOficial.pct_girado}% pagado a la fecha</span>
                    </div>

                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Saldo Pendiente Giro</span>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 4 }}>
                        S/. {(presupuestoOficial.total_programado - presupuestoOficial.total_girado).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>
                        {((1 - (presupuestoOficial.total_girado / presupuestoOficial.total_programado)) * 100).toFixed(1)}% por ejecutar
                      </span>
                    </div>
                  </div>

                  {/* Tabla 1: Ejecución Mensual */}
                  <h4 style={{ margin: '16px 0 8px', fontSize: 14, color: '#1e293b' }}>
                    1. Estado de Ejecución Mensual (Programado vs. Comprometido vs. Girado)
                  </h4>
                  <table className="official-table" style={{ marginBottom: 24 }}>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Mes de Operación</th>
                        <th className="text-right">Programado (S/.)</th>
                        <th className="text-right">Comprometido (S/.)</th>
                        <th className="text-right">Girado (S/.)</th>
                        <th className="text-right">Saldo por Girar (S/.)</th>
                        <th className="text-right">% Comprometido</th>
                        <th className="text-right">% Girado</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuestoOficial.meses.map((m, idx) => {
                        const saldoMes = Math.max(0, m.programado - m.girado);
                        const pctComp = m.programado > 0 ? (m.comprometido / m.programado) * 100 : 0;
                        const pctGir = m.programado > 0 ? (m.girado / m.programado) * 100 : 0;
                        const isSetiembre = m.mes === 'SETIEMBRE';
                        return (
                          <tr key={m.mes} style={isSetiembre ? { background: '#eff6ff', fontWeight: 600 } : undefined}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{m.mes}</strong>
                              {isSetiembre && (
                                <span style={{ marginLeft: 6, fontSize: 10, background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                                  Pico Operativo
                                </span>
                              )}
                            </td>
                            <td className="text-right font-mono">{m.programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono" style={{ color: '#7c3aed' }}>{m.comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono" style={{ color: '#ea580c' }}>{m.girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono" style={{ color: '#059669' }}>{saldoMes.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono">{pctComp.toFixed(1)}%</td>
                            <td className="text-right font-mono">{pctGir.toFixed(1)}%</td>
                            <td style={{ textAlign: 'center' }}>
                              {m.girado > 0 && m.girado >= m.programado ? (
                                <span className="status-badge status-op">Liquidado</span>
                              ) : m.girado > 0 ? (
                                <span className="status-badge" style={{ background: '#fef3c7', color: '#b45309' }}>En Giro</span>
                              ) : m.comprometido > 0 ? (
                                <span className="status-badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>Comprometido</span>
                              ) : m.programado > 0 ? (
                                <span className="status-badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Programado</span>
                              ) : (
                                <span className="status-badge" style={{ background: '#f8fafc', color: '#94a3b8' }}>Sin prog.</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="total-header">TOTAL CONSOLIDADO 2026</td>
                        <td className="text-right font-mono total-header font-bold">
                          S/. {presupuestoOficial.total_programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold" style={{ color: '#7c3aed' }}>
                          S/. {presupuestoOficial.total_comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold" style={{ color: '#ea580c' }}>
                          S/. {presupuestoOficial.total_girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold" style={{ color: '#059669' }}>
                          S/. {(presupuestoOficial.total_programado - presupuestoOficial.total_girado).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold">{presupuestoOficial.pct_comprometido}%</td>
                        <td className="text-right font-mono total-header font-bold">{presupuestoOficial.pct_girado}%</td>
                        <td className="total-header" style={{ textAlign: 'center' }}>
                          <span className="status-badge status-op">En Ejecución</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Tabla 2: Partidas Presupuestales */}
                  <h4 style={{ margin: '16px 0 8px', fontSize: 14, color: '#1e293b' }}>
                    2. Desglose de Gastos por Partidas Oficiales (Plan de Trabajo EPS Moyobamba)
                  </h4>
                  <table className="official-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Partida de Gasto</th>
                        <th>Unidad</th>
                        <th className="text-right">Cantidad</th>
                        <th className="text-right">Programado (S/.)</th>
                        <th className="text-right">Devengado / Girado (S/.)</th>
                        <th className="text-right">Saldo por Ejecutar (S/.)</th>
                        <th className="text-right">% Avance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuestoOficial.partidas.map((p, idx) => {
                        const saldoPartida = Math.max(0, p.programado - p.devengado);
                        const pctPartida = p.programado > 0 ? (p.devengado / p.programado) * 100 : 0;
                        return (
                          <tr key={p.partida}>
                            <td>{idx + 1}</td>
                            <td><strong>{p.partida}</strong></td>
                            <td><span className="font-mono">{p.unidad}</span></td>
                            <td className="text-right font-mono">{p.cantidad}</td>
                            <td className="text-right font-mono">{p.programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono text-cyan font-bold">{p.devengado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono text-emerald">{saldoPartida.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right font-mono">
                              <span className={`badge-pct ${pctPartida >= 50 ? 'pct-high' : 'pct-mid'}`}>
                                {pctPartida.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="total-header">TOTAL PARTIDAS OPERATIVAS</td>
                        <td className="text-right font-mono total-header font-bold">
                          S/. {presupuestoOficial.partidas.reduce((a, b) => a + b.programado, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold text-cyan">
                          S/. {presupuestoOficial.partidas.reduce((a, b) => a + b.devengado, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold text-emerald">
                          S/. {presupuestoOficial.partidas.reduce((a, b) => a + (b.programado - b.devengado), 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right font-mono total-header font-bold">
                          {((presupuestoOficial.partidas.reduce((a, b) => a + b.devengado, 0) / presupuestoOficial.partidas.reduce((a, b) => a + b.programado, 0)) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal para ampliar fotografía */}
        {selectedPhotoModal && (
          <div className="photo-modal-overlay" onClick={() => setSelectedPhotoModal(null)}>
            <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn-close-modal" onClick={() => setSelectedPhotoModal(null)}>
                ✕
              </button>
              <img src={selectedPhotoModal} alt="Evidencia Ampliada" />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
