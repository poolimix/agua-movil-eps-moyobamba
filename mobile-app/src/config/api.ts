import { Platform } from 'react-native';

// IP actual de la máquina en la red local Wi-Fi
export const BACKEND_HOST = '192.168.161.226';
export const BACKEND_PORT = 3000;

const getBackendUrl = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      return `http://${window.location.hostname}:3000/api/v1`;
    }
    return 'http://localhost:3000/api/v1';
  }
  return `http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1`;
};

export const BACKEND_URL = getBackendUrl();

