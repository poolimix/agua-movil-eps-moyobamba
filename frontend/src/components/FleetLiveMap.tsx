import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './FleetLiveMap.css';

export interface CisternaUbicacion {
  id: number;
  placa: string;
  marca_modelo: string;
  capacidad_m3: number | string;
  capacidad_litros: number | string;
  estado: string;
  codigo_gps?: string | null;
  latitud_actual?: number | string | null;
  longitud_actual?: number | string | null;
  enlace_gps_tracking?: string | null;
  ultima_actualizacion_gps?: string | null;
  conductor_habitual_nombre?: string | null;
  conductor_habitual_telefono?: string | null;
}

interface FleetLiveMapProps {
  cisternas: CisternaUbicacion[];
  onRefresh?: () => void;
}

// Centro de operaciones EPS Moyobamba
const MOYOBAMBA_CENTER: [number, number] = [-6.03417, -76.97139];

export default function FleetLiveMap({ cisternas = [], onRefresh }: FleetLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});
  const [selectedCisternaId, setSelectedCisternaId] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'OPERATIVO' | 'MANTENIMIENTO'>('TODOS');

  // Inicializar mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: MOYOBAMBA_CENTER,
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | EPS Moyobamba',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    // Invalida tamaño para asegurar renderizado correcto dentro de flexbox / grids
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Filtrar cisternas
  const filteredCisternas = cisternas.filter((c) => {
    if (filterEstado === 'TODOS') return true;
    return c.estado === filterEstado;
  });

  const cisternasConGps = filteredCisternas.filter(
    (c) => c.latitud_actual !== null && c.longitud_actual !== null && !isNaN(Number(c.latitud_actual)) && !isNaN(Number(c.longitud_actual))
  );

  // Actualizar marcadores cuando cambian los datos o filtros
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remover marcadores antiguos
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    const bounds: [number, number][] = [];

    cisternasConGps.forEach((c) => {
      const lat = Number(c.latitud_actual);
      const lng = Number(c.longitud_actual);
      bounds.push([lat, lng]);

      const isOperativo = c.estado === 'OPERATIVO';
      const pinColor = isOperativo ? '#10b981' : '#f59e0b';
      const pulseColor = isOperativo ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';

      // Icono HTML moderno y estilizado para cisterna
      const icon = L.divIcon({
        className: 'custom-fleet-marker-container',
        html: `
          <div class="fleet-marker-wrapper" style="--pulse-color: ${pulseColor};">
            <div class="fleet-marker-pulse"></div>
            <div class="fleet-marker-pin" style="background-color: ${pinColor};">
              <span class="fleet-marker-icon">🚛</span>
            </div>
            <div class="fleet-marker-plate">${c.placa}</div>
          </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 45],
        popupAnchor: [0, -42],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);

      // Popup informativo con detalle de la cisterna y acciones
      const popupHtml = `
        <div class="fleet-popup-card">
          <div class="fleet-popup-header" style="border-bottom: 2px solid ${pinColor};">
            <div class="fleet-popup-title">
              <strong>${c.placa}</strong>
              <span class="fleet-popup-status" style="background: ${isOperativo ? '#ecfdf5' : '#fffbeb'}; color: ${pinColor};">
                ${c.estado}
              </span>
            </div>
            <div class="fleet-popup-subtitle">${c.marca_modelo || 'Cisterna EPS'}</div>
          </div>
          <div class="fleet-popup-body">
            <div class="fleet-popup-row">
              <span class="fleet-popup-label">Capacidad:</span>
              <span class="fleet-popup-value"><strong>${c.capacidad_m3} m³</strong> (${Number(c.capacidad_litros).toLocaleString('es-PE')} L)</span>
            </div>
            <div class="fleet-popup-row">
              <span class="fleet-popup-label">Conductor:</span>
              <span class="fleet-popup-value">${c.conductor_habitual_nombre || 'No asignado'}</span>
            </div>
            ${c.conductor_habitual_telefono ? `
              <div class="fleet-popup-row">
                <span class="fleet-popup-label">Contacto:</span>
                <span class="fleet-popup-value"><a href="tel:${c.conductor_habitual_telefono}">📞 ${c.conductor_habitual_telefono}</a></span>
              </div>
            ` : ''}
            <div class="fleet-popup-row">
              <span class="fleet-popup-label">Dispositivo GPS:</span>
              <span class="fleet-popup-value font-mono">${c.codigo_gps || 'Integrado'}</span>
            </div>
            <div class="fleet-popup-row">
              <span class="fleet-popup-label">Coordenadas:</span>
              <span class="fleet-popup-value font-mono">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </div>
            ${c.ultima_actualizacion_gps ? `
              <div class="fleet-popup-row">
                <span class="fleet-popup-label">Última señal:</span>
                <span class="fleet-popup-value text-muted">${new Date(c.ultima_actualizacion_gps).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ` : ''}
          </div>
          <div class="fleet-popup-actions">
            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="btn-popup-gmaps">
              📍 Ver en Google Maps
            </a>
            ${c.enlace_gps_tracking ? `
              <a href="${c.enlace_gps_tracking}" target="_blank" rel="noopener noreferrer" class="btn-popup-tracking">
                🛰️ Plataforma GPS
              </a>
            ` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 300 });

      marker.on('click', () => {
        setSelectedCisternaId(c.id);
      });

      markersRef.current[c.id] = marker;
    });

    // Ajustar vista a las cisternas si existen
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    } else {
      map.setView(MOYOBAMBA_CENTER, 14);
    }
  }, [filteredCisternas.length, filterEstado]);

  // Centrar en cisterna seleccionada desde la lista lateral
  const handleSelectCisterna = (c: CisternaUbicacion) => {
    setSelectedCisternaId(c.id);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (c.latitud_actual && c.longitud_actual) {
      const lat = Number(c.latitud_actual);
      const lng = Number(c.longitud_actual);
      map.flyTo([lat, lng], 16, { duration: 1.2 });

      const marker = markersRef.current[c.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  return (
    <div className="fleet-live-map-card">
      <div className="fleet-map-header">
        <div className="fleet-map-title-wrap">
          <div className="fleet-radar-icon">
            <span className="radar-dot"></span>
            🛰️
          </div>
          <div>
            <h2 className="fleet-map-title">Monitoreo Satelital de Flota en Vivo</h2>
            <p className="fleet-map-subtitle">
              Posición GPS y telemetría en tiempo real de cisternas de distribución en Moyobamba
            </p>
          </div>
        </div>

        <div className="fleet-map-controls">
          <div className="fleet-filter-pills">
            <button
              type="button"
              className={`filter-pill ${filterEstado === 'TODOS' ? 'active' : ''}`}
              onClick={() => setFilterEstado('TODOS')}
            >
              Todas ({cisternas.length})
            </button>
            <button
              type="button"
              className={`filter-pill pill-success ${filterEstado === 'OPERATIVO' ? 'active' : ''}`}
              onClick={() => setFilterEstado('OPERATIVO')}
            >
              Operativas ({cisternas.filter((c) => c.estado === 'OPERATIVO').length})
            </button>
            <button
              type="button"
              className={`filter-pill pill-warning ${filterEstado === 'MANTENIMIENTO' ? 'active' : ''}`}
              onClick={() => setFilterEstado('MANTENIMIENTO')}
            >
              Mantenimiento ({cisternas.filter((c) => c.estado === 'MANTENIMIENTO').length})
            </button>
          </div>

          {onRefresh && (
            <button type="button" className="btn-fleet-refresh" onClick={onRefresh} title="Actualizar posiciones GPS">
              🔄 Refrescar
            </button>
          )}
        </div>
      </div>

      <div className="fleet-map-body-grid">
        {/* Contenedor del Mapa Leaflet */}
        <div className="fleet-map-canvas-container">
          <div ref={mapContainerRef} className="fleet-leaflet-map" />
          
          <div className="fleet-map-overlay-badge">
            <span className="live-indicator"></span>
            <span>{cisternasConGps.length} de {cisternas.length} con señal GPS activa</span>
          </div>
        </div>

        {/* Panel lateral con listado de camiones cisternas */}
        <div className="fleet-sidebar-list">
          <div className="fleet-sidebar-header">
            <h3>Unidades en Despacho</h3>
            <span className="units-count">{filteredCisternas.length} camiones</span>
          </div>

          <div className="fleet-units-scroll">
            {filteredCisternas.length === 0 ? (
              <div className="fleet-no-units">No hay cisternas para el filtro seleccionado.</div>
            ) : (
              filteredCisternas.map((c) => {
                const hasGps = c.latitud_actual !== null && c.longitud_actual !== null;
                const isSelected = selectedCisternaId === c.id;

                return (
                  <div
                    key={c.id}
                    className={`fleet-unit-item ${isSelected ? 'selected' : ''} ${c.estado === 'OPERATIVO' ? 'is-operativo' : 'is-mantenimiento'}`}
                    onClick={() => handleSelectCisterna(c)}
                  >
                    <div className="unit-item-top">
                      <div className="unit-plate-badge">
                        <span className="unit-icon">🚛</span>
                        <strong>{c.placa}</strong>
                      </div>
                      <span className={`unit-status-tag status-${c.estado.toLowerCase()}`}>
                        {c.estado}
                      </span>
                    </div>

                    <div className="unit-item-details">
                      <div className="unit-detail-row">
                        <span className="detail-label">Modelo:</span>
                        <span className="detail-val">{c.marca_modelo || 'Cisterna'}</span>
                      </div>
                      <div className="unit-detail-row">
                        <span className="detail-label">Capacidad:</span>
                        <span className="detail-val"><strong>{c.capacidad_m3} m³</strong> ({Number(c.capacidad_litros).toLocaleString('es-PE')} L)</span>
                      </div>
                      <div className="unit-detail-row">
                        <span className="detail-label">Chofer:</span>
                        <span className="detail-val">{c.conductor_habitual_nombre || 'Sin chofer fijo'}</span>
                      </div>
                    </div>

                    <div className="unit-item-foot">
                      {hasGps ? (
                        <span className="gps-status-active">
                          <span className="gps-dot active"></span>
                          GPS: {Number(c.latitud_actual).toFixed(4)}, {Number(c.longitud_actual).toFixed(4)}
                        </span>
                      ) : (
                        <span className="gps-status-inactive">
                          <span className="gps-dot inactive"></span>
                          GPS sin señal registrada
                        </span>
                      )}

                      {hasGps && (
                        <span className="btn-track-action" title="Centrar mapa en este vehículo">
                          🎯 Enfocar
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
