import React, { useEffect, useState } from 'react';
import './AguaTrackPreloader.css';

interface AguaTrackPreloaderProps {
  onComplete?: () => void;
  minDurationMs?: number;
}

export const AguaTrackPreloader: React.FC<AguaTrackPreloaderProps> = ({
  onComplete,
  minDurationMs = 1800,
}) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Iniciando telemetría satelital...');
  const [isClosing, setIsClosing] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawPct = Math.min(100, Math.floor((elapsed / minDurationMs) * 100));

      setProgress(rawPct);

      if (rawPct < 30) {
        setStatusText('Iniciando enlace satelital GPS & coordenadas...');
      } else if (rawPct < 65) {
        setStatusText('Verificando padrón y vales de consumo PNSU...');
      } else if (rawPct < 90) {
        setStatusText('Sincronizando flota y monitoreo de cisternas...');
      } else {
        setStatusText('Sistema listo • Bienvenido a AguaTrack');
      }

      if (rawPct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsClosing(true);
          setTimeout(() => {
            setHidden(true);
            if (onComplete) onComplete();
          }, 600);
        }, 300);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [minDurationMs, onComplete]);

  if (hidden) return null;

  return (
    <div className={`aguatrack-preloader-overlay ${isClosing ? 'preloader-fade-out' : ''}`}>
      {/* Background ambient light effects */}
      <div className="preloader-ambient-glow" />
      <div className="preloader-grid-bg" />

      {/* Main Preloader Content Box */}
      <div className="preloader-card">
        {/* Orbital Tracking & Sonar Rings */}
        <div className="preloader-radar-stage">
          <div className="sonar-ring ring-1" />
          <div className="sonar-ring ring-2" />
          <div className="sonar-ring ring-3" />

          {/* Rotating satellite coordinate beam */}
          <div className="orbital-tracker">
            <div className="tracker-satellite-dot" />
          </div>

          {/* Central Logo Emblem */}
          <div className="preloader-emblem">
            <img
              src="/aguatrack-icon.png"
              alt="AguaTrack Logo"
              className="preloader-logo-img"
            />
          </div>
        </div>

        {/* Brand Name with Cyber Shimmer */}
        <div className="preloader-brand">
          <h1 className="preloader-title">
            <span className="title-agua">Agua</span>
            <span className="title-track">Track</span>
            <span className="title-pill">EPS</span>
          </h1>
          <p className="preloader-subtitle">
            TRAZABILIDAD Y DISTRIBUCIÓN DE AGUA POTABLE
          </p>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="preloader-progress-section">
          <div className="preloader-bar-track">
            <div
              className="preloader-bar-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="preloader-bar-sparkle"
              style={{ left: `${Math.min(97, progress)}%` }}
            />
          </div>

          {/* Status & Counter */}
          <div className="preloader-meta-row">
            <span className="preloader-status-msg">{statusText}</span>
            <span className="preloader-percentage">{progress}%</span>
          </div>
        </div>

        {/* Telemetry Footer */}
        <div className="preloader-telemetry-chips">
          <span className="telemetry-chip">🛰️ GPS ACTIVE</span>
          <span className="telemetry-chip">💧 EPS MOYOBAMBA</span>
          <span className="telemetry-chip">📱 OFFLINE-READY</span>
        </div>
      </div>
    </div>
  );
};

export default AguaTrackPreloader;
