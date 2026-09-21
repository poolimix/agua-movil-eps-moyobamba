import { useMemo } from 'react';

export interface SectorItem {
  sector_nombre: string;
  litros_entregados: number;
  total_entregas: number;
  total_beneficiarios: number;
  meta_litros: number;
  cumplimiento_pct: number;
}

interface Props {
  sectores: SectorItem[];
}

export default function SectorCoverageBulletList({ sectores }: Props) {
  // Ordenamiento automático: De MENOR a MAYOR cumplimiento para priorizar zonas críticas
  const sortedSectores = useMemo(() => {
    return [...sectores].sort((a, b) => a.cumplimiento_pct - b.cumplimiento_pct);
  }, [sectores]);

  const getStatusBadge = (pct: number) => {
    if (pct >= 80) {
      return {
        label: 'Meta Óptima',
        tagClass: 'badge-status-optimal',
        barGradient: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
        textColor: '#059669',
      };
    }
    if (pct >= 50) {
      return {
        label: 'En Proceso',
        tagClass: 'badge-status-progress',
        barGradient: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
        textColor: '#d97706',
      };
    }
    return {
      label: 'Crítico PNSU',
      tagClass: 'badge-status-critical',
      barGradient: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
      textColor: '#dc2626',
    };
  };

  if (!sectores || sectores.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
        No hay sectores registrados con metas activas
      </div>
    );
  }

  return (
    <div className="sector-coverage-bullet-wrap">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sortedSectores.map((sec) => {
          const status = getStatusBadge(sec.cumplimiento_pct);
          const widthPct = Math.min(100, Math.max(3, sec.cumplimiento_pct));

          return (
            <div key={sec.sector_nombre} className="sector-bullet-card">
              {/* Header con nombre y badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: '#0f172a' }}>{sec.sector_nombre}</strong>
                  <span style={{ fontSize: 11, color: '#64748b' }}>({sec.total_beneficiarios} familias)</span>
                  <span className={`status-pill ${status.tagClass}`}>
                    {status.label}
                  </span>
                </div>

                <div style={{ textAlign: 'right', fontSize: 12 }}>
                  <strong style={{ color: '#0f172a' }}>
                    {Number(sec.litros_entregados).toLocaleString('es-PE')} L
                  </strong>
                  <span style={{ color: '#64748b' }}>
                    {' '}/ {Number(sec.meta_litros).toLocaleString('es-PE')} L
                  </span>
                  <strong style={{ color: status.textColor, marginLeft: 8 }}>
                    ({sec.cumplimiento_pct}%)
                  </strong>
                </div>
              </div>

              {/* Barra de fondo neutro + barra frontal de volumen */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 10,
                  backgroundColor: '#e2e8f0',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${widthPct}%`,
                    background: status.barGradient,
                    borderRadius: 999,
                    transition: 'width 0.8s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda de umbrales PNSU */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 10,
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            &lt;50% Crítico
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
            50-79% En Proceso
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            &ge;80% Óptimo
          </span>
        </div>
        <span style={{ fontStyle: 'italic' }}>Ordenado por prioridad de abastecimiento</span>
      </div>

      <style>{`
        .status-pill {
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .badge-status-optimal {
          background-color: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        .badge-status-progress {
          background-color: #fef3c7;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        .badge-status-critical {
          background-color: #fee2e2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          animation: pulseRed 2s infinite ease-in-out;
        }
        @keyframes pulseRed {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
