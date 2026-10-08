import { Platform } from 'react-native';

// URL pública oficial de producción del servidor EPS Moyobamba
// (Puede ser sobreescrita dinámicamente con la variable de entorno EXPO_PUBLIC_API_URL)
export const DEFAULT_PRODUCTION_URL = 'https://aguatrack.com/api/v1';

// IP para pruebas en red local durante desarrollo
export const DEV_BACKEND_HOST = '192.168.1.12';
export const DEV_BACKEND_PORT = 3000;

export const getBackendUrl = (): string => {
  // 1. Variable de entorno inyectada durante la compilación con EAS / Expo
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 2. Ejecución Web
  if (Platform.OS === 'web') {
    const win = (globalThis as any).window;
    if (win && win.location) {
      if (win.location.hostname !== 'localhost' && win.location.hostname !== '127.0.0.1') {
        return `${win.location.origin}/api/v1`;
      }
      return `http://${win.location.hostname}:${DEV_BACKEND_PORT}/api/v1`;
    }
    return `http://localhost:${DEV_BACKEND_PORT}/api/v1`;
  }

  // 3. Si está en modo producción (__DEV__ === false), usar URL de producción oficial
  if (!__DEV__) {
    return DEFAULT_PRODUCTION_URL;
  }

  // 4. Modo desarrollo local
  return `http://${DEV_BACKEND_HOST}:${DEV_BACKEND_PORT}/api/v1`;
};

export const BACKEND_URL = getBackendUrl();

