import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/network', label: 'Network' },
  { to: '/users', label: 'Users' },
  { to: '/terminal', label: 'Terminal' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar({ wgOnline, appVersion, isMobile = false, mobileOpen = false, onClose = () => {} }) {
  return (
    <aside className={`sidebar ${isMobile ? 'sidebar-mobile' : ''} ${mobileOpen ? 'sidebar-open' : ''}`.trim()}>
      <div className="sidebar-top">
        <div className="logo-block">
          <div className="logo-icon">⬢</div>
          <div>
            <div className="logo-title">WireGate</div>
            <div className="logo-sub">
              <span className={`dot ${wgOnline ? 'dot-green' : 'dot-red'}`} />
              {wgOnline ? 'WireGuard online' : 'WireGuard offline'}
            </div>
          </div>
          {isMobile ? (
            <button className="btn btn-ghost icon-btn sidebar-close" type="button" aria-label="Close navigation" onClick={onClose}>
              ✕
            </button>
          ) : null}
        </div>

        <nav className="nav-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={isMobile ? onClose : undefined}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div>{appVersion || 'v1.0.1'}</div>
        <a href="https://github.com/Emetra0/Wiregate" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
    </aside>
  );
}
