import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface Props {
  vales: {
    total_vales: number;
    entregados: number;
    pendientes: number;
    tasa_canje: number;
  };
}

export default function ValesRedemptionGauge({ vales }: Props) {
  const canjeados = vales.entregados || 0;
  const total = Math.max(vales.total_vales || 0, 1);
  const pendientes = Math.max(0, vales.pendientes || 0);
  const litrosComprometidos = vales.total_vales * 200; // 200 L por vale PNSU

  const chartData = [
    { name: 'Canjeados', value: canjeados, color: '#10b981' },
    { name: 'Pendientes', value: pendientes, color: '#f1f5f9' },
  ];

  const pctCanjeados = Math.round((canjeados / total) * 100);

  return (
    <div className="vales-redemption-gauge-wrap" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      {/* Semi-Donut Gauge */}
      <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="82%"
              startAngle={180}
              endAngle={0}
              innerRadius={58}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color === '#f1f5f9' ? '#e2e8f0' : entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Indicador Central */}
        <div
          style={{
            position: 'absolute',
            top: '55%',
            left: '50%',
            transform: 'translate(-50%, -20%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {canjeados} <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 600 }}>/ {vales.total_vales}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
            Vales Canjeados ({pctCanjeados}%)
          </div>
        </div>
      </div>

      {/* Resumen numérico */}
      <div style={{ display: 'flex', justifyContent: 'space-around', margin: '4px 0 10px', fontSize: 11, textAlign: 'center' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', flex: 1, marginRight: 6 }}>
          <span style={{ display: 'block', color: '#64748b' }}>Canjeados</span>
          <strong style={{ color: '#10b981', fontSize: 13 }}>{canjeados} vales</strong>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', flex: 1, marginLeft: 6 }}>
          <span style={{ display: 'block', color: '#64748b' }}>Comprometidos</span>
          <strong style={{ color: '#0284c7', fontSize: 13 }}>{litrosComprometidos.toLocaleString('es-PE')} L</strong>
        </div>
      </div>

      {/* Alerta por inactividad si canjeados es 0 */}
      {canjeados === 0 && vales.total_vales > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#b45309',
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>
            <strong>Inactividad de Canje:</strong> {vales.total_vales} vales emitidos sin registro de redención en campo aún.
          </span>
        </div>
      )}
    </div>
  );
}
