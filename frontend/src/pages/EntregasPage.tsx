import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api, { API_BASE_URL } from '../config/api';
import { dialogConfirm, dialogAlert } from '../context/DialogContext';
import './Modules.css';

interface Entrega {
  id: number;
  local_id?: string;
  lote_deposito_id?: string | null;
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
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string | null; entrega: Entrega; cacheBust?: number } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [estamparMembrete, setEstamparMembrete] = useState(true);
  const [targetEntregaForUpload, setTargetEntregaForUpload] = useState<Entrega | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado para Entrega en Depósito Único por Sector
  const [depositoModalOpen, setDepositoModalOpen] = useState(false);
  const [beneficiariosList, setBeneficiariosList] = useState<any[]>([]);
  const [programacionesList, setProgramacionesList] = useState<any[]>([]);
  const [sectorDeposito, setSectorDeposito] = useState('');
  const [programacionIdDeposito, setProgramacionIdDeposito] = useState<string>('');
  const [litrosTotalesDeposito, setLitrosTotalesDeposito] = useState('19000');
  const [fechaDeposito, setFechaDeposito] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacionesDeposito, setObservacionesDeposito] = useState('');
  const [selectedBenefIdsDeposito, setSelectedBenefIdsDeposito] = useState<number[]>([]);
  const [searchBenefDeposito, setSearchBenefDeposito] = useState('');
  const [fotoDepositoFile, setFotoDepositoFile] = useState<File | null>(null);
  const [savingDeposito, setSavingDeposito] = useState(false);

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

  const triggerPhotoSelector = (entrega: Entrega) => {
    setTargetEntregaForUpload(entrega);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const entregaTarget = targetEntregaForUpload || selectedPhoto?.entrega;
    if (!file || !entregaTarget) return;

    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append('foto', file);
      formData.append('localId', entregaTarget.local_id || `web-${entregaTarget.id}`);
      formData.append('estampar_membrete', String(estamparMembrete));

      const res = await api.post(`/entregas/${entregaTarget.id}/foto`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newFotoUrl: string = res.data.foto_url;
      const nowBust = Date.now();

      setEntregas((prev) =>
        prev.map((item) =>
          item.id === entregaTarget.id ? { ...item, foto_url: newFotoUrl } : item
        )
      );

      setSelectedPhoto({
        url: `${API_BASE_URL}${newFotoUrl}`,
        entrega: { ...entregaTarget, foto_url: newFotoUrl },
        cacheBust: nowBust,
      });

      await dialogAlert({
        title: 'Fotografía actualizada',
        message: '✅ La fotografía de evidencia se guardó correctamente.',
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al subir fotografía',
        message: error.response?.data?.message || 'No se pudo subir la imagen seleccionada.',
        type: 'danger',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [selectedFecha, setSelectedFecha] = useState('');

  const handleOpenDepositoModal = async () => {
    try {
      const [benefRes, progRes] = await Promise.all([
        api.get('/beneficiarios?limit=5000'),
        api.get('/programaciones'),
      ]);
      const benefs = Array.isArray(benefRes.data) ? benefRes.data : benefRes.data?.data || [];
      const progs = Array.isArray(progRes.data) ? progRes.data : [];
      setBeneficiariosList(benefs);
      setProgramacionesList(progs);

      const sectoresUnicos = Array.from(
        new Set(benefs.map((b: any) => (b.sector || '').trim()).filter(Boolean))
      ) as string[];
      const initialSector = sectoresUnicos[0] || '';
      setSectorDeposito(initialSector);

      const idsSector = benefs
        .filter((b: any) => (b.sector || '').trim().toUpperCase() === initialSector.toUpperCase())
        .map((b: any) => Number(b.id));
      setSelectedBenefIdsDeposito(idsSector);

      if (progs.length > 0 && !programacionIdDeposito) {
        setProgramacionIdDeposito(String(progs[0].id));
      }
      setSearchBenefDeposito('');
      setFotoDepositoFile(null);
      setDepositoModalOpen(true);
    } catch (err) {
      await dialogAlert({
        title: 'Error al cargar padrón',
        message: 'No se pudo cargar la lista de beneficiarios y sectores.',
        type: 'danger',
      });
    }
  };

  const handleChangeSectorDepositoWeb = (nuevoSector: string) => {
    setSectorDeposito(nuevoSector);
    const idsSector = beneficiariosList
      .filter((b: any) => (b.sector || '').trim().toUpperCase() === nuevoSector.toUpperCase())
      .map((b: any) => Number(b.id));
    setSelectedBenefIdsDeposito(idsSector);
  };

  const handleToggleBenefDepositoWeb = (id: number) => {
    setSelectedBenefIdsDeposito((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitDepositoSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const litrosNum = Number(litrosTotalesDeposito);
    if (!sectorDeposito) {
      await dialogAlert({ title: 'Sector requerido', message: 'Selecciona el sector de entrega.', type: 'warning' });
      return;
    }
    if (!litrosNum || litrosNum <= 0) {
      await dialogAlert({ title: 'Volumen inválido', message: 'Ingresa la cantidad total de litros entregados en el depósito.', type: 'warning' });
      return;
    }
    if (selectedBenefIdsDeposito.length === 0) {
      await dialogAlert({ title: 'Sin beneficiarios', message: 'Debes mantener al menos un beneficiario marcado.', type: 'warning' });
      return;
    }

    const totalSector = beneficiariosList.filter(
      (b: any) => (b.sector || '').trim().toUpperCase() === sectorDeposito.toUpperCase()
    ).length;
    const excluidos = totalSector - selectedBenefIdsDeposito.length;
    const litrosPorBenef = Math.round((litrosNum / selectedBenefIdsDeposito.length) * 100) / 100;

    const ok = await dialogConfirm({
      title: '¿Confirmar Entrega en Depósito Único por Sector?',
      message: `Sector: ${sectorDeposito}\nAgua Total Depósito: ${litrosNum.toLocaleString('es-PE')} Lts (${(litrosNum / 1000).toFixed(2)} m³)\nBeneficiarios marcados: ${selectedBenefIdsDeposito.length} de ${totalSector}${excluidos > 0 ? ` (${excluidos} desmarcados para otro depósito)` : ''}\nDivisión automática: ${litrosPorBenef} Lts por beneficiario.`,
      type: 'info',
      confirmText: 'Sí, Registrar Entrega Completa',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      setSavingDeposito(true);
      const buildFormData = (forceSecondTrip = false) => {
        const fd = new FormData();
        fd.append('sector', sectorDeposito);
        if (programacionIdDeposito) fd.append('programacion_id', programacionIdDeposito);
        fd.append('litros_totales_deposito', String(litrosNum));
        fd.append('beneficiario_ids', JSON.stringify(selectedBenefIdsDeposito));
        fd.append('fecha_entrega', fechaDeposito);
        fd.append(
          'observaciones',
          observacionesDeposito ||
            `ENTREGA COMPLETA EN DEPÓSITO ÚNICO (${sectorDeposito}): ${litrosNum} Lts ÷ ${selectedBenefIdsDeposito.length} benef. = ${litrosPorBenef} Lts/benef.`
        );
        if (forceSecondTrip) {
          fd.append('forzar_segundo_viaje', 'true');
        }
        if (fotoDepositoFile) {
          fd.append('foto', fotoDepositoFile);
        }
        return fd;
      };

      let res;
      try {
        res = await api.post('/entregas/entrega-grupal-sector', buildFormData(false), {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (firstErr: any) {
        if (firstErr.response?.status === 409 && firstErr.response?.data?.code === 'DUPLICATE_SECTOR_DAY') {
          const confirmDup = await dialogConfirm({
            title: '⚠️ Entrega ya registrada hoy en este sector',
            message:
              firstErr.response.data.message ||
              'Ya existe una entrega de depósito único para este sector en la fecha seleccionada. ¿Se trata de un segundo viaje de cisterna en el mismo día?',
            type: 'warning',
            confirmText: 'Sí, es un 2.º viaje (Registrar)',
            cancelText: 'No, cancelar para no duplicar',
          });
          if (!confirmDup) {
            setSavingDeposito(false);
            return;
          }
          res = await api.post('/entregas/entrega-grupal-sector', buildFormData(true), {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          throw firstErr;
        }
      }

      setDepositoModalOpen(false);
      await fetchEntregas();
      await dialogAlert({
        title: 'Entrega en Depósito Único Registrada',
        message: res.data?.message || `Se registró la entrega completa para ${selectedBenefIdsDeposito.length} beneficiarios (${litrosPorBenef} Lts c/u).`,
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al registrar entrega grupal',
        message: error.response?.data?.message || 'No se pudo completar el registro.',
        type: 'danger',
      });
    } finally {
      setSavingDeposito(false);
    }
  };

  const handleDeleteLoteDeposito = async (loteId: string, sectorName: string) => {
    const ok = await dialogConfirm({
      title: '¿Eliminar lote completo de Depósito Único?',
      message: `Se eliminarán simultáneamente TODAS las entregas individuales generadas por el lote "${loteId}" del sector ${sectorName}. Esta acción es ideal si hubo un error al registrar el depósito.`,
      type: 'danger',
      confirmText: 'Sí, eliminar todo el lote',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    try {
      const res = await api.delete(`/entregas/lote/${encodeURIComponent(loteId)}`);
      await fetchEntregas();
      await dialogAlert({
        title: 'Lote eliminado',
        message: res.data?.message || 'Se eliminaron todos los registros del lote correctamente.',
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al eliminar lote',
        message: error.response?.data?.message || 'No se pudo eliminar el lote.',
        type: 'danger',
      });
    }
  };

  const handleEditLoteDeposito = async (loteId: string, sectorName: string) => {
    const input = window.prompt(
      `Ingrese el nuevo volumen total (en Litros) entregado en el depósito único del sector ${sectorName} (Lote: ${loteId}):`,
      '19000'
    );
    if (!input) return;
    const nuevoTotal = parseFloat(input);
    if (isNaN(nuevoTotal) || nuevoTotal <= 0) {
      await dialogAlert({
        title: 'Valor inválido',
        message: 'Debe ingresar un número de litros mayor a 0.',
        type: 'warning',
      });
      return;
    }

    try {
      const res = await api.put(`/entregas/lote/${encodeURIComponent(loteId)}`, {
        litros_totales_deposito: nuevoTotal,
      });
      await fetchEntregas();
      await dialogAlert({
        title: 'Lote actualizado',
        message: res.data?.message || 'Se recalcularon los litros de todos los beneficiarios del lote.',
        type: 'success',
      });
    } catch (error: any) {
      await dialogAlert({
        title: 'Error al actualizar lote',
        message: error.response?.data?.message || 'No se pudo actualizar el lote.',
        type: 'danger',
      });
    }
  };

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
          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenDepositoModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#0d9488',
              borderColor: '#0d9488',
              fontWeight: 700,
            }}
          >
            🚰 Entrega Completa en Depósito Único por Sector
          </button>
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
                          {e.lote_deposito_id && (
                            <div
                              style={{
                                marginTop: 4,
                                display: 'inline-block',
                                background: '#ccfbf1',
                                color: '#0f766e',
                                border: '1px solid #99f6e4',
                                borderRadius: 6,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                              title={`Lote de Depósito Único: ${e.lote_deposito_id}`}
                            >
                              🚰 Depósito Único
                            </div>
                          )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                            onClick={() => setSelectedPhoto({ url: `${API_BASE_URL}${e.foto_url}`, entrega: e, cacheBust: Date.now() })}
                            title="Clic para ampliar o cambiar foto"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPhoto({ url: `${API_BASE_URL}${e.foto_url}`, entrega: e, cacheBust: Date.now() });
                              triggerPhotoSelector(e);
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1d4ed8',
                              borderRadius: 6,
                              padding: '4px 7px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Cambiar fotografía de evidencia"
                          >
                            📷 Cambiar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPhoto({ url: null, entrega: e, cacheBust: Date.now() });
                            triggerPhotoSelector(e);
                          }}
                          style={{
                            background: '#fef2f2',
                            border: '1px dashed #f87171',
                            color: '#dc2626',
                            borderRadius: 6,
                            padding: '5px 9px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Subir nueva fotografía de evidencia"
                        >
                          📷 Subir foto
                        </button>
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                      {e.lote_deposito_id && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleEditLoteDeposito(e.lote_deposito_id!, e.sector || 'Sector')}
                            title="Editar litros totales del Lote de Depósito Único (recalcula todos los beneficiarios del lote)"
                            style={{ padding: '4px 8px', fontSize: 11, color: '#0f766e', borderColor: '#99f6e4', background: '#f0fdfa', fontWeight: 700 }}
                          >
                            ✏️ Lote
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDeleteLoteDeposito(e.lote_deposito_id!, e.sector || 'Sector')}
                            title="Eliminar todo el Lote de Depósito Único en un solo clic"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                          >
                            🗑️ Lote
                          </button>
                        </>
                      )}
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteEntrega(e.id)}
                        title="Eliminar esta entrega individual"
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

      {/* INPUT OCULTO PARA SUBIR / CAMBIAR FOTO */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        style={{ display: 'none' }}
        onChange={handlePhotoFileChange}
      />

      {/* MODAL VER / CAMBIAR FOTO DE EVIDENCIA */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => !uploadingPhoto && setSelectedPhoto(null)}>
          <div className="modal-content" style={{ maxWidth: 640, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📸 Fotografía de Evidencia en Campo (Membretada)</h2>
              <button className="close-btn" onClick={() => !uploadingPhoto && setSelectedPhoto(null)}>✕</button>
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
                <div><strong>🚛 Cisterna:</strong> {selectedPhoto.entrega.cisterna_placa || 'CAT-849'}</div>
                <div><strong>📍 Sector:</strong> {selectedPhoto.entrega.sector} - {selectedPhoto.entrega.direccion}</div>
                <div><strong>🌐 Coordenadas:</strong> Lat {selectedPhoto.entrega.latitud}, Long {selectedPhoto.entrega.longitud}</div>
              </div>
            )}

            <div style={{ background: '#0f172a', padding: 10, borderRadius: 12, overflow: 'hidden', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedPhoto.url ? (
                <img 
                  src={`${selectedPhoto.url}?t=${selectedPhoto.cacheBust || Date.now()}`} 
                  alt="Evidencia en campo membretada" 
                  style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, display: 'block', margin: '0 auto' }} 
                />
              ) : (
                <div style={{ color: '#94a3b8', padding: 32, fontSize: 13 }}>
                  📷 Esta entrega aún no tiene fotografía registrada. Haz clic en <strong>"Subir Nueva Foto"</strong> para agregarla.
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={estamparMembrete}
                  onChange={(e) => setEstamparMembrete(e.target.checked)}
                />
                Estampar membrete oficial GPS / EPS Moyobamba en la nueva foto
              </label>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={uploadingPhoto}
                onClick={() => triggerPhotoSelector(selectedPhoto.entrega)}
                style={{ background: '#0284c7', borderColor: '#0284c7' }}
              >
                {uploadingPhoto
                  ? '⏳ Subiendo foto...'
                  : selectedPhoto.url
                    ? '📷 Cambiar Foto'
                    : '📷 Subir Nueva Foto'}
              </button>

              {selectedPhoto.url && (
                <a
                  href={`${selectedPhoto.url}?t=${selectedPhoto.cacheBust || Date.now()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ textDecoration: 'none', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 700 }}
                >
                  🔍 Ver en tamaño original
                </a>
              )}

              <button className="btn-secondary" disabled={uploadingPhoto} onClick={() => setSelectedPhoto(null)}>
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

      {/* MODAL ENTREGA COMPLETA EN UN SOLO DEPÓSITO DIARIO POR SECTOR */}
      {depositoModalOpen && (() => {
        const sectoresDisponibles = Array.from(
          new Set(beneficiariosList.map((b: any) => (b.sector || '').trim()).filter(Boolean))
        ) as string[];

        const benefsDelSector = beneficiariosList.filter(
          (b: any) => (b.sector || '').trim().toUpperCase() === sectorDeposito.toUpperCase()
        );

        const benefsFiltrados = benefsDelSector.filter((b: any) => {
          if (!searchBenefDeposito.trim()) return true;
          const q = searchBenefDeposito.toLowerCase();
          return (
            (b.nombres_apellidos || '').toLowerCase().includes(q) ||
            (b.dni || '').includes(q) ||
            (b.direccion || '').toLowerCase().includes(q)
          );
        });

        const totalMarcados = selectedBenefIdsDeposito.length;
        const litrosNum = Number(litrosTotalesDeposito || 0);
        const litrosPorBenef = totalMarcados > 0 ? Math.round((litrosNum / totalMarcados) * 100) / 100 : 0;

        return (
          <div className="modal-overlay" onClick={() => !savingDeposito && setDepositoModalOpen(false)}>
            <div
              className="modal-content"
              style={{ maxWidth: 740, maxHeight: '92vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h2 style={{ margin: 0 }}>🚰 Entrega Completa en Depósito Único por Sector</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    Marca automáticamente a todos los beneficiarios del sector, permite desmarcar casos especiales y divide el agua entregada entre el número de beneficiarios marcados.
                  </p>
                </div>
                <button className="close-btn" onClick={() => !savingDeposito && setDepositoModalOpen(false)}>✕</button>
              </div>

              <form onSubmit={handleSubmitDepositoSector}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>1. Sector de Entrega *</label>
                    <select
                      value={sectorDeposito}
                      onChange={(e) => handleChangeSectorDepositoWeb(e.target.value)}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}
                    >
                      {sectoresDisponibles.map((sec) => (
                        <option key={sec} value={sec}>
                          📍 {sec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Programación Mensual</label>
                    <select
                      value={programacionIdDeposito}
                      onChange={(e) => setProgramacionIdDeposito(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    >
                      {programacionesList.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre_programa || `${p.mes_nombre || ''} ${p.anio || ''}`} (#{p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>2. Agua Total Entregada en el Depósito (Litros) *</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={litrosTotalesDeposito}
                      onChange={(e) => setLitrosTotalesDeposito(e.target.value)}
                      required
                      placeholder="Ej. 19000"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #0d9488', fontWeight: 800, fontSize: 15, color: '#0f766e' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {['5000', '10000', '15000', '19000', '34000'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setLitrosTotalesDeposito(preset)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: litrosTotalesDeposito === preset ? '1px solid #0d9488' : '1px solid #cbd5e1',
                            background: litrosTotalesDeposito === preset ? '#ccfbf1' : '#f8fafc',
                            color: litrosTotalesDeposito === preset ? '#0f766e' : '#475569',
                          }}
                        >
                          {Number(preset) / 1000} m³ ({Number(preset).toLocaleString('es-PE')} L)
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Fecha de Entrega del Día *</label>
                    <input
                      type="date"
                      value={fechaDeposito}
                      onChange={(e) => setFechaDeposito(e.target.value)}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600 }}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      Alimenta automáticamente los reportes diarios, semanales y mensuales.
                    </div>
                  </div>
                </div>

                {/* RESUMEN DE DIVISIÓN AUTOMÁTICA */}
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1.5px solid #5eead4',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                      📊 División Automática por Beneficiario (Entrega del Día)
                    </div>
                    <div style={{ fontSize: 13, color: '#134e4a', marginTop: 2 }}>
                      <strong>{litrosNum.toLocaleString('es-PE')} Lts</strong> ÷ <strong>{totalMarcados} beneficiarios marcados</strong>
                      {benefsDelSector.length - totalMarcados > 0 && (
                        <span style={{ color: '#b45309', fontWeight: 700, marginLeft: 8 }}>
                          ({benefsDelSector.length - totalMarcados} desmarcado(s) para otro depósito)
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#0d9488',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: 10,
                      fontWeight: 900,
                      fontSize: 16,
                    }}
                  >
                    {litrosPorBenef.toLocaleString('es-PE')} Lts / benef.
                  </div>
                </div>

                {/* LISTA DE BENEFICIARIOS CON OPCIÓN DE DESMARCAR CASOS ESPECIALES */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <label style={{ fontWeight: 800, fontSize: 12.5, color: '#1e293b' }}>
                      3. Beneficiarios del Sector ({totalMarcados} de {benefsDelSector.length} marcados)
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedBenefIdsDeposito(benefsDelSector.map((b: any) => Number(b.id)))}
                        style={{
                          background: '#dcfce7',
                          border: '1px solid #86efac',
                          color: '#166534',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ☑ Marcar Todos ({benefsDelSector.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBenefIdsDeposito([])}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          color: '#991b1b',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ☐ Desmarcar Todos
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="🔍 Buscar beneficiario para desmarcar en caso especial (recibe en otro depósito)..."
                    value={searchBenefDeposito}
                    onChange={(e) => setSearchBenefDeposito(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  />

                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      background: '#f8fafc',
                      padding: 6,
                    }}
                  >
                    {benefsFiltrados.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                        No se encontraron beneficiarios con ese criterio en este sector.
                      </div>
                    ) : (
                      benefsFiltrados.map((b: any) => {
                        const bId = Number(b.id);
                        const isChecked = selectedBenefIdsDeposito.includes(bId);
                        return (
                          <label
                            key={bId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              borderRadius: 8,
                              marginBottom: 4,
                              cursor: 'pointer',
                              background: isChecked ? '#ffffff' : '#fef3c7',
                              border: isChecked ? '1px solid #e2e8f0' : '1px solid #fcd34d',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleBenefDepositoWeb(bId)}
                                style={{ width: 16, height: 16, accentColor: '#0d9488', cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: isChecked ? '#0f172a' : '#92400e', textDecoration: isChecked ? 'none' : 'line-through' }}>
                                  {b.nombres_apellidos}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  DNI: {b.dni || 'S/N'} • {b.direccion || b.sector}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: isChecked ? '#ccfbf1' : '#fde68a',
                                color: isChecked ? '#0f766e' : '#b45309',
                              }}
                            >
                              {isChecked ? `${litrosPorBenef} Lts` : 'Otro depósito'}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Fotografía del Depósito (Opcional)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      onChange={(e) => setFotoDepositoFile(e.target.files?.[0] || null)}
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: 12 }}>Observación (Opcional)</label>
                    <input
                      type="text"
                      value={observacionesDeposito}
                      onChange={(e) => setObservacionesDeposito(e.target.value)}
                      placeholder="Ej. Entrega en reservorio comunal del sector"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={savingDeposito}
                    onClick={() => setDepositoModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingDeposito || totalMarcados === 0}
                    style={{ background: '#0d9488', borderColor: '#0d9488', fontWeight: 800 }}
                  >
                    {savingDeposito
                      ? '⏳ Registrando entregas...'
                      : `✅ Registrar Entrega (${totalMarcados} benef. • ${litrosPorBenef} Lts c/u)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
