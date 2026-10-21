import React from 'react';

export interface SectorItem {
  id: number;
  nombre: string;
  distrito: string;
  total_beneficiarios?: number | string;
  total_habitantes?: number | string;
  meta_semanal_litros?: number;
  meta_semanal_m3?: number;
  dias_entrega?: string;
}

interface MultiSectorSelectorProps {
  sectores: SectorItem[];
  selectedSectores: string[]; // List of sector names
  onChange: (selectedNames: string[], totalLitros: number) => void;
}

export default function MultiSectorSelector({
  sectores,
  selectedSectores,
  onChange,
}: MultiSectorSelectorProps) {
  const isSelected = (nombre: string) => {
    if (selectedSectores.includes(nombre)) return true;
    const n = nombre.toUpperCase().trim();
    return selectedSectores.some((s) => {
      const sUpper = s.toUpperCase().trim();
      if (sUpper === n) return true;
      if (sUpper.includes(n) || n.includes(sUpper)) return true;
      if (n.includes('SANTIAGO') && (sUpper.includes('SANTIAGO') || sUpper.includes('8 VALLES'))) return true;
      if (n.includes('EUCALIPTOS') && sUpper.includes('EUCALIPTOS')) return true;
      if (n.includes('BRISAS') && sUpper.includes('BRISAS')) return true;
      if (n.includes('INDAÑE') && (sUpper.includes('INDAÑE') || sUpper.includes('INDANE'))) return true;
      if (n.includes('SAN BORJA') && sUpper.includes('SAN BORJA')) return true;
      return false;
    });
  };

  const toggleSector = (nombre: string) => {
    let updated: string[];
    if (isSelected(nombre)) {
      // Remove this sector
      updated = selectedSectores.filter((s) => {
        const sUpper = s.toUpperCase().trim();
        const nUpper = nombre.toUpperCase().trim();
        if (sUpper === nUpper || sUpper.includes(nUpper) || nUpper.includes(sUpper)) return false;
        if (nUpper.includes('SANTIAGO') && (sUpper.includes('SANTIAGO') || sUpper.includes('8 VALLES'))) return false;
        if (nUpper.includes('EUCALIPTOS') && sUpper.includes('EUCALIPTOS')) return false;
        if (nUpper.includes('BRISAS') && sUpper.includes('BRISAS')) return false;
        if (nUpper.includes('INDAÑE') && (sUpper.includes('INDAÑE') || sUpper.includes('INDANE'))) return false;
        if (nUpper.includes('SAN BORJA') && sUpper.includes('SAN BORJA')) return false;
        return true;
      });
    } else {
      updated = [...selectedSectores, nombre];
    }

    // Calculate total demand of updated sectors
    const sumLitros = sectores
      .filter((s) => updated.includes(s.nombre))
      .reduce((acc, s) => acc + (Number(s.meta_semanal_litros) || (Number(s.total_habitantes || 1) * 50 * 7)), 0);

    onChange(updated, sumLitros);
  };

  const handleSelectAll = () => {
    // Select active sectors with population/demand
    const activeSectores = sectores.filter((s) => Number(s.meta_semanal_litros || 0) > 0 || Number(s.total_habitantes || 0) > 0);
    const targetSectores = activeSectores.length > 0 ? activeSectores : sectores;
    const allNames = targetSectores.map((s) => s.nombre);
    const sumLitros = targetSectores.reduce((acc, s) => {
      const litros = Number(s.meta_semanal_litros) || (Number(s.total_habitantes || 1) * 50 * 7);
      return acc + (litros || 0);
    }, 0);
    onChange(allNames, sumLitros);
  };

  const handleClearAll = () => {
    onChange([], 0);
  };

  // Calculate current total from all sectors that are checked
  const currentTotalLitros = sectores
    .filter((s) => isSelected(s.nombre))
    .reduce((acc, s) => {
      const litros = Number(s.meta_semanal_litros) || (Number(s.total_habitantes || 1) * 50 * 7);
      return acc + (litros || 0);
    }, 0);
  const currentTotalM3 = parseFloat((currentTotalLitros / 1000).toFixed(2));

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>
          Sectores / Asentamientos Humanos a Abastecer *
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleSelectAll}
            style={actionBtnStyle}
          >
            ✓ Marcar Todos
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            style={{ ...actionBtnStyle, color: '#dc2626' }}
          >
            ✕ Limpiar
          </button>
        </div>
      </div>

      {/* SECTORS GRID */}
      <div style={{
        maxHeight: 180,
        overflowY: 'auto',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        padding: 8,
        background: '#f8fafc',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 8,
      }}>
        {sectores.map((s) => {
          const active = isSelected(s.nombre);
          const demandLitros = s.meta_semanal_litros || (Number(s.total_habitantes || 1) * 50 * 7);
          const demandM3 = parseFloat((demandLitros / 1000).toFixed(1));

          return (
            <div
              key={s.id}
              onClick={() => toggleSector(s.nombre)}
              style={{
                background: active ? '#eff6ff' : '#ffffff',
                border: active ? '2px solid #0284c7' : '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: active ? '0 2px 6px rgba(2, 132, 199, 0.15)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => {}} // Handled by container div
                  style={{ accentColor: '#0284c7', width: 16, height: 16, cursor: 'pointer' }}
                />
                <div style={{ overflow: 'hidden' }}>
                  <strong style={{ fontSize: 12.5, color: '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.nombre}
                  </strong>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {s.total_habitantes || 0} hab.
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: active ? '#0284c7' : '#475569',
                background: active ? '#dbeafe' : '#f1f5f9',
                padding: '2px 6px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}>
                {demandM3} m³
              </span>
            </div>
          );
        })}
      </div>

      {/* AGGREGATED SELECTION SUMMARY */}
      <div style={{
        marginTop: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: selectedSectores.length > 0 ? '#f0fdf4' : '#fff1f2',
        border: selectedSectores.length > 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
      }}>
        {(() => {
          const checkedSectores = sectores.filter((s) => isSelected(s.nombre));
          const count = checkedSectores.length;
          return (
            <>
              <span style={{ fontSize: 12, color: count > 0 ? '#166534' : '#991b1b', fontWeight: 600 }}>
                📍 {count} {count === 1 ? 'Sector Seleccionado' : 'Sectores Seleccionados'}: {count > 0 ? checkedSectores.map((s) => s.nombre).join(', ') : 'Ninguno'}
              </span>
              <span style={{ fontSize: 12, color: '#166534', fontWeight: 800 }}>
                💧 Total Demanda: {currentTotalLitros.toLocaleString()} Lts ({currentTotalM3} m³)
              </span>
            </>
          );
        })()}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#0284c7',
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 8px',
  cursor: 'pointer',
};
