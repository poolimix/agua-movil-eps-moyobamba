import React from 'react';

const DAYS = [
  { id: 'Lunes', short: 'Lun', label: 'Lunes' },
  { id: 'Martes', short: 'Mar', label: 'Martes' },
  { id: 'Miércoles', short: 'Mié', label: 'Miércoles' },
  { id: 'Jueves', short: 'Jue', label: 'Jueves' },
  { id: 'Viernes', short: 'Vie', label: 'Viernes' },
  { id: 'Sábado', short: 'Sáb', label: 'Sábado' },
  { id: 'Domingo', short: 'Dom', label: 'Domingo' },
];

interface DaysOfWeekSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export default function DaysOfWeekSelector({
  value = '',
  onChange,
  label = 'Días de Atención Semanal',
}: DaysOfWeekSelectorProps) {
  // Parse current selected days from string (e.g. "Lunes, Miércoles, Viernes")
  const selectedDays = value
    ? value
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  const isSelected = (dayName: string) => {
    return selectedDays.some((d) => d.toLowerCase() === dayName.toLowerCase());
  };

  const toggleDay = (dayName: string) => {
    let updated: string[];
    if (isSelected(dayName)) {
      updated = selectedDays.filter((d) => d.toLowerCase() !== dayName.toLowerCase());
    } else {
      // Keep natural day order (Lunes -> Domingo)
      const orderMap: { [key: string]: number } = {
        lunes: 1,
        martes: 2,
        miércoles: 3,
        miercoles: 3,
        jueves: 4,
        viernes: 5,
        sábado: 6,
        sabado: 6,
        domingo: 7,
      };

      const newSet = [...selectedDays, dayName];
      newSet.sort((a, b) => (orderMap[a.toLowerCase()] || 0) - (orderMap[b.toLowerCase()] || 0));
      updated = newSet;
    }
    onChange(updated.join(', '));
  };

  const selectPreset = (preset: string[]) => {
    onChange(preset.join(', '));
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>
          {label} *
        </label>
        <span style={{ fontSize: 11.5, color: '#0284c7', fontWeight: 700 }}>
          {selectedDays.length} {selectedDays.length === 1 ? 'día marcado' : 'días marcados'}
        </span>
      </div>

      {/* 7 DAYS CHIPS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
        {DAYS.map((day) => {
          const active = isSelected(day.id);
          return (
            <button
              type="button"
              key={day.id}
              onClick={() => toggleDay(day.id)}
              style={{
                background: active ? 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)' : '#f8fafc',
                color: active ? '#ffffff' : '#334155',
                border: active ? '1px solid #0284c7' : '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '8px 2px',
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: active ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800 }}>{day.short}</span>
              <span style={{ fontSize: 9.5, opacity: active ? 0.95 : 0.6, textTransform: 'uppercase' }}>
                {active ? '✓' : day.id.slice(0, 3)}
              </span>
            </button>
          );
        })}
      </div>

      {/* QUICK PRESETS & CLEAR */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => selectPreset(['Lunes', 'Miércoles', 'Viernes'])}
          style={presetBtnStyle}
        >
          Lun-Mié-Vie
        </button>
        <button
          type="button"
          onClick={() => selectPreset(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])}
          style={presetBtnStyle}
        >
          Lun a Vie
        </button>
        <button
          type="button"
          onClick={() => selectPreset(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])}
          style={presetBtnStyle}
        >
          Lun a Sáb
        </button>
        <button
          type="button"
          onClick={() => selectPreset(DAYS.map((d) => d.id))}
          style={presetBtnStyle}
        >
          Todos los días
        </button>
        {selectedDays.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ ...presetBtnStyle, color: '#dc2626', borderColor: '#fecaca', background: '#fff1f2' }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* SELECTED SUMMARY PREVIEW */}
      <div style={{ marginTop: 6, fontSize: 11.5, color: selectedDays.length > 0 ? '#166534' : '#94a3b8' }}>
        🗓️ <strong>Días establecidos:</strong> {selectedDays.length > 0 ? selectedDays.join(', ') : 'Ningún día seleccionado'}
      </div>
    </div>
  );
}

const presetBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#475569',
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  cursor: 'pointer',
  transition: 'all 0.15s',
};
