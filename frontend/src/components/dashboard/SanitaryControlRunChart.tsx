import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';

export interface CalidadItem {
  id: number;
  fecha: string;
  cisterna_placa: string;
  cloro_residual_ppm: number | string;
  turbiedad_ntu: number | string;
  aspecto_organoleptico?: string;
  conforme_sanitario: boolean;
}

interface Props {
  historico: CalidadItem[];
  promedioCloro: number;
  promedioTurbiedad: number;
  pctCumplimiento: number;
  totalConformes: number;
  totalControles: number;
}

// Marcador personalizado para nodos fuera de norma sanitaria
const CustomizedDot = (props: any) => {
  const { cx, cy, payload } = props;
  const val = Number(payload.cloro_residual_ppm);
  const isOutOfRange = val < 0.5 || val > 2.0;

  if (isOutOfRange) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={10} fill="#ef4444" opacity={0.3} className="alert-ping-dot" />
        <circle cx={cx} cy={cy} r={5.5} fill="#dc2626" stroke="#ffffff" strokeWidth={2} />
      </g>
    );
  }

  return (
    <circle cx={cx} cy={cy} r={4.5} fill="#0284c7" stroke="#ffffff" strokeWidth={2} />
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const cloro = Number(data.cloro_residual_ppm);
    const isConforme = cloro >= 0.5 && cloro <= 2.0;

    return (
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: '8px 12px',
        color: '#fff',
        fontSize: 12,
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #1e293b', paddingBottom: 4, marginBottom: 6 }}>
          Fecha: {label} • Cisterna: <span style={{ color: '#38bdf8' }}>{data.cisterna_placa}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <span>Cloro Residual:</span>
          <strong style={{ color: isConforme ? '#4ade80' : '#f87171' }}>
            {cloro.toFixed(2)} ppm
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <span>Turbiedad:</span>
          <span>{Number(data.turbiedad_ntu).toFixed(2)} NTU</span>
        </div>
        <div style={{
          marginTop: 4,
          paddingTop: 4,
          borderTop: '1px solid #1e293b',
          fontSize: 11,
          fontWeight: 700,
          color: isConforme ? '#22c55e' : '#ef4444'
        }}>
          {isConforme ? '✓ Conforme (D.S. 031-2010-SA)' : '⚠️ Fuera de Rango Normativo'}
        </div>
      </div>
    );
  }
  return null;
};

export default function SanitaryControlRunChart({
  historico,
  promedioCloro,
  promedioTurbiedad,
  pctCumplimiento,
  totalConformes,
  totalControles,
}: Props) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const chartData = historico.map((h) => ({
    ...h,
    ppm: Number(h.cloro_residual_ppm),
  }));

  return (
    <div className="sanitary-control-widget">
      {/* Header con métricas compactas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Cloro Prom.</span>
            <strong style={{ fontSize: 14, color: '#0f172a' }}>{promedioCloro} ppm</strong>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Turbiedad</span>
            <strong style={{ fontSize: 14, color: '#0284c7' }}>{promedioTurbiedad} NTU</strong>
          </div>

          <div style={{
            background: pctCumplimiento >= 80 ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${pctCumplimiento >= 80 ? '#a7f3d0' : '#fecaca'}`,
            borderRadius: 10,
            padding: '6px 12px',
            textAlign: 'center'
          }}>
            <span style={{ display: 'block', fontSize: 10, color: pctCumplimiento >= 80 ? '#065f46' : '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Aptitud</span>
            <strong style={{ fontSize: 14, color: pctCumplimiento >= 80 ? '#059669' : '#dc2626' }}>
              {pctCumplimiento}% Apto ({totalConformes}/{totalControles})
            </strong>
          </div>
        </div>

        {/* Toggle gráfica / tabla */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 2, borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'chart' ? '#fff' : 'transparent',
              color: viewMode === 'chart' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'chart' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            📈 Carta de Control
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'table' ? '#fff' : 'transparent',
              color: viewMode === 'table' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            📋 Tabla Ensayos
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div style={{ width: '100%', height: 210 }}>
          {chartData.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
              No hay mediciones registradas en el periodo
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

                <XAxis
                  dataKey="fecha"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                />

                <YAxis
                  domain={[0, 3.5]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  ticks={[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]}
                  tickFormatter={(v) => `${v.toFixed(1)}`}
                />

                <Tooltip content={<CustomTooltip />} />

                {/* Franja Segura Normativa (Verde Translúcido: 0.5 - 2.0 ppm) */}
                <ReferenceArea
                  y1={0.5}
                  y2={2.0}
                  fill="#22c55e"
                  fillOpacity={0.12}
                  stroke="#86efac"
                  strokeDasharray="2 2"
                />

                <ReferenceLine y={0.5} stroke="#16a34a" strokeDasharray="3 3" />
                <ReferenceLine y={2.0} stroke="#16a34a" strokeDasharray="3 3" />

                <Line
                  type="monotone"
                  dataKey="ppm"
                  name="Cloro Residual Libre"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={<CustomizedDot />}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, backgroundColor: 'rgba(34, 197, 94, 0.25)', border: '1px solid #22c55e', borderRadius: 2 }}></span>
              Zona Segura Normativa (0.50 - 2.00 ppm)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, backgroundColor: '#dc2626', borderRadius: '50%' }}></span>
              Puntos Fuera de Norma (Alerta Crítica)
            </span>
          </div>
        </div>
      ) : (
        <div style={{ maxHeight: 210, overflowY: 'auto' }}>
          <table className="mini-data-table" style={{ width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cisterna</th>
                <th>Cloro (ppm)</th>
                <th>Turbiedad</th>
                <th>Conformidad</th>
              </tr>
            </thead>
            <tbody>
              {historico.slice(0, 5).map((q) => {
                const isGood = Number(q.cloro_residual_ppm) >= 0.5 && Number(q.cloro_residual_ppm) <= 2.0;
                return (
                  <tr key={q.id}>
                    <td>{q.fecha}</td>
                    <td><strong style={{ color: '#0369a1' }}>{q.cisterna_placa}</strong></td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: isGood ? '#16a34a' : '#dc2626',
                        background: isGood ? '#dcfce7' : '#fee2e2',
                        padding: '1px 6px',
                        borderRadius: 4
                      }}>
                        {q.cloro_residual_ppm} ppm
                      </span>
                    </td>
                    <td>{q.turbiedad_ntu} NTU</td>
                    <td>
                      {isGood ? (
                        <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Conforme</span>
                      ) : (
                        <span style={{ color: '#b91c1c', fontWeight: 800 }}>⚠️ Alerta</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .alert-ping-dot {
          animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
