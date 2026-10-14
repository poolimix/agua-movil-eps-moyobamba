import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, SafeAreaView, Platform, Image, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RepartoScreen from './src/screens/RepartoScreen';
import ConductorScreen from './src/screens/ConductorScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForceUpdateModal from './src/components/ForceUpdateModal';
import { initDatabase, getDatabase } from './src/database/schema';
import {
  checkServerAppVersion,
  checkAndApplyEASUpdate,
  AppVersionInfo,
} from './src/services/UpdateService';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Estados de actualización
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [easDownloading, setEasDownloading] = useState(false);

  // Verificación de versiones obligatorias (Backend + EAS)
  const verifyUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      // 1. Revisar si hay actualización OTA en EAS Update
      const otaApplied = await checkAndApplyEASUpdate((downloading) => {
        setEasDownloading(downloading);
      });
      if (otaApplied) return;

      // 2. Revisar si hay versión mínima obligatoria requerida por el backend
      const serverVersion = await checkServerAppVersion();
      if (serverVersion && serverVersion.needsUpdate && serverVersion.isMandatory) {
        setUpdateInfo(serverVersion);
      } else {
        setUpdateInfo(null);
      }
    } catch (err) {
      console.warn('Error verificando actualizaciones:', err);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    // Inicializar base de datos y sesión
    initDatabase()
      .then(async () => {
        try {
          const db = await getDatabase();
          const session = await db.getAllAsync('SELECT * FROM sesion_usuario LIMIT 1');
          if (session.length > 0) {
            setUser(session[0]);
          }
        } catch (e) {
          console.log('No session found:', e);
        }
        setDbReady(true);
      })
      .catch((e) => console.error('Error initializing DB:', e));

    // Ejecutar verificación de actualización al ingresar
    verifyUpdates();

    // Re-verificar cuando la app vuelve al primer plano
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        verifyUpdates();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [verifyUpdates]);

  const handleLogout = async () => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM sesion_usuario');
    } catch (e) {
      console.error(e);
    }
    setUser(null);
  };

  // Pantalla de carga mientras se descarga actualización EAS OTA
  if (easDownloading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingTitle}>⚡ Actualizando AguaTrack...</Text>
        <Text style={styles.loadingSubtext}>
          Instalando la versión más reciente en segundo plano. La app se reiniciará en unos segundos.
        </Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Iniciando AguaTrack • EPS Moyobamba...</Text>
      </View>
    );
  }

  const userRol = String(user?.rol || '').toUpperCase();
  const isConductor = userRol === 'CONDUCTOR';

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {user ? (
          isConductor ? (
            <ConductorScreen user={user} onLogout={handleLogout} />
          ) : (
            <RepartoScreen user={user} onLogout={handleLogout} />
          )
        ) : (
          <LoginScreen onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
        )}
      </View>

      {/* MODAL BLOQUEANTE DE ACTUALIZACIÓN OBLIGATORIA */}
      <ForceUpdateModal
        visible={Boolean(updateInfo?.needsUpdate && updateInfo?.isMandatory)}
        updateInfo={updateInfo}
        onRecheck={verifyUpdates}
        isChecking={checkingUpdate}
      />

      <StatusBar style={user ? 'dark' : 'light'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingTop: Platform.OS === 'android' ? 30 : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#38bdf8',
    marginBottom: 8,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
