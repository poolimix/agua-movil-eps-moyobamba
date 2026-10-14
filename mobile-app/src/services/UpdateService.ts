import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { BACKEND_URL } from '../config/api';

export interface AppVersionInfo {
  needsUpdate: boolean;
  isMandatory: boolean;
  currentVersion: string;
  targetVersion: string;
  updateUrl: string;
  releaseNotes: string;
}

/**
 * Compara dos versiones semánticas (ej: '1.0.1' y '1.0.2')
 * Devuelve true si currentVersion < requiredVersion
 */
export function isVersionLower(currentVersion: string, requiredVersion: string): boolean {
  if (!currentVersion || !requiredVersion) return false;

  const currentParts = currentVersion.split('.').map((p) => parseInt(p, 10) || 0);
  const requiredParts = requiredVersion.split('.').map((p) => parseInt(p, 10) || 0);

  const length = Math.max(currentParts.length, requiredParts.length);
  for (let i = 0; i < length; i++) {
    const c = currentParts[i] || 0;
    const r = requiredParts[i] || 0;
    if (c < r) return true;
    if (c > r) return false;
  }

  return false;
}

/**
 * Consulta al backend si la versión instalada de la APK cumple con la versión mínima
 */
export async function checkServerAppVersion(): Promise<AppVersionInfo | null> {
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(`${BACKEND_URL}/configuracion/app-version`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[UpdateService] Error HTTP ${res.status} al consultar versión`);
      return null;
    }

    const json = await res.json();
    const data = json?.data;

    if (!data) return null;

    const minVersion = data.version_minima || '1.0.0';
    const targetVersion = data.version_actual || minVersion;
    const forceUpdate = Boolean(data.force_update);

    // Es menor que la versión mínima obligatoria
    const isOutdated = isVersionLower(currentVersion, minVersion);

    return {
      needsUpdate: isOutdated,
      isMandatory: forceUpdate && isOutdated,
      currentVersion,
      targetVersion,
      updateUrl: data.update_url || 'https://expo.dev',
      releaseNotes: data.release_notes || 'Nueva versión con mejoras importantes y correcciones obligatorias.',
    };
  } catch (error) {
    // Si no hay conexión o timeout (modo offline en campo), no interrumpir la operativa
    console.log('[UpdateService] Modo offline o sin conexión al verificar versión del servidor:', error);
    return null;
  }
}

/**
 * Verifica y aplica actualizaciones Over-The-Air (EAS Update) si están disponibles
 */
export async function checkAndApplyEASUpdate(
  onDownloading?: (isDownloading: boolean) => void
): Promise<boolean> {
  try {
    // Si estamos en entorno de desarrollo local (__DEV__), omitir EAS Updates
    if (__DEV__) {
      return false;
    }

    if (!Updates.isEnabled) {
      return false;
    }

    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      if (onDownloading) onDownloading(true);
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
      return true;
    }
  } catch (error) {
    console.warn('[UpdateService] Error al verificar EAS Update:', error);
  } finally {
    if (onDownloading) onDownloading(false);
  }

  return false;
}

const ANDROID_PACKAGE = 'com.epsmoyobamba.aguatrack';
const PLAY_STORE_MARKET_URL = `market://details?id=${ANDROID_PACKAGE}`;
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Abre la tienda de aplicaciones oficial (Google Play Store en Android, App Store en iOS)
 * o la URL personalizada configurada en el servidor.
 */
export async function openUpdateUrl(customUrl?: string) {
  try {
    if (customUrl && customUrl.startsWith('http')) {
      // Si el enlace es una URL web o link directo configurado
      await Linking.openURL(customUrl);
      return;
    }

    if (Platform.OS === 'android') {
      try {
        const canOpenMarket = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
        if (canOpenMarket) {
          await Linking.openURL(PLAY_STORE_MARKET_URL);
          return;
        }
      } catch {
        // Fallback al navegador web de Play Store
      }
      await Linking.openURL(PLAY_STORE_WEB_URL);
      return;
    }

    if (Platform.OS === 'ios') {
      const iosUrl = customUrl || `itms-apps://itunes.apple.com/app/${ANDROID_PACKAGE}`;
      await Linking.openURL(iosUrl);
      return;
    }

    if (customUrl) {
      await Linking.openURL(customUrl);
    }
  } catch (err) {
    console.error('[UpdateService] Error abriendo tienda de aplicaciones:', err);
    if (customUrl) {
      await Linking.openURL(customUrl);
    }
  }
}

