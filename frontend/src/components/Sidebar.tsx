import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AguaTrackLogo from './AguaTrackLogo';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const { user, logout, isSuperAdmin } = useAuth();

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const getRoleBadge = (rol?: string) => {
    const r = (rol || '').toUpperCase();
    switch (r) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>👑 SUPER ADMIN</span>;
      case 'SUPERVISOR':
        return <span style={{ background: '#8b5cf6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>📋 SUPERVISOR</span>;
      case 'CONDUCTOR':
        return <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🚚 CONDUCTOR</span>;
      case 'GESTOR_ENTREGA':
        return <span style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🤝 GESTOR</span>;
      default:
        return <span style={{ background: '#64748b', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{r || 'OPERADOR'}</span>;
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''} ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-brand-content" style={{ overflow: 'hidden' }}>
          <AguaTrackLogo
            variant={isCollapsed ? 'icon' : 'horizontal'}
            size={isCollapsed ? 'sm' : 'sm'}
            showSubtitle={!isCollapsed}
          />
        </div>

        <div className="sidebar-header-actions">
          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              title={isCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
              aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {isCollapsed ? (
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </button>
          )}

          {onClose && (
            <button className="sidebar-close-btn" onClick={onClose} title="Cerrar menú">
              ✕
            </button>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* DASHBOARD */}
        <NavLink 
          to="/dashboard" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Dashboard"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </span>
          <span className="nav-label">Dashboard</span>
        </NavLink>

        {/* METAS Y CUMPLIMIENTO */}
        <NavLink 
          to="/metas" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Metas y Cumplimiento"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="2" r="2"/>
            </svg>
          </span>
          <span className="nav-label">Metas y Cumplimiento</span>
        </NavLink>

        {/* BENEFICIARIOS */}
        <NavLink 
          to="/beneficiarios" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Beneficiarios (Padrón)"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </span>
          <span className="nav-label">Beneficiarios (Padrón)</span>
        </NavLink>

        {/* VALES DE CONSUMO */}
        <NavLink 
          to="/vales" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Vales de Consumo"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
              <path d="M13 5v2"/>
              <path d="M13 17v2"/>
              <path d="M13 11v2"/>
            </svg>
          </span>
          <span className="nav-label">Vales de Consumo</span>
        </NavLink>

        {/* CONTROL DE CALIDAD */}
        <NavLink 
          to="/calidad" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Control de Calidad (Cloro)"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31L4.65 17.5a2 2 0 0 0 1.68 2.5h11.34a2 2 0 0 0 1.68-2.5L14 9.31V2"/>
              <path d="M8.5 2h7"/>
              <path d="M7 16h10"/>
            </svg>
          </span>
          <span className="nav-label">Control de Calidad (Cloro)</span>
        </NavLink>

        {/* PROGRAMACIONES */}
        <NavLink 
          to="/programaciones" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Programaciones y Rutas"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
          </span>
          <span className="nav-label">Programaciones</span>
        </NavLink>

        {/* ENTREGAS */}
        <NavLink 
          to="/entregas" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Entregas de Agua"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
            </svg>
          </span>
          <span className="nav-label">Entregas de Agua</span>
        </NavLink>

        {/* INFORMES OFICIALES */}
        <NavLink 
          to="/informes" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Informes Oficiales (PNSU)"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </span>
          <span className="nav-label">Informes Oficiales</span>
        </NavLink>

        {/* BALANCE HÍDRICO */}
        <NavLink 
          to="/balance" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Balance Hídrico"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="M7 21h10"/>
              <path d="M12 3v18"/>
              <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
            </svg>
          </span>
          <span className="nav-label">Balance Hídrico</span>
        </NavLink>

        {/* CISTERNAS */}
        <NavLink 
          to="/cisternas" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Flota de Cisternas"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
              <path d="M15 18H9"/>
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
              <circle cx="17" cy="18" r="2"/>
              <circle cx="7" cy="18" r="2"/>
            </svg>
          </span>
          <span className="nav-label">Flota de Cisternas</span>
        </NavLink>

        {/* PERSONAL */}
        <NavLink 
          to="/personal" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Conductores y Personal"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 18a6 6 0 0 1 12 0"/>
              <circle cx="8" cy="8" r="4"/>
              <path d="m17 11 2 2 4-4"/>
            </svg>
          </span>
          <span className="nav-label">Conductores y Personal</span>
        </NavLink>

        {/* PARÁMETROS DEL SISTEMA (DOTACIÓN Y CALIDAD) */}
        <NavLink 
          to="/configuracion" 
          onClick={handleNavClick} 
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Parámetros del Sistema"
        >
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span className="nav-label">Parámetros del Sistema</span>
        </NavLink>

        {/* GESTIÓN DE USUARIOS Y ROLES (EXCLUSIVO SUPER ADMIN) */}
        {isSuperAdmin && (
          <NavLink 
            to="/usuarios" 
            onClick={handleNavClick} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Gestión de Usuarios y Permisos (Exclusivo Super Admin)"
            style={{ marginTop: 6 }}
          >
            <span className="nav-icon" style={{ color: '#d97706' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            <span className="nav-label" style={{ fontWeight: 700, color: '#d97706' }}>Usuarios y Roles</span>
          </NavLink>
        )}
      </nav>

      <div className="sidebar-user">
        <img
          src={user?.photoURL || 'https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff'}
          alt="avatar"
          className="user-avatar"
          referrerPolicy="no-referrer"
          title={user?.nombres || 'Usuario'}
        />
        <div className="user-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="user-name">{user?.nombres || 'Usuario'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {getRoleBadge(user?.rol)}
            <span className="user-email">{user?.email}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
          ⏻
        </button>
      </div>
    </aside>
  );
}
