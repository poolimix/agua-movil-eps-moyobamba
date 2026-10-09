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
  onSelectCisterna?: (placa: string | null) => void;
  selectedCisternaPlaca?: string | null;
  focusCoords?: { lat: number; lng: number; label?: string } | null;
}

// Centro de operaciones EPS Moyobamba
const MOYOBAMBA_CENTER: [number, number] = [-6.03417, -76.97139];

export type MapTileMode = 'HYBRID' | 'STREETS' | 'DARK' | 'OSM';

export default function FleetLiveMap({
  cisternas = [],
  onRefresh,
  onSelectCisterna,
  selectedCisternaPlaca,
  focusCoords,
}: FleetLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});
  const activeTileLayersRef = useRef<L.Layer[]>([]);
  const hasAutoCenteredRef = useRef<boolean>(false);

  const [mapReady, setMapReady] = useState(false);
  const [tileMode, setTileMode] = useState<MapTileMode>('HYBRID');
  const [selectedCisternaId, setSelectedCisternaId] = useState<number | null>(null);
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'OPERATIVO' | 'MANTENIMIENTO'>('TODOS');

  // Inicializar mapa de Leaflet una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: MOYOBAMBA_CENTER,
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Manejar cambio de tipo de mapa (Satélite HD / Calles Modernas / Radar Oscuro / Estándar)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remover capas de mapas anteriores
    activeTileLayersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    activeTileLayersRef.current = [];

    if (tileMode === 'HYBRID') {
      // Satélite Esri World Imagery + Capa de Calles y Nombres Híbrida
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        }
      );
      const labelsLayer = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Labels &copy; Esri',
          maxZoom: 19,
        }
      );
      satLayer.addTo(map);
      labelsLayer.addTo(map);
      activeTileLayersRef.current = [satLayer, labelsLayer];
    } else if (tileMode === 'STREETS') {
      // CartoDB Voyager (Calles limpias de alta resolución y legibilidad)
      const streetsLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; CARTO &copy; OpenStreetMap contributors',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      );
      streetsLayer.addTo(map);
      activeTileLayersRef.current = [streetsLayer];
    } else if (tileMode === 'DARK') {
      // CartoDB Dark Matter (Estilo centro de control nocturno)
      const darkLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; CARTO &copy; OpenStreetMap contributors',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      );
      darkLayer.addTo(map);
      activeTileLayersRef.current = [darkLayer];
    } else {
      // OpenStreetMap Estándar
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap | EPS Moyobamba',
        maxZoom: 19,
      });
      osmLayer.addTo(map);
      activeTileLayersRef.current = [osmLayer];
    }
  }, [mapReady, tileMode]);

  // Reaccionar a coordenadas de foco exterior (ej. desde entregas)
  useEffect(() => {
    if (focusCoords && mapInstanceRef.current && focusCoords.lat && focusCoords.lng) {
      mapInstanceRef.current.flyTo([focusCoords.lat, focusCoords.lng], 16, { duration: 1.2 });
      L.popup()
        .setLatLng([focusCoords.lat, focusCoords.lng])
        .setContent(`<strong>📍 Entrega Georreferenciada</strong><br/>${focusCoords.label || ''}`)
        .openOn(mapInstanceRef.current);
    }
  }, [focusCoords]);

  // Filtrar cisternas
  const filteredCisternas = cisternas.filter((c) => {
    if (filterEstado === 'TODOS') return true;
    return c.estado === filterEstado;
  });

  const cisternasConGps = filteredCisternas.filter(
    (c) =>
      c.latitud_actual !== null &&
      c.longitud_actual !== null &&
      !isNaN(Number(c.latitud_actual)) &&
      !isNaN(Number(c.longitud_actual)) &&
      Number(c.latitud_actual) !== 0 &&
      Number(c.longitud_actual) !== 0
  );

  // Clave reactiva para asegurar que cualquier cambio en coordenadas actualice el mapa
  const coordsFingerprint = cisternasConGps
    .map((c) => `${c.id}:${c.latitud_actual}:${c.longitud_actual}:${c.estado}:${c.placa}`)
    .join(';');

  // Renderizar y sincronizar marcadores de cisternas
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remover marcadores anteriores
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    const bounds: [number, number][] = [];

    cisternasConGps.forEach((c) => {
      const lat = Number(c.latitud_actual);
      const lng = Number(c.longitud_actual);
      bounds.push([lat, lng]);

      const isOperativo = c.estado === 'OPERATIVO';
      const pinColor = isOperativo ? '#10b981' : '#f59e0b';
      const pulseColor = isOperativo ? 'rgba(16, 185, 129, 0.45)' : 'rgba(245, 158, 11, 0.45)';

      // Icono HTML moderno y estilizado para cisterna con pulso radar en vivo
      const icon = L.divIcon({
        className: 'custom-fleet-marker-container',
        html: `
          <div class="fleet-marker-wrapper" style="--pulse-color: ${pulseColor};">
            <div class="fleet-marker-pulse"></div>
            <div class="fleet-marker-pin" style="background-color: ${pinColor};">
              <span class="fleet-marker-truck">🚛</span>
              <span class="fleet-marker-live-dot"></span>
            </div>
            <div class="fleet-marker-plate-pill">
              <span class="plate-text">${c.placa}</span>
              <span class="status-micro">${isOperativo ? 'EN RUTA' : c.estado}</span>
            </div>
          </div>
        `,
        iconSize: [80, 80],
        iconAnchor: [40, 50],
        popupAnchor: [0, -48],
      });

      const marker = L.marker([lat, lng], { icon, title: `Cisterna ${c.placa} - EPS Moyobamba` }).addTo(map);

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
              <span class="fleet-popup-label">Telemetría GPS:</span>
              <span class="fleet-popup-value font-mono font-bold text-emerald">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </div>
            ${c.ultima_actualizacion_gps ? `
              <div class="fleet-popup-row">
                <span class="fleet-popup-label">Última señal:</span>
                <span class="fleet-popup-value text-muted">${new Date(c.ultima_actualizacion_gps).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            ` : ''}
          </div>
          <div class="fleet-popup-actions">
            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="btn-popup-gmaps">
              📍 Ver en Google Maps
            </a>
            ${c.enlace_gps_tracking ? `
              <a href="${c.enlace_gps_tracking}" target="_blank" rel="noopener noreferrer" class="btn-popup-tracking">
                🛰️ Abrir Volvo Connect
              </a>
            ` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 320 });

      marker.on('click', () => {
        setSelectedCisternaId(c.id);
        onSelectCisterna?.(c.placa);
      });

      markersRef.current[c.id] = marker;
    });

    // Auto-centrar en la flota con animación la primera vez que se cargan coordenadas
    if (bounds.length > 0 && !hasAutoCenteredRef.current) {
      hasAutoCenteredRef.current = true;
      if (bounds.length === 1) {
        map.flyTo(bounds[0], 15, { duration: 1.5 });
      } else {
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 });
      }
    }
  }, [mapReady, coordsFingerprint, filterEstado]);

  // Centrar en una cisterna específica
  const handleSelectCisterna = (c: CisternaUbicacion) => {
    setSelectedCisternaId(c.id);
    onSelectCisterna?.(c.placa);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (c.latitud_actual && c.longitud_actual) {
      const lat = Number(c.latitud_actual);
      const lng = Number(c.longitud_actual);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 16, { duration: 1.3 });

        const marker = markersRef.current[c.id];
        if (marker) {
          setTimeout(() => marker.openPopup(), 400);
        }
      }
    }
  };

  // Función para re-enfocar la flota en cualquier momento
  const handleFitFleet = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (cisternasConGps.length === 1) {
      const c = cisternasConGps[0];
      map.flyTo([Number(c.latitud_actual), Number(c.longitud_actual)], 16, { duration: 1.3 });
      markersRef.current[c.id]?.openPopup();
    } else if (cisternasConGps.length > 1) {
      const bounds: [number, number][] = cisternasConGps.map((c) => [
        Number(c.latitud_actual),
        Number(c.longitud_actual),
      ]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else {
      map.flyTo(MOYOBAMBA_CENTER, 14, { duration: 1.3 });
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
          {/* Selector de capa de mapa */}
          <div className="fleet-tile-selector" title="Cambiar tipo de mapa">
            <button
              type="button"
              className={`btn-tile-mode ${tileMode === 'HYBRID' ? 'active' : ''}`}
              onClick={() => setTileMode('HYBRID')}
            >
              🛰️ Satélite HD
            </button>
            <button
              type="button"
              className={`btn-tile-mode ${tileMode === 'STREETS' ? 'active' : ''}`}
              onClick={() => setTileMode('STREETS')}
            >
              🗺️ Calles HD
            </button>
            <button
              type="button"
              className={`btn-tile-mode ${tileMode === 'DARK' ? 'active' : ''}`}
              onClick={() => setTileMode('DARK')}
            >
              🌙 Radar Oscuro
            </button>
          </div>

          <div className="fleet-filter-pills">
            <button
              type="button"
              className={`pill-btn ${filterEstado === 'TODOS' ? 'active' : ''}`}
              onClick={() => setFilterEstado('TODOS')}
            >
              Todas ({cisternas.length})
            </button>
            <button
              type="button"
              className={`pill-btn ${filterEstado === 'OPERATIVO' ? 'active' : ''}`}
              onClick={() => setFilterEstado('OPERATIVO')}
            >
              Operativas ({cisternas.filter((c) => c.estado === 'OPERATIVO').length})
            </button>
            <button
              type="button"
              className={`pill-btn ${filterEstado === 'MANTENIMIENTO' ? 'active' : ''}`}
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

          {/* Botón flotante para centrar flota activa */}
          <button
            type="button"
            className="fleet-btn-floating-center"
            onClick={handleFitFleet}
            title="Centrar mapa en cisterna activa"
          >
            🎯 Centrar en Cisterna
          </button>

          <div className="fleet-map-overlay-badge">
            <span className="live-indicator"></span>
            <span>
              {cisternasConGps.length} de {cisternas.length} con señal GPS activa
            </span>
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
                const hasGps =
                  c.latitud_actual !== null &&
                  c.longitud_actual !== null &&
                  !isNaN(Number(c.latitud_actual)) &&
                  Number(c.latitud_actual) !== 0;
                const isSelected = selectedCisternaId === c.id || selectedCisternaPlaca === c.placa;

                return (
                  <div
                    key={c.id}
                    className={`fleet-unit-item ${isSelected ? 'selected' : ''} ${
                      c.estado === 'OPERATIVO' ? 'is-operativo' : 'is-mantenimiento'
                    }`}
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
                        <span className="detail-val">
                          <strong>{c.capacidad_m3} m³</strong> ({Number(c.capacidad_litros).toLocaleString('es-PE')} L)
                        </span>
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
                      ) : c.codigo_gps ? (
                        <span className="gps-status-inactive" style={{ color: '#2563eb' }}>
                          <span className="gps-dot" style={{ backgroundColor: '#f59e0b' }}></span>
                          Volvo Connect vinculado (Camión apagado)
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
