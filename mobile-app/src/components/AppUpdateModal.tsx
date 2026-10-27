import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import {
  manualCheckForUpdates,
  downloadAndApplyUpdate,
  ManualUpdateCheckResult,
} from '../services/UpdateService';

interface AppUpdateModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AppUpdateModal({ visible, onClose }: AppUpdateModalProps) {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadStep, setDownloadStep] = useState('');
  const [result, setResult] = useState<ManualUpdateCheckResult | null>(null);

  const currentVersion = Constants.expoConfig?.version || '1.0.2';

  useEffect(() => {
    if (visible) {
      handleCheck();
    } else {
      setResult(null);
      setChecking(false);
      setDownloading(false);
    }
  }, [visible]);

  const handleCheck = async () => {
    setChecking(true);
    setResult(null);
    try {
      const res = await manualCheckForUpdates();
      setResult(res);
    } catch (e: any) {
      setResult({
        status: 'ERROR',
        message: e?.message || 'Error de conexión al verificar actualizaciones.',
      });
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    setDownloading(true);
    setDownloadStep('Descargando paquete de actualización...');
    try {
      await downloadAndApplyUpdate((msg) => setDownloadStep(msg));
    } catch (e: any) {
      setDownloading(false);
      setResult({
        status: 'ERROR',
        message: e?.message || 'Ocurrió un error al descargar la actualización. Intente nuevamente.',
      });
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download-outline" size={26} color="#0284c7" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.title}>Actualizaciones</Text>
              <Text style={styles.subtitle}>AguaTrack • EPS Moyobamba</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={downloading}>
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* APP VERSION INFO */}
          <View style={styles.versionBadgeRow}>
            <View style={styles.versionChip}>
              <Text style={styles.versionChipLabel}>Versión Instalada</Text>
              <Text style={styles.versionChipVal}>v{currentVersion}</Text>
            </View>
            <View style={styles.versionChip}>
              <Text style={styles.versionChipLabel}>Canal OTA</Text>
              <Text style={[styles.versionChipVal, { color: '#059669' }]}>Producción</Text>
            </View>
          </View>

          {/* MAIN STATUS BODY */}
          <View style={styles.body}>
            {checking ? (
              <View style={styles.stateContainer}>
                <ActivityIndicator size="large" color="#0284c7" style={{ marginBottom: 12 }} />
                <Text style={styles.stateTitle}>Buscando actualizaciones...</Text>
                <Text style={styles.stateText}>
                  Consultando la nube de Expo EAS para verificar si hay cambios o mejoras publicadas.
                </Text>
              </View>
            ) : downloading ? (
              <View style={styles.stateContainer}>
                <ActivityIndicator size="large" color="#059669" style={{ marginBottom: 12 }} />
                <Text style={[styles.stateTitle, { color: '#059669' }]}>Instalando actualización...</Text>
                <Text style={styles.stateText}>{downloadStep}</Text>
                <Text style={[styles.stateText, { marginTop: 6, fontSize: 11, color: '#64748b' }]}>
                  La aplicación se reiniciará automáticamente al terminar.
                </Text>
              </View>
            ) : result?.status === 'UPDATE_AVAILABLE' ? (
              <View style={styles.stateContainer}>
                <View style={styles.alertIconCircle}>
                  <Ionicons name="sparkles" size={24} color="#059669" />
                </View>
                <Text style={[styles.stateTitle, { color: '#059669' }]}>¡Nueva Versión Disponible!</Text>
                <Text style={styles.stateText}>{result.message}</Text>

                <View style={styles.improvementsBox}>
                  <Text style={styles.improvementsTitle}>Novedades incluidas:</Text>
                  <Text style={styles.improvementItem}>✓ Búsqueda por DNI, código de vale y nombre</Text>
                  <Text style={styles.improvementItem}>✓ Selector de 7 días (LUN - DOM) con fecha real</Text>
                  <Text style={styles.improvementItem}>✓ Teclado adaptativo para no tapar el campo</Text>
                  <Text style={styles.improvementItem}>✓ Cisterna y conductor asignados siempre visibles</Text>
                  <Text style={styles.improvementItem}>✓ Fotografía de evidencia 100% opcional</Text>
                </View>

                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={handleApply}
                  activeOpacity={0.85}
                >
                  <Ionicons name="flash-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.applyBtnText}>Actualizar Ahora (1 Clic)</Text>
                </TouchableOpacity>
              </View>
            ) : result?.status === 'ALREADY_UP_TO_DATE' ? (
              <View style={styles.stateContainer}>
                <View style={[styles.alertIconCircle, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
                </View>
                <Text style={[styles.stateTitle, { color: '#16a34a' }]}>Tu aplicación está al día</Text>
                <Text style={styles.stateText}>{result.message}</Text>
                <Text style={[styles.stateText, { marginTop: 8, fontSize: 11.5, color: '#64748b' }]}>
                  No hay actualizaciones pendientes por descargar en este momento.
                </Text>

                <TouchableOpacity
                  style={styles.recheckBtn}
                  onPress={handleCheck}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={14} color="#0284c7" style={{ marginRight: 5 }} />
                  <Text style={styles.recheckBtnText}>Volver a comprobar</Text>
                </TouchableOpacity>
              </View>
            ) : result?.status === 'NOT_SUPPORTED' ? (
              <View style={styles.stateContainer}>
                <View style={[styles.alertIconCircle, { backgroundColor: '#f8fafc' }]}>
                  <Ionicons name="information-circle-outline" size={28} color="#64748b" />
                </View>
                <Text style={styles.stateTitle}>Versión Instalada</Text>
                <Text style={styles.stateText}>{result.message}</Text>

                <TouchableOpacity
                  style={styles.recheckBtn}
                  onPress={handleCheck}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={14} color="#0284c7" style={{ marginRight: 5 }} />
                  <Text style={styles.recheckBtnText}>Volver a comprobar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.stateContainer}>
                <View style={[styles.alertIconCircle, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="alert-circle-outline" size={28} color="#dc2626" />
                </View>
                <Text style={[styles.stateTitle, { color: '#dc2626' }]}>Aviso de Conexión</Text>
                <Text style={styles.stateText}>
                  {result?.message || 'No se pudo conectar al servidor de actualizaciones.'}
                </Text>

                <TouchableOpacity
                  style={styles.recheckBtn}
                  onPress={handleCheck}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={14} color="#0284c7" style={{ marginRight: 5 }} />
                  <Text style={styles.recheckBtnText}>Reintentar comprobación</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* FOOTER */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={onClose}
              disabled={downloading}
              activeOpacity={0.8}
            >
              <Text style={styles.closeFooterBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    width: '100%',
    maxWidth: 420,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  versionBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  versionChip: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  versionChipLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  versionChipVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 1,
  },
  body: {
    paddingVertical: 6,
  },
  stateContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 12.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  alertIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  improvementsBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 12,
    width: '100%',
    marginTop: 12,
    marginBottom: 14,
  },
  improvementsTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 6,
  },
  improvementItem: {
    fontSize: 11,
    color: '#15803d',
    marginBottom: 3,
    fontWeight: '600',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 14,
    width: '100%',
    marginTop: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  recheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  recheckBtnText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    alignItems: 'center',
  },
  closeFooterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  closeFooterBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
});
