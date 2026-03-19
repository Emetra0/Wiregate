import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ServerTerminal from '../components/ServerTerminal';
import Header from '../components/Header';
import { useToast } from '../components/Toast';

export default function Settings({ onStatusChange }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [configBusy, setConfigBusy] = useState(false);
  const [shortcutBusy, setShortcutBusy] = useState('');
  const terminalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextConfig] = await Promise.all([api.wgStatus(), api.systemConfig()]);
      setStatus(nextStatus);
      setConfig(nextConfig);
      onStatusChange?.(nextStatus);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onStatusChange, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const runTerminalAction = useCallback(
    async ({ commandText, successMessage, busyValue }) => {
      setBusyAction(busyValue);
      try {
        terminalRef.current?.focus();
        terminalRef.current?.runCommand(commandText);
        showToast(successMessage, 'success');
        window.setTimeout(() => {
          load();
        }, 1500);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setBusyAction('');
      }
    },
    [load, showToast, terminalRef]
  );

  const copyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(status?.publicKey || '');
      showToast('Server public key copied', 'success');
    } catch {
      showToast('Clipboard access failed', 'error');
    }
  };

  const handleControl = async (action) => {
    const normalized = action.toLowerCase();
    return runTerminalAction({
      commandText:
        normalized === 'restart'
          ? `wg-quick down ${status?.interface || 'wg0'}; wg-quick up ${status?.interface || 'wg0'}`
          : `wg-quick ${normalized} ${status?.interface || 'wg0'}`,
      successMessage: `Sent WireGuard ${normalized} command to the live server shell.`,
      busyValue: action,
    });
  };

  const handleServiceRestart = async () => {
    return runTerminalAction({
      commandText: `systemctl restart wg-quick@${status?.interface || 'wg0'} ; systemctl status wg-quick@${status?.interface || 'wg0'} --no-pager`,
      successMessage: 'Sent WireGuard service restart to the live server shell.',
      busyValue: 'service-restart',
    });
  };

  const runShortcut = async (shortcut) => {
    setShortcutBusy(shortcut.id);
    try {
      terminalRef.current?.focus();
      terminalRef.current?.runCommand(shortcut.command);
      showToast(`${shortcut.label} sent to the live server shell.`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setShortcutBusy('');
    }
  };

  const handleSaveEndpoint = async () => {
    if (!config?.endpoint?.trim()) {
      showToast('Public IP or hostname is required', 'error');
      return;
    }

    if (!config?.port?.toString().trim()) {
      showToast('Forwarded WireGuard port is required', 'error');
      return;
    }

    if (!config?.subnet?.trim()) {
      showToast('WireGuard subnet is required', 'error');
      return;
    }

    setConfigBusy(true);
    try {
      const result = await api.saveSystemConfig({
        endpoint: config.endpoint.trim(),
        port: `${config.port}`.trim(),
        subnet: config.subnet.trim(),
      });
      setConfig(result);
      showToast(result.message || 'Saved server network settings', 'success');
      await load();
      await runTerminalAction({
        commandText: `systemctl restart wg-quick@${result.interface || status?.interface || 'wg0'} ; systemctl status wg-quick@${result.interface || status?.interface || 'wg0'} --no-pager`,
        successMessage: 'Applied settings and sent the restart command to the live server shell.',
        busyValue: 'service-restart',
      });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setConfigBusy(false);
    }
  };

  const terminalShortcuts = useMemo(
    () => [
      {
        id: 'wiregate-status',
        label: 'WireGate service status',
        description: 'Show the current backend service status.',
        command: 'systemctl status wiregate --no-pager',
      },
      {
        id: 'wiregate-logs',
        label: 'WireGate recent logs',
        description: 'Show the latest backend log output.',
        command: 'journalctl -u wiregate -n 100 --no-pager',
      },
      {
        id: 'restart-wiregate',
        label: 'Restart WireGate backend',
        description: 'Restart the backend and show the new status.',
        command: 'systemctl restart wiregate; systemctl status wiregate --no-pager',
      },
      {
        id: 'wg-show',
        label: 'WireGuard interface status',
        description: 'Show the real WireGuard interface state.',
        command: `wg show ${status?.interface || 'wg0'}`,
      },
      {
        id: 'wg-service-status',
        label: 'WireGuard service status',
        description: 'Show the wg-quick service state.',
        command: `systemctl status wg-quick@${status?.interface || 'wg0'} --no-pager`,
      },
    ],
    [status?.interface]
  );

  return (
    <div className="page">
      <Header title="Settings" subtitle="Read-only server settings and WireGuard interface controls." />

      <div className="settings-grid">
        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Server network settings</h2>
              <p className="page-sub">Set the public IP or hostname and the forwarded WireGuard port, then apply them directly to the server.</p>
            </div>
            <span className="badge badge-online">Production only</span>
          </div>

          <div className="mode-card-grid">
            <div className="detail-item">
              <span className="meta-label">Interface target</span>
              <strong>{config?.interface || status?.interface || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Current endpoint</span>
              <strong>{config?.endpoint || 'Not configured'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Current forwarded port</span>
              <strong>{config?.port || status?.listenPort || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Current subnet</span>
              <strong>{config?.subnet ? `${config.subnet}.0/24` : '--'}</strong>
            </div>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Apply public endpoint and port</h2>
              <p className="page-sub">These values are written into the server config and applied when you save.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="server-endpoint">
              Public IP or hostname
            </label>
            <input
              id="server-endpoint"
              className="input"
              placeholder="203.0.113.10 or vpn.example.com"
              value={config?.endpoint || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...(current || {}),
                  endpoint: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="server-port">
              Forwarded WireGuard port
            </label>
            <input
              id="server-port"
              className="input"
              placeholder="51820"
              value={config?.port || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...(current || {}),
                  port: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="server-subnet">
              WireGuard subnet prefix
            </label>
            <input
              id="server-subnet"
              className="input"
              placeholder="10.0.0"
              value={config?.subnet || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...(current || {}),
                  subnet: event.target.value,
                }))
              }
            />
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={handleSaveEndpoint} disabled={configBusy}>
              {configBusy ? 'Saving…' : 'Save and apply network settings'}
            </button>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Server info</h2>
              <p className="page-sub">Edit server config in the .env file on the host.</p>
            </div>
          </div>

          {loading && !status ? <div className="loading-card">Loading server info…</div> : null}

          <div className="details-grid">
            <div className="detail-item">
              <span className="meta-label">Interface name</span>
              <strong>{status?.interface || '--'}</strong>
            </div>
            <div className="detail-item">
              <span className="meta-label">Listen port</span>
              <strong>{status?.listenPort || '--'}</strong>
            </div>
            <div className="detail-item detail-span">
              <span className="meta-label">Server public key</span>
              <button className="copy-field" type="button" onClick={copyPublicKey}>
                <span className="mono-text">{status?.publicKey || 'Unavailable'}</span>
                <span className="copy-hint">Click to copy</span>
              </button>
            </div>
            <div className="detail-item">
              <span className="meta-label">Subnet</span>
              <strong>{status?.subnet ? `${status.subnet}.0/24` : '--'}</strong>
            </div>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>WireGuard interface controls</h2>
              <p className="page-sub">Start or restart the active interface with live terminal output.</p>
            </div>
          </div>

          <div className="button-row">
            <button className="btn btn-success" type="button" disabled={!!busyAction} onClick={() => handleControl('Start')}>
              Start
            </button>
            <button className="btn btn-amber" type="button" disabled={!!busyAction} onClick={() => handleControl('Restart')}>
              Restart
            </button>
            <button className="btn btn-primary" type="button" disabled={!!busyAction} onClick={handleServiceRestart}>
              Restart service
            </button>
          </div>

          <ServerTerminal ref={terminalRef} height="34vh" />
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Terminal</h2>
              <p className="page-sub">The terminal below is the same live Ubuntu shell session as the dedicated terminal page.</p>
            </div>
            <span className="badge badge-online">Direct shell</span>
          </div>

          <div className="notice">
            Use the embedded shell below for live server data, or open the full terminal page for a larger view.
          </div>

          <div className="button-row">
            <Link className="btn btn-primary" to="/terminal">
              Open full terminal
            </Link>
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Server terminal shortcuts</h2>
              <p className="page-sub">These shortcuts send real shell commands into the live Ubuntu terminal below.</p>
            </div>
            <span className="badge badge-online">Live shell</span>
          </div>

          <div className="command-grid">
            {terminalShortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                className="command-card"
                type="button"
                onClick={() => runShortcut(shortcut)}
                disabled={!!shortcutBusy}
              >
                <span className="command-title">{shortcut.label}</span>
                <span className="command-copy">{shortcut.description}</span>
                <span className="command-meta">{shortcutBusy === shortcut.id ? 'Sending…' : 'Send to terminal'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>Live server terminal</h2>
              <p className="page-sub">This is the real Ubuntu shell. All shortcuts above send commands into this session.</p>
            </div>
            <span className="badge badge-online">PTY shell</span>
          </div>

          <ServerTerminal ref={terminalRef} height="38vh" />
        </div>

        <div className="card section-card">
          <div className="section-head">
            <div>
              <h2>About</h2>
              <p className="page-sub">Project information and external resources.</p>
            </div>
          </div>

          <div className="about-list">
            <div className="detail-item">
              <span className="meta-label">Version</span>
              <strong>v1.0.0</strong>
            </div>
            <a className="resource-link" href="https://github.com" target="_blank" rel="noreferrer">
              GitHub repository
            </a>
            <a className="resource-link" href="https://www.wireguard.com" target="_blank" rel="noreferrer">
              WireGuard documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
