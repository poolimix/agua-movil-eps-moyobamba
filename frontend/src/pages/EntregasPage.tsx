import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import './Modules.css';

interface Entrega {
  id: number;
  local_id?: string;
  beneficiario_id: number;
  programacion_id: number;
  nombres_apellidos: string;
  dni: string;
  direccion: string;
  sector: string;
  zona: string;
  cisterna_placa?: string;
  cuota_programada?: number | string | null;
  litros_entregados: number | string;
  saldo_pendiente?: number | string | null;
  estado_entrega?: string | null;
  observaciones_entrega?: string | null;
  firma_base64: string;
  foto_url?: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  precision_gps?: number | string | null;
  altitud?: number | string | null;
  fecha_captura?: string;
  fecha_hora: string;
}

export default function EntregasPage() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; entrega?: Entrega } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    fetchEntregas();
  }, []);

  const fetchEntregas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/entregas');
      setEntregas(res.data);
    } catch (error) {
      console.error('Error fetching entregas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntrega = async (id: number) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar entrega?',
      message: '¿Estás seguro de eliminar este registro de entrega? Esta acción no se puede deshacer.',
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.delete(`/entregas/${id}`);
      fetchEntregas();
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar',
        message: 'No se pudo eliminar el registro de entrega.',
        type: 'danger',
      });
    }
  };

  const [selectedFecha, setSelectedFecha] = useState('');

  const filtered = entregas.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.nombres_apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.dni?.includes(searchTerm) ||
      e.sector?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.local_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const deliveryDateStr = (e.fecha_captura || e.fecha_hora || '').slice(0, 10);
    const matchesFecha = !selectedFecha || deliveryDateStr === selectedFecha;

    return matchesSearch && matchesFecha;
  });

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.append('search', searchTerm);
  if (selectedFecha) queryParams.append('fecha', selectedFecha);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

  return (
    <Layout>
      <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            <span>📋 FORMATO OFICIAL DE ENTREGA DE AGUA</span>
            <span>•</span>
            <span>EPS MOYOBAMBA S.A.</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Planilla de Entregas y Evidencia en Campo</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            Trazabilidad con firma digital, geolocalización satelital y formato oficial normativo de reparto en cisternas
          </p>
        </div>
        <div className="module-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={fetchEntregas} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="filters-card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: '#ffffff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 18 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por Beneficiario, DNI, Sector o Local ID..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ minWidth: 260, flex: '1 1 260px' }}
        />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Fecha:</span>
          <input
            type="date"
            value={selectedFecha}
            onChange={(e) => {
              setSelectedFecha(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 12,
              color: '#1e293b',
              fontWeight: 600,
              background: '#f8fafc'
            }}
          />
          {selectedFecha ? (
            <button
              type="button"
              onClick={() => setSelectedFecha('')}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Limpiar fecha"
            >
              ✕
            </button>
          ) : null}
        </div>

        <span className="badge-count" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>
          Total: {filtered.length} entregas
        </span>

        {/* Botones Oficiales Formato PDF y Formato Excel */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <a
            href={`${API_BASE_URL}/api/v1/entregas/export-pdf${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-action-compact"
            style={{
              padding: '8px 14px',
              fontSize: 12.5,
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              color: '#0369a1',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="Descargar FORMATO DE ENTREGA DE AGUA Oficial en PDF (Hoja membretada con firmas y cuadrícula reglamentaria)"
          >
            <span>📄</span> Formato Oficial PDF
          </a>

          <a
            href={`${API_BASE_URL}/api/v1/entregas/export-excel${queryString}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-action-compact"
            style={{
              padding: '8px 14px',
              fontSize: 12.5,
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              color: '#15803d',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="Descargar FORMATO DE ENTREGA DE AGUA Oficial en Excel (Estructura idéntica al documento físico)"
          >
            <span>📊</span> Formato Oficial Excel
          </a>
        </div>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID / Local ID</th>
              <th>Fecha y Hora</th>
              <th>Beneficiario</th>
              <th>Sector / Zona</th>
              <th>Volumen y Saldo</th>
              <th>Ubicación GPS Satelital</th>
              <th>Foto</th>
              <th>Firma Digital</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>⏳</span> Cargando planilla de entregas...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  <span>💧</span> No hay entregas registradas en campo aún.
                </td>
              </tr>
            ) : (
              paginatedData.map((e) => {
                const saldo = Number(e.saldo_pendiente || 0);
                const esParcial = e.estado_entrega === 'PARCIAL' || saldo > 0;

                return (
                  <tr key={e.id}>
                    <td>
                      <strong>#{e.id}</strong>
                      {e.local_id ? (
                        <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                          {e.local_id.slice(0, 14)}...
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {new Date(e.fecha_captura || e.fecha_hora).toLocaleDateString('es-PE')}
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {new Date(e.fecha_captura || e.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <strong>{e.nombres_apellidos || 'Beneficiario'}</strong>
                      <div style={{ fontSize: 11, color: '#64748b' }}>DNI: {e.dni}</div>
                    </td>
                    <td>
                      <span className="badge-count" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                        {e.sector || e.zona || 'Moyobamba'}
                      </span>
                    </td>
                    <td>
                      {esParcial ? (
                        <div>
                          <span className="badge-count" style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                            🟡 {e.litros_entregados} Lts (Parcial)
                          </span>
                          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 3 }}>
                            Quedan: {saldo} Lts pendientes
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Cuota: {e.cuota_programada || e.litros_entregados} Lts
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                            🟢 {e.litros_entregados} Lts (100%)
                          </span>
                          <div style={{ fontSize: 10.5, color: '#16a34a', marginTop: 2 }}>
                            Completa • Sin saldo
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {e.latitud && e.longitud ? (
                        <div>
                          <a
                            href={`https://www.google.com/maps?q=${e.latitud},${e.longitud}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: '#0284c7',
                              fontWeight: 600,
                              fontSize: 12,
                              textDecoration: 'none',
                            }}
                          >
                            📍 {parseFloat(String(e.latitud)).toFixed(5)}, {parseFloat(String(e.longitud)).toFixed(5)}
                          </a>
                          {e.precision_gps ? (
                            <div style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>
                              Precisión: ±{Math.round(Number(e.precision_gps))}m
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin coordenadas</span>
                      )}
                    </td>
                    <td>
                      {e.foto_url ? (
                        <img
                          src={`${API_BASE_URL}${e.foto_url}?t=${new Date(e.fecha_hora).getTime() || 1}`}
                          alt="Evidencia"
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 8,
                            objectFit: 'cover',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedPhoto({ url: `${API_BASE_URL}${e.foto_url}`, entrega: e })}
                          title="Clic para ampliar foto con membrete oficial"
                        />
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}>Sin foto</span>
                      )}
                    </td>
                    <td>
                      {e.firma_base64 && e.firma_base64.startsWith('data:image') ? (
                        <img
                          src={e.firma_base64}
                          alt="Firma"
                          style={{
                            height: 32,
                            maxWidth: 70,
                            cursor: 'pointer',
                            border: '1px solid #e2e8f0',
                            borderRadius: 4,
                            background: '#fff',
                          }}
                          onClick={() => setSelectedSignature(e.firma_base64)}
                          title="Clic para ver firma completa"
                        />
                      ) : (
                        <span style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>Sin firma (Opcional)</span>
                      )}
                    </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`${API_BASE_URL}/api/v1/entregas/${e.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary"
                        style={{
                          textDecoration: 'none',
                          padding: '4px 8px',
                          fontSize: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#0284c7',
                          fontWeight: 600
                        }}
                        title="Ver / Descargar Acta Oficial de Conformidad en PDF"
                      >
                        📄 Acta PDF
                      </a>
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteEntrega(e.id)}
                        title="Eliminar entrega"
                        style={{ padding: '4px 8px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

        {/* PAGINATION */}
        <Pagination
          currentPage={currentPage}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>

      {/* MODAL VER FOTO DE EVIDENCIA */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" style={{ maxWidth: 640, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📸 Fotografía de Evidencia en Campo (Membretada)</h2>
              <button className="close-btn" onClick={() => setSelectedPhoto(null)}>✕</button>
            </div>
            
            {selectedPhoto.entrega && (
              <div style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 14px',
                marginBottom: 12,
                fontSize: 12,
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px 12px'
              }}>
                <div><strong>👤 Beneficiario:</strong> {selectedPhoto.entrega.nombres_apellidos} (DNI: {selectedPhoto.entrega.dni})</div>
                <div><strong>🚛 Cisterna:</strong> {selectedPhoto.entrega.cisterna_placa || 'N/A'}</div>
                <div><strong>📍 Sector:</strong> {selectedPhoto.entrega.sector} - {selectedPhoto.entrega.direccion}</div>
                <div><strong>🌐 Coordenadas:</strong> Lat {selectedPhoto.entrega.latitud}, Long {selectedPhoto.entrega.longitud}</div>
              </div>
            )}

            <div style={{ background: '#0f172a', padding: 10, borderRadius: 12, overflow: 'hidden' }}>
              <img 
                src={`${selectedPhoto.url}?t=${Date.now()}`} 
                alt="Evidencia en campo membretada" 
                style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, display: 'block', margin: '0 auto' }} 
              />
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <a href={selectedPhoto.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                🔍 Ver en tamaño original
              </a>
              <button className="btn-secondary" onClick={() => setSelectedPhoto(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VER FIRMA COMPLETA */}
      {selectedSignature && (
        <div className="modal-overlay" onClick={() => setSelectedSignature(null)}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✍️ Firma Digital Capturada</h2>
              <button className="close-btn" onClick={() => setSelectedSignature(null)}>✕</button>
            </div>
            <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px dashed #cbd5e1' }}>
              <img src={selectedSignature} alt="Firma completa" style={{ maxWidth: '100%', maxHeight: 200 }} />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedSignature(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
