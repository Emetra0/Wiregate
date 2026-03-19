import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Sidebar from './components/Sidebar';
import { ToastContainer, ToastProvider, useToast } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import TerminalPage from './pages/Terminal';
import Users from './pages/Users';

function AppShell() {
  const { showToast } = useToast();
  const [wgStatus, setWgStatus] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.wgStatus();
      setWgStatus(status);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 10000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar wgOnline={Boolean(wgStatus?.running)} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard onStatusChange={setWgStatus} />} />
            <Route path="/users" element={<Users />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/settings" element={<Settings onStatusChange={setWgStatus} />} />
          </Routes>
        </main>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
