import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../config/api';
import { dialogAlert, dialogConfirm } from '../context/DialogContext';
import './Modules.css';

interface ParametroSistema {
  id: number;
  clave: string;
  valor: number | string;
  descripcion: string;
  unidad: string;
  categoria: string;
  updated_at?: string;
  updated_by?: string;
}

interface ConfigState {
  dotacion_diaria_litros: number;
  dias_entrega_semanal: number;
  dotacion_semanal_por_habitante: number;
  turbiedad_max_ntu: number;
  cloro_min_ppm: number;
  cloro_max_ppm: number;
  ph_min: number;
  ph_max: number;
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<ConfigState>({
    dotacion_diaria_litros: 50,
    dias_entrega_semanal: 7,
    dotacion_semanal_por_habitante: 350,
    turbiedad_max_ntu: 5.0,
    cloro_min_ppm: 0.5,
    cloro_max_ppm: 2.0,
    ph_min: 6.5,
    ph_max: 8.5
  });

  const [parametros, setParametros] = useState<ParametroSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDotacion, setSavingDotacion] = useState(false);
  const [savingCalidad, setSavingCalidad] = useState(false);
  const [recalcularVales, setRecalcularVales] = useState(true);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await api.get('/configuracion');
      if (res.data?.config) {
        setConfig(res.data.config);
      }
      if (res.data?.parametros) {
        setParametros(res.data.parametros);
      }
    } catch (err: any) {
      console.error('Error cargando configuración:', err);
      dialogAlert({
        title: 'Error de Conexión',
        message: 'No se pudo cargar la configuración del sistema.',
        type: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Guardado independiente de Dotación y Ciclo Semanal
  const handleSaveDotacion = async (e: React.FormEvent) => {
    e.preventDefault();

    const dotacionNum = Number(config.dotacion_diaria_litros);
    const diasNum = Number(config.dias_entrega_semanal);
    const semanalHab = dotacionNum * diasNum;

    const ok = await dialogConfirm({
      title: 'Confirmar Dotación de Agua',
      message: `¿Desea actualizar exclusivamente los parámetros de dotación de agua?\n\n• Dotación Diaria: ${dotacionNum} L/hab/día\n• Ciclo Semanal: ${diasNum} días (${semanalHab.toLocaleString()} L/hab por vale)\n• Familia de 5 personas: ${(semanalHab * 5).toLocaleString()} Litros/vale (${((semanalHab * 5) / 1000).toFixed(2)} m³)\n\n${recalcularVales ? '⚠️ Se recalcularán y sincronizarán automáticamente todos los vales de consumo emitidos.' : 'Los vales existentes conservarán su volumen original.'}`,
      type: 'warning',
      confirmText: 'Sí, Guardar Dotación',
      cancelText: 'Cancelar'
    });

    if (!ok) return;

    try {
      setSavingDotacion(true);
      const res = await api.put('/configuracion', {
        dotacion_diaria_litros: dotacionNum,
        dias_entrega_semanal: diasNum,
        recalcular_vales: recalcularVales
      });

      await dialogAlert({
        title: 'Dotación Actualizada',
        message: `${res.data.message || 'Parámetros de dotación actualizados exitosamente.'} ${res.data.vales_sincronizados ? `\n\n💧 ${res.data.vales_sincronizados} vales activos han sido actualizados con la nueva dotación.` : ''}`,
        type: 'success'
      });

      fetchConfig();
    } catch (err: any) {
      console.error('Error guardando dotación:', err);
      dialogAlert({
        title: 'Error al Guardar Dotación',
        message: err.response?.data?.message || 'Error al guardar los parámetros de dotación.',
        type: 'danger'
      });
    } finally {
      setSavingDotacion(false);
    }
  };

  // Guardado independiente de Control de Calidad del Agua
  const handleSaveCalidad = async (e: React.FormEvent) => {
    e.preventDefault();

    const ok = await dialogConfirm({
      title: 'Confirmar Límites de Calidad de Agua',
      message: `¿Desea actualizar exclusivamente los límites normativos sanitarios?\n\n• Turbiedad Máxima Permisible: ≤ ${config.turbiedad_max_ntu} NTU\n• Cloro Residual Libre: ${config.cloro_min_ppm} a ${config.cloro_max_ppm} ppm\n• Rango de pH: ${config.ph_min} a ${config.ph_max} pH\n\nLos nuevos límites se aplicarán a todas las evaluaciones sanitarias de cisternas y rutas.`,
      type: 'warning',
      confirmText: 'Sí, Guardar Calidad',
      cancelText: 'Cancelar'
    });

    if (!ok) return;

    try {
      setSavingCalidad(true);
      const res = await api.put('/configuracion', {
        turbiedad_max_ntu: Number(config.turbiedad_max_ntu),
        cloro_min_ppm: Number(config.cloro_min_ppm),
        cloro_max_ppm: Number(config.cloro_max_ppm),
        ph_min: Number(config.ph_min),
        ph_max: Number(config.ph_max),
        recalcular_vales: false
      });

      await dialogAlert({
        title: 'Límites de Calidad Actualizados',
        message: res.data.message || 'Los límites normativos de calidad del agua se han actualizado exitosamente.',
        type: 'success'
      });

      fetchConfig();
    } catch (err: any) {
      console.error('Error guardando calidad:', err);
      dialogAlert({
        title: 'Error al Guardar Calidad',
        message: err.response?.data?.message || 'Error al guardar los límites de calidad.',
        type: 'danger'
      });
    } finally {
      setSavingCalidad(false);
    }
  };

  const handleResetDefaults = async () => {
    const ok = await dialogConfirm({
      title: 'Restablecer Valores Reglamentarios',
      message: '¿Desea restaurar todos los valores normativos estándar (SUNASS / D.S. 031-2010-SA)?\n\n• Dotación: 50 L/hab/día\n• Días: 7 días (350 L/sem)\n• Turbiedad LMP: 5.0 NTU\n• Cloro: 0.5 - 2.0 ppm\n• pH: 6.5 - 8.5',
      type: 'warning',
      confirmText: 'Sí, Restaurar Todo',
      cancelText: 'Cancelar'
    });

    if (!ok) return;

    try {
      setSavingDotacion(true);
      setSavingCalidad(true);
      await api.put('/configuracion', {
        dotacion_diaria_litros: 50,
        dias_entrega_semanal: 7,
        turbiedad_max_ntu: 5.0,
        cloro_min_ppm: 0.5,
        cloro_max_ppm: 2.0,
        ph_min: 6.5,
        ph_max: 8.5,
        recalcular_vales: true
      });

      await dialogAlert({
        title: 'Valores Restaurados',
        message: 'Se han restablecido los valores reglamentarios de dotación y calidad.',
        type: 'success'
      });

      fetchConfig();
    } catch (err: any) {
      console.error('Error restaurando valores:', err);
      dialogAlert({
        title: 'Error',
        message: 'No se pudieron restablecer los valores.',
        type: 'danger'
      });
    } finally {
      setSavingDotacion(false);
      setSavingCalidad(false);
    }
  };

  const dotacionSemanalCalc = Number(config.dotacion_diaria_litros || 0) * Number(config.dias_entrega_semanal || 7);

  return (
    <Layout>
      <div className="module-container">
        {/* HEADER */}
        <div className="module-header" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>⚙️</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a', fontWeight: 800 }}>
                Configuración y Parámetros Operativos
              </h1>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13.5 }}>
                Administración de la dotación de agua potable por habitante y límites sanitarios de control de calidad
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetDefaults}
              disabled={savingDotacion || savingCalidad || loading}
              style={{ fontSize: 13, padding: '8px 14px' }}
            >
              🔄 Restaurar Normativa SUNASS
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 15 }}>
            ⏳ Cargando parámetros operativos del sistema...
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, marginBottom: 24 }}>
              
              {/* CARD 1: FORMULARIO INDEPENDIENTE DE DOTACIÓN DE AGUA */}
              <form
                onSubmit={handleSaveDotacion}
                style={{ 
                  background: '#fff', 
                  padding: 22, 
                  borderRadius: 14, 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>💧</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a', fontWeight: 700 }}>
                        Dotación de Agua y Abastecimiento
                      </h3>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        Cálculo de volumen diario y semanal por familia para vales y reparto
                      </p>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                      Dotación Diaria por Persona / Habitante:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        required
                        className="form-input"
                        style={{ fontSize: 16, fontWeight: 700, width: 140 }}
                        value={config.dotacion_diaria_litros}
                        onChange={(e) => setConfig({ ...config, dotacion_diaria_litros: parseFloat(e.target.value) || 0 })}
                      />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Litros / persona / día</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                      Norma reglamentaria de referencia: 50 L/hab/día. Puedes ajustar a cualquier valor (ej. 40, 60, 80).
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                      Días del Ciclo de Entrega Semanal:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        step="1"
                        required
                        className="form-input"
                        style={{ fontSize: 16, fontWeight: 700, width: 140 }}
                        value={config.dias_entrega_semanal}
                        onChange={(e) => setConfig({ ...config, dias_entrega_semanal: parseInt(e.target.value, 10) || 1 })}
                      />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Días por vale</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                      Frecuencia periódica de distribución del programa: 7 días continuos.
                    </span>
                  </div>

                  {/* LIVE SIMULATOR BOX */}
                  <div style={{ background: '#f0f9ff', padding: 14, borderRadius: 10, border: '1px solid #bae6fd', marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0369a1', marginBottom: 6 }}>
                      📊 Resumen de Dotación Resultante:
                    </div>
                    <div style={{ fontSize: 12.5, color: '#0f172a', lineHeight: 1.6 }}>
                      • <strong>1 Persona (Titular solo):</strong> {config.dotacion_diaria_litros} L/día × {config.dias_entrega_semanal}d = <span style={{ color: '#0284c7', fontWeight: 800 }}>{dotacionSemanalCalc.toLocaleString()} Litros semanales</span><br />
                      • <strong>Familia de 5 personas (1 titular + 4 familiares):</strong> {(config.dotacion_diaria_litros * 5).toLocaleString()} L/día × {config.dias_entrega_semanal}d = <span style={{ color: '#0284c7', fontWeight: 800 }}>{(dotacionSemanalCalc * 5).toLocaleString()} Litros por vale ({((dotacionSemanalCalc * 5) / 1000).toFixed(2)} m³)</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={recalcularVales}
                        onChange={(e) => setRecalcularVales(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>Sincronizar y actualizar automáticamente todos los vales emitidos con la nueva cuota</span>
                    </label>
                  </div>
                </div>

                {/* BOTÓN INDEPENDIENTE GUARDAR DOTACIÓN */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingDotacion}
                    style={{
                      padding: '10px 22px',
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#0284c7',
                      borderColor: '#0369a1',
                      borderRadius: 10,
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                    }}
                  >
                    {savingDotacion ? '⏳ Guardando Dotación...' : '💾 Guardar Parámetros de Dotación'}
                  </button>
                </div>
              </form>

              {/* CARD 2: FORMULARIO INDEPENDIENTE DE CONTROL DE CALIDAD DE AGUA */}
              <form
                onSubmit={handleSaveCalidad}
                style={{ 
                  background: '#fff', 
                  padding: 22, 
                  borderRadius: 14, 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>🧪</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a', fontWeight: 700 }}>
                        Control de Calidad del Agua
                      </h3>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        Límites máximos permisibles (LMP) según D.S. 031-2010-SA y TDR PNSU
                      </p>
                    </div>
                  </div>

                  {/* TURBIEDAD */}
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                      Turbiedad Máxima Permisible (LMP):
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <input
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        required
                        className="form-input"
                        style={{ fontSize: 16, fontWeight: 700, width: 140 }}
                        value={config.turbiedad_max_ntu}
                        onChange={(e) => setConfig({ ...config, turbiedad_max_ntu: parseFloat(e.target.value) || 0 })}
                      />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>NTU (Nephelometric Units)</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                      Medición de turbidez. Toda muestra mayor a este valor marcará automáticamente <strong>ALERTA SANITARIA (No Conforme)</strong>.
                    </span>
                  </div>

                  {/* CLORO RESIDUAL LIBRE */}
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                      Rango Reglamentario de Cloro Residual Libre:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Mín:</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.05"
                          required
                          className="form-input"
                          style={{ fontSize: 15, fontWeight: 700, width: 100 }}
                          value={config.cloro_min_ppm}
                          onChange={(e) => setConfig({ ...config, cloro_min_ppm: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <span style={{ color: '#94a3b8' }}>hasta</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Máx:</span>
                        <input
                          type="number"
                          min="0.1"
                          max="10"
                          step="0.05"
                          required
                          className="form-input"
                          style={{ fontSize: 15, fontWeight: 700, width: 100 }}
                          value={config.cloro_max_ppm}
                          onChange={(e) => setConfig({ ...config, cloro_max_ppm: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#475569' }}>mg/L (ppm)</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                      Norma Nacional: ≥ 0.50 mg/L en punto de entrega domiciliaria. Máximo recomendado en cisterna: 2.0 mg/L.
                    </span>
                  </div>

                  {/* RANGO DE PH */}
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                      Rango Aceptable de pH:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Mín:</span>
                        <input
                          type="number"
                          min="0"
                          max="14"
                          step="0.1"
                          required
                          className="form-input"
                          style={{ fontSize: 15, fontWeight: 700, width: 100 }}
                          value={config.ph_min}
                          onChange={(e) => setConfig({ ...config, ph_min: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <span style={{ color: '#94a3b8' }}>hasta</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Máx:</span>
                        <input
                          type="number"
                          min="0"
                          max="14"
                          step="0.1"
                          required
                          className="form-input"
                          style={{ fontSize: 15, fontWeight: 700, width: 100 }}
                          value={config.ph_max}
                          onChange={(e) => setConfig({ ...config, ph_max: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#475569' }}>Unidades pH</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                      Rango reglamentario del agua para consumo humano: 6.5 a 8.5.
                    </span>
                  </div>
                </div>

                {/* BOTÓN INDEPENDIENTE GUARDAR CALIDAD */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingCalidad}
                    style={{
                      padding: '10px 22px',
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#059669',
                      borderColor: '#047857',
                      borderRadius: 10,
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    {savingCalidad ? '⏳ Guardando Calidad...' : '💾 Guardar Parámetros de Calidad'}
                  </button>
                </div>
              </form>
            </div>

            {/* BARRA INFORMATIVA INFERIOR */}
            <div style={{ background: '#f8fafc', padding: '14px 20px', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                <strong>Procesos independientes:</strong> Puedes modificar y guardar la <strong>Dotación de Agua</strong> o los <strong>Parámetros de Calidad</strong> por separado. Cada tarjeta cuenta con su propio botón de guardado.
              </div>
            </div>
          </div>
        )}

        {/* TABLA HISTÓRICA DE PARÁMETROS REGISTRADOS EN BASE DE DATOS */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: 15, color: '#0f172a', fontWeight: 700 }}>
              📋 Registro Oficial de Parámetros en Base de Datos
            </h4>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Tabla: <code>configuracion_sistema</code>
            </span>
          </div>

          <table className="custom-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Clave Parámetro</th>
                <th>Categoría</th>
                <th>Valor Actual</th>
                <th>Unidad</th>
                <th>Descripción Técnica</th>
                <th>Última Actualización</th>
              </tr>
            </thead>
            <tbody>
              {parametros.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code style={{ fontWeight: 800, color: '#0369a1', background: '#f0f9ff', padding: '2px 6px', borderRadius: 4 }}>
                      {p.clave}
                    </code>
                  </td>
                  <td>
                    <span className="badge-count" style={{ 
                      background: p.categoria === 'DOTACION' ? '#e0f2fe' : '#fef3c7',
                      color: p.categoria === 'DOTACION' ? '#0369a1' : '#b45309',
                      fontWeight: 700
                    }}>
                      {p.categoria}
                    </span>
                  </td>
                  <td>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>{p.valor}</strong>
                  </td>
                  <td style={{ color: '#475569', fontWeight: 600 }}>{p.unidad || '-'}</td>
                  <td style={{ color: '#334155' }}>{p.descripcion}</td>
                  <td style={{ fontSize: 11.5, color: '#64748b' }}>
                    {p.updated_at ? new Date(p.updated_at).toLocaleString('es-PE') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
