import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { AppVersionInfo, openUpdateUrl } from '../services/UpdateService';

interface ForceUpdateModalProps {
  updateInfo: AppVersionInfo | null;
  visible: boolean;
  onRecheck: () => void;
  isChecking?: boolean;
}

export default function ForceUpdateModal({
  updateInfo,
  visible,
  onRecheck,
  isChecking = false,
}: ForceUpdateModalProps) {
  if (!updateInfo || !visible) return null;

  const isIos = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const storeName = isIos ? 'Apple App Store' : isAndroid ? 'Google Play Store' : 'Tienda de Aplicaciones';
  const btnLabel = isIos
    ? '🍏 Actualizar en App Store'
    : isAndroid
    ? '🤖 Actualizar en Google Play'
    : '🚀 Descargar y Actualizar';

  const handleUpdate = () => {
    openUpdateUrl(updateInfo.updateUrl);
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Bloqueo estricto: no permitir cerrar con botón físico 'Atrás' de Android
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* LOGO E IDENTIFICADOR */}
          <View style={styles.header}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⚠️ ACTUALIZACIÓN OBLIGATORIA</Text>
            </View>
            <Text style={styles.title}>Nueva versión disponible</Text>
            <Text style={styles.subtitle}>
              Para continuar utilizando AguaTrack EPS Moyobamba es necesario actualizar la aplicación.
            </Text>
          </View>

          {/* TARJETA DE COMPARACIÓN DE VERSIONES */}
          <View style={styles.versionCard}>
            <View style={styles.versionCol}>
              <Text style={styles.versionLabel}>Tu versión</Text>
              <Text style={styles.versionCurrent}>v{updateInfo.currentVersion}</Text>
            </View>
            <View style={styles.versionArrow}>
              <Text style={styles.arrowText}>➔</Text>
            </View>
            <View style={styles.versionCol}>
              <Text style={styles.versionLabel}>Versión requerida</Text>
              <Text style={styles.versionRequired}>v{updateInfo.targetVersion}</Text>
            </View>
          </View>

          {/* NOTAS DE LA VERSIÓN */}
          <View style={styles.notesContainer}>
            <Text style={styles.notesTitle}>Novedades y cambios:</Text>
            <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.notesText}>{updateInfo.releaseNotes}</Text>
            </ScrollView>
          </View>

          {/* MENSAJE NORMATIVO */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>
              Por políticas de seguridad y sincronización de datos de distribución de agua potable, el acceso permanecerá pausado hasta completar la instalación.
            </Text>
          </View>

          {/* BOTONES DE ACCIÓN */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.btnPrimary}
              activeOpacity={0.85}
              onPress={handleUpdate}
            >
              <Text style={styles.btnPrimaryText}>{btnLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSecondary}
              activeOpacity={0.7}
              onPress={onRecheck}
              disabled={isChecking}
            >
              {isChecking ? (
                <View style={styles.checkingRow}>
                  <ActivityIndicator size="small" color="#0284c7" />
                  <Text style={styles.btnSecondaryText}>Verificando versión...</Text>
                </View>
              ) : (
                <Text style={styles.btnSecondaryText}>🔄 Ya instalé la actualización (Verificar)</Text>
              )}
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
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#38bdf8',
    marginBottom: 12,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  badge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 10,
  },
  badgeText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  versionCol: {
    alignItems: 'center',
    flex: 1,
  },
  versionLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 3,
  },
  versionCurrent: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ef4444',
  },
  versionRequired: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },
  versionArrow: {
    paddingHorizontal: 8,
  },
  arrowText: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: '700',
  },
  notesContainer: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    maxHeight: 110,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  notesScroll: {
    maxHeight: 70,
  },
  notesText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 20,
    gap: 8,
  },
  infoIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  infoText: {
    fontSize: 11.5,
    color: '#1e40af',
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  btnSecondary: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnSecondaryText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  checkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
