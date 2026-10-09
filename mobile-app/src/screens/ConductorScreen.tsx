import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { BACKEND_URL } from '../config/api';
import { getDatabase } from '../database/schema';

interface ConductorScreenProps {
  user: any;
  onLogout: () => void;
}

export default function ConductorScreen({ user, onLogout }: ConductorScreenProps) {
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProg, setSelectedProg] = useState<any | null>(null);
  const [activeModal, setActiveModal] = useState(false);
  const [updatingEstado, setUpdatingEstado] = useState(false);

  // Quality check form state (Control de carga en planta)
  const [cloro, setCloro] = useState('1.00');
  const [turbiedad, setTurbiedad] = useState('1.50');
  const [savingCalidad, setSavingCalidad] = useState(false);

  useEffect(() => {
    loadProgramacionesConductor();
  }, []);

  const loadProgramacionesConductor = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/programaciones`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const userEmail = (user?.email || '').trim().toLowerCase();
          const userNameFirst = (user?.nombres || '').trim().toLowerCase().split(' ')[0];

          // Filtrar por el conductor autenticado
          let misProgs = data.filter((p: any) => {
            const matchEmail = p.conductor_email && p.conductor_email.toLowerCase() === userEmail;
            const matchId = user?.personal_id && p.conductor_id === user.personal_id;
            const matchName = p.conductor_nombre && p.conductor_nombre.toLowerCase().includes(userNameFirst);
            return matchEmail || matchId || matchName;
          });

          // Si no hay coincidencias estrictas, mostrar todas las programaciones para no bloquear al usuario
          if (misProgs.length === 0) {
            misProgs = data;
          }

          // Ordenar: siempre la programación más reciente primero
          misProgs.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

          setProgramaciones(misProgs);
          if (misProgs.length > 0) {
            setSelectedProg(misProgs[0]); // Siempre la más reciente seleccionada por defecto
          }
        }
      }
    } catch (e) {
      console.log('Error cargando programaciones del conductor:', e);
      // Fallback a base de datos SQLite local
      try {
        const db = await getDatabase();
        const progsLocales = await db.getAllAsync(
          'SELECT * FROM programaciones ORDER BY fecha DESC LIMIT 10'
        ) as any[];
        if (progsLocales && progsLocales.length > 0) {
          setProgramaciones(progsLocales);
          setSelectedProg(progsLocales[0]);
        }
      } catch (_) {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleEntrarProgramacion = (prog: any) => {
    setSelectedProg(prog);
    setActiveModal(true);
  };

  const handleCambiarEstadoRuta = async (prog: any, nuevoEstado: string) => {
    if (!prog) return;
    try {
      setUpdatingEstado(true);

      // 1. Obtener coordenadas GPS actuales si se inicia ruta o baliza
      let coords: { lat: number; lng: number } | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc?.coords) {
            coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          }
        }
      } catch (locErr) {
        console.warn('GPS location request error:', locErr);
      }

      // 2. Notificar al backend cambio de estado
      const token = user?.token;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${BACKEND_URL}/programaciones/${prog.id}/estado`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      // 3. Si inicia ruta y tenemos cisterna_id y coords, actualizar baliza GPS de la cisterna
      if (coords && prog.cisterna_id) {
        fetch(`${BACKEND_URL}/cisternas/${prog.cisterna_id}/ubicacion`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            latitud: coords.lat,
            longitud: coords.lng,
          }),
        }).catch(() => {});
      }

      // 4. Actualizar estado local
      setProgramaciones((prev) =>
        prev.map((p) => (p.id === prog.id ? { ...p, estado: nuevoEstado } : p))
      );
      if (selectedProg && selectedProg.id === prog.id) {
        setSelectedProg((prev: any) => ({ ...prev, estado: nuevoEstado }));
      }

      if (nuevoEstado === 'En Ruta') {
        Alert.alert(
          '🚚 ¡Ruta Iniciada!',
          `La programación #${prog.id} está ahora "EN RUTA".\n\n${
            coords
              ? `Baliza GPS de cisterna ${prog.cisterna_placa || 'EGA-401'} transmitida:\nLat: ${coords.lat.toFixed(5)}, Lng: ${coords.lng.toFixed(5)}`
              : 'Conduzca con precaución hacia los sectores programados.'
          }`,
          [{ text: 'Entendido' }]
        );
      } else if (nuevoEstado === 'Completada') {
        Alert.alert(
          '🏁 Jornada Finalizada',
          `La programación #${prog.id} ha sido marcada como COMPLETADA exitosamente.`,
          [{ text: 'Excelente' }]
        );
      } else {
        Alert.alert('Estado Actualizado', `La programación ahora está en estado: ${nuevoEstado}`);
      }
    } catch (err: any) {
      console.error('Error cambiando estado:', err);
      Alert.alert('Error', 'No se pudo actualizar el estado: ' + err.message);
    } finally {
      setUpdatingEstado(false);
    }
  };

  const handleEmitirBalizaGps = async (prog: any) => {
    if (!prog?.cisterna_id) {
      Alert.alert('Aviso', 'No hay cisterna asignada a esta programación.');
      return;
    }
    try {
      setUpdatingEstado(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Requerido', 'Active el permiso de ubicación GPS para transmitir la baliza.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!loc?.coords) {
        Alert.alert('Error GPS', 'No se pudo obtener la posición satelital.');
        return;
      }

      const token = user?.token;
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${BACKEND_URL}/cisternas/${prog.cisterna_id}/ubicacion`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          latitud: loc.coords.latitude,
          longitud: loc.coords.longitude,
        }),
      });

      Alert.alert(
        '📍 Baliza GPS Transmitida',
        `Ubicación en tiempo real actualizada para Cisterna ${prog.cisterna_placa || ''}:\nLat: ${loc.coords.latitude.toFixed(6)}, Lng: ${loc.coords.longitude.toFixed(6)}\n\nEl centro de control y monitoreo web ya visualiza su camión en el mapa en vivo.`
      );
    } catch (gpsErr: any) {
      Alert.alert('Error GPS', gpsErr.message);
    } finally {
      setUpdatingEstado(false);
    }
  };

  const handleGuardarControlCarga = async () => {
    if (!selectedProg) return;
    const cl = parseFloat(cloro);
    const tb = parseFloat(turbiedad);

    if (isNaN(cl) || isNaN(tb)) {
      Alert.alert('Datos Inválidos', 'Por favor ingrese valores numéricos para Cloro y Turbiedad.');
      return;
    }

    setSavingCalidad(true);
    try {
      const db = await getDatabase();
      const fechaHora = new Date().toISOString();
      const esConforme = cl >= 0.5 && cl <= 2.0 && tb <= 5.0 ? 1 : 0;

      await db.runAsync(
        `INSERT INTO control_calidad (cisterna_id, conductor_id, cloro_residual_ppm, turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, observaciones, fecha_hora, sincronizado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          selectedProg.cisterna_id || 1,
          selectedProg.conductor_id || user.personal_id || 1,
          cl,
          tb,
          'Límpido / Incoloro',
          esConforme,
          `Control de Carga en Planta - Prog #${selectedProg.id} (${selectedProg.zona || 'Ruta'})`,
          fechaHora,
        ]
      );

      // Intentar enviar al backend en tiempo real
      try {
        await fetch(`${BACKEND_URL}/calidad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programacion_id: selectedProg.id,
            cisterna_id: selectedProg.cisterna_id,
            conductor_id: selectedProg.conductor_id,
            tipo_control: 'CARGA',
            cloro_residual: cl,
            turbiedad: tb,
            aspecto_organoleptico: 'Límpido / Incoloro',
            conforme: esConforme === 1,
            observaciones: 'Control de carga registrado por Conductor desde Agua Móvil App',
          }),
        });
      } catch (_) {}

      Alert.alert(
        '✅ Control de Carga Registrado',
        `Valores registrados:\nCloro Residual: ${cl.toFixed(2)} ppm\nTurbiedad: ${tb.toFixed(2)} NTU\nEstado: ${esConforme ? 'Conforme Sanitariamente (Apto)' : 'Observado'}`,
        [{ text: 'Entendido' }]
      );
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo guardar el control de carga: ' + e.message);
    } finally {
      setSavingCalidad(false);
    }
  };

  const getProgMetrics = (prog: any) => {
    if (!prog) return { volRepartido: 0, volPromedio: 0, poblacion: 0, monto: 0 };
    const volRepartido = Number(prog.total_litros || prog.litros_programados || 0);
    const volPromedio = prog.volumen_promedio ? Number(prog.volumen_promedio) : (volRepartido > 0 ? 350 : 0);
    const poblacion = prog.poblacion_beneficiada ? Number(prog.poblacion_beneficiada) : (prog.poblacion_programada || (volRepartido > 0 ? Math.round((volRepartido / 350) * 4) : 0));
    const monto = Number(prog.monto_valorizado || prog.monto_programado || ((volRepartido / 1000) * 39.13));
    return { volRepartido, volPromedio, poblacion, monto };
  };

  const masReciente = programaciones.length > 0 ? programaciones[0] : null;
  const masRecienteMetrics = getProgMetrics(masReciente);

  return (
    <View style={styles.container}>
      {/* HEADER CONDUCTOR AGUATRACK */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#38bdf8' }}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </View>
          <View style={styles.headerInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerBadge}>🚚 CONDUCTOR</Text>
              <View style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: '900' }}>AguaTrack</Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>{user?.nombres || 'Conductor Asignado'}</Text>
            <Text style={styles.headerSub}>Flota de Camiones Cisterna • EPS Moyobamba</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProgramacionesConductor(); }} />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>Cargando programaciones de reparto...</Text>
          </View>
        ) : !masReciente ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyTitle}>Sin Programaciones Asignadas</Text>
            <Text style={styles.emptyDesc}>Actualmente no tiene jornadas activas de cisterna asignadas a su cuenta.</Text>
            <TouchableOpacity style={styles.btnRetry} onPress={loadProgramacionesConductor}>
              <Text style={styles.btnRetryText}>🔄 Actualizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* TARJETA DESTACADA: PROGRAMACIÓN MÁS RECIENTE A ENTREGAR */}
            <View style={styles.highlightCard}>
              <View style={styles.highlightHeader}>
                <View style={styles.pillActive}>
                  <Text style={styles.pillActiveText}>🔴 PROGRAMACIÓN MÁS RECIENTE A ENTREGAR</Text>
                </View>
                <Text style={styles.dateLabel}>
                  {masReciente.fecha ? new Date(masReciente.fecha).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }) : 'Hoy'}
                </Text>
              </View>

              <Text style={styles.progZoneTitle}>
                {masReciente.zona || 'Sectores Programados Moyobamba'}
              </Text>

              {/* ESTADO OPERACIONAL DE LA PROGRAMACIÓN */}
              <View style={styles.progStatusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    masReciente.estado === 'En Ruta'
                      ? styles.statusBadgeEnRuta
                      : masReciente.estado === 'Completada'
                      ? styles.statusBadgeCompletada
                      : styles.statusBadgeProgramada,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      masReciente.estado === 'En Ruta'
                        ? styles.statusTextEnRuta
                        : masReciente.estado === 'Completada'
                        ? styles.statusTextCompletada
                        : styles.statusTextProgramada,
                    ]}
                  >
                    {masReciente.estado === 'En Ruta'
                      ? '🟢 EN RUTA ACTIVA'
                      : masReciente.estado === 'Completada'
                      ? '🏁 JORNADA COMPLETADA'
                      : '🟡 PENDIENTE DE SALIDA'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>CISTERNA ASIGNADA</Text>
                  <Text style={styles.detailValBold}>
                    🚚 {masReciente.cisterna_placa || 'Sin cisterna'}
                  </Text>
                  <Text style={styles.detailValSub}>
                    {masReciente.cisterna_marca || 'Capacidad'}: {masReciente.capacidad_m3 || '0'} m³
                  </Text>
                </View>

                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>VOLUMEN DE JORNADA</Text>
                  <Text style={styles.detailValBold}>
                    💧 {Number(masReciente.litros_programados || 0).toLocaleString()} L
                  </Text>
                  <Text style={styles.detailValSub}>
                    Viajes aprox: {masReciente.viajes_estimados || 1} viaje(s)
                  </Text>
                </View>
              </View>

              {/* 4 MÉTRICAS OPERATIVAS CLAVE (VOL. REPARTIDO, PROMEDIO, POBLACIÓN Y MONTO) */}
              <View style={styles.metricsQuadGrid}>
                <View style={[styles.metricQuadCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                  <Text style={[styles.metricQuadTag, { color: '#0369a1' }]}>🚰 VOL. REPARTIDO</Text>
                  <Text style={[styles.metricQuadValue, { color: '#0369a1' }]}>
                    {masRecienteMetrics.volRepartido.toLocaleString()} L
                  </Text>
                  <Text style={styles.metricQuadSub}>{(masRecienteMetrics.volRepartido / 1000).toFixed(1)} m³ fiscalizados</Text>
                </View>

                <View style={[styles.metricQuadCard, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                  <Text style={[styles.metricQuadTag, { color: '#3730a3' }]}>📊 VOL. PROMEDIO</Text>
                  <Text style={[styles.metricQuadValue, { color: '#3730a3' }]}>
                    {masRecienteMetrics.volPromedio.toLocaleString()} L
                  </Text>
                  <Text style={styles.metricQuadSub}>Por familia entregada</Text>
                </View>

                <View style={[styles.metricQuadCard, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                  <Text style={[styles.metricQuadTag, { color: '#6b21a8' }]}>👥 POBLACIÓN</Text>
                  <Text style={[styles.metricQuadValue, { color: '#6b21a8' }]}>
                    {masRecienteMetrics.poblacion.toLocaleString()} hab.
                  </Text>
                  <Text style={styles.metricQuadSub}>Beneficiarios en ruta</Text>
                </View>

                <View style={[styles.metricQuadCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                  <Text style={[styles.metricQuadTag, { color: '#166534' }]}>💰 MONTO VALORIZADO</Text>
                  <Text style={[styles.metricQuadValue, { color: '#166534' }]}>
                    S/. {masRecienteMetrics.monto.toFixed(2)}
                  </Text>
                  <Text style={styles.metricQuadSub}>Subsidio EPS / PNSU</Text>
                </View>
              </View>

              <View style={styles.gestorBanner}>
                <Ionicons name="people-circle-outline" size={24} color="#0369a1" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.gestorBannerLabel}>GESTOR DE ENTREGA (COPILOTO):</Text>
                  <Text style={styles.gestorBannerName}>
                    {masReciente.ayudante_nombre || masReciente.gestor_nombre || 'Sin gestor asignado'}
                  </Text>
                </View>
                <View style={styles.gestorStatusPill}>
                  <Text style={styles.gestorStatusText}>
                    {masReciente.estado === 'En Ruta' ? 'En Operación' : 'Asignado'}
                  </Text>
                </View>
              </View>

              {/* BOTONES OPERACIONALES DIRECTOS PARA EL CONDUCTOR */}
              <View style={styles.actionRowConductor}>
                {masReciente.estado !== 'En Ruta' && masReciente.estado !== 'Completada' && (
                  <TouchableOpacity
                    style={styles.btnStartRoute}
                    onPress={() => handleCambiarEstadoRuta(masReciente, 'En Ruta')}
                    disabled={updatingEstado}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="navigate-outline" size={18} color="#fff" />
                    <Text style={styles.btnActionText}>
                      {updatingEstado ? 'Iniciando...' : '🚚 Iniciar Ruta (Transmitir GPS)'}
                    </Text>
                  </TouchableOpacity>
                )}

                {masReciente.estado === 'En Ruta' && (
                  <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.btnGpsBeacon, { flex: 1 }]}
                      onPress={() => handleEmitirBalizaGps(masReciente)}
                      disabled={updatingEstado}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="location-outline" size={17} color="#0284c7" />
                      <Text style={styles.btnGpsBeaconText}>Emitir Baliza GPS</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnFinishRoute, { flex: 1 }]}
                      onPress={() => handleCambiarEstadoRuta(masReciente, 'Completada')}
                      disabled={updatingEstado}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-done-circle-outline" size={17} color="#fff" />
                      <Text style={styles.btnActionText}>
                        {updatingEstado ? 'Finalizando...' : '🏁 Finalizar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.btnEnterProg}
                onPress={() => handleEntrarProgramacion(masReciente)}
                activeOpacity={0.85}
              >
                <Ionicons name="speedometer-outline" size={20} color="#fff" />
                <Text style={styles.btnEnterProgText}>ENTRAR A ESTA PROGRAMACIÓN</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* OTRAS PROGRAMACIONES ASIGNADAS */}
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>📅 Historial y Otras Programaciones</Text>
              <Text style={styles.sectionBadge}>{programaciones.length} jornada(s)</Text>
            </View>

            {programaciones.map((p, idx) => (
              <TouchableOpacity
                key={p.id || idx}
                style={[
                  styles.progRowCard,
                  idx === 0 && { borderColor: '#38bdf8', borderWidth: 1.5 },
                ]}
                onPress={() => handleEntrarProgramacion(p)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={styles.rowProgCode}>Prog #{p.id}</Text>
                    <Text style={styles.rowProgDate}>
                      {p.fecha ? new Date(p.fecha).toLocaleDateString('es-PE') : 'Fecha n/d'}
                    </Text>
                    {idx === 0 && (
                      <Text style={styles.rowActiveTag}>Actual</Text>
                    )}
                  </View>

                  <Text style={styles.rowZoneName}>{p.zona || 'Moyobamba'}</Text>

                  <Text style={styles.rowMetaInfo}>
                    Cisterna: {p.cisterna_placa || 'Sin asignar'} • {Number(p.litros_programados || 0).toLocaleString()} Litros
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* MODAL DETALLES DE LA PROGRAMACIÓN Y CONTROL DE CARGA */}
      {selectedProg && (
        <Modal visible={activeModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalSheetHeader}>
                <View>
                  <Text style={styles.modalCode}>PROGRAMACIÓN #{selectedProg.id}</Text>
                  <Text style={styles.modalZoneTitle}>{selectedProg.zona || 'Sectores Moyobamba'}</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveModal(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#0f172a" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 440 }}>
                {/* ESTADO OPERACIONAL Y ACCIONES DE RUTA */}
                <View style={[styles.modalCardInfo, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                  <Text style={[styles.cardHeaderSmall, { color: '#0369a1' }]}>🧭 ESTADO OPERATIVO DE LA JORNADA</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 }}>
                    <Text style={{ fontSize: 12.5, color: '#334155', fontWeight: '700' }}>Estado actual:</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        selectedProg.estado === 'En Ruta'
                          ? styles.statusBadgeEnRuta
                          : selectedProg.estado === 'Completada'
                          ? styles.statusBadgeCompletada
                          : styles.statusBadgeProgramada,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          selectedProg.estado === 'En Ruta'
                            ? styles.statusTextEnRuta
                            : selectedProg.estado === 'Completada'
                            ? styles.statusTextCompletada
                            : styles.statusTextProgramada,
                        ]}
                      >
                        {selectedProg.estado === 'En Ruta'
                          ? '🟢 EN RUTA ACTIVA'
                          : selectedProg.estado === 'Completada'
                          ? '🏁 COMPLETADA'
                          : '🟡 PROGRAMADA'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    {selectedProg.estado !== 'En Ruta' && selectedProg.estado !== 'Completada' && (
                      <TouchableOpacity
                        style={styles.btnStartRoute}
                        onPress={() => handleCambiarEstadoRuta(selectedProg, 'En Ruta')}
                        disabled={updatingEstado}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="navigate-outline" size={18} color="#fff" />
                        <Text style={styles.btnActionText}>
                          {updatingEstado ? 'Iniciando...' : '🚚 Iniciar Ruta (Transmitir GPS)'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {selectedProg.estado === 'En Ruta' && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.btnGpsBeacon, { flex: 1 }]}
                          onPress={() => handleEmitirBalizaGps(selectedProg)}
                          disabled={updatingEstado}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="location-outline" size={17} color="#0284c7" />
                          <Text style={styles.btnGpsBeaconText}>Emitir Baliza GPS</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.btnFinishRoute, { flex: 1 }]}
                          onPress={() => handleCambiarEstadoRuta(selectedProg, 'Completada')}
                          disabled={updatingEstado}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="checkmark-done-circle-outline" size={17} color="#fff" />
                          <Text style={styles.btnActionText}>
                            {updatingEstado ? '...' : '🏁 Finalizar'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {/* FICHA TÉCNICA DE LA CISTERNA */}
                <View style={styles.modalCardInfo}>
                  <Text style={styles.cardHeaderSmall}>🚚 DATOS DE CISTERNA Y FLOTA</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoRowKey}>Placa de Rodaje:</Text>
                    <Text style={styles.infoRowVal}>{selectedProg.cisterna_placa || 'Sin asignar'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoRowKey}>Capacidad Móvil:</Text>
                    <Text style={styles.infoRowVal}>
                      {selectedProg.capacidad_m3 || '0'} m³ ({Number(selectedProg.capacidad_litros || 0).toLocaleString()} L)
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoRowKey}>Gestor de Entrega Asignado:</Text>
                    <Text style={[styles.infoRowVal, { color: '#0369a1', fontWeight: '800' }]}>
                      {selectedProg.ayudante_nombre || selectedProg.gestor_nombre || 'Sin gestor asignado'}
                    </Text>
                  </View>
                </View>

                {/* 4 MÉTRICAS OPERATIVAS CLAVE EN MODAL */}
                {(() => {
                  const selM = getProgMetrics(selectedProg);
                  return (
                    <View style={styles.metricsQuadGrid}>
                      <View style={[styles.metricQuadCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                        <Text style={[styles.metricQuadTag, { color: '#0369a1' }]}>🚰 VOL. REPARTIDO</Text>
                        <Text style={[styles.metricQuadValue, { color: '#0369a1' }]}>
                          {selM.volRepartido.toLocaleString()} L
                        </Text>
                        <Text style={styles.metricQuadSub}>{(selM.volRepartido / 1000).toFixed(1)} m³</Text>
                      </View>

                      <View style={[styles.metricQuadCard, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                        <Text style={[styles.metricQuadTag, { color: '#3730a3' }]}>📊 VOL. PROMEDIO</Text>
                        <Text style={[styles.metricQuadValue, { color: '#3730a3' }]}>
                          {selM.volPromedio.toLocaleString()} L
                        </Text>
                        <Text style={styles.metricQuadSub}>Por familia</Text>
                      </View>

                      <View style={[styles.metricQuadCard, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                        <Text style={[styles.metricQuadTag, { color: '#6b21a8' }]}>👥 POBLACIÓN</Text>
                        <Text style={[styles.metricQuadValue, { color: '#6b21a8' }]}>
                          {selM.poblacion.toLocaleString()} hab.
                        </Text>
                        <Text style={styles.metricQuadSub}>Beneficiarios</Text>
                      </View>

                      <View style={[styles.metricQuadCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                        <Text style={[styles.metricQuadTag, { color: '#166534' }]}>💰 MONTO VALORIZADO</Text>
                        <Text style={[styles.metricQuadValue, { color: '#166534' }]}>
                          S/. {selM.monto.toFixed(2)}
                        </Text>
                        <Text style={styles.metricQuadSub}>Subsidio EPS</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* CONTROL DE CALIDAD Y CARGA EN PLANTA */}
                <View style={[styles.modalCardInfo, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                  <Text style={[styles.cardHeaderSmall, { color: '#166534' }]}>
                    🧪 CONTROL SANITARIO DE CARGA (D.S. 031-2010-SA)
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#15803d', marginBottom: 12 }}>
                    Registre la medición de cloro y turbiedad al cargar el camión cisterna en planta antes de partir a ruta:
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', marginBottom: 4 }}>
                        CLORO RESIDUAL (ppm)
                      </Text>
                      <TextInput
                        style={styles.inputCalidad}
                        keyboardType="numeric"
                        value={cloro}
                        onChangeText={setCloro}
                        placeholder="Ej. 1.20"
                      />
                      <Text style={{ fontSize: 9.5, color: '#15803d', marginTop: 2 }}>Norma: 0.50 - 2.00 ppm</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', marginBottom: 4 }}>
                        TURBIEDAD (NTU)
                      </Text>
                      <TextInput
                        style={styles.inputCalidad}
                        keyboardType="numeric"
                        value={turbiedad}
                        onChangeText={setTurbiedad}
                        placeholder="Ej. 1.50"
                      />
                      <Text style={{ fontSize: 9.5, color: '#15803d', marginTop: 2 }}>Límite máx: 5.0 NTU</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.btnSaveCalidad}
                    onPress={handleGuardarControlCarga}
                    disabled={savingCalidad}
                    activeOpacity={0.8}
                  >
                    {savingCalidad ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.btnSaveCalidadText}>Certificar Carga de Cisterna</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* RUTA Y SECTORES A RECORRER */}
                <View style={styles.modalCardInfo}>
                  <Text style={styles.cardHeaderSmall}>📍 SECTORES AUTORIZADOS EN ESTA JORNADA</Text>
                  <Text style={{ fontSize: 13, color: '#334155', fontWeight: '700', marginTop: 4 }}>
                    {selectedProg.zona || 'Sin sectores asignados'}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                    El Gestor de Entrega ({selectedProg.ayudante_nombre || selectedProg.gestor_nombre || 'Copiloto'}) registrará los vales y firmas en estos sectores con su módulo móvil.
                  </Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCloseBtnBottom}
                onPress={() => setActiveModal(false)}
              >
                <Text style={styles.modalCloseBtnText}>Cerrar Detalle de Programación</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerInfo: {
    flex: 1,
  },
  headerBadge: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 11.5,
  },
  logoutBtn: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
    padding: 16,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  btnRetry: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnRetryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  highlightCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 24,
  },
  highlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pillActive: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  pillActiveText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '900',
  },
  dateLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  progZoneTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 14,
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  detailCol: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '800',
    marginBottom: 2,
  },
  detailValBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailValSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  gestorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 16,
  },
  gestorBannerLabel: {
    fontSize: 9.5,
    color: '#0369a1',
    fontWeight: '800',
  },
  gestorBannerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0c4a6e',
  },
  gestorStatusPill: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gestorStatusText: {
    fontSize: 10,
    color: '#0369a1',
    fontWeight: '700',
  },
  btnEnterProg: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  btnEnterProgText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionBadge: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '600',
  },
  progRowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  rowProgCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rowProgDate: {
    fontSize: 11.5,
    color: '#64748b',
  },
  rowActiveTag: {
    fontSize: 9.5,
    backgroundColor: '#dcfce7',
    color: '#15803d',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontWeight: '800',
  },
  rowZoneName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginVertical: 2,
  },
  rowMetaInfo: {
    fontSize: 11.5,
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  modalZoneTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  modalCardInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  cardHeaderSmall: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoRowKey: {
    fontSize: 12,
    color: '#64748b',
  },
  infoRowVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  inputCalidad: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#14532d',
  },
  btnSaveCalidad: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  btnSaveCalidadText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  modalCloseBtnBottom: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  progStatusRow: {
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusBadgeEnRuta: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  statusBadgeCompletada: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  statusBadgeProgramada: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusTextEnRuta: {
    color: '#15803d',
  },
  statusTextCompletada: {
    color: '#475569',
  },
  statusTextProgramada: {
    color: '#b45309',
  },
  actionRowConductor: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  btnStartRoute: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    flex: 1,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  btnFinishRoute: {
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnGpsBeacon: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  btnGpsBeaconText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '800',
  },
  btnActionText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  metricsQuadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metricQuadCard: {
    width: '48.5%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  metricQuadTag: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  metricQuadValue: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  metricQuadSub: {
    fontSize: 9.5,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
});

