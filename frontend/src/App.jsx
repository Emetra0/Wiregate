import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import Sidebar from './components/Sidebar';
import { ToastContainer, ToastProvider, useToast } from './components/Toast';
import Dashboard from './pages/Dashboard';
import NetworkPage from './pages/Network';
import Settings from './pages/Settings';
import TerminalPage from './pages/Terminal';
import Users from './pages/Users';

function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${breakpoint}px)`).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handleChange = (event) => setIsMobile(event.matches);

    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [breakpoint]);

  return isMobile;
}

function AppFrame() {
  const { showToast } = useToast();
  const [wgStatus, setWgStatus] = useState(null);
  const [appVersion, setAppVersion] = useState('v1.0.1');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  const refreshStatus = useCallback(async () => {
    try {
      const [status, system] = await Promise.all([api.wgStatus(), api.system()]);
      setWgStatus(status);
      setAppVersion(system?.app?.displayVersion ? `v${system.app.displayVersion}` : 'v1.0.1');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 10000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
    }
  }, [isMobile]);

  return (
    <div className={`layout ${mobileNavOpen ? 'layout-menu-open' : ''}`}>
      {isMobile ? (
        <div className="mobile-topbar">
          <div>
            <div className="logo-title">WireGate</div>
            <div className="logo-sub">
              <span className={`dot ${wgStatus?.running ? 'dot-green' : 'dot-red'}`} />
              {wgStatus?.running ? 'WireGuard online' : 'WireGuard offline'}
            </div>
          </div>
          <button
            className="btn btn-ghost icon-btn"
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            ☰
          </button>
        </div>
      ) : null}

      {isMobile && mobileNavOpen ? <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}

      <Sidebar
        wgOnline={Boolean(wgStatus?.running)}
        appVersion={appVersion}
        isMobile={isMobile}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard onStatusChange={setWgStatus} />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/users" element={<Users />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/settings" element={<Settings onStatusChange={setWgStatus} />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppFrame />
      </BrowserRouter>
    </ToastProvider>
  );
}
