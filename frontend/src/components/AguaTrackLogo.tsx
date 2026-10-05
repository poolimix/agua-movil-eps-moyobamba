import React from 'react';
import './AguaTrackLogo.css';

interface AguaTrackLogoProps {
  variant?: 'vertical' | 'full' | 'horizontal' | 'icon' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
  subtitleText?: string;
}

export const AguaTrackLogo: React.FC<AguaTrackLogoProps> = ({
  variant = 'vertical',
  size = 'md',
  showSubtitle = true,
  className = '',
  theme = 'auto',
  subtitleText = 'EPS Moyobamba • PNSU',
}) => {
  const sizeMap = {
    xs: { icon: 28, font: '1rem', sub: '0.65rem' },
    sm: { icon: 38, font: '1.25rem', sub: '0.72rem' },
    md: { icon: 54, font: '1.5rem', sub: '0.8rem' },
    lg: { icon: 84, font: '2rem', sub: '0.88rem' },
    xl: { icon: 110, font: '2.5rem', sub: '1rem' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const isVertical = variant === 'vertical' || variant === 'full';

  return (
    <div
      className={`aguatrack-logo-root layout-${isVertical ? 'vertical' : 'horizontal'} variant-${variant} size-${size} theme-${theme} ${className}`}
      role="img"
      aria-label="AguaTrack - Sistema Oficial de Distribución y Trazabilidad de Agua Potable"
    >
      {/* 1. LOGO OFICIAL ORIGINAL (ARRIBA DEL NOMBRE) */}
      <div
        className="aguatrack-icon-wrapper"
        style={{ width: currentSize.icon, height: currentSize.icon }}
      >
        <img
          src="/aguatrack-icon.png"
          alt="AguaTrack Logo Oficial"
          className="aguatrack-official-img"
          loading="eager"
        />
      </div>

      {/* 2. NOMBRE Y SUBTÍTULO (DEBAJO DEL LOGO) */}
      {variant !== 'icon' && (
        <div className="aguatrack-text-block">
          <div className="aguatrack-wordmark" style={{ fontSize: currentSize.font }}>
            <span className="part-agua">Agua</span>
            <span className="part-track">Track</span>
            <span className="badge-geo">GPS</span>
          </div>

          {showSubtitle && (
            <div className="aguatrack-tagline" style={{ fontSize: currentSize.sub }}>
              {subtitleText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AguaTrackLogo;
