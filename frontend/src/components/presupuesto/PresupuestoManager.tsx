import React, { useState, useEffect } from 'react';
import api from '../../config/api';
import { dialogAlert, dialogConfirm } from '../../context/DialogContext';

export interface MesPresupuestoRow {
  id: number;
  anio: number;
  mes: string;
  mes_numero: number;
  programado: number;
  comprometido: number;
  girado: number;
  saldo_pendiente: number;
  pct_comprometido: number;
  pct_girado: number;
  notas?: string | null;
  updated_at?: string;
}

export interface PartidaPresupuestoRow {
  id: number;
  anio: number;
  codigo_partida?: string | null;
  partida: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
  programado: number;
  devengado: number;
  girado: number;
  saldo_disponible: number;
  pct_ejecutado: number;
  estado: string;
}

export interface ResumenPresupuesto {
  anio: number;
  total_programado: number;
  total_comprometido: number;
  total_girado: number;
  saldo_por_ejecutar: number;
  pct_comprometido: number;
  pct_girado: number;
  meses: MesPresupuestoRow[];
  partidas: PartidaPresupuestoRow[];
}

interface PresupuestoManagerProps {
  onBudgetChanged?: () => void;
}

const MESES_OPCIONES = [
  { numero: 1, nombre: 'ENERO' },
  { numero: 2, nombre: 'FEBRERO' },
  { numero: 3, nombre: 'MARZO' },
  { numero: 4, nombre: 'ABRIL' },
  { numero: 5, nombre: 'MAYO' },
  { numero: 6, nombre: 'JUNIO' },
  { numero: 7, nombre: 'JULIO' },
  { numero: 8, nombre: 'AGOSTO' },
  { numero: 9, nombre: 'SETIEMBRE' },
  { numero: 10, nombre: 'OCTUBRE' },
  { numero: 11, nombre: 'NOVIEMBRE' },
  { numero: 12, nombre: 'DICIEMBRE' },
];

