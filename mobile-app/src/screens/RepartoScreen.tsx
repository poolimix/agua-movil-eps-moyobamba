import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { getDatabase } from '../database/schema';
import { syncData } from '../services/SyncService';
import { BACKEND_URL } from '../config/api';

// Regla de Negocio Oficial EPS Moyobamba
const DOTACION_POR_HABITANTE = 50; // 50 Litros por persona
const PROGRAMACION_ACTUAL_ID = 1;

interface RepartoScreenProps {
  user?: any;
  onLogout?: () => void;
}

export default function RepartoScreen({ user, onLogout }: RepartoScreenProps) {
  const [dni, setDni] = useState('');
  const [beneficiario, setBeneficiario] = useState<any>(null);
  const [valeCodigo, setValeCodigo] = useState<string | null>(null);
  const [litrosEntregar, setLitrosEntregar] = useState('50');
  const [hasSignature, setHasSignature] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [, requestCameraPermission] = useCameraPermissions();
  
  // Photo Evidence State
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [tempPhotoUri, setTempPhotoUri] = useState<string | null>(null);

  // GPS Location State
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Cisternas & Conductores State
  const [cisternas, setCisternas] = useState<any[]>([]);
  const [conductores, setConductores] = useState<any[]>([]);
  const [selectedCisternaId, setSelectedCisternaId] = useState<number | null>(null);
  const [selectedConductorId, setSelectedConductorId] = useState<number | null>(null);

  // Scroll lock for signature pad
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const signatureRef = useRef<SignatureViewRef>(null);

  useEffect(() => {
    (async () => {
      await fetchGpsLocation();
      await loadCisternasAndConductores();
    })();
  }, []);

  const fetchGpsLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return;
      }

      const locPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10000);
      });

      const result = await Promise.race([locPromise, timeoutPromise]);
      if (result) {
        setLocation(result);
      } else {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) setLocation(lastKnown);
      }
    } catch (e) {
      console.log('GPS error/timeout:', e);
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) setLocation(last);
      } catch (_) {}
    } finally {
      setLocationLoading(false);
    }
  };

  const loadCisternasAndConductores = async () => {
    try {
      const db = await getDatabase();
      const cList = await db.getAllAsync(
        `SELECT * FROM cisternas WHERE estado = 'OPERATIVO' ORDER BY placa ASC`
      );
      setCisternas(cList);
      if (cList.length > 0) {
        setSelectedCisternaId((cList[0] as any).id);
      }

      const pList = await db.getAllAsync(
        `SELECT * FROM personal_operativo WHERE tipo_personal = 'CONDUCTOR' AND estado = 'ACTIVO' ORDER BY nombres ASC`
      );
      setConductores(pList);
      if (pList.length > 0) {
        setSelectedConductorId((pList[0] as any).id);
      }
    } catch (e) {
      console.error('Error loading cisternas/conductores:', e);
    }
  };

  const handleSearchDNI = async (searchQuery?: string) => {
    const raw = (searchQuery || dni).trim();
    if (!raw) {
      Alert.alert('Atención', 'Ingrese un DNI o Código de Vale para buscar.');
      return;
    }

    // Extract parts if structured QR: "VALE-20260826-001|47891234|200L"
    let codigoVale = '';
    let queryDni = raw;
    let qrLitros = '';

    if (raw.includes('|')) {
      const parts = raw.split('|');
      codigoVale = parts[0].trim();
      if (parts.length > 1) queryDni = parts[1].trim();
      if (parts.length > 2) qrLitros = parts[2].replace(/[^\d.]/g, '');
    } else if (raw.toUpperCase().startsWith('VALE-')) {
      codigoVale = raw;
    }

    setSearching(true);
    try {
      const db = await getDatabase();
      let result: any = null;

      // 1. Search in Local SQLite Database
      if (codigoVale) {
        result = await db.getFirstAsync(
          `SELECT b.*, v.codigo_unico as vale_codigo, v.litros_sugeridos as vale_litros 
           FROM vales_consumo v 
           JOIN beneficiarios b ON v.beneficiario_id = b.id 
           WHERE v.codigo_unico = ?`,
          [codigoVale]
        );
      }

      if (!result && queryDni) {
        result = await db.getFirstAsync(
          `SELECT * FROM beneficiarios WHERE dni = ?`,
          [queryDni]
        );
      }

      // 2. If not found locally, fetch from Backend API
      if (!result) {
        try {
          const endpoint = codigoVale
            ? `${BACKEND_URL}/vales/buscar/${encodeURIComponent(codigoVale)}`
            : `${BACKEND_URL}/beneficiarios/buscar/${encodeURIComponent(queryDni)}`;

          const res = await fetch(endpoint);
          if (res.ok) {
            const onlineData = await res.json();
            if (onlineData) {
              result = onlineData;
            }
          }
        } catch (apiErr) {
          console.log('Online search skipped or failed:', apiErr);
        }
      }

      if (result) {
        setBeneficiario(result);
        setValeCodigo(codigoVale || result.vale_codigo || null);

        // Compute Suggested Liters (SUNASS Standard: 50L x members)
        const suggestedLiters = qrLitros
          ? parseFloat(qrLitros)
          : result.vale_litros
          ? parseFloat(result.vale_litros)
          : (result.num_miembros || 1) * DOTACION_POR_HABITANTE;

        setLitrosEntregar(String(suggestedLiters));
        setHasSignature(false);
        setPhotoUri(null);
        signatureRef.current?.clearSignature();
      } else {
        Alert.alert(
          'No encontrado',
          `No se encontró ningún beneficiario con el criterio "${raw}". Verifique en el padrón.`
        );
      }
    } catch (error: any) {
      Alert.alert('Error de búsqueda', error.message);
    } finally {
      setSearching(false);
    }
  };

  // --- QR SCANNER HANDLERS ---
  const openQrScanner = async () => {
    const { granted } = await requestCameraPermission();
    if (!granted) {
      Alert.alert('Permiso Denegado', 'Se requiere acceso a la cámara para escanear el código QR.');
      return;
    }
    setQrScannerVisible(true);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setQrScannerVisible(false);
    if (data) {
      setDni(data);
      handleSearchDNI(data);
    }
  };

  // --- PHOTO EVIDENCE (CAMERA / GALLERY) ---
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para capturar la evidencia.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setTempPhotoUri(result.assets[0].uri);
        setPhotoPreviewVisible(true);
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'No se pudo abrir la cámara: ' + error.message);
    }
  };

  const handleConfirmPhoto = async () => {
    if (!tempPhotoUri) return;

    try {
      // 1. Compress & Convert to WebP format (max width 1024px, 65% quality)
      const manipulated = await ImageManipulator.manipulateAsync(
        tempPhotoUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.65, format: ImageManipulator.SaveFormat.WEBP }
      );

      // 2. Ensure permanent directory in documentDirectory
      const dirPath = `${FileSystem.documentDirectory}evidencias/`;
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }

      // 3. Move/Copy to permanent storage with .webp extension
      const permanentFilename = `evidencia_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
      const permanentUri = `${dirPath}${permanentFilename}`;

      await FileSystem.copyAsync({
        from: manipulated.uri,
        to: permanentUri,
      });

      setPhotoUri(permanentUri);
      setPhotoPreviewVisible(false);
      setTempPhotoUri(null);
      Alert.alert('✅ Evidencia Lista', 'Fotografía optimizada en formato WEBP ultra liviano.');
    } catch (error: any) {
      console.error('Error saving photo:', error);
      Alert.alert('Error', 'No se pudo procesar la fotografía: ' + error.message);
    }
  };

  const handleRetakePhoto = () => {
    setPhotoPreviewVisible(false);
    setTempPhotoUri(null);
    handleTakePhoto();
  };

  const handleCancelBeneficiary = () => {
    setBeneficiario(null);
    setValeCodigo(null);
    setDni('');
    setLitrosEntregar('50');
    setHasSignature(false);
    setPhotoUri(null);
    signatureRef.current?.clearSignature();
  };

  // --- SAVE DELIVERY ---
  const handleSignatureOK = async (signatureBase64: string) => {
    if (!signatureBase64 || signatureBase64.length < 50) {
      Alert.alert('Firma requerida', 'Por favor capture la firma digital del Jefe de Familia.');
      return;
    }

    if (!beneficiario) return;

    if (!photoUri) {
      Alert.alert('Fotografía requerida', 'Debe capturar la fotografía de evidencia en campo antes de registrar la entrega.');
      return;
    }

    const litrosNum = parseFloat(litrosEntregar);
    if (isNaN(litrosNum) || litrosNum <= 0) {
      Alert.alert('Monto inválido', 'Ingrese una cantidad válida de litros a otorgar.');
      return;
    }

    try {
      const db = await getDatabase();
      const localId = `movil-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();

      await db.runAsync(
        `INSERT INTO entregas_agua (
          local_id,
          beneficiario_id,
          programacion_id,
          cisterna_id,
          conductor_id,
          litros_entregados,
          firma_base64,
          foto_local_uri,
          latitud,
          longitud,
          precision_gps,
          altitud,
          fecha_ubicacion,
          fecha_captura,
          sincronizado,
          sync_status,
          retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', 0)`,
        [
          localId,
          beneficiario.id,
          PROGRAMACION_ACTUAL_ID,
          selectedCisternaId,
          selectedConductorId,
          litrosNum,
          signatureBase64,
          photoUri,
          location?.coords.latitude || null,
          location?.coords.longitude || null,
          location?.coords.accuracy || null,
          location?.coords.altitude || null,
          location ? new Date(location.timestamp).toISOString() : null,
          nowIso,
        ]
      );

      Alert.alert(
        '✅ Entrega Registrada',
        `Se guardaron ${litrosNum} Lts para ${beneficiario.nombres_apellidos}.\nEstado: PENDIENTE DE SYNC (Offline-First)`
      );

      // Attempt background sync
      syncData().catch(() => {});

      // Reset Form
      handleCancelBeneficiary();
    } catch (error: any) {
      Alert.alert('Error al guardar', error.message);
    }
  };

  const handleSaveDelivery = () => {
    if (!photoUri) {
      Alert.alert('Fotografía obligatoria', '📸 Debe capturar la fotografía de evidencia de la entrega antes de registrar.');
      return;
    }
    if (!hasSignature) {
      Alert.alert('Firma obligatoria', '✍️ Debe capturar la firma digital del Jefe de Familia antes de registrar la entrega.');
      return;
    }
    signatureRef.current?.readSignature();
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await syncData();
    setIsSyncing(false);
    Alert.alert(res.success ? 'Sincronización Exitosa' : 'Aviso', res.message);
  };

  const handleLogoutConfirm = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Está seguro de que desea cerrar su sesión en Agua Móvil?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Cerrar Sesión',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );
  };

  if (qrScannerVisible) {
    return (
      <View style={styles.scannerFullscreen}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarCodeScanned}
        />

        {/* SCANNER VIEWFINDER OVERLAY */}
        <View style={styles.scannerOverlay}>
          {/* HEADER */}
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Escanear Vale / DNI</Text>
            <Text style={styles.scannerSubtitle}>Apunte la cámara al código QR de agua</Text>
          </View>

          {/* TARGET SQUARE WITH CORNERS */}
          <View style={styles.targetFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.laserLine} />
          </View>

          {/* FOOTER & CANCEL */}
          <View style={styles.scannerFooter}>
            <Text style={styles.scannerHelpText}>
              Alinee el código QR dentro del recuadro verde para escanear automáticamente
            </Text>
            <TouchableOpacity
              style={styles.cancelScannerBtn}
              onPress={() => setQrScannerVisible(false)}
            >
              <Text style={styles.cancelScannerBtnText}>✕ Cerrar Escáner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const direccionCompleta = beneficiario
    ? `${beneficiario.mz ? `Mz. ${beneficiario.mz} ` : ''}${beneficiario.lt ? `Lt. ${beneficiario.lt} ` : ''}${beneficiario.calle_direccion || beneficiario.direccion || ''}`.trim()
    : '';

  const activeCisterna = cisternas.find((c) => c.id === selectedCisternaId);

  return (
    <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={styles.container}>
      {/* HEADER WITH CELESTIAL WATER THEME */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconCircle}>
            <Text style={{ fontSize: 20 }}>💧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>Agua Móvil</Text>
            <Text style={styles.subtitle} numberOfLines={1}>EPS MOYOBAMBA S.A.</Text>
            {user?.nombres ? (
              <View style={styles.userBadge}>
                <Text style={styles.userBadgeText} numberOfLines={1}>👤 {user.nombres}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.syncBtn} onPress={handleManualSync} disabled={isSyncing} activeOpacity={0.85}>
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 11, color: '#fff' }}>🔄</Text>
                <Text style={styles.btnText}>Sync</Text>
              </View>
            )}
          </TouchableOpacity>

          {onLogout && (
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutConfirm} activeOpacity={0.85}>
              <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '900' }}>⏻</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* GPS RADAR BANNER */}
      <View style={styles.gpsBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 6 }}>
          <View style={styles.gpsPulseDot} />
          <Text style={styles.gpsText} numberOfLines={1}>
            <Text style={{ fontWeight: '800', color: '#0369a1' }}>GPS: </Text>
            {location ? (
              <Text style={{ fontWeight: '700', color: '#0c4a6e' }}>
                {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)} (±{Math.round(location.coords.accuracy || 0)}m)
              </Text>
            ) : locationLoading ? (
              <Text style={{ color: '#0284c7' }}>Buscando satélite...</Text>
            ) : (
              <Text style={{ color: '#d97706' }}>Sin señal satelital</Text>
            )}
          </Text>
        </View>

        <TouchableOpacity onPress={fetchGpsLocation} style={styles.gpsRefreshBtn} activeOpacity={0.7}>
          <Text style={styles.gpsRefreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* CISTERNA & CONDUCTOR SELECTOR CARD */}
      <View style={styles.flotaCard}>
        <View style={styles.flotaCardHeader}>
          <Text style={styles.flotaCardIcon}>🚛</Text>
          <Text style={styles.flotaCardTitle}>Asignación de Jornada en Campo</Text>
        </View>

        <View style={styles.flotaRow}>
          {/* CISTERNA SELECTOR */}
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.flotaLabel}>Cisterna Operativa:</Text>
            <View style={styles.selectorContainer}>
              {cisternas.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chipBtn, selectedCisternaId === c.id && styles.chipBtnActive]}
                  onPress={() => setSelectedCisternaId(c.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, selectedCisternaId === c.id && styles.chipTextActive]}>
                    {c.placa} ({c.capacidad_m3}m³)
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* CONDUCTOR SELECTOR */}
          <View style={{ flex: 1 }}>
            <Text style={styles.flotaLabel}>Conductor Asignado:</Text>
            <View style={styles.selectorContainer}>
              {conductores.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chipBtn, selectedConductorId === p.id && styles.chipBtnActive]}
                  onPress={() => setSelectedConductorId(p.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, selectedConductorId === p.id && styles.chipTextActive]}>
                    {p.nombres.split(' ')[0]} {p.apellidos.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* LOGISTICS TRIP INFO BAR */}
        <View style={styles.logisticsStrip}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 13 }}>💧</Text>
            <Text style={{ fontSize: 11.5, color: '#0369a1', fontWeight: '800' }}>
              Capacidad: {activeCisterna?.capacidad_m3 || 15} m³ ({Number(activeCisterna?.capacidad_litros || 15000).toLocaleString()} Lts)
            </Text>
          </View>
          <View style={styles.tripBadge}>
            <Text style={styles.tripBadgeText}>🏁 2 Viajes Prog.</Text>
          </View>
        </View>
      </View>

      {/* SEARCH BAR & SCANNER ROW */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Text style={{ fontSize: 13, color: '#0284c7', marginRight: 6 }}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="DNI o Código de Vale (VALE-...)"
            placeholderTextColor="#94a3b8"
            value={dni}
            onChangeText={setDni}
            onSubmitEditing={() => handleSearchDNI()}
          />
        </View>

        <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearchDNI()} disabled={searching} activeOpacity={0.85}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Buscar</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.scanBtn} onPress={openQrScanner} activeOpacity={0.85}>
          <Text style={styles.btnText}>📷 QR</Text>
        </TouchableOpacity>
      </View>

      {/* BENEFICIARY CARD */}
      {beneficiario && (
        <View style={styles.card}>
          {/* TOP CARD HEADER WITH BADGES & CLOSE BUTTON */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardBadges}>
              <View style={styles.badgeSector}>
                <Text style={styles.badgeSectorText}>
                  📍 {beneficiario.sector_aahh || beneficiario.sector || 'Sector General'}
                </Text>
              </View>
              {valeCodigo && (
                <View style={styles.badgeVale}>
                  <Text style={styles.badgeValeText}>
                    🎟️ {valeCodigo}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.closeCardBtn} onPress={handleCancelBeneficiary} activeOpacity={0.7}>
              <Text style={styles.closeCardBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardTitle}>{beneficiario.nombres_apellidos}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>DNI:</Text>
            <Text style={styles.infoValue}>{beneficiario.dni}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dirección:</Text>
            <Text style={styles.infoValue}>{direccionCompleta || 'Sin dirección especificada'}</Text>
          </View>

          {beneficiario.num_vivienda ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>N° Vivienda:</Text>
              <Text style={styles.infoValue}>{beneficiario.num_vivienda}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Miembros de Familia:</Text>
            <Text style={styles.infoValue}>{beneficiario.num_miembros} personas</Text>
          </View>

          {/* CALCULATION & EDITABLE LITERS BOX */}
          <View style={styles.waterCalcBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.waterCalcTitle}>💧 Dotación Oficial SUNASS</Text>
              <Text style={styles.dotacionPill}>{DOTACION_POR_HABITANTE} Lts/hab</Text>
            </View>

            <Text style={styles.waterCalcSub}>
              Cálculo sugerido: {(beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE} Litros
            </Text>

            <View style={styles.litersInputRow}>
              <Text style={styles.litersInputLabel}>Litros a Otorgar:</Text>
              <View style={styles.litersInputContainer}>
                <TextInput
                  style={styles.litersInput}
                  value={litrosEntregar}
                  onChangeText={setLitrosEntregar}
                  keyboardType="numeric"
                />
                <Text style={styles.litersSuffix}>Lts</Text>
              </View>
            </View>
            <Text style={styles.partialNote}>* Modificable en caso de entrega parcial</Text>
          </View>

          {/* PHOTO EVIDENCE SECTION (OBLIGATORIA) */}
          <View style={styles.photoSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>📸 Fotografía de Evidencia *</Text>
              {photoUri ? (
                <View style={styles.statusPillOk}>
                  <Text style={styles.statusPillOkText}>✓ Capturada</Text>
                </View>
              ) : (
                <View style={styles.statusPillPending}>
                  <Text style={styles.statusPillPendingText}>⚠️ Obligatorio</Text>
                </View>
              )}
            </View>

            {photoUri ? (
              <View style={styles.photoPreviewRow}>
                <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.photoSavedText}>✅ Evidencia Lista (WEBP)</Text>
                  <TouchableOpacity style={styles.retakeBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                    <Text style={styles.retakeBtnText}>📷 Tomar otra foto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.takePhotoBtn} onPress={handleTakePhoto} activeOpacity={0.85}>
                <Text style={styles.takePhotoBtnText}>📷 Tomar Fotografía de Evidencia</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* DIGITAL SIGNATURE CANVAS (OBLIGATORIA) */}
          <View style={styles.sigSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>✍️ Firma del Jefe de Familia *</Text>
              {hasSignature ? (
                <View style={styles.statusPillOk}>
                  <Text style={styles.statusPillOkText}>✓ Firmado</Text>
                </View>
              ) : (
                <View style={styles.statusPillPending}>
                  <Text style={styles.statusPillPendingText}>⚠️ Obligatorio</Text>
                </View>
              )}
            </View>

            <View
              style={styles.signatureContainer}
              onTouchStart={() => setScrollEnabled(false)}
              onTouchEnd={() => setScrollEnabled(true)}
            >
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignatureOK}
                onBegin={() => {
                  setScrollEnabled(false);
                  setHasSignature(true);
                }}
                onEnd={() => {
                  setScrollEnabled(true);
                }}
                nestedScrollEnabled={false}
                webStyle={`.m-signature-pad {box-shadow: none; border: none; touch-action: none;} .m-signature-pad--body {border: none;} body,html {width: 100%; height: 100%; touch-action: none; overflow: hidden;}`}
                autoClear={false}
                descriptionText="Firme con su dedo sobre este recuadro"
              />
            </View>

            <View style={styles.sigButtonsRow}>
              <TouchableOpacity
                style={styles.clearSigBtn}
                onPress={() => {
                  signatureRef.current?.clearSignature();
                  setHasSignature(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.clearSigBtnText}>🧹 Limpiar Firma</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* REGISTER DELIVERY BUTTON */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDelivery} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>💾 Registrar Entrega de Agua (Offline)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PHOTO PREVIEW MODAL (CONFIRM / RETAKE) */}
      <Modal visible={photoPreviewVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar Fotografía de Evidencia</Text>
            {tempPhotoUri && (
              <Image source={{ uri: tempPhotoUri }} style={styles.modalImage} resizeMode="contain" />
            )}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalRetakeBtn} onPress={handleRetakePhoto} activeOpacity={0.8}>
                <Text style={styles.btnTextBlack}>🔄 Volver a tomar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmPhoto} activeOpacity={0.85}>
                <Text style={styles.btnText}>✅ Confirmar Foto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 14,
    backgroundColor: '#f0f8ff', // Celestial Aqua Tinted Background
  },
  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 6,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bae6fd',
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0369a1',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 10,
    color: '#0ea5e9',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  userBadge: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    marginTop: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  userBadgeText: {
    fontSize: 10,
    color: '#0284c7',
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    flexShrink: 0,
  },
  syncBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 16,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  logoutBtn: {
    backgroundColor: '#fef2f2',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  // GPS RADAR BANNER
  gpsBanner: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#0284c7',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  gpsPulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10b981',
  },
  gpsText: {
    fontSize: 11.5,
    color: '#334155',
  },
  gpsRefreshBtn: {
    padding: 3,
  },
  gpsRefreshText: {
    fontSize: 13,
  },
  // FLOTA & LOGISTICS CARD
  flotaCard: {
    backgroundColor: '#ffffff',
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  flotaCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  flotaCardIcon: {
    fontSize: 14,
  },
  flotaCardTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  flotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flotaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  selectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chipBtn: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  chipBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  chipText: {
    fontSize: 10.5,
    color: '#0369a1',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  logisticsStrip: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0f2fe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  tripBadgeText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '800',
  },
  // SEARCH ROW
  searchRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 13,
    paddingHorizontal: 10,
    shadowColor: '#0284c7',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 12.5,
    color: '#0f172a',
  },
  searchBtn: {
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 13,
    shadowColor: '#0d9488',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  scanBtn: {
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12.5,
  },
  btnTextBlack: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12.5,
  },
  // BENEFICIARY CARD
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bae6fd',
    shadowColor: '#0284c7',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  badgeSector: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  badgeSectorText: {
    color: '#0284c7',
    fontSize: 11,
    fontWeight: '800',
  },
  badgeVale: {
    backgroundColor: '#ecfdf5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  badgeValeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  closeCardBtn: {
    backgroundColor: '#fee2e2',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  closeCardBtnText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 15,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    fontWeight: '700',
    color: '#64748b',
    width: 120,
    fontSize: 12.5,
  },
  infoValue: {
    flex: 1,
    fontWeight: '600',
    color: '#0f172a',
    fontSize: 12.5,
  },
  // WATER CALC BOX
  waterCalcBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    padding: 12,
    borderRadius: 14,
    marginVertical: 12,
  },
  waterCalcTitle: {
    fontSize: 11.5,
    color: '#0369a1',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dotacionPill: {
    fontSize: 10,
    color: '#0284c7',
    fontWeight: '800',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  waterCalcSub: {
    fontSize: 12,
    color: '#0284c7',
    marginTop: 3,
    marginBottom: 8,
  },
  litersInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  litersInputLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  litersInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  litersInput: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0284c7',
    minWidth: 50,
    textAlign: 'center',
  },
  litersSuffix: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginLeft: 3,
  },
  partialNote: {
    fontSize: 10.5,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  // PHOTO & SIGNATURE SECTIONS
  photoSection: {
    marginVertical: 6,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sigSection: {
    marginVertical: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusPillOk: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusPillOkText: {
    color: '#059669',
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusPillPending: {
    backgroundColor: '#fffbeb',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  statusPillPendingText: {
    color: '#d97706',
    fontSize: 10.5,
    fontWeight: '800',
  },
  takePhotoBtn: {
    backgroundColor: '#0284c7',
    padding: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  takePhotoBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  photoThumbnail: {
    width: 65,
    height: 65,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  photoSavedText: {
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '800',
  },
  retakeBtn: {
    marginTop: 4,
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  retakeBtnText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  signatureContainer: {
    height: 170,
    borderColor: '#bae6fd',
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  sigButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  clearSigBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  clearSigBtnText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
    marginTop: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalImage: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    marginBottom: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'space-between',
  },
  modalRetakeBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 11,
    borderRadius: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    padding: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  // SCANNER VIEWFINDER
  scannerFullscreen: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  scannerHeader: { alignItems: 'center', marginTop: 30 },
  scannerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  scannerSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  targetFrame: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#06b6d4',
  },
  cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#06b6d4',
    shadowColor: '#06b6d4',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  scannerFooter: { alignItems: 'center', width: '100%', marginBottom: 15 },
  scannerHelpText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 280,
    lineHeight: 18,
  },
  cancelScannerBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  cancelScannerBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
});
