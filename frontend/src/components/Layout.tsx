import React, { useState } from 'react';
import Sidebar from './Sidebar';
import PWAInstallBanner from './PWAInstallBanner';
import '../pages/DashboardPage.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="dashboard-wrapper">
      {/* MOBILE TOP BAR */}
      <header className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <div className="mobile-brand">
          <span className="mobile-brand-icon">💧</span>
          <span className="mobile-brand-title">Agua Móvil</span>
        </div>
      </header>

      {/* MOBILE BACKDROP OVERLAY */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR NAVIGATION */}
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <PWAInstallBanner />
        {children}
      </main>
    </div>
  );
}
