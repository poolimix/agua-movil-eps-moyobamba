import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const getRoleBadge = (rol?: string) => {
    switch (rol) {
      case 'ADMIN':
        return <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>ADMIN</span>;
      case 'SUPERVISOR':
        return <span style={{ background: '#8b5cf6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>SUPERVISOR</span>;
      case 'CONDUCTOR':
        return <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>CONDUCTOR</span>;
      default:
        return <span style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>OPERADOR</span>;
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="sidebar-logo-icon">💧</span>
          <div>
            <h2>Agua Móvil</h2>
            <p>EPS Moyobamba</p>
          </div>
        </div>
        {onClose && (
          <button className="sidebar-close-btn" onClick={onClose} title="Cerrar menú">
            ✕
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {/* DASHBOARD */}
        <NavLink to="/dashboard" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </span>
          <span>Dashboard</span>
        </NavLink>

        {/* METAS Y CUMPLIMIENTO */}
        <NavLink to="/metas" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </span>
          <span>Metas y Cumplimiento</span>
        </NavLink>

        {/* BENEFICIARIOS */}
        <NavLink to="/beneficiarios" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </span>
          <span>Beneficiarios (Padrón)</span>
        </NavLink>

        {/* PROGRAMACIONES */}
        <NavLink to="/programaciones" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
          </span>
          <span>Programaciones</span>
        </NavLink>

        {/* ENTREGAS */}
        <NavLink to="/entregas" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
            </svg>
          </span>
          <span>Entregas de Agua</span>
        </NavLink>

        {/* CISTERNAS */}
        <NavLink to="/cisternas" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
              <path d="M15 18H9"/>
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
              <circle cx="17" cy="18" r="2"/>
              <circle cx="7" cy="18" r="2"/>
            </svg>
          </span>
          <span>Flota de Cisternas</span>
        </NavLink>

        {/* PERSONAL */}
        <NavLink to="/personal" onClick={handleNavClick} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 18a6 6 0 0 1 12 0"/>
              <circle cx="8" cy="8" r="4"/>
              <path d="m17 11 2 2 4-4"/>
            </svg>
          </span>
          <span>Conductores y Personal</span>
        </NavLink>
      </nav>

      <div className="sidebar-user">
        <img
          src={user?.photoURL || 'https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff'}
          alt="avatar"
          className="user-avatar"
          referrerPolicy="no-referrer"
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
        <button className="logout-btn" onClick={logout} title="Cerrar sesión">
          ⏻
        </button>
      </div>
    </aside>
  );
}
