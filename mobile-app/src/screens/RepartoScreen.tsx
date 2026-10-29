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
  Keyboard,
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
import AppUpdateModal from '../components/AppUpdateModal';

// Regla de Negocio Oficial EPS Moyobamba - Abastecimiento Periódico Semanal
const DOTACION_POR_HABITANTE = 50; // 50 Litros diarios por persona (Norma SUNASS / MVCS)
const DIAS_ENTREGA_SEMANAL = 7; // Ciclo de entrega periódica semanal (7 días)
const DOTACION_SEMANAL_POR_HABITANTE = DOTACION_POR_HABITANTE * DIAS_ENTREGA_SEMANAL; // 350 Litros semanales por habitante
const PROGRAMACION_ACTUAL_ID = 1;

// Generador de los 7 días del ciclo de reparto semanal EPS Moyobamba
export const getDiasCicloSemanal = () => {
  const hoy = new Date();
  const dayOfWeek = hoy.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diffToMonday);
  lunes.setHours(0, 0, 0, 0);

  const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const cortos = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    const esHoy = d.toDateString() === hoy.toDateString();
    const diaNum = d.getDate();
    const mesNum = d.getMonth() + 1;
    const mesCorto = d.toLocaleString('es-PE', { month: 'short' }).replace('.', '');
    const fechaIso = d.toISOString().split('T')[0];
    const fechaCorta = `${diaNum} ${mesCorto}`;

    return {
      id: i,
      codigo: cortos[i],
      nombre: nombres[i],
      diaNum,
      fechaIso,
      fechaCorta,
      fechaDisplay: `${nombres[i]} ${diaNum}/${mesNum < 10 ? '0' + mesNum : mesNum}`,
      esHoy,
    };
  });
};

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

  // Selector de Día de Reparto (7 días del ciclo semanal, por defecto día y fecha actual)
  const [diasSemana, setDiasSemana] = useState(getDiasCicloSemanal);
  const [diaSeleccionado, setDiaSeleccionado] = useState<any>(() => {
    const list = getDiasCicloSemanal();
    return list.find((d) => d.esHoy) || list[0];
  });
  const [diaPickerModalVisible, setDiaPickerModalVisible] = useState(false);
  const [saldoPendiente, setSaldoPendiente] = useState(350);
  const [tieneEntregaPrevia, setTieneEntregaPrevia] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
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
  const [sectorCalidad, setSectorCalidad] = useState('SOL DE INDAÑE');
  const calidadScrollRef = useRef<ScrollView>(null);
  const [systemConfig, setSystemConfig] = useState<any>({
    dotacion_diaria_litros: 50,
    dias_entrega_semanal: 7,
    turbiedad_max_ntu: 5.0,
    cloro_min_ppm: 0.5,
    cloro_max_ppm: 2.0
  });

  // Navigation Tab State (Inicia en 'PROGRAMACION' para que el conductor vea su jornada asignada)
  const [activeTab, setActiveTab] = useState<'PROGRAMACION' | 'BENEFICIARIOS' | 'REPARTO'>('PROGRAMACION');
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [selectedProg, setSelectedProg] = useState<any | null>(null);
  const [loadingProg, setLoadingProg] = useState(false);

  // Beneficiarios asignados al sector programado
  const [beneficiariosSector, setBeneficiariosSector] = useState<any[]>([]);
  const [loadingBeneficiarios, setLoadingBeneficiarios] = useState(false);
  const [filtroBeneficiario, setFiltroBeneficiario] = useState('');
  const [filtroEstadoBenef, setFiltroEstadoBenef] = useState<'TODOS' | 'PENDIENTES' | 'ATENDIDOS'>('TODOS');
  const [sectorSeleccionado, setSectorSeleccionado] = useState<string>('TODOS');
  const [beneficiariosPage, setBeneficiariosPage] = useState(1);
  const BENEFICIARIOS_PAGE_SIZE = 15;
  const [coincidenciasModalVisible, setCoincidenciasModalVisible] = useState(false);
  const [coincidenciasResultados, setCoincidenciasResultados] = useState<any[]>([]);

  // Estado para Entrega Completa en Depósito Único por Sector
  const [depositoModalVisible, setDepositoModalVisible] = useState(false);
  const [sectorDeposito, setSectorDeposito] = useState<string>('SOL DE INDAÑE');
  const [litrosTotalesDeposito, setLitrosTotalesDeposito] = useState<string>('15000');
  const [selectedBenefIdsDeposito, setSelectedBenefIdsDeposito] = useState<number[]>([]);
  const [filtroBusquedaDeposito, setFiltroBusquedaDeposito] = useState<string>('');
  const [fotoDepositoUri, setFotoDepositoUri] = useState<string | null>(null);
  const [savingDeposito, setSavingDeposito] = useState(false);

  const formatDiasSemana = (dias?: string) => {
    if (!dias) return 'Lunes a Viernes';
    const partes = dias.split(',').map((d) => d.trim()).filter(Boolean);
    if (partes.length >= 7) return 'Lunes a Domingo (Diario)';
    if (
      partes.length >= 5 &&
      partes.some(d => d.toLowerCase().includes('lunes')) &&
      partes.some(d => d.toLowerCase().includes('viernes')) &&
      !partes.some(d => d.toLowerCase().includes('sáb') || d.toLowerCase().includes('sab')) &&
      !partes.some(d => d.toLowerCase().includes('dom'))
    ) {
      return 'Lunes a Viernes';
    }
    return partes.map((d) => {
      const t = d.toLowerCase();
      if (t.startsWith('lun')) return 'Lun';
      if (t.startsWith('mar')) return 'Mar';
      if (t.startsWith('mi')) return 'Mié';
      if (t.startsWith('jue')) return 'Jue';
      if (t.startsWith('vie')) return 'Vie';
      if (t.startsWith('s')) return 'Sáb';
      if (t.startsWith('d')) return 'Dom';
      return d;
    }).join(', ');
  };

  // Scroll lock for signature pad & keyboard auto-scroll
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchCardY, setSearchCardY] = useState(0);
  const [progBenefCardY, setProgBenefCardY] = useState(0);
  const [beneficiaryCardY, setBeneficiaryCardY] = useState(0);

  const signatureRef = useRef<SignatureViewRef>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const depositoScrollRef = useRef<ScrollView>(null);
  const activeScrollTargetRef = useRef<{ type: 'MAIN' | 'CALIDAD' | 'DEPOSITO'; y: number } | null>(null);

  const executeScrollTarget = (target: { type: 'MAIN' | 'CALIDAD' | 'DEPOSITO'; y: number } | null) => {
    if (!target) return;
    const ref =
      target.type === 'CALIDAD'
        ? calidadScrollRef.current
        : target.type === 'DEPOSITO'
        ? depositoScrollRef.current
        : scrollViewRef.current;
    if (!ref) return;
    ref.scrollTo({ y: Math.max(0, target.y), animated: true });
  };

  const focusScrollTo = (type: 'MAIN' | 'CALIDAD' | 'DEPOSITO', y: number) => {
    const target = { type, y };
    activeScrollTargetRef.current = target;
    executeScrollTarget(target);
    setTimeout(() => executeScrollTarget(target), 120);
    setTimeout(() => executeScrollTarget(target), 280);
  };

  // Listener para medir en tiempo real la altura del teclado y re-posicionar automáticamente el campo enfocado
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (activeScrollTargetRef.current) {
        setTimeout(() => executeScrollTarget(activeScrollTargetRef.current), 40);
        setTimeout(() => executeScrollTarget(activeScrollTargetRef.current), 180);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      activeScrollTargetRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

          // Si el filtro por rol de usuario no encuentra una asignación específica, usar las programaciones activas del día
          if (filteredProgs.length === 0 && data.length > 0) {
            filteredProgs = data;
          }

          setProgramaciones(filteredProgs);
          if (filteredProgs.length > 0) {
            setSelectedProg(filteredProgs[0]);
            if (filteredProgs[0].cisterna_id) setSelectedCisternaId(filteredProgs[0].cisterna_id);
            if (filteredProgs[0].conductor_id) setSelectedConductorId(filteredProgs[0].conductor_id);
            loadBeneficiariosSector(filteredProgs[0].id);
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

  const loadBeneficiariosSector = async (progId?: number) => {
    const id = progId || selectedProg?.id;
    if (!id) return;
    setLoadingBeneficiarios(true);
    try {
      const res = await fetch(`${BACKEND_URL}/programaciones/${id}/beneficiarios`);
      if (res.ok) {
        const json = await res.json();
        const lista = json.data || json.beneficiarios || (Array.isArray(json) ? json : []);
        if (Array.isArray(lista) && lista.length > 0) {
          const normalizados = lista.map((b: any) => ({
            ...b,
            id: b.id,
            dni: b.dni,
            nombres: b.nombres || b.nombres_apellidos || 'Sin nombre',
            nombres_apellidos: b.nombres_apellidos || b.nombres || 'Sin nombre',
            sector: b.sector_aahh || b.sector || 'Sector Moyobamba',
            sector_aahh: b.sector_aahh || b.sector || 'Sector Moyobamba',
            direccion: b.calle_direccion || b.direccion || '-',
            vale_codigo: b.vale_codigo || null,
            cuota_semanal: Number(b.cuota_semanal || 700),
            litros_esta_semana: Number(b.litros_entregados_semana || b.litros_esta_semana || 0),
            atendido_esta_semana: !!b.ha_recibido_esta_semana || !!b.atendido_esta_semana || (Number(b.saldo_semanal) <= 0 && Number(b.litros_entregados_semana) > 0)
          }));
          setBeneficiariosSector(normalizados);
          return;
        }
      }
      // Fallback local SQLite si no hay conexión a internet
      const db = await getDatabase();
      const rows: any = await db.getAllAsync(`
        SELECT b.id, b.dni, b.num_miembros,
               COALESCE(b.nombres_apellidos, '') as nombres,
               COALESCE(b.nombres_apellidos, '') as nombres_apellidos,
               COALESCE(b.sector_aahh, b.sector, 'Sector') as sector,
               COALESCE(b.calle_direccion, b.direccion, '-') as direccion,
               b.telefono,
               v.codigo_unico as vale_codigo,
               COALESCE(v.litros_sugeridos, COALESCE(b.num_miembros, 1) * 350, 700) as cuota_semanal,
               COALESCE((
                 SELECT SUM(e.litros_entregados)
                 FROM entregas_agua e
                 WHERE e.beneficiario_id = b.id
                   AND date(e.fecha_hora) >= date('now', 'weekday 0', '-6 days')
               ), 0) as litros_esta_semana
        FROM beneficiarios b
        LEFT JOIN vales_consumo v ON v.beneficiario_id = b.id
        ORDER BY b.nombres_apellidos ASC
      `);
      setBeneficiariosSector(rows || []);
    } catch (err) {
      console.warn('Error cargando beneficiarios de sector:', err);
    } finally {
      setLoadingBeneficiarios(false);
    }
  };

  const seleccionarBeneficiarioFinal = async (result: any, paramCodigoVale?: string, qrLitros?: string) => {
    if (!result) return;
    setBeneficiario(result);
    setDni(result.dni || '');
    const codVale = paramCodigoVale || result.vale_codigo || null;
    setValeCodigo(codVale);

    const progId = selectedProg?.id || PROGRAMACION_ACTUAL_ID;

    // Consultar entregas previas para este beneficiario en esta programación
    let yaEntregado = 0;
    try {
      const db = await getDatabase();
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
    const hoyDia = getDiasCicloSemanal().find((d) => d.esHoy) || getDiasCicloSemanal()[0];
    setDiaSeleccionado(hoyDia);
    signatureRef.current?.clearSignature();

    setActiveTab('REPARTO');

    // Desplazar suavemente hacia el formulario de reparto
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 720, animated: true });
    }, 150);

    if (yaEntregado > 0) {
      Alert.alert(
        '⚠️ Entrega Parcial Previa Detectada',
        `Este beneficiario ya recibió ${yaEntregado} Lts de su cuota total de ${cuotaFamiliar} Lts.\n\nSaldo disponible a entregar: ${saldoResta} Lts.`
      );
    }
  };

  const handleSelectBeneficiarioFromList = (b: any) => {
    if (!b) return;
    seleccionarBeneficiarioFinal(b);
  };

  // --- ENTREGA COMPLETA EN DEPÓSITO ÚNICO POR SECTOR ---
  const getSectoresDisponiblesDeposito = (): string[] => {
    const fromProg = selectedProg?.zona
      ? String(selectedProg.zona)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [];
    if (fromProg.length > 0) return fromProg;
    return [
      'SOL DE INDAÑE',
      'SANTIAGO DE LOS 8 VALLES',
      'SAN BORJA',
      'LOS EUCALIPTOS',
      'LAS BRISAS DEL MAYO',
    ];
  };

  const getBeneficiariosPorSectorNombre = (secName: string) => {
    if (!secName || secName === 'TODOS') return beneficiariosSector;
    return beneficiariosSector.filter((b) =>
      String(b.sector || b.sector_aahh || '')
        .toLowerCase()
        .includes(secName.toLowerCase())
    );
  };

  const calcularEstimadoSemanalListaApp = (listaBenefs: any[]) => {
    const dotacionDia = Number(systemConfig?.dotacion_diaria_litros || 50);
    const diasSem = Number(systemConfig?.dias_entrega_semanal || 7);
    let cuotaSemanal = 0;
    let cuotaDiaria = 0;
    let entregadoSemana = 0;
    let habitantes = 0;

    for (const b of listaBenefs) {
      const miembros = Number(b.num_miembros || 1);
      habitantes += miembros;
      const cSem = Number(b.cuota_semanal || b.litros_sugeridos || miembros * dotacionDia * diasSem);
      cuotaSemanal += cSem;
      cuotaDiaria += miembros * dotacionDia;
      entregadoSemana += Number(b.litros_esta_semana || b.litros_entregados_semana || 0);
    }

    const restanteSemana = Math.max(0, Number((cuotaSemanal - entregadoSemana).toFixed(2)));
    return {
      cuotaSemanal: Number(cuotaSemanal.toFixed(2)),
      cuotaDiaria: Number(cuotaDiaria.toFixed(2)),
      entregadoSemana: Number(entregadoSemana.toFixed(2)),
      restanteSemana,
      habitantes,
    };
  };

  const handleChangeSectorDeposito = (secName: string) => {
    setSectorDeposito(secName);
    const lista = getBeneficiariosPorSectorNombre(secName);
    setSelectedBenefIdsDeposito(lista.map((b: any) => Number(b.id)));
    const calc = calcularEstimadoSemanalListaApp(lista);
    const sug = calc.restanteSemana > 0 ? calc.restanteSemana : calc.cuotaSemanal;
    if (sug > 0) setLitrosTotalesDeposito(String(sug));
  };

  const handleOpenDepositoModal = async (initialSec?: string) => {
    if (beneficiariosSector.length === 0 && selectedProg?.id) {
      await loadBeneficiariosSector(selectedProg.id);
    }
    const opciones = getSectoresDisponiblesDeposito();
    const targetSec =
      initialSec && initialSec !== 'TODOS'
        ? initialSec
        : sectorSeleccionado && sectorSeleccionado !== 'TODOS'
        ? sectorSeleccionado
        : opciones[0] || 'SOL DE INDAÑE';

    setSectorDeposito(targetSec);
    const lista = beneficiariosSector.filter((b) =>
      String(b.sector || b.sector_aahh || '')
        .toLowerCase()
        .includes(targetSec.toLowerCase())
    );
    // Marcar TODOS los beneficiarios del sector por defecto
    setSelectedBenefIdsDeposito(lista.map((b: any) => Number(b.id)));
    const calc = calcularEstimadoSemanalListaApp(lista);
    const sug = calc.restanteSemana > 0 ? calc.restanteSemana : calc.cuotaSemanal;
    setLitrosTotalesDeposito(String(sug || 15000));
    setFiltroBusquedaDeposito('');
    setFotoDepositoUri(null);
    setDepositoModalVisible(true);
  };

  const handleToggleBenefDeposito = (id: number) => {
    const numId = Number(id);
    setSelectedBenefIdsDeposito((prev) =>
      prev.includes(numId) ? prev.filter((item) => item !== numId) : [...prev, numId]
    );
  };

  const handleTakePhotoDeposito = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para fotografiar el depósito.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setFotoDepositoUri(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Error de cámara', err.message);
    }
  };

  const handleGuardarEntregaDepositoSector = async (forzarSegundoViaje = false) => {
    const litrosTot = parseFloat(litrosTotalesDeposito);
    if (isNaN(litrosTot) || litrosTot <= 0) {
      Alert.alert('Atención', 'Ingrese una cantidad válida de agua total entregada en el depósito (mayor a 0 litros).');
      return;
    }
    if (selectedBenefIdsDeposito.length === 0) {
      Alert.alert('Atención', 'Debe mantener seleccionado al menos 1 beneficiario del sector para dividir la entrega.');
      return;
    }

    const totalBenef = selectedBenefIdsDeposito.length;
    const litrosPorBenef = Number((litrosTot / totalBenef).toFixed(2));
    const listaSector = getBeneficiariosPorSectorNombre(sectorDeposito);
    const excluidosCount = Math.max(0, listaSector.length - totalBenef);
    const fechaIso = diaSeleccionado?.fechaIso || new Date().toISOString().slice(0, 10);

    // Validación anti-duplicado local en SQLite (mismo sector y misma fecha)
    if (!forzarSegundoViaje) {
      try {
        const db = await getDatabase();
        const existingLocal = await db.getAllAsync(
          `SELECT COUNT(e.id) as cnt, COALESCE(SUM(e.litros_entregados), 0) as sum_lts
           FROM entregas_agua e
           WHERE (e.fecha_asignada = ? OR substr(COALESCE(e.fecha_captura, e.fecha_hora, ''), 1, 10) = ?)
             AND (e.local_id LIKE 'dep-%' OR e.observaciones_entrega LIKE '%Depósito Único%')
             AND e.observaciones_entrega LIKE ?`,
          [fechaIso, fechaIso, `%${sectorDeposito}%`]
        ) as any[];
        if (existingLocal && existingLocal.length > 0 && Number(existingLocal[0].cnt) > 0) {
          Alert.alert(
            '⚠️ Entrega ya registrada hoy en este sector',
            `Ya registraste una entrega en depósito único hoy (${fechaIso}) para ${sectorDeposito} por ${Number(existingLocal[0].sum_lts).toLocaleString()} Lts.\n\n¿Se trata de un 2.º viaje de cisterna en el mismo día o deseas cancelar para no duplicar?`,
            [
              { text: 'No, Cancelar', style: 'cancel' },
              {
                text: 'Sí, es un 2.º Viaje',
                onPress: () => handleGuardarEntregaDepositoSector(true),
              },
            ]
          );
          return;
        }
      } catch (_) {}
    }

    Alert.alert(
      '🚰 Confirmar Entrega en Depósito Único',
      `Sector: ${sectorDeposito}\n` +
        `Día: ${diaSeleccionado?.fechaDisplay || 'Hoy'}\n` +
        `Agua total entregada: ${litrosTot.toLocaleString()} L\n` +
        `Beneficiarios incluidos: ${totalBenef} familias${excluidosCount > 0 ? ` (${excluidosCount} desmarcados para otro depósito)` : ' (Todos)'}\n\n` +
        `División automática:\n👉 ${litrosPorBenef.toLocaleString()} Litros por beneficiario`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Registrar Entrega',
          onPress: async () => {
            try {
              setSavingDeposito(true);
              const progId = selectedProg?.id || PROGRAMACION_ACTUAL_ID;
              const diaNombre = diaSeleccionado?.nombre || 'Hoy';
              const lat = location?.coords?.latitude || -6.034172;
              const lng = location?.coords?.longitude || -76.971391;
              const acc = location?.coords?.accuracy || 8;

              let syncedOnline = false;

              // 1. Intentar registrar en el backend en bloque
              try {
                const formData = new FormData();
                formData.append('sector', sectorDeposito);
                formData.append('programacion_id', String(progId));
                if (selectedCisternaId) formData.append('cisterna_id', String(selectedCisternaId));
                if (selectedConductorId) formData.append('conductor_id', String(selectedConductorId));
                formData.append('litros_totales_deposito', String(litrosTot));
                formData.append('beneficiario_ids', JSON.stringify(selectedBenefIdsDeposito));
                formData.append('fecha_entrega', fechaIso);
                formData.append('dia_entrega', diaNombre);
                formData.append('latitud', String(lat));
                formData.append('longitud', String(lng));
                formData.append('precision_gps', String(acc));
                formData.append('forzar_segundo_viaje', 'true');
                formData.append(
                  'observaciones',
                  `Entrega en Depósito Único Diario (${sectorDeposito}): ${litrosTot} L ÷ ${totalBenef} benef. = ${litrosPorBenef} L`
                );

                if (fotoDepositoUri && Platform.OS !== 'web') {
                  try {
                    const b64 = await FileSystem.readAsStringAsync(fotoDepositoUri, {
                      encoding: FileSystem.EncodingType.Base64,
                    });
                    if (b64) formData.append('fotoBase64', b64);
                  } catch (_) {}
                }

                const resp = await fetch(`${BACKEND_URL}/entregas/entrega-grupal-sector`, {
                  method: 'POST',
                  body: formData,
                  headers: { Accept: 'application/json' },
                });
                if (resp.ok) {
                  syncedOnline = true;
                }
              } catch (onlineErr) {
                console.log('Modo offline para entrega grupal en depósito:', onlineErr);
              }

              // 2. Guardar registros en SQLite local para trazabilidad offline/online
              const db = await getDatabase();
              const batchStamp = Date.now();
              let acum = 0;

              for (let i = 0; i < totalBenef; i++) {
                const benId = selectedBenefIdsDeposito[i];
                const litrosInd =
                  i === totalBenef - 1 ? Number((litrosTot - acum).toFixed(2)) : litrosPorBenef;
                acum += litrosInd;
                const localId = `dep-movil-${benId}-${batchStamp}-${i}`;
                const obs = `Entrega en Depósito Único Diario (${sectorDeposito}): ${litrosTot} L ÷ ${totalBenef} benef. = ${litrosInd} L`;

                await db.runAsync(
                  `INSERT INTO entregas_agua (
                    local_id, beneficiario_id, programacion_id, cisterna_id, conductor_id,
                    cuota_programada, litros_entregados, saldo_pendiente, estado_entrega,
                    observaciones_entrega, foto_local_uri, latitud, longitud, precision_gps,
                    fecha_captura, fecha_hora, dia_entrega, fecha_asignada, sincronizado, sync_status
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'COMPLETA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    localId,
                    benId,
                    progId,
                    selectedCisternaId || 1,
                    selectedConductorId || 1,
                    litrosInd,
                    litrosInd,
                    obs,
                    fotoDepositoUri || null,
                    lat,
                    lng,
                    acc,
                    `${fechaIso}T12:00:00.000Z`,
                    `${fechaIso}T12:00:00.000Z`,
                    diaNombre,
                    fechaIso,
                    syncedOnline ? 1 : 0,
                    syncedOnline ? 'SYNCED' : 'PENDING',
                  ]
                );
              }

              setDepositoModalVisible(false);
              await loadBeneficiariosSector(progId);
              await loadProgramaciones();

              Alert.alert(
                '✅ Entrega del Sector Registrada',
                `Se registró exitosamente la entrega en depósito único para ${totalBenef} beneficiarios de ${sectorDeposito}.\n\n` +
                  `• Volumen total: ${litrosTot.toLocaleString()} L\n` +
                  `• Asignado a cada beneficiario: ${litrosPorBenef.toLocaleString()} L\n` +
                  (excluidosCount > 0
                    ? `• ${excluidosCount} beneficiario(s) quedaron desmarcados para recibir en otro depósito.`
                    : '• Todos los beneficiarios del sector quedaron atendidos.')
              );
            } catch (err: any) {
              Alert.alert('Error', 'No se pudo registrar la entrega del depósito: ' + err.message);
            } finally {
              setSavingDeposito(false);
            }
          },
        },
      ]
    );
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
      let cList = await db.getAllAsync(
        `SELECT * FROM cisternas WHERE estado = 'OPERATIVO' OR estado = 'Activa' ORDER BY placa ASC`
      );
      let pList = await db.getAllAsync(
        `SELECT * FROM personal_operativo WHERE tipo_personal = 'CONDUCTOR' AND (estado = 'ACTIVO' OR estado = 'Activo') ORDER BY nombres ASC`
      );

      // Si no hay datos en SQLite local, intentar descargar desde el backend
      if (cList.length === 0 || pList.length === 0) {
        try {
          const cRes = await fetch(`${BACKEND_URL}/cisternas`);
          if (cRes.ok) {
            const dataC = await cRes.json();
            if (Array.isArray(dataC) && dataC.length > 0) {
              for (const c of dataC) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO cisternas (id, placa, marca_modelo, capacidad_m3, capacidad_litros, estado)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [c.id, c.placa, c.marca_modelo || 'Volvo FMX', c.capacidad_m3 || 19, c.capacidad_litros || 19000, c.estado || 'OPERATIVO']
                );
              }
              cList = await db.getAllAsync(`SELECT * FROM cisternas ORDER BY placa ASC`);
            }
          }
        } catch (_) {}

        try {
          const pRes = await fetch(`${BACKEND_URL}/personal?tipo=CONDUCTOR`);
          if (pRes.ok) {
            const dataP = await pRes.json();
            if (Array.isArray(dataP) && dataP.length > 0) {
              for (const p of dataP) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO personal_operativo (id, dni, nombres, apellidos, tipo_personal, licencia_conducir, estado)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [p.id, p.dni || '00000000', p.nombres, p.apellidos || '', 'CONDUCTOR', p.licencia_conducir || '', p.estado || 'ACTIVO']
                );
              }
              pList = await db.getAllAsync(`SELECT * FROM personal_operativo WHERE tipo_personal = 'CONDUCTOR' ORDER BY nombres ASC`);
            }
          }
        } catch (_) {}
      }

      // Si aún estuviesen vacíos (modo 100% offline sin sincronización previa), registrar valores oficiales de contingencia
      if (cList.length === 0) {
        const defaultCisterna = {
          id: 1,
          placa: selectedProg?.cisterna_placa || 'CAT-849',
          marca_modelo: 'Volvo FMX 440',
          capacidad_m3: selectedProg?.capacidad_m3 || 19,
          capacidad_litros: selectedProg?.capacidad_litros || 19000,
          estado: 'OPERATIVO',
        };
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO cisternas (id, placa, marca_modelo, capacidad_m3, capacidad_litros, estado)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [defaultCisterna.id, defaultCisterna.placa, defaultCisterna.marca_modelo, defaultCisterna.capacidad_m3, defaultCisterna.capacidad_litros, defaultCisterna.estado]
          );
        } catch (_) {}
        cList = [defaultCisterna];
      }

      if (pList.length === 0) {
        const defaultConductor = {
          id: 1,
          dni: '47891234',
          nombres: selectedProg?.conductor_nombre || user?.nombres || 'Carlos Mendoza',
          apellidos: user?.apellidos || 'Conductor',
          tipo_personal: 'CONDUCTOR',
          licencia_conducir: 'Q47891234',
          estado: 'ACTIVO',
        };
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO personal_operativo (id, dni, nombres, apellidos, tipo_personal, licencia_conducir, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [defaultConductor.id, defaultConductor.dni, defaultConductor.nombres, defaultConductor.apellidos, defaultConductor.tipo_personal, defaultConductor.licencia_conducir, defaultConductor.estado]
          );
        } catch (_) {}
        pList = [defaultConductor];
      }

      setCisternas(cList);
      if (cList.length > 0) {
        setSelectedCisternaId((cList[0] as any).id);
      }

      setConductores(pList);
      if (pList.length > 0) {
        setSelectedConductorId((pList[0] as any).id);
      }
    } catch (e) {
      console.error('Error loading cisternas/conductores:', e);
    }
  };

  const getSectoresCalidadOpciones = (): string[] => {
    const baseSectores = selectedProg?.zona
      ? String(selectedProg.zona)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [
          'SOL DE INDAÑE',
          'SANTIAGO DE LOS 8 VALLES',
          'SAN BORJA',
          'LOS EUCALIPTOS',
          'LAS BRISAS DEL MAYO',
        ];
    return ['Surtidor / Planta', ...baseSectores];
  };

  const handleOpenCalidadModal = () => {
    const sugerido =
      beneficiario?.sector ||
      (sectorSeleccionado && sectorSeleccionado !== 'TODOS' ? sectorSeleccionado : '') ||
      (etapaControl === 'CARGA' ? 'Surtidor / Planta' : 'SOL DE INDAÑE');
    if (!sectorCalidad || sectorCalidad === 'SOL DE INDAÑE' || sectorCalidad === 'Surtidor / Planta') {
      setSectorCalidad(sugerido);
    }
    setCalidadModalVisible(true);
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
    const sectorLimpio = (sectorCalidad || '').trim() || 'Moyobamba';
    const punto = etapaControl === 'CARGA' 
      ? (sectorLimpio.toLowerCase().includes('surtidor') || sectorLimpio.toLowerCase().includes('planta')
          ? `${sectorLimpio} EPS Moyobamba`
          : `Surtidor / Planta (${sectorLimpio})`)
      : (etapaControl === 'RUTA'
          ? `En Ruta - Sector: ${sectorLimpio}`
          : `Muestreo Adicional - Sector: ${sectorLimpio}`);
    const progId = selectedProg?.id || PROGRAMACION_ACTUAL_ID;

    try {
      const db = await getDatabase();
      let insertedLocalId: number | null = null;
      try {
        const insertRes = await db.runAsync(`
          INSERT INTO control_calidad (programacion_id, cisterna_id, conductor_id, cloro_residual_ppm, turbiedad_ntu, aspecto_organoleptico, conforme_sanitario, latitud, longitud, etapa_control, punto_muestreo, sector, fecha_hora, sincronizado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), 0)
        `, [
          progId,
          selectedCisternaId || 1,
          selectedConductorId || 1,
          c,
          t,
          aspectoCalidad,
          conforme ? 1 : 0,
          location?.coords?.latitude || null,
          location?.coords?.longitude || null,
          etapaControl,
          punto,
          sectorLimpio
        ]);
        insertedLocalId = insertRes.lastInsertRowId || null;
      } catch (localErr) {
        console.warn('Local sqlite save without new columns fallback:', localErr);
      }

      // If online, also send to backend and mark sincronizado = 1
      fetch(`${BACKEND_URL}/calidad/calidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programacion_id: progId,
          cisterna_id: selectedCisternaId || 1,
          conductor_nombre: user?.nombres || 'Operador Móvil',
          cloro_residual_ppm: c,
          turbiedad_ntu: t,
          aspecto_organoleptico: aspectoCalidad,
          etapa_control: etapaControl,
          punto_muestreo: punto,
          sector: sectorLimpio,
          latitud: location?.coords?.latitude || null,
          longitud: location?.coords?.longitude || null,
          registrado_por: user?.nombres || 'Operador Móvil',
        })
      }).then(async (resp) => {
        if (resp.ok && insertedLocalId) {
          await db.runAsync(`UPDATE control_calidad SET sincronizado = 1 WHERE id = ?`, [insertedLocalId]).catch(() => {});
        }
      }).catch(() => {});

      const etapaLabel = etapaControl === 'CARGA' 
        ? '1. Control al Cargar Cisterna (Surtidor)' 
        : (etapaControl === 'RUTA' ? '2. Control en Ruta (Entrega)' : 'Control Adicional');

      Alert.alert(
        conforme ? '✓ Calidad Conforme' : '⚠ Alerta Sanitaria',
        conforme 
          ? `[${etapaLabel}]\n\nParámetros registrados según TDR:\n• Sector / Lugar: ${sectorLimpio}\n• Cloro Residual: ${c.toFixed(2)} ppm (${cloroMin}-${cloroMax})\n• Turbiedad: ${t.toFixed(2)} NTU (≤${turbMax})\n• Punto: ${punto}\n\nAgua 100% Apta para Reparto.`
          : `¡ATENCIÓN! Parámetros fuera de norma sanitaria:\n• Sector / Lugar: ${sectorLimpio}\n• Cloro: ${c.toFixed(2)} ppm (Norma: ${cloroMin}-${cloroMax})\n• Turbiedad: ${t.toFixed(2)} NTU (Límite: ≤${turbMax})\nNotifique de inmediato a planta.`
      );
      setCalidadModalVisible(false);
    } catch (e) {
      console.error('Error guardando control calidad:', e);
      Alert.alert('Error', 'No se pudo guardar el registro de calidad');
    }
  };

  const handleSearchDNI = async (searchQuery?: string) => {
    const raw = (searchQuery !== undefined ? searchQuery : dni).trim();
    if (!raw) {
      Alert.alert('Atención', 'Ingrese DNI, Código de Vale o Nombre del beneficiario para buscar.');
      return;
    }

    // Extraer partes si es QR estructurado: "VALE-20260826-001|47891234|200L"
    let codigoVale = '';
    let queryTerm = raw;
    let qrLitros = '';

    if (raw.includes('|')) {
      const parts = raw.split('|');
      codigoVale = parts[0].trim();
      if (parts.length > 1) queryTerm = parts[1].trim();
      if (parts.length > 2) qrLitros = parts[2].replace(/[^\d.]/g, '');
    } else if (raw.toUpperCase().startsWith('VALE-')) {
      codigoVale = raw;
    }

    setSearching(true);
    try {
      const db = await getDatabase();
      let matches: any[] = [];
      const termClean = queryTerm.trim();
      const termUpper = termClean.toUpperCase();
      const tokens = termClean.split(/\s+/).filter((t) => t.length > 0).map((t) => t.toUpperCase());

      // 1. Verificación en memoria contra beneficiarios del sector cargados
      if (beneficiariosSector && beneficiariosSector.length > 0) {
        const memMatches = beneficiariosSector.filter((b: any) => {
          const bDni = String(b.dni || '');
          const bName = String(b.nombres_apellidos || b.nombres || '').toUpperCase();
          const bVale = String(b.vale_codigo || '').toUpperCase();

          const dniMatch = bDni.includes(termClean);
          const valeMatch =
            bVale.includes(termUpper) ||
            (codigoVale && bVale.includes(codigoVale.toUpperCase()));
          const nameMatch =
            tokens.length > 0 && tokens.every((token) => bName.includes(token));

          return dniMatch || valeMatch || nameMatch;
        });
        if (memMatches.length > 0) {
          matches = memMatches;
        }
      }

      // 2. Búsqueda local en SQLite con tokens de nombre, DNI y código de vale
      if (matches.length === 0) {
        try {
          const likePattern = `%${termClean}%`;
          let whereSql = `(b.dni LIKE ? OR UPPER(COALESCE(b.nombres_apellidos, b.nombres, '')) LIKE ? OR (v.codigo_unico IS NOT NULL AND UPPER(v.codigo_unico) LIKE ?))`;
          let sqlParams: any[] = [likePattern, `%${termUpper}%`, `%${termUpper}%`];

          if (tokens.length > 1) {
            const tokenClauses = tokens
              .map(() => `UPPER(COALESCE(b.nombres_apellidos, b.nombres, '')) LIKE ?`)
              .join(' AND ');
            whereSql = `(${whereSql} OR (${tokenClauses}))`;
            sqlParams = [...sqlParams, ...tokens.map((t) => `%${t}%`)];
          }

          const sql = `
            SELECT b.*, 
                   COALESCE(b.nombres_apellidos, b.nombres, '') as nombres,
                   COALESCE(b.nombres_apellidos, b.nombres, '') as nombres_apellidos,
                   COALESCE(b.sector_aahh, b.sector, 'Sector') as sector,
                   COALESCE(b.calle_direccion, b.direccion, '-') as direccion,
                   v.codigo_unico as vale_codigo, 
                   COALESCE(v.litros_sugeridos, 700) as vale_litros 
            FROM beneficiarios b 
            LEFT JOIN vales_consumo v ON v.beneficiario_id = b.id 
            WHERE ${whereSql}
            LIMIT 30
          `;
          const localRows: any = await db.getAllAsync(sql, sqlParams);
          if (localRows && localRows.length > 0) {
            matches = localRows;
          }
        } catch (dbErr) {
          console.warn('Error en consulta local SQLite:', dbErr);
        }
      }

      // 3. Búsqueda en API Backend online (multi-coincidencias)
      try {
        const endpoint = `${BACKEND_URL}/beneficiarios/buscar/${encodeURIComponent(queryTerm)}?multi=true`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const onlineData = await res.json();
          if (onlineData) {
            const apiList =
              onlineData.data ||
              onlineData.coincidencias ||
              (Array.isArray(onlineData) ? onlineData : onlineData.id ? [onlineData] : []);
            if (Array.isArray(apiList) && apiList.length > 0) {
              const seenIds = new Set<string>();
              const merged: any[] = [];
              for (const item of [...apiList, ...matches]) {
                const uniqueKey = String(item.id || item.dni);
                if (!seenIds.has(uniqueKey)) {
                  seenIds.add(uniqueKey);
                  merged.push(item);
                }
              }
              matches = merged;
            } else if (onlineData.id) {
              if (!matches.some((m) => m.id === onlineData.id)) {
                matches.unshift(onlineData);
              }
            }
          }
        }
      } catch (apiErr) {
        console.log('Online search skipped or failed:', apiErr);
      }

      if (matches.length === 0) {
        Alert.alert(
          'No encontrado',
          `No se encontró ningún beneficiario con "${raw}".\n\nPuede buscar por:\n• Número de DNI (8 dígitos)\n• Código de Vale (ej. VALE-ANUAL...)\n• Nombres o Apellidos del titular`
        );
      } else if (matches.length === 1) {
        // Coincidencia única: seleccionar de inmediato
        const b = matches[0];
        seleccionarBeneficiarioFinal(b, codigoVale || b.vale_codigo, qrLitros);
      } else {
        // Múltiples coincidencias (búsqueda por nombre o apellido común): abrir selector
        setCoincidenciasResultados(matches);
        setCoincidenciasModalVisible(true);
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
    const hoyDia = getDiasCicloSemanal().find((d) => d.esHoy) || getDiasCicloSemanal()[0];
    setDiaSeleccionado(hoyDia);
    signatureRef.current?.clearSignature();
  };

  // --- SAVE DELIVERY ---
  const handleSignatureOK = async (signatureBase64: string) => {
    if (!beneficiario) return;

    // FOTOGRAFÍA OPCIONAL (Requerimiento operativo: la foto es opcional, no obligatoria)

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

    const infoDia = diaSeleccionado?.esHoy
      ? `[Jornada: ${diaSeleccionado.nombre} (${diaSeleccionado.fechaCorta}) - Hoy]`
      : `[Jornada Asignada: ${diaSeleccionado.nombre} (${diaSeleccionado.fechaCorta}) - Regularización/Día diferido]`;

    const obsEntrega = `${infoDia} ${
      saldoRestante > 0
        ? `Entrega parcial de ${litrosNum} Lts. Quedan pendientes ${saldoRestante} Lts por entregar.`
        : `Entrega completa del 100% (${cuota} Lts).`
    }`;

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
          dia_entrega,
          fecha_asignada,
          sincronizado,
          sync_status,
          retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', 0)`,
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
          diaSeleccionado?.nombre || 'Hoy',
          diaSeleccionado?.fechaIso || nowIso.split('T')[0],
        ]
      );

      const diaMsg = diaSeleccionado?.esHoy
        ? `Jornada: Hoy (${diaSeleccionado.nombre})`
        : `Jornada Asignada: ${diaSeleccionado.nombre} (${diaSeleccionado.fechaCorta}) [Regularización]`;

      if (saldoRestante > 0) {
        Alert.alert(
          '🟡 Entrega Parcial Registrada',
          `Se guardaron ${litrosNum} Lts para ${beneficiario.nombres_apellidos}.\n${diaMsg}\n\n⚠️ QUEDAN PENDIENTES: ${saldoRestante} Lts por entregar en esta programación.\nEstado: Guardado en Celular (Offline-First)`
        );
      } else {
        Alert.alert(
          '✅ Entrega Completa Registrada',
          `Se completó el abastecimiento de ${litrosNum} Lts para ${beneficiario.nombres_apellidos}.\n${diaMsg}\nCuota 100% cubierta.\nEstado: Guardado en Celular (Offline-First)`
        );
      }

      // Attempt background sync and refresh local metrics
      syncData().catch(() => {});
      loadBeneficiariosSector(progId).catch(() => {});
      loadProgramaciones().catch(() => {});

      // Reset Form
      handleCancelBeneficiary();
    } catch (error: any) {
      Alert.alert('Error al guardar', error.message);
    }
  };

  const handleSaveDelivery = () => {
    // 1. Fotografía es OPCIONAL (Requerimiento operativo: la foto no es obligatoria para registrar)
    // 2. Firma digital es OPCIONAL: solo si se habilitó el recuadro y se firmó en pantalla se lee
    if (showSignaturePad && hasSignature) {
      signatureRef.current?.readSignature();
    } else {
      handleSignatureOK('');
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await syncData(true);
    setIsSyncing(false);
    if (selectedProg?.id) {
      loadBeneficiariosSector(selectedProg.id).catch(() => {});
      loadProgramaciones().catch(() => {});
    }
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
        contentContainerStyle={[styles.container, { paddingBottom: 220 + keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        showsVerticalScrollIndicator={false}
      >
      {/* HEADER CURVO MODERNO (ORGANIC CURVED HEADER) */}
      <View style={styles.headerModernCurve}>
        {/* ROW 1: IDENTIFICACIÓN DEL USUARIO Y BOTÓN SALIR */}
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
                  {user?.nombres ? `${user.nombres.split(' ')[0]} ${user.apellidos ? user.apellidos.split(' ')[0] : ''}` : 'Operador'}
                </Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>AguaTrack</Text>
                </View>
              </View>
              <Text style={styles.roleSubtext} numberOfLines={1}>
                {user?.rol === 'GESTOR_ENTREGA' || user?.rol === 'AYUDANTE'
                  ? '🤝 Gestor de Entrega'
                  : (user?.rol === 'CONDUCTOR' ? '🚚 Conductor de Cisterna' : (user?.rol === 'SUPERVISOR' ? '📋 Supervisor EPS' : (user?.rol || 'Personal EPS')))} • EPS Moyobamba
              </Text>
            </View>
          </View>

          {onLogout && (
            <TouchableOpacity style={styles.logoutBtnPill} onPress={handleLogoutConfirm} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={16} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>

        {/* ROW 2: BARRA DE ACCIONES (ACTUALIZAR Y SINCRONIZAR) */}
        <View style={styles.headerActionsBar}>
          <TouchableOpacity
            style={styles.updateBtnPill}
            onPress={() => setUpdateModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={13} color="#059669" />
            <Text style={styles.updateBtnPillText}>Actualizar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.syncBtnPill} onPress={handleManualSync} disabled={isSyncing} activeOpacity={0.85}>
            {isSyncing ? (
              <ActivityIndicator color="#0284c7" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="sync-outline" size={13} color="#0284c7" />
                <Text style={styles.syncBtnPillText}>Sincronizar</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* TOP TAB NAVIGATOR (SEGMENTED PILL BAR FLOTANTE - RESPONSIVE SIN COLISIONES) */}
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
              style={[styles.topTabBtnPill, activeTab === 'PROGRAMACION' && styles.topTabBtnPillActive]}
              onPress={() => setActiveTab('PROGRAMACION')}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Ionicons name="calendar-outline" size={13} color={activeTab === 'PROGRAMACION' ? '#ffffff' : '#64748b'} />
                <Text style={[styles.topTabText, activeTab === 'PROGRAMACION' && styles.topTabTextActive]} numberOfLines={1}>
                  Ruta
                </Text>
              </View>
              {activeTab === 'PROGRAMACION' && <View style={styles.activeDotIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.topTabBtnPill, activeTab === 'BENEFICIARIOS' && styles.topTabBtnPillActive]}
              onPress={() => {
                setActiveTab('BENEFICIARIOS');
                if (selectedProg?.id && beneficiariosSector.length === 0) {
                  loadBeneficiariosSector(selectedProg.id);
                }
              }}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Ionicons name="people-outline" size={13} color={activeTab === 'BENEFICIARIOS' ? '#ffffff' : '#64748b'} />
                <Text style={[styles.topTabText, activeTab === 'BENEFICIARIOS' && styles.topTabTextActive]} numberOfLines={1}>
                  Padrón ({beneficiariosSector.length})
                </Text>
              </View>
              {activeTab === 'BENEFICIARIOS' && <View style={styles.activeDotIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.topTabBtnPill, activeTab === 'REPARTO' && styles.topTabBtnPillActive]}
              onPress={() => setActiveTab('REPARTO')}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Ionicons name="water-outline" size={13} color={activeTab === 'REPARTO' ? '#ffffff' : '#64748b'} />
                <Text style={[styles.topTabText, activeTab === 'REPARTO' && styles.topTabTextActive]} numberOfLines={1}>
                  Entrega
                </Text>
              </View>
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

          {/* CARD 3: SECTORES ASIGNADOS Y PADRÓN DE BENEFICIARIOS */}
          <View
            style={styles.sectoresCard}
            onLayout={(e) => setProgBenefCardY(e.nativeEvent.layout.y)}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                <Ionicons name="location-outline" size={17} color="#0284c7" />
                <Text style={[styles.sectoresCardTitle, { flexShrink: 1 }]} numberOfLines={1}>
                  Sectores Asignados
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setActiveTab('BENEFICIARIOS');
                  if (selectedProg?.id && beneficiariosSector.length === 0) {
                    loadBeneficiariosSector(selectedProg.id);
                  }
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#f0f9ff',
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#bae6fd'
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284c7' }}>Padrón Completo</Text>
                <Ionicons name="arrow-forward" size={12} color="#0284c7" />
              </TouchableOpacity>
            </View>

            {/* SECTORES FILTER PILLS */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              <TouchableOpacity
                style={[
                  styles.sectorFilterPill,
                  sectorSeleccionado === 'TODOS' && styles.sectorFilterPillActive
                ]}
                onPress={() => setSectorSeleccionado('TODOS')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="grid-outline"
                  size={12}
                  color={sectorSeleccionado === 'TODOS' ? '#ffffff' : '#0369a1'}
                />
                <Text
                  style={[
                    styles.sectorFilterPillText,
                    sectorSeleccionado === 'TODOS' && styles.sectorFilterPillTextActive
                  ]}
                >
                  Todos ({beneficiariosSector.length})
                </Text>
              </TouchableOpacity>

              {(selectedProg?.zona ? selectedProg.zona.split(',') : []).map((secRaw: string, idx: number) => {
                const secName = secRaw.trim();
                if (!secName) return null;
                const isSelected = sectorSeleccionado.toLowerCase() === secName.toLowerCase();
                const count = beneficiariosSector.filter((b) =>
                  (b.sector || b.sector_aahh || '').toLowerCase().includes(secName.toLowerCase())
                ).length;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.sectorFilterPill,
                      isSelected && styles.sectorFilterPillActive
                    ]}
                    onPress={() => setSectorSeleccionado(isSelected ? 'TODOS' : secName)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={12}
                      color={isSelected ? '#ffffff' : '#0369a1'}
                    />
                    <Text
                      style={[
                        styles.sectorFilterPillText,
                        isSelected && styles.sectorFilterPillTextActive
                      ]}
                    >
                      {secName} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.sectoresMetaRow}>
              <View style={[styles.metaItem, { flex: 1.4, paddingRight: 8 }]}>
                <Text style={styles.metaLabel}>DÍAS DE ATENCIÓN</Text>
                <Text style={styles.metaValue} numberOfLines={2}>
                  {formatDiasSemana(selectedProg?.dias_semana)}
                </Text>
              </View>
              <View style={[styles.metaItem, { flex: 1 }]}>
                <Text style={styles.metaLabel}>VIAJES PROGRAMADOS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Ionicons name="flag-outline" size={13} color="#0284c7" />
                  <Text style={styles.metaValue}>{selectedProg?.viajes_estimados || 2} Viajes</Text>
                </View>
              </View>
            </View>

            {/* SECCIÓN DESPLEGADA DE BENEFICIARIOS DEL SECTOR */}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              {/* TARJETA DE AVANCE SEMANAL DEL SECTOR */}
              {(() => {
                const secFiltrados = beneficiariosSector.filter((b) => {
                  if (sectorSeleccionado === 'TODOS') return true;
                  return (b.sector || b.sector_aahh || '').toLowerCase().includes(sectorSeleccionado.toLowerCase());
                });
                const totalFamilias = secFiltrados.length;
                const atendidas = secFiltrados.filter(b => b.atendido_esta_semana).length;
                const pendientes = totalFamilias - atendidas;
                const cuotaTotalLts = secFiltrados.reduce((acc, b) => acc + Number(b.cuota_semanal || 700), 0);
                const entregadosLts = secFiltrados.reduce((acc, b) => acc + Number(b.litros_esta_semana || 0), 0);
                const saldoLts = Math.max(0, cuotaTotalLts - entregadosLts);
                const pct = cuotaTotalLts > 0 ? Math.min(100, Math.round((entregadosLts / cuotaTotalLts) * 100)) : (totalFamilias > 0 ? Math.round((atendidas / totalFamilias) * 100) : 0);

                return (
                  <View style={styles.sectorWeeklyProgressBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="stats-chart" size={13} color="#0369a1" />
                        <Text style={styles.sectorWeeklyTitle}>
                          Avance Semanal: <Text style={{ fontWeight: '800', color: '#0369a1' }}>{sectorSeleccionado === 'TODOS' ? 'General' : sectorSeleccionado}</Text>
                        </Text>
                      </View>
                      <View style={[styles.sectorWeeklyBadge, { backgroundColor: pct >= 100 ? '#dcfce7' : (pct > 0 ? '#e0f2fe' : '#f1f5f9') }]}>
                        <Text style={[styles.sectorWeeklyBadgeText, { color: pct >= 100 ? '#15803d' : (pct > 0 ? '#0369a1' : '#64748b') }]}>
                          {pct}% Cubierto
                        </Text>
                      </View>
                    </View>

                    {/* BARRA DE PROGRESO VISUAL DEL SECTOR */}
                    <View style={styles.sectorProgressBarBg}>
                      <View style={[styles.sectorProgressBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: pct >= 100 ? '#10b981' : '#0284c7' }]} />
                    </View>

                    {/* 3 INDICADORES CLAVE DEL SECTOR */}
                    <View style={styles.sectorMetricsRow}>
                      <View style={styles.sectorMetricBox}>
                        <Text style={styles.sectorMetricLabel}>ENTREGADO SEMANA</Text>
                        <Text style={[styles.sectorMetricVal, { color: '#0284c7' }]}>{entregadosLts.toLocaleString()} L</Text>
                        <Text style={styles.sectorMetricSub}>Meta: {cuotaTotalLts.toLocaleString()} L</Text>
                      </View>
                      <View style={styles.sectorMetricBox}>
                        <Text style={styles.sectorMetricLabel}>FAMILIAS ATENDIDAS</Text>
                        <Text style={[styles.sectorMetricVal, { color: '#15803d' }]}>{atendidas}/{totalFamilias}</Text>
                        <Text style={styles.sectorMetricSub}>{pendientes} pendientes</Text>
                      </View>
                      <View style={styles.sectorMetricBox}>
                        <Text style={styles.sectorMetricLabel}>SALDO POR REPARTIR</Text>
                        <Text style={[styles.sectorMetricVal, { color: pendientes > 0 ? '#b45309' : '#15803d' }]}>{saldoLts.toLocaleString()} L</Text>
                        <Text style={styles.sectorMetricSub}>{(saldoLts / 1000).toFixed(1)} m³ resta</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* BOTÓN ENTREGA COMPLETA EN DEPÓSITO ÚNICO DEL SECTOR */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: '#0284c7',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  marginBottom: 10,
                }}
                onPress={() => handleOpenDepositoModal(sectorSeleccionado)}
                activeOpacity={0.85}
              >
                <Ionicons name="water" size={16} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>
                  🚰 Entrega en Depósito Único por Sector
                </Text>
              </TouchableOpacity>

              {/* BÚSQUEDA RÁPIDA EN EL SECTOR */}
              <View style={styles.sectorMiniSearchWrapper}>
                <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.sectorMiniSearchInput}
                  placeholder="Buscar beneficiario (Nombre, DNI, Vale)..."
                  placeholderTextColor="#94a3b8"
                  value={filtroBeneficiario}
                  onChangeText={setFiltroBeneficiario}
                  autoCapitalize="none"
                  onFocus={() => {
                    focusScrollTo('MAIN', progBenefCardY > 0 ? progBenefCardY + 210 : 560);
                  }}
                />
                {filtroBeneficiario ? (
                  <TouchableOpacity onPress={() => setFiltroBeneficiario('')} style={{ padding: 2 }}>
                    <Ionicons name="close-circle" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* LISTA RÁPIDA DE BENEFICIARIOS (HASTA 6 CON BOTÓN DE EXPANDIR) */}
              {loadingBeneficiarios ? (
                <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#0284c7" />
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Cargando beneficiarios...</Text>
                </View>
              ) : (() => {
                const query = filtroBeneficiario.trim().toLowerCase();
                const secFiltrados = beneficiariosSector.filter((b) => {
                  const matchSec = sectorSeleccionado === 'TODOS' || 
                    (b.sector || b.sector_aahh || '').toLowerCase().includes(sectorSeleccionado.toLowerCase());
                  if (!matchSec) return false;
                  if (!query) return true;
                  return (b.nombres && b.nombres.toLowerCase().includes(query)) ||
                    (b.nombres_apellidos && b.nombres_apellidos.toLowerCase().includes(query)) ||
                    (b.dni && b.dni.includes(query)) ||
                    (b.vale_codigo && b.vale_codigo.toLowerCase().includes(query)) ||
                    (b.sector && b.sector.toLowerCase().includes(query));
                });

                if (secFiltrados.length === 0) {
                  return (
                    <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                        {beneficiariosSector.length === 0
                          ? 'Cargando padrón del sector...'
                          : `Sin beneficiarios encontrados con el filtro aplicado.`}
                      </Text>
                    </View>
                  );
                }

                // Mostrar primeros 6 beneficiarios para mantener la vista fluida
                const previewList = secFiltrados.slice(0, 6);

                return (
                  <View style={{ gap: 8, marginTop: 6 }}>
                    {previewList.map((b) => {
                      const atendido = !!b.atendido_esta_semana;
                      const cuota = Number(b.cuota_semanal || 700);
                      const entregado = Number(b.litros_esta_semana || 0);
                      const saldo = Math.max(0, cuota - entregado);
                      const pctBenef = cuota > 0 ? Math.min(100, Math.round((entregado / cuota) * 100)) : 0;

                      return (
                        <View key={b.id || b.dni} style={styles.progBenefItemRow}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.progBenefItemName} numberOfLines={1}>
                                {b.nombres || b.nombres_apellidos}
                              </Text>
                              {b.vale_codigo ? (
                                <View style={styles.miniValeBadge}>
                                  <Text style={styles.miniValeBadgeText}>{b.vale_codigo}</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.progBenefItemSub}>
                              DNI: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{b.dni}</Text> • 📍 {b.sector || 'Sector'}
                            </Text>

                            {/* AVANCE SEMANAL INDIVIDUAL DEL BENEFICIARIO */}
                            <View style={{ marginTop: 5 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748b' }}>
                                  Avance Semanal: <Text style={{ color: atendido ? '#15803d' : '#0284c7' }}>{entregado} / {cuota} L</Text>
                                </Text>
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: atendido ? '#15803d' : (entregado > 0 ? '#b45309' : '#64748b') }}>
                                  {pctBenef}%
                                </Text>
                              </View>
                              <View style={styles.benefMiniProgressBarBg}>
                                <View style={[styles.benefMiniProgressBarFill, { width: `${Math.max(pctBenef, 3)}%`, backgroundColor: atendido ? '#10b981' : (entregado > 0 ? '#f59e0b' : '#cbd5e1') }]} />
                              </View>
                            </View>
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <View style={atendido ? styles.benefStatusOk : styles.benefStatusPending}>
                              <Ionicons
                                name={atendido ? "checkmark-circle" : "time-outline"}
                                size={10}
                                color={atendido ? "#059669" : "#b45309"}
                                style={{ marginRight: 2 }}
                              />
                              <Text style={atendido ? styles.benefStatusOkText : styles.benefStatusPendingText}>
                                {atendido ? 'Atendido' : 'Pendiente'}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.progBenefDeliverBtn}
                              onPress={() => seleccionarBeneficiarioFinal(b)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="water" size={11} color="#ffffff" />
                              <Text style={styles.progBenefDeliverBtnText}>Entregar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}

                    {secFiltrados.length > 6 && (
                      <TouchableOpacity
                        style={styles.progBenefViewAllBtn}
                        onPress={() => {
                          setActiveTab('BENEFICIARIOS');
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.progBenefViewAllBtnText}>
                          Ver los {secFiltrados.length} beneficiarios en padrón completo
                        </Text>
                        <Ionicons name="arrow-forward" size={13} color="#0284c7" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
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
                onPress={handleOpenCalidadModal}
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
      ) : activeTab === 'BENEFICIARIOS' ? (
        /* ─── VISTA 2: LISTA DE BENEFICIARIOS POR SECTOR PROGRAMADO ───── */
        <View style={styles.beneficiariosViewContainer}>
          {/* HEADER RESUMEN SECTOR */}
          <View style={styles.benefHeaderCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="people" size={18} color="#0284c7" />
                <Text style={styles.benefHeaderTitle}>Beneficiarios Asignados</Text>
              </View>
              <TouchableOpacity
                onPress={() => loadBeneficiariosSector(selectedProg?.id)}
                style={styles.benefRefreshBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={14} color="#0284c7" />
                <Text style={styles.benefRefreshText}>Actualizar</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.benefSubtitle}>
              Sectores: <Text style={{ fontWeight: '700', color: '#0369a1' }}>{selectedProg?.zona || 'Todos los sectores'}</Text>
            </Text>

            {/* SECTORES FILTER PILLS */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              <TouchableOpacity
                style={[
                  styles.sectorFilterPill,
                  sectorSeleccionado === 'TODOS' && styles.sectorFilterPillActive
                ]}
                onPress={() => setSectorSeleccionado('TODOS')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="grid-outline"
                  size={12}
                  color={sectorSeleccionado === 'TODOS' ? '#ffffff' : '#0369a1'}
                />
                <Text
                  style={[
                    styles.sectorFilterPillText,
                    sectorSeleccionado === 'TODOS' && styles.sectorFilterPillTextActive
                  ]}
                >
                  Todos ({beneficiariosSector.length})
                </Text>
              </TouchableOpacity>

              {(selectedProg?.zona ? selectedProg.zona.split(',') : []).map((secRaw: string, idx: number) => {
                const secName = secRaw.trim();
                if (!secName) return null;
                const isSelected = sectorSeleccionado.toLowerCase() === secName.toLowerCase();
                const count = beneficiariosSector.filter((b) =>
                  (b.sector || b.sector_aahh || '').toLowerCase().includes(secName.toLowerCase())
                ).length;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.sectorFilterPill,
                      isSelected && styles.sectorFilterPillActive
                    ]}
                    onPress={() => setSectorSeleccionado(isSelected ? 'TODOS' : secName)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={12}
                      color={isSelected ? '#ffffff' : '#0369a1'}
                    />
                    <Text
                      style={[
                        styles.sectorFilterPillText,
                        isSelected && styles.sectorFilterPillTextActive
                      ]}
                    >
                      {secName} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* BARRA DE BÚSQUEDA RÁPIDA */}
            <View style={styles.benefSearchWrapper}>
              <Ionicons name="search-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.benefSearchInput}
                placeholder="Buscar por Nombre, DNI o Vale..."
                placeholderTextColor="#94a3b8"
                value={filtroBeneficiario}
                onChangeText={(t) => {
                  setFiltroBeneficiario(t);
                  setBeneficiariosPage(1);
                }}
                autoCapitalize="none"
                onFocus={() => {
                  focusScrollTo('MAIN', 210);
                }}
              />
              {filtroBeneficiario ? (
                <TouchableOpacity onPress={() => { setFiltroBeneficiario(''); setBeneficiariosPage(1); }} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* FILTRO CHIPS: TODOS / PENDIENTES / ATENDIDOS */}
            <View style={styles.benefFilterRow}>
              {(['TODOS', 'PENDIENTES', 'ATENDIDOS'] as const).map((tipo) => {
                const isActive = filtroEstadoBenef === tipo;
                return (
                  <TouchableOpacity
                    key={tipo}
                    style={[styles.benefFilterChip, isActive && styles.benefFilterChipActive]}
                    onPress={() => {
                      setFiltroEstadoBenef(tipo);
                      setBeneficiariosPage(1);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.benefFilterChipText, isActive && styles.benefFilterChipTextActive]}>
                      {tipo === 'TODOS' ? `Todos (${beneficiariosSector.length})` : 
                       tipo === 'PENDIENTES' ? `Pendientes (${beneficiariosSector.filter(b => !b.atendido_esta_semana).length})` :
                       `Atendidos (${beneficiariosSector.filter(b => b.atendido_esta_semana).length})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* BOTÓN ENTREGA COMPLETA EN DEPÓSITO ÚNICO DEL SECTOR */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#0284c7',
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                marginTop: 10,
              }}
              onPress={() => handleOpenDepositoModal(sectorSeleccionado)}
              activeOpacity={0.85}
            >
              <Ionicons name="water" size={16} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '800' }}>
                🚰 Entrega Completa en Depósito Único ({sectorSeleccionado === 'TODOS' ? 'Por Sector' : sectorSeleccionado})
              </Text>
            </TouchableOpacity>
          </View>

          {/* TARJETA DE AVANCE SEMANAL DEL SECTOR */}
          {(() => {
            const secFiltrados = beneficiariosSector.filter((b) => {
              if (sectorSeleccionado === 'TODOS') return true;
              return (b.sector || b.sector_aahh || '').toLowerCase().includes(sectorSeleccionado.toLowerCase());
            });
            const totalFamilias = secFiltrados.length;
            const atendidas = secFiltrados.filter(b => b.atendido_esta_semana).length;
            const pendientes = totalFamilias - atendidas;
            const cuotaTotalLts = secFiltrados.reduce((acc, b) => acc + Number(b.cuota_semanal || 700), 0);
            const entregadosLts = secFiltrados.reduce((acc, b) => acc + Number(b.litros_esta_semana || 0), 0);
            const saldoLts = Math.max(0, cuotaTotalLts - entregadosLts);
            const pct = cuotaTotalLts > 0 ? Math.min(100, Math.round((entregadosLts / cuotaTotalLts) * 100)) : (totalFamilias > 0 ? Math.round((atendidas / totalFamilias) * 100) : 0);

            return (
              <View style={[styles.sectorWeeklyProgressBox, { marginHorizontal: 0, marginBottom: 10 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="stats-chart" size={13} color="#0369a1" />
                    <Text style={styles.sectorWeeklyTitle}>
                      Avance Semanal: <Text style={{ fontWeight: '800', color: '#0369a1' }}>{sectorSeleccionado === 'TODOS' ? 'General' : sectorSeleccionado}</Text>
                    </Text>
                  </View>
                  <View style={[styles.sectorWeeklyBadge, { backgroundColor: pct >= 100 ? '#dcfce7' : (pct > 0 ? '#e0f2fe' : '#f1f5f9') }]}>
                    <Text style={[styles.sectorWeeklyBadgeText, { color: pct >= 100 ? '#15803d' : (pct > 0 ? '#0369a1' : '#64748b') }]}>
                      {pct}% Cubierto
                    </Text>
                  </View>
                </View>

                {/* BARRA DE PROGRESO VISUAL DEL SECTOR */}
                <View style={styles.sectorProgressBarBg}>
                  <View style={[styles.sectorProgressBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: pct >= 100 ? '#10b981' : '#0284c7' }]} />
                </View>

                {/* 3 INDICADORES CLAVE DEL SECTOR */}
                <View style={styles.sectorMetricsRow}>
                  <View style={styles.sectorMetricBox}>
                    <Text style={styles.sectorMetricLabel}>ENTREGADO SEMANA</Text>
                    <Text style={[styles.sectorMetricVal, { color: '#0284c7' }]}>{entregadosLts.toLocaleString()} L</Text>
                    <Text style={styles.sectorMetricSub}>Meta: {cuotaTotalLts.toLocaleString()} L</Text>
                  </View>
                  <View style={styles.sectorMetricBox}>
                    <Text style={styles.sectorMetricLabel}>FAMILIAS ATENDIDAS</Text>
                    <Text style={[styles.sectorMetricVal, { color: '#15803d' }]}>{atendidas}/{totalFamilias}</Text>
                    <Text style={styles.sectorMetricSub}>{pendientes} pendientes</Text>
                  </View>
                  <View style={styles.sectorMetricBox}>
                    <Text style={styles.sectorMetricLabel}>SALDO POR REPARTIR</Text>
                    <Text style={[styles.sectorMetricVal, { color: pendientes > 0 ? '#b45309' : '#15803d' }]}>{saldoLts.toLocaleString()} L</Text>
                    <Text style={styles.sectorMetricSub}>{(saldoLts / 1000).toFixed(1)} m³ resta</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* LISTADO DE TARJETAS */}
          {loadingBeneficiarios ? (
            <View style={{ padding: 30, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13, fontWeight: '600' }}>
                Cargando padrón del sector...
              </Text>
            </View>
          ) : (() => {
            const query = filtroBeneficiario.trim().toLowerCase();
            const filtrados = beneficiariosSector.filter((b) => {
              const matchSec = sectorSeleccionado === 'TODOS' || 
                (b.sector || b.sector_aahh || '').toLowerCase().includes(sectorSeleccionado.toLowerCase());
              if (!matchSec) return false;

              const matchText = !query || 
                (b.nombres && b.nombres.toLowerCase().includes(query)) ||
                (b.nombres_apellidos && b.nombres_apellidos.toLowerCase().includes(query)) ||
                (b.dni && b.dni.includes(query)) ||
                (b.vale_codigo && b.vale_codigo.toLowerCase().includes(query)) ||
                (b.sector && b.sector.toLowerCase().includes(query)) ||
                (b.direccion && b.direccion.toLowerCase().includes(query));
              if (!matchText) return false;
              if (filtroEstadoBenef === 'PENDIENTES') return !b.atendido_esta_semana;
              if (filtroEstadoBenef === 'ATENDIDOS') return !!b.atendido_esta_semana;
              return true;
            });

            if (filtrados.length === 0) {
              return (
                <View style={styles.benefEmptyCard}>
                  <Ionicons name="search-outline" size={32} color="#94a3b8" />
                  <Text style={styles.benefEmptyTitle}>Sin coincidencias</Text>
                  <Text style={styles.benefEmptySubtitle}>
                    {beneficiariosSector.length === 0 
                      ? 'No hay beneficiarios asignados a este sector o aún no se han sincronizado.' 
                      : 'No se encontraron beneficiarios con el filtro aplicado.'}
                  </Text>
                </View>
              );
            }

            const totalBeneficiarios = filtrados.length;
            const totalPages = Math.max(1, Math.ceil(totalBeneficiarios / BENEFICIARIOS_PAGE_SIZE));
            const currentPage = Math.min(beneficiariosPage, totalPages);
            const startIdx = (currentPage - 1) * BENEFICIARIOS_PAGE_SIZE;
            const paginatedList = filtrados.slice(startIdx, startIdx + BENEFICIARIOS_PAGE_SIZE);

            return (
              <View style={{ gap: 10, marginTop: 4 }}>
                {paginatedList.map((b) => {
                  const atendido = !!b.atendido_esta_semana;
                  const cuota = Number(b.cuota_semanal || 700);
                  const entregado = Number(b.litros_esta_semana || 0);
                  const pendiente = Math.max(0, cuota - entregado);
                  const pctBenef = cuota > 0 ? Math.min(100, Math.round((entregado / cuota) * 100)) : 0;

                  return (
                    <View key={b.id || b.dni} style={styles.benefCardItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.benefNombreText} numberOfLines={1}>
                              {b.nombres}
                            </Text>
                            {b.vale_codigo ? (
                              <View style={styles.miniValeBadge}>
                                <Text style={styles.miniValeBadgeText}>{b.vale_codigo}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.benefDniText}>
                            DNI: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{b.dni}</Text> • 📍 {b.sector || 'Sector'}
                          </Text>
                          {b.direccion ? (
                            <Text style={styles.benefDirText} numberOfLines={1}>
                              🏠 {b.direccion}
                            </Text>
                          ) : null}
                        </View>

                        <View style={atendido ? styles.benefStatusOk : styles.benefStatusPending}>
                          <Ionicons 
                            name={atendido ? "checkmark-circle" : "time-outline"} 
                            size={11} 
                            color={atendido ? "#059669" : "#b45309"} 
                            style={{ marginRight: 3 }} 
                          />
                          <Text style={atendido ? styles.benefStatusOkText : styles.benefStatusPendingText}>
                            {atendido ? 'Atendido' : 'Pendiente'}
                          </Text>
                        </View>
                      </View>

                      {/* BARRA Y PORCENTAJE DE AVANCE SEMANAL INDIVIDUAL */}
                      <View style={{ marginTop: 8, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b' }}>
                            Avance Semanal: <Text style={{ color: atendido ? '#15803d' : '#0284c7' }}>{entregado} de {cuota} Litros</Text>
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: atendido ? '#15803d' : (entregado > 0 ? '#b45309' : '#64748b') }}>
                            {pctBenef}% Cubierto
                          </Text>
                        </View>
                        <View style={styles.benefMiniProgressBarBg}>
                          <View style={[styles.benefMiniProgressBarFill, { width: `${Math.max(pctBenef, 3)}%`, backgroundColor: atendido ? '#10b981' : (entregado > 0 ? '#f59e0b' : '#cbd5e1') }]} />
                        </View>
                      </View>

                      {/* BARRA DE CUOTA Y METROS CÚBICOS */}
                      <View style={styles.benefMetricsRow}>
                        <View style={styles.benefMetricMiniBox}>
                          <Text style={styles.benefMetricMiniLabel}>CUOTA SEMANAL</Text>
                          <Text style={styles.benefMetricMiniVal}>{cuota.toLocaleString()} L</Text>
                        </View>
                        <View style={styles.benefMetricMiniBox}>
                          <Text style={styles.benefMetricMiniLabel}>ENTREGADO ESTA SEM.</Text>
                          <Text style={[styles.benefMetricMiniVal, { color: atendido ? '#059669' : '#0284c7' }]}>
                            {entregado.toLocaleString()} L
                          </Text>
                        </View>
                        <View style={styles.benefMetricMiniBox}>
                          <Text style={styles.benefMetricMiniLabel}>SALDO RESTANTE</Text>
                          <Text style={[styles.benefMetricMiniVal, { color: pendiente > 0 ? '#b45309' : '#059669' }]}>
                            {pendiente.toLocaleString()} L
                          </Text>
                        </View>
                      </View>

                      {/* BOTÓN DE SELECCIÓN DIRECTA */}
                      <TouchableOpacity
                        style={styles.benefSelectBtn}
                        onPress={() => handleSelectBeneficiarioFromList(b)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="water-outline" size={15} color="#ffffff" />
                        <Text style={styles.benefSelectBtnText}>
                          {atendido ? 'Registrar Otra Entrega' : 'Seleccionar para Entrega'}
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* CONTROLES DE PAGINACIÓN */}
                {totalPages > 1 && (
                  <View style={styles.paginationCard}>
                    <View style={styles.paginationInfoRow}>
                      <Text style={styles.paginationInfoText}>
                        Mostrando {startIdx + 1}-{Math.min(startIdx + BENEFICIARIOS_PAGE_SIZE, totalBeneficiarios)} de {totalBeneficiarios} beneficiarios
                      </Text>
                      <View style={styles.pageBadgePill}>
                        <Text style={styles.pageBadgePillText}>
                          Pág. {currentPage} de {totalPages}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.paginationBtnsRow}>
                      <TouchableOpacity
                        style={[styles.pageNavBtn, currentPage <= 1 && styles.pageNavBtnDisabled]}
                        disabled={currentPage <= 1}
                        onPress={() => {
                          setBeneficiariosPage((prev) => Math.max(1, prev - 1));
                          scrollViewRef.current?.scrollTo({ y: 320, animated: true });
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="chevron-back" size={16} color={currentPage <= 1 ? '#94a3b8' : '#0284c7'} />
                        <Text style={[styles.pageNavBtnText, currentPage <= 1 && styles.pageNavBtnTextDisabled]}>
                          Anterior
                        </Text>
                      </TouchableOpacity>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.pageNumbersScroll}
                      >
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
                          const isCurrent = pNum === currentPage;
                          return (
                            <TouchableOpacity
                              key={`p-${pNum}`}
                              style={[styles.pageNumberChip, isCurrent && styles.pageNumberChipActive]}
                              onPress={() => {
                                setBeneficiariosPage(pNum);
                                scrollViewRef.current?.scrollTo({ y: 320, animated: true });
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.pageNumberChipText, isCurrent && styles.pageNumberChipTextActive]}>
                                {pNum}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      <TouchableOpacity
                        style={[styles.pageNavBtn, currentPage >= totalPages && styles.pageNavBtnDisabled]}
                        disabled={currentPage >= totalPages}
                        onPress={() => {
                          setBeneficiariosPage((prev) => Math.min(totalPages, prev + 1));
                          scrollViewRef.current?.scrollTo({ y: 320, animated: true });
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pageNavBtnText, currentPage >= totalPages && styles.pageNavBtnTextDisabled]}>
                          Siguiente
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={currentPage >= totalPages ? '#94a3b8' : '#0284c7'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })()}
        </View>
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
              {cisternas && cisternas.length > 0 ? (
                cisternas.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chipBtn, (selectedCisternaId === c.id || cisternas.length === 1) && styles.chipBtnActive]}
                    onPress={() => setSelectedCisternaId(c.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, (selectedCisternaId === c.id || cisternas.length === 1) && styles.chipTextActive]}>
                      {c.placa} ({c.capacidad_m3 || 19}m³)
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.chipBtn, styles.chipBtnActive]}>
                  <Text style={[styles.chipText, styles.chipTextActive]}>
                    {selectedProg?.cisterna_placa || 'CAT-849 (19m³)'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* CONDUCTOR SELECTOR */}
          <View style={{ flex: 1 }}>
            <Text style={styles.flotaLabel}>Conductor:</Text>
            <View style={styles.selectorContainer}>
              {conductores && conductores.length > 0 ? (
                conductores.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chipBtn, (selectedConductorId === p.id || conductores.length === 1) && styles.chipBtnActive]}
                    onPress={() => setSelectedConductorId(p.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, (selectedConductorId === p.id || conductores.length === 1) && styles.chipTextActive]}>
                      {p.nombres ? `${p.nombres.split(' ')[0]} ${p.apellidos ? p.apellidos.split(' ')[0] : ''}` : 'Conductor'}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.chipBtn, styles.chipBtnActive]}>
                  <Text style={[styles.chipText, styles.chipTextActive]}>
                    {selectedProg?.conductor_nombre || user?.nombres || 'Carlos Mendoza'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* LOGISTICS TRIP INFO BAR */}
        <View style={styles.logisticsStrip}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <Ionicons name="water-outline" size={14} color="#0369a1" />
            <Text style={{ fontSize: 11.5, color: '#0369a1', fontWeight: '800' }}>
              Capacidad: {activeCisterna?.capacidad_m3 || selectedProg?.capacidad_m3 || 19} m³ • {Number(activeCisterna?.capacidad_litros || selectedProg?.capacidad_litros || 19000).toLocaleString()} Lts
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
            onPress={handleOpenCalidadModal}
            activeOpacity={0.85}
          >
            <Ionicons name="flask-outline" size={12} color="#ffffff" />
            <Text style={styles.calidadActionBtnText}>Medir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTÓN ACCESO RÁPIDO A ENTREGA EN DEPÓSITO ÚNICO POR SECTOR */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0284c7',
          borderRadius: 16,
          paddingVertical: 11,
          paddingHorizontal: 14,
          marginBottom: 12,
          shadowColor: '#0284c7',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 3,
        }}
        onPress={() => handleOpenDepositoModal(sectorSeleccionado)}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="water" size={18} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>
              🚰 ENTREGA EN DEPÓSITO ÚNICO (SECTOR)
            </Text>
            <Text style={{ color: '#e0f2fe', fontSize: 10.5, fontWeight: '600' }}>
              Marca todos los beneficiarios del sector y divide el agua entregada hoy
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#ffffff" />
      </TouchableOpacity>

      {/* SECCIÓN INTUITIVA DE IDENTIFICACIÓN: ESCÁNER QR Y BÚSQUEDA MANUAL DNI */}
      <View
        style={styles.identificacionCard}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          if (y > 0) setSearchCardY(y);
        }}
      >
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
          <Text style={styles.orText}>O BÚSQUEDA POR DNI, CÓDIGO O NOMBRE</Text>
          <View style={styles.orLine} />
        </View>

        {/* BARRA DE BÚSQUEDA MANUAL (DNI, CÓDIGO O NOMBRE) */}
        <View style={styles.searchManualRow}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search-outline" size={16} color="#0284c7" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.input}
              placeholder="DNI, Código de vale o Nombre..."
              placeholderTextColor="#94a3b8"
              value={dni}
              onChangeText={setDni}
              keyboardType="default"
              autoCapitalize="words"
              maxLength={60}
              onFocus={() => {
                // Posicionar el campo arriba del teclado dinámicamente en cualquier teléfono
                const targetY = searchCardY > 0 ? Math.max(0, searchCardY + 60) : 780;
                focusScrollTo('MAIN', targetY);
              }}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                handleSearchDNI();
              }}
            />
            {dni ? (
              <TouchableOpacity
                onPress={() => {
                  setDni('');
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => {
              Keyboard.dismiss();
              handleSearchDNI();
            }}
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

        {/* BOTÓN DIRECTO PARA VER BENEFICIARIOS PROGRAMADOS */}
        <TouchableOpacity
          style={styles.verBeneficiariosBtn}
          onPress={() => {
            setActiveTab('BENEFICIARIOS');
            if (selectedProg?.id && beneficiariosSector.length === 0) {
              loadBeneficiariosSector(selectedProg.id);
            }
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="people-outline" size={16} color="#0284c7" />
          <Text style={styles.verBeneficiariosBtnText}>
            Ver lista de beneficiarios del sector ({beneficiariosSector.length} empadronados)
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#0284c7" />
        </TouchableOpacity>
      </View>

      {/* BENEFICIARY CARD */}
      {beneficiario && (
        <View
          style={styles.card}
          onLayout={(e) => setBeneficiaryCardY(e.nativeEvent.layout.y)}
        >
          {/* TOP CARD HEADER WITH BADGES & BOTÓN SELECTOR DE DÍA (UBICACIÓN CÍRCULO VERDE) */}
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

            {/* ZONA DERECHA: BOTÓN DÍA DE ENTREGA (CÍRCULO VERDE) + BOTÓN CERRAR */}
            <View style={styles.cardHeaderRightActions}>
              <TouchableOpacity
                style={[
                  styles.badgeDiaEntrega,
                  !diaSeleccionado?.esHoy && styles.badgeDiaEntregaDiferido,
                ]}
                onPress={() => setDiaPickerModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="calendar"
                  size={12}
                  color={diaSeleccionado?.esHoy ? '#0284c7' : '#d97706'}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.badgeDiaEntregaText,
                    !diaSeleccionado?.esHoy && styles.badgeDiaEntregaDiferidoText,
                  ]}
                  numberOfLines={1}
                >
                  {diaSeleccionado?.nombre} {diaSeleccionado?.esHoy ? '(Hoy)' : `(${diaSeleccionado?.fechaCorta})`}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={diaSeleccionado?.esHoy ? '#0284c7' : '#d97706'}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeCardBtn} onPress={handleCancelBeneficiary} activeOpacity={0.7}>
                <Ionicons name="close" size={16} color="#dc2626" />
              </TouchableOpacity>
            </View>
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

          {/* SELECTOR INTERACTIVO DE LOS 7 DÍAS DEL CICLO SEMANAL */}
          <View style={styles.diaSelectorBox}>
            <View style={styles.diaSelectorHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="calendar-outline" size={14} color="#0284c7" />
                <Text style={styles.diaSelectorTitle}>Día de Entrega / Jornada Asignada</Text>
              </View>
              <View style={[styles.diaStatusPill, !diaSeleccionado?.esHoy && styles.diaStatusPillDiferido]}>
                <Ionicons
                  name={diaSeleccionado?.esHoy ? "checkmark-circle" : "time-outline"}
                  size={11}
                  color={diaSeleccionado?.esHoy ? "#15803d" : "#b45309"}
                />
                <Text style={[styles.diaStatusText, !diaSeleccionado?.esHoy && styles.diaStatusTextDiferido]}>
                  {diaSeleccionado?.esHoy ? 'Hoy (Día Actual)' : 'Día Reprogramado'}
                </Text>
              </View>
            </View>

            {/* CARRUSEL DE LOS 7 DÍAS DE LA SEMANA */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diasScrollRow}>
              {diasSemana.map((d: any) => {
                const isSelected = diaSeleccionado?.id === d.id;
                return (
                  <TouchableOpacity
                    key={`dia-pill-${d.id}`}
                    style={[
                      styles.diaPillBtn,
                      isSelected && styles.diaPillBtnActive,
                      d.esHoy && !isSelected && styles.diaPillBtnHoy,
                    ]}
                    onPress={() => setDiaSeleccionado(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.diaPillCodigo, isSelected && styles.diaPillCodigoActive]}>
                      {d.codigo}
                    </Text>
                    <Text style={[styles.diaPillFecha, isSelected && styles.diaPillFechaActive]}>
                      {d.diaNum}
                    </Text>
                    {d.esHoy ? (
                      <View style={[styles.diaPillHoyBadge, isSelected && styles.diaPillHoyBadgeActive]}>
                        <Text style={[styles.diaPillHoyText, isSelected && styles.diaPillHoyTextActive]}>HOY</Text>
                      </View>
                    ) : (
                      <Text style={[styles.diaPillMes, isSelected && styles.diaPillMesActive]}>
                        {d.fechaCorta.split(' ')[1]}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* AVISO DE REGULARIZACIÓN SI SE ELIGE OTRO DÍA (EJ. DOMINGO ENTREGANDO LO DEL MIÉRCOLES) */}
            {!diaSeleccionado?.esHoy ? (
              <View style={styles.diaDiferidoAlert}>
                <Ionicons name="information-circle" size={17} color="#b45309" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.diaDiferidoAlertTitle}>
                    Asignando entrega al día {diaSeleccionado?.nombre} ({diaSeleccionado?.fechaCorta})
                  </Text>
                  <Text style={styles.diaDiferidoAlertSub}>
                    Se guardará como regularización de ración pendiente de esa jornada.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* ACCESOS RÁPIDOS DE SUGERENCIA DE VOLUMEN SEGÚN DÍA */}
            <View style={styles.quickLitrosRow}>
              <TouchableOpacity
                style={styles.quickLitroBtn}
                onPress={() => {
                  const diaria = (beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE;
                  setLitrosEntregar(String(diaria));
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="water" size={12} color="#0284c7" />
                <Text style={styles.quickLitroBtnText}>
                  Ración 1 Día ({(beneficiario.num_miembros || 1) * DOTACION_POR_HABITANTE} L)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickLitroBtn, { borderColor: '#bae6fd', backgroundColor: '#e0f2fe' }]}
                onPress={() => {
                  setLitrosEntregar(String(saldoPendiente > 0 ? saldoPendiente : cuotaTotal));
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={12} color="#0369a1" />
                <Text style={[styles.quickLitroBtnText, { color: '#0369a1' }]}>
                  Saldo Semanal ({saldoPendiente > 0 ? saldoPendiente : cuotaTotal} L)
                </Text>
              </TouchableOpacity>
            </View>
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, marginRight: 6 }}>
                    <Ionicons name="water-outline" size={15} color="#0369a1" />
                    <Text style={[styles.waterCalcTitle, { flexShrink: 1 }]} numberOfLines={1}>
                      Dotación Familiar Semanal
                    </Text>
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
                      onFocus={() => {
                        const targetY = beneficiaryCardY > 0 ? beneficiaryCardY + 280 : 940;
                        focusScrollTo('MAIN', targetY);
                      }}
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

          {/* PHOTO EVIDENCE SECTION (100% OPCIONAL) */}
          <View style={styles.photoSection}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="camera-outline" size={16} color="#0f172a" />
                <Text style={styles.label}>Fotografía de Evidencia (Opcional)</Text>
              </View>
              {photoUri ? (
                <View style={styles.statusPillOk}>
                  <Ionicons name="checkmark-circle" size={11} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.statusPillOkText}>Capturada</Text>
                </View>
              ) : (
                <View style={[styles.statusPillPending, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}>
                  <Ionicons name="camera-outline" size={11} color="#64748b" style={{ marginRight: 3 }} />
                  <Text style={[styles.statusPillPendingText, { color: '#64748b' }]}>Opcional</Text>
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
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="camera-reverse-outline" size={12} color="#334155" />
                        <Text style={styles.retakeBtnText}>Cambiar</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retakeBtn, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}
                      onPress={() => {
                        setPhotoUri(null);
                        setPhotoTimestamp('');
                        setPhotoGpsCoords(null);
                        setTempPhotoUri(null);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="trash-outline" size={12} color="#dc2626" />
                        <Text style={[styles.retakeBtnText, { color: '#dc2626' }]}>Quitar</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addSignatureBtn} onPress={handleTakePhoto} activeOpacity={0.85}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Ionicons name="camera-outline" size={18} color="#0284c7" />
                  <Text style={styles.addSignatureBtnText}>📸 Tomar Fotografía (Opcional)</Text>
                </View>
                <Text style={styles.addSignatureBtnSubtext}>
                  Opcional: Si desea adjuntar evidencia visual del punto de entrega
                </Text>
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

      {/* WATER QUALITY TEST MODAL (MODERNO, ESPACIOSO Y ERGONÓMICO CON SCROLL Y SELECTOR DE SECTOR) */}
      <Modal
        visible={calidadModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalidadModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.modalOverlay,
            keyboardHeight > 0 && {
              justifyContent: 'flex-start',
              paddingTop: Platform.OS === 'ios' ? 42 : 16,
              paddingBottom: Math.min(keyboardHeight * 0.65, 220),
            },
          ]}
        >
          <View style={[styles.modalCardCalidad, { maxHeight: keyboardHeight > 0 ? '96%' : '90%' }]}>
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

            <ScrollView
              ref={calidadScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: keyboardHeight > 0 ? keyboardHeight * 0.75 + 48 : 6,
              }}
            >
              {/* SECCIÓN 1: ETAPA DEL CONTROL SANITARIO (FILAS DE SELECCIÓN ERGONÓMICAS) */}
              <Text style={styles.modalSectionLabel}>ETAPA DEL CONTROL SANITARIO:</Text>
              
              <View style={styles.etapaOptionsContainer}>
                {/* ETAPA 1: AL CARGAR */}
                <TouchableOpacity
                  style={[styles.etapaRowCard, etapaControl === 'CARGA' && styles.etapaRowCardActive]}
                  onPress={() => {
                    setEtapaControl('CARGA');
                    setSectorCalidad('Surtidor / Planta');
                  }}
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
                  onPress={() => {
                    setEtapaControl('RUTA');
                    if (sectorCalidad === 'Surtidor / Planta') {
                      const defSec = beneficiario?.sector || (sectorSeleccionado !== 'TODOS' ? sectorSeleccionado : 'SOL DE INDAÑE');
                      setSectorCalidad(defSec);
                    }
                  }}
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
                  onPress={() => {
                    setEtapaControl('ADICIONAL');
                    if (sectorCalidad === 'Surtidor / Planta') {
                      const defSec = beneficiario?.sector || (sectorSeleccionado !== 'TODOS' ? sectorSeleccionado : 'SOL DE INDAÑE');
                      setSectorCalidad(defSec);
                    }
                  }}
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

              {/* SECCIÓN 1.5: SECTOR / LUGAR DONDE SE REALIZA EL CONTROL */}
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.paramInputLabel}>SECTOR / LUGAR DEL CONTROL SANITARIO</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 6, paddingBottom: 6 }}
                >
                  {getSectoresCalidadOpciones().map((secOption, idx) => {
                    const isSelected = sectorCalidad.toUpperCase() === secOption.toUpperCase();
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setSectorCalidad(secOption)}
                        activeOpacity={0.8}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: isSelected ? '#0284c7' : '#cbd5e1',
                          backgroundColor: isSelected ? '#e0f2fe' : '#f8fafc',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name={secOption.includes('Surtidor') ? 'business-outline' : 'location-outline'}
                          size={12}
                          color={isSelected ? '#0369a1' : '#64748b'}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: isSelected ? '800' : '600',
                            color: isSelected ? '#0369a1' : '#475569',
                          }}
                        >
                          {secOption}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.paramInputWrapper}>
                  <Ionicons name="location-outline" size={16} color="#0284c7" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.paramInputText, { flex: 1, textAlign: 'left', fontSize: 13 }]}
                    value={sectorCalidad}
                    onChangeText={setSectorCalidad}
                    placeholder="Seleccione o escriba el sector / punto de muestreo..."
                    placeholderTextColor="#94a3b8"
                    onFocus={() => focusScrollTo('CALIDAD', 180)}
                  />
                </View>
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
                      onFocus={() => focusScrollTo('CALIDAD', 280)}
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
                      onFocus={() => focusScrollTo('CALIDAD', 280)}
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
                    onFocus={() => focusScrollTo('CALIDAD', 380)}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL ENTREGA COMPLETA EN DEPÓSITO ÚNICO POR SECTOR */}
      <Modal
        visible={depositoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !savingDeposito && setDepositoModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.modalOverlay,
            keyboardHeight > 0 && {
              justifyContent: 'flex-start',
              paddingTop: Platform.OS === 'ios' ? 40 : 14,
              paddingBottom: Math.min(keyboardHeight * 0.65, 220),
            },
          ]}
        >
          <View
            style={[
              styles.modalCardCalidad,
              {
                maxWidth: 420,
                maxHeight: keyboardHeight > 0 ? '96%' : '92%',
                paddingHorizontal: 16,
                paddingVertical: 16,
              },
            ]}
          >
            {/* HEADER */}
            <View style={styles.modalCalidadHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={[styles.modalFlaskCircle, { backgroundColor: '#e0f2fe' }]}>
                  <Ionicons name="water" size={20} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalCalidadTitle}>Entrega en Depósito Único</Text>
                  <Text style={styles.modalCalidadSubtitle}>
                    Divide el agua del día entre los beneficiarios marcados del sector
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => !savingDeposito && setDepositoModalVisible(false)}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {(() => {
              const listaDelSector = getBeneficiariosPorSectorNombre(sectorDeposito);
              const filtradosModal = listaDelSector.filter((b: any) => {
                if (!filtroBusquedaDeposito.trim()) return true;
                const q = filtroBusquedaDeposito.toLowerCase().trim();
                return (
                  String(b.nombres_apellidos || b.nombres || '').toLowerCase().includes(q) ||
                  String(b.dni || '').includes(q)
                );
              });
              const litrosNum = parseFloat(litrosTotalesDeposito) || 0;
              const marcadosCount = selectedBenefIdsDeposito.length;
              const desmarcadosCount = Math.max(0, listaDelSector.length - marcadosCount);
              const litrosPorBenef = marcadosCount > 0 ? Number((litrosNum / marcadosCount).toFixed(2)) : 0;

              const listaMarcados = listaDelSector.filter((b: any) =>
                selectedBenefIdsDeposito.includes(Number(b.id))
              );
              const {
                cuotaSemanal: cuotaSemanalSector,
                cuotaDiaria: cuotaDiariaSector,
                entregadoSemana: entregadoSemanaSector,
                restanteSemana: restanteAntesDeHoySector,
                habitantes: habitantesSector,
              } = calcularEstimadoSemanalListaApp(listaMarcados);

              const acumuladoConHoySector = Number((entregadoSemanaSector + litrosNum).toFixed(2));
              const restanteDespuesDeHoySector = Math.max(
                0,
                Number((cuotaSemanalSector - acumuladoConHoySector).toFixed(2))
              );
              const pctAvanceSem =
                cuotaSemanalSector > 0
                  ? Math.min(100, Number(((acumuladoConHoySector / cuotaSemanalSector) * 100).toFixed(1)))
                  : 0;

              return (
                <ScrollView
                  ref={depositoScrollRef}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    paddingBottom: keyboardHeight > 0 ? keyboardHeight * 0.75 + 60 : 14,
                  }}
                >
                  {/* 1. SELECCIÓN DE SECTOR */}
                  <Text style={styles.paramInputLabel}>1. SELECCIONE EL SECTOR DEL DEPÓSITO:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
                  >
                    {getSectoresDisponiblesDeposito().map((secName, idx) => {
                      const active = sectorDeposito.toLowerCase() === secName.toLowerCase();
                      const countSec = getBeneficiariosPorSectorNombre(secName).length;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => handleChangeSectorDeposito(secName)}
                          style={{
                            paddingHorizontal: 11,
                            paddingVertical: 7,
                            borderRadius: 14,
                            borderWidth: 1.5,
                            borderColor: active ? '#0284c7' : '#cbd5e1',
                            backgroundColor: active ? '#0284c7' : '#f8fafc',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Ionicons
                            name="location-outline"
                            size={12}
                            color={active ? '#ffffff' : '#0369a1'}
                          />
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '800',
                              color: active ? '#ffffff' : '#334155',
                            }}
                          >
                            {secName} ({countSec})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* CONTROL SEMANAL DEL SECTOR (META ESTIMADA VS. ENTREGAS DIARIAS Y RESTANTE) */}
                  <View
                    style={{
                      backgroundColor: '#eff6ff',
                      borderWidth: 1.5,
                      borderColor: '#93c5fd',
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '900', color: '#1e3a8a' }}>
                        📅 CONTROL SEMANAL ({marcadosCount} fam. • {habitantesSector} hab.)
                      </Text>
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: pctAvanceSem >= 100 ? '#15803d' : '#1d4ed8' }}>
                        {pctAvanceSem}% sem.
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                      <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#bfdbfe' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748b' }}>ESTIMADO SEM.</Text>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#1e40af' }}>
                          {cuotaSemanalSector.toLocaleString()} L
                        </Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#cbd5e1' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748b' }}>YA ENTREGADO</Text>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#0f766e' }}>
                          {entregadoSemanaSector.toLocaleString()} L
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1.15,
                          backgroundColor: restanteDespuesDeHoySector > 0 ? '#fffbeb' : '#dcfce7',
                          borderRadius: 8,
                          padding: 6,
                          borderWidth: 1,
                          borderColor: restanteDespuesDeHoySector > 0 ? '#fcd34d' : '#86efac',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '800',
                            color: restanteDespuesDeHoySector > 0 ? '#b45309' : '#166534',
                          }}
                        >
                          RESTANTE SEM.
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '900',
                            color: restanteDespuesDeHoySector > 0 ? '#d97706' : '#15803d',
                          }}
                        >
                          {restanteDespuesDeHoySector.toLocaleString()} L
                        </Text>
                      </View>
                    </View>

                    <View style={{ height: 6, backgroundColor: '#dbeafe', borderRadius: 999, overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${pctAvanceSem}%`,
                          height: '100%',
                          backgroundColor: pctAvanceSem >= 100 ? '#16a34a' : '#0284c7',
                        }}
                      />
                    </View>
                  </View>

                  {/* 2. VOLUMEN TOTAL ENTREGADO EN EL DEPÓSITO HOY */}
                  <View style={{ marginTop: 4, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.paramInputLabel}>2. AGUA TOTAL ENTREGADA EN EL DEPÓSITO (LITROS):</Text>
                      <TouchableOpacity onPress={() => setDiaPickerModalVisible(true)}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#0284c7' }}>
                          📅 {diaSeleccionado?.fechaDisplay || 'Hoy'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.paramInputWrapper}>
                      <TextInput
                        style={[styles.paramInputText, { fontSize: 16 }]}
                        value={litrosTotalesDeposito}
                        onChangeText={setLitrosTotalesDeposito}
                        keyboardType="numeric"
                        placeholder={`Ej. ${restanteAntesDeHoySector || cuotaSemanalSector}`}
                        placeholderTextColor="#94a3b8"
                        onFocus={() => focusScrollTo('DEPOSITO', 150)}
                      />
                      <Text style={styles.paramInputUnit}>Litros</Text>
                    </View>

                    {/* BOTONES RÁPIDOS DE VOLUMEN (SEMANAL, RESTANTE, DIARIO Y CISTERNA) */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 6, marginTop: 6 }}
                    >
                      {[
                        ...(restanteAntesDeHoySector > 0 && restanteAntesDeHoySector !== cuotaSemanalSector
                          ? [{ label: `⏳ Restante Sem. (${restanteAntesDeHoySector} L)`, val: String(restanteAntesDeHoySector) }]
                          : []),
                        ...(cuotaSemanalSector > 0
                          ? [{ label: `📅 Estimado Sem. (${cuotaSemanalSector} L)`, val: String(cuotaSemanalSector) }]
                          : []),
                        ...(cuotaDiariaSector > 0
                          ? [{ label: `☀️ Cuota Día 1/7 (${cuotaDiariaSector} L)`, val: String(cuotaDiariaSector) }]
                          : []),
                        { label: '15,000 L (15m³)', val: '15000' },
                        { label: '19,000 L (19m³)', val: '19000' },
                      ].map((preset, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => setLitrosTotalesDeposito(preset.val)}
                          style={{
                            backgroundColor: litrosTotalesDeposito === preset.val ? '#e0f2fe' : '#f1f5f9',
                            borderWidth: 1,
                            borderColor: litrosTotalesDeposito === preset.val ? '#0284c7' : '#cbd5e1',
                            borderRadius: 10,
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                          }}
                        >
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#0369a1' }}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* RESUMEN AUTOMÁTICO DE LA DIVISIÓN */}
                  <View
                    style={{
                      backgroundColor: '#f0fdf4',
                      borderWidth: 1.5,
                      borderColor: '#86efac',
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534' }}>
                        ➗ DIVISIÓN ENTRE BENEFICIARIOS MARCADOS:
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#15803d' }}>
                        {litrosPorBenef.toLocaleString()} L / fam.
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
                      {litrosNum.toLocaleString()} L ÷ {marcadosCount} beneficiarios seleccionados ={' '}
                      <Text style={{ fontWeight: '800' }}>{litrosPorBenef.toLocaleString()} L c/u</Text>
                      {desmarcadosCount > 0 ? ` (${desmarcadosCount} excluidos para otro depósito)` : ''}
                    </Text>
                  </View>

                  {/* 3. LISTA DE BENEFICIARIOS CON OPCIÓN DE DESMARCAR CASOS ESPECIALES */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.paramInputLabel}>
                      3. BENEFICIARIOS ({marcadosCount}/{listaDelSector.length} MARCADOS):
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const allIds = listaDelSector.map((b: any) => Number(b.id));
                          setSelectedBenefIdsDeposito(allIds);
                          const calc = calcularEstimadoSemanalListaApp(listaDelSector);
                          const sug = calc.restanteSemana > 0 ? calc.restanteSemana : calc.cuotaSemanal;
                          if (sug > 0) setLitrosTotalesDeposito(String(sug));
                        }}
                        style={{
                          backgroundColor: '#e0f2fe',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0369a1' }}>☑ Todos</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSelectedBenefIdsDeposito([])}
                        style={{
                          backgroundColor: '#fee2e2',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#b91c1c' }}>☐ Ninguno</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* BUSCADOR PARA DESMARCAR CASO ESPECIAL */}
                  <View style={[styles.sectorMiniSearchWrapper, { marginBottom: 6 }]}>
                    <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.sectorMiniSearchInput}
                      placeholder="Buscar beneficiario para desmarcar caso especial..."
                      placeholderTextColor="#94a3b8"
                      value={filtroBusquedaDeposito}
                      onChangeText={setFiltroBusquedaDeposito}
                      onFocus={() => focusScrollTo('DEPOSITO', 340)}
                    />
                    {filtroBusquedaDeposito ? (
                      <TouchableOpacity onPress={() => setFiltroBusquedaDeposito('')}>
                        <Ionicons name="close-circle" size={14} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View
                    style={{
                      maxHeight: 195,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 12,
                      backgroundColor: '#f8fafc',
                      padding: 6,
                      marginBottom: 10,
                    }}
                  >
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filtradosModal.map((b: any) => {
                        const isChecked = selectedBenefIdsDeposito.includes(Number(b.id));
                        const miembrosFam = Number(b.num_miembros || 1);
                        const cuotaSemFam = Number(b.cuota_semanal || miembrosFam * 350);
                        const entregadoPrevFam = Number(b.litros_esta_semana || b.litros_entregados_semana || 0);
                        const restanteSemFam = Math.max(
                          0,
                          Number((cuotaSemFam - entregadoPrevFam - (isChecked ? litrosPorBenef : 0)).toFixed(2))
                        );
                        return (
                          <TouchableOpacity
                            key={b.id}
                            onPress={() => handleToggleBenefDeposito(Number(b.id))}
                            activeOpacity={0.75}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 7,
                              paddingHorizontal: 8,
                              marginBottom: 4,
                              borderRadius: 10,
                              backgroundColor: isChecked ? '#ffffff' : '#fef2f2',
                              borderWidth: 1,
                              borderColor: isChecked ? '#bae6fd' : '#fecaca',
                              gap: 8,
                            }}
                          >
                            <Ionicons
                              name={isChecked ? 'checkbox' : 'square-outline'}
                              size={20}
                              color={isChecked ? '#0284c7' : '#ef4444'}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '700',
                                  color: isChecked ? '#0f172a' : '#991b1b',
                                  textDecorationLine: isChecked ? 'none' : 'line-through',
                                }}
                                numberOfLines={1}
                              >
                                {b.nombres_apellidos || b.nombres}
                              </Text>
                              <Text style={{ fontSize: 10, color: '#64748b' }}>
                                DNI: {b.dni} • 👥 {miembrosFam} hab. (Sem: {cuotaSemFam}L)
                                {!isChecked ? ' • Otro depósito' : ` • Resta: ${restanteSemFam}L`}
                              </Text>
                            </View>
                            <View
                              style={{
                                backgroundColor: isChecked ? '#dcfce7' : '#fee2e2',
                                paddingHorizontal: 7,
                                paddingVertical: 3,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: isChecked ? '#15803d' : '#b91c1c',
                                }}
                              >
                                {isChecked ? `+${litrosPorBenef} L` : '0 L'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* 4. FOTO OPCIONAL DEL DEPÓSITO */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      onPress={handleTakePhotoDeposito}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 9,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: fotoDepositoUri ? '#16a34a' : '#0284c7',
                        backgroundColor: fotoDepositoUri ? '#f0fdf4' : '#f0f9ff',
                      }}
                    >
                      <Ionicons
                        name="camera-outline"
                        size={16}
                        color={fotoDepositoUri ? '#15803d' : '#0284c7'}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: fotoDepositoUri ? '#15803d' : '#0284c7',
                        }}
                      >
                        {fotoDepositoUri ? '📸 Foto del Depósito Capturada (Cambiar)' : '📷 Tomar Foto del Depósito (Opcional)'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* BOTONES ACCIÓN */}
                  <View style={styles.modalCalidadBtnRow}>
                    <TouchableOpacity
                      style={styles.modalCalidadCancelBtn}
                      disabled={savingDeposito}
                      onPress={() => setDepositoModalVisible(false)}
                    >
                      <Text style={styles.modalCalidadCancelText}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalCalidadSaveBtn, { flex: 1.6 }]}
                      disabled={savingDeposito || marcadosCount === 0}
                      onPress={() => handleGuardarEntregaDepositoSector(false)}
                    >
                      {savingDeposito ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-done-circle-outline" size={18} color="#ffffff" />
                          <Text style={styles.modalCalidadSaveText}>
                            Entregar ({marcadosCount} fam • {litrosPorBenef}L)
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL COINCIDENCIAS DE BÚSQUEDA (CUANDO SE ENCUENTRAN VARIOS BENEFICIARIOS) */}
      <Modal
        visible={coincidenciasModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCoincidenciasModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.coincidenciasModalContent}>
            {/* HEADER MODAL */}
            <View style={styles.modalCalidadHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.avatarCircle, { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e0f2fe' }]}>
                  <Ionicons name="people" size={18} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalCalidadTitle}>
                    {coincidenciasResultados.length} Coincidencias Encontradas
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b' }}>
                    Seleccione el beneficiario para registrar la entrega
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setCoincidenciasModalVisible(false)}
                style={styles.modalCloseCircle}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* LISTA CON SCROLL DE COINCIDENCIAS */}
            <ScrollView style={{ maxHeight: 380, marginTop: 10 }}>
              <View style={{ gap: 8 }}>
                {coincidenciasResultados.map((item, idx) => {
                  const itemNombre = item.nombres || item.nombres_apellidos || 'Sin nombre';
                  const itemSector = item.sector_aahh || item.sector || 'Sector';
                  const itemDni = item.dni || '-';
                  const itemVale = item.vale_codigo || null;
                  const itemAtendido = !!item.atendido_esta_semana || (Number(item.saldo_semanal) <= 0 && Number(item.litros_entregados_semana) > 0);

                  return (
                    <TouchableOpacity
                      key={item.id ? `c-${item.id}` : `c-idx-${idx}`}
                      style={styles.coincidenciaCard}
                      onPress={() => {
                        setCoincidenciasModalVisible(false);
                        seleccionarBeneficiarioFinal(item);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.coincidenciaNombre} numberOfLines={1}>
                            {itemNombre}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                            <Text style={styles.coincidenciaDni}>
                              DNI: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{itemDni}</Text>
                            </Text>
                            <Text style={styles.coincidenciaSector}>
                              📍 {itemSector}
                            </Text>
                          </View>

                          {itemVale ? (
                            <View style={[styles.miniValeBadge, { marginTop: 4, alignSelf: 'flex-start' }]}>
                              <Text style={styles.miniValeBadgeText}>🎫 {itemVale}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <View style={itemAtendido ? styles.benefStatusOk : styles.benefStatusPending}>
                            <Text style={itemAtendido ? styles.benefStatusOkText : styles.benefStatusPendingText}>
                              {itemAtendido ? 'Atendido' : 'Pendiente'}
                            </Text>
                          </View>

                          <View style={styles.coincidenciaSelectBtn}>
                            <Text style={styles.coincidenciaSelectBtnText}>Elegir</Text>
                            <Ionicons name="arrow-forward" size={11} color="#0284c7" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCancelPillBtn}
              onPress={() => setCoincidenciasModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelPillText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL SELECTOR DE DÍA DE ENTREGA (7 DÍAS DEL CICLO SEMANAL) */}
      <Modal
        visible={diaPickerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDiaPickerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.diaPickerModalContent}>
            {/* MODAL HEADER */}
            <View style={styles.modalCalidadHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalDiaCalendarIconBox}>
                  <Ionicons name="calendar" size={20} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalCalidadTitle}>Elegir Día de Reparto</Text>
                  <Text style={styles.modalCalidadSubtitle}>Ciclo de 7 días EPS Moyobamba</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setDiaPickerModalVisible(false)}
                style={styles.modalCloseCircle}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
              Seleccione el día al que corresponde esta entrega. Por defecto es hoy, pero puede elegir cualquiera de los 7 días para entregar dotaciones pendientes o regularizar faltantes:
            </Text>

            {/* LISTA DE LOS 7 DÍAS DE LA SEMANA */}
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={{ gap: 8 }}>
                {diasSemana.map((d: any) => {
                  const isSelected = diaSeleccionado?.id === d.id;
                  return (
                    <TouchableOpacity
                      key={`modal-dia-opt-${d.id}`}
                      style={[
                        styles.diaModalRowCard,
                        isSelected && styles.diaModalRowCardActive,
                      ]}
                      onPress={() => {
                        setDiaSeleccionado(d);
                        setDiaPickerModalVisible(false);
                      }}
                      activeOpacity={0.82}
                    >
                      <View style={[styles.diaModalIconBox, isSelected && styles.diaModalIconBoxActive]}>
                        <Text style={[styles.diaModalCodigo, isSelected && styles.diaModalCodigoActive]}>
                          {d.codigo}
                        </Text>
                      </View>

                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.diaModalNombre, isSelected && styles.diaModalNombreActive]}>
                            {d.nombre}
                          </Text>
                          {d.esHoy ? (
                            <View style={styles.diaPillHoyBadgeModal}>
                              <Text style={styles.diaPillHoyTextModal}>HOY (ACTUAL)</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.diaModalFechaSub}>
                          Fecha: {d.fechaDisplay}
                        </Text>
                      </View>

                      <Ionicons
                        name={isSelected ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={isSelected ? "#0284c7" : "#cbd5e1"}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCancelPillBtn, { marginTop: 14 }]}
              onPress={() => setDiaPickerModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelPillText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DE ACTUALIZACIÓN DIRECTA EN 1 CLIC (EAS OTA) */}
      <AppUpdateModal
        visible={updateModalVisible}
        onClose={() => setUpdateModalVisible(false)}
      />
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
  headerActionsBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  updateBtnPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  updateBtnPillText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '800',
  },
  syncBtnPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
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
    borderRadius: 24,
    padding: 4,
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
    paddingVertical: 9,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
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
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  topTabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  activeDotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    marginTop: 3,
  },

  // ESTILOS DE PAGINACIÓN DE BENEFICIARIOS
  paginationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  paginationInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paginationInfoText: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '600',
  },
  pageBadgePill: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pageBadgePillText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '800',
  },
  paginationBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pageNavBtnDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  pageNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  pageNavBtnTextDisabled: {
    color: '#94a3b8',
  },
  pageNumbersScroll: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pageNumberChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNumberChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  pageNumberChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  pageNumberChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
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
    fontSize: 11.5,
    color: '#0369a1',
    fontWeight: '800',
    letterSpacing: 0.2,
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

  /* ─── ESTILOS LISTA DE BENEFICIARIOS POR SECTOR ─── */
  beneficiariosViewContainer: {
    width: '100%',
    paddingBottom: 30,
  },
  benefHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  benefHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  benefRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  benefRefreshText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  benefSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 12,
  },
  benefSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  benefSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 2,
  },
  benefFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  benefFilterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefFilterChipActive: {
    backgroundColor: '#0284c7',
  },
  benefFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  benefFilterChipTextActive: {
    color: '#ffffff',
  },
  benefEmptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  benefEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
  },
  benefEmptySubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  benefCardItem: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  benefNombreText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 3,
  },
  benefDniText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 2,
  },
  benefDirText: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  benefStatusOk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  benefStatusOkText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  benefStatusPending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  benefStatusPendingText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#b45309',
  },
  benefMetricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
  },
  benefMetricMiniBox: {
    flex: 1,
    alignItems: 'center',
  },
  benefMetricMiniLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2,
  },
  benefMetricMiniVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  benefSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 9,
    borderRadius: 10,
  },
  benefSelectBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  verBeneficiariosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  verBeneficiariosBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
    marginLeft: 6,
  },

  // SECTOR FILTER PILLS
  sectorFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  sectorFilterPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  sectorFilterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369a1',
  },
  sectorFilterPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // MINI SEARCH EN CARD DE SECTOR
  sectorMiniSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 8,
  },
  sectorMiniSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    paddingVertical: 0,
  },

  // PREVIEW BENEFICIARIOS EN PROGRAMACION CARD
  progBenefItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  progBenefItemName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  progBenefItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  progBenefDeliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  progBenefDeliverBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  progBenefViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  progBenefViewAllBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284c7',
  },

  // MINI VALE BADGE
  miniValeBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniValeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
  },

  // COINCIDENCIAS SEARCH MODAL
  coincidenciasModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  coincidenciaCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  coincidenciaNombre: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  coincidenciaDni: {
    fontSize: 11.5,
    color: '#64748b',
  },
  coincidenciaSector: {
    fontSize: 11.5,
    color: '#0284c7',
    fontWeight: '600',
  },
  coincidenciaSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  coincidenciaSelectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  modalCancelPillBtn: {
    marginTop: 14,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },

  // AVANCE SEMANAL POR SECTOR
  sectorWeeklyProgressBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  sectorWeeklyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectorWeeklyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  sectorWeeklyBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  sectorProgressBarBg: {
    height: 7,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  sectorProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  sectorMetricsRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
  },
  sectorMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  sectorMetricLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2,
    textAlign: 'center',
  },
  sectorMetricVal: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectorMetricSub: {
    fontSize: 8.5,
    color: '#94a3b8',
    marginTop: 1,
    textAlign: 'center',
  },

  // AVANCE SEMANAL INDIVIDUAL BENEFICIARIO
  benefMiniProgressBarBg: {
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  benefMiniProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ─── ESTILOS DÍA DE ENTREGA / REPARTO SEMANAL (7 DÍAS) ───
  cardHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeDiaEntrega: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  badgeDiaEntregaDiferido: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  badgeDiaEntregaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  badgeDiaEntregaDiferidoText: {
    color: '#d97706',
  },

  diaSelectorBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    padding: 12,
    marginVertical: 10,
  },
  diaSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  diaSelectorTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  diaStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  diaStatusPillDiferido: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  diaStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
  },
  diaStatusTextDiferido: {
    color: '#b45309',
  },

  diasScrollRow: {
    flexDirection: 'row',
    gap: 7,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  diaPillBtn: {
    width: 52,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  diaPillBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1',
    shadowColor: '#0284c7',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  diaPillBtnHoy: {
    borderColor: '#38bdf8',
    backgroundColor: '#f0f9ff',
  },
  diaPillCodigo: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  diaPillCodigoActive: {
    color: '#e0f2fe',
    fontWeight: '900',
  },
  diaPillFecha: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginVertical: 1,
  },
  diaPillFechaActive: {
    color: '#ffffff',
  },
  diaPillMes: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  diaPillMesActive: {
    color: '#bae6fd',
    fontWeight: '800',
  },
  diaPillHoyBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 1,
  },
  diaPillHoyBadgeActive: {
    backgroundColor: '#ffffff',
  },
  diaPillHoyText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#ffffff',
  },
  diaPillHoyTextActive: {
    color: '#0284c7',
  },

  diaDiferidoAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 9,
    marginTop: 10,
  },
  diaDiferidoAlertTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400e',
  },
  diaDiferidoAlertSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#b45309',
    marginTop: 2,
  },

  quickLitrosRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickLitroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  quickLitroBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },

  // MODAL DÍA DE ENTREGA
  diaPickerModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  modalDiaCalendarIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  diaModalRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  diaModalRowCardActive: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  diaModalIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  diaModalIconBoxActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1',
  },
  diaModalCodigo: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
  },
  diaModalCodigoActive: {
    color: '#ffffff',
  },
  diaModalNombre: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  diaModalNombreActive: {
    color: '#0284c7',
    fontWeight: '900',
  },
  diaPillHoyBadgeModal: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  diaPillHoyTextModal: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#047857',
  },
  diaModalFechaSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
});
