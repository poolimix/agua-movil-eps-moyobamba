import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface TrendDataPoint {
  fecha: string;
  litros: number;
  entregas: number;
}

interface Props {
  data: TrendDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const litros = Number(payload[0]?.value || 0);
    const entregas = Number(payload[1]?.value || 0);
    const ratioEficiencia = entregas > 0 ? Math.round(litros / entregas) : 0;

    return (
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '10px 14px',
        color: '#f8fafc',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        fontSize: 12,
        minWidth: 190,
      }}>
        <div style={{ fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #1e293b', paddingBottom: 6, marginBottom: 8 }}>
          📅 Fecha: <span style={{ color: '#fff' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#38bdf8' }}>
          <span>💧 Volumen:</span>
          <strong>{litros.toLocaleString('es-PE')} L</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#fbbf24' }}>
          <span>🚛 Despachos:</span>
          <strong>{entregas} viajes</strong>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 6,
          borderTop: '1px dashed #334155',
          color: '#4ade80',
          fontWeight: 700
        }}>
          <span>⚡ Eficiencia:</span>
          <span>{ratioEficiencia.toLocaleString('es-PE')} L / viaje</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function VolumeTripsTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontStyle: 'italic',
        fontSize: 13
      }}>
        No se registran despachos en el periodo seleccionado
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
          <defs>
            <linearGradient id="cyanVolumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.4} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

          {/* Eje X Fechas */}
          <XAxis
            dataKey="fecha"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
          />

          {/* Eje Y Primario (Izquierda) - Litros */}
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}k L`}
          />

          {/* Eje Y Secundario (Derecha) - Entregas / Viajes */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#d97706', fontSize: 11, fontWeight: 700 }}
            domain={[0, 'dataMax + 2']}
            allowDecimals={false}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: 12, fontSize: 12, fontWeight: 600 }}
            iconType="circle"
          />

          {/* Barras de Volumen */}
          <Bar
            yAxisId="left"
            dataKey="litros"
            name="Litros Repartidos"
            fill="url(#cyanVolumeGradient)"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          />

          {/* Línea de Viajes / Entregas */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="entregas"
            name="Viajes Realizados"
            stroke="#f59e0b"
            strokeWidth={3}
            dot={{ fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2, r: 5 }}
            activeDot={{ r: 7, stroke: '#b45309', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
