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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { getDatabase } from '../database/schema';
import { syncData } from '../services/SyncService';
import { BACKEND_URL } from '../config/api';

// Regla de Negocio Oficial EPS Moyobamba - Abastecimiento Periódico Semanal
const DOTACION_POR_HABITANTE = 50; // 50 Litros diarios por persona (Norma SUNASS / MVCS)
const DIAS_ENTREGA_SEMANAL = 7; // Ciclo de entrega periódica semanal (7 días)
const DOTACION_SEMANAL_POR_HABITANTE = DOTACION_POR_HABITANTE * DIAS_ENTREGA_SEMANAL; // 350 Litros semanales por habitante
const PROGRAMACION_ACTUAL_ID = 1;

interface RepartoScreenProps {
  user?: any;
  onLogout?: () => void;
}

export default function RepartoScreen({ user, onLogout }: RepartoScreenProps) {
  const [dni, setDni] = useState('');
  const [beneficiario, setBeneficiario] = useState<any>(null);
  const [valeCodigo, setValeCodigo] = useState<string | null>(null);
  const [litrosEntregar, setLitrosEntregar] = useState('350');
  const [cuotaTotal, setCuotaTotal] = useState(350);
  const [entregadoPrevio, setEntregadoPrevio] = useState(0);
  const [saldoPendiente, setSaldoPendiente] = useState(350);
  const [tieneEntregaPrevia, setTieneEntregaPrevia] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [, requestCameraPermission] = useCameraPermissions();
  
  // Photo Evidence State & Fehaciencia GPS
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [tempPhotoUri, setTempPhotoUri] = useState<string | null>(null);
  const [photoTimestamp, setPhotoTimestamp] = useState<string>('');
  const [photoGpsCoords, setPhotoGpsCoords] = useState<{ lat: string; lng: string; acc: string } | null>(null);

  // GPS Location State
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Cisternas & Conductores State
  const [cisternas, setCisternas] = useState<any[]>([]);
  const [conductores, setConductores] = useState<any[]>([]);
  const [selectedCisternaId, setSelectedCisternaId] = useState<number | null>(null);
  const [selectedConductorId, setSelectedConductorId] = useState<number | null>(null);

  // Quality Control State (Cloro & Turbiedad) - Regla TDR: Mínimo 2 Controles (Carga y Ruta)
  const [calidadModalVisible, setCalidadModalVisible] = useState(false);
  const [cloroPpm, setCloroPpm] = useState('1.20');
  const [turbiedadNtu, setTurbiedadNtu] = useState('1.40');
  const [aspectoCalidad, setAspectoCalidad] = useState('Límpido / Incoloro');
  const [etapaControl, setEtapaControl] = useState<'CARGA' | 'RUTA' | 'ADICIONAL'>('CARGA');
  const [systemConfig, setSystemConfig] = useState<any>({
    dotacion_diaria_litros: 50,
    dias_entrega_semanal: 7,
    turbiedad_max_ntu: 5.0,
    cloro_min_ppm: 0.5,
    cloro_max_ppm: 2.0
  });

  // Navigation Tab State (Inicia en 'PROGRAMACION' para que el conductor vea su jornada asignada)
  const [activeTab, setActiveTab] = useState<'PROGRAMACION' | 'REPARTO'>('PROGRAMACION');
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [selectedProg, setSelectedProg] = useState<any | null>(null);
  const [loadingProg, setLoadingProg] = useState(false);

  // Scroll lock for signature pad
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const signatureRef = useRef<SignatureViewRef>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      await fetchGpsLocation();
      await loadCisternasAndConductores();
      await loadProgramaciones();
      await loadSystemConfig();
    })();
  }, []);

  const loadSystemConfig = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/configuracion`);
      if (res.ok) {
        const json = await res.json();
        if (json?.config) {
          setSystemConfig({
            dotacion_diaria_litros: Number(json.config.dotacion_diaria_litros) || 50,
            dias_entrega_semanal: Number(json.config.dias_entrega_semanal) || 7,
            turbiedad_max_ntu: Number(json.config.turbiedad_max_ntu) || 5.0,
            cloro_min_ppm: Number(json.config.cloro_min_ppm) || 0.5,
            cloro_max_ppm: Number(json.config.cloro_max_ppm) || 2.0
          });
        }
      }
    } catch (_) {}
  };

  const loadProgramaciones = async () => {
    try {
      setLoadingProg(true);
      const res = await fetch(`${BACKEND_URL}/programaciones`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const userEmail = (user?.email || '').trim().toLowerCase();
          const userRol = String(user?.rol || '').toUpperCase();

          let filteredProgs = data;

          if (userRol === 'CONDUCTOR') {
            filteredProgs = data.filter((p: any) => 
              (p.conductor_email && p.conductor_email.toLowerCase() === userEmail) ||
              (user?.personal_id && p.conductor_id === user.personal_id) ||
              (user?.nombres && p.conductor_nombre && p.conductor_nombre.toLowerCase().includes(user.nombres.toLowerCase().split(' ')[0]))
            );
          } else if (userRol === 'GESTOR_ENTREGA' || userRol === 'AYUDANTE') {
            filteredProgs = data.filter((p: any) => 
              (p.ayudante_email && p.ayudante_email.toLowerCase() === userEmail) ||
              (user?.personal_id && p.ayudante_id === user.personal_id) ||
              (user?.nombres && p.ayudante_nombre && p.ayudante_nombre.toLowerCase().includes(user.nombres.toLowerCase().split(' ')[0]))
            );
          }

          setProgramaciones(filteredProgs);
          if (filteredProgs.length > 0) {
            setSelectedProg(filteredProgs[0]);
            if (filteredProgs[0].cisterna_id) setSelectedCisternaId(filteredProgs[0].cisterna_id);
            if (filteredProgs[0].conductor_id) setSelectedConductorId(filteredProgs[0].conductor_id);
          } else {
            setSelectedProg(null);
          }
        }
      }
    } catch (e) {
      console.log('Error cargando programaciones:', e);
    } finally {
      setLoadingProg(false);
    }
  };

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

  const handleSaveCalidad = async () => {
    const c = parseFloat(cloroPpm);
    const t = parseFloat(turbiedadNtu);
    if (isNaN(c) || isNaN(t)) {
      Alert.alert('Error', 'Ingrese valores numéricos válidos para Cloro y Turbiedad.');
      return;
    }
    const cloroMin = Number(systemConfig?.cloro_min_ppm) || 0.5;
    const cloroMax = Number(systemConfig?.cloro_max_ppm) || 2.0;
    const turbMax = Number(systemConfig?.turbiedad_max_ntu) || 5.0;
    const conforme = c >= cloroMin && c <= cloroMax && t <= turbMax;
    const punto = etapaControl === 'CARGA' 
      ? 'Surtidor / Planta de Carga Moyobamba' 
      : (etapaControl === 'RUTA' ? 'En Ruta / Grifo de Cisterna en Sector' : 'Control Adicional / Muestreo Libre');

    try {
      const db = await getDatabase();
      try {
        await db.runAsync(`
          INSERT INTO control_calidad (cisterna_id, conductor_id, cloro_residual_ppm, turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, latitud, longitud, etapa_control, punto_muestreo, fecha_hora)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `, [
          selectedCisternaId || 1,
          selectedConductorId || 1,
          c,
          t,
          aspectoCalidad,
          conforme ? 1 : 0,
          location?.coords?.latitude || null,
          location?.coords?.longitude || null,
          etapaControl,
          punto
        ]);
      } catch (localErr) {
        console.warn('Local sqlite save without new columns fallback:', localErr);
      }

      // If online, also send to backend
      fetch(`${BACKEND_URL}/calidad/calidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cisterna_id: selectedCisternaId || 1,
          conductor_nombre: user?.nombres || 'Operador Móvil',
          cloro_residual_ppm: c,
          turbiedad_ntu: t,
          aspecto_organoleptico: aspectoCalidad,
          etapa_control: etapaControl,
          punto_muestreo: punto,
          latitud: location?.coords?.latitude || null,
          longitud: location?.coords?.longitude || null,
          registrado_por: user?.nombres || 'Operador Móvil',
        })
      }).catch(() => {});

      const etapaLabel = etapaControl === 'CARGA' 
        ? '1. Control al Cargar Cisterna (Surtidor)' 
        : (etapaControl === 'RUTA' ? '2. Control en Ruta (Entrega)' : 'Control Adicional');

      Alert.alert(
        conforme ? '✓ Calidad Conforme' : '⚠ Alerta Sanitaria',
        conforme 
          ? `[${etapaLabel}]\n\nParámetros registrados según TDR:\n• Cloro Residual: ${c.toFixed(2)} ppm (${cloroMin}-${cloroMax})\n• Turbiedad: ${t.toFixed(2)} NTU (≤${turbMax})\n• Punto: ${punto}\n\nAgua 100% Apta para Reparto.`
          : `¡ATENCIÓN! Parámetros fuera de norma sanitaria:\n• Cloro: ${c.toFixed(2)} ppm (Norma: ${cloroMin}-${cloroMax})\n• Turbiedad: ${t.toFixed(2)} NTU (Límite: ≤${turbMax})\nNotifique de inmediato a planta.`
      );
      setCalidadModalVisible(false);
    } catch (e) {
      console.error('Error guardando control calidad:', e);
      Alert.alert('Error', 'No se pudo guardar el registro de calidad');
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
        try {
          result = await db.getFirstAsync(
            `SELECT b.*, v.codigo_unico as vale_codigo, v.litros_sugeridos as vale_litros 
             FROM vales_consumo v 
             JOIN beneficiarios b ON v.beneficiario_id = b.id 
             WHERE v.codigo_unico = ?`,
            [codigoVale]
          );
        } catch (dbErr) {
          console.warn('Error en consulta local de vales:', dbErr);
        }
      }

      if (!result && queryDni) {
        try {
          result = await db.getFirstAsync(
            `SELECT * FROM beneficiarios WHERE dni = ?`,
            [queryDni]
          );
        } catch (dbDniErr) {
          console.warn('Error en consulta local de beneficiarios:', dbDniErr);
        }
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

        const progId = selectedProg?.id || PROGRAMACION_ACTUAL_ID;

        // Consultar entregas previas para este beneficiario en esta programación
        let yaEntregado = 0;
        try {
          const prevRows: any = await db.getFirstAsync(
            `SELECT COALESCE(SUM(litros_entregados), 0) as total_entregado FROM entregas_agua WHERE beneficiario_id = ? AND programacion_id = ?`,
            [result.id, progId]
          );
          if (prevRows?.total_entregado) {
            yaEntregado = parseFloat(prevRows.total_entregado);
          } else if (result.total_entregado_programacion) {
            yaEntregado = parseFloat(result.total_entregado_programacion);
          }
        } catch (_) {}

        // Calcular cuota familiar semanal total (SUNASS: 50L/hab/día × integrantes × 7 días = 350L/hab)
        const dotacionSemanalHab = (systemConfig?.dotacion_diaria_litros || DOTACION_POR_HABITANTE) * (systemConfig?.dias_entrega_semanal || DIAS_ENTREGA_SEMANAL);
        const cuotaFamiliar = qrLitros
          ? parseFloat(qrLitros)
          : result.vale_litros
          ? parseFloat(result.vale_litros)
          : (result.num_miembros || 1) * dotacionSemanalHab;

        const saldoResta = Math.max(0, cuotaFamiliar - yaEntregado);

        setCuotaTotal(cuotaFamiliar);
        setEntregadoPrevio(yaEntregado);
        setSaldoPendiente(saldoResta);
        setTieneEntregaPrevia(yaEntregado > 0);

        // Sugerir por defecto el saldo restante pendiente
        setLitrosEntregar(String(saldoResta > 0 ? saldoResta : cuotaFamiliar));
        setHasSignature(false);
        setPhotoUri(null);
        signatureRef.current?.clearSignature();

        if (yaEntregado > 0) {
          Alert.alert(
            '⚠️ Entrega Parcial Previa Detectada',
            `Este beneficiario ya recibió ${yaEntregado} Lts de su cuota total de ${cuotaFamiliar} Lts.\n\nSaldo disponible a entregar: ${saldoResta} Lts.`
          );
        }
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

  // --- PHOTO EVIDENCE (CAMERA / GEORREFERENCIACIÓN INMEDIATA) ---
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
        quality: 0.82,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawUri = result.assets[0].uri;

        // 1. Marca temporal exacta de la captura
        const nowFormatted = new Date().toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setPhotoTimestamp(nowFormatted);

        // 2. Snapshot de coordenadas satelitales (prioriza estado, o busca última posición en <1s)
        let lat = location?.coords?.latitude ? location.coords.latitude.toFixed(6) : '-6.034172';
        let lng = location?.coords?.longitude ? location.coords.longitude.toFixed(6) : '-76.971391';
        let acc = location?.coords?.accuracy ? `${Math.round(location.coords.accuracy)}` : '5';

        if (!location) {
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              setLocation(last);
              lat = last.coords.latitude.toFixed(6);
              lng = last.coords.longitude.toFixed(6);
              acc = `${Math.round(last.coords.accuracy || 5)}`;
            }
          } catch (_) {}
        }
        setPhotoGpsCoords({ lat, lng, acc });

        // 3. Optimización ligera de imagen para carga fluida (sin bloquear la UI)
        let finalDisplayUri = rawUri;
        try {
          const manipulated = await ImageManipulator.manipulateAsync(
            rawUri,
            [{ resize: { width: 1200 } }],
            { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalDisplayUri = manipulated.uri;
        } catch (_) {}

        // 4. Mostrar inmediatamente la vista previa con el banner de evidencia integrado
        setTempPhotoUri(finalDisplayUri);
        setPhotoPreviewVisible(true);
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'No se pudo capturar la foto: ' + error.message);
    }
  };

  const handleConfirmPhoto = async () => {
    if (!tempPhotoUri) return;

    let permanentUri = tempPhotoUri;
    try {
      if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
        const dirPath = `${FileSystem.documentDirectory}evidencias/`;
        const dirInfo = await FileSystem.getInfoAsync(dirPath);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
        }
        const ext = tempPhotoUri.split('.').pop()?.split('?')[0] || 'jpg';
        const targetPath = `${dirPath}evidencia_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: tempPhotoUri, to: targetPath });
        permanentUri = targetPath;
      }
    } catch (e) {
      console.warn('Error saving photo to permanent folder:', e);
    }

    setPhotoUri(permanentUri);
    setPhotoPreviewVisible(false);
    setTempPhotoUri(null);
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
    setCuotaTotal(50);
    setEntregadoPrevio(0);
    setSaldoPendiente(50);
    setTieneEntregaPrevia(false);
    setHasSignature(false);
    setShowSignaturePad(false);
    setPhotoUri(null);
    setPhotoTimestamp('');
    setPhotoGpsCoords(null);
    signatureRef.current?.clearSignature();
  };

  // --- SAVE DELIVERY ---
  const handleSignatureOK = async (signatureBase64: string) => {
    if (!beneficiario) return;

    // FOTOGRAFÍA OBLIGATORIA
    if (!photoUri) {
      Alert.alert('Fotografía obligatoria', '📸 Debe capturar la fotografía de evidencia en campo antes de registrar la entrega.');
      return;
    }

    const litrosNum = parseFloat(litrosEntregar);
    if (isNaN(litrosNum) || litrosNum <= 0) {
      Alert.alert('Monto inválido', 'Ingrese una cantidad válida de litros a otorgar.');
      return;
    }

    const progId = selectedProg?.id || PROGRAMACION_ACTUAL_ID;
    const cuota = cuotaTotal > 0 ? cuotaTotal : (beneficiario.num_miembros || 1) * DOTACION_SEMANAL_POR_HABITANTE;
    const nuevoTotalEntregado = entregadoPrevio + litrosNum;
    const saldoRestante = Math.max(0, cuota - nuevoTotalEntregado);
    const estadoEntrega = saldoRestante > 0 ? 'PARCIAL' : 'COMPLETA';
    const obsEntrega = saldoRestante > 0 
      ? `Entrega parcial de ${litrosNum} Lts. Quedan pendientes ${saldoRestante} Lts por entregar.`
      : `Entrega completa del 100% (${cuota} Lts).`;

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
          cuota_programada,
          litros_entregados,
          saldo_pendiente,
          estado_entrega,
          observaciones_entrega,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', 0)`,
        [
          localId,
          beneficiario.id,
          progId,
          selectedCisternaId,
          selectedConductorId,
          cuota,
          litrosNum,
          saldoRestante,
          estadoEntrega,
          obsEntrega,
          signatureBase64 || null,
          photoUri,
          location?.coords.latitude || null,
          location?.coords.longitude || null,
          location?.coords.accuracy || null,
          location?.coords.altitude || null,
          location ? new Date(location.timestamp).toISOString() : null,
          nowIso,
        ]
      );

      if (saldoRestante > 0) {
        Alert.alert(
          '🟡 Entrega Parcial Registrada',
          `Se guardaron ${litrosNum} Lts para ${beneficiario.nombres_apellidos}.\n\n⚠️ QUEDAN PENDIENTES: ${saldoRestante} Lts por entregar en esta programación.\nEstado: Guardado en Celular (Offline-First)`
        );
      } else {
        Alert.alert(
          '✅ Entrega Completa Registrada',
          `Se completó el abastecimiento de ${litrosNum} Lts para ${beneficiario.nombres_apellidos}.\nCuota 100% cubierta.\nEstado: Guardado en Celular (Offline-First)`
        );
      }

      // Attempt background sync
      syncData().catch(() => {});

      // Reset Form
      handleCancelBeneficiary();
    } catch (error: any) {
      Alert.alert('Error al guardar', error.message);
    }
  };

  const handleSaveDelivery = () => {
    // 1. Fotografía es OBLIGATORIA
    if (!photoUri) {
      Alert.alert('Fotografía obligatoria', '📸 Debe capturar la fotografía de evidencia de la entrega antes de registrar.');
      return;
    }
    
    // 2. Firma digital es OPCIONAL: solo si se habilitó el recuadro y se firmó en pantalla se lee
    if (showSignaturePad && hasSignature) {
      signatureRef.current?.readSignature();
    } else {
      handleSignatureOK('');
    }
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
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
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

  const getProgMetrics = (prog: any) => {
    if (!prog) return { volRepartido: 0, volPromedio: 0, poblacion: 0, monto: 0 };
    const volRepartido = Number(prog.total_litros || prog.litros_programados || 0);
    const volPromedio = prog.volumen_promedio ? Number(prog.volumen_promedio) : (volRepartido > 0 ? 350 : 0);
    const poblacion = prog.poblacion_beneficiada ? Number(prog.poblacion_beneficiada) : (prog.poblacion_programada || (volRepartido > 0 ? Math.round((volRepartido / 350) * 4) : 0));
    const monto = Number(prog.monto_valorizado || prog.monto_programado || ((volRepartido / 1000) * 39.13));
    return { volRepartido, volPromedio, poblacion, monto };
  };

  const progMetrics = getProgMetrics(selectedProg);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={[styles.container, { paddingBottom: 220 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        showsVerticalScrollIndicator={false}
      >
      {/* HEADER CURVO MODERNO (ORGANIC CURVED HEADER) */}
      <View style={styles.headerModernCurve}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerBrand}>
            <View style={[styles.avatarCircle, { overflow: 'hidden', padding: 0 }]}>
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.welcomeText} numberOfLines={1}>
                  {user?.nombres ? user.nombres.split(' ')[0] : 'Operador'}
                </Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '900' }}>AguaTrack</Text>
                </View>
              </View>
              <Text style={styles.roleSubtext} numberOfLines={1}>
                {user?.rol === 'GESTOR_ENTREGA' || user?.rol === 'AYUDANTE'
                  ? '🤝 Gestor de Entrega'
                  : (user?.rol === 'CONDUCTOR' ? '🚚 Conductor de Cisterna' : (user?.rol === 'SUPERVISOR' ? '📋 Supervisor EPS' : (user?.rol || 'Personal EPS')))} • EPS Moyobamba
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.syncBtnPill} onPress={handleManualSync} disabled={isSyncing} activeOpacity={0.85}>
              {isSyncing ? (
                <ActivityIndicator color="#0284c7" size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="sync-outline" size={13} color="#0284c7" />
                  <Text style={styles.syncBtnPillText}>Sync</Text>
                </View>
              )}
            </TouchableOpacity>

            {onLogout && (
              <TouchableOpacity style={styles.logoutBtnPill} onPress={handleLogoutConfirm} activeOpacity={0.85}>
                <Ionicons name="log-out-outline" size={16} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* TOP TAB NAVIGATOR (SEGMENTED PILL BAR FLOTANTE) */}
      {(() => {
        const userRole = String(user?.rol || '').toUpperCase();
        const isConductor = userRole === 'CONDUCTOR';

        if (isConductor) {
          return (
            <View style={styles.topTabsBarPill}>
              <View style={[styles.topTabBtnPill, styles.topTabBtnPillActive, { flex: 1, flexDirection: 'row', gap: 6 }]}>
                <MaterialCommunityIcons name="truck-fast-outline" size={16} color="#ffffff" />
                <Text style={styles.topTabTextActive}>
                  Hoja de Ruta (Conductor)
                </Text>
                <View style={styles.activeDotIndicator} />
              </View>
            </View>
          );
        }

        return (
          <View style={styles.topTabsBarPill}>
            <TouchableOpacity
              style={[styles.topTabBtnPill, activeTab === 'PROGRAMACION' && styles.topTabBtnPillActive, { flexDirection: 'row', gap: 5 }]}
              onPress={() => setActiveTab('PROGRAMACION')}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={14} color={activeTab === 'PROGRAMACION' ? '#ffffff' : '#64748b'} />
              <Text style={[styles.topTabText, activeTab === 'PROGRAMACION' && styles.topTabTextActive]}>
                Programación
              </Text>
              {activeTab === 'PROGRAMACION' && <View style={styles.activeDotIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.topTabBtnPill, activeTab === 'REPARTO' && styles.topTabBtnPillActive, { flexDirection: 'row', gap: 5 }]}
              onPress={() => setActiveTab('REPARTO')}
              activeOpacity={0.85}
            >
              <Ionicons name="water-outline" size={14} color={activeTab === 'REPARTO' ? '#ffffff' : '#64748b'} />
              <Text style={[styles.topTabText, activeTab === 'REPARTO' && styles.topTabTextActive]}>
                Registrar Entrega
              </Text>
              {activeTab === 'REPARTO' && <View style={styles.activeDotIndicator} />}
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ─── VISTA 1: MI PROGRAMACIÓN Y HOJA DE RUTA ─────────────────────── */}
      {activeTab === 'PROGRAMACION' ? (
        !selectedProg ? (
          <View style={styles.noProgCard}>
            <Ionicons name="clipboard-outline" size={36} color="#0284c7" />
            <Text style={styles.noProgTitle}>Sin Asignación Activa</Text>
            <Text style={styles.noProgSubtitle}>
              El usuario {user?.nombres || user?.email} ({user?.rol || 'Personal'}) no cuenta con una cisterna ni programación asignada actualmente en la base de datos de EPS Moyobamba.
            </Text>
            <TouchableOpacity style={styles.refreshBtnInline} onPress={loadProgramaciones} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="refresh-outline" size={14} color="#0284c7" />
                <Text style={styles.refreshBtnInlineText}>Actualizar Asignaciones</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.progViewContainer}>
          {/* STATUS JORNADA */}
          <View style={styles.progHeaderCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={styles.progActiveBadge}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="radio-button-on" size={10} color="#047857" />
                  <Text style={{ color: '#047857', fontWeight: '900', fontSize: 10.5 }}>JORNADA ACTIVA DE REPARTO</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '800' }}>
                Prog #{selectedProg?.id || 1}
              </Text>
            </View>
            <Text style={styles.progTitle}>
              Hoja de Ruta y Asignación de Cisterna
            </Text>
            <Text style={styles.progSubtitle}>
              EPS Moyobamba S.A. • Distribución fiscalizada de agua potable en cisternas
            </Text>
          </View>

          {/* SELECTOR DE PROGRAMACIONES SI EXISTEN MÁS DE UNA */}
          {programaciones.length > 1 && (
            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#334155', marginBottom: 6 }}>
                Mis Rutas / Programaciones:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 6 }}>
                {programaciones.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.progChip,
                      selectedProg?.id === p.id && styles.progChipActive
                    ]}
                    onPress={() => {
                      setSelectedProg(p);
                      if (p.cisterna_id) setSelectedCisternaId(p.cisterna_id);
                      if (p.conductor_id) setSelectedConductorId(p.conductor_id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.progChipText, selectedProg?.id === p.id && styles.progChipTextActive]}>
                      Ruta #{p.id} • {p.cisterna_placa || 'Cisterna'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* CARD 1: CAMIÓN CISTERNA ASIGNADO */}
          <View style={styles.cisternaDetailCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View style={styles.cisternaIconCircle}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={24} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cisternaPlacaTitle} numberOfLines={1}>
                    {selectedProg?.cisterna_placa || activeCisterna?.placa || 'Sin cisterna'}
                  </Text>
                  <Text style={styles.cisternaMarcaText} numberOfLines={1}>
                    {selectedProg?.cisterna_marca || activeCisterna?.marca_modelo || 'Flota EPS Moyobamba'}
                  </Text>
                </View>
              </View>

              <View style={styles.operativoPill}>
                <Text style={styles.operativoText}>OPERATIVO</Text>
              </View>
            </View>

            {/* VOLUMEN Y CAPACIDAD DEL CAMIÓN CISTERNA */}
            <View style={styles.volumenBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <Text style={styles.volumenLabel}>CAPACIDAD TOTAL</Text>
                <Text style={styles.volumenValue}>
                  {selectedProg?.cisterna_capacidad_m3 || activeCisterna?.capacidad_m3 || 0} m³ • {Number(selectedProg?.cisterna_capacidad_litros || activeCisterna?.capacidad_litros || 0).toLocaleString('es-PE')} Lts
                </Text>
              </View>
              <View style={styles.volumenProgressBarBg}>
                <View style={[styles.volumenProgressBarFill, { width: '100%' }]} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="water-outline" size={12} color="#64748b" />
                <Text style={styles.volumenHint}>
                  Tanque asignado para abastecimiento directo a beneficiarios
                </Text>
              </View>
            </View>
          </View>

          {/* CARD 2: CUADRILLA ASIGNADA (CONDUCTOR Y AYUDANTE) */}
          <View style={styles.cuadrillaCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="people-outline" size={17} color="#0284c7" />
              <Text style={styles.sectoresCardTitle}>Cuadrilla de Distribución Asignada</Text>
            </View>

            <View style={styles.cuadrillaRow}>
              {/* CONDUCTOR */}
              <View style={styles.cuadrillaMemberBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="person-outline" size={13} color="#0284c7" />
                  <Text style={styles.cuadrillaRoleLabel}>CONDUCTOR</Text>
                </View>
                <Text style={styles.cuadrillaMemberName} numberOfLines={2}>
                  {selectedProg?.conductor_nombre || 'Sin conductor'}
                </Text>
                {selectedProg?.conductor_telefono && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="call-outline" size={11} color="#64748b" />
                    <Text style={styles.cuadrillaMemberContact}>{selectedProg.conductor_telefono}</Text>
                  </View>
                )}
              </View>

              {/* AYUDANTE */}
              <View style={[styles.cuadrillaMemberBox, { backgroundColor: selectedProg?.ayudante_nombre ? '#f0fdf4' : '#f8fafc', borderColor: selectedProg?.ayudante_nombre ? '#bbf7d0' : '#e2e8f0' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="person-outline" size={13} color={selectedProg?.ayudante_nombre ? '#15803d' : '#64748b'} />
                  <Text style={[styles.cuadrillaRoleLabel, { color: selectedProg?.ayudante_nombre ? '#15803d' : '#64748b' }]}>
                    AYUDANTE
                  </Text>
                </View>
                <Text style={[styles.cuadrillaMemberName, { color: selectedProg?.ayudante_nombre ? '#14532d' : '#94a3b8' }]} numberOfLines={2}>
                  {selectedProg?.ayudante_nombre || 'Sin ayudante'}
                </Text>
                {selectedProg?.ayudante_telefono ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="call-outline" size={11} color="#64748b" />
                    <Text style={styles.cuadrillaMemberContact}>{selectedProg.ayudante_telefono}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>Unipersonal</Text>
                )}
              </View>
            </View>
          </View>

          {/* CARD 3: SECTORES ASIGNADOS A REPARTIR */}
          <View style={styles.sectoresCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="location-outline" size={17} color="#0284c7" />
              <Text style={styles.sectoresCardTitle}>Sectores / AA.HH. Asignados</Text>
            </View>

            <View style={styles.sectoresPillsRow}>
              {(selectedProg?.zona ? selectedProg.zona.split(',') : []).map((sec: string, idx: number) => (
                <View key={idx} style={styles.sectorItemBadge}>
                  <Ionicons name="navigate-outline" size={11} color="#0369a1" style={{ marginRight: 4 }} />
                  <Text style={styles.sectorItemBadgeText}>{sec.trim()}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectoresMetaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>DÍAS DE ATENCIÓN</Text>
                <Text style={styles.metaValue}>{selectedProg?.dias_semana || 'Lunes a Viernes'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>VIAJES PROGRAMADOS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Ionicons name="flag-outline" size={12} color="#0f172a" />
                  <Text style={styles.metaValue}>{selectedProg?.viajes_estimados || 2} Viajes</Text>
                </View>
              </View>
            </View>
          </View>

          {/* CARD 4: CONTROL SANITARIO TDR */}
          <View style={styles.tdrCalidadCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flask-outline" size={16} color="#0284c7" />
                <Text style={styles.tdrCardTitle}>Control Sanitario TDR</Text>
              </View>
              <TouchableOpacity
                style={styles.btnMedirMini}
                onPress={() => setCalidadModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="flask-outline" size={12} color="#0284c7" />
                <Text style={styles.btnMedirMiniText}>Medir Test</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tdrStepsRow}>
              <View style={[styles.tdrStepBox, { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="water-outline" size={11} color="#0369a1" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369a1' }}>1. Al Cargar</Text>
                </View>
                <Text style={{ fontSize: 9.5, color: '#0284c7' }}>Surtidor / Planta</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0f172a', marginTop: 3 }}>
                  Cloro: {cloroPpm} ppm
                </Text>
              </View>

              <View style={[styles.tdrStepBox, { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={11} color="#15803d" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803d' }}>2. En Ruta</Text>
                </View>
                <Text style={{ fontSize: 9.5, color: '#16a34a' }}>Grifo en Sector</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0f172a', marginTop: 3 }}>
                  Turb: {turbiedadNtu} NTU
                </Text>
              </View>
            </View>
          </View>

          {/* CARD 5: AVANCE DE JORNADA & 4 INDICADORES CLAVE */}
          <View style={styles.avanceCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.avanceLabel}>ENTREGAS HOY</Text>
                <Text style={styles.avanceValue}>
                  {selectedProg?.total_entregas || 0} Familias Atendidas
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.avanceLabel}>VOLUMEN DESPACHADO</Text>
                <Text style={[styles.avanceValue, { color: '#0284c7' }]}>
                  {Number(selectedProg?.total_litros || 0).toLocaleString('es-PE')} Lts
                </Text>
              </View>
            </View>

            {/* 4 MÉTRICAS OPERATIVAS CLAVE (VOL. REPARTIDO, PROMEDIO, POBLACIÓN Y MONTO) */}
            <View style={styles.metricsQuadGrid}>
              <View style={[styles.metricQuadCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                <Text style={[styles.metricQuadTag, { color: '#0369a1' }]}>🚰 VOL. REPARTIDO</Text>
                <Text style={[styles.metricQuadValue, { color: '#0369a1' }]}>
                  {progMetrics.volRepartido.toLocaleString()} L
                </Text>
                <Text style={styles.metricQuadSub}>{(progMetrics.volRepartido / 1000).toFixed(1)} m³ fiscalizados</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                <Text style={[styles.metricQuadTag, { color: '#3730a3' }]}>📊 VOL. PROMEDIO</Text>
                <Text style={[styles.metricQuadValue, { color: '#3730a3' }]}>
                  {progMetrics.volPromedio.toLocaleString()} L
                </Text>
                <Text style={styles.metricQuadSub}>Por familia entregada</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                <Text style={[styles.metricQuadTag, { color: '#6b21a8' }]}>👥 POBLACIÓN</Text>
                <Text style={[styles.metricQuadValue, { color: '#6b21a8' }]}>
                  {progMetrics.poblacion.toLocaleString()} hab.
                </Text>
                <Text style={styles.metricQuadSub}>Beneficiarios en ruta</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Text style={[styles.metricQuadTag, { color: '#166534' }]}>💰 MONTO VALORIZADO</Text>
                <Text style={[styles.metricQuadValue, { color: '#166534' }]}>
                  S/. {progMetrics.monto.toFixed(2)}
                </Text>
                <Text style={styles.metricQuadSub}>Subsidio EPS / PNSU</Text>
              </View>
            </View>
          </View>

          {/* BOTÓN PRINCIPAL DE ACCIÓN: CONDUCCIÓN VS REGISTRO COORDINADOR */}
          {String(user?.rol || '').toUpperCase() === 'CONDUCTOR' ? (
            <View style={[styles.btnIniciarReparto, { backgroundColor: '#059669' }]}>
              <MaterialCommunityIcons name="truck-fast-outline" size={20} color="#ffffff" />
              <Text style={styles.btnIniciarRepartoText}>
                CISTERNA EN RUTA
              </Text>
              <Ionicons name="checkmark-circle-outline" size={16} color="#d1fae5" />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.btnIniciarReparto}
              onPress={() => setActiveTab('REPARTO')}
              activeOpacity={0.88}
            >
              <Ionicons name="water-outline" size={18} color="#ffffff" />
              <Text style={styles.btnIniciarRepartoText}>
                REGISTRAR ENTREGA
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
        )
      ) : (
        /* ─── VISTA 2: REGISTRAR ENTREGA (QR, DNI, FIRMA, FOTO) ───────── */
        <View style={{ width: '100%' }}>
          {/* GPS RADAR BANNER */}
          <View style={styles.gpsBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 6 }}>
              <View style={styles.gpsPulseDot} />
              <Text style={styles.gpsText} numberOfLines={1}>
                <Text style={{ fontWeight: '800', color: '#0369a1' }}>GPS: </Text>
                {location ? (
                  <Text style={{ fontWeight: '700', color: '#0c4a6e' }}>
                    {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)} (±{Math.round(location.coords.accuracy || 0)}m)
                  </Text>
                ) : locationLoading ? (
                  <Text style={{ color: '#0284c7' }}>Buscando satélite...</Text>
                ) : (
                  <Text style={{ color: '#d97706' }}>Sin señal</Text>
                )}
              </Text>
            </View>

            <TouchableOpacity onPress={fetchGpsLocation} style={styles.gpsRefreshBtn} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={16} color="#0284c7" />
            </TouchableOpacity>
          </View>

          {/* BARRA DE INDICADORES CLAVE (VOL. REPARTIDO, PROMEDIO, POBLACIÓN, MONTO) */}
          <View style={styles.metricsSummaryContainer}>
            <View style={styles.metricsSummaryHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="stats-chart" size={14} color="#0369a1" />
                <Text style={styles.metricsSummaryTitle}>INDICADORES OPERATIVOS EN RUTA</Text>
              </View>
              <Text style={styles.metricsSummaryBadge}>Prog #{selectedProg?.id || 1}</Text>
            </View>

            <View style={styles.metricsQuadGrid}>
              <View style={[styles.metricQuadCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                <Text style={[styles.metricQuadTag, { color: '#0369a1' }]}>🚰 VOL. REPARTIDO</Text>
                <Text style={[styles.metricQuadValue, { color: '#0369a1' }]}>
                  {progMetrics.volRepartido.toLocaleString()} L
                </Text>
                <Text style={styles.metricQuadSub}>{(progMetrics.volRepartido / 1000).toFixed(1)} m³</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                <Text style={[styles.metricQuadTag, { color: '#3730a3' }]}>📊 VOL. PROMEDIO</Text>
                <Text style={[styles.metricQuadValue, { color: '#3730a3' }]}>
                  {progMetrics.volPromedio.toLocaleString()} L
                </Text>
                <Text style={styles.metricQuadSub}>Por familia</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                <Text style={[styles.metricQuadTag, { color: '#6b21a8' }]}>👥 POBLACIÓN</Text>
                <Text style={[styles.metricQuadValue, { color: '#6b21a8' }]}>
                  {progMetrics.poblacion.toLocaleString()} hab.
                </Text>
                <Text style={styles.metricQuadSub}>Beneficiarios</Text>
              </View>

              <View style={[styles.metricQuadCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Text style={[styles.metricQuadTag, { color: '#166534' }]}>💰 MONTO VALORIZADO</Text>
                <Text style={[styles.metricQuadValue, { color: '#166534' }]}>
                  S/. {progMetrics.monto.toFixed(2)}
                </Text>
                <Text style={styles.metricQuadSub}>Subsidio EPS</Text>
              </View>
            </View>
          </View>

      {/* CISTERNA & CONDUCTOR SELECTOR CARD */}
      <View style={styles.flotaCard}>
        <View style={styles.flotaCardHeader}>
          <MaterialCommunityIcons name="truck-fast-outline" size={16} color="#0369a1" />
          <Text style={styles.flotaCardTitle}>Asignación de Jornada en Campo</Text>
        </View>

        <View style={styles.flotaRow}>
          {/* CISTERNA SELECTOR */}
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.flotaLabel}>Cisterna:</Text>
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
            <Text style={styles.flotaLabel}>Conductor:</Text>
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
            <Ionicons name="water-outline" size={14} color="#0369a1" />
            <Text style={{ fontSize: 11.5, color: '#0369a1', fontWeight: '800' }}>
              Capacidad: {activeCisterna?.capacidad_m3 || 0} m³ • {Number(activeCisterna?.capacidad_litros || 0).toLocaleString()} Lts
            </Text>
          </View>
          <View style={styles.tripBadge}>
            <Ionicons name="flag-outline" size={11} color="#059669" style={{ marginRight: 3 }} />
            <Text style={styles.tripBadgeText}>2 Viajes</Text>
          </View>
        </View>
      </View>

      {/* DEDICATED WATER QUALITY CONTROL CARD */}
      <View style={styles.calidadCard}>
        {(() => {
          const cMin = Number(systemConfig?.cloro_min_ppm) || 0.5;
          const cMax = Number(systemConfig?.cloro_max_ppm) || 2.0;
          const tMax = Number(systemConfig?.turbiedad_max_ntu) || 5.0;
          const isApto = parseFloat(cloroPpm) >= cMin && parseFloat(cloroPpm) <= cMax && parseFloat(turbiedadNtu) <= tMax;
          return (
            <View style={styles.calidadCardTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6 }}>
                <Ionicons name="flask-outline" size={15} color="#0369a1" />
                <Text style={styles.calidadCardTitle} numberOfLines={1}>Control Sanitario</Text>
              </View>
              <View style={isApto ? styles.calidadStatusPillOk : styles.calidadStatusPillWarn}>
                <Ionicons name={isApto ? "checkmark-circle" : "alert-circle"} size={11} color={isApto ? "#15803d" : "#b91c1c"} />
                <Text style={isApto ? styles.calidadStatusTextOk : styles.calidadStatusTextWarn}>
                  {isApto ? 'Apto' : 'No Apto'}
                </Text>
              </View>
            </View>
          );
        })()}

        <View style={styles.calidadParamsRow}>
          <View style={styles.calidadMetricBox}>
            <Text style={styles.calidadMetricLabel}>CLORO</Text>
            <Text style={styles.calidadMetricValue}>{cloroPpm} ppm</Text>
          </View>

          <View style={styles.calidadMetricBox}>
            <Text style={styles.calidadMetricLabel}>TURBIEDAD</Text>
            <Text style={styles.calidadMetricValue}>{turbiedadNtu} NTU</Text>
          </View>

          <TouchableOpacity
            style={styles.calidadActionBtn}
            onPress={() => setCalidadModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="flask-outline" size={12} color="#ffffff" />
            <Text style={styles.calidadActionBtnText}>Medir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SECCIÓN INTUITIVA DE IDENTIFICACIÓN: ESCÁNER QR Y BÚSQUEDA MANUAL DNI */}
      <View style={styles.identificacionCard}>
        {/* BOTÓN PROMINENTE DE ESCANEO QR */}
        <TouchableOpacity
          style={styles.scanPrimaryBtn}
          onPress={openQrScanner}
          activeOpacity={0.88}
        >
          <View style={styles.scanIconBox}>
            <Ionicons name="qr-code-outline" size={24} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanPrimaryTitle}>ESCANEAR CÓDIGO QR</Text>
            <Text style={styles.scanPrimarySubtitle}>Lectura instantánea de vales EPS</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
        </TouchableOpacity>

        {/* SEPARADOR ELEGANTE */}
        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>O BÚSQUEDA POR DNI / CÓDIGO</Text>
          <View style={styles.orLine} />
        </View>

        {/* BARRA DE BÚSQUEDA MANUAL */}
        <View style={styles.searchManualRow}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search-outline" size={16} color="#0284c7" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.input}
              placeholder="DNI o código de vale"
              placeholderTextColor="#94a3b8"
              value={dni}
              onChangeText={setDni}
              keyboardType="numeric"
              maxLength={15}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ y: 380, animated: true });
                }, 120);
              }}
              onSubmitEditing={() => handleSearchDNI()}
            />
            {dni ? (
              <TouchableOpacity onPress={() => setDni('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => handleSearchDNI()}
            disabled={searching}
            activeOpacity={0.85}
          >
            {searching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>Buscar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* BENEFICIARY CARD */}
      {beneficiario && (
        <View style={styles.card}>
          {/* TOP CARD HEADER WITH BADGES & CLOSE BUTTON */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardBadges}>
              <View style={styles.badgeSector}>
                <Ionicons name="location-outline" size={11} color="#0284c7" style={{ marginRight: 3 }} />
                <Text style={styles.badgeSectorText}>
                  {beneficiario.sector_aahh || beneficiario.sector || 'Sector General'}
                </Text>
              </View>
              {valeCodigo && (
                <View style={styles.badgeVale}>
                  <Ionicons name="ticket-outline" size={11} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.badgeValeText}>
                    {valeCodigo}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.closeCardBtn} onPress={handleCancelBeneficiary} activeOpacity={0.7}>
              <Ionicons name="close" size={16} color="#dc2626" />
            </TouchableOpacity>
          </View>

          <Text style={styles.cardTitle}>{beneficiario.nombres_apellidos}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>DNI:</Text>
            <Text style={styles.infoValue}>{beneficiario.dni}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dirección:</Text>
            <Text style={styles.infoValue}>{direccionCompleta || 'Sin dirección'}</Text>
          </View>

          {beneficiario.num_vivienda ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>N° Vivienda:</Text>
              <Text style={styles.infoValue}>{beneficiario.num_vivienda}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Miembros:</Text>
            <Text style={styles.infoValue}>{beneficiario.num_miembros} personas</Text>
          </View>

          {/* CALCULATION & EDITABLE LITERS BOX CON SALDO PENDIENTE */}
          {(() => {
            const ltsNum = parseFloat(litrosEntregar) || 0;
            const saldoBase = tieneEntregaPrevia ? saldoPendiente : cuotaTotal;
            const saldoQueQuedara = Math.max(0, saldoBase - ltsNum);
            const esParcial = saldoQueQuedara > 0;
            const excedeCuota = ltsNum > saldoBase;

            return (
              <View style={styles.waterCalcBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="water-outline" size={15} color="#0369a1" />
                    <Text style={styles.waterCalcTitle}>Cuota y Dotación Familiar (Semanal)</Text>
                  </View>
                  <Text style={styles.dotacionPill}>{DOTACION_POR_HABITANTE} L/hab/día</Text>
                </View>

                <Text style={styles.waterCalcSub}>
                  👥 Personas: {beneficiario.num_miembros || 1} integrantes (Titular + Familiares){'\n'}
                  💧 Dotación Diaria: {beneficiario.num_miembros || 1} pers. × {DOTACION_POR_HABITANTE} L = {(beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE} Lts/día{'\n'}
                  📅 Vale Semanal (7 días): {(beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE} L × 7 días = <Text style={{ fontWeight: '800', color: '#0369a1' }}>{cuotaTotal} Litros</Text>
                </Text>

                {tieneEntregaPrevia ? (
                  <View style={{ backgroundColor: '#fef3c7', padding: 8, borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontSize: 11.5, color: '#92400e', fontWeight: '700' }}>
                      ⚠️ Historial en esta ruta: Ya recibió {entregadoPrevio} Lts previamente.
                    </Text>
                    <Text style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                      Saldo pendiente inicial: {saldoPendiente} Lts por entregar.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.litersInputRow}>
                  <Text style={styles.litersInputLabel}>Litros a Entregar Ahora:</Text>
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

                {/* VISOR EN TIEMPO REAL DE SALDO PENDIENTE */}
                {excedeCuota ? (
                  <View style={{ backgroundColor: '#eff6ff', padding: 8, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: '#bfdbfe' }}>
                    <Text style={{ fontSize: 11.5, color: '#1d4ed8', fontWeight: '700' }}>
                      ℹ️ Dotación Especial: Se entregan {ltsNum} Lts (Excede la cuota sugerida en {ltsNum - saldoBase} Lts).
                    </Text>
                  </View>
                ) : esParcial ? (
                  <View style={{ backgroundColor: '#fffbeb', padding: 10, borderRadius: 8, marginTop: 8, borderWidth: 1.5, borderColor: '#f59e0b' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="alert-circle" size={16} color="#d97706" />
                      <Text style={{ fontSize: 12, color: '#b45309', fontWeight: '900' }}>
                        ENTREGA PARCIAL DETECTADA
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#78350f', marginTop: 4 }}>
                      • Se registrarán: <Text style={{ fontWeight: '800' }}>{ltsNum} Litros entregados</Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: '#b45309', fontWeight: '800', marginTop: 2 }}>
                      • Saldo que quedará pendiente: {saldoQueQuedara} Litros por entregar
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginTop: 8, borderWidth: 1.5, borderColor: '#22c55e' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                      <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '900' }}>
                        ENTREGA COMPLETA (100% CUBIERTA)
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#166534', marginTop: 3 }}>
                      Se entrega la cuota total de {ltsNum} Lts. No queda saldo pendiente.
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* PHOTO EVIDENCE SECTION (OBLIGATORIA) */}
          <View style={styles.photoSection}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="camera-outline" size={16} color="#0f172a" />
                <Text style={styles.label}>Fotografía de Evidencia (Obligatorio *)</Text>
              </View>
              {photoUri ? (
                <View style={styles.statusPillOk}>
                  <Ionicons name="checkmark-circle" size={11} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.statusPillOkText}>Capturada</Text>
                </View>
              ) : (
                <View style={[styles.statusPillPending, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
                  <Ionicons name="alert-circle" size={11} color="#dc2626" style={{ marginRight: 3 }} />
                  <Text style={[styles.statusPillPendingText, { color: '#dc2626' }]}>Obligatorio *</Text>
                </View>
              )}
            </View>

            {photoUri ? (
              <View style={styles.photoPreviewRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setTempPhotoUri(photoUri);
                    setPhotoPreviewVisible(true);
                  }}
                  style={styles.photoThumbContainer}
                >
                  <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
                  <View style={styles.thumbGpsBadge}>
                    <Ionicons name="location" size={10} color="#ffffff" />
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <Ionicons name="checkmark-circle" size={15} color="#059669" />
                    <Text style={styles.photoSavedText}>Evidencia GPS Vinculada</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }} numberOfLines={1}>
                    🌐 {photoGpsCoords?.lat || '-6.034172'}, {photoGpsCoords?.lng || '-76.971391'}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#64748b', marginBottom: 6 }} numberOfLines={1}>
                    🕒 {photoTimestamp || 'Capturada'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.viewPhotoBtn}
                      onPress={() => {
                        setTempPhotoUri(photoUri);
                        setPhotoPreviewVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="eye-outline" size={12} color="#0284c7" />
                      <Text style={styles.viewPhotoBtnText}>Ver con datos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.retakeBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="camera-reverse-outline" size={12} color="#334155" />
                        <Text style={styles.retakeBtnText}>Cambiar</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.takePhotoBtn} onPress={handleTakePhoto} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.takePhotoBtnText}>📸 Tomar Fotografía (Requerido)</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* DIGITAL SIGNATURE CANVAS (OPCIONAL - BLOQUEADO POR DEFECTO) */}
          <View style={styles.sigSection}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="pencil-outline" size={15} color="#0f172a" />
                <Text style={styles.label}>Firma del Beneficiario (Opcional)</Text>
              </View>
              {hasSignature ? (
                <View style={styles.statusPillOk}>
                  <Ionicons name="checkmark-circle" size={11} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.statusPillOkText}>Firmado</Text>
                </View>
              ) : (
                <View style={[styles.statusPillPending, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}>
                  <Text style={[styles.statusPillPendingText, { color: '#64748b' }]}>Opcional</Text>
                </View>
              )}
            </View>

            {showSignaturePad ? (
              <>
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
                    descriptionText="Firme aquí sobre la línea"
                  />
                </View>

                <View style={[styles.sigButtonsRow, { justifyContent: 'space-between' }]}>
                  <TouchableOpacity
                    style={styles.removeSigBtn}
                    onPress={() => {
                      signatureRef.current?.clearSignature();
                      setHasSignature(false);
                      setShowSignaturePad(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="close-circle-outline" size={13} color="#dc2626" />
                      <Text style={styles.removeSigBtnText}>✕ Omitir Firma</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.clearSigBtn}
                    onPress={() => {
                      signatureRef.current?.clearSignature();
                      setHasSignature(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="trash-outline" size={12} color="#475569" />
                      <Text style={styles.clearSigBtnText}>Limpiar trazo</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.addSignatureBtn}
                onPress={() => setShowSignaturePad(true)}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Ionicons name="create-outline" size={18} color="#0284c7" />
                  <Text style={styles.addSignatureBtnText}>✍️ Agregar Firma</Text>
                </View>
                <Text style={styles.addSignatureBtnSubtext}>
                  Toque aquí si el beneficiario va a firmar en pantalla
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* REGISTER DELIVERY BUTTON */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDelivery} activeOpacity={0.85}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="checkmark-done-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.saveBtnText}>REGISTRAR ENTREGA</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )}

      {/* PHOTO PREVIEW MODAL (CONFIRM / RETAKE CON MARCA DE AGUA VISIBLE) */}
      <Modal visible={photoPreviewVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardEvidence}>
            <View style={styles.modalEvidenceHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Evidencia Fotográfica de Entrega</Text>
                <Text style={styles.modalSubtitleCian}>📍 Datos satelitales y georreferenciación oficial</Text>
              </View>
              <View style={styles.liveGpsPill}>
                <View style={styles.liveGpsDot} />
                <Text style={styles.liveGpsPillText}>GPS ACTIVO</Text>
              </View>
            </View>

            {/* FOTOGRAFÍA CON BANNER DE EVIDENCIA ESTAMPADO VISIBLEMENTE */}
            <View style={styles.evidencePhotoWrapper}>
              {tempPhotoUri && (
                <Image source={{ uri: tempPhotoUri }} style={styles.evidencePhotoImage} resizeMode="cover" />
              )}

              {/* FRANJA DE METADATOS INTEGRADA DIRECTAMENTE SOBRE LA FOTO */}
              <View style={styles.evidenceWatermarkBanner}>
                <View style={styles.watermarkLineOrg}>
                  <Text style={styles.watermarkOrgTitle}>🏢 EPS MOYOBAMBA</Text>
                  <Text style={styles.watermarkUnitBadge}>
                    🚛 {cisternas.find((c) => c.id === selectedCisternaId)?.placa || selectedProg?.cisterna_placa || 'EGA-902'}
                  </Text>
                </View>

                <Text style={styles.watermarkLineTextWhite} numberOfLines={1}>
                  👤 {beneficiario?.nombres_apellidos || 'Beneficiario Acreditado'} • DNI: {beneficiario?.dni || '-'}
                </Text>

                <Text style={styles.watermarkLineTextGray} numberOfLines={1}>
                  📍 {beneficiario?.sector_aahh || beneficiario?.sector || selectedProg?.zona || 'Moyobamba'} • {beneficiario?.calle_direccion || beneficiario?.direccion || '-'}
                </Text>

                <View style={styles.watermarkGpsRow}>
                  <Text style={styles.watermarkGpsGreen}>
                    🌐 GPS: Lat {photoGpsCoords?.lat || '-6.034172'}, Long {photoGpsCoords?.lng || '-76.971391'} (±{photoGpsCoords?.acc || '5'}m)
                  </Text>
                </View>

                <View style={styles.watermarkFooterRow}>
                  <Text style={styles.watermarkFooterTime}>
                    🕒 {photoTimestamp || new Date().toLocaleString('es-PE')}
                  </Text>
                  <Text style={styles.watermarkStatusTag}>FEHACIENTE</Text>
                </View>
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalRetakeBtn} onPress={handleRetakePhoto} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="camera-reverse-outline" size={15} color="#334155" />
                  <Text style={styles.btnTextBlack}>Volver a tomar</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmPhoto} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                  <Text style={styles.btnText}>Confirmar y Usar</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WATER QUALITY TEST MODAL (MODERNO, ESPACIOSO Y ERGONÓMICO) */}
      <Modal visible={calidadModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardCalidad}>
            {/* MODAL HEADER CON BOTÓN CERRAR */}
            <View style={styles.modalCalidadHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalFlaskCircle}>
                  <Ionicons name="flask" size={20} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalCalidadTitle}>Control de Calidad</Text>
                  <Text style={styles.modalCalidadSubtitle}>TDR EPS Moyobamba • D.S. 031-2010</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setCalidadModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* SECCIÓN 1: ETAPA DEL CONTROL SANITARIO (FILAS DE SELECCIÓN ERGONÓMICAS) */}
            <Text style={styles.modalSectionLabel}>ETAPA DEL CONTROL SANITARIO:</Text>
            
            <View style={styles.etapaOptionsContainer}>
              {/* ETAPA 1: AL CARGAR */}
              <TouchableOpacity
                style={[styles.etapaRowCard, etapaControl === 'CARGA' && styles.etapaRowCardActive]}
                onPress={() => setEtapaControl('CARGA')}
                activeOpacity={0.8}
              >
                <View style={[styles.etapaRowIconBox, etapaControl === 'CARGA' && styles.etapaRowIconBoxActive]}>
                  <Ionicons name="water-outline" size={16} color={etapaControl === 'CARGA' ? '#ffffff' : '#0284c7'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.etapaRowName, etapaControl === 'CARGA' && styles.etapaRowNameActive]}>
                    1. Al Cargar la Cisterna
                  </Text>
                  <Text style={styles.etapaRowDesc}>Llenado en Surtidor o Planta</Text>
                </View>
                <Ionicons
                  name={etapaControl === 'CARGA' ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={etapaControl === 'CARGA' ? '#0284c7' : '#cbd5e1'}
                />
              </TouchableOpacity>

              {/* ETAPA 2: EN RUTA */}
              <TouchableOpacity
                style={[styles.etapaRowCard, etapaControl === 'RUTA' && styles.etapaRowCardActive]}
                onPress={() => setEtapaControl('RUTA')}
                activeOpacity={0.8}
              >
                <View style={[styles.etapaRowIconBox, etapaControl === 'RUTA' && styles.etapaRowIconBoxActive]}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={etapaControl === 'RUTA' ? '#ffffff' : '#15803d'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.etapaRowName, etapaControl === 'RUTA' && styles.etapaRowNameActive]}>
                    2. En Ruta de Reparto
                  </Text>
                  <Text style={styles.etapaRowDesc}>Durante la entrega en sector</Text>
                </View>
                <Ionicons
                  name={etapaControl === 'RUTA' ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={etapaControl === 'RUTA' ? '#15803d' : '#cbd5e1'}
                />
              </TouchableOpacity>

              {/* ETAPA 3: ADICIONAL */}
              <TouchableOpacity
                style={[styles.etapaRowCard, etapaControl === 'ADICIONAL' && styles.etapaRowCardActive]}
                onPress={() => setEtapaControl('ADICIONAL')}
                activeOpacity={0.8}
              >
                <View style={[styles.etapaRowIconBox, etapaControl === 'ADICIONAL' && styles.etapaRowIconBoxActive]}>
                  <Ionicons name="add-circle-outline" size={16} color={etapaControl === 'ADICIONAL' ? '#ffffff' : '#7e22ce'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.etapaRowName, etapaControl === 'ADICIONAL' && styles.etapaRowNameActive]}>
                    3. Muestreo Adicional
                  </Text>
                  <Text style={styles.etapaRowDesc}>Control facultativo en campo</Text>
                </View>
                <Ionicons
                  name={etapaControl === 'ADICIONAL' ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={etapaControl === 'ADICIONAL' ? '#7e22ce' : '#cbd5e1'}
                />
              </TouchableOpacity>
            </View>

            {/* SECCIÓN 2: PARÁMETROS SANITARIOS (MEDIDAS LADO A LADO CON SUFIJOS) */}
            <View style={styles.paramInputsRow}>
              {/* CLORO */}
              <View style={styles.paramInputCol}>
                <Text style={styles.paramInputLabel}>CLORO LIBRE</Text>
                <View style={styles.paramInputWrapper}>
                  <TextInput
                    style={styles.paramInputText}
                    value={cloroPpm}
                    onChangeText={setCloroPpm}
                    keyboardType="numeric"
                    placeholder="1.20"
                    placeholderTextColor="#94a3b8"
                  />
                  <Text style={styles.paramInputUnit}>ppm</Text>
                </View>
                <Text style={styles.paramInputHint}>Óptimo: 0.5 - 2.0 ppm</Text>
              </View>

              {/* TURBIEDAD */}
              <View style={styles.paramInputCol}>
                <Text style={styles.paramInputLabel}>TURBIEDAD</Text>
                <View style={styles.paramInputWrapper}>
                  <TextInput
                    style={styles.paramInputText}
                    value={turbiedadNtu}
                    onChangeText={setTurbiedadNtu}
                    keyboardType="numeric"
                    placeholder="1.40"
                    placeholderTextColor="#94a3b8"
                  />
                  <Text style={styles.paramInputUnit}>NTU</Text>
                </View>
                <Text style={styles.paramInputHint}>Límite: ≤ {systemConfig?.turbiedad_max_ntu ?? 5.0} NTU</Text>
              </View>
            </View>

            {/* ASPECTO ORGANOLÉPTICO */}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.paramInputLabel}>ASPECTO ORGANOLÉPTICO</Text>
              <View style={styles.paramInputWrapper}>
                <TextInput
                  style={[styles.paramInputText, { flex: 1, textAlign: 'left' }]}
                  value={aspectoCalidad}
                  onChangeText={setAspectoCalidad}
                  placeholder="Límpido / Incoloro"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* BOTONES DE ACCIÓN PILL */}
            <View style={styles.modalCalidadBtnRow}>
              <TouchableOpacity
                style={styles.modalCalidadCancelBtn}
                onPress={() => setCalidadModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCalidadCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCalidadSaveBtn}
                onPress={handleSaveCalidad}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={17} color="#ffffff" />
                <Text style={styles.modalCalidadSaveText}>Guardar Test</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: '#f1f5f9', // Canvas claro y suave
  },

  // 1. MODERN CURVED HEADER (INSPIRADO EN LA REFERENCIA)
  headerModernCurve: {
    backgroundColor: '#0284c7',
    paddingTop: 16,
    paddingBottom: 22,
    paddingHorizontal: 16,
    borderRadius: 28,
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  welcomeText: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  roleSubtext: {
    fontSize: 11,
    color: '#bae6fd',
    fontWeight: '700',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  syncBtnPill: {
    backgroundColor: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  syncBtnPillText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '800',
  },
  logoutBtnPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoutBtnPillText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  // 2. SEGMENTED PILL BAR FLOTANTE
  topTabsBarPill: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 5,
    marginBottom: 16,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  topTabBtnPill: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  topTabBtnPillActive: {
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  topTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  topTabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  activeDotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
    marginTop: 4,
  },

  // PROGRAMACION VIEW STYLES
  progViewContainer: {
    width: '100%',
    gap: 14,
  },
  progHeaderCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  progActiveBadge: {
    backgroundColor: '#dcfce7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  progTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 8,
  },
  progSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 16,
  },
  progChip: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    marginRight: 8,
  },
  progChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  progChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  progChipTextActive: {
    color: '#0369a1',
    fontWeight: '800',
  },

  // 3. CISTERNA DETAIL CARD (ESTILO FLEET CARD / CREDIT CARD)
  cisternaDetailCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  cisternaIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7dd3fc',
  },
  cisternaPlacaTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0369a1',
    letterSpacing: 0.4,
  },
  cisternaMarcaText: {
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  operativoPill: {
    backgroundColor: '#dcfce7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    flexShrink: 0,
    alignSelf: 'center',
  },
  operativoText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: 0.2,
  },
  volumenBox: {
    marginTop: 14,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  volumenLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
  },
  volumenValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0284c7',
  },
  volumenProgressBarBg: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    marginVertical: 10,
    overflow: 'hidden',
  },
  volumenProgressBarFill: {
    height: '100%',
    backgroundColor: '#0284c7',
    borderRadius: 6,
  },
  volumenHint: {
    fontSize: 10.5,
    color: '#64748b',
    lineHeight: 15,
  },

  // 4. CUADRILLA CARD (LIKE CATEGORY BOXES)
  cuadrillaCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cuadrillaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cuadrillaMemberBox: {
    flex: 1,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  cuadrillaRoleLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.3,
  },
  cuadrillaMemberName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 5,
  },
  cuadrillaMemberContact: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 3,
  },

  // SIN PROGRAMACION CARD
  noProgCard: {
    backgroundColor: '#ffffff',
    padding: 26,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  noProgTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 6,
  },
  noProgSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 10,
  },
  refreshBtnInline: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 20,
  },
  refreshBtnInlineText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '800',
  },

  // 5. SECTORES CARD
  sectoresCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  sectoresCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  sectoresPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectorItemBadge: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectorItemBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0369a1',
  },
  sectoresMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 3,
  },

  // 6. TDR CALIDAD CARD
  tdrCalidadCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  tdrCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  btnMedirMini: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  btnMedirMiniText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  tdrStepsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tdrStepBox: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
  },

  // AVANCE CARD
  avanceCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  avanceLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
  },
  avanceValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 3,
  },

  // BOTÓN INICIAR REPARTO (PILL SHAPED)
  btnIniciarReparto: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 28,
    marginTop: 6,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  btnIniciarRepartoText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // 4 MÉTRICAS OPERATIVAS CLAVE (VOL. REPARTIDO, PROMEDIO, POBLACIÓN, MONTO)
  metricsQuadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  metricQuadCard: {
    flex: 1,
    minWidth: '45%',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  metricQuadTag: {
    fontSize: 9.5,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricQuadValue: {
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  metricQuadSub: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '600',
  },
  metricsSummaryContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    padding: 12,
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  metricsSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  metricsSummaryTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0369a1',
    letterSpacing: 0.5,
  },
  metricsSummaryBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  // GPS RADAR BANNER
  gpsBanner: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gpsPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  gpsText: {
    fontSize: 12,
    color: '#334155',
  },
  gpsRefreshBtn: {
    padding: 4,
  },
  gpsRefreshText: {
    fontSize: 14,
  },

  // FLOTA & LOGISTICS CARD
  flotaCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  flotaCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  flotaCardIcon: {
    fontSize: 16,
  },
  flotaCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  flotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flotaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 6,
  },
  selectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipBtn: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  chipBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  logisticsStrip: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0f2fe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripBadgeText: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '800',
  },

  // CALIDAD SANITARIA CARD
  calidadCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  calidadCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  calidadCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calidadStatusPillOk: {
    backgroundColor: '#dcfce7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  calidadStatusTextOk: {
    fontSize: 10,
    fontWeight: '900',
    color: '#15803d',
  },
  calidadStatusPillWarn: {
    backgroundColor: '#fee2e2',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  calidadStatusTextWarn: {
    fontSize: 10,
    fontWeight: '900',
    color: '#b91c1c',
  },
  calidadParamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calidadMetricBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  calidadMetricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  calidadMetricValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0284c7',
    marginTop: 2,
  },
  calidadActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  calidadActionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // 7. SECCIÓN IDENTIFICACIÓN (QR & DNI) - CARD FLOTANTE CON BORDES REDONDEADOS
  identificacionCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    marginBottom: 16,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  scanPrimaryBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 26,
    gap: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  scanIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanPrimaryTitle: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  scanPrimarySubtitle: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  orText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  searchManualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  searchBtn: {
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 22,
    height: 50,
    shadowColor: '#0d9488',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  btnTextBlack: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12.5,
  },

  // 8. BENEFICIARY CARD (LIKE PRODUCT / DETAIL CARD)
  card: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    shadowColor: '#0284c7',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  badgeSector: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  badgeSectorText: {
    color: '#0284c7',
    fontSize: 11,
    fontWeight: '800',
  },
  badgeVale: {
    backgroundColor: '#ecfdf5',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
  },
  badgeValeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  closeCardBtn: {
    backgroundColor: '#fee2e2',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  closeCardBtnText: {
    color: '#dc2626',
    fontWeight: '900',
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 17.5,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    flexWrap: 'nowrap',
  },
  infoLabel: {
    fontWeight: '700',
    color: '#64748b',
    flex: 0.38,
    fontSize: 12.5,
  },
  infoValue: {
    flex: 0.62,
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 12.5,
    flexWrap: 'wrap',
  },

  // WATER CALC BOX
  waterCalcBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    padding: 14,
    borderRadius: 22,
    marginVertical: 14,
  },
  waterCalcTitle: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dotacionPill: {
    fontSize: 10.5,
    color: '#0284c7',
    fontWeight: '800',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  waterCalcSub: {
    fontSize: 12,
    color: '#0284c7',
    marginTop: 4,
    marginBottom: 10,
  },
  litersInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  litersInputLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  litersInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  litersInput: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0284c7',
    minWidth: 55,
    textAlign: 'center',
  },
  litersSuffix: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748b',
    marginLeft: 4,
  },
  partialNote: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 6,
  },

  // PHOTO & SIGNATURE SECTIONS
  photoSection: {
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  sigSection: {
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusPillOk: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusPillOkText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillPending: {
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  statusPillPendingText: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '800',
  },
  takePhotoBtn: {
    backgroundColor: '#0284c7',
    padding: 13,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  takePhotoBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13.5,
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  photoThumbnail: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  photoSavedText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '800',
  },
  retakeBtn: {
    marginTop: 5,
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
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
    height: 175,
    borderColor: '#bae6fd',
    borderWidth: 1.5,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  sigButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  clearSigBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  clearSigBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  removeSigBtn: {
    backgroundColor: '#fff1f2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  removeSigBtnText: {
    color: '#e11d48',
    fontSize: 12,
    fontWeight: '700',
  },
  addSignatureBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  addSignatureBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  addSignatureBtnSubtext: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },

  // 9. FINAL SAVE BUTTON (LIKE "PAY NOW" PILL BUTTON IN REFERENCE IMAGE)
  saveBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
    marginTop: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
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
    borderRadius: 28,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalCardEvidence: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    width: '100%',
    maxWidth: 390,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalEvidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalSubtitleCian: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '700',
    marginTop: 2,
  },
  liveGpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  liveGpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveGpsPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.4,
  },
  evidencePhotoWrapper: {
    width: '100%',
    height: 310,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    position: 'relative',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#0284c7',
  },
  evidencePhotoImage: {
    width: '100%',
    height: '100%',
  },
  evidenceWatermarkBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.90)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: '#0284c7',
  },
  watermarkLineOrg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  watermarkOrgTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.2,
  },
  watermarkUnitBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#f8fafc',
    backgroundColor: '#0369a1',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  watermarkLineTextWhite: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 14,
  },
  watermarkLineTextGray: {
    fontSize: 10,
    fontWeight: '600',
    color: '#cbd5e1',
    lineHeight: 13,
  },
  watermarkGpsRow: {
    marginTop: 2,
    marginBottom: 2,
  },
  watermarkGpsGreen: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4ade80',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  watermarkFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  watermarkFooterTime: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  watermarkStatusTag: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.5,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalRetakeBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalConfirmBtn: {
    flex: 1.3,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  photoThumbContainer: {
    position: 'relative',
  },
  thumbGpsBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#059669',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  viewPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  viewPhotoBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },

  // MODERN WATER QUALITY MODAL (INSPIRADO EN LA REFERENCIA)
  modalCardCalidad: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    width: '100%',
    maxWidth: 370,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  modalCalidadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalFlaskCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  modalCalidadTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalCalidadSubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 1,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  etapaOptionsContainer: {
    gap: 7,
    marginBottom: 12,
  },
  etapaRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  etapaRowCardActive: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  etapaRowIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etapaRowIconBoxActive: {
    backgroundColor: '#0284c7',
  },
  etapaRowName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  etapaRowNameActive: {
    color: '#0369a1',
    fontWeight: '900',
  },
  etapaRowDesc: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  paramInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  paramInputCol: {
    flex: 1,
  },
  paramInputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  paramInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  paramInputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  paramInputUnit: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284c7',
    marginLeft: 4,
  },
  paramInputHint: {
    fontSize: 9.5,
    color: '#64748b',
    marginTop: 2.5,
    fontWeight: '600',
  },
  modalCalidadBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCalidadCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCalidadCancelText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  modalCalidadSaveBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  modalCalidadSaveText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // SCANNER FULLSCREEN
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerOverlay: {
    position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  scannerHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  scannerSubtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 4,
  },
  targetFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#10b981',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  scannerFooter: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  scannerHelpText: {
    color: '#cbd5e1',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
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
