import React, { useState } from 'react';
import Sidebar from './Sidebar';
import PWAInstallBanner from './PWAInstallBanner';
import '../pages/DashboardPage.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className={`dashboard-wrapper ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
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
          <span className="mobile-brand-title">AguaTrack</span>
        </div>
      </header>

      {/* MOBILE BACKDROP OVERLAY */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR NAVIGATION */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* MAIN CONTENT AREA */}
      <main className={`main-content ${sidebarCollapsed ? 'main-content-collapsed' : ''}`}>
        <PWAInstallBanner />
        {children}
      </main>
    </div>
  );
}