export default function PresupuestoManager({ onBudgetChanged }: PresupuestoManagerProps) {
  const [data, setData] = useState<ResumenPresupuesto | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'meses' | 'partidas'>('meses');

  // Modales
  const [modalMesOpen, setModalMesOpen] = useState(false);
  const [editingMes, setEditingMes] = useState<MesPresupuestoRow | null>(null);
  const [savingMes, setSavingMes] = useState(false);
  const [formMes, setFormMes] = useState({
    anio: 2026,
    mes: 'ENERO',
    mes_numero: 1,
    programado: 0,
    comprometido: 0,
    girado: 0,
    notas: '',
  });

  const [modalPartidaOpen, setModalPartidaOpen] = useState(false);
  const [editingPartida, setEditingPartida] = useState<PartidaPresupuestoRow | null>(null);
  const [savingPartida, setSavingPartida] = useState(false);
  const [formPartida, setFormPartida] = useState({
    anio: 2026,
    codigo_partida: '',
    partida: '',
    unidad: 'meses',
    cantidad: 1,
    costo_unitario: 0,
    programado: 0,
    devengado: 0,
    girado: 0,
    estado: 'EN_EJECUCION',
  });

  const fetchPresupuesto = async () => {
    try {
      setLoading(true);
      const res = await api.get('/presupuesto?anio=2026');
      if (res.data?.data) {
        setData(res.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching presupuesto:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresupuesto();
  }, []);

  // ─── CRUD MESES ───
  const handleOpenCreateMes = () => {
    setEditingMes(null);
    setFormMes({
      anio: 2026,
      mes: 'OCTUBRE',
      mes_numero: 10,
      programado: 0,
      comprometido: 0,
      girado: 0,
      notas: '',
    });
    setModalMesOpen(true);
  };

  const handleOpenEditMes = (m: MesPresupuestoRow) => {
    setEditingMes(m);
    setFormMes({
      anio: m.anio,
      mes: m.mes,
      mes_numero: m.mes_numero,
      programado: m.programado,
      comprometido: m.comprometido,
      girado: m.girado,
      notas: m.notas || '',
    });
    setModalMesOpen(true);
  };

  const handleSaveMes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingMes(true);
      if (editingMes) {
        await api.put(`/presupuesto/meses/${editingMes.id}`, {
          programado: formMes.programado,
          comprometido: formMes.comprometido,
          girado: formMes.girado,
          notas: formMes.notas,
          mes: formMes.mes,
        });
        await dialogAlert({
          title: 'Mes Actualizado',
          message: `El periodo ${formMes.mes} fue actualizado exitosamente.`,
          type: 'success',
        });
      } else {
        await api.post('/presupuesto/meses', formMes);
        await dialogAlert({
          title: 'Mes Registrado',
          message: `El periodo ${formMes.mes} fue agregado exitosamente.`,
          type: 'success',
        });
      }
      setModalMesOpen(false);
      fetchPresupuesto();
      if (onBudgetChanged) onBudgetChanged();
    } catch (err: any) {
      console.error('Error guardando mes:', err);
      dialogAlert({
        title: 'Error al Guardar Mes',
        message: err.response?.data?.message || 'Error interno al registrar datos del mes.',
        type: 'danger',
      });
    } finally {
      setSavingMes(false);
    }
  };

  const handleDeleteMes = async (m: MesPresupuestoRow) => {
    const ok = await dialogConfirm({
      title: 'Eliminar Registro Mensual',
      message: `¿Estás seguro de eliminar el periodo presupuestal ${m.mes} (Programado: S/. ${m.programado.toLocaleString()})?`,
      type: 'danger',
      confirmText: 'Sí, Eliminar Mes',
      cancelText: 'Cancelar',
    });

    if (!ok) return;

    try {
      await api.delete(`/presupuesto/meses/${m.id}`);
      await dialogAlert({
        title: 'Mes Eliminado',
        message: `El periodo ${m.mes} fue eliminado del cronograma presupuestal.`,
        type: 'success',
      });
      fetchPresupuesto();
      if (onBudgetChanged) onBudgetChanged();
    } catch (err: any) {
      console.error('Error eliminando mes:', err);
      dialogAlert({
        title: 'Error al Eliminar',
        message: err.response?.data?.message || 'No se pudo eliminar el registro.',
        type: 'danger',
      });
    }
  };

  // ─── CRUD PARTIDAS ───
  const handleOpenCreatePartida = () => {
    setEditingPartida(null);
    setFormPartida({
      anio: 2026,
      codigo_partida: '',
      partida: '',
      unidad: 'meses',
      cantidad: 1,
      costo_unitario: 0,
      programado: 0,
      devengado: 0,
      girado: 0,
      estado: 'EN_EJECUCION',
    });
    setModalPartidaOpen(true);
  };

  const handleOpenEditPartida = (p: PartidaPresupuestoRow) => {
    setEditingPartida(p);
    setFormPartida({
      anio: p.anio,
      codigo_partida: p.codigo_partida || '',
      partida: p.partida,
      unidad: p.unidad,
      cantidad: p.cantidad,
      costo_unitario: p.costo_unitario,
      programado: p.programado,
      devengado: p.devengado,
      girado: p.girado,
      estado: p.estado,
    });
    setModalPartidaOpen(true);
  };

  const handleSavePartida = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingPartida(true);
      if (editingPartida) {
        await api.put(`/presupuesto/partidas/${editingPartida.id}`, formPartida);
        await dialogAlert({
          title: 'Partida Actualizada',
          message: `La partida presupuestal fue actualizada exitosamente.`,
          type: 'success',
        });
      } else {
        await api.post('/presupuesto/partidas', formPartida);
        await dialogAlert({
          title: 'Partida Registrada',
          message: `La partida presupuestal fue registrada exitosamente.`,
          type: 'success',
        });
      }
      setModalPartidaOpen(false);
      fetchPresupuesto();
      if (onBudgetChanged) onBudgetChanged();
    } catch (err: any) {
      console.error('Error guardando partida:', err);
      dialogAlert({
        title: 'Error al Guardar Partida',
        message: err.response?.data?.message || 'Error interno al procesar la partida.',
        type: 'danger',
      });
    } finally {
      setSavingPartida(false);
    }
  };

  const handleDeletePartida = async (p: PartidaPresupuestoRow) => {
    const ok = await dialogConfirm({
      title: 'Eliminar Partida de Gasto',
      message: `¿Estás seguro de eliminar la partida "${p.partida}" (Programado: S/. ${p.programado.toLocaleString()})?`,
      type: 'danger',
      confirmText: 'Sí, Eliminar Partida',
      cancelText: 'Cancelar',
    });

    if (!ok) return;

    try {
      await api.delete(`/presupuesto/partidas/${p.id}`);
      await dialogAlert({
        title: 'Partida Eliminada',
        message: 'La partida de gasto fue eliminada correctamente.',
        type: 'success',
      });
      fetchPresupuesto();
      if (onBudgetChanged) onBudgetChanged();
    } catch (err: any) {
      console.error('Error eliminando partida:', err);
      dialogAlert({
        title: 'Error al Eliminar',
        message: err.response?.data?.message || 'No se pudo eliminar la partida.',
        type: 'danger',
      });
    }
  };

  // ─── RESTABLECER DEFAULTS ───
  const handleRestablecer = async () => {
    const ok = await dialogConfirm({
      title: 'Restablecer Valores de Referencia PNSU',
      message: '¿Deseas restaurar los montos oficiales de referencia del Convenio PNSU (S/. 323,926.82)?\n\nEsta acción reinicializará el cronograma de meses y las 5 partidas estándar.',
      type: 'warning',
      confirmText: 'Sí, Restablecer Todo',
      cancelText: 'Cancelar',
    });

    if (!ok) return;

    try {
      setLoading(true);
      await api.post('/presupuesto/restablecer-defaults', { anio: 2026 });
      await dialogAlert({
        title: 'Valores Restablecidos',
        message: 'Se han restaurado los valores normativos de referencia del Convenio.',
        type: 'success',
      });
      fetchPresupuesto();
      if (onBudgetChanged) onBudgetChanged();
    } catch (err: any) {
      console.error('Error restableciendo:', err);
      dialogAlert({
        title: 'Error',
        message: 'No se pudo restablecer los valores.',
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        ⏳ Cargando datos de ejecución presupuestal...
      </div>
    );
  }

  const resumen = data || {
    anio: 2026,
    total_programado: 323926.82,
    total_comprometido: 87466.64,
    total_girado: 20200.00,
    saldo_por_ejecutar: 236460.18,
    pct_comprometido: 27.0,
    pct_girado: 6.2,
    meses: [],
    partidas: [],
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* 4 TARJETAS KPI RESUMEN */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14,
        marginBottom: 20
      }}>
        {/* TOTAL PROGRAMADO */}
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Programado Total</span>
            <span style={{ fontSize: 18 }}>📋</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>
            S/. {resumen.total_programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11.5, color: '#0284c7', fontWeight: 700, marginTop: 4 }}>
            100% Presupuesto Convenio PNSU
          </div>
        </div>

        {/* COMPROMETIDO */}
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase' }}>Comprometido</span>
            <span style={{ fontSize: 18 }}>📑</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#7c3aed', marginTop: 6 }}>
            S/. {resumen.total_comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11.5, color: '#6d28d9', fontWeight: 700, marginTop: 4 }}>
            {resumen.pct_comprometido}% del programado
          </div>
        </div>

        {/* GIRADO / DEVENGADO */}
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>Girado / Devengado</span>
            <span style={{ fontSize: 18 }}>💸</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', marginTop: 6 }}>
            S/. {resumen.total_girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11.5, color: '#c2410c', fontWeight: 700, marginTop: 4 }}>
            {resumen.pct_girado}% pagado / ejecutado
          </div>
        </div>

        {/* SALDO POR EJECUTAR */}
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>Saldo por Ejecutar</span>
            <span style={{ fontSize: 18 }}>🟢</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', marginTop: 6 }}>
            S/. {resumen.saldo_por_ejecutar.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 700, marginTop: 4 }}>
            Disponible para reprogramar
          </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y PESTAÑAS SUB-MÓDULO */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: '#ffffff',
        padding: '12px 18px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 16
      }}>
        {/* Selector de Vistas */}
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => setSubTab('meses')}
            style={{
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: subTab === 'meses' ? '#ffffff' : 'transparent',
              color: subTab === 'meses' ? '#0f172a' : '#64748b',
              boxShadow: subTab === 'meses' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            📅 Cronograma Mensual ({resumen.meses.length} meses)
          </button>

          <button
            type="button"
            onClick={() => setSubTab('partidas')}
            style={{
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: subTab === 'partidas' ? '#ffffff' : 'transparent',
              color: subTab === 'partidas' ? '#0f172a' : '#64748b',
              boxShadow: subTab === 'partidas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            🏷️ Partidas de Gasto ({resumen.partidas.length} rubros)
          </button>
        </div>

        {/* Botones de Acción */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {subTab === 'meses' ? (
            <button
              type="button"
              onClick={handleOpenCreateMes}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              ➕ Registrar / Asignar Mes
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreatePartida}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              ➕ Nueva Partida de Gasto
            </button>
          )}

          <button
            type="button"
            onClick={handleRestablecer}
            title="Restablece los montos base del convenio PNSU"
            style={{
              background: '#f8fafc',
              color: '#475569',
              border: '1px solid #cbd5e1',
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔄 Restablecer PNSU
          </button>
        </div>
      </div>

      {/* ─── VISTA 1: CRONOGRAMA MENSUAL ─── */}
      {subTab === 'meses' && (
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table className="official-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>N°</th>
                <th style={{ padding: '10px 14px' }}>Mes</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Programado (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Comprometido (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Girado (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Saldo Pendiente (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>% Ejecución</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resumen.meses.map((m, idx) => {
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <strong style={{ color: '#0f172a' }}>{m.mes}</strong>
                      {m.notas && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {m.notas}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {m.programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }}>
                      {m.comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#ea580c', fontWeight: 700 }}>
                      {m.girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: 700 }}>
                      {m.saldo_pendiente.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(100, m.pct_comprometido)}%`,
                            height: '100%',
                            background: m.pct_girado >= 100 ? '#10b981' : (m.pct_comprometido > 0 ? '#8b5cf6' : '#cbd5e1')
                          }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{m.pct_comprometido}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditMes(m)}
                          title="Editar montos de este mes"
                          style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMes(m)}
                          title="Eliminar este mes del cronograma"
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '12px 14px' }}>TOTAL CONSOLIDADO 2026</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                  S/. {resumen.total_programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#7c3aed' }}>
                  S/. {resumen.total_comprometido.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#ea580c' }}>
                  S/. {resumen.total_girado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#059669' }}>
                  S/. {resumen.saldo_por_ejecutar.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                  {resumen.pct_comprometido}% comp.
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ─── VISTA 2: PARTIDAS DE GASTO ─── */}
      {subTab === 'partidas' && (
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table className="official-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>N°</th>
                <th style={{ padding: '10px 14px' }}>Código / Partida de Gasto</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Unidad</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cantidad</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Programado (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Devengado (S/.)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Saldo (S/.)</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resumen.partidas.map((p, idx) => {
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {p.codigo_partida && (
                        <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 5px', borderRadius: 4, marginRight: 6 }}>
                          {p.codigo_partida}
                        </code>
                      )}
                      <strong>{p.partida}</strong>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{p.unidad}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{p.cantidad}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {p.programado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#ea580c', fontWeight: 700 }}>
                      {p.devengado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: 700 }}>
                      {p.saldo_disponible.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: p.estado === 'COMPLETADO' ? '#dcfce7' : (p.estado === 'EN_EJECUCION' ? '#fef3c7' : '#f1f5f9'),
                        color: p.estado === 'COMPLETADO' ? '#166534' : (p.estado === 'EN_EJECUCION' ? '#b45309' : '#64748b'),
                      }}>
                        {p.estado}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditPartida(p)}
                          title="Editar partida"
                          style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePartida(p)}
                          title="Eliminar partida"
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                <td colSpan={4} style={{ padding: '12px 14px' }}>TOTAL PARTIDAS OPERATIVAS</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace' }}>
                  S/. {resumen.partidas.reduce((a, b) => a + b.programado, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#ea580c' }}>
                  S/. {resumen.partidas.reduce((a, b) => a + b.devengado, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#059669' }}>
                  S/. {resumen.partidas.reduce((a, b) => a + b.saldo_disponible, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ─── MODAL 1: REGISTRAR / EDITAR MES ─── */}
      {modalMesOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 480,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a', fontWeight: 800 }}>
                {editingMes ? `✏️ Editar Periodo ${editingMes.mes}` : '➕ Registrar Asignación Mensual'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMesOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMes}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Mes de Operación:
                </label>
                <select
                  disabled={Boolean(editingMes)}
                  value={formMes.mes_numero}
                  onChange={(e) => {
                    const num = parseInt(e.target.value, 10);
                    const opt = MESES_OPCIONES.find(o => o.numero === num);
                    setFormMes({
                      ...formMes,
                      mes_numero: num,
                      mes: opt ? opt.nombre : 'MES'
                    });
                  }}
                  className="form-input"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14 }}
                >
                  {MESES_OPCIONES.map(o => (
                    <option key={o.numero} value={o.numero}>{o.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Monto Programado (S/.):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formMes.programado}
                  onChange={(e) => setFormMes({ ...formMes, programado: parseFloat(e.target.value) || 0 })}
                  className="form-input"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 15, fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', display: 'block', marginBottom: 6 }}>
                    Comprometido (S/.):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMes.comprometido}
                    onChange={(e) => setFormMes({ ...formMes, comprometido: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700, color: '#7c3aed' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#ea580c', display: 'block', marginBottom: 6 }}>
                    Girado / Pagado (S/.):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMes.girado}
                    onChange={(e) => setFormMes({ ...formMes, girado: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700, color: '#ea580c' }}
                  />
                </div>
              </div>

              {/* Saldo Calculado en Vivo */}
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, marginBottom: 14, border: '1px solid #e2e8f0', fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>Saldo por Girar Resultante:</span>
                  <strong style={{ color: '#059669' }}>
                    S/. {Math.max(0, formMes.programado - formMes.girado).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Notas u Observaciones del Periodo:
                </label>
                <textarea
                  rows={2}
                  value={formMes.notas}
                  onChange={(e) => setFormMes({ ...formMes, notas: e.target.value })}
                  placeholder="Detalles de facturas, órdenes de servicio o ampliaciones..."
                  className="form-input"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setModalMesOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMes}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0284c7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingMes ? '⏳ Guardando...' : '💾 Guardar Periodo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: REGISTRAR / EDITAR PARTIDA ─── */}
      {modalPartidaOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 520,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a', fontWeight: 800 }}>
                {editingPartida ? '✏️ Editar Partida de Gasto' : '➕ Nueva Partida de Gasto'}
              </h3>
              <button
                type="button"
                onClick={() => setModalPartidaOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePartida}>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Clasificador:
                  </label>
                  <input
                    type="text"
                    placeholder="2.3.2.7.11"
                    value={formPartida.codigo_partida}
                    onChange={(e) => setFormPartida({ ...formPartida, codigo_partida: e.target.value })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Nombre del Rubro / Partida:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Alquiler de camión cisterna..."
                    value={formPartida.partida}
                    onChange={(e) => setFormPartida({ ...formPartida, partida: e.target.value })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13.5, fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Unidad de Medida:
                  </label>
                  <input
                    type="text"
                    placeholder="meses, galones, glb..."
                    value={formPartida.unidad}
                    onChange={(e) => setFormPartida({ ...formPartida, unidad: e.target.value })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Cantidad:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formPartida.cantidad}
                    onChange={(e) => setFormPartida({ ...formPartida, cantidad: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Monto Programado (S/.):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formPartida.programado}
                    onChange={(e) => setFormPartida({ ...formPartida, programado: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#ea580c', display: 'block', marginBottom: 6 }}>
                    Devengado / Girado (S/.):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPartida.devengado}
                    onChange={(e) => setFormPartida({ ...formPartida, devengado: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700, color: '#ea580c' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Estado de la Partida:
                </label>
                <select
                  value={formPartida.estado}
                  onChange={(e) => setFormPartida({ ...formPartida, estado: e.target.value })}
                  className="form-input"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                >
                  <option value="EN_EJECUCION">EN_EJECUCION (En curso operativo)</option>
                  <option value="PROGRAMADO">PROGRAMADO (Por licitar o contratar)</option>
                  <option value="COMPLETADO">COMPLETADO (Totalmente ejecutado)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setModalPartidaOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPartida}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0284c7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingPartida ? '⏳ Guardando...' : '💾 Guardar Partida'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
