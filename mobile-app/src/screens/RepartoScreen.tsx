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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  
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
      let found: any = null;

      // 1. Search in SQLite by DNI
      if (queryDni && !queryDni.toUpperCase().startsWith('VALE-')) {
        const result = await db.getAllAsync(`SELECT * FROM beneficiarios WHERE dni = ?`, [queryDni]);
        if (result.length > 0) found = result[0];
      }

      // 2. Search in SQLite if code contains ID e.g. VALE-XXXX-001 -> id 1
      if (!found && codigoVale) {
        const idMatch = codigoVale.match(/VALE-\d+-(\d+)/i);
        if (idMatch) {
          const benefId = parseInt(idMatch[1], 10);
          const result = await db.getAllAsync(`SELECT * FROM beneficiarios WHERE id = ?`, [benefId]);
          if (result.length > 0) found = result[0];
        }
      }

      if (found) {
        setBeneficiario(found);
        setValeCodigo(codigoVale || null);
        setDni(found.dni);
        const calculoSugerido = qrLitros || ((found.num_miembros || 1) * DOTACION_POR_HABITANTE).toString();
        setLitrosEntregar(calculoSugerido.toString());
        setHasSignature(false);
        setPhotoUri(null);
        signatureRef.current?.clearSignature();
        setSearching(false);
        return;
      }

      // 3. Online Backend Fallback via /vales/buscar/:query
      try {
        const encodeQuery = encodeURIComponent(raw);
        const response = await fetch(`${BACKEND_URL}/vales/buscar/${encodeQuery}`);
        if (response.ok) {
          const onlineData = await response.json();
          await db.runAsync(
            `INSERT OR REPLACE INTO beneficiarios (
              id, dni, nombres_apellidos, distrito, sector_aahh, sector,
              num_vivienda, num_miembros, mz, lt, calle_direccion, direccion, telefono
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              onlineData.id,
              onlineData.dni,
              onlineData.nombres_apellidos,
              onlineData.distrito,
              onlineData.sector_aahh,
              onlineData.sector_aahh,
              onlineData.num_vivienda,
              onlineData.num_miembros,
              onlineData.mz,
              onlineData.lt,
              onlineData.calle_direccion,
              onlineData.calle_direccion,
              onlineData.telefono,
            ]
          );

          setBeneficiario(onlineData);
          setValeCodigo(onlineData.vale_codigo || codigoVale || null);
          setDni(onlineData.dni);
          const calculoSugerido = qrLitros || onlineData.litros_sugeridos || ((onlineData.num_miembros || 1) * DOTACION_POR_HABITANTE);
          setLitrosEntregar(calculoSugerido.toString());
          setHasSignature(false);
          setPhotoUri(null);
          signatureRef.current?.clearSignature();
          setSearching(false);
          return;
        }
      } catch (_) {}

      Alert.alert('No encontrado', `No se encontró beneficiario ni vale para: ${raw}`);
      setBeneficiario(null);
    } catch (err: any) {
      Alert.alert('Error', 'Error al consultar la base de datos: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleBarCodeScanned = ({ data }: any) => {
    setQrScannerVisible(false);
    const rawData = String(data).trim();
    const displayDni = rawData.includes('|') ? rawData.split('|')[0] : rawData;
    setDni(displayDni);
    handleSearchDNI(rawData);
  };

  const openQrScanner = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para escanear el código QR.');
        return;
      }
    }
    setQrScannerVisible(true);
  };

  // --- PHOTO EVIDENCE CAPTURE & COMPRESSION ---
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para registrar la fotografía de evidencia.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const rawUri = result.assets[0].uri;
      setTempPhotoUri(rawUri);
      setPhotoPreviewVisible(true);
    }
  };

  const handleConfirmPhoto = async () => {
    if (!tempPhotoUri) return;

    try {
      // 1. Compress Image to WEBP (max 1024px, quality 0.65 for minimum size)
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
      const fechaCaptura = new Date().toISOString();
      const fechaUbicacion = location?.timestamp ? new Date(location.timestamp).toISOString() : fechaCaptura;

      await db.runAsync(
        `INSERT INTO entregas_agua (
          local_id, beneficiario_id, programacion_id, cisterna_id, conductor_id,
          litros_entregados, firma_base64, foto_local_uri, latitud, longitud,
          precision_gps, altitud, fecha_ubicacion, fecha_captura, fecha_hora,
          sincronizado, sync_status, retry_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', 0)`,
        [
          localId,
          beneficiario.id,
          PROGRAMACION_ACTUAL_ID,
          selectedCisternaId || null,
          selectedConductorId || null,
          litrosNum,
          signatureBase64,
          photoUri || null,
          location?.coords.latitude || null,
          location?.coords.longitude || null,
          location?.coords.accuracy || null,
          location?.coords.altitude || null,
          fechaUbicacion,
          fechaCaptura,
          fechaCaptura,
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
    Alert.alert(res.success ? 'Sincronización' : 'Aviso', res.message);
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

  return (
    <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Agua Móvil</Text>
          <Text style={styles.subtitle}>EPS Moyobamba • {user?.rol || 'OPERADOR'}</Text>
          {user?.nombres ? <Text style={styles.userBadge}>👤 {user.nombres}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={styles.syncBtn} onPress={handleManualSync} disabled={isSyncing}>
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>🔄 Sync</Text>
            )}
          </TouchableOpacity>
          {onLogout && (
            <TouchableOpacity style={[styles.syncBtn, { backgroundColor: '#ef4444' }]} onPress={onLogout}>
              <Text style={styles.btnText}>⏻</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* GPS BANNER */}
      <View style={styles.gpsBanner}>
        <Text style={styles.gpsText}>
          📍 GPS:{' '}
          {location ? (
            <Text style={{ fontWeight: '700', color: '#166534' }}>
              {location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)} (±
              {Math.round(location.coords.accuracy || 0)}m)
            </Text>
          ) : locationLoading ? (
            <Text style={{ color: '#0369a1' }}>Obteniendo satélite...</Text>
          ) : (
            <Text style={{ color: '#d97706' }}>Sin señal GPS exacta</Text>
          )}
        </Text>
        <TouchableOpacity onPress={fetchGpsLocation}>
          <Text style={styles.gpsRefreshText}>🔄 Actualizar</Text>
        </TouchableOpacity>
      </View>

      {/* CISTERNA & CONDUCTOR SELECTOR */}
      <View style={styles.flotaBox}>
        <Text style={styles.flotaTitle}>🚛 Asignación de Jornada en Campo:</Text>
        <View style={styles.flotaRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.flotaLabel}>Cisterna Operativa:</Text>
            <View style={styles.selectorContainer}>
              {cisternas.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chipBtn, selectedCisternaId === c.id && styles.chipBtnActive]}
                  onPress={() => setSelectedCisternaId(c.id)}
                >
                  <Text style={[styles.chipText, selectedCisternaId === c.id && styles.chipTextActive]}>
                    {c.placa} ({c.capacidad_m3}m³)
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.flotaLabel}>Conductor Asignado:</Text>
            <View style={styles.selectorContainer}>
              {conductores.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chipBtn, selectedConductorId === p.id && styles.chipBtnActive]}
                  onPress={() => setSelectedConductorId(p.id)}
                >
                  <Text style={[styles.chipText, selectedConductorId === p.id && styles.chipTextActive]}>
                    {p.nombres.split(' ')[0]} {p.apellidos.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* LOGISTICS TRIP INFO FOR DRIVER */}
        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#bae6fd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11.5, color: '#0369a1', fontWeight: '700' }}>
            🚛 Capacidad: {cisternas.find(c => c.id === selectedCisternaId)?.capacidad_m3 || 15} m³ ({Number(cisternas.find(c => c.id === selectedCisternaId)?.capacidad_litros || 15000).toLocaleString()} Lts)
          </Text>
          <Text style={{ fontSize: 11.5, color: '#166534', fontWeight: '800', backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
            🏁 Logística: 2 Viajes Prog.
          </Text>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ingrese DNI o Código de Vale (ej. VALE-...)"
          value={dni}
          onChangeText={setDni}
          onSubmitEditing={() => handleSearchDNI()}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearchDNI()} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>🔍 Buscar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={openQrScanner}>
          <Text style={styles.btnText}>📷 QR</Text>
        </TouchableOpacity>
      </View>

      {/* BENEFICIARY CARD */}
      {beneficiario && (
        <View style={styles.card}>
          {/* TOP CARD HEADER WITH CANCEL BUTTON */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardBadges}>
              <View style={styles.badgeSector}>
                <Text style={styles.badgeSectorText}>
                  📍 {beneficiario.sector_aahh || beneficiario.sector || 'Sector General'}
                </Text>
              </View>
              {valeCodigo && (
                <View style={[styles.badgeSector, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={[styles.badgeSectorText, { color: '#15803d', fontWeight: '800' }]}>
                    🎟️ {valeCodigo}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.closeCardBtn} onPress={handleCancelBeneficiary}>
              <Text style={styles.closeCardBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardTitle}>{beneficiario.nombres_apellidos}</Text>
          <Text style={styles.infoText}>
            <Text style={styles.boldLabel}>DNI: </Text>
            {beneficiario.dni}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.boldLabel}>Dirección: </Text>
            {direccionCompleta || 'Sin dirección especificada'}
          </Text>
          {beneficiario.num_vivienda ? (
            <Text style={styles.infoText}>
              <Text style={styles.boldLabel}>N° Vivienda: </Text>
              {beneficiario.num_vivienda}
            </Text>
          ) : null}
          <Text style={styles.infoText}>
            <Text style={styles.boldLabel}>Miembros de familia: </Text>
            {beneficiario.num_miembros} personas
          </Text>

          {/* CALCULATION & EDITABLE LITERS BOX */}
          <View style={styles.waterCalcBox}>
            <Text style={styles.waterCalcTitle}>Dotación Oficial: {DOTACION_POR_HABITANTE} Lts/persona</Text>
            <Text style={styles.waterCalcSub}>
              Cálculo sugerido: {(beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE} Litros
            </Text>

            <View style={styles.litersInputRow}>
              <Text style={styles.litersInputLabel}>Agua Otorgada (Lts):</Text>
              <TextInput
                style={styles.litersInput}
                value={litrosEntregar}
                onChangeText={setLitrosEntregar}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.partialNote}>* Modificable en caso de entrega parcial</Text>
          </View>

          {/* PHOTO EVIDENCE SECTION (OBLIGATORIA) */}
          <View style={styles.photoSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>📸 Fotografía de Evidencia: *</Text>
              {photoUri ? (
                <Text style={styles.sigOkText}>✅ Foto capturada</Text>
              ) : (
                <Text style={styles.sigPendingText}>⚠️ Obligatorio</Text>
              )}
            </View>

            {photoUri ? (
              <View style={styles.photoPreviewRow}>
                <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.photoSavedText}>✅ Foto guardada (WEBP)</Text>
                  <TouchableOpacity style={styles.retakeBtn} onPress={handleTakePhoto}>
                    <Text style={styles.retakeBtnText}>📷 Tomar otra foto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.takePhotoBtn} onPress={handleTakePhoto}>
                <Text style={styles.takePhotoBtnText}>📷 Tomar Fotografía de Evidencia</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* DIGITAL SIGNATURE CANVAS (OBLIGATORIA) */}
          <View style={styles.sigHeader}>
            <Text style={styles.label}>✍️ Firma del Jefe de Familia: *</Text>
            {hasSignature ? (
              <Text style={styles.sigOkText}>✅ Firma capturada</Text>
            ) : (
              <Text style={styles.sigPendingText}>⚠️ Obligatorio</Text>
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
              descriptionText="Firme con el dedo sobre el recuadro blanco"
            />
          </View>

          <View style={styles.sigButtonsRow}>
            <TouchableOpacity
              style={styles.clearSigBtn}
              onPress={() => {
                signatureRef.current?.clearSignature();
                setHasSignature(false);
              }}
            >
              <Text style={styles.btnTextBlack}>🧹 Limpiar Firma</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDelivery}>
            <Text style={styles.saveBtnText}>💾 Registrar Entrega de Agua</Text>
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
              <TouchableOpacity style={styles.modalRetakeBtn} onPress={handleRetakePhoto}>
                <Text style={styles.btnTextBlack}>🔄 Volver a tomar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmPhoto}>
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
  container: { flexGrow: 1, padding: 18, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  userBadge: { fontSize: 11, color: '#0284c7', fontWeight: '700', marginTop: 2 },
  syncBtn: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  gpsBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gpsText: { fontSize: 12, color: '#065f46' },
  gpsRefreshText: { fontSize: 11, color: '#0284c7', fontWeight: '700' },
  flotaBox: { backgroundColor: '#ffffff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 },
  flotaTitle: { fontSize: 12, fontWeight: '800', color: '#334155', marginBottom: 6, textTransform: 'uppercase' },
  flotaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  flotaLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  selectorContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chipBtn: { backgroundColor: '#f1f5f9', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  chipBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  chipText: { fontSize: 11, color: '#334155', fontWeight: '600' },
  chipTextActive: { color: '#ffffff', fontWeight: '800' },
  searchContainer: { flexDirection: 'row', marginBottom: 16 },
  input: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, marginRight: 8, fontSize: 14 },
  searchBtn: { backgroundColor: '#10b981', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, marginRight: 8 },
  scanBtn: { backgroundColor: '#0f172a', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnTextBlack: { color: '#334155', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 20 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 8 },
  closeCardBtn: {
    backgroundColor: '#fee2e2',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  closeCardBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  badgeSector: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeSectorText: { color: '#0284c7', fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  infoText: { fontSize: 13.5, color: '#334155', marginBottom: 4 },
  boldLabel: { fontWeight: '700', color: '#0f172a' },
  waterCalcBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', padding: 14, borderRadius: 12, marginVertical: 14 },
  waterCalcTitle: { fontSize: 12, color: '#166534', fontWeight: '700', textTransform: 'uppercase' },
  waterCalcSub: { fontSize: 13, color: '#15803d', marginTop: 2, marginBottom: 8 },
  litersInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  litersInputLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  litersInput: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, fontSize: 18, fontWeight: '800', color: '#16a34a', minWidth: 90, textAlign: 'center' },
  partialNote: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 6 },
  photoSection: { marginVertical: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  takePhotoBtn: { backgroundColor: '#0284c7', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  takePhotoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoPreviewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  photoThumbnail: { width: 70, height: 70, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  photoSavedText: { fontSize: 12, color: '#16a34a', fontWeight: '700' },
  retakeBtn: { marginTop: 6, backgroundColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, alignSelf: 'flex-start' },
  retakeBtnText: { fontSize: 11.5, color: '#334155', fontWeight: '600' },
  sigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 6 },
  label: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  sigOkText: { fontSize: 11.5, color: '#16a34a', fontWeight: '700' },
  sigPendingText: { fontSize: 11.5, color: '#d97706', fontWeight: '700' },
  signatureContainer: { height: 180, borderColor: '#cbd5e1', borderWidth: 1.5, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 10 },
  sigButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  clearSigBtn: { backgroundColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  saveBtn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#ef4444', padding: 14, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 14 },
  modalImage: { width: '100%', height: 260, borderRadius: 10, marginBottom: 16 },
  modalBtnRow: { flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'space-between' },
  modalRetakeBtn: { flex: 1, backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  modalConfirmBtn: { flex: 1, backgroundColor: '#10b981', padding: 12, borderRadius: 8, alignItems: 'center' },

  // SCANNER VIEWFINDER STYLES
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
    borderColor: '#10b981',
  },
  cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
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
