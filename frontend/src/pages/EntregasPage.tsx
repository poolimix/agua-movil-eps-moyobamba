import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import axios from 'axios';
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
  litros_entregados: number | string;
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
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    fetchEntregas();
  }, []);

  const fetchEntregas = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:3000/api/v1/entregas');
      setEntregas(res.data);
    } catch (error) {
      console.error('Error fetching entregas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntrega = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro de entrega?')) return;
    try {
      await axios.delete(`http://localhost:3000/api/v1/entregas/${id}`);
      fetchEntregas();
    } catch (error: any) {
      alert('Error al eliminar entrega');
    }
  };

  const filtered = entregas.filter(
    (e) =>
      e.nombres_apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.dni?.includes(searchTerm) ||
      e.sector?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.local_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Layout>
      <div className="module-header">
        <div>
          <h1>Planilla de Entregas y Evidencia en Campo</h1>
          <p>Trazabilidad con evidencia fotográfica, satelital GPS y firmas digitales sincronizadas - EPS Moyobamba</p>
        </div>
        <div className="module-actions">
          <button className="btn-secondary" onClick={fetchEntregas}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="filters-card">
        <input
          type="text"
          placeholder="🔍 Buscar por Beneficiario, DNI, Sector o Local ID..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="search-input"
          style={{ width: 360 }}
        />
        <span className="badge-count">Total: {filtered.length} entregas</span>
      </div>

      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID / Local ID</th>
              <th>Fecha y Hora</th>
              <th>Beneficiario</th>
              <th>Sector / Zona</th>
              <th>Litros</th>
              <th>Ubicación GPS Satelital</th>
              <th>Foto Evidencia</th>
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
              paginatedData.map((e) => (
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
                    <span className="badge-count" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                      {e.litros_entregados} Lts
                    </span>
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
                        src={`http://localhost:3000${e.foto_url}`}
                        alt="Evidencia"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          objectFit: 'cover',
                          border: '1px solid #cbd5e1',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedPhoto(`http://localhost:3000${e.foto_url}`)}
                        title="Clic para ampliar foto"
                      />
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin foto</span>
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
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin firma</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`http://localhost:3000/api/v1/entregas/${e.id}/pdf`}
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
              ))
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
          <div className="modal-content" style={{ maxWidth: 560, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📸 Fotografía de Evidencia en Campo</h2>
              <button className="close-btn" onClick={() => setSelectedPhoto(null)}>✕</button>
            </div>
            <div style={{ background: '#0f172a', padding: 12, borderRadius: 12, overflow: 'hidden' }}>
              <img src={selectedPhoto} alt="Evidencia en grande" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8 }} />
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <a href={selectedPhoto} target="_blank" rel="noopener noreferrer" className="btn-primary">
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
