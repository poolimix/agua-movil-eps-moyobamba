import { useState, useEffect } from 'react';
import { dialogAlert } from '../context/DialogContext';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (PWA installed)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('[PWA] Evento beforeinstallprompt capturado');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('[PWA] Aplicación instalada exitosamente');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      await dialogAlert({
        title: 'Instalar en iPhone / iPad',
        message: 'Para instalar en tu dispositivo iOS: presione el botón "Compartir" (ícono cuadrado con flecha hacia arriba) en Safari y seleccione "Agregar a Inicio".',
        type: 'info',
        icon: '📲',
      });
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Resultado instalación:', outcome);

    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !isInstallable) return null;

  return (
    <div className="pwa-install-banner">
      <div className="pwa-info">
        <span className="pwa-icon">📲</span>
        <div>
          <strong>Instalar Agua Móvil</strong>
          <p>Accede directo y más rápido desde tu pantalla de inicio</p>
        </div>
      </div>
      <div className="pwa-actions">
        <button className="btn-pwa-install" onClick={handleInstallClick}>
          Instalar App
        </button>
        <button className="btn-pwa-dismiss" onClick={() => setIsInstallable(false)} title="Cerrar">
          ✕
        </button>
      </div>
    </div>
  );
}
